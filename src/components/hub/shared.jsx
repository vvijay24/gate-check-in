import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../../ui'
import { arrivalMs, clockTime, dayKey, duration, minutesLate, LATE_GRACE_MIN } from '../../time'
import { dayMetrics, isDrop, yardMetrics } from '../../metrics'
import { DOCKS } from '../../yard'
import { DETENTION_TAG, detentionState } from '../../detention'
import { checkOutBlock, isReleased } from '../../handoff'
import { currentStage } from '../../stages'
import { dockKey } from '../AssignDock'
import { dockPhase } from '../Dashboard'
import { hasDraft } from '../LoadingInspection'
import { TimerLine, TimerPill } from '../StageTimer'
import YardMap, { Legend, STATUS, StatusPin } from '../YardMap'
import { VIEW } from '../YardScene'

// The work hubs (Gate, Shipping, Dock & Loading) share one layout: a top bar (views, live figures,
// the role's tools), the role's to-do strip, then the live yard map (or a list view) beside a side
// panel. Tapping a truck anywhere opens its card in the panel; each card shows that role's next action.
// On a landscape tablet and up the hub fills the screen below the header, so nothing scrolls but the
// panel and the lists.

// The current time, refreshed every `ms` (30 s), so timers and detention stay current.
export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

// Docks in use right now, keyed by normalized dock #.
export const busyDocks = (entries) => new Map(entries.filter((e) => !e.timeOut && e.dockDoor).map((e) => [dockKey(e.dockDoor), e]))
export const freeDocks = (entries) => {
  const busy = busyDocks(entries)
  return DOCKS.filter((d) => !busy.has(dockKey(d)))
}

// The inspector's next step for a truck at a dock (Dock & Loading), or null when there is none.
export function dockAction(e, { onOpen, onLoading, onRelease }) {
  const draft = (part) => (hasDraft(e.id, part) ? ' · draft' : '')
  return (
    {
      trailer: { label: `Check trailer${draft('trailer')}`, short: 'Check trailer', run: () => onOpen(e, 'trailer') },
      trailerFail: { label: 'Re-check trailer', short: 'Re-check', run: () => onOpen(e, 'trailer'), bad: true },
      ready: { label: 'Start loading', short: 'Start loading', run: () => onLoading(e, { loadStartedAt: Date.now() }) },
      loading: { label: 'Loading finished', short: 'Loaded', run: () => onLoading(e, { loadFinishedAt: Date.now() }) },
      inspect: { label: `Inspect load${draft('load')}`, short: 'Inspect', run: () => onOpen(e, 'load') },
      failed: { label: 'Re-inspect', short: 'Re-inspect', run: () => onOpen(e, 'load'), bad: true },
      release: { label: 'Release to gate', short: 'Release', run: () => onRelease(e) },
    }[dockPhase(e)] ?? null
  )
}

// ---------- Layout ----------

// `wide`: the panel holds a form and takes about half the width.
// `focusKey` changes when a card or form opens; below lg, where the panel sits under the map, the page
// scrolls to it.
export function Hub({ label, views, view, onView, kpis, tools, queue, main, panel, wide, onEscape, focusKey }) {
  const root = useRef(null)
  const aside = useRef(null)
  useEffect(() => {
    if (focusKey && window.innerWidth < 1024) aside.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusKey])
  return (
    <div
      ref={root}
      onKeyDown={(ev) => {
        // Esc closes the card or form in the panel (a pop-up dialog handles its own Esc).
        if (ev.key === 'Escape' && onEscape && !ev.target.closest?.('dialog')) onEscape()
      }}
      className="hub-fit flex flex-col gap-2.5 lg:h-[calc(100dvh-var(--header-h,56px)-1.5rem)]"
    >
      <h2 className="sr-only">{label}</h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {views?.length > 1 && <ViewSwitch views={views} view={view} onView={onView} label={`${label} view`} />}
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5">{kpis}</div>
        {tools && <div className="flex shrink-0 flex-wrap items-center gap-2">{tools}</div>}
      </div>
      {queue}
      <div
        className={
          'grid min-h-0 flex-1 gap-2.5 transition-[grid-template-columns] duration-200 motion-reduce:transition-none ' +
          (wide ? 'lg:grid-cols-[minmax(0,1fr)_minmax(500px,48%)]' : 'lg:grid-cols-[minmax(0,1fr)_380px]')
        }
      >
        <div className="relative min-w-0 lg:min-h-0">{main}</div>
        <aside ref={aside} aria-label={`${label}: details`} className="@container relative min-h-0 scroll-mt-[calc(var(--header-h,56px)+12px)] rounded-xl bg-panel shadow-card lg:overflow-y-auto">
          {panel}
        </aside>
      </div>
    </div>
  )
}

export function ViewSwitch({ views, view, onView, label }) {
  return (
    <div role="tablist" aria-label={label} className="no-print flex shrink-0 gap-0.5 rounded-lg bg-track p-1">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={view === v.id}
          onClick={() => onView(v.id)}
          className={
            'flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[14px] font-semibold whitespace-nowrap transition-colors ' +
            (view === v.id ? 'bg-panel text-ink shadow-[0_1px_2px_rgb(15_23_42/0.12),0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink')
          }
        >
          {v.label}
          {v.count > 0 && <span className="figure rounded bg-warn px-1 text-[11px] text-warn-ink">{v.count}</span>}
        </button>
      ))}
    </div>
  )
}

// A live figure in the top bar. The tone is also in the words of `note`, never color alone.
export function Kpi({ label, value, note, tone }) {
  const bar = { good: 'bg-ok', warn: 'bg-warn', alert: 'bg-danger' }[tone]
  return (
    <div className="relative flex shrink-0 items-baseline gap-2 overflow-hidden rounded-lg bg-panel py-1.5 pr-3 pl-3.5 shadow-card" title={note}>
      {bar && <i aria-hidden="true" className={'absolute inset-y-0 left-0 w-1 ' + bar} />}
      <span className="text-[12.5px] font-medium whitespace-nowrap text-muted">{label}</span>
      <b className="figure text-[17px] leading-none font-semibold whitespace-nowrap">{value}</b>
      {note && <span className={'hidden text-[12px] whitespace-nowrap xl:inline ' + (tone === 'alert' ? 'font-semibold text-danger' : 'text-muted')}>{note}</span>}
    </div>
  )
}

// The role's to-do strip: one chip per truck, most urgent first. Tapping the chip opens the truck's
// card; its button does the next step straight away.
export function Queue({ title, items, empty, selectedId, onSelect }) {
  return (
    <section aria-label={title} className="flex min-w-0 items-stretch gap-2">
      <div className="flex shrink-0 flex-col justify-center rounded-lg bg-chrome px-3 text-white">
        <span className="eyebrow text-rail-muted">{title}</span>
        <b className="figure text-[18px] leading-none">{items.length}</b>
      </div>
      {items.length === 0 ? (
        <p className="flex items-center rounded-lg border border-dashed border-line px-4 text-[14px] text-muted">{empty}</p>
      ) : (
        <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {items.map(({ e, place, note, timer, action, bad }) => {
            const on = e.id === selectedId
            return (
              <li
                key={e.id}
                className={
                  'flex shrink-0 items-stretch overflow-hidden rounded-lg border bg-panel shadow-card ' +
                  (on ? 'border-signal-line ring-2 ring-signal/25' : bad ? 'border-danger' : 'border-transparent')
                }
              >
                <button type="button" onClick={() => onSelect(e.id)} aria-pressed={on} className="min-h-12 cursor-pointer px-3 py-1.5 text-left hover:bg-field">
                  <span className="flex items-center gap-2">
                    <span className="eyebrow text-muted">{place}</span>
                    {timer}
                  </span>
                  <span className="block max-w-[190px] truncate text-[14.5px] leading-tight font-semibold">
                    {e.trailerNumber || '—'} <span className="font-normal text-muted">{e.truckName}</span>
                  </span>
                  {note && <span className={'block max-w-[190px] truncate text-[12px] ' + (bad ? 'font-semibold text-danger' : 'text-muted')}>{note}</span>}
                </button>
                {action && (
                  <button
                    type="button"
                    onClick={action.run}
                    className={
                      'min-h-12 min-w-[86px] cursor-pointer border-l px-3 text-[13.5px] font-semibold whitespace-nowrap ' +
                      (action.bad ? 'border-danger/30 bg-danger-soft text-danger hover:bg-danger hover:text-white' : 'border-signal-line bg-signal text-signal-ink hover:bg-signal-line')
                    }
                  >
                    {action.label}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---------- Map ----------

// The live yard map filling the hub's main area (keeping its shape below lg). `focus(e)` tags the
// trucks the role should act on ("Check out", "Needs dock", "Inspect"…) without fading the others.
export function MapPane({ entries, now, picked, onPick, focus, dockTargets, onDockTap, hint }) {
  const yard = useMemo(() => yardMetrics(entries, Infinity, now), [entries, now])
  const gateCounts = useMemo(() => dayMetrics(entries, dayKey(new Date(now)), now).gateCounts, [entries, now])
  const [key, setKey] = useState(false)
  return (
    <div className="aspect-(--ar) h-auto rounded-xl bg-panel shadow-card lg:aspect-auto lg:h-full" style={{ '--ar': `${VIEW.w} / ${VIEW.h}` }}>
      <YardMap
        bare
        yard={yard}
        gateCounts={gateCounts}
        at={Infinity}
        clock={now}
        live
        picked={picked}
        onPick={onPick}
        focus={focus}
        fade={false}
        dockTargets={dockTargets}
        onDockTap={onDockTap}
        overlay={
          <div className="relative">
            <button
              type="button"
              aria-expanded={key}
              onClick={() => setKey((k) => !k)}
              className="min-h-9 cursor-pointer rounded-lg bg-panel/90 px-3 text-[13px] font-semibold shadow-card hover:bg-panel"
            >
              {key ? '✕ Key' : 'Key'}
            </button>
            {key && (
              <div className="absolute top-11 right-0 w-[260px] rounded-xl bg-panel p-3.5 shadow-raised">
                <Legend />
              </div>
            )}
          </div>
        }
        footer={hint && <p className="rounded-lg bg-chrome/85 px-2.5 py-1.5 text-[12.5px] font-medium text-white">{hint}</p>}
      />
    </div>
  )
}

// ---------- Truck card ----------

const JOURNEY = ['In', 'Dock', 'Trailer', 'Load', 'Inspect', 'Release', 'Out']
const PHASE_AT = { trailer: 2, trailerFail: 2, ready: 3, loading: 3, inspect: 4, failed: 4, release: 5, released: 6 }

// Where the visit is: 0 In … 6 Out, 7 when it has left; `bad` when a check failed.
function journeyAt(e) {
  if (e.timeOut) return { at: 7 }
  if (!e.dockDoor) return { at: 1 }
  const phase = dockPhase(e)
  return { at: PHASE_AT[phase] ?? 1, bad: phase === 'trailerFail' || phase === 'failed' }
}

function Journey({ e }) {
  const drop = isDrop(e) && !e.dockDoor
  const steps = drop ? ['In', 'In the yard', 'Out'] : JOURNEY
  const { at, bad } = drop ? { at: e.timeOut ? 3 : 1 } : journeyAt(e)
  return (
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Visit progress">
      {steps.map((s, i) => {
        const done = i < at
        const now = i === at
        return (
          <li key={s} className="min-w-0">
            <span className={'block h-1.5 rounded-full ' + (done ? 'bg-ok' : now ? (bad ? 'bg-danger' : 'bg-signal') : 'bg-track')} />
            <span className={'mt-1 block truncate text-[11px] font-semibold ' + (now ? (bad ? 'text-danger' : 'text-ink') : 'text-muted')}>
              {done ? '✓' : ''}
              {s}
            </span>
            <span className="sr-only">{done ? 'done' : now ? 'now' : 'to do'}</span>
          </li>
        )
      })}
    </ol>
  )
}

// What the truck is waiting on, in words.
export function nextWords(e) {
  if (e.timeOut) return `Left at ${e.timeOut}`
  if (!e.dockDoor) return isDrop(e) ? 'Dropped trailer in the yard' : 'Waiting for Shipping to assign a dock'
  return {
    trailer: 'At the dock · the inspector checks the empty trailer',
    trailerFail: `Trailer not OK · ${e.trailerCheck?.issues?.[0] ?? 're-check needed'}`,
    ready: 'Trailer OK · ready to start loading',
    loading: 'Loading',
    inspect: 'Loaded · the inspector inspects the load',
    failed: `Inspection failed · ${e.loadingInspection?.issues?.[0] ?? 're-check needed'}`,
    release: 'Passed · the inspector releases it to the gate',
    released: `Released${e.release?.releasedBy ? ` by ${e.release.releasedBy}` : ''} · the gate checks it out`,
  }[dockPhase(e)]
}

// One truck, the same everywhere: who, where, how long, where it is in the visit, and `actions` (the
// role's buttons). `onClose` closes the card.
export function TruckCard({ e, now, place, actions, notice, onClose }) {
  const status = e.timeOut ? 'departed' : isReleased(e) || e.loadingInspection?.result === 'Pass' ? 'ready' : isDrop(e) && !e.dockDoor ? 'drop' : e.dockDoor ? 'dock' : 'waiting'
  const stage = currentStage(e)
  const det = detentionState(e, now)
  const late = minutesLate(e)
  const purposes = e.visitPurpose ?? []
  const facts = [
    ['Driver', e.truckerNameIn],
    ['Phone', e.driverPhone && <a href={`tel:${e.driverPhone}`} className="font-semibold underline">{e.driverPhone}</a>],
    ['Order No', e.pickupNumber],
    ['Customer', e.customerPickupFor],
    ['Appointment', e.appointmentTime && (late > LATE_GRACE_MIN ? <span className="font-semibold text-danger">{e.appointmentTime} · {duration(late * 60000)} late</span> : e.appointmentTime)],
    ['Arrived', `${e.timeIn || '—'} · ${duration(now - arrivalMs(e))} ago`],
    ['Waiting at', !e.dockDoor && e.waitingLocation],
    ['Seal', e.release?.seal || e.loadingInspection?.sealApplied || e.outgoingSeals || e.incomingSeals],
    ['Reefer', e.reefer === 'Yes' && [e.tempActual && `${e.tempActual}°F`, e.tempSet && `set ${e.tempSet}°F`].filter(Boolean).join(' · ')],
  ].filter(([, v]) => v)
  return (
    <article aria-label={`Trailer ${e.trailerNumber}`} className="pop-in flex min-h-full flex-col">
      <header className="flex items-start gap-3 border-b border-line px-4 pt-3.5 pb-3">
        <svg width="30" height="30" viewBox="-13 -13 26 26" aria-hidden="true" className="mt-0.5 shrink-0">
          <StatusPin status={status} />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-muted">{place}</div>
          <h3 className="font-display text-[21px] leading-tight font-semibold break-words">{e.trailerNumber || '—'}</h3>
          <p className="text-[13.5px] text-muted">{[e.truckName, purposes.join(' + ')].filter(Boolean).join(' · ')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close truck card"
          className="-mt-1 -mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-xl text-muted hover:bg-field hover:text-ink"
        >
          ✕
        </button>
      </header>
      <div className="space-y-3 px-4 py-3">
        <Journey e={e} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold">{STATUS[status].label}</span>
          {stage && <TimerPill stage={stage.key} since={stage.since} now={now} />}
          {det && <span className={ui.tag + ' ' + DETENTION_TAG[det.level]}>{det.text}</span>}
        </div>
        <p className="text-[13.5px] text-muted">{nextWords(e)}</p>
        {stage && <TimerLine stage={stage.key} since={stage.since} now={now} />}
        {notice}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13.5px]">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11.5px] font-semibold text-muted uppercase">{k}</dt>
              <dd className="truncate">{v}</dd>
            </div>
          ))}
        </dl>
        {e.release?.note && <p className="rounded-md bg-page px-3 py-2 text-[13px]"><b>Gate note:</b> {e.release.note}</p>}
      </div>
      {actions && <div className="no-print sticky bottom-0 mt-auto flex flex-wrap gap-2 border-t border-line bg-panel px-4 py-3">{actions}</div>}
    </article>
  )
}

// One tap per dock: busy docks are shown but can't be picked, with the trailer holding them.
export function DockButtons({ entries, onPick }) {
  const busy = busyDocks(entries)
  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-semibold text-muted">Assign a dock · tap one (or a free dock on the map)</p>
      <div className="grid grid-cols-3 gap-1.5">
        {DOCKS.map((d) => {
          const holder = busy.get(dockKey(d))
          return (
            <button
              key={d}
              type="button"
              disabled={Boolean(holder)}
              onClick={() => onPick(d)}
              className={
                'flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-lg border text-[15px] font-semibold disabled:cursor-not-allowed ' +
                (holder ? 'border-line bg-page text-muted' : 'border-signal bg-signal-soft text-signal-line hover:bg-signal hover:text-signal-ink')
              }
            >
              Dock {d}
              <span className="text-[11px] font-medium">{holder ? `in use · ${holder.trailerNumber}` : '✓ free'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// The gate's words for why a truck can't be checked out yet.
export function BlockedNote({ e }) {
  const reason = checkOutBlock(e)
  if (!reason) return null
  return <p className="rounded-md border-l-4 border-danger bg-danger-soft px-3 py-2 text-[13px] text-danger">⛔ Can’t check out yet. {reason}</p>
}

// The panel's empty state, with a hint and the role's tools.
export function PanelHome({ title, hint, children }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-line px-4 pt-3.5 pb-3">
        <h3 className="font-display text-[18px] leading-tight font-semibold">{title}</h3>
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </div>
  )
}

// Where a truck is, in words.
export const placeOf = (e) => (e.timeOut ? `Left ${e.timeOut}` : e.dockDoor ? `Dock ${e.dockDoor}` : e.waitingLocation || (isDrop(e) ? 'Yard' : 'Waiting'))

export { clockTime }
