import { useState } from 'react'
import * as ui from '../../ui'
import { Icon } from '../../icons'
import { arrivalMs, clock12, clockTime, duration } from '../../time'
import { DOCKS } from '../../yard'
import { isDrop } from '../../metrics'
import { atDockNow, awaitingRelease, inYard, isReleased } from '../../handoff'
import { STAGES, checkedInAt, currentStage, inspectionSavedAt, toneOf } from '../../stages'
import { detentionClockStart, detentionState } from '../../detention'
import { ASK_AFTER_MIN, REASONS, suggestReason } from '../../delayReasons'
import { contactFor, needsStaging, NO_SHOW_MIN } from '../../schedule'
import { HANDOFFS } from '../../impactSettings'
import { loadSummary, palletLine, productLine } from '../../loadSheet'
import { DETENTION } from '../../turnaround/targets'
import { dockKey, occupiedDocks } from '../AssignDock'
import { bookingState } from '../gate/GateHome'
import { LineUp, estimate } from './lineup'
import { DaySummary } from './daySummary'

// Shipping → Now: the dock wall (what each bay is doing), "Action required" (one list of what to do, most
// urgent first), "Coming up" (the next bookings) and "Everyone on site" (folded at the bottom).

const MIN = 60000
const HOUR = 60 * MIN
const ORDER_MAX = STAGES.orderWait.max
const RELEASE_MAX = HANDOFFS.find((h) => h.key === 'toReleaseMs').target
const FREE_MS = DETENTION.freeMin * MIN
const DOCK_STEPS = [
  { key: 'preload', label: 'Getting ready', color: 'var(--color-chart-live)' },
  { key: 'load', label: 'Loading', color: 'var(--color-yard-load)' },
  { key: 'inspect', label: 'Inspection', color: 'var(--color-yard-insp)' },
]
const TONE_TEXT = { ok: 'text-muted', window: 'text-warn-ink', late: 'text-danger' }
const DOT = { bad: 'bg-danger', warn: 'bg-warn-edge', act: 'bg-signal', info: 'bg-line' }
// A customer picking up with its own truck books under the carrier "Pickup".
export const carrierOf = (a) => (a.carrier === 'Pickup' ? `${a.customer} (own truck)` : a.carrier)
const entryCarrier = (e) => (e.truckName === 'Pickup' && e.customerPickupFor ? `${e.customerPickupFor} (own truck)` : e.truckName || '—')
const freeDocks = (entries) => {
  const busy = occupiedDocks(entries)
  return DOCKS.filter((d) => !busy.has(dockKey(d)))
}

// ---------------------------------------------------------------- Dock wall
function bayProgress(e, now) {
  const st = currentStage(e)
  if (!st) return null
  const at = st.key === 'checkout' ? 3 : DOCK_STEPS.findIndex((s) => s.key === st.key)
  const stage = STAGES[st.key]
  const minutes = (now - st.since) / MIN
  const fill = DOCK_STEPS.map((_, i) => (i < at ? 1 : i === at ? Math.min(1, minutes / stage.max) : 0))
  const name = st.recheck ? 'Re-check' : st.key === 'checkout' ? (isReleased(e) ? 'Released, leaving' : 'Passed, waiting for release') : stage.label
  return { fill, name, time: duration(now - st.since), tone: toneOf(minutes, stage) }
}

// `plan` (lineup.jsx): each dock's next truck in the line-up and when a busy dock should be free.
// `picking`: a truck sent from Records to get a dock; every open dock offers it, until it has one.
export function DockWall({ entries, now, plan, picking, onCancelPick, onView, onAssignDock }) {
  const busy = occupiedDocks(entries)
  const open = DOCKS.filter((d) => !busy.has(dockKey(d)))
  return (
    <section aria-labelledby="dock-wall-title" className="on-chrome grid gap-4 rounded-2xl bg-chrome px-5 pt-4 pb-5 text-white shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h3 id="dock-wall-title" className="font-display text-[19px] font-bold">
          The docks
        </h3>
        <span className="text-[14px] text-rail-text">
          {DOCKS.length - open.length} of {DOCKS.length} busy
        </span>
        <ul className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-rail-text" aria-label="Step colours">
          {DOCK_STEPS.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-4 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      {picking && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-panel px-4 py-2.5 text-ink shadow-card animate-pop">
          <Icon name="dock" size={20} className="text-signal" />
          <b className="text-[15px]">
            {open.length
              ? `Pick a dock for trailer ${picking.trailerNumber}`
              : `Every dock is busy. Trailer ${picking.trailerNumber} is number ${plan.rows.findIndex((r) => r.e.id === picking.id) + 1} in the line-up below.`}
          </b>
          <span className="text-[14px] text-muted">
            {entryCarrier(picking)}
            {picking.pickupNumber ? `, ${picking.pickupNumber}` : ''}
          </span>
          <button type="button" onClick={onCancelPick} className={ui.btnGhost + ' ml-auto'}>
            <Icon name="close" size={16} />
            Cancel
          </button>
        </div>
      )}
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {DOCKS.map((d) => {
          const e = busy.get(dockKey(d))
          const next = !e && picking ? picking : plan.next.get(dockKey(d))
          const freeIn = plan.freeIn.get(dockKey(d))
          const p = e && bayProgress(e, now)
          return (
            <li key={d} className="grid content-start gap-2">
              <span className="text-center font-display text-[34px] leading-none font-bold text-white/85" aria-hidden="true">
                {d}
              </span>
              {e ? (
                <button
                  type="button"
                  onClick={() => onView(e.id)}
                  aria-label={`Dock ${d}: trailer ${e.trailerNumber}, ${entryCarrier(e)}, ${loadSummary(e)}${p ? `, ${p.name}, ${p.time}` : ''}${freeIn ? `, free in about ${estimate(freeIn)}` : ''}${next ? `, next ${next.trailerNumber}` : ''}. Open the entry.`}
                  className="grid min-h-[150px] cursor-pointer content-start gap-1.5 rounded-xl bg-panel px-3 py-2.5 text-left text-ink shadow-card transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <b className="truncate font-display text-[17px] leading-tight">{e.trailerNumber}</b>
                  <span className="truncate text-[13px] text-muted">{entryCarrier(e)}</span>
                  <span className="truncate text-[13px] font-semibold text-ink">{palletLine(e)}</span>
                  {productLine(e) && (
                    <span className="line-clamp-2 text-[12.5px] leading-snug text-ink" title={productLine(e)}>
                      {productLine(e)}
                    </span>
                  )}
                  {p && (
                    <>
                      <span className="mt-1 grid grid-cols-3 gap-1" aria-hidden="true">
                        {p.fill.map((f, i) => (
                          <span key={i} className="h-1.5 overflow-hidden rounded-full bg-field">
                            <span className="block h-full rounded-full" style={{ width: `${f * 100}%`, background: DOCK_STEPS[i].color }} />
                          </span>
                        ))}
                      </span>
                      <span className="text-[13px] font-semibold">{p.name}</span>
                      <span className={'text-[13px] font-semibold tabular-nums ' + TONE_TEXT[p.tone]}>{p.time} in this step</span>
                    </>
                  )}
                  {freeIn && (
                    <span className="mt-1 grid gap-0.5 border-t border-hair pt-1.5 text-[13px] leading-snug">
                      <span className="text-muted tabular-nums">Free in about {estimate(freeIn)}</span>
                      {next && <b className="truncate text-signal">Next: {next.trailerNumber}</b>}
                    </span>
                  )}
                </button>
              ) : (
                <div className="grid min-h-[150px] content-center justify-items-center gap-2 rounded-xl border-2 border-dashed border-white/35 px-2 py-3 text-center">
                  <span className="font-display text-[16px] font-bold">Open</span>
                  {next && (
                    <button
                      type="button"
                      onClick={() => onAssignDock(next.id, d)}
                      className="min-h-11 cursor-pointer rounded-[10px] bg-panel px-3 text-[14px] font-bold text-ink shadow-card transition-colors duration-150 hover:bg-signal-tint"
                    >
                      Assign {next.trailerNumber}
                    </button>
                  )}
                </div>
              )}
              <span className="sr-only">Dock {d}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------- Action required
// Everything waiting on Shipping, most urgent first. `calls`: { [bookingId]: ms } (when the carrier was
// called). Each row: { key, kind, tone, rank, sort, ... }. `info` rows are shown but not counted.
export function needsYou({ entries, schedule, now, calls = {} }) {
  const rows = []
  const free = freeDocks(entries)
  // a. Booked trucks 15+ min late, or no-shows.
  for (const a of schedule) {
    if (a.entryId) continue
    const s = bookingState(a, now)
    if (s.key !== 'late') continue
    const past = now - a.ms
    rows.push({ key: 'late-' + a.id, kind: 'late', tone: 'bad', rank: calls[a.id] ? 1 : 0, sort: -past, a, past, noShow: past > NO_SHOW_MIN * MIN, calledAt: calls[a.id] })
  }
  const onSite = entries.filter((e) => !e.timeOut)
  for (const e of onSite) {
    // b. Here, order not ready.
    if (!e.dockDoor && !inYard(e) && !e.orderReadyAt) {
      const wait = now - checkedInAt(e)
      rows.push({ key: 'order-' + e.id, kind: 'order', tone: wait > ORDER_MAX * MIN ? 'bad' : 'warn', rank: isDrop(e) ? 6 : 3, sort: -wait, e, wait })
    }
    // c. Order ready, no dock, and a dock is free (while every dock is busy the truck waits in the line-up).
    if (!e.dockDoor && !inYard(e) && e.orderReadyAt && free.length) rows.push({ key: 'dock-' + e.id, kind: 'dock', tone: 'warn', rank: free.length ? 2 : 4, sort: e.orderReadyAt, e, free })
    // d. Long stay with no reason.
    if (!isDrop(e) && !e.delayReason && now - arrivalMs(e) > ASK_AFTER_MIN * MIN)
      rows.push({ key: 'why-' + e.id, kind: 'why', tone: 'warn', rank: 5, sort: arrivalMs(e), e, suggestion: suggestReason(e, now) })
    // f. Passed, not released past the target (the inspector's job; for information).
    if (awaitingRelease(e) && now - inspectionSavedAt(e) > RELEASE_MAX * MIN)
      rows.push({ key: 'release-' + e.id, kind: 'release', tone: 'info', info: true, rank: 7, sort: inspectionSavedAt(e), e, wait: now - inspectionSavedAt(e) })
  }
  // e. Due within the hour, order not staged.
  for (const a of schedule) if (needsStaging(a, null, now) && !a.entryId && a.ms >= now - 15 * MIN) rows.push({ key: 'stage-' + a.id, kind: 'stage', tone: 'act', rank: 5.5, sort: a.ms, a })
  return rows.sort((x, y) => x.rank - y.rank || x.sort - y.sort)
}

const lineCls = 'text-[14px] text-muted'

function NeedRow({ r, first, now, onCall, onOrderReady, onAssignDock, onDelayReason, onStage, onView }) {
  const main = first ? ui.btnSmallPrimary : ui.btnSmall
  let title, line, actions
  if (r.kind === 'late') {
    const c = contactFor(r.a)
    const who = carrierOf(r.a)
    title = r.noShow ? `${who} is a no-show for ${r.a.orderNo}, ${duration(r.past)} past the slot` : `${who} is ${duration(r.past)} late for ${r.a.orderNo}`
    line = `Booked ${clock12(r.a.time)}, ${r.a.customer}, ${r.a.pallets} pallets, ${c.name} ${c.phone}`
    actions = (
      <>
        {r.calledAt && (
          <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-ok">
            <Icon name="check" size={16} />
            Called {clockTime(r.calledAt)}
          </span>
        )}
        <a href={`tel:${c.phone.replace(/\D/g, '')}`} onClick={() => onCall(r.a.id)} className={r.calledAt ? ui.btnSmall : main}>
          <Icon name="phone" size={18} />
          {r.calledAt ? 'Call again' : r.a.carrier === 'Pickup' ? 'Call customer' : 'Call carrier'}
        </a>
      </>
    )
  } else if (r.kind === 'order') {
    title = `Order ${r.e.pickupNumber || '(no order no.)'} isn't ready, trailer ${r.e.trailerNumber} is waiting`
    line = (
      <>
        {entryCarrier(r.e)}
        {r.e.customerPickupFor && r.e.truckName !== 'Pickup' ? `, ${r.e.customerPickupFor}` : ''}
        {isDrop(r.e) ? ', drop trailer' : ''}. <span className="tabular-nums">Waiting {duration(r.wait)}</span>
      </>
    )
    actions = (
      <button type="button" onClick={() => onOrderReady(r.e.id)} className={main}>
        <Icon name="done" size={18} />
        Order ready
      </button>
    )
  } else if (r.kind === 'dock') {
    title = `Trailer ${r.e.trailerNumber} is ready for a dock`
    line = `${entryCarrier(r.e)}${r.e.pickupNumber ? `, ${r.e.pickupNumber}` : ''}. Order ready ${duration(now - r.e.orderReadyAt)} ago`
    actions = r.free.length ? (
      r.free.slice(0, 4).map((d, i) => (
        <button key={d} type="button" onClick={() => onAssignDock(r.e.id, d)} className={i === 0 ? main : ui.btnSmall} aria-label={`Assign trailer ${r.e.trailerNumber} to Dock ${d}`}>
          Dock {d}
        </button>
      ))
    ) : (
      <span className="text-[14px] text-muted">No dock free yet</span>
    )
  } else if (r.kind === 'why') {
    const sug = r.suggestion?.reason
    title = `Why is trailer ${r.e.trailerNumber} still here?`
    line = `${entryCarrier(r.e)}, on site ${duration(now - arrivalMs(r.e))}.${r.suggestion ? ` ${sug.label.replace(/ \(carrier's side\)/, '')} looks like the cause.` : ''}`
    actions = (
      <>
        {sug && (
          <button type="button" onClick={() => onDelayReason(r.e.id, sug.id)} className={main}>
            {sug.label}
          </button>
        )}
        <label className="sr-only" htmlFor={`why-${r.e.id}`}>
          Other reason for trailer {r.e.trailerNumber}
        </label>
        <select
          id={`why-${r.e.id}`}
          value=""
          onChange={(ev) => ev.target.value && onDelayReason(r.e.id, ev.target.value)}
          className="min-h-11 max-w-[190px] cursor-pointer rounded-[10px] border-[1.5px] border-line bg-panel px-2.5 text-[14px] font-semibold text-ink hover:border-signal-bright"
        >
          <option value="" disabled>
            Other reason…
          </option>
          {REASONS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </>
    )
  } else if (r.kind === 'stage') {
    title = `Stage ${r.a.orderNo} for ${carrierOf(r.a)}, due ${r.a.ms > now ? `in ${duration(r.a.ms - now)}` : 'now'}`
    line = `Booked ${clock12(r.a.time)}, ${r.a.customer}, ${r.a.kind} ${r.a.pallets} pallets`
    actions = (
      <button type="button" onClick={() => onStage(r.a)} className={main} aria-label={`Mark ${r.a.orderNo} staged`}>
        <Icon name="done" size={18} />
        Mark staged
      </button>
    )
  } else {
    title = `Trailer ${r.e.trailerNumber} passed inspection ${duration(r.wait)} ago and isn't released`
    line = 'For information: only the inspector can release it.'
    actions = (
      <button type="button" onClick={() => onView(r.e.id)} className={ui.btnGhost}>
        View entry
      </button>
    )
  }
  return (
    <li className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 py-3.5 sm:grid-cols-[12px_minmax(0,1fr)_auto] sm:items-center">
      <i className={'mt-1.5 inline-block size-2.5 self-start rounded-full sm:mt-0 sm:self-center ' + DOT[r.tone]} aria-hidden="true" />
      <div className="min-w-0">
        {first && <span className="block text-[13px] font-bold text-signal">Do this next</span>}
        <b className="block text-[15.5px] leading-snug">{title}</b>
        <span className={lineCls}>{line}</span>
      </div>
      <div className="col-start-2 mt-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:mt-0 sm:justify-end">{actions}</div>
    </li>
  )
}

// The card's urgency, matching the sidebar badge on Now: red when a booked truck is late, amber when
// other things need action, green when nothing does (information-only rows don't count).
const URGENCY = {
  bad: { icon: 'alert', chip: 'bg-danger text-white', pill: 'bg-danger text-white', line: 'bg-danger' },
  warn: { icon: 'alert', chip: 'bg-warn-edge text-white', pill: 'bg-warn text-warn-ink', line: 'bg-warn-edge' },
  ok: { icon: 'done', chip: 'bg-ok-soft text-ok', pill: '', line: '' },
}

export function NeedsYou({ rows, ...handlers }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, 6)
  const todo = rows.filter((r) => !r.info).length
  const level = !todo ? 'ok' : rows.some((r) => r.kind === 'late') ? 'bad' : 'warn'
  const u = URGENCY[level]
  return (
    <section aria-labelledby="action-title" className={ui.card + ' min-w-0 overflow-hidden'}>
      {u.line && <span className={'block h-1 ' + u.line} aria-hidden="true" />}
      <div className="px-5 pt-4 pb-2">
      <h3 id="action-title" className="flex items-center gap-2.5 font-display text-[19px] font-bold">
        <span className={'grid size-9 shrink-0 place-items-center rounded-[10px] ' + u.chip} aria-hidden="true">
          <Icon name={u.icon} size={20} />
        </span>
        Action required
        {todo > 0 && (
          <span className={'inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 font-body text-[14px] font-bold tabular-nums ' + u.pill}>
            {todo}
            <span className="sr-only"> {todo === 1 ? 'thing needs' : 'things need'} action{level === 'bad' ? ', a booked truck is late' : ''}</span>
          </span>
        )}
      </h3>
      {rows.length ? (
        <>
          <ol className="divide-y divide-hair">
            {shown.map((r, i) => (
              <NeedRow key={r.key} r={r} first={i === 0} {...handlers} />
            ))}
          </ol>
          {rows.length > 6 && (
            <button type="button" onClick={() => setAll((v) => !v)} className={ui.btnGhost + ' -ml-3 mb-1'}>
              {all ? 'Show fewer' : `Show ${rows.length - 6} more`}
            </button>
          )}
        </>
      ) : (
        <p className="flex items-center gap-2 py-4 text-[15px] text-muted">
          <Icon name="done" size={18} className="text-ok" />
          No action required right now.
        </p>
      )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Coming up
export function ComingUp({ schedule, now, onStage, onOpenSchedule }) {
  const waiting = schedule.filter((a) => !a.entryId)
  const late = waiting.filter((a) => bookingState(a, now).key === 'late' && now - a.ms <= NO_SHOW_MIN * MIN)
  const next = waiting.filter((a) => bookingState(a, now).key !== 'late').slice(0, 6)
  const item = (a) => {
    const s = bookingState(a, now)
    return (
      <li key={a.id} className="relative grid gap-0.5 py-2.5 pl-5">
        <i className={'absolute top-4 left-[-5px] size-2.5 rounded-full ring-2 ring-panel ' + (s.key === 'late' ? 'bg-danger' : 'bg-signal')} aria-hidden="true" />
        <span className="flex items-baseline gap-2">
          <b className="font-display text-[15px] tabular-nums">{clock12(a.time)}</b>
          <span className={'text-[13px] font-semibold ' + s.cls}>{s.label}</span>
        </span>
        <span className="truncate text-[14px] font-semibold">{carrierOf(a)}</span>
        <span className="truncate text-[13px] text-muted">
          {a.orderNo}, {a.customer}
        </span>
        {a.staged ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ok">
            <Icon name="check" size={14} />
            Order staged
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            Order not staged
            <button type="button" onClick={() => onStage(a)} aria-label={`Mark ${a.orderNo} staged`} className={ui.btnGhost + ' -ml-1 px-2 text-[13px]'}>
              Mark staged
            </button>
          </span>
        )}
      </li>
    )
  }
  return (
    <section aria-labelledby="coming-up-title" className={ui.card + ' min-w-0 px-5 pt-4 pb-3'}>
      <div className="flex items-center justify-between gap-2">
        <h3 id="coming-up-title" className="font-display text-[19px] font-bold">
          Coming up
        </h3>
        <button type="button" onClick={onOpenSchedule} className={ui.btnGhost + ' -mr-3 text-[14px]'}>
          Full schedule
          <Icon name="chevron" size={16} />
        </button>
      </div>
      {late.length + next.length ? (
        <ol className="mt-1 ml-1.5 border-l-2 border-hair">
          {late.map(item)}
          <li className="relative -ml-px flex items-center gap-2 py-1.5 pl-4 text-[13px] font-bold text-signal" aria-label={`Now, ${clockTime(now)}`}>
            <i className="absolute left-[-6px] h-0.5 w-3 bg-signal" aria-hidden="true" />
            Now, {clockTime(now)}
            <span className="h-px flex-1 bg-signal/40" aria-hidden="true" />
          </li>
          {next.map(item)}
        </ol>
      ) : (
        <p className="py-3 text-[14px] text-muted">No bookings for today yet.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Everyone on site
const GROUPS = [
  { key: 'wait', label: 'Waiting', color: 'var(--color-yard-wait)', test: (e) => !e.dockDoor && !inYard(e) },
  { key: 'dock', label: 'At the docks', color: 'var(--color-yard-load)', test: atDockNow },
  { key: 'yard', label: 'Loaded in the yard', color: 'var(--color-yard-ready)', test: inYard },
]
const SCALE = 4 * HOUR

function StayRow({ e, now, onView }) {
  const stay = now - arrivalMs(e)
  const drop = isDrop(e)
  const over = !drop && detentionState(e, now)?.level === 'over'
  const freeEnd = detentionClockStart(e) + FREE_MS - arrivalMs(e)
  const pct = (ms) => `${Math.max(0, Math.min(1, ms / SCALE)) * 100}%`
  return (
    <li>
      <button
        type="button"
        onClick={() => onView(e.id)}
        className="grid min-h-11 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-signal-tint"
      >
        <span className="truncate text-[14px]">
          <b>{e.trailerNumber}</b> <span className="text-muted">{entryCarrier(e)}</span>
        </span>
        <span className={'text-[13px] font-semibold tabular-nums ' + (over ? 'text-danger' : 'text-muted')}>{duration(stay)}</span>
        <span className="relative col-span-2 h-2 rounded-full bg-field" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(stay), background: drop ? 'var(--color-line)' : 'var(--color-chart-live)' }} />
          {over && <span className="absolute inset-y-0 rounded-r-full bg-danger" style={{ left: pct(freeEnd), width: `calc(${pct(stay)} - ${pct(freeEnd)})` }} />}
          <span className="absolute -inset-y-1 left-1/2 border-l-2 border-dashed border-muted" />
        </span>
      </button>
    </li>
  )
}

export function EveryoneOnSite({ entries, now, onView }) {
  const [open, setOpen] = useState(false)
  const onSite = entries.filter((e) => !e.timeOut)
  const groups = GROUPS.map((g) => ({ ...g, list: onSite.filter(g.test).sort((a, b) => arrivalMs(a) - arrivalMs(b)) }))
  const over = onSite.filter((e) => detentionState(e, now)?.level === 'over').length
  return (
    <section className={ui.card + ' min-w-0 overflow-hidden'}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="everyone-on-site"
        onClick={() => setOpen((v) => !v)}
        className="grid w-full cursor-pointer gap-2.5 px-5 py-4 text-left transition-colors duration-150 hover:bg-signal-tint"
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Icon name="chevron" size={18} className={'text-signal transition-transform duration-150 ' + (open ? 'rotate-90' : '')} />
          <b className="font-display text-[18px]">Everyone on site: {onSite.length} truck{onSite.length === 1 ? '' : 's'}</b>
          {over > 0 && <span className="text-[14px] font-bold text-danger">{over} over 2 hours</span>}
        </span>
        <span className="flex h-3 overflow-hidden rounded-full bg-field" aria-hidden="true">
          {groups.map((g) => (
            <span key={g.key} style={{ flexGrow: g.list.length, background: g.color }} />
          ))}
        </span>
        <span className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
          {groups.map((g) => (
            <span key={g.key} className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: g.color }} aria-hidden="true" />
              {g.label} <b className="tabular-nums">{g.list.length}</b>
            </span>
          ))}
        </span>
      </button>
      {open && (
        <div id="everyone-on-site" className="grid gap-4 border-t border-hair px-5 pt-4 pb-5">
          <div className="grid gap-5 md:grid-cols-3">
            {groups.map((g) => (
              <div key={g.key} className="min-w-0">
                <h4 className="mb-1 flex items-center gap-2 text-[14px] font-bold">
                  <i className="inline-block size-2.5 rounded-[3px]" style={{ background: g.color }} aria-hidden="true" />
                  {g.label}, {g.list.length}
                </h4>
                {g.list.length ? (
                  <ul className="grid gap-0.5">
                    {g.list.map((e) => (
                      <StayRow key={e.id} e={e} now={now} onView={onView} />
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 text-[14px] text-muted">None.</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[13px] text-muted">
            Each bar is how long a truck has been on site. The dashed line is the 2 free hours, and red is time past it that carriers can charge for. Drop trailers stay grey because no driver is waiting. The longest stays
            are at the top.
          </p>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- The section
export function NowSection({ entries, schedule, now, calls, onCall, onStage, onView, onAssignDock, onOrderReady, onDelayReason, onOpenSchedule, rows, plan, picking, onCancelPick, onMoveUp, sampleLoaded, onFillDocks }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <DaySummary entries={entries} schedule={schedule} now={now} />
      <DockWall entries={entries} now={now} plan={plan} picking={picking} onCancelPick={onCancelPick} onView={onView} onAssignDock={onAssignDock} />
      <LineUp entries={entries} plan={plan} now={now} onAssignDock={onAssignDock} onMoveUp={onMoveUp} sampleLoaded={sampleLoaded} onFillDocks={onFillDocks} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <NeedsYou rows={rows} now={now} onCall={onCall} onOrderReady={onOrderReady} onAssignDock={onAssignDock} onDelayReason={onDelayReason} onStage={onStage} onView={onView} calls={calls} />
        <ComingUp schedule={schedule} now={now} onStage={onStage} onOpenSchedule={onOpenSchedule} />
      </div>
      <EveryoneOnSite entries={entries} now={now} onView={onView} />
    </div>
  )
}
