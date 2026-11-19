import * as ui from '../../ui'
import { Icon } from '../../icons'
import { clock12, duration } from '../../time'
import { DOCKS } from '../../yard'
import { inYard } from '../../handoff'
import { STAGES, currentStage } from '../../stages'
import { DETENTION_ICON, DETENTION_TAG, detentionState } from '../../detention'
import { palletLine, productLine } from '../../loadSheet'
import { dockKey, occupiedDocks } from '../AssignDock'

// Shipping → Now: the line-up for the docks. When every dock is busy, trucks whose order is ready wait in
// a numbered line: booked trucks by booked time, then trucks without a booking by when their order was
// ready. The clerk can move a truck up. Each truck is matched to the dock expected to free up first, from
// the stage timers, so the clerk can tell the driver which dock and roughly when.

const MIN = 60000
const mid = (k) => (STAGES[k].min + STAGES[k].max) / 2
// Typical minutes for each step a truck still has at its dock. The last one is waiting for the
// inspector's release and the Gate's check-out.
const STEP_MIN = { preload: mid('preload'), load: mid('load'), inspect: mid('inspect'), checkout: STAGES.checkout.max + mid('checkout') }
const STEPS = Object.keys(STEP_MIN)
// A whole truck at a dock, from dock assigned to leaving.
const TURN_MIN = STEPS.reduce((n, k) => n + STEP_MIN[k], 0)

const entryCarrier = (e) => (e.truckName === 'Pickup' && e.customerPickupFor ? `${e.customerPickupFor} (own truck)` : e.truckName || '—')
const bookedMs = (e) => (e.appointmentTime ? new Date(`${e.dateIn}T${e.appointmentTime}`).getTime() : NaN)
// An estimate in minutes as "35m", "1h 10m" or "1h" (no "0m").
export const estimate = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`)

// Roughly how many minutes until the truck at a dock leaves it: what's left of its step (at least a few
// minutes when the step is running long) plus the typical time of the steps after it. Rounded up to 5.
export function freeInMin(e, now) {
  const st = currentStage(e)
  const at = st ? STEPS.indexOf(st.key) : 0
  const since = st?.since ?? e.dockAssignedAt ?? now
  const left = Math.max(STEP_MIN[STEPS[Math.max(at, 0)]] - (now - since) / MIN, 3)
  const rest = STEPS.slice(Math.max(at, 0) + 1).reduce((n, k) => n + STEP_MIN[k], 0)
  return Math.max(5, Math.ceil((left + rest) / 5) * 5)
}

// The trucks waiting for a dock (order ready, no dock), in line order. `order` is the clerk's saved order
// (entry ids); trucks it doesn't list join the end in the usual order.
export function lineUp(entries, order = []) {
  const waiting = entries.filter((e) => !e.timeOut && !e.dockDoor && !inYard(e) && e.orderReadyAt)
  const usual = (a, b) => {
    const x = bookedMs(a)
    const y = bookedMs(b)
    if (Number.isFinite(x) !== Number.isFinite(y)) return Number.isFinite(x) ? -1 : 1
    return (Number.isFinite(x) ? x - y : 0) || a.orderReadyAt - b.orderReadyAt
  }
  const pos = (e) => {
    const i = order.indexOf(e.id)
    return i < 0 ? Infinity : i
  }
  return waiting.sort((a, b) => (pos(a) === pos(b) ? usual(a, b) : pos(a) - pos(b)))
}

// Each truck in the line with the dock it should get and in how many minutes (0: open now), and each
// dock's next truck: { rows: [{ e, n, dock, inMin }], next: Map(dockKey → entry), freeIn: Map(dockKey → min) }.
export function planDocks(entries, line, now) {
  const busy = occupiedDocks(entries)
  const docks = DOCKS.map((d) => {
    const e = busy.get(dockKey(d))
    return { d, at: e ? freeInMin(e, now) : 0 }
  })
  const freeIn = new Map(docks.filter((x) => x.at).map((x) => [dockKey(x.d), x.at]))
  const next = new Map()
  const rows = line.map((e, i) => {
    const slot = docks.reduce((best, x) => (x.at < best.at ? x : best))
    const row = { e, n: i + 1, dock: slot.d, inMin: slot.at }
    if (!next.has(dockKey(slot.d))) next.set(dockKey(slot.d), e)
    slot.at += TURN_MIN
    return row
  })
  return { rows, next, freeIn }
}

function LineRow({ r, now, onAssignDock, onMoveUp }) {
  const e = r.e
  const booked = bookedMs(e)
  const charge = detentionState(e, now)
  return (
    <li className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 py-3.5 sm:grid-cols-[48px_minmax(0,1fr)_auto]">
      <span className="grid size-12 place-items-center rounded-xl bg-chrome font-display text-[20px] font-bold text-white">
        <span className="sr-only">Number </span>
        {r.n}
      </span>
      <div className="min-w-0">
        <b className="block truncate text-[16px] leading-snug">
          {e.trailerNumber} <span className="font-normal text-muted">{entryCarrier(e)}</span>
        </b>
        <span className="block truncate text-[14px] text-ink">
          <b className="font-semibold">{palletLine(e)}</b>
          {productLine(e) && ` · ${productLine(e)}`}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted">
          <span>
            {Number.isFinite(booked) ? `Booked ${clock12(e.appointmentTime)}` : 'No booking'}, order ready {duration(now - e.orderReadyAt)} ago
          </span>
          {charge && (
            <span className={ui.tag + ' ' + DETENTION_TAG[charge.level]}>
              <Icon name={DETENTION_ICON[charge.level]} size={14} />
              {charge.text}
            </span>
          )}
        </span>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:justify-end">
        {r.inMin === 0 ? (
          <button type="button" onClick={() => onAssignDock(e.id, r.dock)} className={ui.btnSmallPrimary} aria-label={`Assign trailer ${e.trailerNumber} to Dock ${r.dock}`}>
            <Icon name="dock" size={18} />
            Assign Dock {r.dock}
          </button>
        ) : (
          <span className="grid text-right leading-tight">
            <b className="text-[15px]">Dock {r.dock}</b>
            <span className="text-[13px] text-muted tabular-nums">in about {estimate(r.inMin)}</span>
          </span>
        )}
        {r.n > 1 && (
          <button type="button" onClick={() => onMoveUp(e.id)} className={ui.btnSmall} aria-label={`Move trailer ${e.trailerNumber} up to number ${r.n - 1}`}>
            <Icon name="moveUp" size={18} />
            Move up
          </button>
        )}
      </div>
    </li>
  )
}

export function LineUp({ entries, plan, now, onAssignDock, onMoveUp, sampleLoaded, onFillDocks }) {
  const { rows } = plan
  const busy = occupiedDocks(entries).size
  const allBusy = busy >= DOCKS.length
  const soonest = rows.find((r) => r.inMin > 0)
  return (
    <section aria-labelledby="lineup-title" className={ui.card + ' min-w-0 px-5 pt-4 pb-2'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id="lineup-title" className="flex items-center gap-2.5 font-display text-[19px] font-bold">
          <span className="mg-chip mg-time grid size-9 shrink-0 place-items-center rounded-[10px]" aria-hidden="true">
            <Icon name="lineup" size={20} />
          </span>
          Waiting for a dock
          {rows.length > 0 && <span className="font-body text-[17px] font-semibold text-muted">({rows.length})</span>}
        </h3>
        {rows.length > 0 && (
          <p className="text-[14px] text-muted">
            {allBusy
              ? `All ${DOCKS.length} docks are busy.${soonest ? ` The first should be free in about ${estimate(soonest.inMin)}.` : ''}`
              : 'A dock is open for the first in line.'}
          </p>
        )}
      </div>
      {rows.length ? (
        <>
          <ol className="divide-y divide-hair">
            {rows.map((r) => (
              <LineRow key={r.e.id} r={r} now={now} onAssignDock={onAssignDock} onMoveUp={onMoveUp} />
            ))}
          </ol>
          <p className="border-t border-hair py-2.5 text-[13px] text-muted">
            Booked trucks go first, by booked time, then trucks without a booking, by when their order was ready. Times are estimates from each dock&apos;s step timers.
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
          <p className="flex items-center gap-2 text-[15px] text-muted">
            <Icon name="done" size={18} className="text-ok" />
            No trucks waiting for a dock. A truck joins the line when its order is ready and every dock is busy.
          </p>
          {sampleLoaded && (
            <button type="button" onClick={onFillDocks} className={ui.btnGhost}>
              Fill the docks (sample)
            </button>
          )}
        </div>
      )}
    </section>
  )
}
