// Detention state of a truck still on site, shared by the Shipping page's tables, cards and summary.
// The rule is METRICS.md's (turnaround/targets.js): the free-time clock starts at the later of the
// appointment and the arrival; 2 h free, then $75/h; trucks more than 15 min late aren't charged.
// Dropped trailers have no driver waiting, so they never count.
import { arrivalMs, duration, minutesLate } from './time'
import { isDrop } from './metrics'
import { DETENTION_WARN_MIN } from './yard'
import { DETENTION } from './turnaround/targets'

const MIN = 60000

// When the free-time clock starts for this visit.
export const detentionClockStart = (e) => {
  const arrived = arrivalMs(e)
  const late = minutesLate(e)
  return late != null && late < 0 ? arrived - late * MIN : arrived
}

// { level: 'over' | 'near', fee, text } or null when the truck is fine, gone, a drop, or arrived more
// than 15 min late (not chargeable).
export function detentionState(e, now) {
  if (e.timeOut || isDrop(e)) return null
  if ((minutesLate(e) ?? 0) > DETENTION.lateGraceMin) return null
  const ms = now - detentionClockStart(e)
  if (!Number.isFinite(ms)) return null
  if (ms > DETENTION.freeMin * MIN) {
    const fee = ((ms - DETENTION.freeMin * MIN) / (60 * MIN)) * DETENTION.ratePerHour
    return { level: 'over', fee, text: `⚠ Over ${DETENTION.freeMin / 60} h · est. $${Math.round(fee)}` }
  }
  if (ms > DETENTION_WARN_MIN * MIN) {
    return { level: 'near', fee: 0, text: `Near free time · ${duration(DETENTION.freeMin * MIN - ms)} left` }
  }
  return null
}

// Pill colors by level, used with ui.tag; the words carry the meaning.
export const DETENTION_TAG = { over: 'bg-danger-soft text-danger', near: 'bg-warn-soft text-ink' }

// Any truck or trailer at a dock (pickup, delivery or drop) that still needs its inspection: none
// saved yet, or the last one failed (so it needs re-checking).
export const needsInspection = (e) => !e.timeOut && !!e.dockDoor && e.loadingInspection?.result !== 'Pass'
