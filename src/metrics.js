// Numbers for the Overview tab, the yard map and the staging-bay boards, worked out from the gate entries.
import { EARLY_GRACE_MIN, LATE_GRACE_MIN, arrivalMs, departureMs, minutesLate } from './time'
import { dockKey } from './components/AssignDock'
import { BAY_NAMES, DETENTION_FREE_MIN, DOCKS, STAGING_BAYS } from './yard'
import { GATES } from './formConfig'

const MIN = 60000

export const isDrop = (e) => (e.visitPurpose ?? []).includes('Drop Trailer')

// The yard functions below take `at`, the moment to look at (ms). Left out, they use the saved
// state as it is now. A step with no recorded time (older entries) counts as already done.
const happened = (ms, at) => !(ms > at)

// A pickup counts as loaded once its Loading Inspection has passed.
const isLoaded = (e, at) =>
  (e.visitPurpose ?? []).includes('Pickup') && e.loadingInspection?.result === 'Pass' && happened(e.loadingInspection.inspectedAt, at)

// Where a visit stands: waiting | drop | dock | ready | departed.
export function yardStatus(e, at = Infinity) {
  if (e.timeOut && happened(departureMs(e), at)) return 'departed'
  if (e.dockDoor && happened(e.dockAssignedAt, at)) return isLoaded(e, at) ? 'ready' : 'dock'
  return isDrop(e) ? 'drop' : 'waiting'
}

const onSiteAt = (e, at) => happened(arrivalMs(e), at) && yardStatus(e, at) !== 'departed'

const average = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)

// Groups items by a typed name, ignoring case and spaces; each group keeps the first spelling seen.
function groupBy(items, nameOf) {
  const groups = new Map()
  for (const item of items) {
    const name = String(nameOf(item)).trim()
    const key = name.toLowerCase()
    if (!groups.has(key)) groups.set(key, { name, items: [] })
    groups.get(key).items.push(item)
  }
  return [...groups.values()]
}

// Trucks and dropped trailers on site without a dock sit in the bay picked at check-in. Those without
// one (older entries, or a bay someone else already holds) fill the free bays in arrival order;
// any left over are overflow.
export function stagingBays(entries, at = Infinity) {
  const staging = entries
    .filter((e) => onSiteAt(e, at) && ['waiting', 'drop'].includes(yardStatus(e, at)))
    .sort((a, b) => arrivalMs(a) - arrivalMs(b))
  const bays = Array(STAGING_BAYS).fill(null)
  const unplaced = []
  for (const e of staging) {
    const i = BAY_NAMES.indexOf(e.waitingLocation)
    if (i >= 0 && !bays[i]) bays[i] = e
    else unplaced.push(e)
  }
  const overflow = []
  for (const e of unplaced) {
    const i = bays.indexOf(null)
    if (i >= 0) bays[i] = e
    else overflow.push(e)
  }
  return { bays, overflow, used: staging.length }
}

// Bays in use right now, keyed by bay name ("Bay 2") → the truck in it. The Check In form
// can't pick these.
export function takenBays(entries) {
  return new Map(stagingBays(entries).bays.map((e, i) => e && [BAY_NAMES[i], e]).filter(Boolean))
}

// Yard state at `at` (ms): everything on site at that moment. Waits and detention are measured to
// `clock`; the live view passes at = Infinity (the saved state) with clock = now.
export function yardMetrics(entries, at, clock = at) {
  const onSite = entries.filter((e) => onSiteAt(e, at))
  const { bays, overflow, used } = stagingBays(entries, at)
  const bayOf = new Map(bays.map((e, i) => e && [e.id, i + 1]).filter(Boolean))
  const atDock = new Map(onSite.filter((e) => ['dock', 'ready'].includes(yardStatus(e, at))).map((e) => [dockKey(e.dockDoor), e]))
  const waiting = onSite.filter((e) => yardStatus(e, at) === 'waiting')
  const drops = onSite.filter(isDrop).sort((a, b) => arrivalMs(a) - arrivalMs(b))

  const inventory = { inbound: 0, outboundEmpty: 0, outboundLoaded: 0, dropped: 0 }
  for (const e of onSite) {
    const purposes = e.visitPurpose ?? []
    if (isDrop(e)) inventory.dropped++
    else if (isLoaded(e, at)) inventory.outboundLoaded++
    else if (purposes.includes('Delivery')) inventory.inbound++
    else if (purposes.includes('Pickup')) inventory.outboundEmpty++
  }

  // Detention applies to trucks with a driver waiting, so dropped trailers are left out.
  const detention = onSite
    .filter((e) => !isDrop(e))
    .map((e) => ({ e, ms: clock - arrivalMs(e) }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => b.ms - a.ms)

  return {
    bays,
    overflow,
    bayOf,
    capacityPct: Math.round((used / STAGING_BAYS) * 100),
    bayCount: used,
    atDock,
    otherDocks: [...atDock].filter(([k]) => !DOCKS.includes(k)).map(([, e]) => e),
    waiting,
    longestWaitMs: Math.max(0, ...waiting.map((e) => clock - arrivalMs(e)).filter(Number.isFinite)),
    drops,
    inventory,
    detention,
  }
}

// Figures for one day (`date` is "YYYY-MM-DD"): visits checked in that day, and dock use during it.
export function dayMetrics(entries, date, now) {
  const day = entries.filter((e) => e.dateIn === date)
  const live = day.filter((e) => !isDrop(e))
  const turnaround = (e) => departureMs(e) - arrivalMs(e)
  const departedLive = live.filter((e) => e.timeOut && Number.isFinite(turnaround(e)))

  const arrivals = { early: 0, onTime: 0, late: 0, unscheduled: 0 }
  for (const e of day) {
    const late = minutesLate(e)
    if (late === null) arrivals.unscheduled++
    else if (late < -EARLY_GRACE_MIN) arrivals.early++
    else if (late > LATE_GRACE_MIN) arrivals.late++
    else arrivals.onTime++
  }
  const scheduled = arrivals.early + arrivals.onTime + arrivals.late

  const hourly = Array(24).fill(0)
  for (const e of day) {
    const h = parseInt(e.timeIn, 10)
    if (h >= 0 && h < 24) hourly[h]++
  }

  // Dock use from midnight to the end of the day, or to now when looking at today.
  const start = new Date(`${date}T00:00`).getTime()
  const next = new Date(start)
  next.setDate(next.getDate() + 1)
  const windowEnd = Math.min(next.getTime(), now)
  const windowMs = Math.max(0, windowEnd - start)
  const doors = DOCKS.map((door) => ({ door, busyMs: 0, loads: 0, dwells: [] }))
  for (const e of entries) {
    const door = e.dockAssignedAt && doors.find((d) => d.door === dockKey(e.dockDoor))
    if (!door) continue
    const released = e.timeOut ? departureMs(e) : now
    if (!Number.isFinite(released)) continue
    const overlap = Math.min(released, windowEnd) - Math.max(e.dockAssignedAt, start)
    if (overlap > 0) door.busyMs += overlap
    if (e.dockAssignedAt >= start && e.dockAssignedAt < next.getTime()) {
      door.loads++
      if (e.timeOut) door.dwells.push(released - e.dockAssignedAt)
    }
  }
  // Dock wait: check-in to dock assigned, for visits checked in this day.
  const waits = day
    .filter((e) => e.dockAssignedAt)
    .map((e) => ({ door: dockKey(e.dockDoor), ms: e.dockAssignedAt - arrivalMs(e) }))
    .filter((w) => Number.isFinite(w.ms) && w.ms >= 0)
  const doorRows = doors.map((d) => ({
    door: d.door,
    loads: d.loads,
    utilization: windowMs ? d.busyMs / windowMs : null,
    avgDwellMs: average(d.dwells),
    avgWaitMs: average(waits.filter((w) => w.door === d.door).map((w) => w.ms)),
  }))

  // Carrier leaderboard over live visits: fastest average turnaround first.
  const carriers = new Map()
  for (const e of live) {
    const name = (e.truckName ?? '').trim() || 'Unknown carrier'
    const key = name.toLowerCase()
    if (!carriers.has(key)) carriers.set(key, { name, visits: 0, turns: [], scheduled: 0, onTime: 0, detention: 0 })
    const c = carriers.get(key)
    c.visits++
    if (e.timeOut && Number.isFinite(turnaround(e))) c.turns.push(turnaround(e))
    const late = minutesLate(e)
    if (late !== null) {
      c.scheduled++
      if (late <= LATE_GRACE_MIN) c.onTime++
    }
    const onSiteMs = e.timeOut ? turnaround(e) : now - arrivalMs(e)
    if (onSiteMs > DETENTION_FREE_MIN * MIN) c.detention++
  }
  const leaderboard = [...carriers.values()]
    .map((c) => ({ ...c, avgTurnMs: average(c.turns), onTimePct: c.scheduled ? c.onTime / c.scheduled : null }))
    .sort((a, b) => (a.avgTurnMs ?? Infinity) - (b.avgTurnMs ?? Infinity) || a.name.localeCompare(b.name))

  // Customers (the Customer field is only filled in for pickups).
  const customers = groupBy(
    day.filter((e) => (e.customerPickupFor ?? '').trim()),
    (e) => e.customerPickupFor,
  ).map(({ name, items }) => {
    const turns = items.filter((e) => e.timeOut).map(turnaround).filter(Number.isFinite)
    const lates = items.map(minutesLate).filter((m) => m !== null)
    return {
      name,
      pickups: items.length,
      avgTurnMs: average(turns),
      onTimePct: lates.length ? lates.filter((m) => m <= LATE_GRACE_MIN).length / lates.length : null,
      onSite: items.filter((e) => !e.timeOut).length,
    }
  })
  customers.sort((a, b) => b.pickups - a.pickups || a.name.localeCompare(b.name))

  // Guards: check-ins logged this day, and check-outs made this day.
  const checkIns = day.filter((e) => (e.guardOnDuty ?? '').trim()).map((e) => ({ name: e.guardOnDuty, kind: 'in' }))
  const checkOuts = entries
    .filter((e) => e.timeOut && (e.dateOut || e.dateIn) === date && (e.guardOut ?? '').trim())
    .map((e) => ({ name: e.guardOut, kind: 'out' }))
  const guards = groupBy([...checkIns, ...checkOuts], (g) => g.name)
    .map(({ name, items }) => {
      const ins = items.filter((g) => g.kind === 'in').length
      return { name, checkIns: ins, checkOuts: items.length - ins, total: items.length }
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

  return {
    visits: day.length,
    avgDockWaitMs: average(waits.map((w) => w.ms)),
    customers,
    guards,
    avgGateDwellMs: average(departedLive.map(turnaround)),
    departedLiveCount: departedLive.length,
    arrivals,
    scheduled,
    otaPct: scheduled ? (arrivals.early + arrivals.onTime) / scheduled : null,
    hourly,
    doors: doorRows,
    dockUtilization: windowMs ? doors.reduce((s, d) => s + d.busyMs, 0) / (windowMs * DOCKS.length) : null,
    avgDockDwellMs: average(doors.flatMap((d) => d.dwells)),
    leaderboard,
    dropCount: day.length - live.length,
    liveCount: live.length,
    gateCounts: Object.fromEntries(
      GATES.map((g) => [
        g,
        {
          in: day.filter((e) => e.gateIn === g).length,
          out: entries.filter((e) => e.timeOut && (e.dateOut || e.dateIn) === date && e.gateOut === g).length,
        },
      ]),
    ),
  }
}
