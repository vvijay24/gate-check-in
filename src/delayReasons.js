// Why a truck stayed long. Shipping picks one reason for a visit that ran over, and it is saved on the
// entry as delayReason: { id, by, at }. `step` is the stage (a key in turnaround/targets.js) the reason
// belongs to, `owner` who can fix it, and `carrier` marks the ones on the carrier's side.
import { arrivalMs, departureMs } from './time'
import { isDrop } from './metrics'
import { checkedInAt, inspectionSavedAt } from './stages'
import { STAGE_TARGETS } from './turnaround/targets'

const MIN = 60000

export const REASONS = [
  { id: 'order', label: 'Order not ready', step: 'orderWait', owner: 'Shipping', carrier: false },
  { id: 'dock', label: 'No dock free', step: 'dockAssign', owner: 'Shipping', carrier: false },
  { id: 'precool', label: "Trailer not pre-cooled (carrier's side)", step: 'preload', owner: 'Carrier', carrier: true },
  { id: 'trailer', label: "Trailer failed check (carrier's side)", step: 'preload', owner: 'Carrier', carrier: true },
  { id: 'crew', label: 'Slow loading / short crew', step: 'load', owner: 'Dock crew', carrier: false },
  { id: 'temp', label: 'Product temperature', step: 'load', owner: 'Production', carrier: false },
  { id: 'qa', label: 'Waiting for QA / USDA', step: 'inspection', owner: 'QA', carrier: false },
  { id: 'inspection', label: 'Failed load inspection', step: 'inspection', owner: 'Dock crew', carrier: false },
  { id: 'paperwork', label: 'Paperwork / release', step: 'checkout', owner: 'Shipping', carrier: false },
  { id: 'driver', label: "Driver or carrier issue (carrier's side)", step: 'gateIn', owner: 'Carrier', carrier: true },
  { id: 'other', label: 'Other', step: null, owner: '—', carrier: false },
]
export const reasonById = (id) => REASONS.find((r) => r.id === id)

// Shipping is asked for a reason once a truck has been on site this long (minutes).
export const ASK_AFTER_MIN = 90

const T = Object.fromEntries(STAGE_TARGETS.map((s) => [s.key, s]))

// Minutes in each stage so far; the stage still running counts up to `now`.
function stageMinutes(e, now) {
  const end = (ms) => (Number.isFinite(ms) ? ms : now)
  const checkedIn = checkedInAt(e)
  const ready = Math.max(checkedIn, e.orderReadyAt ?? (e.dockAssignedAt ? checkedIn : now))
  const steps = [
    ['gateIn', arrivalMs(e), checkedIn],
    ['orderWait', checkedIn, ready],
    ['dockAssign', ready, e.dockAssignedAt],
    ['preload', e.dockAssignedAt, e.loadStartedAt],
    ['load', e.loadStartedAt, e.loadFinishedAt],
    ['inspection', e.loadFinishedAt, inspectionSavedAt(e)],
    ['checkout', inspectionSavedAt(e), e.checkedOutAt ?? (e.timeOut ? departureMs(e) : NaN)],
  ]
  const out = []
  for (const [key, from, to] of steps) {
    if (!Number.isFinite(from)) break
    out.push([key, (end(to) - from) / MIN])
    if (!Number.isFinite(to)) break
  }
  return out
}

// The step that ran furthest past the top of its target, as { step, overMin, reason }, or null when no
// step ran over. Within a step, a failed trailer check or load inspection picks that reason.
export function suggestReason(entry, now = Date.now()) {
  let best = null
  for (const [key, minutes] of stageMinutes(entry, now)) {
    const over = minutes - T[key].max
    if (over > 0 && (!best || over > best.overMin)) best = { step: key, overMin: Math.round(over) }
  }
  if (!best) return null
  const failedTrailer = entry.trailerCheck?.result === 'Fail' || !!entry.trailerCheck?.correctiveAction
  const failedLoad = entry.loadingInspection?.result === 'Fail' || !!entry.loadingInspection?.correctiveAction
  const id =
    best.step === 'preload' ? (failedTrailer ? 'trailer' : 'precool') : best.step === 'inspection' ? (failedLoad ? 'inspection' : 'qa') : REASONS.find((r) => r.step === best.step).id
  return { ...best, reason: reasonById(id) }
}

// SAMPLE: past sample pickups that stayed over 2 hours get the suggested reason, saved by Shipping when
// the truck left. Dropped trailers wait in the yard by design, so they don't get one.
export function addSampleReasons(entries) {
  for (const e of entries) {
    if (!e.sample || !e.timeOut || isDrop(e) || e.delayReason) continue
    const left = e.checkedOutAt ?? departureMs(e)
    if (!(left - arrivalMs(e) > 120 * MIN)) continue
    const s = suggestReason(e, left)
    e.delayReason = { id: s?.reason.id ?? 'other', by: 'Shipping', at: left }
  }
  return entries
}
