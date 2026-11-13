import { useEffect, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'
import { arrivalMs, clockTime, dayKey, duration } from '../time'
import { DOCKS } from '../yard'
import { isDrop } from '../metrics'
import { atDockNow, awaitingRelease, inYard, isReleased } from '../handoff'
import { detentionState } from '../detention'
import { DOCK_STEPS, STAGES, checkedInAt, currentStage, inspectionSavedAt, toneOf } from '../stages'
import { dockKey, occupiedDocks } from './AssignDock'
import { TimerLegend, TimerLine, TimerPill } from './StageTimer'
import LiveYardCard from './LiveYardCard'
import EntryDialog from './EntryDialog'
import { phaseOf } from './Dashboard'

// The Shipping desk: what needs doing now, laid out the way trucks move. A one-line read of the
// situation, the numbers that need action, the docks (free or busy, and how far along each truck is),
// then four lanes — Waiting for order → Ready for a dock → At the docks → Passed inspection — with a timer
// on every truck, and the Live yard and a stage chart. Shipping marks a waiting truck's order ready; only
// then can it get a dock (two taps: Assign dock, then a free dock). Shipping only watches the last lane:
// the inspector releases trucks to the gate (or a loaded drop trailer to the yard) on Loading & Inspection.

const PURPOSE_EDGE = { Pickup: 'before:bg-pickup', 'Drop Trailer': 'before:bg-drop' }
const PURPOSE_DOT = { Pickup: 'bg-pickup', 'Drop Trailer': 'bg-drop' }
const MIN = 60000

const byDock = (a, b) => dockKey(a.dockDoor).localeCompare(dockKey(b.dockDoor), undefined, { numeric: true })

function Purpose({ e }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {(e.visitPurpose ?? []).map((p) => (
        <span key={p} className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <i className={'inline-block size-2 rounded-full ' + (PURPOSE_DOT[p] ?? 'bg-line')} />
          {p}
        </span>
      ))}
    </span>
  )
}

// A truck card: trailer # large with the carrier under it, the timer pill top-right, details, the timer
// bar, then the card's own action.
function TruckCard({ e, stage, now, selected, dock, children }) {
  const purposes = e.visitPurpose ?? []
  return (
    <article
      className={
        'relative grid gap-2.5 rounded-2xl bg-panel py-3.5 pr-4 pl-5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised ' +
        'before:absolute before:inset-y-3.5 before:left-0 before:w-1 before:rounded-r ' +
        (PURPOSE_EDGE[purposes[0]] ?? 'before:bg-line') +
        (selected ? ' ring-[3px] ring-ok' : '')
      }
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <b className="block font-display text-[19px] leading-tight break-words">{e.trailerNumber || '—'}</b>
          <span className="text-[14px] text-muted">{e.truckName}</span>
        </div>
        {dock && <span className="rounded-lg bg-signal-tint px-2.5 py-0.5 font-display text-[16px] font-bold whitespace-nowrap">Dock {e.dockDoor}</span>}
        {stage && <TimerPill stage={stage.key} since={stage.since} now={now} />}
      </div>
      {children}
    </article>
  )
}

function Lane({ icon, badge, title, count, target, empty, emptyIcon, children }) {
  return (
    // min-w-0: four lanes side by side on wide screens, so cards shrink instead of overflowing.
    <section aria-label={title} className="grid min-w-0 content-start gap-3">
      <div className="grid gap-1 px-1">
        <div className="flex items-center gap-2.5">
          <span className={'grid size-9 shrink-0 place-items-center rounded-xl ' + badge}>
            <Icon name={icon} />
          </span>
          <h3 className="font-display text-[19px] leading-tight font-bold">{title}</h3>
          <span className="grid h-7 min-w-7 place-items-center rounded-full bg-panel px-2 font-display text-[16px] font-bold shadow-card">{count}</span>
        </div>
        <span className="text-[13px] leading-tight text-muted">{target}</span>
      </div>
      <div className="grid min-h-[140px] content-start gap-3 rounded-[20px] bg-gradient-to-b from-signal-soft/60 to-signal-soft/25 p-2.5">
        {count ? (
          children
        ) : (
          <p className="grid place-items-center gap-1.5 px-3 py-7 text-center text-[14px] text-muted">
            <Icon name={emptyIcon} size={28} className="text-signal-bright" />
            {empty}
          </p>
        )}
      </div>
    </section>
  )
}

// A number tile. `tone`: bad | warn | good colours the icon (and the note for bad); otherwise quiet.
// With `onClick` (and `to`, where it goes) the whole tile is a button that lifts on hover.
function Kpi({ icon, label, value, note, tone, onClick, to }) {
  const ic = { bad: 'bg-danger-soft text-danger', warn: 'bg-warn text-warn-ink', good: 'bg-ok-soft text-ok' }[tone] ?? 'bg-signal-tint text-signal'
  const Box = onClick ? 'button' : 'div'
  return (
    <Box
      {...(onClick && { type: 'button', onClick, title: `Open ${to}` })}
      className={
        'grid grid-cols-[44px_1fr] items-center gap-x-3 gap-y-1 rounded-[18px] bg-panel px-4 py-3.5 text-left shadow-card' +
        (onClick ? ' group cursor-pointer transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised' : '')
      }
    >
      <span className={'row-span-2 grid size-11 place-items-center rounded-[14px] ' + ic}>
        <Icon name={icon} size={22} />
      </span>
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="font-display text-[32px] leading-none font-bold tabular-nums">{value}</span>
      <span className={'col-span-2 mt-1.5 flex items-start gap-2 border-t border-hair pt-2 text-[13px] ' + (tone === 'bad' ? 'font-semibold text-danger' : 'text-muted')}>
        <span className="min-w-0 flex-1">{note}</span>
        {onClick && (
          <span className="shrink-0 text-signal transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">
            <Icon name="chevron" size={16} />
          </span>
        )}
      </span>
      {onClick && <span className="sr-only">. Open {to}</span>}
    </Box>
  )
}

// Where each truck is in its dock work: pre-loading › loading › inspection.
function StepBars({ current, dark }) {
  const idx = DOCK_STEPS.indexOf(current)
  return (
    <span className="grid grid-cols-3 gap-1">
      {DOCK_STEPS.map((s, i) => (
        <span key={s} className={'grid gap-1 text-[12px] font-semibold ' + (dark ? 'text-signal-bright' : i === idx ? 'text-ink' : 'text-muted')}>
          <i
            className={
              'block h-1 rounded-full ' +
              (i < idx || idx === -1 ? (dark ? 'bg-[#62be87]' : 'bg-ok') : i === idx ? (dark ? 'bg-signal-bright' : 'bg-signal') : dark ? 'bg-white/20' : 'bg-signal-soft')
            }
          />
          {!dark && STAGES[s].label}
        </span>
      ))}
    </span>
  )
}

// Hover/focus details for chart marks.
function useTip() {
  const [tip, setTip] = useState(null)
  const show = (text) => (ev) => {
    const box = ev.currentTarget.closest('[data-chart]').getBoundingClientRect()
    const r = ev.currentTarget.getBoundingClientRect()
    setTip({ text, x: r.left + r.width / 2 - box.left, y: r.top - box.top })
  }
  const el = tip && (
    <span
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[115%] rounded-lg bg-chrome px-3 py-1.5 text-[13px] whitespace-nowrap text-white shadow-raised"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </span>
  )
  return { show, hide: () => setTip(null), el }
}

// `onOpen`: the card opens a section when clicked (except on its table toggle), with a button for keyboards.
function ChartCard({ title, sub, table, onOpen, openLabel, children }) {
  return (
    <div
      data-chart
      onClick={onOpen ? (ev) => !ev.target.closest('details, button') && onOpen() : undefined}
      className={
        'relative grid content-start gap-1.5 rounded-[20px] bg-panel px-5 pt-4 pb-3.5 shadow-card' +
        (onOpen ? ' cursor-pointer transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised' : '')
      }
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="font-display text-[20px] font-bold">{title}</h3>
        {onOpen && (
          <button type="button" onClick={onOpen} className={ui.btnGhost + ' min-h-9 px-2 text-[14px]'}>
            {openLabel}
            <Icon name="chevron" size={16} />
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-[12px] font-bold text-ok">
          <i className="inline-block size-1.5 rounded-full bg-ok" />
          Live
        </span>
      </div>
      <p className="text-[13px] text-muted">{sub}</p>
      {children}
      <details className="text-[14px]">
        <summary className="w-fit cursor-pointer font-semibold text-signal">Show as table</summary>
        {table}
      </details>
    </div>
  )
}

// Average minutes per stage for trucks checked in today, against each stage's target window.
function StageChart({ entries, now, onOpen }) {
  const tip = useTip()
  const today = dayKey(new Date(now))
  const visits = entries.filter((e) => e.dateIn === today)
  const span = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / MIN : null)
  // Older visits have no "Order ready" time: their whole wait counts as dock assignment.
  const rows = [
    ['orderWait', (e) => (e.orderReadyAt ? span(checkedInAt(e), e.orderReadyAt) : null)],
    ['dock', (e) => span(e.orderReadyAt ?? arrivalMs(e), e.dockAssignedAt)],
    ['preload', (e) => span(e.dockAssignedAt, e.loadStartedAt)],
    ['load', (e) => span(e.loadStartedAt, e.loadFinishedAt)],
    ['inspect', (e) => span(e.loadFinishedAt, inspectionSavedAt(e))],
  ].map(([key, get]) => {
    const values = visits.map(get).filter((v) => v != null)
    return { key, label: STAGES[key].label, n: values.length, avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
  })
  // Drawn at the card's real width, so the bars keep their height on a wide screen.
  const box = useRef(null)
  const [W, setW] = useState(600)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(480, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const L = 118
  const R = 96
  const rowH = 48
  const maxV = Math.max(80, ...rows.map((r) => (r.avg ?? 0) + 10))
  const x = (v) => L + ((W - L - R) * v) / maxV
  const ticks = [0, 20, 40, 60, 80].filter((v) => v <= maxV)
  const word = { ok: '● quick', window: '● in target', late: '● over' }
  const wordColor = { ok: 'var(--color-ok)', window: 'var(--color-warn-ink)', late: 'var(--color-danger)' }
  return (
    <ChartCard
      title="Time per stage today"
      sub="Average minutes per truck checked in today · the shaded band is the target"
      onOpen={onOpen}
      openLabel="Daily report"
      table={
        <table className="mt-1.5 border-collapse">
          <thead>
            <tr className="text-[13px] text-muted">
              <th className="px-3 py-1 text-left">Stage</th>
              <th className="px-3 py-1 text-right">Avg min</th>
              <th className="px-3 py-1 text-right">Target</th>
              <th className="px-3 py-1 text-right">Trucks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-hair">
                <td className="px-3 py-1">{r.label}</td>
                <td className="px-3 py-1 text-right tabular-nums">{r.avg == null ? '—' : Math.round(r.avg)}</td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {STAGES[r.key].min}–{STAGES[r.key].max}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={box} className="min-w-0">
      <svg width={W} height={rows.length * rowH + 26} viewBox={`0 0 ${W} ${rows.length * rowH + 26}`} className="mt-1 block max-w-full overflow-visible" role="img" aria-label="Average minutes per stage today against each target">
        <defs>
          <pattern id="stage-band" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-field)" />
            <rect width="2" height="6" fill="var(--color-signal-soft)" />
          </pattern>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1="4" y2={rows.length * rowH} stroke="var(--color-track)" />
            <text x={x(v)} y={rows.length * rowH + 18} textAnchor="middle" fontSize="12" fill="var(--color-muted)">
              {v}m
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = 12 + i * rowH
          const s = STAGES[r.key]
          const w = r.avg == null ? 0 : Math.max(0, x(r.avg) - L)
          const tone = r.avg == null ? null : toneOf(r.avg, s)
          return (
            <g key={r.key}>
              <text x={L - 12} y={y + 16} textAnchor="end" fontSize="14" fontWeight="600" fill="var(--color-ink)">
                {r.label}
              </text>
              <rect x={x(s.min)} y={y - 2} width={x(s.max) - x(s.min)} height="28" rx="4" fill="url(#stage-band)" />
              {r.avg != null ? (
                <>
                  <path
                    d={`M${L} ${y + 3} h${Math.max(0, w - 4)} a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-${Math.max(0, w - 4)} z`}
                    fill="var(--color-chart-live)"
                    tabIndex={0}
                    aria-label={`${r.label}: average ${Math.round(r.avg)} minutes, target ${s.min} to ${s.max}, ${r.n} trucks`}
                    onMouseEnter={tip.show(`${r.label}: average ${Math.round(r.avg)} min · target ${s.min}–${s.max} · ${r.n} truck${r.n === 1 ? '' : 's'}`)}
                    onFocus={tip.show(`${r.label}: average ${Math.round(r.avg)} min · target ${s.min}–${s.max} · ${r.n} truck${r.n === 1 ? '' : 's'}`)}
                    onMouseLeave={tip.hide}
                    onBlur={tip.hide}
                  />
                  <text x={x(r.avg) + 8} y={y + 17} fontSize="15" fontWeight="700" fill="var(--color-ink)">
                    {Math.round(r.avg)}m
                  </text>
                  <text x={W - 4} y={y + 17} textAnchor="end" fontSize="12" fontWeight="700" fill={wordColor[tone]}>
                    {word[tone]}
                  </text>
                </>
              ) : (
                <text x={L + 4} y={y + 17} fontSize="13" fill="var(--color-muted)">
                  Not timed yet today
                </text>
              )}
            </g>
          )
        })}
      </svg>
      </div>
      {tip.el}
    </ChartCard>
  )
}

// `onGo(section, tab, filters)` (Shipping page): the tiles, busy docks, Live yard stages and the stage chart
// open the section where that work is shown.
export default function ShippingBoard({ entries, onAssignDock, onOrderReady, onUpdateEntry, onGo }) {
  const [now, setNow] = useState(Date.now)
  // The ready truck whose dock is being picked.
  const [assigningId, setAssigningId] = useState(null)
  // The truck whose entry is open in the View entry pop-up.
  const [viewingId, setViewingId] = useState(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const onSite = entries.filter((e) => !e.timeOut)
  // Without a dock, a truck first waits for its order; once Shipping marks it ready it can get a dock.
  // Dropped trailers go the same way (no driver waits with them, so they have no timer).
  const noDock = onSite.filter((e) => !e.dockDoor)
  const waitingOrder = noDock.filter((e) => !e.orderReadyAt).sort((a, b) => arrivalMs(a) - arrivalMs(b))
  const readyForDock = noDock.filter((e) => e.orderReadyAt).sort((a, b) => a.orderReadyAt - b.orderReadyAt)
  // Loaded dropped trailers released to the yard, waiting for a driver to hook them.
  const parked = onSite.filter(inYard).length
  const atDock = onSite.filter((e) => atDockNow(e) && !awaitingRelease(e) && !isReleased(e)).sort(byDock)
  // Passed inspection: waiting for the inspector's release, or released and waiting for the gate.
  const ready = onSite
    .filter((e) => !inYard(e) && (awaitingRelease(e) || isReleased(e)))
    .sort((a, b) => (inspectionSavedAt(a) ?? 0) - (inspectionSavedAt(b) ?? 0))
  const released = ready.filter(isReleased).length
  const toRelease = ready.length - released
  const occupied = occupiedDocks(entries)
  const free = DOCKS.filter((d) => !occupied.has(dockKey(d)))
  const assigning = readyForDock.find((e) => e.id === assigningId)

  const minsIn = (e) => {
    const st = currentStage(e)
    return st && Number.isFinite(st.since) ? { key: st.key, m: (now - st.since) / MIN } : null
  }
  const lateOrder = waitingOrder.filter((e) => !isDrop(e) && (now - checkedInAt(e)) / MIN > STAGES.orderWait.max).length
  const longestOrder = Math.max(0, ...waitingOrder.filter((e) => !isDrop(e)).map((e) => now - checkedInAt(e)))
  const lateDock = readyForDock.filter((e) => (now - e.orderReadyAt) / MIN > STAGES.dock.max).length
  const lateRelease = ready.filter((e) => (minsIn(e)?.m ?? 0) > STAGES.checkout.max).length
  const loading = atDock.filter((e) => currentStage(e)?.key === 'load').length
  const over = onSite.map((e) => detentionState(e, now)).filter((d) => d?.level === 'over')
  const fee = over.reduce((s, d) => s + d.fee, 0)

  const go = (section, tab, filters) => (onGo ? () => onGo(section, tab, filters) : undefined)
  const dockTab = (e) => (['trailer', 'trailerFail', 'ready', 'loading'].includes(phaseOf(e)) ? 'loading' : 'inspection')
  // Live yard stage → where it is shown.
  const STAGE_GO = {
    order: ['log', null, { status: 'Waiting for order' }],
    wait: ['log', null, { status: 'Ready for a dock' }],
    load: ['docks', 'loading'],
    insp: ['docks', 'inspection'],
    ready: ['docks', 'inspection'],
  }

  const assign = (dock) => {
    onAssignDock(assigning.id, dock)
    setAssigningId(null)
  }

  // The line under a card's title: purpose, driver, check-in and appointment.
  const facts = (e) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
      <Purpose e={e} />
      {e.pickupNumber && <span>order {e.pickupNumber}</span>}
      {e.customerPickupFor && <span>{e.customerPickupFor}</span>}
      {isDrop(e) ? <span>dropped, no driver waiting</span> : e.truckerNameIn && <span>{e.truckerNameIn}</span>}
      <span>
        in {clockTime(checkedInAt(e))}
        {e.guardOnDuty && <> by {e.guardOnDuty}</>}
      </span>
      {e.appointmentTime && <span>appt {e.appointmentTime}</span>}
    </div>
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <EntryDialog
        entry={entries.find((x) => x.id === viewingId) ?? null}
        entries={entries}
        onClose={() => setViewingId(null)}
        onSave={(id, changes) => {
          onUpdateEntry(id, changes)
          setViewingId(null)
        }}
      />
      {/* What matters right now, in one line */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h2 className="font-display text-[26px] leading-none font-bold">Live Board</h2>
          <p className="mt-1.5 text-[15px] text-muted" aria-live="polite">
            {waitingOrder.length ? (
              <b className="text-ink">
                {waitingOrder.length} order{waitingOrder.length === 1 ? '' : 's'} not ready
              </b>
            ) : (
              'Every order on site is ready'
            )}
            {lateOrder > 0 && <span className="font-semibold text-danger"> ({lateOrder} late)</span>}
            {' · '}
            {readyForDock.length ? (
              <b className="text-ink">{readyForDock.length} ready for a dock</b>
            ) : (
              'none waiting for a dock'
            )}
            {lateDock > 0 && <span className="font-semibold text-danger"> ({lateDock} late)</span>}
            {' · '}
            <b className="text-ink">{free.length}</b> dock{free.length === 1 ? '' : 's'} free{' · '}
            {ready.length ? (
              <>
                <b className="text-ink">{ready.length}</b> passed inspection
                {lateRelease > 0 && <span className="font-semibold text-danger"> ({lateRelease} waiting too long)</span>}
              </>
            ) : (
              'none passed inspection yet'
            )}
          </p>
        </div>
        <span className="ml-auto">
          <TimerLegend />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          icon="waiting"
          label="Waiting for order"
          value={waitingOrder.length}
          note={
            lateOrder
              ? `${lateOrder} past ${STAGES.orderWait.max} min`
              : longestOrder
                ? `longest ${duration(longestOrder)}`
                : waitingOrder.length
                  ? 'dropped trailers only'
                  : 'every order ready'
          }
          tone={lateOrder ? 'bad' : waitingOrder.length ? 'warn' : 'good'}
          onClick={go('log', null, { status: 'Waiting for order' })}
          to="the Entry log, trucks waiting for their order"
        />
        <Kpi
          icon="dock"
          label="Ready for a dock"
          value={readyForDock.length}
          note={lateDock ? `${lateDock} past ${STAGES.dock.max} min` : readyForDock.length ? 'none late yet' : `all docked${parked ? ` · ${parked} loaded in the yard` : ''}`}
          tone={lateDock ? 'bad' : readyForDock.length ? 'warn' : 'good'}
          onClick={go('log', null, { status: 'Ready for a dock' })}
          to="the Entry log, trucks ready for a dock"
        />
        <Kpi
          icon="dock"
          label="Docks free"
          value={
            <>
              {free.length}
              <span className="text-[16px] text-muted"> / {DOCKS.length}</span>
            </>
          }
          note={free.length ? free.map((d) => `Dock ${d}`).join(' · ') : 'all in use'}
          tone={free.length ? 'good' : 'bad'}
          onClick={go('docks', 'schedule')}
          to="Docks, schedule and use"
        />
        <Kpi icon="load" label="Loading now" value={loading} note={`${atDock.length} at the docks`} onClick={go('docks', 'loading')} to="Docks, loading" />
        <Kpi
          icon="inspected"
          label="Passed inspection"
          value={ready.length}
          note={lateRelease ? `${lateRelease} past the ${STAGES.checkout.max}-min checkout target` : ready.length ? `${toRelease} to release · ${released} at the gate` : 'none yet'}
          tone={lateRelease ? 'bad' : ready.length ? 'warn' : 'good'}
          onClick={go('docks', 'inspection')}
          to="Docks, inspection"
        />
        <Kpi
          icon="money"
          label="Past free time"
          value={over.length}
          note={over.length ? `est. $${Math.round(fee)} so far` : 'no detention'}
          tone={over.length ? 'bad' : 'good'}
          onClick={go('partners', 'detention')}
          to="Partners, detention"
        />
      </div>

      {/* The live graphs, side by side under the numbers: the Live yard (the same as Loading & Inspection,
          view only here) and the time per stage today. They stack on narrower screens. */}
      <div className="grid items-stretch gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <LiveYardCard entries={entries} now={now} compact onStage={onGo ? (key) => onGo(...STAGE_GO[key]) : undefined} />
        <StageChart entries={entries} now={now} onOpen={go('report')} />
      </div>

      {/* Docks: free or busy, and how far along the truck is */}
      <section aria-labelledby="docks-title" className="grid gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id="docks-title" className="font-display text-[20px] font-bold">
            Docks
          </h3>
          <span className="text-[14px] text-muted">
            {free.length} of {DOCKS.length} free · a dock goes to a truck once its order is ready
          </span>
          {assigning && <span className="ml-auto text-[14px] font-bold text-ok">Tap a free dock for trailer {assigning.trailerNumber}</span>}
        </div>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          {DOCKS.map((d) => {
            const e = occupied.get(dockKey(d))
            if (e) {
              const st = currentStage(e)
              const Box = onGo ? 'button' : 'div'
              return (
                <Box
                  key={d}
                  {...(onGo && { type: 'button', onClick: () => onGo('docks', dockTab(e)), title: `Open Docks, ${dockTab(e)}` })}
                  className={
                    'grid min-h-[104px] content-start gap-1.5 rounded-2xl bg-gradient-to-br from-[var(--p-hero-2)] to-[var(--p-hero)] px-3.5 py-3 text-left text-white shadow-card' +
                    (onGo ? ' on-chrome cursor-pointer transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised' : '')
                  }
                >
                  <span className="flex items-center gap-2 font-display text-[18px] font-bold">
                    <i className="inline-block size-2.5 rounded-full bg-signal-bright" />
                    Dock {d}
                  </span>
                  <span className="truncate font-display text-[16px] font-bold" title={`${e.trailerNumber} · ${e.truckName}`}>
                    {e.trailerNumber} · {e.truckName}
                  </span>
                  <span className="text-[13px] text-signal-bright">
                    {st?.recheck ? 'Re-check' : st ? STAGES[st.key].label : isReleased(e) ? 'Released to gate' : 'At the dock'}
                  </span>
                  <StepBars current={st?.key === 'checkout' || !st ? 'done' : st.key} dark />
                </Box>
              )
            }
            return assigning ? (
              <button
                key={d}
                type="button"
                onClick={() => assign(d)}
                className="grid min-h-[104px] cursor-pointer content-start gap-1.5 rounded-2xl border-2 border-ok bg-ok-soft px-3.5 py-3 text-left shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised"
              >
                <span className="flex items-center gap-2 font-display text-[18px] font-bold">
                  <i className="inline-block size-2.5 rounded-full bg-ok" />
                  Dock {d}
                </span>
                <span className="text-[14px] font-bold text-ok">Tap to assign</span>
              </button>
            ) : (
              <div key={d} className="grid min-h-[104px] content-start gap-1.5 rounded-2xl bg-panel px-3.5 py-3 shadow-card">
                <span className="flex items-center gap-2 font-display text-[18px] font-bold">
                  <i className="inline-block size-2.5 rounded-full bg-ok" />
                  Dock {d}
                </span>
                <span className="text-[14px] font-bold text-ok">Free</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* The work board, in the order trucks move */}
      <div className="grid items-start gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <Lane
          icon="waiting"
          badge="bg-warn text-warn-ink"
          title="Waiting for order"
          count={waitingOrder.length}
          target={
            <>
              order ready within {STAGES.orderWait.max} min
            </>
          }
          empty="Every truck on site has its order ready."
          emptyIcon="done"
        >
          {waitingOrder.map((e) => (
            <TruckCard key={e.id} e={e} stage={currentStage(e)} now={now}>
              {facts(e)}
              {!isDrop(e) && <TimerLine stage="orderWait" since={checkedInAt(e)} now={now} scale={30} />}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onOrderReady(e.id)} className={ui.btnSmallPrimary + ' flex-1'}>
                  <Icon name="done" />
                  Order ready
                </button>
                <button type="button" onClick={() => setViewingId(e.id)} className={ui.btnGhost}>
                  View entry
                </button>
              </div>
              <span className="text-center text-[12px] text-muted">A dock can be assigned once the order is ready</span>
            </TruckCard>
          ))}
        </Lane>

        <Lane
          icon="dock"
          badge="bg-warn text-warn-ink"
          title="Ready for a dock"
          count={readyForDock.length}
          target={
            <>
              assign within {STAGES.dock.min}–{STAGES.dock.max} min
            </>
          }
          empty={`No ready orders waiting for a dock.${parked ? ` ${parked} loaded trailer${parked === 1 ? ' is' : 's are'} parked in the yard.` : ''}`}
          emptyIcon="done"
        >
          {readyForDock.map((e) => (
            <TruckCard key={e.id} e={e} stage={currentStage(e)} now={now} selected={assigningId === e.id}>
              {facts(e)}
              <span className="text-[13px] text-muted">
                Order ready {clockTime(e.orderReadyAt)}
                {e.orderReadyBy && <> by {e.orderReadyBy}</>}
              </span>
              {!isDrop(e) && <TimerLine stage="dock" since={e.orderReadyAt} now={now} scale={30} />}
              {assigningId === e.id ? (
                <div className="grid gap-2 rounded-xl bg-ok-soft p-2.5">
                  <span className="flex items-center text-[14px] font-bold text-ok">
                    Pick a free dock
                    <button type="button" onClick={() => setAssigningId(null)} className="ml-auto min-h-9 cursor-pointer px-1.5 font-semibold text-signal underline">
                      Cancel
                    </button>
                  </span>
                  {free.length ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
                      {free.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => assign(d)}
                          className="min-h-11 cursor-pointer rounded-[10px] border-[1.5px] border-ok bg-panel font-display text-[16px] font-bold text-ok transition-colors hover:bg-ok hover:text-signal-ink"
                        >
                          Dock {d}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[14px]">All docks are in use. Wait for one to free up.</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setAssigningId(e.id)} className={ui.btnSmallPrimary + ' flex-1'}>
                    <Icon name="dock" />
                    Assign dock
                  </button>
                  <button type="button" onClick={() => setViewingId(e.id)} className={ui.btnGhost}>
                    View entry
                  </button>
                </div>
              )}
            </TruckCard>
          ))}
        </Lane>

        <Lane
          icon="load"
          badge="bg-signal text-signal-ink"
          title="At the docks"
          count={atDock.length}
          target={
            <>
              pre-load {STAGES.preload.min}–{STAGES.preload.max} · load {STAGES.load.min}–{STAGES.load.max} · inspect {STAGES.inspect.min}–{STAGES.inspect.max} min
            </>
          }
          empty="No trucks at a dock."
          emptyIcon="dock"
        >
          {atDock.map((e) => {
            const st = currentStage(e)
            return (
              <TruckCard key={e.id} e={e} stage={st} now={now} dock>
                <StepBars current={st?.key} />
                {st?.recheck && (
                  <span className={ui.tag + ' w-fit bg-danger-soft text-danger'}>
                    <Icon name="failed" size={14} />
                    Inspection failed · re-check
                  </span>
                )}
                {st && <TimerLine stage={st.key} since={st.since} now={now} />}
                <button type="button" onClick={() => setViewingId(e.id)} className={ui.btnGhost + ' w-fit'}>
                  View entry
                </button>
              </TruckCard>
            )
          })}
        </Lane>

        <Lane
          icon="inspected"
          badge="bg-ok-soft text-ok"
          title="Passed inspection"
          count={ready.length}
          target={
            <>
              release and check out within {STAGES.checkout.min}–{STAGES.checkout.max} min
            </>
          }
          empty="No trucks have passed inspection yet."
          emptyIcon="checkOut"
        >
          {ready.map((e) => (
            <TruckCard key={e.id} e={e} stage={currentStage(e)} now={now} dock>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
                <Purpose e={e} />
                {e.pickupNumber && <span>order {e.pickupNumber}</span>}
                {e.customerPickupFor && <span>{e.customerPickupFor}</span>}
                {inspectionSavedAt(e) && <span>passed {clockTime(inspectionSavedAt(e))}</span>}
              </div>
              {!isDrop(e) && <TimerLine stage="checkout" since={inspectionSavedAt(e)} now={now} scale={10} />}
              {/* View only: the inspector releases on Loading & Inspection. */}
              {isReleased(e) ? (
                <p className={ui.tag + ' min-h-9 justify-center bg-delivery-soft text-delivery'}>
                  <Icon name="handoff" size={16} />
                  Released{e.release.releasedBy ? ` by ${e.release.releasedBy}` : ''} · waiting for gate checkout
                </p>
              ) : (
                <p className={ui.tag + ' min-h-9 justify-center bg-warn text-warn-ink'}>
                  <Icon name="waiting" size={16} />
                  {isDrop(e) ? 'Waiting for the inspector to release it to the yard' : 'Waiting for the inspector to release it'}
                </p>
              )}
            </TruckCard>
          ))}
        </Lane>
      </div>
    </div>
  )
}
