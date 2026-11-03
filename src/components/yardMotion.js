// Trucks driving the yard map's real routes. When a truck's spot changes between two renders of a map
// (it arrives, moves bay → dock, or leaves), it drives there instead of jumping: in through Gate 1 and
// up the left side of the lot, along the road or the drive lane, and backed into its bay or dock; out
// along the lane or the road, down the right side and through Gate 2 onto the street.
//
// A route is a start point and legs; each leg is where the rig's center goes and which way its cab
// faces meanwhile (it may be reversing, as when backing into a dock). Headings: S (+y, toward the
// street, how trucks park), N, E, W. At each corner the rig turns in place.
import { useLayoutEffect, useRef, useState } from 'react'
import { BAY_WY, DOCK_WY, GATE_WX, LOT_D, LOT_W, RIG_L, colWX } from './YardScene'

const LANE_Y = 70
const ROAD_Y = 150
const LEFT_X = GATE_WX[0] - 1
const RIGHT_X = GATE_WX[1] + 1
const STREET_Y = LOT_D + 13
const OFF_LEFT = -90
const OFF_RIGHT = LOT_W + 90
// World units (about feet) per second, and the longest a drive may take.
const SPEED = 70
const MAX_MS = 7000

// Where a rig parked in this spot has its center.
export const spotCenter = (spot) => [colWX(spot.i), (spot.kind === 'dock' ? DOCK_WY : BAY_WY) + RIG_L / 2]
export const spotKey = (spot) => (spot ? `${spot.kind}${spot.i}` : '')

function route(from, to) {
  const legs = []
  let start
  const go = (x, y, heading) => legs.push({ to: [x, y], heading })
  const side = (x0, x1) => (x1 >= x0 ? 'E' : 'W')
  if (!from) {
    // Arriving: along the street, in through Gate 1, up the left side.
    start = [OFF_LEFT, STREET_Y]
    go(LEFT_X, STREET_Y, 'E')
    const [cx, cy] = spotCenter(to)
    if (to.kind === 'bay') {
      go(LEFT_X, ROAD_Y, 'N')
      go(cx, ROAD_Y, 'E')
    } else {
      go(LEFT_X, LANE_Y, 'N')
      go(cx, LANE_Y, 'E')
    }
    go(cx, cy, 'S')
  } else if (!to) {
    // Leaving: pull forward out of the spot, across to the right side, out through Gate 2.
    start = spotCenter(from)
    const y = from.kind === 'dock' ? LANE_Y : ROAD_Y
    go(start[0], y, 'S')
    go(RIGHT_X, y, 'E')
    go(RIGHT_X, STREET_Y, 'S')
    go(OFF_RIGHT, STREET_Y, 'E')
  } else {
    start = spotCenter(from)
    const [cx, cy] = spotCenter(to)
    if (to.kind === 'dock') {
      // To a dock: out into the drive lane, along it, and back in.
      go(start[0], LANE_Y, 'S')
      go(cx, LANE_Y, side(start[0], cx))
      go(cx, cy, 'S')
    } else if (from.kind === 'bay') {
      go(start[0], ROAD_Y, 'S')
      go(cx, ROAD_Y, side(start[0], cx))
      go(cx, cy, 'S')
    } else {
      // Dock to bay: down the lane to the right side, round onto the road, back into the bay.
      go(start[0], LANE_Y, 'S')
      go(RIGHT_X, LANE_Y, 'E')
      go(RIGHT_X, ROAD_Y, 'S')
      go(cx, ROAD_Y, 'W')
      go(cx, cy, 'S')
    }
  }
  // Drop legs that go nowhere.
  const out = []
  let at = start
  for (const leg of legs) {
    const len = Math.hypot(leg.to[0] - at[0], leg.to[1] - at[1])
    if (len > 0.01) out.push({ from: at, to: leg.to, heading: leg.heading, len })
    at = leg.to
  }
  return { start, legs: out, total: out.reduce((s, l) => s + l.len, 0) }
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

// Where a driving rig is `ms` into its drive: center, heading, and opacity (fading in from or out to
// the street's ends).
export function poseAt(drive, now) {
  const { r, start, duration, kind } = drive
  const t = Math.min(1, Math.max(0, (now - start) / duration))
  let d = ease(t) * r.total
  let leg = r.legs[0]
  for (const l of r.legs) {
    leg = l
    if (d <= l.len) break
    d -= l.len
  }
  const f = leg.len ? Math.min(1, d / leg.len) : 1
  const cx = leg.from[0] + (leg.to[0] - leg.from[0]) * f
  const cy = leg.from[1] + (leg.to[1] - leg.from[1]) * f
  const opacity = kind === 'arrive' ? Math.min(1, t / 0.08) : kind === 'leave' ? Math.min(1, (1 - t) / 0.08) : 1
  return { cx, cy, heading: leg.heading, opacity }
}

// Last spots seen on a live map, kept between visits to a tab so that a truck checked in or out on
// the Gate tab drives in or out when the map is next shown. Forgotten after 15 minutes.
const LIVE_MEMORY = { at: 0, spots: null }
const MEMORY_MS = 15 * 60000

// `units`: [{ e, spot }] now on the map. `enabled`: drives happen (otherwise trucks jump, as when the
// viewer asks for reduced motion or a replay is scrubbed). `live`: remember spots between visits.
// Returns the drives in progress by entry id (leaving ones carry their entry, which is no longer
// among `units`) and the current time for posing them.
export function useYardDrives(units, { enabled, live }) {
  // Spots at the last render; null on the first render with nothing remembered, so the trucks
  // already on site don't all drive in when the map first appears.
  const prev = useRef(undefined)
  if (prev.current === undefined) {
    prev.current = live && LIVE_MEMORY.spots && Date.now() - LIVE_MEMORY.at < MEMORY_MS ? LIVE_MEMORY.spots : null
  }
  const [drives, setDrives] = useState(() => new Map())
  const [now, setNow] = useState(() => performance.now())
  const key = units.map((u) => `${u.e.id}:${spotKey(u.spot)}`).join('|')

  // Before the browser paints, start a drive for every truck whose spot changed, so a new truck
  // never flashes at its spot first.
  useLayoutEffect(() => {
    const next = new Map(units.map((u) => [u.e.id, { spot: u.spot, e: u.e }]))
    const before = prev.current
    prev.current = next
    if (live) {
      LIVE_MEMORY.spots = next
      LIVE_MEMORY.at = Date.now()
    }
    if (!enabled || !before) return
    const t0 = performance.now()
    const started = []
    for (const [id, u] of next) {
      const was = before.get(id)
      if (!was) started.push([id, { kind: 'arrive', r: route(null, u.spot), e: u.e }])
      else if (spotKey(was.spot) !== spotKey(u.spot)) started.push([id, { kind: 'move', r: route(was.spot, u.spot), e: u.e }])
    }
    for (const [id, was] of before) {
      if (!next.has(id)) started.push([id, { kind: 'leave', r: route(was.spot, null), e: was.e }])
    }
    if (!started.length) return
    setDrives((cur) => {
      const m = new Map(cur)
      for (const [id, d] of started) m.set(id, { ...d, start: t0, duration: Math.min(MAX_MS, Math.max(1600, (d.r.total / SPEED) * 1000)) })
      return m
    })
    setNow(t0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, live])

  // Animate while anything is driving; drop each drive when it ends.
  const active = drives.size > 0
  useLayoutEffect(() => {
    if (!active) return
    let raf = requestAnimationFrame(function tick(t) {
      setNow(t)
      setDrives((cur) => {
        let changed = false
        const m = new Map()
        for (const [id, d] of cur) {
          if (t - d.start >= d.duration) changed = true
          else m.set(id, d)
        }
        return changed ? m : cur
      })
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [active])

  return { drives, now }
}
