// The stages a visit goes through, with their targets from turnaround/targets.js (METRICS.md), and where
// an on-site truck is right now. Used by the timers on Shipping and Loading & Inspection.
import { arrivalMs } from './time'
import { isDrop } from './metrics'
import { awaitingRelease, inYard, isReleased } from './handoff'
import { STAGE_TARGETS } from './turnaround/targets'

const T = Object.fromEntries(STAGE_TARGETS.map((s) => [s.key, s]))

// `min`–`max`: the target window. A timer is green before `min`, amber inside the window and red past
// `max`. Each stage runs between two timestamps, as in METRICS.md.
export const STAGES = {
  checkIn: { ...T.gateIn, owner: 'Gate', from: 'truck arrived', to: 'check-in saved' },
  // A dock is only assigned once the order is ready, so the wait for a dock has two parts.
  orderWait: { ...T.orderWait, owner: 'Shipping', from: 'check-in saved', to: 'order ready' },
  dock: { ...T.dockAssign, label: 'Dock assignment', owner: 'Shipping', from: 'order ready', to: 'dock assigned' },
  preload: { ...T.preload, owner: 'Dock', from: 'dock assigned', to: 'loading started' },
  load: { ...T.load, label: 'Loading', owner: 'Dock', from: 'loading started', to: 'loading finished' },
  inspect: { ...T.inspection, owner: 'Dock / QA', from: 'loading finished', to: 'inspection saved' },
  checkout: { ...T.checkout, owner: 'Shipping and Gate', from: 'inspection saved', to: 'checked out' },
}

// 'ok' (green, before the window), 'window' (amber, inside it) or 'late' (red, past the limit).
export const toneOf = (minutes, stage) => (minutes > stage.max ? 'late' : minutes >= stage.min ? 'window' : 'ok')

// When the inspection was saved (the inspection's own date and time for older entries).
export const inspectionSavedAt = (e) => e.loadingInspection?.savedAt ?? e.loadingInspection?.inspectedAt

// When the check-in was saved (the typed Time In for entries from before saves were timed).
export const checkedInAt = (e) => e.createdAt ?? arrivalMs(e)

// The timed step an on-site truck is in and when it started, or null when nothing is being timed (a
// dropped trailer parked in the yard, before or after loading, or a truck that left). Without a dock a
// truck waits for its order, then (once Shipping marks it ready) for a dock. `key` is a STAGES key; `recheck` marks an
// inspection that failed and has to be done again. After a passed inspection the Gate checkout stage
// runs until the truck leaves, through the inspector's release.
export function currentStage(e) {
  if (e.timeOut) return null
  if (!e.dockDoor) {
    if (isDrop(e)) return null
    return e.orderReadyAt ? { key: 'dock', since: e.orderReadyAt } : { key: 'orderWait', since: checkedInAt(e) }
  }
  if (inYard(e)) return null
  if (awaitingRelease(e) || isReleased(e)) return { key: 'checkout', since: inspectionSavedAt(e) }
  if (e.loadingInspection?.result === 'Fail') return { key: 'inspect', since: inspectionSavedAt(e), recheck: true }
  if (!e.loadStartedAt) return { key: 'preload', since: e.dockAssignedAt }
  if (!e.loadFinishedAt) return { key: 'load', since: e.loadStartedAt }
  return { key: 'inspect', since: e.loadFinishedAt }
}

// The three steps at a dock, in order, for progress bars.
export const DOCK_STEPS = ['preload', 'load', 'inspect']
