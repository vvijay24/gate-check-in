// Figures for the Overview tab: a date range (from–to, "YYYY-MM-DD", inclusive) built on the
// day figures in metrics.js. The focus is where trucks spend their
// time on site and what that costs in detention.
import { LATE_GRACE_MIN, arrivalMs, dayKey, departureMs, minutesLate } from './time'
import { dayMetrics, isDrop } from './metrics'
import { dockKey } from './components/AssignDock'
import { DETENTION_FREE_MIN, DETENTION_RATE_PER_HOUR, DOCKS } from './yard'
import { GATES } from './formConfig'
import { HANDOFFS } from './impactSettings'
import { CHECK_NAMES } from './inspectionChecks'
import { awaitingRelease, isReleased } from './handoff'

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

// ---- Digitization Impact: what going digital is saving, and what's still on the table ----

// Est. detention fee for a stay of `onSiteMs`.
const feeFor = (onSiteMs) => (Math.max(0, onSiteMs - FREE_MS) / HOUR) * DETENTION_RATE_PER_HOUR
// Weeks of `days` days ending on `to`, newest last, none starting before `earliest`.
function weeksEnding(to, earliest, count = 8) {
  const weeks = []
  for (let i = count - 1; i >= 0; i--) {
    const end = shiftDate(to, -7 * i)
    const start = shiftDate(end, -6)
    if (end >= earliest) weeks.push({ from: start, to: end })
  }
  return weeks
}
// Figures that describe one stretch of days, for trends and the starting point.
function periodFigures(entries, from, to, now) {
  const r = rangeMetrics(entries, from, to, now)
  const t = r.totals
  return {
    date: from,
    from,
    to,
    days: r.dayCount,
    detention: t.detentionCost,
    weeklyDetention: r.dayCount ? (t.detentionCost / r.dayCount) * 7 : null,
    perLoad: t.live ? t.detentionCost / t.live : null,
    overFreePct: t.live ? t.overFree / t.live : null,
    avgOnSiteMs: t.avgOnSiteMs,
    live: t.live,
  }
}

// Splits each truck's wait for a dock (arrival → dock assigned) into
// - noDockMs: every dock was busy, or every free dock was going to trucks that arrived earlier
//   (a capacity wait), and
// - freeDockMs: a dock was free and this truck was next in line, but no dock was assigned yet (a
//   Gate → Shipping response delay — what two paper forms used to cause).
// `subjects` are the trucks to split; everything in `entries` counts toward dock use and the queue.
export function dockWaitSplit(entries, subjects, now) {
  const busy = entries
    .filter((e) => e.dockAssignedAt && DOCKS.includes(dockKey(e.dockDoor)))
    .map((e) => [e.dockAssignedAt, e.timeOut ? departureMs(e) : now])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
  const waits = entries
    .filter((e) => !isDrop(e) && Number.isFinite(arrivalMs(e)))
    .map((e) => ({ e, from: arrivalMs(e), to: e.dockAssignedAt ?? (e.timeOut ? departureMs(e) : now) }))
    .filter((w) => Number.isFinite(w.to) && w.to > w.from)
  const split = new Map()
  for (const s of subjects) {
    const a = arrivalMs(s)
    const b = s.dockAssignedAt
    if (!Number.isFinite(a) || !(b > a)) {
      split.set(s.id, { freeDockMs: 0, noDockMs: 0 })
      continue
    }
    // Trucks that arrived earlier and were still waiting after this one arrived are ahead of it.
    const ahead = waits.filter((w) => w.e !== s && w.from < a && w.to > a)
    const docksInUse = busy.filter(([x, y]) => x < b && y > a)
    const points = new Set([a, b])
    for (const [x, y] of docksInUse) for (const p of [x, y]) if (p > a && p < b) points.add(p)
    for (const w of ahead) if (w.to > a && w.to < b) points.add(w.to)
    const ts = [...points].sort((x, y) => x - y)
    let free = 0
    for (let i = 0; i < ts.length - 1; i++) {
      const mid = (ts[i] + ts[i + 1]) / 2
      const used = docksInUse.filter(([x, y]) => x <= mid && y > mid).length
      const queued = ahead.filter((w) => w.to > mid).length
      if (DOCKS.length - used > queued) free += ts[i + 1] - ts[i]
    }
    split.set(s.id, { freeDockMs: free, noDockMs: b - a - free })
  }
  return split
}

// Gate → Shipping figures for visits checked in from–to: how soon the guard saved the arrival, and
// how quickly Shipping assigned a dock once one was free for the truck.
function gateToShipping(entries, from, to, now, targetMs) {
  const visits = entries.filter((e) => e.dateIn >= from && e.dateIn <= to && !isDrop(e))
  const logged = visits.filter((e) => e.createdAt && Number.isFinite(arrivalMs(e)))
  const loggedMs = logged.map((e) => Math.max(0, e.createdAt - arrivalMs(e)))
  const docked = visits.filter((e) => e.dockAssignedAt)
  const split = dockWaitSplit(entries, docked, now)
  const parts = docked.map((e) => ({ e, ...split.get(e.id) }))
  const within = parts.filter((p) => p.freeDockMs <= targetMs).length
  // Money on the table: the response time over target comes off the stay of departed trucks.
  const opportunity = sum(
    parts
      .filter((p) => p.e.timeOut)
      .map((p) => {
        const stay = departureMs(p.e) - arrivalMs(p.e)
        return Number.isFinite(stay) ? feeFor(stay) - feeFor(stay - Math.max(0, p.freeDockMs - targetMs)) : 0
      }),
  )
  return {
    logged: logged.length,
    avgLoggedMs: average(loggedMs),
    livePct: logged.length ? loggedMs.filter((ms) => ms <= 15 * MIN).length / logged.length : null,
    docked: parts.length,
    avgFreeDockMs: average(parts.map((p) => p.freeDockMs)),
    avgNoDockMs: average(parts.map((p) => p.noDockMs)),
    responseOnTargetPct: parts.length ? within / parts.length : null,
    opportunity,
  }
}

// Details the Gate enters once that Shipping and the Gate reuse without re-typing (on paper each was
// written on both forms), plus the seal carried from the inspection to the release and check-out.
export const SHARED_FIELDS = [
  { key: 'trailerNumber', label: 'Trailer #' },
  { key: 'truckName', label: 'Carrier' },
  { key: 'truckerNameIn', label: 'Trucker name' },
  { key: 'driverPhone', label: 'Driver phone' },
  { key: 'visitPurpose', label: 'Purpose of visit' },
  { key: 'pickupNumber', label: 'Order No' },
  { key: 'customerPickupFor', label: 'Customer' },
  { key: 'appointmentTime', label: 'Appointment time' },
]
function sharedDetails(visits) {
  const filled = (v) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '')
  const byField = SHARED_FIELDS.map((f) => ({ ...f, count: visits.filter((e) => filled(e[f.key])).length }))
  // The inspection's seal, reused at the Shipping release and on the check-out form.
  const seal = visits.filter((e) => e.loadingInspection?.sealApplied && (e.release?.seal || e.outgoingSeals)).length
  byField.push({ key: 'seal', label: 'Seal # (inspection → release → check-out)', count: seal })
  const total = sum(byField.map((f) => f.count))
  return { total, perTruck: visits.length ? total / visits.length : null, byField }
}

// `settings`: { goLive, targets } (targets in minutes per handoff); `gateEvents`: recorded gate events.
// "Opportunity" is the est. detention that would have been avoided if a handoff had taken no longer
// than its target (the time over target comes off the stay). Per-handoff figures assume only that
// handoff improves, so they don't add up to the all-targets figure.
export function impactMetrics(entries, from, to, now, settings, gateEvents = []) {
  const today = dayKey(new Date(now))
  const dates = datesBetween(from, to).filter((d) => d <= today)
  const perWeek = dates.length ? 7 / dates.length : 0
  const targetMs = (key) => settings.targets[key] * MIN
  const inRange = entries.filter((e) => e.dateIn >= from && e.dateIn <= to)
  const departed = inRange.filter((e) => !isDrop(e) && e.timeOut).map((e) => visitStages(e, now))

  const handoffs = HANDOFFS.map((h) => {
    const timed = departed.filter((s) => s[h.key] != null)
    const within = timed.filter((s) => s[h.key] <= targetMs(h.key)).length
    const opportunity = sum(timed.map((s) => feeFor(s.onSiteMs) - feeFor(s.onSiteMs - Math.max(0, s[h.key] - targetMs(h.key)))))
    return {
      ...h,
      targetMin: settings.targets[h.key],
      count: timed.length,
      avgMs: avgOf(timed, (s) => s[h.key]),
      onTargetPct: timed.length ? within / timed.length : null,
      opportunity,
      opportunityPerWeek: opportunity * perWeek,
    }
  })
  const overTargets = (s) => sum(HANDOFFS.map((h) => (s[h.key] != null ? Math.max(0, s[h.key] - targetMs(h.key)) : 0)))
  const allOpportunity = sum(departed.map((s) => feeFor(s.onSiteMs) - feeFor(s.onSiteMs - overTargets(s))))
  const checks = sum(handoffs.map((h) => h.count))
  const onTarget = checks ? sum(handoffs.map((h) => (h.onTargetPct ?? 0) * h.count)) / checks : null

  // % of handoffs on target, per day.
  const handoffDays = dates.map((date) => {
    const day = departed.filter((s) => s.e.dateIn === date)
    let n = 0
    let ok = 0
    for (const s of day)
      for (const h of HANDOFFS)
        if (s[h.key] != null) {
          n++
          if (s[h.key] <= targetMs(h.key)) ok++
        }
    return { date, onTargetPct: n ? ok / n : null, checks: n }
  })

  // Trucks on site right now that are over a handoff's target.
  const stuck = []
  for (const e of entries.filter((x) => !x.timeOut)) {
    const add = (step, since, key) => {
      const over = now - since - targetMs(key)
      if (Number.isFinite(over) && over > 0) stuck.push({ e, step, sinceMs: now - since, overMs: over })
    }
    if (!e.dockDoor && !isDrop(e)) add('Waiting for a dock', arrivalMs(e), 'waitDockMs')
    else if (e.dockDoor && !e.loadingInspection && e.dockAssignedAt) add('Docked, not inspected', e.dockAssignedAt, 'toInspectMs')
    else if (awaitingRelease(e)) add('Passed, not released by Shipping', e.loadingInspection.inspectedAt, 'toReleaseMs')
    else if (isReleased(e)) add('Released, not checked out', e.release.releasedAt, 'releaseToOutMs')
  }
  stuck.sort((a, b) => b.overMs - a.overMs)

  // Weekly trend and the starting point (the first two weeks from go-live).
  const earliest = entries.reduce((m, e) => (e.dateIn && e.dateIn < m ? e.dateIn : m), today)
  const weeks = weeksEnding(to, earliest).map((w) => periodFigures(entries, w.from, w.to, now))
  const goLive = settings.goLive || earliest
  const daysSinceGoLive = goLive <= today ? datesBetween(goLive, today).length : 0
  const start = daysSinceGoLive >= 14 ? periodFigures(entries, goLive, shiftDate(goLive, 13), now) : null

  // Data quality and use.
  const startMs = new Date(`${from}T00:00`).getTime()
  const endMs = new Date(`${shiftDate(to, 1)}T00:00`).getTime()
  const docked = inRange.filter((e) => e.timeOut && e.dockAssignedAt && !isDrop(e))
  const complete = docked.filter((e) => e.loadingInspection?.inspectedAt && e.release?.releasedAt).length
  const inspections = inRange.filter((e) => e.loadingInspection)
  const answered = inspections.filter((e) => CHECK_NAMES.every((n) => e.loadingInspection[n])).length
  // "Logged live": saved within 15 minutes after the Time In typed on the form.
  const logged = inRange.filter((e) => e.createdAt && Number.isFinite(arrivalMs(e)))
  const isLive = (e) => e.createdAt - arrivalMs(e) <= 15 * MIN
  const sealChecks = inRange.filter((e) => e.sealConfirmed)
  const guards = new Map()
  for (const e of inRange) {
    const name = String(e.guardOnDuty ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!guards.has(key)) guards.set(key, { name, checkIns: 0, timed: 0, live: 0, edited: 0 })
    const g = guards.get(key)
    g.checkIns++
    if (logged.includes(e)) {
      g.timed++
      if (isLive(e)) g.live++
    }
    if (e.edits) g.edited++
  }

  const responseTarget = targetMs('dockResponseMs')
  const g2s = gateToShipping(entries, from, to, now, responseTarget)
  const gateShipping = {
    ...g2s,
    targetMin: settings.targets.dockResponseMs,
    opportunityPerWeek: g2s.opportunity * perWeek,
    start: start ? gateToShipping(entries, start.from, start.to, now, responseTarget) : null,
  }

  return {
    handoffs,
    gateShipping,
    shared: sharedDetails(inRange),
    onTargetPct: onTarget,
    allOpportunity,
    allOpportunityPerWeek: allOpportunity * perWeek,
    biggest: [...handoffs].sort((a, b) => b.opportunity - a.opportunity)[0],
    handoffDays,
    stuck,
    weeks,
    goLive,
    daysSinceGoLive,
    start,
    quality: {
      docked: docked.length,
      completePct: docked.length ? complete / docked.length : null,
      inspections: inspections.length,
      answeredPct: inspections.length ? answered / inspections.length : null,
      logged: logged.length,
      livePct: logged.length ? logged.filter(isLive).length / logged.length : null,
      visits: inRange.length,
      edited: inRange.filter((e) => e.edits).length,
      editedPct: inRange.length ? inRange.filter((e) => e.edits).length / inRange.length : null,
      sealChecks: sealChecks.length,
      sealMismatches: sealChecks.filter((e) => e.sealConfirmed === 'No').length,
      blocked: gateEvents.filter((g) => g.type === 'blocked' && g.at >= startMs && g.at < endMs).length,
      guards: [...guards.values()].map((g) => ({ ...g, livePct: g.timed ? g.live / g.timed : null })),
    },
  }
}
