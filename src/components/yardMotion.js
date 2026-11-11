// Trucks driving the yard map like real tractor-trailers. When a truck's spot changes between two
// renders of a map (it arrives, moves bay ↔ dock, or leaves) it drives there instead of jumping.
//
// How it works:
// - Geometry: the rig is articulated. The front axle follows the route, the hitch follows the front
//   axle and the trailer follows the hitch ("follow the leader"), so the trailer swings and cuts
//   corners like a real one. Corners are wide curves, and trucks pull well out of a spot before
//   turning.
// - Parking: a truck pulls past its spot, stops, and backs in. The backing move is a real pull-out
//   of that spot played in reverse, so it ends exactly parked.
// - Routes: each move has a few candidate routes (out east or west, round by the left or the right
//   side, or the long way round). Where a turn's inside faces a row of parked trucks the driver
//   swings wide into the open space first. Every move has at least one route whose sweep stays
//   clear of every other spot and the guard shack, and only routes clear of parked trucks are used.
// - Traffic: every drive is planned in space and time before it starts. A new drive is checked
//   against the drives already under way, moment by moment, and waits where a driver would (parked
//   in its spot, out on the street, or stopped at the pull-past point before backing in) until its
//   way is clear. Nothing moves into a place another truck will be at that moment, so trucks can't
//   clash; and once the others are done the yard stands still and a clear route is always open, so
//   nothing can deadlock. Trucks swapping spots: one pulls over on a side road (or, if that won't
//   do, goes round the block and back in at Gate 1) while the other gets out of its way.
import { useLayoutEffect, useRef, useState } from 'react'
import { A_AT, BAY_WY, DOCK_WY, F_AT, GATE_WX, K_AT, LOT_D, LOT_W, RIG_W, SHACK, colWX } from './YardScene'

// Rig geometry: hitch to trailer axles, hitch to front axle.
const LT = K_AT - A_AT
const LW = F_AT - K_AT

// The drive lane (between the docks and the bays) and the road (between the bays and the front
// fence) each run along one center line; trucks never meet on them because drives are scheduled.
const LANE_Y = 74
const ROAD_Y = 155
const LEFT_X = GATE_WX[0] - 4
const RIGHT_X = GATE_WX[1] + 4
const STREET_Y = LOT_D + 18.5
const OFF_LEFT = -110
const OFF_RIGHT = LOT_W + 110
// Corner radius for the front axle, and the straight run after a pull-out for the trailer to line up.
const TURN_R = 18
const STRAIGHT = 38

// Speeds (units per second; a rig is 49 long, about 70 ft) and how hard trucks speed up and brake:
// yard pace, a bit quicker than life so a move doesn't take minutes. Walking pace in reverse.
const V_FWD = 30
const V_TURN = 15
const V_REV = 8
const ACC = 9
const DEC = 13
// The pause at the gear change before backing.
const SHIFT = 1

// Scheduling: time step for the clash checks, step and limit for the waits tried.
const DT = 0.1
// Clearance kept between rigs in the plan.
const GAP = 2
// Clearance (each side) between a moving truck and a parked one.
const PARK_PAD = 0.4
const WAIT_STEP = 0.5
const MAX_WAIT = 90
const MAX_CUSP = 25
// How long a ring's first truck may pull over for; past that it goes round the block (seconds).
const RING_HOLDS = [10]
const RING_PATIENCE = 40
const AROUND_BLOCK = 5

const parkedY = (spot) => (spot.kind === 'dock' ? DOCK_WY : BAY_WY)
const laneOf = (spot) => (spot.kind === 'dock' ? LANE_Y : ROAD_Y)
// Where a rig parked in this spot has its center.
export const spotCenter = (spot) => [colWX(spot.i), parkedY(spot) + 24.5]
export const spotKey = (spot) => (spot ? `${spot.kind}${spot.i}` : '')

// ---------- Geometry ----------

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]]
const add = (p, q) => [p[0] + q[0], p[1] + q[1]]
const scale = (v, k) => [v[0] * k, v[1] * k]
const len = (v) => Math.hypot(v[0], v[1])
const norm = (v) => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l]
}
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
const angleOf = (v) => Math.atan2(v[1], v[0])
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// A dense path (points about 1 unit apart) through waypoints, each corner rounded by a curve whose
// size is limited by the legs on either side (the first and last legs can give nearly all of theirs).
// Swing wide at the corners where the lanes meet the side roads, the way a driver does: when the
// inside of a turn faces a row of parked trucks, the corner is taken out in the open space beyond
// the lane (between the docks, or toward the front fence), so the trailer's cut stays clear of them.
const SWING_DOCK = 16
const SWING_ROAD = 9
const SWING_RUN = 36
const SWING_RET = 22
function swingCorners(wps) {
  const out = [wps[0]]
  for (let i = 1; i < wps.length - 1; i++) {
    const p = wps[i]
    const side = Math.abs(p[0] - LEFT_X) < 0.01 || Math.abs(p[0] - RIGHT_X) < 0.01
    const lane = Math.abs(p[1] - LANE_Y) < 0.01 ? 'dock' : Math.abs(p[1] - ROAD_Y) < 0.01 ? 'road' : null
    const din = norm(sub(p, wps[i - 1]))
    const dout = norm(sub(wps[i + 1], p))
    const inner = dout[1] - din[1]
    const shift = !side || !lane ? 0 : lane === 'dock' && inner > 0.5 ? -SWING_DOCK : lane === 'road' && inner < -0.5 ? SWING_ROAD : 0
    if (!shift) {
      out.push(p)
      continue
    }
    // Out to the swung corner, a straight on that line for the trailer to come round, then back.
    const corner = [p[0], p[1] + shift]
    if (Math.abs(din[1]) < 0.01) {
      const room = len(sub(p, wps[i - 1]))
      const run = Math.min(SWING_RUN, room * 0.45)
      const ret = Math.min(SWING_RET, room * 0.45)
      out.push(sub(p, scale(din, run + ret)), add(corner, scale(din, -run)), corner)
    } else {
      const room = len(sub(wps[i + 1], p))
      const run = Math.min(SWING_RUN, room * 0.45)
      const ret = Math.min(SWING_RET, room * 0.45)
      out.push(corner, add(corner, scale(dout, run)), add(p, scale(dout, run + ret)))
    }
  }
  out.push(wps[wps.length - 1])
  return out
}

function smoothPath(raw) {
  const wps = swingCorners(raw)
  const w = wps.filter((p, i) => i === 0 || len(sub(p, wps[i - 1])) > 0.01)
  if (w.length < 2) return w.map((p) => [...p])
  const out = [w[0]]
  for (let i = 1; i < w.length - 1; i++) {
    const a = w[i - 1]
    const b = w[i]
    const c = w[i + 1]
    const inLen = len(sub(b, a))
    const outLen = len(sub(c, b))
    const r = Math.min(TURN_R, inLen * (i === 1 ? 0.95 : 0.5), outLen * (i === w.length - 2 ? 0.95 : 0.5))
    const p0 = lerp(b, a, r / inLen)
    const p1 = lerp(b, c, r / outLen)
    out.push(p0)
    for (let k = 1; k <= 12; k++) {
      const t = k / 12
      out.push(lerp(lerp(p0, b, t), lerp(b, p1, t), t))
    }
  }
  out.push(w[w.length - 1])
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
const parkedConfig = (spot) => configAt([colWX(spot.i), parkedY(spot) + F_AT], Math.PI / 2, Math.PI / 2)

// Drive the front axle along `path` from configuration `c0`; hitch and trailer follow.
function towAlong(path, c0) {
  let { K, A } = c0
  return path.map((F) => {
    K = sub(F, scale(norm(sub(F, K)), LW))
    A = sub(K, scale(norm(sub(K, A)), LT))
    return { F, K, A }
  })
}

// The rig's two bodies as rectangles (padded by `pad`).
function bodies(c, pad = 1) {
  const rect = (from, to) => {
    const u = norm(sub(to, from))
    const v = [-u[1], u[0]]
    const h = RIG_W / 2 + pad
    const a = sub(from, scale(u, pad))
    const b = add(to, scale(u, pad))
    return [add(a, scale(v, h)), add(b, scale(v, h)), sub(b, scale(v, h)), sub(a, scale(v, h))]
  }
  const tr = norm(sub(c.K, c.A))
  const tt = norm(sub(c.F, c.K))
  return [rect(sub(c.A, scale(tr, A_AT)), add(c.K, scale(tr, 2))), rect(sub(c.K, scale(tt, 3)), add(c.F, scale(tt, 3.7)))]
}
// Separating-axis test for two convex quads.
function quadsHit(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % 4]
      const ax = [q[1] - p[1], p[0] - q[0]]
      let amin = Infinity
      let amax = -Infinity
      let bmin = Infinity
      let bmax = -Infinity
      for (const r of a) {
        const d = r[0] * ax[0] + r[1] * ax[1]
        amin = Math.min(amin, d)
        amax = Math.max(amax, d)
      }
      for (const r of b) {
        const d = r[0] * ax[0] + r[1] * ax[1]
        bmin = Math.min(bmin, d)
        bmax = Math.max(bmax, d)
      }
      if (amax < bmin || bmax < amin) return false
    }
  }
  return true
}
const rigsHit = (ba, bb) => {
  // Quick reject (a rig spans under 60 units, so two whose corners are 130 apart can't touch).
  const ca = ba[0][0]
  const cb = bb[0][0]
  if (Math.abs(ca[0] - cb[0]) > 130 || Math.abs(ca[1] - cb[1]) > 130) return false
  return ba.some((x) => bb.some((y) => quadsHit(x, y)))
}

// ---------- Routes ----------

// Front-axle waypoints for pulling forward out of a spot and away along its lane (`dir` E or W),
// with enough straight for the trailer to line up; near the lot's edge the run continues down the
// right side or up the left. Played backward, this is how a truck backs in.
function pullOutWaypoints(spot, dir) {
  const x = colWX(spot.i)
  const y = laneOf(spot)
  const wps = [[x, parkedY(spot) + F_AT], [x, y]]
  if (dir === 'E') {
    // A full straight if there's room; a shorter one will do short of the side; else round the corner.
    if (x + TURN_R + 8 <= RIGHT_X - 5) wps.push([Math.min(x + TURN_R + STRAIGHT, RIGHT_X - 5), y])
    else wps.push([RIGHT_X, y], [RIGHT_X, spot.kind === 'dock' ? y + STRAIGHT : LOT_D - 4])
  } else {
    if (x - TURN_R - 8 >= LEFT_X + 5) wps.push([Math.max(x - TURN_R - STRAIGHT, LEFT_X + 5), y])
    else wps.push([LEFT_X, y], [LEFT_X, y - STRAIGHT])
  }
  return wps
}
const backIn = (spot, dir) => {
  const wps = pullOutWaypoints(spot, dir)
  return { wps, samples: towAlong(smoothPath(wps), parkedConfig(spot)).reverse() }
}
// Corner waypoints that take a truck at `from` onto the line before → end, then `end`.
function onto(from, back) {
  const end = back.wps[back.wps.length - 1]
  const before = back.wps[back.wps.length - 2]
  const horiz = Math.abs(before[1] - end[1]) < 0.01
  if (horiz && Math.abs(from[1] - end[1]) < 0.01) return [end]
  if (!horiz && Math.abs(from[0] - end[0]) < 0.01) return [end]
  return [horiz ? [from[0], end[1]] : [end[0], from[1]], end]
}

// Candidate routes for a move, each as forward waypoints plus (unless leaving) a backing move.
function candidates(from, to) {
  const street = [[OFF_LEFT, STREET_Y], [LEFT_X, STREET_Y]]
  const list = []
  if (!to) {
    const sx = colWX(from.i)
    const y = laneOf(from)
    const out = [sx, parkedY(from) + F_AT]
    const exit = [[RIGHT_X, STREET_Y], [OFF_RIGHT, STREET_Y]]
    list.push({ wps: [out, [sx, y], [RIGHT_X, y], ...exit] })
    // West, round by the left side and the other lane.
    const other = y === LANE_Y ? ROAD_Y : LANE_Y
    list.push({ wps: [out, [sx, y], [LEFT_X, y], [LEFT_X, other], [RIGHT_X, other], ...exit] })
    return list
  }
  const ty = laneOf(to)
  if (!from) {
    // In at Gate 1 and up the left side, then east to the spot; or round by the right side and west.
    const e = backIn(to, 'E')
    list.push({ wps: [...street, [LEFT_X, ty], ...onto([LEFT_X, ty], e)], back: e })
    const w = backIn(to, 'W')
    const via = ty === LANE_Y ? ROAD_Y : LANE_Y
    list.push({ wps: [...street, [LEFT_X, via], [RIGHT_X, via], [RIGHT_X, ty], ...onto([RIGHT_X, ty], w)], back: w })
    return list
  }
  const sx = colWX(from.i)
  const sy = laneOf(from)
  const out = [sx, parkedY(from) + F_AT]
  const tx = colWX(to.i)
  for (const d1 of ['E', 'W']) {
    if (sy === ty) {
      // Same lane: carry on toward the target if it is ahead.
      if ((d1 === 'E') === tx > sx) {
        const b = backIn(to, d1)
        list.push({ wps: [out, [sx, sy], ...onto([sx, sy], b)], back: b })
      } else {
        // Or the long way: away from it, round the other lane, and back along this one toward it.
        const side = d1 === 'E' ? RIGHT_X : LEFT_X
        const far = d1 === 'E' ? LEFT_X : RIGHT_X
        const other = sy === LANE_Y ? ROAD_Y : LANE_Y
        const b = backIn(to, d1 === 'E' ? 'E' : 'W')
        list.push({ wps: [out, [sx, sy], [side, sy], [side, other], [far, other], [far, ty], ...onto([far, ty], b)], back: b })
      }
    } else {
      // Other lane: along to the side, across, and back along the target's lane.
      const side = d1 === 'E' ? RIGHT_X : LEFT_X
      const b = backIn(to, d1 === 'E' ? 'W' : 'E')
      list.push({ wps: [out, [sx, sy], [side, sy], [side, ty], ...onto([side, ty], b)], back: b })
    }
  }
  return list
}

// Simulate a candidate: forward samples (front axle along the smoothed waypoints), then the backing
// move, with the joint blended so nothing jumps.
function simulate(cand, from) {
  const path = smoothPath(cand.wps)
  const d0 = norm(sub(path[1], path[0]))
  const forward = towAlong(path, from ? parkedConfig(from) : configAt(path[0], angleOf(d0), angleOf(d0)))
  if (!cand.back) return [{ gear: 'F', samples: forward }]
  const end = forward[forward.length - 1]
  const first = cand.back.samples[0]
  const dTt = wrap(angleOf(sub(end.F, end.K)) - angleOf(sub(first.F, first.K)))
  const dTr = wrap(angleOf(sub(end.K, end.A)) - angleOf(sub(first.K, first.A)))
  const BLEND = 20
  const reverse = cand.back.samples.map((c, i) => {
    const w = Math.max(0, 1 - i / BLEND)
    return w ? configAt(c.F, angleOf(sub(c.F, c.K)) + dTt * w, angleOf(sub(c.K, c.A)) + dTr * w) : c
  })
  return [
    { gear: 'F', samples: forward },
    { gear: 'R', samples: reverse },
  ]
}

// Speeds along the route and the time at each sample: slower in turns and in reverse, easing out of
// every standstill and into every stop (the gear change, and the end unless driving off the map).
function timeline(legs, kind) {
  const samples = []
  let s = 0
  for (const leg of legs) {
    leg.samples.forEach((c, i) => {
      if (samples.length) s += len(sub(c.F, samples[samples.length - 1].F))
      samples.push({ ...c, s, gear: leg.gear, last: i === leg.samples.length - 1 })
    })
  }
  const n = samples.length
  for (let i = 0; i < n; i++) {
    const c = samples[i]
    let v = c.gear === 'R' ? V_REV : V_FWD
    if (c.gear === 'F' && i > 0 && i < n - 1) {
      const a0 = angleOf(sub(samples[i - 1].F, samples[i - 1].K))
      const a1 = angleOf(sub(samples[i + 1].F, samples[i + 1].K))
      const turn = Math.abs(wrap(a1 - a0)) / (samples[i + 1].s - samples[i - 1].s || 1)
      if (turn > 0.01) v = Math.max(V_TURN, Math.min(V_FWD, 1.8 / turn))
    }
    c.v = v
  }
  samples[n - 1].v = kind === 'leave' ? V_FWD : 0
  for (let i = n - 2; i >= 0; i--) {
    const stop = samples[i].last && samples[i + 1].gear !== samples[i].gear ? 0 : Infinity
    samples[i].v = Math.min(samples[i].v, stop, Math.sqrt(samples[i + 1].v ** 2 + 2 * DEC * (samples[i + 1].s - samples[i].s)))
  }
  samples[0].v = kind === 'arrive' ? Math.min(samples[0].v, V_FWD * 0.8) : 0
  for (let i = 1; i < n; i++) {
    const prev = samples[i].gear !== samples[i - 1].gear ? 0 : samples[i - 1].v
    samples[i].v = Math.min(samples[i].v, Math.sqrt(prev ** 2 + 2 * ACC * (samples[i].s - samples[i - 1].s)))
  }
  let t = 0
  samples[0].t = 0
  for (let i = 1; i < n; i++) {
    const ds = samples[i].s - samples[i - 1].s
    t += ds ? ds / Math.max(1.5, (samples[i].v + samples[i - 1].v) / 2) : SHIFT
    samples[i].t = t
  }
  const cusp = samples.findIndex((c, i) => i > 0 && c.gear !== samples[i - 1].gear)
  return { samples, total: t, cuspT: cusp > 0 ? samples[cusp - 1].t : t }
}

// The configuration `t` seconds into a timeline (no waits).
function configAtTime(tl, t) {
  const { samples } = tl
  if (t <= 0) return samples[0]
  if (t >= tl.total) return samples[samples.length - 1]
  let lo = 0
  let hi = samples.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  if (a.gear !== b.gear) return a
  const k = (t - a.t) / ((b.t - a.t) || 1)
  return { F: lerp(a.F, b.F, k), K: lerp(a.K, b.K, k), A: lerp(a.A, b.A, k), gear: a.gear }
}

// A scheduled drive's configuration at drive-clock time T (null when it isn't on the map: an
// arrival still waiting out on the street, or a truck that has left).
function driveConfig(d, T) {
  if (d.parts) return driveConfig(T < driveEnd(d.parts[0]) ? d.parts[0] : d.parts[1], T)
  let t = T - d.start - d.waitStart
  if (t < 0) return d.kind === 'arrive' ? null : d.tl.samples[0]
  if (d.hold && t > d.hold.at) t = t < d.hold.at + d.hold.dur ? d.hold.at : t - d.hold.dur
  if (t > d.tl.cuspT) t = t < d.tl.cuspT + d.waitCusp ? d.tl.cuspT : t - d.waitCusp
  if (t >= d.tl.total) return d.kind === 'leave' ? null : d.tl.samples[d.tl.samples.length - 1]
  return configAtTime(d.tl, t)
}
const driveEnd = (d) => d.parts ? driveEnd(d.parts[1]) : d.start + d.waitStart + (d.hold?.dur ?? 0) + d.waitCusp + d.tl.total
// Whether a drive's truck is standing in a spot at time T (not yet away, or parked at the end).
function atRest(d, T) {
  if (d.parts) return atRest(T < driveEnd(d.parts[0]) ? d.parts[0] : d.parts[1], T)
  return !d.tl.total || (d.kind !== 'arrive' && T < d.start + d.waitStart) || (d.kind !== 'leave' && T >= driveEnd(d))
}
const cuspAt = (d) => d.start + d.waitStart + (d.hold?.dur ?? 0) + d.tl.cuspT

// ---------- Planning ----------

// Parked trucks and the guard shack as obstacles (rectangles).
const shackRect = [[SHACK.x - 1, SHACK.y - 1], [SHACK.x + 11, SHACK.y - 1], [SHACK.x + 11, SHACK.y + 11], [SHACK.x - 1, SHACK.y + 11]]

// How many samples of a route sweep over a parked truck or the shack.
function staticHits(legs, parked) {
  let hits = 0
  for (const leg of legs) {
    for (let i = 0; i < leg.samples.length; i += 2) {
      const b = bodies(leg.samples[i], PARK_PAD)
      if (b.some((q) => quadsHit(q, shackRect))) hits++
      for (const p of parked) if (rigsHit(b, p)) hits++
    }
  }
  return hits
}

// Where along a timeline to pull over on a side road between the lanes, out of everyone's way:
// the moment the rig there is most nearly straight (null if the route doesn't use a side road).
function sideStop(tl) {
  let best = null
  for (const c of tl.samples) {
    // Well short of the pull-past point, which is where it would block the spots it's backing into.
    if (c.gear !== 'F' || c.F[1] < LANE_Y + 20 || c.F[1] > ROAD_Y - 8 || c.t > tl.cuspT - 5) continue
    const side = Math.abs(c.F[0] - LEFT_X) < 1 ? LEFT_X : Math.abs(c.F[0] - RIGHT_X) < 1 ? RIGHT_X : null
    if (side == null) continue
    const off = Math.abs(c.A[0] - side)
    if (!best || off < best.off) best = { off, t: c.t }
  }
  return best ? best.t : null
}

// Plan a drive from `from` to `to` (either may be null), starting at drive-clock time `now`: pick
// the clearest, shortest route, then the shortest waits that keep it clear of every drive already
// planned. `parked`: bodies of trucks standing still in their spots.
function planDrive(from, to, now, others, parked, { hold = 0, fallback = true, after = now, patience = Infinity } = {}) {
  const kind = !to ? 'leave' : from ? 'move' : 'arrive'
  let routes = candidates(from, to).map((cand) => {
    const legs = simulate(cand, from)
    const tl = timeline(legs, kind)
    return { hits: staticHits(legs, parked), tl, holdAt: hold ? sideStop(tl) : null }
  })
  // Only routes clear of parked trucks (if there are any); holding to let another truck out first
  // also takes a route with a side road to wait on.
  const fewest = Math.min(...routes.map((r) => r.hits))
  routes = routes.filter((r) => r.hits === fewest)
  if (hold && routes.some((r) => r.holdAt != null)) routes = routes.filter((r) => r.holdAt != null)

  // Times at which a plan is checked, and the other drives' bodies then (cached).
  const cache = new Map()
  const othersAt = (T) => {
    const key = Math.round(T / DT)
    if (!cache.has(key)) {
      const list = []
      for (const o of others) {
        const c = driveConfig(o, T)
        // A truck standing in a spot is owed only parked clearance, a moving one the full gap.
        if (c) list.push(bodies(c, atRest(o, T) ? PARK_PAD * 2 - GAP / 2 : GAP / 2))
      }
      cache.set(key, list)
    }
    return cache.get(key)
  }
  // The first moment in [t0, t1] the drive touches another (null if none).
  // While standing in its spot a truck is only owed the clearance parked trucks get (see staticHits).
  const firstHit = (d, t0, t1, pad = GAP / 2) => {
    for (let T = t0; T <= t1 + 1e-6; T += DT) {
      const c = driveConfig(d, T)
      if (!c) continue
      const b = bodies(c, pad)
      if (othersAt(T).some((o) => rigsHit(b, o))) return T
    }
    return null
  }
  // Once every other drive is done the yard stands still, so a route that clears the parked trucks
  // is clear from then on: waiting that long always works, and nothing can deadlock.
  const horizon = Math.max(now, ...others.map(driveEnd))
  const limit = Math.min(patience, Math.max(MAX_WAIT, horizon - now + WAIT_STEP))
  const step = (w) => (w < 8 ? WAIT_STEP : w < 30 ? 1 : 2)
  const earliest = ({ tl, holdAt }) => {
    const d = { kind, tl, start: now, waitStart: 0, waitCusp: 0, hold: holdAt != null ? { at: holdAt, dur: hold } : null }
    let stoodTo = now
    for (let w0 = Math.max(0, after - now); w0 <= limit + after - now; w0 += step(w0)) {
      d.waitStart = w0
      d.waitCusp = 0
      // Standing in the spot (or out on the street) until now + w0: checked once, as it grows.
      if (kind !== 'arrive') {
        if (firstHit(d, stoodTo, now + w0, PARK_PAD * 2 - GAP / 2) != null) return null
        stoodTo = now + w0
      }
      if (firstHit(d, now + w0, cuspAt(d)) != null) continue
      if (tl.cuspT >= tl.total) return d
      for (let w1 = 0; w1 <= MAX_CUSP; w1 += step(w1)) {
        d.waitCusp = w1
        const hit = firstHit(d, cuspAt(d), Math.max(driveEnd(d), horizon) + DT)
        if (hit == null) return d
        // Struck while stopped at the pull-past point: holding longer there can't help.
        if (hit <= cuspAt(d) + w1 + 1e-6) break
      }
    }
    return null
  }
  // The cleanest routes, each at its earliest clear start; whichever is done first wins.
  let best = null
  for (const r of [...routes].sort((p, q) => p.tl.total - q.tl.total)) {
    const d = earliest(r)
    if (d && (!best || driveEnd(d) < driveEnd(best))) best = d
    if (best && best.waitStart + best.waitCusp === 0) break
  }
  // Only reachable if every route sweeps a parked truck: wait for the yard to settle and go.
  if (best || !fallback) return best
  return { kind, tl: routes[0].tl, start: now, waitStart: limit, waitCusp: 0 }
}

// A truck that stays where it is (in its spot) for as long as anyone looks.
const standing = (spot) => {
  const c = parkedConfig(spot)
  return { kind: 'move', tl: { samples: [c], total: 0, cuspT: 0 }, start: 0, waitStart: 0, waitCusp: 0 }
}

// Plan a batch of drives (`started`: [{ id, from, to }]) at drive-clock time T, around the drives
// already under way (`existing`) and the trucks standing in their spots (`still`: spots). A truck
// leaving a spot is planned before a truck taking that spot; until a truck's own drive is planned it
// counts as standing in its spot.
export function planBatch(started, T, existing, still) {
  const byFrom = new Map(started.filter((s) => s.from).map((s) => [spotKey(s.from), s]))
  const ordered = []
  const seen = new Set()
  // Trucks swapping spots (A → B while B → A, or a longer ring): the one planned first sets off and
  // pulls over on a side road while the truck in its new spot gets out of the way.
  const heads = new Set()
  const visit = (s, path = new Set()) => {
    if (seen.has(s) || path.has(s)) return
    path.add(s)
    const blocker = s.to && byFrom.get(spotKey(s.to))
    if (blocker && blocker !== s) {
      if (path.has(blocker)) heads.add(s)
      else visit(blocker, path)
    }
    seen.add(s)
    ordered.push(s)
  }
  const rank = (s) => (!s.to ? 0 : s.from ? 1 : 2)
  ;[...started].sort((a, b) => rank(a) - rank(b)).forEach((s) => visit(s))

  // Plan in that order; a drive that can't go yet because a truck still to be planned is in its
  // way (a neighbor that is leaving too) is put back and tried again once the others are planned.
  // `mode` says what a ring's first truck does: 'hold' pulls over on a side road for `hold` seconds;
  // 'block' drives out through the exit and comes back in at Gate 1 once its spot is free.
  const attempt = (mode, hold, last) => {
    const planned = new Map()
    const out = new Map()
    let queue = ordered
    const plan = (s, opts) => {
      const head = heads.has(s)
      if (head && mode === 'block') return planDrive(s.from, null, T, others(s), parked(s), opts)
      return planDrive(s.from, s.to, T, others(s), parked(s), { hold: head ? hold : 0, patience: last ? Infinity : RING_PATIENCE, ...opts })
    }
    // Until its own drive is planned, a truck stands in its spot; a ring's first truck plans as if
    // its new spot will be free by the time it backs in (the hold makes sure it is).
    const waiting = (s) => ordered.filter((o) => o !== s && o.from && !planned.has(o.id) && !(heads.has(s) && spotKey(o.from) === spotKey(s.to)))
    const others = (s) => [...existing, ...planned.values(), ...waiting(s).map((o) => standing(o.from))]
    const parked = (s) => [...still, ...waiting(s).map((o) => o.from)].map((sp) => bodies(parkedConfig(sp), PARK_PAD))
    while (queue.length) {
      const retry = []
      for (const s of queue) {
        const d = plan(s, { fallback: false })
        if (d) planned.set(s.id, d)
        else retry.push(s)
      }
      if (retry.length === queue.length) {
        if (!last) return null
        // Out of options: the rest wait for the yard to settle, then go.
        for (const s of retry) planned.set(s.id, plan(s, { fallback: true }))
        break
      }
      queue = retry
    }
    if (mode === 'block') {
      // Back in at Gate 1 after a lap of the block, around everything else.
      for (const s of ordered.filter((o) => heads.has(o))) {
        const leave = planned.get(s.id)
        out.set(s.id, leave)
        planned.delete(s.id)
        const rest = [...existing, ...planned.values(), ...out.values()].filter((o) => o !== leave)
        const back = planDrive(null, s.to, T, rest, still.map((sp) => bodies(parkedConfig(sp), PARK_PAD)), { after: driveEnd(leave) + AROUND_BLOCK })
        planned.set(s.id, { kind: 'via', parts: [leave, back] })
      }
    }
    return planned
  }
  if (!heads.size) return attempt('hold', 0, true)
  for (const hold of RING_HOLDS) {
    const planned = attempt('hold', hold, false)
    if (planned) return planned
  }
  return attempt('block', 0, true)
}

// ---------- Pose for drawing ----------

const cardinal = (th) => {
  const a = wrap(th)
  if (Math.abs(a) <= Math.PI / 4) return 'E'
  if (Math.abs(a) >= (3 * Math.PI) / 4) return 'W'
  return a > 0 ? 'S' : 'N'
}
function poseOf(c, opacity = 1, lights = null) {
  const tt = angleOf(sub(c.F, c.K))
  const tr = angleOf(sub(c.K, c.A))
  const rear = sub(c.A, scale([Math.cos(tr), Math.sin(tr)], A_AT))
  const front = add(c.F, scale([Math.cos(tt), Math.sin(tt)], 3.7))
  const [cx, cy] = lerp(rear, front, 0.5)
  return { cx, cy, heading: cardinal(tt), opacity, art: { K: c.K, tt, tr }, reversing: c.gear === 'R', lights }
}

// What the driver shows: brake lights when slowing or stopped mid-drive, reverse lights and the
// roof beacon when backing, and the blinker a second or so before and through a turn (heading
// angles grow clockwise on the map, so a growing heading is a right turn).
function lightsAt(d, now) {
  if (atRest(d, now) || d.kind === 'arrive' && now < d.start + d.waitStart) return null
  const c = driveConfig(d, now)
  const back = driveConfig(d, now - 0.3)
  const ahead = driveConfig(d, now + 0.3)
  if (!c || !back || !ahead) return null
  const speed = len(sub(ahead.F, c.F)) / 0.3
  const before = len(sub(c.F, back.F)) / 0.3
  const reverse = c.gear === 'R' || ahead.gear === 'R'
  const brake = !reverse && (speed < 0.5 || speed < before - 0.6)
  let left = false
  let right = false
  const soon = driveConfig(d, now + 1.4)
  if (!reverse && soon && soon.gear !== 'R') {
    const turn = wrap(angleOf(sub(soon.F, soon.K)) - angleOf(sub(c.F, c.K)))
    if (Math.abs(turn) > 0.22) {
      right = turn > 0
      left = turn < 0
    }
  }
  return { brake, reverse, left, right }
}

// Where a driving rig is at drive-clock time `now` (fading in from and out to the street's ends).
export function poseAt(d, now) {
  if (d.parts) return poseAt(now < driveEnd(d.parts[0]) ? d.parts[0] : d.parts[1], now)
  const c = driveConfig(d, now) ?? d.tl.samples[d.kind === 'arrive' ? 0 : d.tl.samples.length - 1]
  const t = now - d.start - d.waitStart
  const fade = 0.6
  const opacity =
    d.kind === 'arrive' ? Math.max(0, Math.min(1, t / fade)) : d.kind === 'leave' ? Math.max(0, Math.min(1, (driveEnd(d) - now) / fade)) : 1
  return poseOf(c, opacity, lightsAt(d, now))
}

// ---------- The hook ----------

// Last spots seen on a live map, kept between visits to a tab so that a truck checked in or out on
// the Gate tab drives in or out when the map is next shown. Forgotten after 15 minutes.
const LIVE_MEMORY = { at: 0, spots: null }
const MEMORY_MS = 15 * 60000

// `units`: [{ e, spot }] now on the map. `enabled`: drives happen (otherwise trucks jump, as when the
// viewer asks for reduced motion or a replay is scrubbed). `live`: remember spots between visits.
// `pace`: drive time runs this many times faster (a replay playing at speed).
// Returns the drives in progress by entry id (leaving ones carry their entry, which is no longer
// among `units`) and the drive clock to pose them at.
export function useYardDrives(units, { enabled, live, pace = 1 }) {
  // Spots at the last render; null on the first render with nothing remembered, so the trucks
  // already on site don't all drive in when the map first appears.
  const prev = useRef(undefined)
  if (prev.current === undefined) {
    prev.current = live && LIVE_MEMORY.spots && Date.now() - LIVE_MEMORY.at < MEMORY_MS ? LIVE_MEMORY.spots : null
  }
  const drivesRef = useRef(new Map())
  const clock = useRef(0)
  const paceRef = useRef(pace)
  paceRef.current = pace
  const [now, setNow] = useState(0)
  const [active, setActive] = useState(false)
  const key = units.map((u) => `${u.e.id}:${spotKey(u.spot)}`).join('|')

  // Before the browser paints, plan a drive for every truck whose spot changed, so a new truck never
  // flashes at its spot first. Departures are planned first (they free spots), then moves, then
  // arrivals; each one around the drives planned before it.
  useLayoutEffect(() => {
    const next = new Map(units.map((u) => [u.e.id, { spot: u.spot, e: u.e }]))
    const before = prev.current
    prev.current = next
    if (live) {
      LIVE_MEMORY.spots = next
      LIVE_MEMORY.at = Date.now()
    }
    if (!enabled || !before) return
    const started = []
    for (const [id, u] of next) {
      const was = before.get(id)
      if (!was) started.push({ id, e: u.e, from: null, to: u.spot })
      else if (spotKey(was.spot) !== spotKey(u.spot)) started.push({ id, e: u.e, from: was.spot, to: u.spot })
    }
    for (const [id, was] of before) if (!next.has(id)) started.push({ id, e: was.e, from: was.spot, to: null })
    if (!started.length) return
    const drives = drivesRef.current
    const T = clock.current
    for (const s of started) drives.delete(s.id)
    const moving = new Set(started.map((s) => s.id))
    for (const id of drives.keys()) moving.add(id)
    // Trucks standing still in their spots, for route choice and as obstacles.
    const still = units.filter((u) => !moving.has(u.e.id)).map((u) => u.spot)
    const plans = planBatch(started, T, [...drives.values()], still)
    for (const s of started) drives.set(s.id, { ...plans.get(s.id), e: s.e })
    setActive(true)
    setNow(T)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, live])

  // Advance the drive clock while anything is driving; drop each drive when it is done.
  useLayoutEffect(() => {
    if (!active) return
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(t) {
      clock.current += Math.min(0.05, Math.max(0, (t - last) / 1000)) * paceRef.current
      last = t
      const drives = drivesRef.current
      for (const [id, d] of drives) if (clock.current >= driveEnd(d)) drives.delete(id)
      setNow(clock.current)
      if (!drives.size) {
        setActive(false)
        return
      }
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [active])

  return { drives: drivesRef.current, now }
}

// For tests and tooling: the chosen route for a move with nothing else on the map.
export const routeSamples = (from, to) => {
  const d = planDrive(from, to, 0, [], [])
  return { samples: d.tl.samples, total: d.tl.total }
}

// For tests: the planner's pieces.
export const _internals = { planDrive, planBatch, driveConfig, driveEnd, bodies, parkedConfig, rigsHit }
