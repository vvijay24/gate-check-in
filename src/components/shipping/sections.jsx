import { useMemo, useState } from 'react'
import * as ui from '../../ui'
import { Icon } from '../../icons'
import { LATE_GRACE_MIN, arrivalMs, clockTime, dayKey, duration, minutesLate, shiftDate, shortDate } from '../../time'
import { DOCKS, STALE_HIGH_H, STALE_WARN_H } from '../../yard'
import { dayMetrics, isDrop } from '../../metrics'
import { atDockNow, awaitingRelease, inYard } from '../../handoff'
import { STAGES, checkedInAt, currentStage, inspectionSavedAt } from '../../stages'
import { DETENTION_ICON, DETENTION_TAG, detentionState } from '../../detention'
import { YARD_STAGES } from '../../liveYard'
import { DETENTION } from '../../turnaround/targets'
import { dockKey, occupiedDocks } from '../AssignDock'
import { phaseOf } from '../Dashboard'
import { TimerLine } from '../StageTimer'
import {
  ORDER_STATUSES,
  ORDER_WAIT_MAX,
  average,
  carrierRows,
  customerRows,
  dayReport,
  detentionFee,
  dockSchedule,
  gateToGateMs,
  inspectMs,
  loadMs,
  onClockMs,
  orderLate,
  orderStatus,
  orderWaitMs,
  passedFirstTime,
  preloadMs,
  recheckedLoad,
  visitsInDays,
} from '../../shippingData'
import { Card, Empty, HBars, InsightsLink, Keys, LivePill, RangeSwitch, SectionHead, Table, Td, Tile, Tiles, VBars } from './parts'

// The Shipping page's sections after the Live Board, one per sidebar item. Every number comes from the
// gate entries (shippingData.js); Loading and Inspection are view only (the dock crew and the inspector
// work on the Loading & Inspection tab).

const MIN = 60000
const STAGE_COLOR = Object.fromEntries(YARD_STAGES.map((s) => [s.key, s.color]))
const mins = (ms) => (ms == null ? '—' : `${Math.round(ms / MIN)}m`)
const dur = (ms) => (ms == null || !Number.isFinite(ms) ? '—' : duration(ms))
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const usd = (v) => `$${Math.round(v ?? 0).toLocaleString()}`
const Dash = () => <span className="text-muted">—</span>

const STATUS_TAG = {
  'Waiting for order': 'bg-warn text-warn-ink',
  'Ready for a dock': 'bg-warn text-warn-ink',
  Loading: 'bg-ink text-panel',
  Inspection: 'bg-signal-soft text-signal',
  'Released to gate': 'bg-delivery-soft text-delivery',
  'Released to yard': 'bg-drop-soft text-drop',
  Shipped: 'bg-ok-soft text-ok',
}
const StatusTag = ({ s }) => <span className={ui.tag + ' ' + STATUS_TAG[s]}>{s}</span>
const TypeTag = ({ e }) =>
  isDrop(e) ? <span className={ui.tag + ' bg-drop-soft text-drop'}>Drop trailer</span> : <span className={ui.tag + ' bg-pickup-soft text-pickup'}>Pickup</span>

// ---------------------------------------------------------------- Orders
export function OrdersTiles({ entries, now }) {
  const today = dayKey(new Date(now))
  const todays = entries.filter((e) => e.dateIn === today)
  const waiting = entries.filter((e) => !e.timeOut && !e.dockDoor && !e.orderReadyAt)
  const longest = Math.max(0, ...waiting.filter((e) => !isDrop(e)).map((e) => now - checkedInAt(e)))
  const avgWait = average(todays.map(orderWaitMs))
  const late = todays.filter(orderLate).length
  return (
    <Tiles>
      <Tile icon="orders" label="Orders today" value={todays.length} note={`${todays.filter((e) => !isDrop(e)).length} pickups · ${todays.filter(isDrop).length} drop trailers`} />
      <Tile icon="waiting" label="Orders not ready" value={waiting.length} note={waiting.length ? (longest ? `longest wait ${duration(longest)}` : 'dropped trailers only') : 'every order on site is ready'} tone={waiting.length ? 'warn' : 'good'} />
      <Tile icon="time" label="Avg time to ready" value={avgWait == null ? '—' : mins(avgWait)} note={`today · target ≤ ${ORDER_WAIT_MAX} min`} tone={avgWait != null && avgWait > ORDER_WAIT_MAX * MIN ? 'bad' : undefined} />
      <Tile icon="warning" label="Ready late" value={late} note={`over ${ORDER_WAIT_MAX} min after check-in`} tone={late ? 'bad' : 'good'} />
    </Tiles>
  )
}


// ---------------------------------------------------------------- Docks
// The day's dock schedule: one row per dock, one bar per truck, the current one in its stage colour.
function DockSchedule({ bars, now }) {
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const startH = Math.min(5, ...bars.map((b) => new Date(b.from).getHours()))
  const endH = Math.min(24, Math.max(startH + 8, new Date(now).getHours() + 2))
  const start = day.getTime() + startH * 60 * MIN
  const end = day.getTime() + endH * 60 * MIN
  const x = (ms) => `${Math.min(100, Math.max(0, ((ms - start) / (end - start)) * 100))}%`
  const w = (a, b) => `${Math.max(0.6, ((Math.min(b, end) - Math.max(a, start)) / (end - start)) * 100)}%`
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i)
  const hourLabel = (h) => (h === 12 ? 'Noon' : `${h % 12 || 12}${h < 12 ? ' AM' : ' PM'}`)
  return (
    <div className="overflow-x-auto p-5">
      <div className="grid min-w-[640px] grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-[13px]">
        {DOCKS.map((d) => (
          <div key={d} className="contents">
            <span className="font-semibold">Dock {d}</span>
            <div className="relative h-8 rounded-lg bg-field">
              {bars
                .filter((b) => dockKey(b.dock) === dockKey(d))
                .map((b) => (
                  <span
                    key={b.e.id}
                    title={`${b.e.trailerNumber} · ${b.e.truckName} · ${clockTime(b.from)}–${b.stage === 'done' ? clockTime(b.to) : 'now'}`}
                    className="absolute top-1 bottom-1 flex items-center overflow-hidden rounded-md px-1.5 text-[11.5px] font-semibold whitespace-nowrap text-white"
                    style={{ left: x(b.from), width: w(b.from, b.to), background: b.stage === 'done' ? 'var(--color-chart-live)' : STAGE_COLOR[b.stage] }}
                  >
                    {b.e.trailerNumber}
                  </span>
                ))}
              <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-danger" style={{ left: x(now) }} aria-hidden="true" />
            </div>
          </div>
        ))}
        <span />
        <div className="relative h-5 text-[11.5px] text-muted" aria-hidden="true">
          {hours.map((h) => (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: x(day.getTime() + h * 60 * MIN) }}>
              {hourLabel(h)}
            </span>
          ))}
        </div>
      </div>
      <Keys
        items={[
          ['Done', 'var(--color-chart-live)'],
          ['Loading now', STAGE_COLOR.load],
          ['In inspection', STAGE_COLOR.insp],
          ['Passed, waiting to leave', STAGE_COLOR.ready],
          ['Now', 'var(--color-danger)'],
        ]}
      />
    </div>
  )
}

export function DocksSection({ entries, now, head = true }) {
  const today = dayKey(new Date(now))
  const occupied = occupiedDocks(entries)
  const m = useMemo(() => dayMetrics(entries, today, now), [entries, today, now])
  const bars = useMemo(() => dockSchedule(entries, today, now), [entries, today, now])
  const free = DOCKS.filter((d) => !occupied.has(dockKey(d)))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {head && (
      <SectionHead title="Docks" sub="The day's dock schedule and how busy each dock has been. The docks right now are on the Live Board.">
        <LivePill />
      </SectionHead>
      )}
      <Card icon="calendar" title="Dock schedule today" sub="One bar per truck at a dock; the red line is now. Hover a bar for its times.">
        {bars.length ? <DockSchedule bars={bars} now={now} /> : <Empty>No trucks at a dock yet today.</Empty>}
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card icon="dock" title="How busy each dock was" sub="Share of today so far with a truck at the dock">
          <div className="p-5">
            <HBars labelWidth={70} max={1} rows={[...m.doors].sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0)).map((d) => ({ label: `Dock ${d.door}`, value: d.utilization ?? 0, text: pct(d.utilization) }))} />
            <p className="mt-3 text-[13px] text-muted">All docks together: {pct(m.dockUtilization)} busy today · {free.length} free now.</p>
          </div>
        </Card>
        <Card icon="time" title="Time at each dock" sub="Today · time at the dock is from dock assigned to leaving it">
          <Table head={['Dock', { label: 'Loads', right: true }, { label: 'Avg at the dock', right: true }, { label: 'Avg wait for it', right: true }]} minWidth={420}>
            {m.doors.map((d) => (
              <tr key={d.door} className={ui.tr}>
                <Td strong>Dock {d.door}</Td>
                <Td right>{d.loads}</Td>
                <Td right>{dur(d.avgDwellMs)}</Td>
                <Td right>{dur(d.avgWaitMs)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Loading (view only)
const LOADING_PHASES = ['trailer', 'trailerFail', 'ready', 'loading']
const PHASE_WORD = { trailer: 'Check trailer', trailerFail: 'Trailer not OK', ready: 'Trailer OK', loading: 'Loading', inspect: 'Ready to inspect', failed: 'Failed · re-check', passed: 'Passed' }
const PHASE_TAG = { trailer: 'bg-warn text-warn-ink', trailerFail: 'bg-danger-soft text-danger', ready: 'bg-ok-soft text-ok', loading: 'bg-signal-soft text-signal', inspect: 'bg-warn text-warn-ink', failed: 'bg-danger-soft text-danger', passed: 'bg-ok-soft text-ok' }

// A truck at a dock, view only: dock, status, trailer, its stage timer.
function DockCard({ e, now, color }) {
  const phase = phaseOf(e)
  const st = currentStage(e)
  return (
    <article className="relative grid gap-2 rounded-2xl border border-hair bg-field py-3.5 pr-4 pl-5">
      <span className="absolute inset-y-3.5 left-0 w-1 rounded-r" style={{ background: color }} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold tracking-[0.06em] text-muted uppercase">Dock {e.dockDoor}</span>
        <span className={ui.tag + ' ' + PHASE_TAG[phase]}>{PHASE_WORD[phase]}</span>
      </div>
      <div className="min-w-0">
        <b className="block truncate text-[18px] leading-tight">{e.trailerNumber}</b>
        <span className="block truncate text-[13.5px] text-muted">{[e.truckName, e.customerPickupFor, e.pickupNumber && `Order ${e.pickupNumber}`].filter(Boolean).join(' · ')}</span>
        {isDrop(e) && <span className="text-[13px] font-semibold text-drop">Drop trailer · no driver waiting</span>}
      </div>
      {st && (
        <div className="grid gap-1">
          <span className="text-[13px] font-semibold">
            {st.recheck ? 'Re-check' : STAGES[st.key].label}
            <span className="font-normal text-muted"> · target {STAGES[st.key].min}–{STAGES[st.key].max} min</span>
          </span>
          <TimerLine stage={st.key} since={st.since} now={now} />
        </div>
      )}
      {(e.trailerCheck?.technician || e.loadingInspection?.inspector) && (
        <span className="text-[12.5px] text-muted">
          {e.trailerCheck?.technician && `Technician ${e.trailerCheck.technician}`}
          {e.loadingInspection?.inspector && ` · inspector ${e.loadingInspection.inspector}`}
        </span>
      )}
    </article>
  )
}
const cardsGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-4 p-5'

export function LoadingSection({ entries, now, head = true }) {
  const today = dayKey(new Date(now))
  const atDock = entries.filter(atDockNow)
  const loading = atDock.filter((e) => LOADING_PHASES.includes(phaseOf(e)))
  const todays = entries.filter((e) => e.dateIn === today)
  const loaded = todays.filter((e) => loadMs(e) != null).sort((a, b) => a.loadStartedAt - b.loadStartedAt)
  const avgLoad = average(loaded.map(loadMs))
  const avgPre = average(todays.map(preloadMs))
  const trailerFails = todays.filter((e) => e.trailerCheck?.result === 'Fail' || e.trailerCheck?.correctiveAction)
  const free = DOCKS.filter((d) => !occupiedDocks(entries).has(dockKey(d)))
  const next = entries.filter((e) => !e.timeOut && !e.dockDoor && e.orderReadyAt).sort((a, b) => a.orderReadyAt - b.orderReadyAt)[0]
  // Loads and average loading time per technician.
  const techs = [...new Set(loaded.map((e) => e.trailerCheck?.technician ?? e.loadingInspection?.technician).filter(Boolean))]
    .map((name) => {
      const mine = todays.filter((e) => (e.trailerCheck?.technician ?? e.loadingInspection?.technician) === name)
      return { name, loads: mine.filter((e) => loadMs(e) != null).length, avg: average(mine.map(loadMs)), fails: mine.filter((e) => trailerFails.includes(e)).length }
    })
    .sort((a, b) => b.loads - a.loads)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {head && (
      <SectionHead title="Loading" sub="Who is loading now and how long it is taking. View only: the dock crew presses Loading started and Loading finished on the Loading & Inspection tab.">
        <LivePill />
      </SectionHead>
      )}
      <Tiles>
        <Tile icon="load" label="At the docks, loading" value={loading.length} note={`${loading.filter((e) => phaseOf(e) === 'loading').length} loading · ${loading.filter((e) => phaseOf(e) !== 'loading').length} checking the trailer`} />
        <Tile icon="time" label="Avg loading time" value={mins(avgLoad)} note={`today · target ${STAGES.load.min}–${STAGES.load.max} min`} tone={avgLoad == null ? undefined : avgLoad > STAGES.load.max * MIN ? 'bad' : 'good'} />
        <Tile icon="time" label="Avg pre-loading" value={mins(avgPre)} note={`dock to loading started · target ${STAGES.preload.min}–${STAGES.preload.max}`} tone={avgPre != null && avgPre > STAGES.preload.max * MIN ? 'bad' : undefined} />
        <Tile icon="search" label="Trailer checks failed" value={trailerFails.length} note={trailerFails.length ? trailerFails[0].trailerCheck.correctiveAction || 're-check needed' : 'none today'} tone={trailerFails.length ? 'warn' : 'good'} />
      </Tiles>
      <Card icon="load" title="At the docks, loading" sub="Each truck's two steps and its timer · view only">
        {loading.length ? (
          <div className={cardsGrid}>
            {loading.map((e) => (
              <DockCard key={e.id} e={e} now={now} color={STAGE_COLOR.load} />
            ))}
          </div>
        ) : (
          <Empty>
            No trucks loading. {free.length ? `${free.map((d) => `Dock ${d}`).join(', ')} free.` : ''} {next ? `Next up: ${next.trailerNumber} (order ready ${duration(now - next.orderReadyAt)} ago).` : ''}
          </Empty>
        )}
      </Card>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card icon="chart" title="Loading time, today's trucks" sub={`Minutes from Loading started to finished · green band = ${STAGES.load.min}–${STAGES.load.max} min target`}>
          <div className="p-5">
            {loaded.length ? (
              <VBars
                label="Loading time of each truck today"
                band={[STAGES.load.min, STAGES.load.max]}
                rows={loaded.slice(-14).map((e) => ({
                  key: e.id,
                  label: e.trailerNumber,
                  value: loadMs(e) / MIN,
                  color: loadMs(e) > STAGES.load.max * MIN ? 'var(--color-danger)' : undefined,
                  title: `${e.trailerNumber} · ${Math.round(loadMs(e) / MIN)} min at Dock ${e.dockDoor}`,
                }))}
              />
            ) : (
              <p className="text-muted">No loads finished yet today.</p>
            )}
          </div>
        </Card>
        <Card icon="people" title="By technician" sub="Today's loads, average loading time and failed trailer checks">
          {techs.length ? (
            <Table head={['Technician', { label: 'Loads', right: true }, { label: 'Avg loading', right: true }, { label: 'Checks failed', right: true }]} minWidth={380}>
              {techs.map((t) => (
                <tr key={t.name} className={ui.tr}>
                  <Td strong>{t.name}</Td>
                  <Td right>{t.loads}</Td>
                  <Td right>{mins(t.avg)}</Td>
                  <Td right>{t.fails}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No loads finished yet today.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Inspection (view only)
export function InspectionSection({ entries, now, head = true }) {
  const today = dayKey(new Date(now))
  const atDock = entries.filter(atDockNow)
  const after = atDock.filter((e) => !LOADING_PHASES.includes(phaseOf(e)))
  const toInspect = after.filter((e) => phaseOf(e) === 'inspect')
  const failed = after.filter((e) => phaseOf(e) === 'failed')
  const unreleased = after.filter(awaitingRelease)
  const inspectedToday = entries
    .filter((e) => inspectionSavedAt(e) && dayKey(new Date(inspectionSavedAt(e))) === today)
    .sort((a, b) => inspectionSavedAt(b) - inspectionSavedAt(a))
  const firstTime = inspectedToday.filter(passedFirstTime).length
  const week = visitsInDays(entries, 7, now)
  const fixes = new Map()
  for (const e of week.filter(recheckedLoad)) {
    const why = e.loadingInspection.correctiveAction || e.loadingInspection.issues?.[0] || 'Failed, not fixed yet'
    fixes.set(why, (fixes.get(why) ?? 0) + 1)
  }
  const color = { inspect: STAGE_COLOR.insp, failed: 'var(--color-danger)', passed: STAGE_COLOR.ready }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {head && (
      <SectionHead title="Inspection" sub="Loads waiting for their inspection, failed loads being fixed, and passed loads waiting for the inspector's release. View only: inspecting and releasing stay with the inspector.">
        <LivePill />
      </SectionHead>
      )}
      <Tiles>
        <Tile icon="inspect" label="To inspect" value={toInspect.length} note={toInspect.length ? `longest ${duration(Math.max(...toInspect.map((e) => now - e.loadFinishedAt)))}` : 'none waiting'} tone={toInspect.length ? 'warn' : undefined} />
        <Tile icon="failed" label="Failed · re-check" value={failed.length} note={failed.length ? `${failed[0].trailerNumber} · ${failed[0].loadingInspection.issues?.[0] ?? 're-check'}` : 'none'} tone={failed.length ? 'bad' : undefined} />
        <Tile icon="handoff" label="Passed, not released" value={unreleased.length} note={unreleased.length ? 'waiting for the inspector' : 'nothing waiting'} tone={unreleased.length ? 'warn' : undefined} />
        <Tile icon="inspected" label="Passed first time" value={inspectedToday.length ? pct(firstTime / inspectedToday.length) : '—'} note={`${firstTime} of ${inspectedToday.length} today`} tone={inspectedToday.length ? 'good' : undefined} />
      </Tiles>
      <Card icon="inspect" title="At the docks, after loading" sub="Inspect, re-check, passed · view only">
        {after.length ? (
          <div className={cardsGrid}>
            {after.map((e) => (
              <DockCard key={e.id} e={e} now={now} color={color[phaseOf(e)] ?? STAGE_COLOR.insp} />
            ))}
          </div>
        ) : (
          <Empty>No loads waiting for inspection or release.</Empty>
        )}
      </Card>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card icon="log" title="Inspections today" sub="Newest first · product temperatures front / middle / rear">
          {inspectedToday.length ? (
            <Table head={['Time', 'Trailer', 'Customer', 'Result', { label: 'Product °F', right: true }, 'Seal', { label: 'Took', right: true }, 'Inspector']} minWidth={760}>
              {inspectedToday.slice(0, 12).map((e) => {
                const i = e.loadingInspection
                const temps = [i.tempFront, i.tempMiddle, i.tempRear].filter((t) => t !== undefined && t !== '')
                return (
                  <tr key={e.id} className={ui.tr}>
                    <Td className="tabular-nums">{clockTime(inspectionSavedAt(e))}</Td>
                    <Td strong>{e.trailerNumber}</Td>
                    <Td>{e.customerPickupFor || <Dash />}</Td>
                    <Td>
                      {i.result === 'Pass' ? (
                        <span className={ui.tag + ' bg-ok-soft text-ok'}>{i.correctiveAction ? 'Pass after re-check' : 'Pass'}{inYard(e) ? ' · to yard' : ''}</span>
                      ) : (
                        <span className={ui.tag + ' bg-danger-soft text-danger'}>Fail</span>
                      )}
                    </Td>
                    <Td right>{temps.length ? temps.join(' / ') : <Dash />}</Td>
                    <Td>{i.sealApplied || <Dash />}</Td>
                    <Td right>{mins(inspectMs(e))}</Td>
                    <Td>{i.inspector || <Dash />}</Td>
                  </tr>
                )
              })}
            </Table>
          ) : (
            <Empty>No inspections yet today.</Empty>
          )}
        </Card>
        <Card icon="warning" title="Failed loads, last 7 days" sub={`${week.filter(recheckedLoad).length} of ${week.filter((e) => e.loadingInspection).length} inspections · what was done about them`}>
          <div className="p-5">
            {fixes.size ? <HBars labelWidth={190} color="var(--color-danger)" rows={[...fixes].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} /> : <p className="text-muted">No failed loads in the last 7 days.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Drop trailers
export function DropsSection({ entries, now, onView, compact = false }) {
  const drops = entries.filter((e) => !e.timeOut && isDrop(e)).sort((a, b) => arrivalMs(a) - arrivalMs(b))
  const loaded = drops.filter(inYard)
  const empty = drops.filter((e) => !inYard(e))
  const stale = drops.filter((e) => now - arrivalMs(e) > STALE_WARN_H * 3600000)
  const state = (e) =>
    inYard(e) ? ['Loaded · waiting for a driver', 'bg-ok-soft text-ok'] : e.dockDoor ? [`At Dock ${e.dockDoor}`, 'bg-signal-soft text-signal'] : e.orderReadyAt ? ['Empty · ready for a dock', 'bg-warn text-warn-ink'] : ['Empty · waiting for order', 'bg-warn text-warn-ink']
  const table = (
      <Card icon="drop" title={compact ? 'Drop trailers in the yard' : 'Trailers in the yard'} sub={compact ? `${empty.length} empty · ${loaded.length} loaded, waiting for a driver${stale.length ? ` · ${stale.length} over ${STALE_WARN_H} h` : ''} · longest here first` : 'Longest here first · tap a trailer # for its entry'}>
      {drops.length ? (
        <Table head={['Trailer', 'Carrier', 'Order', 'State', 'Spot', 'Dropped', { label: 'On site', right: true }, 'Reefer']} minWidth={860}>
          {drops.map((e) => {
            const [word, cls] = state(e)
            const age = now - arrivalMs(e)
            return (
              <tr key={e.id} className={ui.tr}>
                <Td strong>
                  <button type="button" onClick={() => onView(e.id)} className="cursor-pointer underline decoration-line underline-offset-2 hover:decoration-signal">
                    {e.trailerNumber}
                  </button>
                </Td>
                <Td>{e.truckName}</Td>
                <Td>{[e.pickupNumber, e.customerPickupFor].filter(Boolean).join(' · ') || <Dash />}</Td>
                <Td>
                  <span className={ui.tag + ' ' + cls}>{word}</span>
                </Td>
                <Td>{e.release?.spot || <Dash />}</Td>
                <Td className="whitespace-nowrap">
                  {e.dateIn === dayKey(new Date(now)) ? 'Today' : shortDate(e.dateIn)} {e.timeIn}
                </Td>
                <Td right className={age > STALE_HIGH_H * 3600000 ? 'font-semibold text-danger' : age > STALE_WARN_H * 3600000 ? 'font-semibold text-warn-ink' : ''}>
                  {duration(age)}
                </Td>
                <Td>{e.reefer === 'Yes' ? `${e.tempSet || '?'} °F · fuel ${e.fuelIn || '?'}` : 'Dry van'}</Td>
              </tr>
            )
          })}
        </Table>
      ) : (
        <Empty>No drop trailers on site.</Empty>
      )}
    </Card>
  )
  if (compact) return table
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <SectionHead title="Drop trailers" sub={`Trailers left without a driver: empty ones waiting to be loaded, and loaded ones parked for a driver to hook. Flagged after ${STALE_WARN_H} h in the yard.`}>
        <LivePill />
      </SectionHead>
      <Tiles>
        <Tile icon="drop" label="Drop trailers on site" value={drops.length} note={`${empty.length} empty · ${loaded.length} loaded`} />
        <Tile icon="waiting" label="Not loaded yet" value={empty.length} note={empty.length ? `${empty.filter((e) => e.orderReadyAt).length} with the order ready` : 'none'} tone={empty.length ? 'warn' : undefined} />
        <Tile icon="done" label="Loaded, waiting for a hook" value={loaded.length} note={loaded.length ? `spots ${loaded.map((e) => e.release.spot).filter(Boolean).join(', ') || '—'}` : 'none'} tone={loaded.length ? 'good' : undefined} />
        <Tile icon="warning" label={`Older than ${STALE_WARN_H} h`} value={stale.length} note={stale.length ? stale.map((e) => e.trailerNumber).join(', ') : 'none stale'} tone={stale.length ? 'bad' : 'good'} />
      </Tiles>
      {table}
    </div>
  )
}

// ---------------------------------------------------------------- Customers
export function CustomersSection({ entries, now, onOpenInsights, head = true, days: daysProp }) {
  const [ownDays, setDays] = useState(7)
  const days = daysProp ?? ownDays
  const visits = visitsInDays(entries, days, now)
  const rows = customerRows(visits, now)
  const late = rows.reduce((s, r) => s + r.lateOrders, 0)
  const worst = [...rows].sort((a, b) => b.lateOrders - a.lateOrders)[0]
  const range = days === 1 ? 'today' : `last ${days} days`
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {head && (
      <SectionHead title="Customers" sub="Who we load for: how many orders, how long their orders took to be ready, and how quickly their trucks turned.">
        <RangeSwitch value={days} onChange={setDays} />
        <InsightsLink onOpen={onOpenInsights} section="customers" />
      </SectionHead>
      )}
      <Tiles>
        <Tile icon="customer" label="Customers" value={rows.length} note={range} />
        <Tile icon="orders" label="Orders" value={visits.length} note={`${visits.filter((e) => !isDrop(e)).length} pickups · ${visits.filter(isDrop).length} drop trailers`} />
        <Tile icon="waiting" label="Orders ready late" value={late} note={late && worst ? `most for ${worst.name} (${worst.lateOrders})` : `none over ${ORDER_WAIT_MAX} min`} tone={late ? 'warn' : 'good'} />
        <Tile icon="time" label="Avg gate to gate" value={dur(average(visits.map(gateToGateMs)))} note="pickups that left" />
      </Tiles>
      {rows.length ? (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <Card icon="chart" title="Orders by customer" sub={range}>
            <div className="p-5">
              <HBars labelWidth={130} color="var(--color-pickup)" rows={rows.slice(0, 10).map((r) => ({ label: r.name, value: r.orders, text: `${r.orders}${r.drops ? ` (${r.drops} drop)` : ''}` }))} />
            </div>
          </Card>
          <Card icon="customer" title="Customer scorecard" sub={`${range} · red = past its target`}>
            <Table head={['Customer', { label: 'Orders', right: true }, { label: 'Avg wait for order', right: true }, { label: 'Ready late', right: true }, { label: 'Gate to gate', right: true }, { label: 'On time', right: true }, { label: 'On site', right: true }]} minWidth={680}>
              {rows.map((r) => (
                <tr key={r.name} className={ui.tr}>
                  <Td strong>{r.name}</Td>
                  <Td right>{r.orders}</Td>
                  <Td right className={r.avgOrderWaitMs > ORDER_WAIT_MAX * MIN ? 'font-semibold text-danger' : ''}>{mins(r.avgOrderWaitMs)}</Td>
                  <Td right>{r.lateOrders}</Td>
                  <Td right>{dur(r.avgG2gMs)}</Td>
                  <Td right>{pct(r.onTimePct)}</Td>
                  <Td right>{r.onSite}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : (
        <Card icon="customer" title="Customer scorecard">
          <Empty>No orders {range}.</Empty>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Carriers
function Spark({ values }) {
  const v = values.filter((x) => x != null)
  if (v.length < 2) return <span className="text-[12px] text-muted">—</span>
  const lo = Math.min(...v)
  const hi = Math.max(...v)
  const pts = values
    .map((x, i) => (x == null ? null : `${(i / (values.length - 1)) * 96 + 2},${20 - ((x - lo) / (hi - lo || 1)) * 16}`))
    .filter(Boolean)
    .join(' ')
  const rising = v[v.length - 1] > v[0]
  return (
    <svg width="100" height="24" viewBox="0 0 100 24" role="img" aria-label={rising ? 'Gate to gate getting slower' : 'Gate to gate steady or faster'}>
      <polyline points={pts} fill="none" stroke={rising ? 'var(--color-danger)' : 'var(--color-chart-live)'} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function CarriersSection({ entries, now, onOpenInsights, head = true, days: daysProp }) {
  const [ownDays, setDays] = useState(7)
  const days = daysProp ?? ownDays
  const visits = visitsInDays(entries, days, now)
  const rows = carrierRows(visits, now, days)
  const fee = rows.reduce((s, r) => s + r.fee, 0)
  const live = visits.filter((e) => !isDrop(e))
  const onTime = live.filter((e) => minutesLate(e) != null)
  const range = days === 1 ? 'today' : `last ${days} days`
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {head && (
      <SectionHead title="Carriers" sub="Who brings the trucks: on-time arrival, how long they stay, and the detention they could bill.">
        <RangeSwitch value={days} onChange={setDays} />
        <InsightsLink onOpen={onOpenInsights} section="carriers" />
      </SectionHead>
      )}
      <Tiles>
        <Tile icon="truck" label="Carriers" value={rows.length} note={range} />
        <Tile icon="truck" label="Visits" value={visits.length} note={`${live.length} pickups · ${visits.length - live.length} drop trailers`} />
        <Tile icon="waiting" label="Arrived on time" value={onTime.length ? pct(onTime.filter((e) => Math.abs(minutesLate(e) ?? 0) <= LATE_GRACE_MIN).length / onTime.length) : '—'} note="within ±15 min of the appointment" />
        <Tile icon="money" label="Est. detention" value={usd(fee)} note={range} tone={fee ? 'bad' : 'good'} />
      </Tiles>
      <Card icon="truck" title="Carrier scorecard" sub={`${range} · fastest average gate to gate first · trend = gate to gate per day`}>
        {rows.length ? (
          <Table head={['Carrier', { label: 'Visits', right: true }, { label: 'On time', right: true }, { label: 'Avg gate to gate', right: true }, { label: 'Past free time', right: true }, { label: 'Est. detention', right: true }, 'Trend']} minWidth={760}>
            {rows.map((r) => (
              <tr key={r.name} className={ui.tr}>
                <Td strong>{r.name}</Td>
                <Td right>{r.visits}</Td>
                <Td right>{pct(r.onTimePct)}</Td>
                <Td right>{dur(r.avgG2gMs)}</Td>
                <Td right>{r.overFree}</Td>
                <Td right className={r.fee ? 'font-semibold text-danger' : ''}>{usd(r.fee)}</Td>
                <Td>
                  <Spark values={r.trend} />
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No visits {range}.</Empty>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- Detention
export function DetentionSection({ entries, now, onOpenInsights, head = true }) {
  const today = dayKey(new Date(now))
  const onSite = entries.filter((e) => !e.timeOut && !isDrop(e)).map((e) => ({ e, det: detentionState(e, now), ms: onClockMs(e, now) }))
  onSite.sort((a, b) => b.ms - a.ms)
  const over = onSite.filter((r) => r.det?.level === 'over')
  const near = onSite.filter((r) => r.det?.level === 'near')
  const week = visitsInDays(entries, 7, now)
  const weekFee = week.reduce((s, e) => s + detentionFee(e, now), 0)
  const lateOrderFee = week.filter(orderLate).reduce((s, e) => s + detentionFee(e, now), 0)
  const month = visitsInDays(entries, 30, now).reduce((s, e) => s + detentionFee(e, now), 0)
  const byDay = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6)).map((d) => ({
    key: d,
    label: new Date(`${d}T00:00`).toLocaleDateString([], { weekday: 'short' }),
    value: entries.filter((e) => e.dateIn === d).reduce((s, e) => s + detentionFee(e, now), 0),
  }))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {head && (
      <SectionHead title="Detention" sub={`Trucks close to or past ${DETENTION.freeMin / 60} h of free time, and what it costs. The clock starts at the later of the appointment and arrival; $${DETENTION.ratePerHour}/h after that.`}>
        <LivePill />
        <InsightsLink onOpen={onOpenInsights} section="turnaround" />
      </SectionHead>
      )}
      <Tiles>
        <Tile icon="money" label="Past free time now" value={over.length} note={over.length ? `est. ${usd(over.reduce((s, r) => s + r.det.fee, 0))} so far` : 'no one on site'} tone={over.length ? 'bad' : 'good'} />
        <Tile icon="waiting" label="Close to it" value={near.length} note={near.length ? near.map((r) => r.e.trailerNumber).join(', ') : 'none'} tone={near.length ? 'warn' : undefined} />
        <Tile icon="money" label="Last 7 days" value={usd(weekFee)} note={lateOrderFee ? `${usd(lateOrderFee)} on trucks whose order was late` : 'none on late orders'} tone={weekFee ? 'bad' : 'good'} />
        <Tile icon="money" label="Last 30 days" value={usd(month)} note="estimated" />
      </Tiles>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card icon="waiting" title="On the clock now" sub="Trucks with a driver waiting, longest first">
          {onSite.length ? (
            <Table head={['Trailer', 'Where', { label: 'On the clock', right: true }, 'Status']} minWidth={560}>
              {onSite.map(({ e, det, ms }) => (
                <tr key={e.id} className={ui.tr}>
                  <Td>
                    <b>{e.trailerNumber}</b> <span className="text-muted">· {e.truckName}</span>
                  </Td>
                  <Td>{e.dockDoor ? `Dock ${e.dockDoor} · ${orderStatus(e).toLowerCase()}` : orderStatus(e)}</Td>
                  <Td right>{ms > 0 ? duration(ms) : 'not started'}</Td>
                  <Td>
                    {det ? (
                      <span className={ui.tag + ' ' + DETENTION_TAG[det.level]}>
                        <Icon name={DETENTION_ICON[det.level]} size={14} />
                        {det.text}
                      </span>
                    ) : (
                      <span className={ui.tag + ' bg-ok-soft text-ok'}>{ms > 0 ? `${duration(DETENTION.freeMin * MIN - ms)} left` : 'Early'}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No trucks with a driver on site.</Empty>
          )}
        </Card>
        <Card icon="chart" title="Detention by day" sub="Estimated $ per day, last 7 days, by check-in day">
          <div className="p-5">
            <VBars label="Estimated detention per day" color="var(--color-danger)" rows={byDay.map((d) => ({ ...d, text: d.value ? usd(d.value) : '$0', title: `${shortDate(d.key)} · ${usd(d.value)}` }))} />
          </div>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Daily report
// Prints only the report: index.css hides everything else while body has data-print="ship-report".
function printReport() {
  document.body.dataset.print = 'ship-report'
  const done = () => {
    delete document.body.dataset.print
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

export function ReportSection({ entries, now }) {
  const today = dayKey(new Date(now))
  const [day, setDay] = useState(today)
  const [pdfHint, setPdfHint] = useState(false)
  const days = Array.from({ length: 30 }, (_, i) => shiftDate(today, -i))
  const r = useMemo(() => dayReport(entries, day, now), [entries, day, now])
  const title = new Date(`${day}T00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const fig = (label, value) => (
    <div className="grid gap-0.5">
      <span className="text-[12px] font-semibold text-muted">{label}</span>
      <b className="font-display text-[24px] leading-none">{value}</b>
    </div>
  )
  const lead = r.visits.length
    ? [
        `${r.shipped.length} truck${r.shipped.length === 1 ? '' : 's'} left (${r.pickups} pickup${r.pickups === 1 ? '' : 's'}, ${r.drops} drop trailer${r.drops === 1 ? '' : 's'}); ${r.visits.length} checked in.`,
        r.avgOrderWaitMs != null ? `Orders took ${Math.round(r.avgOrderWaitMs / MIN)} min on average to be ready; ${r.lateOrders} took over ${ORDER_WAIT_MAX} min.` : '',
        r.inspected ? `${r.firstTime} of ${r.inspected} loads passed inspection the first time.` : '',
        r.fee ? `Estimated detention ${usd(r.fee)}.` : 'No detention.',
      ]
        .filter(Boolean)
        .join(' ')
    : 'No trucks checked in this day.'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <SectionHead title="Daily report" sub="One page per day for the shift lead or the plant manager, built from the day's records. Pick a day, then print it or save it as a PDF.">
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <span className="sr-only">Day</span>
          <select value={day} onChange={(ev) => setDay(ev.target.value)} className="min-h-11 cursor-pointer rounded-[10px] border-[1.5px] border-line bg-panel px-3 text-[15px] font-semibold">
            {days.map((d) => (
              <option key={d} value={d}>
                {d === today ? 'Today' : shortDate(d)} ({new Date(`${d}T00:00`).toLocaleDateString([], { weekday: 'short' })})
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={printReport} className={ui.btnSmall + ' no-print'}>
          <Icon name="print" size={18} />
          Print
        </button>
        <button
          type="button"
          onClick={() => {
            setPdfHint(true)
            printReport()
          }}
          className={ui.btnSmallPrimary + ' no-print'}
        >
          <Icon name="export" size={18} />
          Download PDF
        </button>
      </SectionHead>
      {pdfHint && (
        <p role="status" className="no-print flex items-start gap-2 rounded-xl bg-signal-tint px-4 py-2.5 text-[14px]">
          <Icon name="info" size={18} className="mt-0.5 text-signal" />
          In the print window, choose <b>Save as PDF</b> as the printer (Destination), then Save.
        </p>
      )}
      <article id="ship-report" className="mx-auto w-full max-w-[880px] rounded-2xl border border-hair bg-panel p-6 shadow-card sm:p-9">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-ink pb-3">
          <h3 className="font-display text-[24px] font-bold">Shipping report · {title}</h3>
          <span className="text-[13px] text-muted">Prepared {new Date(now).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        </header>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {fig('Trucks left', r.shipped.length)}
          {fig('Avg gate to gate', dur(r.avgG2gMs))}
          {fig('Orders ready late', r.lateOrders)}
          {fig('Est. detention', usd(r.fee))}
        </div>
        <h4 className="mt-6 mb-1.5 font-display text-[16px] font-bold">Summary</h4>
        <p className="text-[14.5px] leading-relaxed">{lead}</p>
        <h4 className="mt-6 mb-1.5 font-display text-[16px] font-bold">Stages against target</h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-[14px]">
            <thead className="text-[12.5px] text-muted">
              <tr className="border-b border-line">
                <th className="py-1.5 text-left font-semibold">Stage</th>
                <th className="py-1.5 text-right font-semibold">Average</th>
                <th className="py-1.5 text-right font-semibold">Target</th>
                <th className="py-1.5 text-right font-semibold">Within target</th>
                <th className="py-1.5 text-right font-semibold">Trucks</th>
              </tr>
            </thead>
            <tbody>
              {r.stages.map((s) => (
                <tr key={s.key} className="border-b border-hair">
                  <td className="py-1.5">{s.label}</td>
                  <td className={'py-1.5 text-right tabular-nums ' + (s.avg != null && s.avg > s.max * MIN ? 'font-semibold text-danger' : '')}>{mins(s.avg)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {s.min}–{s.max} min
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{pct(s.within)}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4 className="mt-6 mb-1.5 font-display text-[16px] font-bold">Exceptions</h4>
        {r.exceptions.length ? (
          <ol className="grid gap-1.5 text-[14px]">
            {r.exceptions.map((x, i) => (
              <li key={i} className="grid grid-cols-[64px_12px_minmax(0,1fr)] items-start gap-2">
                <span className="tabular-nums text-muted">{x.at ? clockTime(x.at) : ''}</span>
                <i className={'mt-1.5 inline-block size-2.5 rounded-full ' + (x.tone === 'bad' ? 'bg-danger' : 'bg-warn-edge')} aria-hidden="true" />
                <span>{x.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[14px] text-muted">None.</p>
        )}
        {r.customers.length > 0 && (
          <>
            <h4 className="mt-6 mb-1.5 font-display text-[16px] font-bold">Top customers</h4>
            <table className="w-full border-collapse text-[14px]">
              <tbody>
                {r.customers.map((c) => (
                  <tr key={c.name} className="border-b border-hair">
                    <td className="py-1.5">{c.name}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {c.orders} order{c.orders === 1 ? '' : 's'}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted">wait for order {mins(c.avgOrderWaitMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </article>
    </div>
  )
}
