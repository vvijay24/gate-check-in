// Figures for the Overview tab: a date range (from–to, "YYYY-MM-DD", inclusive) built on the
// day figures in metrics.js. The focus is where trucks spend their
// time on site and what that costs in detention.
import { LATE_GRACE_MIN, arrivalMs, dayKey, departureMs, minutesLate } from './time'
import { dayMetrics, isDrop } from './metrics'
import { dockKey } from './components/AssignDock'
import { DETENTION_FREE_MIN, DETENTION_RATE_PER_HOUR, DOCKS } from './yard'
import { GATES } from './formConfig'

const MIN = 60000
const HOUR = 60 * MIN
const FREE_MS = DETENTION_FREE_MIN * MIN
// Longest stays listed on the Detention & Wait Time section.
const LONGEST = 10

const average = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
const sum = (list) => list.reduce((a, b) => a + b, 0)
const avgOf = (list, pick) => average(list.map(pick).filter((v) => v != null && Number.isFinite(v) && v >= 0))
const isPickup = (e) => (e.visitPurpose ?? []).includes('Pickup')

export const shiftDate = (key, days) => {
  const d = new Date(`${key}T00:00`)
  d.setDate(d.getDate() + days)
  return dayKey(d)
}

// Every date from `from` to `to`, inclusive.
export function datesBetween(from, to) {
  const list = []
  for (let d = from; d <= to; d = shiftDate(d, 1)) list.push(d)
  return list
}

// The same number of days just before the range, for the ▲/▼ comparison.
export function previousRange(from, to) {
  const days = datesBetween(from, to).length
  return { from: shiftDate(from, -days), to: shiftDate(from, -1) }
}

// One visit's time on site, split into the stages the app records:
// arrived → dock assigned → inspected → released by Shipping → checked out. A stage is null when
// either end is missing. "Dock → inspected" includes loading.
export function visitStages(e, now) {
  const arrived = arrivalMs(e)
  const left = e.timeOut ? departureMs(e) : NaN
  const docked = e.dockAssignedAt ?? NaN
  const inspected = e.loadingInspection?.inspectedAt ?? NaN
  const released = e.release?.releasedAt ?? NaN
  const span = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null)
  const onSiteMs = span(arrived, Number.isFinite(left) ? left : now)
  const overMs = onSiteMs == null ? 0 : Math.max(0, onSiteMs - FREE_MS)
  return {
    e,
    onSite: !e.timeOut,
    onSiteMs,
    waitDockMs: span(arrived, docked),
    toInspectMs: span(docked, inspected),
    afterInspectMs: span(inspected, left),
    // The time after inspection, split at Shipping's release to the gate.
    toReleaseMs: span(inspected, released),
    releaseToOutMs: span(released, left),
    // Time from arrival until the inspection was saved, to see whether it ran past free time.
    arrivalToInspectMs: span(arrived, inspected),
    overMs,
    cost: (overMs / HOUR) * DETENTION_RATE_PER_HOUR,
  }
}

const detentionOf = (stages) => ({
  overFree: stages.filter((s) => s.overMs > 0).length,
  detentionCost: sum(stages.map((s) => s.cost)),
})

// Per carrier, customer or inspector: visits, average turnaround, on-time %, late arrivals, detention.
function rollup(stages, nameOf) {
  const groups = new Map()
  for (const s of stages) {
    const name = String(nameOf(s.e) ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!groups.has(key)) groups.set(key, { name, items: [] })
    groups.get(key).items.push(s)
  }
  return [...groups.values()].map(({ name, items }) => {
    const lates = items.map((s) => minutesLate(s.e)).filter((m) => m !== null)
    const results = items.map((s) => s.e.loadingInspection?.result).filter(Boolean)
    return {
      name,
      visits: items.length,
      avgTurnMs: avgOf(items.filter((s) => !s.onSite), (s) => s.onSiteMs),
      avgToInspectMs: avgOf(items, (s) => s.toInspectMs),
      onTimePct: lates.length ? lates.filter((m) => m <= LATE_GRACE_MIN).length / lates.length : null,
      late: lates.filter((m) => m > LATE_GRACE_MIN).length,
      passPct: results.length ? results.filter((r) => r === 'Pass').length / results.length : null,
      ...detentionOf(items),
    }
  })
}

const hourOf = (ms) => new Date(ms).getHours()

export function rangeMetrics(entries, from, to, now) {
  const today = dayKey(new Date(now))
  // Days after today have no data yet, so they don't count toward averages.
  const dates = datesBetween(from, to).filter((d) => d <= today)
  const dayFigures = new Map(dates.map((date) => [date, dayMetrics(entries, date, now)]))

  const visits = entries.filter((e) => e.dateIn >= from && e.dateIn <= to)
  // Detention and stage times cover live visits: a dropped trailer has no driver waiting.
  const live = visits.filter((e) => !isDrop(e)).map((e) => visitStages(e, now))
  const departed = live.filter((s) => !s.onSite)
  const lates = visits.map(minutesLate).filter((m) => m !== null)
  const onTime = lates.filter((m) => m <= LATE_GRACE_MIN).length

  const arrivals = { early: 0, onTime: 0, late: 0, unscheduled: 0 }
  const gates = Object.fromEntries(GATES.map((g) => [g, { in: 0, out: 0 }]))
  for (const m of dayFigures.values()) {
    for (const k of Object.keys(arrivals)) arrivals[k] += m.arrivals[k]
    for (const g of GATES) {
      gates[g].in += m.gateCounts[g].in
      gates[g].out += m.gateCounts[g].out
    }
  }

  // Pickups (Shipping) and their loading inspections.
  const pickups = live.filter((s) => isPickup(s.e))
  const pickupLates = pickups.map((s) => minutesLate(s.e)).filter((m) => m !== null)
  const inspected = visits.filter((e) => e.loadingInspection?.result).map((e) => visitStages(e, now))
  const passed = inspected.filter((s) => s.e.loadingInspection.result === 'Pass').length
  const issues = new Map()
  for (const s of inspected) for (const i of s.e.loadingInspection.issues ?? []) issues.set(i, (issues.get(i) ?? 0) + 1)

  // Docks: everything assigned to a dock in the range.
  const start = new Date(`${from}T00:00`).getTime()
  const end = new Date(`${shiftDate(to, 1)}T00:00`).getTime()
  const docked = entries.filter((e) => e.dockAssignedAt >= start && e.dockAssignedAt < end).map((e) => visitStages(e, now))
  const docks = DOCKS.map((dock) => {
    const here = docked.filter((s) => dockKey(s.e.dockDoor) === dock)
    return {
      dock,
      loads: here.length,
      utilization: average(dates.map((d) => dayFigures.get(d).doors.find((x) => x.door === dock)?.utilization).filter((u) => u != null)),
      avgWaitMs: avgOf(here, (s) => s.waitDockMs),
      avgToInspectMs: avgOf(here, (s) => s.toInspectMs),
      avgDwellMs: avgOf(here, (s) => (s.onSite || !s.e.dockAssignedAt ? null : departureMs(s.e) - s.e.dockAssignedAt)),
      ...detentionOf(here.filter((s) => !isDrop(s.e))),
    }
  })

  const days = dates.map((date) => {
    const m = dayFigures.get(date)
    const dayLive = live.filter((s) => s.e.dateIn === date)
    const dockHourly = Array(24).fill(0)
    for (const s of docked) if (dayKey(new Date(s.e.dockAssignedAt)) === date) dockHourly[hourOf(s.e.dockAssignedAt)]++
    return {
      date,
      visits: m.visits,
      live: m.liveCount,
      drops: m.dropCount,
      pickups: dayLive.filter((s) => isPickup(s.e)).length,
      scheduled: m.scheduled,
      onTimePct: m.otaPct,
      hourly: m.hourly,
      dockHourly,
      avgWaitDockMs: avgOf(dayLive, (s) => s.waitDockMs),
      avgToInspectMs: avgOf(dayLive, (s) => s.toInspectMs),
      inspections: inspected.filter((s) => s.e.dateIn === date).length,
      ...detentionOf(dayLive),
    }
  })

  return {
    from,
    to,
    dayCount: dates.length,
    // One row per day for the charts.
    days,
    totals: {
      visits: visits.length,
      live: live.length,
      drops: visits.length - live.length,
      departedLive: departed.length,
      scheduled: lates.length,
      onTime,
      onTimePct: lates.length ? onTime / lates.length : null,
      avgGateDwellMs: avgOf(departed, (s) => s.onSiteMs),
      avgOnSiteMs: avgOf(live, (s) => s.onSiteMs),
      avgWaitDockMs: avgOf(live, (s) => s.waitDockMs),
      avgToInspectMs: avgOf(live, (s) => s.toInspectMs),
      avgAfterInspectMs: avgOf(live, (s) => s.afterInspectMs),
      avgToReleaseMs: avgOf(live, (s) => s.toReleaseMs),
      avgReleaseToOutMs: avgOf(live, (s) => s.releaseToOutMs),
      dockUtilization: average(dates.map((d) => dayFigures.get(d).dockUtilization).filter((u) => u != null)),
      ...detentionOf(live),
    },
    arrivals,
    gates,
    // "Where the time goes": averages over departed visits that went through every stage (dock,
    // inspection, Shipping release), so the four parts add up to a real stay.
    stages: (() => {
      const full = departed.filter((s) => s.waitDockMs != null && s.toInspectMs != null && s.toReleaseMs != null && s.releaseToOutMs != null)
      return {
        count: full.length,
        waitDockMs: avgOf(full, (s) => s.waitDockMs),
        toInspectMs: avgOf(full, (s) => s.toInspectMs),
        toReleaseMs: avgOf(full, (s) => s.toReleaseMs),
        releaseToOutMs: avgOf(full, (s) => s.releaseToOutMs),
        overFree: full.filter((s) => s.overMs > 0).length,
      }
    })(),
    // Every live visit's stages (for Export), and the longest ones for the Detention & Wait Time section.
    stays: live,
    longest: [...live].sort((a, b) => (b.onSiteMs ?? 0) - (a.onSiteMs ?? 0)).slice(0, LONGEST),
    shipping: {
      pickups: pickups.length,
      avgTurnMs: avgOf(pickups.filter((s) => !s.onSite), (s) => s.onSiteMs),
      scheduled: pickupLates.length,
      onTimePct: pickupLates.length ? pickupLates.filter((m) => m <= LATE_GRACE_MIN).length / pickupLates.length : null,
      ...detentionOf(pickups),
    },
    inspections: {
      count: inspected.length,
      passed,
      failed: inspected.length - passed,
      passPct: inspected.length ? passed / inspected.length : null,
      avgToInspectMs: avgOf(inspected, (s) => s.toInspectMs),
      avgAfterInspectMs: avgOf(inspected, (s) => s.afterInspectMs),
      avgToReleaseMs: avgOf(inspected, (s) => s.toReleaseMs),
      avgReleaseToOutMs: avgOf(inspected, (s) => s.releaseToOutMs),
      issues: [...issues].map(([issue, count]) => ({ issue, count })).sort((a, b) => b.count - a.count),
      inspectors: rollup(inspected, (e) => e.loadingInspection.inspector),
      // Inspections that weren't saved until the truck was already past its free time.
      late: inspected.filter((s) => s.arrivalToInspectMs > FREE_MS).sort((a, b) => b.arrivalToInspectMs - a.arrivalToInspectMs),
    },
    docks,
    carriers: rollup(live, (e) => e.truckName),
    // The Customer field is only filled in for pickups.
    customers: rollup(pickups, (e) => e.customerPickupFor),
  }
}
