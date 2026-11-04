// Operational figures for Insights' control-tower views: how the yard filled up through a day,
// what each dock did hour by hour, how stays and stage times are spread (not just their averages),
// and what's on site right now. Times are ms; dates are "YYYY-MM-DD".
import { arrivalMs, dayKey, departureMs, minutesLate } from './time'
import { isDrop } from './metrics'
import { dockKey } from './components/AssignDock'
import { DETENTION_FREE_MIN, DETENTION_RATE_PER_HOUR, DOCKS } from './yard'
import { HANDOFFS } from './impactSettings'
import { datesBetween, percentile, shiftDate, visitStages } from './analytics'

const MIN = 60000
const HOUR = 60 * MIN
const FREE_MS = DETENTION_FREE_MIN * MIN
const SLOT_MS = 10 * MIN

// The yard states a truck moves through, in order. Drops (a trailer with no driver) sit apart.
export const YARD_STATES = [
  { key: 'waiting', label: 'Waiting for a dock', short: 'Waiting' },
  { key: 'atDock', label: 'At dock, not inspected', short: 'At dock' },
  { key: 'awaitingRelease', label: 'Inspected, awaiting release', short: 'Inspected' },
  { key: 'released', label: 'Released, heading out', short: 'Released' },
]

export { percentile }

const finite = (x) => Number.isFinite(x)
const dayStart = (date) => new Date(`${date}T00:00`).getTime()
const endOf = (e, now) => (e.timeOut ? departureMs(e) : now)

// Where a live truck stands at `t`.
function stateAt(e, t) {
  if (!(e.dockAssignedAt <= t)) return 'waiting'
  const inspected = e.loadingInspection?.inspectedAt
  if (!(inspected <= t)) return 'atDock'
  const released = e.release?.releasedAt
  if (!(released <= t)) return 'awaitingRelease'
  return 'released'
}

// Visits on site at some point between from and to.
const presentBetween = (entries, from, to, now) =>
  entries.filter((e) => {
    const a = arrivalMs(e)
    const b = endOf(e, now)
    return finite(a) && finite(b) && a < to && b > from
  })

// Trucks on site through one day, every 10 minutes up to now: a count per yard state, drops, and how
// many live trucks were already past free time.
export function yardTimeline(entries, date, now) {
  const start = dayStart(date)
  const end = Math.min(dayStart(shiftDate(date, 1)), now)
  const here = presentBetween(entries, start, end, now)
  const slots = []
  for (let t = start; t <= end; t += SLOT_MS) {
    const s = { t, waiting: 0, atDock: 0, awaitingRelease: 0, released: 0, drops: 0, overFree: 0, total: 0 }
    for (const e of here) {
      const a = arrivalMs(e)
      if (a > t || endOf(e, now) <= t) continue
      s.total++
      if (isDrop(e)) s.drops++
      else {
        s[stateAt(e, t)]++
        if (t - a > FREE_MS) s.overFree++
      }
    }
    slots.push(s)
  }
  const peak = slots.reduce((m, s) => (s.total > (m?.total ?? -1) ? s : m), null)
  return { date, start, end, slots, peak }
}

// Each dock's day: one bar per truck from dock assigned to check-out (or now), split at inspection and
// at Shipping's release; `freeEndsAt` is when that truck's free time ran out.
export function dockSchedule(entries, date, now) {
  const start = dayStart(date)
  const end = Math.min(dayStart(shiftDate(date, 1)), now)
  const docked = entries.filter((e) => e.dockAssignedAt && DOCKS.includes(dockKey(e.dockDoor)))
  return DOCKS.map((dock) => {
    const bars = docked
      .filter((e) => dockKey(e.dockDoor) === dock)
      .map((e) => {
        const from = e.dockAssignedAt
        const to = endOf(e, now)
        if (!finite(to) || to <= start || from >= end || to <= from) return null
        const inspected = e.loadingInspection?.inspectedAt
        const released = e.release?.releasedAt
        const cut = (x) => (finite(x) && x > from && x < to ? x : null)
        const i = cut(inspected)
        const r = cut(released)
        const segs = [
          { key: 'atDock', from, to: i ?? r ?? to },
          i != null && { key: 'awaitingRelease', from: i, to: r ?? to },
          r != null && { key: 'released', from: r, to },
        ].filter((s) => s && s.to > s.from)
        const s = visitStages(e, now)
        return { e, from, to, segs, onSite: !e.timeOut, freeEndsAt: isDrop(e) ? null : arrivalMs(e) + FREE_MS, stages: s }
      })
      .filter(Boolean)
      .sort((a, b) => a.from - b.from)
    const busyMs = bars.reduce((sum, b) => sum + Math.max(0, Math.min(b.to, end) - Math.max(b.from, start)), 0)
    return { dock, bars, busyMs }
  })
}

// The working hours of a day: from the hour before the first activity to the hour after the last (or
// now), at least 8 hours wide. Used for the chart windows and for dock use "during operating hours".
export function operatingWindow(timeline, schedule, now) {
  const active = timeline.slots.filter((s) => s.total > 0).map((s) => s.t)
  for (const row of schedule) for (const b of row.bars) active.push(b.from, Math.min(b.to, timeline.end))
  const start = timeline.start
  const dayEnd = start + 24 * HOUR
  if (!active.length) return { from: start + 6 * HOUR, to: start + 18 * HOUR }
  // Today's window runs at least to now.
  if (now < dayEnd) active.push(now)
  const hourAt = (t) => Math.floor((t - start) / HOUR)
  let from = start + Math.max(0, hourAt(Math.min(...active)) - 1) * HOUR
  let to = start + Math.min(24, hourAt(Math.max(...active)) + 2) * HOUR
  if (to - from < 8 * HOUR) {
    const pad = (8 * HOUR - (to - from)) / 2
    from = Math.max(start, from - Math.ceil(pad / HOUR) * HOUR)
    to = Math.min(dayEnd, from + 8 * HOUR)
  }
  return { from, to }
}

// Share of operating hours (window → now) the docks were in use, all docks together and per dock.
function dockUse(schedule, win, now) {
  const until = Math.min(win.to, now)
  const span = Math.max(0, until - win.from)
  if (!span) return { all: null, byDock: {} }
  const byDock = {}
  let busy = 0
  for (const row of schedule) {
    const b = row.bars.reduce((s, x) => s + Math.max(0, Math.min(x.to, until) - Math.max(x.from, win.from)), 0)
    byDock[row.dock] = b / span
    busy += b
  }
  return { all: busy / (span * schedule.length), byDock }
}

// One day, ready for the charts.
export function opsDay(entries, date, now) {
  const timeline = yardTimeline(entries, date, now)
  const schedule = dockSchedule(entries, date, now)
  const window = operatingWindow(timeline, schedule, now)
  return { date, timeline, schedule, window, use: dockUse(schedule, window, now) }
}

// Buckets of `size` from 0, the last one open-ended ("4h+").
export function histogram(values, size, buckets) {
  const bins = Array.from({ length: buckets }, (_, i) => ({ from: i * size, to: i === buckets - 1 ? null : (i + 1) * size, count: 0 }))
  for (const v of values) {
    if (!finite(v) || v < 0) continue
    bins[Math.min(buckets - 1, Math.floor(v / size))].count++
  }
  return bins
}

// Arrival against appointment, in 10-minute steps from an hour early to an hour late; the outer bins
// collect everything beyond.
export function arrivalSpread(visits) {
  const mins = visits.map(minutesLate).filter((m) => m !== null)
  const edges = []
  for (let m = -60; m < 60; m += 10) edges.push(m)
  const bins = [{ from: null, to: -60, count: 0 }, ...edges.map((m) => ({ from: m, to: m + 10, count: 0 })), { from: 60, to: null, count: 0 }]
  for (const m of mins) {
    if (m < -60) bins[0].count++
    else if (m >= 60) bins[bins.length - 1].count++
    else bins[1 + Math.floor((m + 60) / 10)].count++
  }
  return { bins, count: mins.length, median: percentile(mins, 0.5) }
}

// Everything the control-tower views need for a range. `targets` are minutes per handoff.
export function opsMetrics(entries, from, to, now, targets) {
  const today = dayKey(new Date(now))
  const dates = datesBetween(from, to).filter((d) => d <= today)
  const visits = entries.filter((e) => e.dateIn >= from && e.dateIn <= to)
  const live = visits.filter((e) => !isDrop(e)).map((e) => visitStages(e, now))
  const departed = live.filter((s) => !s.onSite)
  const stays = departed.map((s) => s.onSiteMs)

  // Per day: departures, median stay and dock use (sparklines), and dock time during operating hours.
  const dockTotals = Object.fromEntries(DOCKS.map((d) => [d, { busy: 0, span: 0 }]))
  const days = dates.map((date) => {
    const d = opsDay(entries, date, now)
    const until = Math.min(d.window.to, now)
    const span = Math.max(0, until - d.window.from)
    for (const row of d.schedule) {
      dockTotals[row.dock].span += span
      dockTotals[row.dock].busy += row.bars.reduce((s, x) => s + Math.max(0, Math.min(x.to, until) - Math.max(x.from, d.window.from)), 0)
    }
    const done = departed.filter((s) => s.e.dateIn === date).map((s) => s.onSiteMs)
    const out = entries.filter((e) => e.timeOut && dayKey(new Date(departureMs(e))) === date).length
    return {
      date,
      departures: out,
      medianStayMs: percentile(done, 0.5),
      dockUse: d.use.all,
      peakOnSite: d.timeline.peak?.total ?? 0,
    }
  })

  // How long each handoff took: middle (p50) and slow end (p90), against its target.
  const stages = HANDOFFS.map((h) => {
    const list = departed.map((s) => s[h.key]).filter((v) => v != null)
    const target = (targets?.[h.key] ?? h.target) * MIN
    return {
      ...h,
      n: list.length,
      p50: percentile(list, 0.5),
      p90: percentile(list, 0.9),
      max: list.length ? Math.max(...list) : null,
      target,
      onTargetPct: list.length ? list.filter((v) => v <= target).length / list.length : null,
    }
  })

  // On site right now, oldest first.
  const onSite = entries
    .filter((e) => !e.timeOut && arrivalMs(e) <= now)
    .map((e) => {
      const ageMs = now - arrivalMs(e)
      const drop = isDrop(e)
      return { e, ageMs, drop, state: drop ? 'drop' : stateAt(e, now), overMs: drop ? 0 : Math.max(0, ageMs - FREE_MS) }
    })
    .filter((x) => finite(x.ageMs))
    .sort((a, b) => b.ageMs - a.ageMs)
  const liveNow = onSite.filter((x) => !x.drop)
  const overNow = liveNow.filter((x) => x.overMs > 0)

  const dockUseByDock = Object.fromEntries(DOCKS.map((d) => [d, dockTotals[d].span ? dockTotals[d].busy / dockTotals[d].span : null]))
  const spans = DOCKS.reduce((s, d) => s + dockTotals[d].span, 0)

  return {
    days,
    stays: {
      count: stays.length,
      p50: percentile(stays, 0.5),
      p90: percentile(stays, 0.9),
      // 20-minute buckets, past the free time and the longest stays (up to 6 h), the last one open.
      bins: histogram(stays, 20 * MIN, Math.min(18, Math.max(Math.ceil((FREE_MS + HOUR) / (20 * MIN)), Math.ceil((percentile(stays, 0.99) ?? 0) / (20 * MIN)) + 2))),
      overFreePct: stays.length ? stays.filter((v) => v > FREE_MS).length / stays.length : null,
    },
    arrival: arrivalSpread(visits),
    stages,
    now: {
      onSite,
      live: liveNow.length,
      drops: onSite.length - liveNow.length,
      over: overNow.length,
      accruingPerHour: overNow.length * DETENTION_RATE_PER_HOUR,
      waiting: liveNow.filter((x) => x.state === 'waiting').length,
    },
    dockUse: spans ? DOCKS.reduce((s, d) => s + dockTotals[d].busy, 0) / spans : null,
    dockUseByDock,
  }
}
