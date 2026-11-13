// Figures for the Shipping page's sections (orders, docks, loading, inspection, drop trailers,
// customers, carriers, detention and the daily report), worked out from the gate entries.
import { LATE_GRACE_MIN, arrivalMs, dayKey, departureMs, minutesLate, shiftDate } from './time'
import { isDrop } from './metrics'
import { inYard, isReleased, awaitingRelease } from './handoff'
import { checkedInAt, inspectionSavedAt } from './stages'
import { detentionClockStart } from './detention'
import { DETENTION, STAGE_TARGETS } from './turnaround/targets'
import { yardStageAt } from './liveYard'

const MIN = 60000
const T = Object.fromEntries(STAGE_TARGETS.map((s) => [s.key, s]))
export const ORDER_WAIT_MAX = T.orderWait.max

export const average = (list) => {
  const v = list.filter((x) => Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
const gap = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null)

// When a visit left the site (or its dock, for a drop trailer released to the yard counts as still here).
export const leftAt = (e) => e.checkedOutAt ?? (e.timeOut ? departureMs(e) : null)

// Visits checked in on the last `days` days, today included.
export function visitsInDays(entries, days, now) {
  const from = shiftDate(dayKey(new Date(now)), -(days - 1))
  return entries.filter((e) => e.dateIn >= from && Number.isFinite(arrivalMs(e)))
}

// Check-in to "Order ready", ms (null when the order isn't ready yet or the visit is older).
export const orderWaitMs = (e) => (e.orderReadyAt ? gap(checkedInAt(e), e.orderReadyAt) : null)
export const orderLate = (e) => (orderWaitMs(e) ?? 0) > ORDER_WAIT_MAX * MIN

// Where an order stands, in the order the work moves.
export const ORDER_STATUSES = ['Waiting for order', 'Ready for a dock', 'Loading', 'Inspection', 'Released to gate', 'Released to yard', 'Shipped']
export function orderStatus(e) {
  if (e.timeOut) return 'Shipped'
  if (inYard(e)) return 'Released to yard'
  if (isReleased(e)) return 'Released to gate'
  if (awaitingRelease(e) || e.loadFinishedAt || e.loadingInspection) return 'Inspection'
  if (e.dockDoor) return 'Loading'
  return e.orderReadyAt ? 'Ready for a dock' : 'Waiting for order'
}

// Estimated detention ($) for a visit with a driver waiting: to now while on site, to departure after.
// Same rule as detention.js (2 h free from the later of appointment and arrival, then $75/h; more than
// 15 min late isn't charged).
export function detentionFee(e, now) {
  if (isDrop(e) || (minutesLate(e) ?? 0) > DETENTION.lateGraceMin) return 0
  const end = leftAt(e) ?? now
  const ms = end - detentionClockStart(e)
  return Number.isFinite(ms) && ms > DETENTION.freeMin * MIN ? ((ms - DETENTION.freeMin * MIN) / (60 * MIN)) * DETENTION.ratePerHour : 0
}

// Minutes on the free-time clock so far (on site) or in total (departed).
export const onClockMs = (e, now) => (leftAt(e) ?? now) - detentionClockStart(e)

// Gate to gate, ms, for a departed pickup.
export const gateToGateMs = (e) => (isDrop(e) ? null : gap(arrivalMs(e), leftAt(e)))

const onTime = (e) => {
  const late = minutesLate(e)
  return late == null ? null : late <= LATE_GRACE_MIN
}
const pct = (list) => {
  const v = list.filter((x) => x != null)
  return v.length ? v.filter(Boolean).length / v.length : null
}

// Groups by a typed name, ignoring case and spaces; each group keeps the first spelling seen.
function groupBy(items, nameOf) {
  const groups = new Map()
  for (const item of items) {
    const name = String(nameOf(item) ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!groups.has(key)) groups.set(key, { name, items: [] })
    groups.get(key).items.push(item)
  }
  return [...groups.values()]
}

// One row per customer: orders, pickups / drops, the wait for their orders and how their trucks turned.
export function customerRows(visits, now) {
  return groupBy(visits, (e) => e.customerPickupFor)
    .map(({ name, items }) => ({
      name,
      orders: items.length,
      pickups: items.filter((e) => !isDrop(e)).length,
      drops: items.filter(isDrop).length,
      avgOrderWaitMs: average(items.map(orderWaitMs)),
      lateOrders: items.filter(orderLate).length,
      avgG2gMs: average(items.map(gateToGateMs)),
      onTimePct: pct(items.filter((e) => !isDrop(e)).map(onTime)),
      onSite: items.filter((e) => !e.timeOut).length,
      fee: items.reduce((s, e) => s + detentionFee(e, now), 0),
    }))
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name))
}

// One row per carrier: visits, on-time arrival, gate to gate, detention, and gate to gate per day (trend).
export function carrierRows(visits, now, days) {
  const today = dayKey(new Date(now))
  const keys = Array.from({ length: Math.min(days, 14) }, (_, i) => shiftDate(today, -(Math.min(days, 14) - 1 - i)))
  return groupBy(visits, (e) => e.truckName)
    .map(({ name, items }) => {
      const live = items.filter((e) => !isDrop(e))
      return {
        name,
        visits: items.length,
        onTimePct: pct(live.map(onTime)),
        avgG2gMs: average(live.map(gateToGateMs)),
        overFree: live.filter((e) => detentionFee(e, now) > 0).length,
        fee: live.reduce((s, e) => s + detentionFee(e, now), 0),
        trend: keys.map((k) => average(live.filter((e) => e.dateIn === k).map(gateToGateMs))),
      }
    })
    .sort((a, b) => (a.avgG2gMs ?? Infinity) - (b.avgG2gMs ?? Infinity) || a.name.localeCompare(b.name))
}

// Every truck that was at a dock during the day: [{ e, dock, from, to, stage, now }] for the dock
// schedule. `stage` is the Live yard stage key it is in now (on site) or 'done'.
export function dockSchedule(entries, day, now) {
  const start = new Date(`${day}T00:00`).getTime()
  const end = start + 24 * 60 * MIN
  return entries
    .filter((e) => e.dockDoor && e.dockAssignedAt && e.dockAssignedAt < Math.min(end, now))
    .map((e) => {
      const off = inYard(e) ? e.release.releasedAt : leftAt(e)
      const to = Math.min(off ?? now, now, end)
      return { e, dock: String(e.dockDoor), from: Math.max(e.dockAssignedAt, start), to, stage: off && off <= now ? 'done' : yardStageAt(e, now) ?? 'done' }
    })
    .filter((b) => b.to > start && b.to > b.from)
}

// Loading and inspection times for visits checked in on `day`.
export const preloadMs = (e) => gap(e.dockAssignedAt, e.loadStartedAt)
export const loadMs = (e) => gap(e.loadStartedAt, e.loadFinishedAt)
export const inspectMs = (e) => gap(e.loadFinishedAt, inspectionSavedAt(e))
// A passed inspection that needed a re-check carries what was done about it.
export const passedFirstTime = (e) => e.loadingInspection?.result === 'Pass' && !e.loadingInspection.correctiveAction
export const recheckedLoad = (e) => (e.loadingInspection?.result === 'Pass' && !!e.loadingInspection.correctiveAction) || e.loadingInspection?.result === 'Fail'

// The day's figures for the daily report.
export function dayReport(entries, day, now) {
  const visits = entries.filter((e) => e.dateIn === day && Number.isFinite(arrivalMs(e)))
  const shipped = entries.filter((e) => e.timeOut && (e.dateOut || e.dateIn) === day)
  const inspected = entries.filter((e) => {
    const at = inspectionSavedAt(e)
    return at && dayKey(new Date(at)) === day
  })
  const stage = (key, get) => {
    const v = visits.map(get).filter((x) => x != null)
    const t = T[key]
    return { key, label: t.label, min: t.min, max: t.max, avg: average(v), within: v.length ? v.filter((x) => x <= t.max * MIN).length / v.length : null, n: v.length }
  }
  const exceptions = []
  for (const e of visits) {
    if (orderLate(e)) exceptions.push({ at: e.orderReadyAt, tone: 'warn', text: `${e.pickupNumber || e.trailerNumber} order ready ${Math.round(orderWaitMs(e) / MIN)} min after check-in` })
    if (e.trailerCheck?.correctiveAction || e.trailerCheck?.result === 'Fail')
      exceptions.push({ at: e.trailerCheck.savedAt, tone: 'bad', text: `${e.trailerNumber} trailer check failed${e.trailerCheck.correctiveAction ? ` · ${e.trailerCheck.correctiveAction}` : ''}` })
    if (recheckedLoad(e))
      exceptions.push({
        at: inspectionSavedAt(e),
        tone: 'bad',
        text: `${e.trailerNumber} load inspection failed${e.loadingInspection.correctiveAction ? ` · ${e.loadingInspection.correctiveAction}` : e.loadingInspection.issues?.[0] ? ` · ${e.loadingInspection.issues[0]}` : ''}`,
      })
    const fee = detentionFee(e, now)
    if (fee > 0) exceptions.push({ at: detentionClockStart(e) + DETENTION.freeMin * MIN, tone: 'bad', text: `${e.trailerNumber} (${e.truckName}) past ${DETENTION.freeMin / 60} h free time · est. $${Math.round(fee)}` })
    if (e.sealConfirmed === 'No') exceptions.push({ at: e.checkedOutAt, tone: 'bad', text: `${e.trailerNumber} seal at the gate didn't match${e.sealNote ? ` · ${e.sealNote}` : ''}` })
  }
  exceptions.sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  return {
    visits,
    shipped,
    pickups: shipped.filter((e) => !isDrop(e)).length,
    drops: shipped.filter(isDrop).length,
    avgG2gMs: average(shipped.map(gateToGateMs)),
    avgOrderWaitMs: average(visits.map(orderWaitMs)),
    lateOrders: visits.filter(orderLate).length,
    fee: visits.reduce((s, e) => s + detentionFee(e, now), 0),
    inspected: inspected.length,
    firstTime: inspected.filter(passedFirstTime).length,
    stages: [
      stage('orderWait', orderWaitMs),
      stage('dockAssign', (e) => (e.orderReadyAt ? gap(e.orderReadyAt, e.dockAssignedAt) : null)),
      stage('preload', preloadMs),
      stage('load', loadMs),
      stage('inspection', inspectMs),
      stage('checkout', (e) => gap(inspectionSavedAt(e), leftAt(e))),
    ],
    exceptions,
    customers: customerRows(visits, now).slice(0, 5),
  }
}
