// Where every truck on site was at any moment, for the Live yard on Shipping and Loading & Inspection:
// waiting for its order, ready for a dock (order ready, no dock yet), loading (pre-loading and loading), inspection (loaded, being checked or re-checked), or ready to
// leave (passed, waiting for the inspector's release or the gate). Dropped trailers parked in the yard have no
// driver waiting, so they only count while they're at a dock (not before, nor once released to the yard).
import { arrivalMs, departureMs } from './time'
import { isDrop } from './metrics'
import { inspectionSavedAt } from './stages'
import { inYard } from './handoff'

const MIN = 60000

export const YARD_STAGES = [
  { key: 'order', label: 'Waiting for order', note: 'Shipping marks the order ready', color: 'var(--color-yard-order)' },
  { key: 'wait', label: 'Ready for a dock', note: 'Order ready; Shipping assigns a dock', color: 'var(--color-yard-wait)' },
  { key: 'load', label: 'Loading', note: 'Trailer check and loading', color: 'var(--color-yard-load)' },
  { key: 'insp', label: 'Inspection', note: 'Loaded, being checked', color: 'var(--color-yard-insp)' },
  { key: 'ready', label: 'Ready to leave', note: 'Passed, waiting for release', color: 'var(--color-yard-ready)' },
]

const leftAt = (e) => e.checkedOutAt ?? (e.timeOut ? departureMs(e) : Infinity)

// The yard stage key of `e` at time `t` (ms), or null when it wasn't on site or isn't counted.
export function yardStageAt(e, t) {
  const arrived = arrivalMs(e)
  if (!Number.isFinite(arrived) || arrived > t || leftAt(e) <= t) return null
  const docked = e.dockAssignedAt != null && e.dockAssignedAt <= t
  if (isDrop(e) && !docked) return null
  if (inYard(e) && e.release.releasedAt <= t) return null
  if (!docked) return e.orderReadyAt != null && e.orderReadyAt <= t ? 'wait' : 'order'
  const insp = e.loadingInspection
  if (insp?.result === 'Pass' && inspectionSavedAt(e) <= t) return 'ready'
  if (e.loadFinishedAt != null && e.loadFinishedAt <= t) return 'insp'
  // Older visits without loading times: inspected (pass or fail) counts as inspection.
  if (e.loadFinishedAt == null && insp && inspectionSavedAt(e) <= t) return 'insp'
  return 'load'
}

// Counts per stage at time `t`: { order, wait, load, insp, ready }.
export function yardCounts(entries, t) {
  const c = { order: 0, wait: 0, load: 0, insp: 0, ready: 0 }
  for (const e of entries) {
    const k = yardStageAt(e, t)
    if (k) c[k]++
  }
  return c
}

// The last `hours` at every half hour, then now: [{ at, label, now, counts }].
export function yardHistory(entries, now, hours = 6) {
  const step = 30 * MIN
  const last = Math.floor(now / step) * step
  const points = []
  for (let t = last - (hours * 2 - 1) * step; t <= last; t += step) {
    const d = new Date(t)
    points.push({ at: t, label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, counts: yardCounts(entries, t) })
  }
  points.push({ at: now, label: 'Now', now: true, counts: yardCounts(entries, now) })
  return points
}
