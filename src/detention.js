// Detention state of a truck still on site, shared by the Shipping page's tables, cards and summary.
// Free time runs from check-in; dropped trailers have no driver waiting, so they never count.
import { arrivalMs, duration } from './time'
import { isDrop } from './metrics'
import { DETENTION_FREE_MIN, DETENTION_RATE_PER_HOUR, DETENTION_WARN_MIN } from './yard'

const MIN = 60000

// { level: 'over' | 'near', fee, text } or null when the truck is fine, gone, or a drop.
export function detentionState(e, now) {
  if (e.timeOut || isDrop(e)) return null
  const ms = now - arrivalMs(e)
  if (!Number.isFinite(ms)) return null
  if (ms > DETENTION_FREE_MIN * MIN) {
    const fee = ((ms - DETENTION_FREE_MIN * MIN) / (60 * MIN)) * DETENTION_RATE_PER_HOUR
    return { level: 'over', fee, text: `⚠ Over ${DETENTION_FREE_MIN / 60} h · est. $${Math.round(fee)}` }
  }
  if (ms > DETENTION_WARN_MIN * MIN) {
    return { level: 'near', fee: 0, text: `Near free time · ${duration(DETENTION_FREE_MIN * MIN - ms)} left` }
  }
  return null
}

// Pill colors by level, used with ui.tag; the words carry the meaning.
export const DETENTION_TAG = { over: 'bg-danger-soft text-danger', near: 'bg-signal text-signal-ink' }

// Any truck or trailer at a dock (pickup, delivery or drop) that still needs its inspection: none
// saved yet, or the last one failed (so it needs re-checking).
export const needsInspection = (e) => !e.timeOut && !!e.dockDoor && e.loadingInspection?.result !== 'Pass'
