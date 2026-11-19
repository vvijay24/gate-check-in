// One row per truck for the management Overview, built from the app's own calculations: stage times from
// stages.js, the waiting-charge rule from detention.js, the release from handoff.js and the delay reason
// from delayReasons.js. Durations are minutes; null when the truck hasn't reached that point.
import { arrivalMs, minutesLate } from '../time'
import { isDrop } from '../metrics'
import { checkedInAt, inspectionSavedAt } from '../stages'
import { detentionClockStart } from '../detention'
import { DETENTION, ON_TIME_WINDOW } from './targets'

const MIN = 60000

// ASSUME: every one of these is to confirm with the client.
export const ASSUME = {
  slotMin: 60, // an appointment slot is an hour long
  dockHours: [5, 21], // docks work 5 AM to 9 PM
  yardSpaces: 10, // parking spaces in the yard
  freeHours: DETENTION.freeMin / 60, // 2 hours free before waiting charges
  ratePerHour: DETENTION.ratePerHour, // $75 an hour after that
  passTarget: 0.95, // loads passing inspection the first time
  yardFullWarn: 0.85, // warn when the yard is this full
  onTimeTarget: 0.8, // booked trucks arriving within the window
  stagedTarget: 0.8, // orders staged before the truck's slot
}

const mins = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / MIN : null)
const leftAt = (e) => e.checkedOutAt ?? (e.timeOut && e.dateOut ? new Date(`${e.dateOut}T${e.timeOut}`).getTime() : e.timeOut ? new Date(`${e.dateIn}T${e.timeOut}`).getTime() : null)

export function truckRows(entries, now = Date.now()) {
  return entries
    .filter((e) => Number.isFinite(arrivalMs(e)))
    .map((e) => {
      const arrived = arrivalMs(e)
      const left = leftAt(e)
      const drop = isDrop(e)
      const checkedIn = checkedInAt(e)
      // Older visits without an "Order ready" time count the order as ready at check-in.
      const ready = e.orderReadyAt ?? (e.dockAssignedAt ? checkedIn : null)
      const inspected = inspectionSavedAt(e) ?? null
      const passedAt = e.loadingInspection?.result === 'Pass' ? inspected : null
      // Waiting charges by detention.js's rule: the clock starts at the later of booking and arrival, 2 h
      // free, nothing for trucks more than 15 min late, nothing for drop trailers.
      const late = minutesLate(e)
      const end = left ?? now
      const onClock = (end - detentionClockStart(e)) / MIN
      const chargeable = !drop && !((late ?? 0) > DETENTION.lateGraceMin)
      const detentionHours = chargeable ? Math.max(0, onClock - DETENTION.freeMin) / 60 : 0
      const appt = e.appointmentTime ? new Date(`${e.dateIn}T${e.appointmentTime}`).getTime() : null
      return {
        id: e.id,
        e,
        day: e.dateIn,
        carrier: e.truckName === 'Pickup' && e.customerPickupFor ? `${e.customerPickupFor} (own truck)` : e.truckName || 'Not given',
        customer: e.customerPickupFor || 'Not given',
        kind: e.loadSheet?.kind ?? null,
        type: drop ? 'Drop trailer' : 'Pickup',
        drop,
        done: left != null,
        arrived,
        left,
        appt,
        // From arriving at the gate to leaving (or now, while still here).
        turn: mins(arrived, end),
        // Arriving to a dock assigned, split into waiting for the order and then for a free dock.
        yardWait: mins(arrived, e.dockAssignedAt),
        orderWait: ready != null ? mins(checkedIn, ready) : null,
        dockWait: ready != null ? mins(ready, e.dockAssignedAt) : null,
        preload: mins(e.dockAssignedAt, e.loadStartedAt),
        load: mins(e.loadStartedAt, e.loadFinishedAt),
        inspect: mins(e.loadFinishedAt, inspected),
        // Passed inspection to leaving the gate.
        paperwork: left != null ? mins(passedAt, left) : null,
        detentionHours,
        arrival: late == null ? 'No appointment' : Math.abs(late) <= ON_TIME_WINDOW ? 'On time' : late > 0 ? 'Late' : 'Early',
        lateMin: late,
        firstPass: e.loadingInspection ? e.loadingInspection.result === 'Pass' && !e.loadingInspection.correctiveAction : null,
        rechecked: !!e.loadingInspection && (e.loadingInspection.result !== 'Pass' || !!e.loadingInspection.correctiveAction),
        reason: e.delayReason?.id ?? null,
        orderReadyAt: e.orderReadyAt ?? null,
      }
    })
}
