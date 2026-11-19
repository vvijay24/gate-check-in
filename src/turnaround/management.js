// The management Overview's numbers: date presets and comparisons, filters, and every figure the cards,
// sections and deep dives show. Built on truckRows() (discovery.js), so it uses the app's own rules. The
// paper week (before digital) comes from the kit's computeVisitMetrics over the manual baseline week.
import { dayKey, shiftDate } from '../time'
import { STAGES } from '../stages'
import { reasonById } from '../delayReasons'
import { computeVisitMetrics } from './metrics'
import { DETENTION, DOCK_TARGET } from './targets'
import { ASSUME } from './discovery'

// Targets.
export const OUT_IN_2H_TARGET = 0.8 // 8 in 10 trucks out within their 2 free hours, so at most 20% over
export const WAIT_TARGET = STAGES.orderWait.max + STAGES.dock.max // 15 min for the order + 15 for a dock
export const LEAVE_TARGET = STAGES.checkout.max
export const PASS_TARGET = ASSUME.passTarget
export const ON_TIME_TARGET = ASSUME.onTimeTarget
export const STAGED_TARGET = ASSUME.stagedTarget
export const TURN_TARGET = DETENTION.freeMin
const FREE = DETENTION.freeMin

// ---------------------------------------------------------------- Dates
const d = (key) => new Date(`${key}T00:00`)
const monday = (key) => shiftDate(key, -((d(key).getDay() + 6) % 7))
const monthStart = (key) => `${key.slice(0, 8)}01`
const monthEnd = (key) => {
  const x = d(monthStart(key))
  x.setMonth(x.getMonth() + 1, 0)
  return dayKey(x)
}
const lastMonth = (key) => {
  const x = d(monthStart(key))
  x.setMonth(x.getMonth() - 1)
  return dayKey(x)
}

export const PRESETS = [
  { id: 'today', label: 'Today', range: (t) => ({ from: t, to: t }) },
  { id: 'yesterday', label: 'Yesterday', range: (t) => ({ from: shiftDate(t, -1), to: shiftDate(t, -1) }) },
  { id: 'week', label: 'This week', range: (t) => ({ from: monday(t), to: t }) },
  { id: 'lastweek', label: 'Last week', range: (t) => ({ from: shiftDate(monday(t), -7), to: shiftDate(monday(t), -1) }) },
  { id: '7', label: 'Last 7 days', range: (t) => ({ from: shiftDate(t, -6), to: t }) },
  { id: 'month', label: 'This month', range: (t) => ({ from: monthStart(t), to: t }) },
  { id: 'lastmonth', label: 'Last month', range: (t) => ({ from: lastMonth(t), to: monthEnd(lastMonth(t)) }) },
  { id: '30', label: 'Last 30 days', range: (t) => ({ from: shiftDate(t, -29), to: t }) },
]
export const DEFAULT_PRESET = '7'

export const COMPARE = [
  { id: 'prev', label: 'Period before' },
  { id: 'month', label: 'Same days last month' },
  { id: 'paper', label: 'Paper week (before digital)' },
]

export const daysIn = ({ from, to }) => Math.round((d(to) - d(from)) / 86400000) + 1
export const dayList = ({ from, to }) => Array.from({ length: daysIn({ from, to }) }, (_, i) => shiftDate(from, i))

// The range to compare with, or null for the paper week (which has its own rows).
export function compareRange(range, id) {
  if (id === 'paper') return null
  if (id === 'month') {
    const back = (key) => {
      const x = d(key)
      x.setMonth(x.getMonth() - 1)
      return dayKey(x)
    }
    return { from: back(range.from), to: back(range.to) }
  }
  const n = daysIn(range)
  return { from: shiftDate(range.from, -n), to: shiftDate(range.from, -1) }
}

const short = (key) => d(key).toLocaleDateString([], { month: 'short', day: 'numeric' })
// "Nov 12 - Nov 18", or one day.
export const fmtRange = (r) => (r ? (r.from === r.to ? short(r.from) : `${short(r.from)} - ${short(r.to)}`) : '')

// ---------------------------------------------------------------- Rows
export const chargeOf = (r) => (r.detentionHours ?? 0) * DETENTION.ratePerHour
export const isCarrierSide = (reasonId) => !!reasonById(reasonId)?.carrier
// Minutes the order was ready before the truck's slot (negative: after it), or null.
export const readyVsSlot = (r) => (r.appt != null && r.orderReadyAt != null ? (r.appt - r.orderReadyAt) / 60000 : null)

// `f`: { from, to, carrier, customer, kind }.
export const filterRows = (rows, f) =>
  rows.filter(
    (r) => (!f.from || r.day >= f.from) && (!f.to || r.day <= f.to) && (!f.carrier || r.carrier === f.carrier) && (!f.customer || r.customer === f.customer) && (!f.kind || r.kind === f.kind),
  )

const avg = (list) => {
  const v = list.filter((x) => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
const share = (part, whole) => (whole ? part / whole : null)

// The four parts of a visit, in order.
export const STEPS = [
  { key: 'order', label: 'Waiting for the order', color: 'var(--dive-s1)', target: STAGES.orderWait.max },
  { key: 'dock', label: 'Waiting for a free dock', color: 'var(--dive-s2)', target: STAGES.dock.max },
  { key: 'work', label: 'Working at the dock', color: 'var(--dive-s4)', target: DOCK_TARGET.max },
  { key: 'leave', label: 'Waiting to leave', color: 'var(--dive-s5)', target: LEAVE_TARGET },
]

const workOf = (r) => (r.preload != null && r.load != null && r.inspect != null ? r.preload + r.load + r.inspect : null)

// Everything the cards need for a set of rows over `days` days.
export function summarize(rows, days = 1) {
  const live = rows.filter((r) => !r.drop)
  const doneLive = live.filter((r) => r.done && r.turn != null)
  const booked = rows.filter((r) => r.arrival !== 'No appointment')
  const inspected = rows.filter((r) => r.firstPass != null)
  const withReady = booked.filter((r) => readyVsSlot(r) != null)
  const charged = rows.filter((r) => chargeOf(r) > 0)
  const disputable = charged.filter((r) => isCarrierSide(r.reason))
  const charges = rows.reduce((s, r) => s + chargeOf(r), 0)
  const timed = doneLive.filter((r) => r.orderWait != null && r.dockWait != null && workOf(r) != null && r.paperwork != null)
  return {
    trucks: rows.length,
    pickups: live.length,
    drops: rows.length - live.length,
    done: doneLive.length,
    overCount: doneLive.filter((r) => r.turn > FREE).length,
    over2h: share(doneLive.filter((r) => r.turn > FREE).length, doneLive.length),
    charges,
    perMonth: days ? (charges / days) * 30 : null,
    chargedCount: charged.length,
    avgTurn: avg(doneLive.map((r) => r.turn)),
    booked: booked.length,
    onTime: share(booked.filter((r) => r.arrival === 'On time').length, booked.length),
    lateCount: booked.filter((r) => r.arrival === 'Late').length,
    inspected: inspected.length,
    firstPass: share(inspected.filter((r) => r.firstPass).length, inspected.length),
    rechecked: inspected.filter((r) => !r.firstPass).length,
    // Timed pickups only: arriving to a dock assigned.
    waitDock: avg(live.map((r) => r.yardWait)),
    staged: share(withReady.filter((r) => readyVsSlot(r) >= 0).length, withReady.length),
    stagedOf: withReady.length,
    chargePerTruck: doneLive.length ? charges / doneLive.length : null,
    disputable: disputable.reduce((s, r) => s + chargeOf(r), 0),
    disputeCount: disputable.length,
    leave: avg(doneLive.map((r) => r.paperwork)),
    steps: {
      order: avg(timed.map((r) => r.orderWait)),
      dock: avg(timed.map((r) => r.dockWait)),
      work: avg(timed.map(workOf)),
      leave: avg(timed.map((r) => r.paperwork)),
    },
    timedCount: timed.length,
  }
}

// The paper week (before digital) on the same measures, from the manual baseline rows. What paper didn't
// record (staging, first-time pass, reasons) is null.
export function paperSummary(manualRows) {
  if (!manualRows?.length) return null
  const v = computeVisitMetrics(manualRows)
  const live = v.filter((x) => x.visit_type !== 'Drop trailer')
  const days = new Set(v.map((x) => x.day)).size || 1
  const charges = live.reduce((s, x) => s + x.detention_usd, 0)
  return {
    paper: true,
    trucks: v.length,
    pickups: live.length,
    done: live.length,
    overCount: live.filter((x) => x.g2g_min > FREE).length,
    over2h: share(live.filter((x) => x.g2g_min > FREE).length, live.length),
    charges,
    perMonth: (charges / days) * 30,
    chargedCount: live.filter((x) => x.detention_usd > 0).length,
    avgTurn: avg(live.map((x) => x.g2g_min)),
    booked: v.length,
    onTime: share(v.filter((x) => x.arrival_status === 'On time').length, v.length),
    firstPass: null,
    waitDock: avg(live.map((x) => x.dock_wait_min)),
    staged: null,
    chargePerTruck: live.length ? charges / live.length : null,
    disputable: null,
    leave: avg(live.map((x) => x.checkout_min)),
    steps: {
      order: avg(live.map((x) => x.order_wait_min)),
      dock: avg(live.map((x) => x.dock_assign_min)),
      work: avg(live.map((x) => x.dock_min)),
      leave: avg(live.map((x) => x.checkout_min)),
    },
    days,
    from: v.reduce((m, x) => (x.day < m ? x.day : m), v[0].day),
    to: v.reduce((m, x) => (x.day > m ? x.day : m), v[0].day),
  }
}

// Per day over a range: { day, ...summarize(that day's rows) }.
export const series = (rows, range) => dayList(range).map((day) => ({ day, ...summarize(rows.filter((r) => r.day === day), 1) }))

// Per carrier or customer (`key`), most trucks first.
export function byName(rows, key) {
  const groups = new Map()
  for (const r of rows) {
    if (!groups.has(r[key])) groups.set(r[key], [])
    groups.get(r[key]).push(r)
  }
  return [...groups].map(([name, list]) => ({ name, ...summarize(list, 1) })).sort((a, b) => b.trucks - a.trucks)
}

// Delay reasons given, with their charges, most charged first.
export function reasons(rows) {
  const m = new Map()
  for (const r of rows) {
    if (!r.reason) continue
    const x = m.get(r.reason) ?? { id: r.reason, label: reasonById(r.reason)?.label ?? r.reason, carrier: isCarrierSide(r.reason), count: 0, charges: 0 }
    x.count++
    x.charges += chargeOf(r)
    m.set(r.reason, x)
  }
  return [...m.values()].sort((a, b) => b.charges - a.charges || b.count - a.count)
}

// The step furthest past its target, or null.
export function worstStep(s) {
  let best = null
  for (const st of STEPS) {
    const v = s.steps?.[st.key]
    if (v == null) continue
    const over = (v - st.target) / st.target
    if (over > 0 && (!best || over > best.over)) best = { ...st, value: v, over }
  }
  return best
}

// What to fix first: each measure that misses its target, furthest off first. `dive`: the deep dive.
export function topIssues(s) {
  const out = []
  const add = (dive, off, title, line) => off > 0 && out.push({ dive, off, title, line })
  const pct = (v) => `${Math.round(v * 100)}%`
  if (s.over2h != null) add('turn', (s.over2h - (1 - OUT_IN_2H_TARGET)) / (1 - OUT_IN_2H_TARGET), 'Too many trucks stay over 2 hours', `${pct(s.over2h)} stayed over 2 hours. The limit is ${pct(1 - OUT_IN_2H_TARGET)}.`)
  if (s.waitDock != null) add('wait', (s.waitDock - WAIT_TARGET) / WAIT_TARGET, 'Trucks wait too long for a dock', `They waited ${Math.round(s.waitDock)} min on average before a dock. The target is ${WAIT_TARGET} min.`)
  if (s.leave != null) add('leave', (s.leave - LEAVE_TARGET) / LEAVE_TARGET, 'Loaded trucks are slow to leave', `They waited ${Math.round(s.leave)} min after passing inspection. The target is ${LEAVE_TARGET} min.`)
  if (s.onTime != null) add('late', (ON_TIME_TARGET - s.onTime) / ON_TIME_TARGET, 'Carriers arrive late', `${pct(s.onTime)} of booked trucks were on time. The target is ${pct(ON_TIME_TARGET)}.`)
  if (s.firstPass != null) add('recheck', (PASS_TARGET - s.firstPass) / PASS_TARGET, 'Loads fail inspection', `${pct(s.firstPass)} passed the first time. The target is ${pct(PASS_TARGET)}.`)
  if (s.staged != null) add('staged', (STAGED_TARGET - s.staged) / STAGED_TARGET, 'Orders aren’t staged before the slot', `${pct(s.staged)} of orders were at the dock before the truck's slot. The target is ${pct(STAGED_TARGET)}.`)
  if (s.disputable > 0) add('dispute', 0.05, 'Charges we can dispute', `$${Math.round(s.disputable).toLocaleString()} of waiting charges were on the carrier's side.`)
  return out.sort((a, b) => b.off - a.off)
}
