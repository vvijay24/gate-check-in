// Trucks driving the yard map like real tractor-trailers. When a truck's spot changes between two
// renders of a map (it arrives, moves bay ↔ dock, or leaves) it drives there instead of jumping.
//
// How it moves:
// - Routes run on right-hand lanes: in through Gate 1 and up the left side, east along the drive lane
//   (docks) or the road (bays), down the right side and out through Gate 2. Westbound lanes sit beside
//   the eastbound ones for the few moves that need them, so trucks never meet head-on.
// - Corners are rounded, and the rig is articulated: the cab follows the path and the trailer is
//   pulled along behind its hitch (a "follow the leader" tractrix), so it swings wide on a turn.
// - Into a dock or bay a truck pulls past, stops and backs in. The backing move is a real pull-out of
//   that spot played in reverse, which keeps the trailer and cab angles physically right.
// - Speed follows the route (slower in turns, slow in reverse, easing into every stop), and trucks
//   watch the road ahead: one that would run into another stops and waits, and a truck backing in
//   always has the right of way.
import { useLayoutEffect, useRef, useState } from 'react'
import { A_AT, BAY_WY, DOCK_WY, F_AT, GATE_WX, K_AT, LOT_D, LOT_W, PARKED_ART, RIG_W, colWX } from './YardScene'

// Rig geometry: hitch to trailer axles, hitch to front axle.
const LT = K_AT - A_AT
const LW = F_AT - K_AT

// Lanes (world units). Docked rigs end at y ≈ 50 and bays start at 84, so the drive lane between has
// an eastbound and a westbound lane; the road below the bays likewise. Eastbound lanes are the ones
// trucks turn into off the left side, so they get the side with room for the trailer to cut the
// corner (away from the first bay and the guard shack).
const LANE_E = 62
const LANE_W = 75
const ROAD_E = 144
const ROAD_W = 154
const LEFT_X = GATE_WX[0] - 1
const RIGHT_X = GATE_WX[1] + 1
const STREET_Y = LOT_D + 18.5
const OFF_LEFT = -110
const OFF_RIGHT = LOT_W + 110
// Corner radius for the front axle, and the straight run a pull-out needs for the trailer to line up.
const TURN_R = 13
const STRAIGHT = 40

// Speeds (units per second) and how hard trucks speed up and brake.
const V_FWD = 56
const V_TURN = 28
const V_REV = 19
const ACC = 34
const DEC = 50
// Look-ahead for traffic, from the leading end of the rig.
const PROBES = [3, 8, 13, 18]
const GIVE_UP_MS = 6000

const parkedY = (spot) => (spot.kind === 'dock' ? DOCK_WY : BAY_WY)
// Where a rig parked in this spot has its center.
export const spotCenter = (spot) => [colWX(spot.i), parkedY(spot) + 24.5]
export const spotKey = (spot) => (spot ? `${spot.kind}${spot.i}` : '')

// ---------- Geometry ----------

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]]
const len = (v) => Math.hypot(v[0], v[1])
const norm = (v) => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l]
}
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
const angleOf = (v) => Math.atan2(v[1], v[0])
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// A dense path (points about 1 unit apart) through waypoints, each corner rounded with a curve whose
// size is limited by the legs on either side (the first and last legs can give their whole length).
function smoothPath(wps) {
  const w = wps.filter((p, i) => i === 0 || len(sub(p, wps[i - 1])) > 0.01)
  if (w.length < 2) return w.map((p) => [...p])
  const out = [w[0]]
  for (let i = 1; i < w.length - 1; i++) {
    const a = w[i - 1]
    const b = w[i]
    const c = w[i + 1]
    const inLen = len(sub(b, a))
    const outLen = len(sub(c, b))
    const r = Math.min(TURN_R, inLen * (i === 1 ? 0.9 : 0.5), outLen * (i === w.length - 2 ? 0.9 : 0.5))
    const p0 = lerp(b, a, r / inLen)
    const p1 = lerp(b, c, r / outLen)
    out.push(p0)
    // Quadratic curve with the corner as its control point.
    for (let k = 1; k <= 10; k++) {
      const t = k / 10
      const m0 = lerp(p0, b, t)
      const m1 = lerp(b, p1, t)
      out.push(lerp(m0, m1, t))
    }
  }
  out.push(w[w.length - 1])
  // Resample about every unit.
  const dense = [out[0]]
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]
    const b = out[i]
    const n = Math.max(1, Math.ceil(len(sub(b, a))))
    for (let k = 1; k <= n; k++) dense.push(lerp(a, b, k / n))
  }
  return dense
}

// A rig's configuration: front axle F, hitch K, trailer axles A.
const configAt = (F, tt, tr) => {
  const K = [F[0] - LW * Math.cos(tt), F[1] - LW * Math.sin(tt)]
  return { F, K, A: [K[0] - LT * Math.cos(tr), K[1] - LT * Math.sin(tr)] }
}
const parkedConfig = (spot) => {
  const x = colWX(spot.i)
  const y = parkedY(spot)
  return configAt([x, y + F_AT], Math.PI / 2, Math.PI / 2)
}

// Drive the front axle along `path` from configuration `c0`: the hitch follows the front axle and the
// trailer axles follow the hitch, each staying its length behind.
function towAlong(path, c0) {
  let { K, A } = c0
  return path.map((F) => {
    K = sub(F, scale(norm(sub(F, K)), LW))
    A = sub(K, scale(norm(sub(K, A)), LT))
    return { F, K, A }
  })
}
const scale = (v, k) => [v[0] * k, v[1] * k]

// Waypoints for the front axle pulling forward out of a spot and away along a lane, `dir` E or W,
// long enough for the trailer to straighten. Played backward, this is how a truck backs in.
function pullOutWaypoints(spot, dir) {
  const x = colWX(spot.i)
  const dock = spot.kind === 'dock'
  const y = dock ? (dir === 'E' ? LANE_E : LANE_W) : dir === 'E' ? ROAD_E : ROAD_W
  const wps = [[x, parkedY(spot) + F_AT], [x, y]]
  if (dir === 'E') {
    const end = x + TURN_R + STRAIGHT
    if (end <= RIGHT_X - TURN_R) wps.push([end, y])
    else wps.push([RIGHT_X, y], [RIGHT_X, Math.min(y + STRAIGHT, LOT_D - 2)])
  } else {
    const end = x - TURN_R - STRAIGHT
    if (end >= LEFT_X + TURN_R) wps.push([end, y])
    else if (!dock) wps.push([LEFT_X, y], [LEFT_X, y - STRAIGHT])
    else wps.push([LEFT_X + 2, y])
  }
  return wps
}

// The backing move into `spot`: a pull-out simulated from the parked rig, reversed, so it starts out
// on the lane and ends exactly parked.
function backIn(spot, dir) {
  const wps = pullOutWaypoints(spot, dir)
  const samples = towAlong(smoothPath(wps), parkedConfig(spot)).reverse()
  return { wps, samples }
}

// The approach to where a backing move starts: from `start` (the street, or pulling out of a spot)
// along the lanes to the last waypoint of that move's pull-out, arriving the same way it points.
function approach(startWps, back) {
  const end = back.wps[back.wps.length - 1]
  const before = back.wps[back.wps.length - 2]
  return [...startWps, ...turnOnto(startWps[startWps.length - 1], before, end), end]
}
// Corner waypoints that take a truck at `from` (heading along its lane) onto the line before → end.
function turnOnto(from, before, end) {
  // Both on the same horizontal or vertical line already: no corner needed.
  const horiz = Math.abs(before[1] - end[1]) < 0.01
  if (horiz && Math.abs(from[1] - end[1]) < 0.01) return []
  if (!horiz && Math.abs(from[0] - end[0]) < 0.01) return []
  return horiz ? [[from[0], end[1]]] : [[end[0], from[1]]]
}

// ---------- Routes ----------

// A drive as samples (configurations about a unit of front-axle travel apart) with the gear each is
// driven in: forward legs, then (for arrivals and moves) the backing move.
function plan(from, to) {
  const street = [[OFF_LEFT, STREET_Y], [LEFT_X, STREET_Y]]
  const leaveDock = (x) => [[x, DOCK_WY + F_AT], [x, LANE_E], [RIGHT_X, LANE_E], [RIGHT_X, STREET_Y], [OFF_RIGHT, STREET_Y]]
  const leaveBay = (x) => [[x, BAY_WY + F_AT], [x, ROAD_E], [RIGHT_X, ROAD_E], [RIGHT_X, STREET_Y], [OFF_RIGHT, STREET_Y]]

  if (!to) {
    const x = colWX(from.i)
    const path = smoothPath(from.kind === 'dock' ? leaveDock(x) : leaveBay(x))
    return { legs: [{ gear: 'F', samples: towAlong(path, parkedConfig(from)) }], kind: 'leave' }
  }

  const tx = colWX(to.i)
  let fwd
  let back
  if (!from) {
    // Arriving: east along the street, a left turn in at Gate 1, up the left side, then east along
    // the drive lane (docks) or the road (bays) past the spot.
    back = backIn(to, 'E')
    fwd = approach([...street, [LEFT_X, to.kind === 'dock' ? LANE_E : ROAD_E]], back)
  } else {
    const sx = colWX(from.i)
    const out = [sx, parkedY(from) + F_AT]
    if (to.kind === 'dock' && from.kind === 'dock') {
      back = backIn(to, tx >= sx ? 'E' : 'W')
      fwd = approach([out, [sx, tx >= sx ? LANE_E : LANE_W]], back)
    } else if (to.kind === 'bay' && from.kind === 'bay') {
      back = backIn(to, tx >= sx ? 'E' : 'W')
      fwd = approach([out, [sx, tx >= sx ? ROAD_E : ROAD_W]], back)
    } else if (to.kind === 'bay') {
      // Dock to bay: out east along the lane, down the right side, west along the road past the bay.
      back = backIn(to, 'W')
      fwd = approach([out, [sx, LANE_E], [RIGHT_X, LANE_E], [RIGHT_X, ROAD_W]], back)
    } else {
      // Bay to dock: out west along the road, up the left side, east along the lane past the dock.
      back = backIn(to, 'E')
      fwd = approach([out, [sx, ROAD_W], [LEFT_X, ROAD_W], [LEFT_X, LANE_E]], back)
    }
  }
  const path = smoothPath(fwd)
  const d0 = norm(sub(path[1], path[0]))
  const init = from ? parkedConfig(from) : configAt(path[0], angleOf(d0), angleOf(d0))
  const forward = towAlong(path, init)
  // Join the backing move to where the forward drive really ended: blend the cab and trailer angles
  // over the first stretch so nothing jumps.
  const end = forward[forward.length - 1]
  const first = back.samples[0]
  const dTt = wrap(angleOf(sub(end.F, end.K)) - angleOf(sub(first.F, first.K)))
  const dTr = wrap(angleOf(sub(end.K, end.A)) - angleOf(sub(first.K, first.A)))
  const BLEND = 18
  const reverse = back.samples.map((c, i) => {
    const w = Math.max(0, 1 - i / BLEND)
    if (!w) return c
    const tt = angleOf(sub(c.F, c.K)) + dTt * w
    const tr = angleOf(sub(c.K, c.A)) + dTr * w
    return configAt(c.F, tt, tr)
  })
  return {
    legs: [
      { gear: 'F', samples: forward },
      { gear: 'R', samples: reverse },
    ],
    kind: from ? 'move' : 'arrive',
  }
}

// Flatten the legs into one list of samples with distances, gears and a top speed at each, eased so a
// truck speeds up from a standstill and brakes to a stop at every gear change and at the end.
function profile(p) {
  const samples = []
  let s = 0
  for (const leg of p.legs) {
    leg.samples.forEach((c, i) => {
      if (samples.length) s += len(sub(c.F, samples[samples.length - 1].F))
      samples.push({ ...c, s, gear: leg.gear, stopAfter: i === leg.samples.length - 1 })
    })
  }
  const n = samples.length
  for (let i = 0; i < n; i++) {
    const c = samples[i]
    let v = c.gear === 'R' ? V_REV : V_FWD
    if (c.gear === 'F' && i > 0 && i < n - 1) {
      const a0 = angleOf(sub(samples[i - 1].F, samples[i - 1].K))
      const a1 = angleOf(sub(samples[i + 1].F, samples[i + 1].K))
      const ds = samples[i + 1].s - samples[i - 1].s || 1
      const turn = Math.abs(wrap(a1 - a0)) / ds
      if (turn > 0.012) v = Math.max(V_TURN, Math.min(V_FWD, 1.6 / turn))
    }
    c.vmax = v
  }
  // Brake into stops (gear changes; the end unless driving off the map), ease out of standstills.
  const endV = p.kind === 'leave' ? V_FWD : 0
  samples[n - 1].vmax = Math.min(samples[n - 1].vmax, endV)
  for (let i = n - 2; i >= 0; i--) {
    const stop = samples[i].stopAfter && samples[i + 1].gear !== samples[i].gear ? 0 : Infinity
    const ds = samples[i + 1].s - samples[i].s
    samples[i].vmax = Math.min(samples[i].vmax, stop, Math.sqrt(samples[i + 1].vmax ** 2 + 2 * DEC * ds))
  }
  const startV = p.kind === 'arrive' ? V_FWD : 0
  samples[0].vmax = Math.min(samples[0].vmax, Math.max(startV, 4))
  for (let i = 1; i < n; i++) {
    const ds = samples[i].s - samples[i - 1].s
    const fromStop = samples[i].gear !== samples[i - 1].gear ? 4 : samples[i - 1].vmax
    samples[i].vmax = Math.min(samples[i].vmax, Math.sqrt(fromStop ** 2 + 2 * ACC * ds) || 4)
  }
  for (const c of samples) c.vmax = Math.max(c.vmax, 3)
  const firstR = samples.find((c) => c.gear === 'R')
  return { samples, total: s, reverseAt: firstR ? firstR.s : Infinity }
}

// The sample at distance s (interpolated).
function sampleAt(prof, s) {
  const { samples } = prof
  let lo = 0
  let hi = samples.length - 1
  if (s <= 0) return samples[0]
  if (s >= samples[hi].s) return samples[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid].s <= s) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  const t = (s - a.s) / ((b.s - a.s) || 1)
  if (a.gear !== b.gear) return t < 0.5 ? a : b
  return { F: lerp(a.F, b.F, t), K: lerp(a.K, b.K, t), A: lerp(a.A, b.A, t), gear: a.gear, vmax: a.vmax + (b.vmax - a.vmax) * t }
}

// ---------- Pose for drawing ----------

const cardinal = (th) => {
  const a = wrap(th)
  if (Math.abs(a) <= Math.PI / 4) return 'E'
  if (Math.abs(a) >= (3 * Math.PI) / 4) return 'W'
  return a > 0 ? 'S' : 'N'
}

// A configuration as the map draws it: center, nearest compass heading, and the articulated pose.
function poseOf(c, opacity = 1) {
  const tt = angleOf(sub(c.F, c.K))
  const tr = angleOf(sub(c.K, c.A))
  const rear = sub(c.A, scale([Math.cos(tr), Math.sin(tr)], A_AT))
  const front = [c.F[0] + Math.cos(tt) * 3.7, c.F[1] + Math.sin(tt) * 3.7]
  const [cx, cy] = lerp(rear, front, 0.5)
  return { cx, cy, heading: cardinal(tt), opacity, art: { K: c.K, tt, tr }, reversing: c.gear === 'R' }
}

export const parkedArt = PARKED_ART

// Where a driving rig is now.
export function poseAt(drive) {
  const c = sampleAt(drive.prof, drive.s)
  const fade = 26
  const opacity =
    drive.kind === 'arrive' ? Math.min(1, drive.s / fade) : drive.kind === 'leave' ? Math.min(1, (drive.prof.total - drive.s) / fade) : 1
  return poseOf(c, Math.max(0, opacity))
}

// ---------- Traffic ----------

// The rig's two bodies as rectangles (a little padded), for "is anything in my way?" checks.
function bodies(c) {
  const rect = (from, to, pad) => {
    const u = norm(sub(to, from))
    const v = [-u[1], u[0]]
    const h = RIG_W / 2 + pad
    const a = sub(from, scale(u, pad))
    const b = [to[0] + u[0] * pad, to[1] + u[1] * pad]
    return [
      [a[0] + v[0] * h, a[1] + v[1] * h],
      [b[0] + v[0] * h, b[1] + v[1] * h],
      [b[0] - v[0] * h, b[1] - v[1] * h],
      [a[0] - v[0] * h, a[1] - v[1] * h],
    ]
  }
  const tr = norm(sub(c.K, c.A))
  const tt = norm(sub(c.F, c.K))
  const rear = sub(c.A, scale(tr, A_AT))
  const trailerFront = [c.K[0] + tr[0] * 2, c.K[1] + tr[1] * 2]
  const bumper = [c.F[0] + tt[0] * 3.7, c.F[1] + tt[1] * 3.7]
  return [rect(rear, trailerFront, 1.2), rect(sub(c.K, scale(tt, 3)), bumper, 1.2)]
}
function inside(p, poly) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
// Points just ahead of the rig's leading end (the bumper going forward, the trailer's rear backing).
function probes(c) {
  if (c.gear === 'R') {
    const tr = norm(sub(c.K, c.A))
    const rear = sub(c.A, scale(tr, A_AT))
    return PROBES.map((d) => sub(rear, scale(tr, d * 0.6)))
  }
  const tt = norm(sub(c.F, c.K))
  const bumper = [c.F[0] + tt[0] * 3.7, c.F[1] + tt[1] * 3.7]
  return PROBES.map((d) => [bumper[0] + tt[0] * d, bumper[1] + tt[1] * d])
}

// Who goes first when two trucks are in each other's way: a truck backing in, then the one that
// started first.
const rank = (d, c) => (c.gear === 'R' ? 0 : 1) * 1e13 + d.t0

// The ground a spot takes up, padded: a truck backs into it only once nothing else is in it.
function spotArea(spot) {
  const x = colWX(spot.i)
  const y = parkedY(spot)
  return [[x - 7, y - 1], [x + 7, y - 1], [x + 7, y + 53], [x - 7, y + 53]]
}
const overlaps = (a, b) => a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))

// Advance every drive by dt seconds: each wants its route's speed, but stops for a truck in its way.
function stepTraffic(drives, dt, now) {
  const list = [...drives.values()]
  const state = list.map((d) => {
    const c = sampleAt(d.prof, d.s)
    return { d, c, bodies: bodies(c), probes: probes(c) }
  })
  for (const me of state) {
    const { d, c } = me
    let blocked = false
    // About to back in (or backing): wait while anything else is still in the spot.
    if (d.area && d.s >= d.prof.reverseAt - 12) {
      blocked = state.some((other) => other !== me && other.bodies.some((b) => overlaps(b, d.area)))
    }
    if (!blocked && now - (d.waitSince ?? now) < GIVE_UP_MS) {
      for (const other of state) {
        if (other === me) continue
        const hits = me.probes.some((p) => other.bodies.some((b) => inside(p, b)))
        if (!hits) continue
        const mutual = other.probes.some((p) => me.bodies.some((b) => inside(p, b)))
        if (!mutual || rank(other.d, other.c) < rank(d, c)) {
          blocked = true
          break
        }
      }
    }
    const target = blocked ? 0 : c.vmax
    d.waitSince = blocked ? (d.waitSince ?? now) : null
    d.v = d.v < target ? Math.min(target, d.v + ACC * dt) : Math.max(target, d.v - DEC * 1.6 * dt)
    d.s = Math.min(d.prof.total, d.s + d.v * dt)
  }
}

// ---------- The hook ----------

// Last spots seen on a live map, kept between visits to a tab so that a truck checked in or out on
// the Gate tab drives in or out when the map is next shown. Forgotten after 15 minutes.
const LIVE_MEMORY = { at: 0, spots: null }
const MEMORY_MS = 15 * 60000

// `units`: [{ e, spot }] now on the map. `enabled`: drives happen (otherwise trucks jump, as when the
// viewer asks for reduced motion or a replay is scrubbed). `live`: remember spots between visits.
// `pace`: time runs this many times faster for the drives (a replay playing at speed).
// Returns the drives in progress by entry id (leaving ones carry their entry, which is no longer
// among `units`) and the current time, which changes every frame while anything drives.
export function useYardDrives(units, { enabled, live, pace = 1 }) {
  // Spots at the last render; null on the first render with nothing remembered, so the trucks
  // already on site don't all drive in when the map first appears.
  const prev = useRef(undefined)
  if (prev.current === undefined) {
    prev.current = live && LIVE_MEMORY.spots && Date.now() - LIVE_MEMORY.at < MEMORY_MS ? LIVE_MEMORY.spots : null
  }
  // Drives live in a ref and are stepped in place each frame; `now` re-renders the map.
  const drivesRef = useRef(new Map())
  const paceRef = useRef(pace)
  const clock = useRef(0)
  paceRef.current = pace
  const [now, setNow] = useState(() => performance.now())
  const [active, setActive] = useState(false)
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
      if (!was) started.push([id, u.e, null, u.spot])
      else if (spotKey(was.spot) !== spotKey(u.spot)) started.push([id, u.e, was.spot, u.spot])
    }
    for (const [id, was] of before) if (!next.has(id)) started.push([id, was.e, was.spot, null])
    if (!started.length) return
    started.forEach(([id, e, from, to], i) => {
      const p = plan(from, to)
      // Arrivals enter already rolling; everyone else starts from a standstill.
      drivesRef.current.set(id, {
        e,
        kind: p.kind,
        prof: profile(p),
        area: to ? spotArea(to) : null,
        s: 0,
        v: p.kind === 'arrive' ? V_FWD * 0.8 : 0,
        t0: t0 + i,
        waitSince: null,
      })
    })
    setActive(true)
    setNow(t0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, live])

  // Animate while anything is driving; drop each drive when it reaches the end of its route.
  useLayoutEffect(() => {
    if (!active) return
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(t) {
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000)) * paceRef.current
      last = t
      const drives = drivesRef.current
      clock.current += dt * 1000
      stepTraffic(drives, dt, clock.current)
      for (const [id, d] of drives) if (d.s >= d.prof.total - 0.01) drives.delete(id)
      setNow(t)
      if (!drives.size) {
        setActive(false)
        return
      }
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [active])

  const drives = drivesRef.current
  return { drives, now }
}

// For tests and tooling: a route's samples for a move.
export const routeSamples = (from, to) => profile(plan(from, to))
