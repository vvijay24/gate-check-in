// Isometric drawing of the yard: the ground, the warehouse with its dock doors, the gates and the
// tractor-trailer rigs. Everything is plain SVG built from boxes in "world" units (about a foot each):
// x runs along the dock face, y from the dock face out to the street, z up. `P` projects a world point
// to the screen (2:1 isometric), so a box shows its top, its +y face (facing lower left) and its +x
// face (facing lower right). Light comes from the upper right: tops are brightest, +x faces a little
// darker and +y faces darker still, done with black overlays so one color per part is enough.
import { useId } from 'react'
import { DOCKS, STAGING_BAYS } from '../yard'

export const C = 2.5
export const P = (x, y, z = 0) => [(x - y) * C, ((x + y) * C) / 2 - z * C]
const r1 = (n) => Math.round(n * 10) / 10
export const pts = (list) => list.map(([x, y, z]) => P(x, y, z).map(r1).join(',')).join(' ')
// Screen point as a translate() string.
export const at = (x, y, z = 0) => {
  const [sx, sy] = P(x, y, z)
  return `translate(${r1(sx)} ${r1(sy)})`
}

// Lot layout (world units).
export const LOT_W = 180
export const LOT_D = 178
const BUILDING = { x: 4, y: -40, w: 172, d: 40, h: 28 }
const SLOT = 24
const MARGIN = (LOT_W - SLOT * Math.max(DOCKS.length, STAGING_BAYS)) / 2
// Center of dock door / staging bay column i.
export const colWX = (i) => MARGIN + SLOT * (i + 0.5)
// Rigs are 9 wide and 49 long; docked ones back onto the dock face, staged ones sit in the bay row.
export const RIG_W = 9
export const RIG_L = 49
export const DOCK_WY = 0.6
export const BAY_WY = 84
// Gates sit at the lot's two edges, so trucks run in along the left side and out along the right.
export const GATE_WX = [10, 170]
const GATE_HALF = 8
export const SHACK = { x: 22, y: 160 }
const BAY_FRONT = BAY_WY + RIG_L + 3

// Text laid on a face or on the ground: the matrix maps the text's x axis onto the face.
const ON_Y_FACE = (x, y, z) => {
  const [sx, sy] = P(x, y, z)
  return `matrix(1 0.5 0 1 ${r1(sx)} ${r1(sy)})`
}
const ON_GROUND = (x, y) => {
  const [sx, sy] = P(x, y, 0)
  return `matrix(1 0.5 -1 0.5 ${r1(sx)} ${r1(sy)})`
}

const SHADE = { front: 0.2, side: 0.07 }

// A box from (x, y, z) with size w × d × h. `top`, `front` (+y face) and `side` (+x face) default to
// `color`; `line` outlines the edges.
export function Box({ x, y, z = 0, w, d, h, color, top = color, front = color, side = color, line, shade = true }) {
  const frontPts = pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])
  const sidePts = pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])
  const topPts = pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])
  const stroke = line ? { stroke: line, strokeWidth: 0.6, strokeLinejoin: 'round' } : {}
  return (
    <g>
      <polygon points={frontPts} fill={front} {...stroke} />
      {shade && <polygon points={frontPts} fill="black" opacity={SHADE.front} />}
      <polygon points={sidePts} fill={side} {...stroke} />
      {shade && <polygon points={sidePts} fill="black" opacity={SHADE.side} />}
      <polygon points={topPts} fill={top} {...stroke} />
    </g>
  )
}

// A flat quad on the ground (z = 0 unless given).
const Ground = ({ x, y, w, d, z = 0, ...rest }) => (
  <polygon points={pts([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]])} {...rest} />
)
// A flat quad on a +x face (plane x), spanning y..y+d and z..z+h.
const SideQuad = ({ x, y, d, z, h, ...rest }) => (
  <polygon points={pts([[x, y, z], [x, y + d, z], [x, y + d, z + h], [x, y, z + h]])} {...rest} />
)
// A flat quad on a +y face (plane y), spanning x..x+w and z..z+h.
const FrontQuad = ({ x, y, w, z, h, ...rest }) => (
  <polygon points={pts([[x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]])} {...rest} />
)

// Carrier paint: the same carrier always gets the same color (no real logos or liveries).
// Written out in full: Tailwind only keeps theme variables it finds spelled out in the source.
const PAINTS = [
  'var(--color-paint-1)',
  'var(--color-paint-2)',
  'var(--color-paint-3)',
  'var(--color-paint-4)',
  'var(--color-paint-5)',
  'var(--color-paint-6)',
]
const LIGHT_PAINTS = new Set([4, 5])
export function paintOf(name = '') {
  let h = 0
  for (const ch of String(name).trim().toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const i = h % PAINTS.length
  return { color: PAINTS[i], light: LIGHT_PAINTS.has(i), index: i }
}

// One glow filter per carrier paint, so a selected rig glows in its own cab color. The glow is a
// blurred, color-flooded outline of the rig's shape behind it; with `motion` it pulses gently.
function GlowFilters({ motion }) {
  return PAINTS.map((paint, i) => (
    <filter key={i} id={`iso-glow-${i}`} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="grown" />
      <feGaussianBlur in="grown" stdDeviation="5" result="soft" />
      <feFlood floodColor={paint} floodOpacity="0.95">
        {motion && <animate attributeName="flood-opacity" values="0.95;0.45;0.95" dur="1.8s" repeatCount="indefinite" />}
      </feFlood>
      <feComposite in2="soft" operator="in" result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  ))
}

const short = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '')

// A rig is two bodies joined at the hitch (the fifth wheel / kingpin): the trailer and the tractor,
// each with its own heading, so the trailer swings behind the cab through a turn like a real rig.
// Positions along the rig use `a`, from the trailer's rear (0) to the tractor's bumper (49), and `c`
// across it (0..9), `z` up. Key points along it: the trailer axles (A), the hitch (K), the front axle (F).
export const A_AT = 5.8
export const K_AT = 32
export const F_AT = 45.4
// The tractor's parts and the trailer's parts are placed by their own body's heading.
// `art`: { K: [x, y] hitch in world units, tt: tractor heading, tr: trailer heading } (radians; 0 = +x
// east, π/2 = +y south, how trucks park). A parked rig's hitch sits 32 from its origin corner.
export const PARKED_ART = { K: [RIG_W / 2, K_AT], tt: Math.PI / 2, tr: Math.PI / 2 }

// Where a parked (south-facing) rig centered at (cx, cy) has its origin corner.
export const rigOrigin = (heading, cx, cy) =>
  heading === 'E' || heading === 'W' ? [cx - RIG_L / 2, cy - RIG_W / 2] : [cx - RIG_W / 2, cy - RIG_L / 2]

// Rig coordinates (a, c, z) → world, for a body at hitch K with heading th. `u` runs along the body
// (toward the cab), `v` across it.
export function frameMap(K, th) {
  const ux = Math.cos(th)
  const uy = Math.sin(th)
  return (a, c, z = 0) => [K[0] + ux * (a - K_AT) + uy * (c - RIG_W / 2), K[1] + uy * (a - K_AT) - ux * (c - RIG_W / 2), z]
}

// A box with any heading: its four sides and top, drawing only the faces turned toward the viewer
// (outward normal toward +x + y) and shading each by how it faces, as Box does for square-on boxes.
function OBox({ corners, z, h, color, top = color, front = color, side = color, line, shade = true }) {
  const n = corners.length
  const cx = corners.reduce((s, p) => s + p[0], 0) / n
  const cy = corners.reduce((s, p) => s + p[1], 0) / n
  const stroke = line ? { stroke: line, strokeWidth: 0.6, strokeLinejoin: 'round' } : {}
  const faces = []
  for (let i = 0; i < n; i++) {
    const p = corners[i]
    const q = corners[(i + 1) % n]
    let nx = q[1] - p[1]
    let ny = -(q[0] - p[0])
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    if (nx * ((p[0] + q[0]) / 2 - cx) + ny * ((p[1] + q[1]) / 2 - cy) < 0) {
      nx = -nx
      ny = -ny
    }
    if (nx + ny <= 0.001) continue
    const poly = pts([[p[0], p[1], z], [q[0], q[1], z], [q[0], q[1], z + h], [p[0], p[1], z + h]])
    faces.push(
      <g key={i}>
        <polygon points={poly} fill={ny >= nx ? front : side} {...stroke} />
        {shade && <polygon points={poly} fill="black" opacity={SHADE.side * nx * nx + SHADE.front * ny * ny} />}
      </g>,
    )
  }
  return (
    <g>
      {faces}
      <polygon points={pts(corners.map(([x, y]) => [x, y, z + h]))} fill={top} {...stroke} />
    </g>
  )
}

// Drawing helpers for one body. Details are designed for the long side at c = 9; when the other long
// side is the one facing the viewer, `c` is mirrored so wheels, stripes and lettering stay in view.
function rigKit(K, th) {
  const raw = frameMap(K, th)
  const ux = Math.cos(th)
  const uy = Math.sin(th)
  // `c` grows along (uy, -ux), so that is the c = 9 side's outward normal; it shows when it points toward +x + y.
  const nineFaces = uy - ux > 0
  const map = (a, c, z = 0) => raw(a, nineFaces ? c : RIG_W - c, z)
  const frontShows = ux + uy > 0.02
  const rearShows = ux + uy < -0.02
  const quad = (corners, props) => <polygon points={pts(corners.map(([a, c, z]) => map(a, c, z)))} {...props} />
  const box = (a0, a1, c0, c1, z, h, props) => (
    <OBox corners={[map(a0, c0), map(a1, c0), map(a1, c1), map(a0, c1)].map(([x, y]) => [x, y])} z={z} h={h} {...props} />
  )
  const side = (a0, a1, z0, z1, props, cs = RIG_W) => quad([[a0, cs, z0], [a1, cs, z0], [a1, cs, z1], [a0, cs, z1]], props)
  const sideLine = (key, a, z0, z1, props) => <polyline key={key} points={pts([map(a, RIG_W, z0), map(a, RIG_W, z1)])} {...props} />
  // Screen direction of one unit along the body; text and wheels on the long side use this plane.
  const ex = [ux - uy, (ux + uy) / 2]
  const read = ex[0] >= 0 ? ex : [-ex[0], -ex[1]]
  const planeMatrix = (x, y, z, m = read) => {
    const [sx, sy] = P(x, y, z)
    return `matrix(${r1(m[0] * 100) / 100} ${r1(m[1] * 100) / 100} 0 1 ${r1(sx)} ${r1(sy)})`
  }
  const wheel = (a, key, r = 1.7) => {
    const [x, y, z] = map(a, RIG_W - 0.2, r)
    return (
      <g key={key} transform={planeMatrix(x, y, z, ex)}>
        <circle r={r * C} fill="var(--color-iso-tire)" />
        <circle r={r * C * 0.5} fill="var(--color-iso-steel)" />
        <circle r={r * C * 0.18} fill="var(--color-iso-tire)" />
      </g>
    )
  }
  // Text along the long side between a0 and a1, reading left to right on screen; hidden while the
  // side is nearly end-on to the viewer.
  const sideText = (a0, a1, z, text, props) => {
    if (Math.abs(ex[0]) < 0.3) return null
    const e0 = map(a0, RIG_W, z)
    const e1 = map(a1, RIG_W, z)
    const start = P(...e0)[0] <= P(...e1)[0] ? e0 : e1
    return (
      <text transform={planeMatrix(...start)} {...props}>
        {text}
      </text>
    )
  }
  const across = (a, c0, c1, z0, z1, props) => quad([[a, c0, z0], [a, c1, z0], [a, c1, z1], [a, c0, z1]], props)
  const depth = (a) => {
    const [x, y] = map(a, RIG_W / 2)
    return x + y
  }
  return { map, frontShows, rearShows, box, side, sideLine, wheel, sideText, across, quad, depth }
}

// One rig, posed by `art` (default: parked, facing south from the origin). `drop` draws the trailer
// alone on its landing gear; `reefer` adds the refrigeration unit; `glow` (selected) surrounds the rig
// with a glow in its carrier's paint.
export function Rig({ carrier, trailerNumber, drop, reefer, glow, art = PARKED_ART }) {
  const paint = paintOf(carrier)
  // `k` places trailer parts, `t` tractor parts.
  const k = rigKit(art.K, art.tr)
  const t = rigKit(art.K, drop ? art.tr : art.tt)
  const Z = 4.2
  const H = 9.4
  const name = short(String(carrier || '').toUpperCase(), 15)
  const cabLine = 'rgb(0 0 0 / 0.25)'
  const len = drop ? 36 : RIG_L

  const trailer = (
    <g key="trailer">
      {/* Underframe and rear tandem. */}
      {k.box(0.5, 33.5, 1, 8, 2.6, 1.6, { color: 'var(--color-iso-tire)', shade: false })}
      {k.wheel(4, 'w1')}
      {k.wheel(7.6, 'w2')}
      {drop && (
        <>
          {/* Landing gear legs and sand shoes. */}
          {k.box(27.6, 28.4, 6.8, 7.6, 0, 4.2, { color: 'var(--color-iso-steel)' })}
          {k.box(27.6, 28.4, 1.4, 2.2, 0, 4.2, { color: 'var(--color-iso-steel)' })}
          {k.box(27.2, 28.8, 1.2, 7.8, 0, 0.4, { color: 'var(--color-iso-tire)', shade: false })}
        </>
      )}
      {/* Body, ribs, carrier stripe and lettering, marker lights. */}
      {k.box(0, 34, 0, RIG_W, Z, H, { color: 'var(--color-iso-trailer)', line: 'var(--color-iso-steel)' })}
      {Array.from({ length: 12 }, (_, i) =>
        k.sideLine(i, 1.4 + i * 2.8, Z + 0.2, Z + H - 0.2, { stroke: 'var(--color-iso-steel)', strokeWidth: 0.35, opacity: 0.55 }),
      )}
      {k.side(0.4, 33.6, Z + 0.6, Z + 1.9, { fill: paint.color })}
      {k.side(0.4, 33.6, Z + H - 1.2, Z + H - 0.7, { fill: paint.color, opacity: 0.85 })}
      {k.sideText(31, 3, Z + 4.6, name, {
        fontFamily: 'var(--font-scene)',
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: 0.4,
        fill: paint.light ? 'var(--color-iso-band)' : paint.color,
      })}
      {k.sideText(7.4, 1, Z + 7.4, short(String(trailerNumber || ''), 10), {
        fontFamily: 'var(--font-body)',
        fontWeight: 700,
        fontSize: 5.2,
        fill: 'var(--color-iso-band)',
      })}
      {k.side(33, 33.7, Z + H - 0.5, Z + H - 0.1, { fill: 'var(--color-paint-2)' })}
      {k.rearShows && (
        <>
          {/* Rear doors: two panels, lock bars, reflective tape and tail lights. */}
          {k.across(0, 0.4, 4.4, Z + 0.4, Z + H - 0.4, { fill: 'var(--color-iso-trailer)', stroke: 'var(--color-iso-steel)', strokeWidth: 0.5 })}
          {k.across(0, 4.6, 8.6, Z + 0.4, Z + H - 0.4, { fill: 'var(--color-iso-trailer)', stroke: 'var(--color-iso-steel)', strokeWidth: 0.5 })}
          {[1.8, 3.4, 5.6, 7.2].map((c) => (
            <polyline key={c} points={pts([k.map(0, c, Z + 0.8), k.map(0, c, Z + H - 0.8)])} stroke="var(--color-iso-steel)" strokeWidth={0.6} />
          ))}
          {k.across(0, 0.4, 8.6, Z + 0.3, Z + 0.9, { fill: 'var(--color-paint-1)', opacity: 0.85 })}
          {k.across(0, 0.6, 1.6, Z - 1, Z - 0.2, { fill: 'var(--color-paint-1)' })}
          {k.across(0, 7.4, 8.4, Z - 1, Z - 0.2, { fill: 'var(--color-paint-1)' })}
        </>
      )}
    </g>
  )

  const reeferUnit = reefer && (
    <g key="reefer">
      {k.box(34, 35.5, 1.3, 7.7, 7.2, 5.8, { color: 'var(--color-iso-chrome)', line: 'var(--color-iso-steel)' })}
      {k.frontShows &&
        [0, 1, 2, 3].map((i) => (
          <polyline key={i} points={pts([k.map(35.5, 1.9, 8.3 + i * 1.2), k.map(35.5, 7.1, 8.3 + i * 1.2)])} stroke="var(--color-iso-steel)" strokeWidth={0.5} />
        ))}
    </g>
  )

  // Tractor parts, each with where it sits along the rig so they can be drawn back to front.
  const tractor = drop
    ? []
    : [
        [
          32,
          <g key="frame">
            {t.box(29, 48.4, 1.6, 7.4, 1.4, 1.6, { color: 'var(--color-iso-tire)', shade: false })}
            {t.wheel(31.2, 'd1')}
            {t.wheel(34.4, 'd2')}
            {t.wheel(45.4, 'f1')}
            {t.box(37.2, 40.8, RIG_W - 0.6, RIG_W + 0.4, 1.8, 1.8, { color: 'var(--color-iso-chrome)', line: 'var(--color-iso-steel)' })}
          </g>,
        ],
        [
          36,
          <g key="stack">{t.box(35.6, 36.2, 8.1, 8.7, 3.5, 11.6, { color: 'var(--color-iso-chrome)', line: 'var(--color-iso-steel)' })}</g>,
        ],
        [
          39.6,
          <g key="cab">
            {t.box(36.2, 43, 0.3, 8.7, 3, 8.4, { color: paint.color, line: cabLine })}
            {t.box(36.2, 39.8, 0.9, 8.1, 11.4, 1.6, { color: paint.color, line: cabLine })}
            {/* Side window, door seam and mirror. */}
            {t.side(40.2, 42.6, 8, 10.6, { fill: 'var(--color-iso-glass)' }, 8.7)}
            {t.side(39.6, 42.8, 3.6, 11, { fill: 'none', stroke: 'rgb(0 0 0 / 0.35)', strokeWidth: 0.4 }, 8.7)}
            {t.box(42.4, 42.8, 8.9, 9.4, 8.2, 1.8, { color: 'var(--color-iso-tire)', shade: false })}
            {t.frontShows && (
              <>
                {/* Two-pane windshield with a glint. */}
                {t.across(43, 0.9, 4.2, 8, 11, { fill: 'var(--color-iso-glass)' })}
                {t.across(43, 4.8, 8.1, 8, 11, { fill: 'var(--color-iso-glass)' })}
                {t.across(43, 1.2, 2.4, 10, 10.6, { fill: 'white', opacity: 0.35 })}
              </>
            )}
          </g>,
        ],
        [
          45.6,
          <g key="hood">
            {t.box(43, 48.3, 1, 8, 3, 5.4, { color: paint.color, line: cabLine })}
            {t.frontShows && (
              <>
                {/* Grille, headlights. */}
                {t.across(48.3, 2.6, 6.4, 3.6, 7.8, { fill: 'var(--color-iso-chrome)' })}
                {[0, 1, 2, 3, 4].map((i) => (
                  <polyline key={i} points={pts([t.map(48.3, 2.9, 4.2 + i * 0.75), t.map(48.3, 6.1, 4.2 + i * 0.75)])} stroke="var(--color-iso-steel)" strokeWidth={0.45} />
                ))}
                {t.across(48.3, 1.2, 2.3, 5.4, 6.4, { fill: 'var(--color-iso-light)' })}
                {t.across(48.3, 6.7, 7.8, 5.4, 6.4, { fill: 'var(--color-iso-light)' })}
              </>
            )}
          </g>,
        ],
        [48.7, <g key="bumper">{t.box(48.3, 49.1, 0.6, 8.4, 2.2, 1.3, { color: 'var(--color-iso-chrome)', line: 'var(--color-iso-steel)' })}</g>],
      ]

  // Back to front: farther parts (smaller x + y) first.
  const parts = [[k.depth(17), trailer], [k.depth(34.7), reeferUnit], ...tractor.map(([a, el]) => [t.depth(a), el])].filter(([, el]) => el)
  parts.sort((p, q) => p[0] - q[0])

  // Shadow: each body's footprint, nudged toward the lower left.
  const foot = (kit, a0, a1) => pts([kit.map(a0, 0), kit.map(a1, 0), kit.map(a1, RIG_W), kit.map(a0, RIG_W)].map(([x, y]) => [x - 2.5, y + 1.2, 0]))
  return (
    <g>
      <g fill="var(--color-iso-shadow)" filter="url(#iso-soft)">
        <polygon points={foot(k, 0, drop ? 36 : 34)} />
        {!drop && <polygon points={foot(t, 33, len)} />}
      </g>
      <g filter={glow ? `url(#iso-glow-${paint.index})` : undefined}>{parts.map(([, el]) => el)}</g>
    </g>
  )
}

// Dock door on the building's front face. `open` raises it (a truck is backed in) and lights the dock light.
function DockDoor({ cx, label, open }) {
  const x = cx - 4.8
  return (
    <g>
      {/* Dock seal, bumpers and the door (slats when closed, dark when open). */}
      <FrontQuad x={x - 0.8} y={0} w={11.2} z={4} h={11.6} fill="var(--color-iso-tire)" />
      <FrontQuad x={x} y={0} w={9.6} z={4.6} h={10.2} fill={open ? 'var(--color-iso-glass)' : 'var(--color-iso-door)'} />
      {!open &&
        Array.from({ length: 8 }, (_, i) => (
          <polyline key={i} points={pts([[x, 0, 5.8 + i * 1.2], [x + 9.6, 0, 5.8 + i * 1.2]])} stroke="var(--color-iso-steel)" strokeWidth={0.4} />
        ))}
      <Box x={x - 0.4} y={0} z={2.6} w={1.2} d={0.8} h={1.6} color="var(--color-iso-tire)" shade={false} />
      <Box x={x + 8.8} y={0} z={2.6} w={1.2} d={0.8} h={1.6} color="var(--color-iso-tire)" shade={false} />
      {/* Number plate and dock light. */}
      <FrontQuad x={cx - 3} y={0} w={6} z={16.4} h={4.4} fill="var(--color-iso-band)" />
      <text transform={ON_Y_FACE(cx - 2.2, 0, 17.3)} fontFamily="var(--font-scene)" fontWeight={700} fontSize={9.5} fill="white">
        {label}
      </text>
      <FrontQuad x={cx + 5.6} y={0} w={1.4} z={15.4} h={1} fill={open ? 'var(--color-iso-light)' : 'var(--color-iso-steel)'} />
    </g>
  )
}

function Tree({ x, y, s = 1 }) {
  const [sx, sy] = P(x, y, 0)
  return (
    <g transform={`translate(${r1(sx)} ${r1(sy)}) scale(${s})`}>
      <ellipse cx={-9} cy={3} rx={15} ry={6} fill="var(--color-iso-shadow)" />
      <rect x={-1.6} y={-16} width={3.2} height={16} fill="var(--color-paint-4)" />
      <circle cx={0} cy={-26} r={13} fill="var(--color-iso-tree-dark)" />
      <circle cx={-4} cy={-30} r={10} fill="var(--color-iso-tree)" />
      <circle cx={5} cy={-23} r={8} fill="var(--color-iso-tree)" opacity={0.85} />
    </g>
  )
}

// Pole with a lamp (its light pool after dark is drawn by NightLighting).
function LightPole({ x, y }) {
  return (
    <g>
      <Box x={x} y={y} z={0} w={0.6} d={0.6} h={24} color="var(--color-iso-steel)" />
      <Box x={x - 0.4} y={y - 0.2} z={24} w={4} d={1} h={0.8} color="var(--color-iso-band)" />
      <FrontQuad x={x - 0.2} y={y + 0.8} w={3.6} z={24} h={0.3} fill="var(--color-iso-light)" />
    </g>
  )
}

// Chain-link fence along y at plane x (from y0 to y1), or along x at plane y (horizontal = true).
function Fence({ along, at: plane, from, to }) {
  const H = 6
  const segs = []
  for (let v = from; v <= to + 0.01; v += 8) segs.push(Math.min(v, to))
  const post = (v) =>
    along === 'y' ? <Box key={v} x={plane} y={v} w={0.5} d={0.5} h={H} color="var(--color-iso-steel)" shade={false} /> : <Box key={v} x={v} y={plane} w={0.5} d={0.5} h={H} color="var(--color-iso-steel)" shade={false} />
  const mesh =
    along === 'y'
      ? pts([[plane, from, 0], [plane, to, 0], [plane, to, H], [plane, from, H]])
      : pts([[from, plane, 0], [to, plane, 0], [to, plane, H], [from, plane, H]])
  const rail = along === 'y' ? pts([[plane, from, H], [plane, to, H]]) : pts([[from, plane, H], [to, plane, H]])
  return (
    <g>
      <polygon points={mesh} fill="var(--color-iso-steel)" opacity={0.18} />
      <polyline points={rail} stroke="var(--color-iso-steel)" strokeWidth={1.2} />
      {segs.map(post)}
    </g>
  )
}

// Gate in the front fence: boom post and a striped arm, with the gate's color painted across the lane.
function Gate({ cx, color }) {
  const half = GATE_HALF
  return (
    <g>
      <Ground x={cx - half} y={LOT_D - 2} w={half * 2} d={4} fill={color} opacity={0.85} />
      <Box x={cx + half} y={LOT_D - 0.8} w={1.6} d={1.6} h={4.4} color="var(--color-iso-band)" />
      {/* Boom arm, raised: it points up from the post. */}
      {Array.from({ length: 4 }, (_, i) => (
        <Box
          key={i}
          x={cx + half + 0.4}
          y={LOT_D - 0.3}
          z={4.4 + i * 3.2}
          w={0.7}
          d={0.6}
          h={3.2}
          color={i % 2 ? 'var(--color-iso-paint)' : 'var(--color-paint-1)'}
          shade={false}
        />
      ))}
    </g>
  )
}

// Guard shack just inside Gate 1, where the guards check trucks in.
function GuardShack({ night = 0 }) {
  const { x, y } = SHACK
  const glass = night > 0.4 ? 'var(--color-iso-light)' : 'var(--color-iso-glass)'
  return (
    <g>
      <Ground x={x - 2} y={y - 2} w={14} d={14} fill="var(--color-iso-curb)" />
      <Box x={x} y={y} w={10} d={10} h={9} color="var(--color-iso-wall)" line="rgb(0 0 0 / 0.15)" />
      <FrontQuad x={x + 1.5} y={y + 10} w={7} z={4} h={3.6} fill={glass} />
      <SideQuad x={x + 10} y={y + 1.5} d={7} z={4} h={3.6} fill={glass} />
      <FrontQuad x={x + 2} y={y + 10} w={2} z={4.8} h={1.4} fill="white" opacity={0.3} />
      <Box x={x - 1} y={y - 1} z={9} w={12} d={12} h={1.2} color="var(--color-iso-band)" />
    </g>
  )
}

// `occupied` holds the dock numbers with a truck backed in (their doors are drawn open). `motion`: the
// selected rig's glow may pulse (off when the viewer asks for reduced motion).
export function Scene({ occupied, motion, night = 0 }) {
  const B = BUILDING
  const front = B.y + B.d
  return (
    <g>
      <defs>
        <filter id="iso-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id="iso-halo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <GlowFilters motion={motion} />
      </defs>
      {/* Grass under everything, then the street, sidewalk and the paved lot. */}
      <rect x={-700} y={-300} width={1600} height={1100} fill="var(--color-iso-ground)" />
      <Ground x={-120} y={LOT_D + 4} w={LOT_W + 240} d={20} fill="var(--color-iso-street)" />
      {Array.from({ length: 22 }, (_, i) => (
        <Ground key={i} x={-110 + i * 18} y={LOT_D + 13.6} w={9} d={0.8} fill="var(--color-iso-paint)" opacity={0.7} />
      ))}
      <Ground x={-120} y={LOT_D} w={LOT_W + 240} d={4} fill="var(--color-iso-curb)" />
      <Ground x={0} y={0} w={LOT_W} d={LOT_D} fill="var(--color-iso-lot)" />
      {/* Concrete apron in front of the dock doors. */}
      <Ground x={0} y={0} w={LOT_W} d={RIG_L + 4} fill="white" opacity={0.06} />

      {/* Painted dock stripes, staging bays and the drive lane arrows. */}
      {Array.from({ length: DOCKS.length + 1 }, (_, i) => (
        <Ground key={i} x={MARGIN + SLOT * i - 0.3} y={0} w={0.6} d={RIG_L + 2} fill="var(--color-iso-paint)" opacity={0.85} />
      ))}
      {Array.from({ length: STAGING_BAYS + 1 }, (_, i) => (
        <Ground key={i} x={MARGIN + SLOT * i - 0.3} y={BAY_WY - 2} w={0.6} d={RIG_L + 5} fill="var(--color-iso-paint)" opacity={0.85} />
      ))}
      <Ground x={MARGIN} y={BAY_FRONT} w={SLOT * STAGING_BAYS} d={0.6} fill="var(--color-iso-paint)" opacity={0.85} />
      {Array.from({ length: STAGING_BAYS }, (_, i) => (
        <text
          key={i}
          transform={ON_GROUND(colWX(i) - 6, BAY_FRONT - 3)}
          fontFamily="var(--font-scene)"
          fontWeight={700}
          fontSize={11}
          fill="var(--color-iso-paint)"
          opacity={0.9}
        >
          BAY {i + 1}
        </text>
      ))}
      {[30, 80, 130].map((x) => (
        <polygon
          key={x}
          points={pts([[x, 66.6, 0], [x + 12, 66.6, 0], [x + 12, 64.6, 0], [x + 17, 68, 0], [x + 12, 71.4, 0], [x + 12, 69.4, 0], [x, 69.4, 0]])}
          fill="var(--color-iso-paint)"
          opacity={0.85}
        />
      ))}
      <text transform={ON_GROUND(58, 76)} fontFamily="var(--font-scene)" fontWeight={700} fontSize={10} letterSpacing={2} fill="var(--color-iso-paint)" opacity={0.75}>
        DRIVE LANE
      </text>
      <text transform={ON_GROUND(70, LOT_D + 19)} fontFamily="var(--font-scene)" fontWeight={700} fontSize={10} letterSpacing={4} fill="var(--color-iso-paint)" opacity={0.5}>
        STREET
      </text>

      {/* Trees and the fence on the far (left) side. */}
      <Tree x={-16} y={18} s={1.1} />
      <Tree x={-18} y={96} />
      <Tree x={-14} y={150} s={0.9} />
      <Fence along="y" at={-0.5} from={0} to={LOT_D} />

      {/* Warehouse: walls, roof with skylights and units, dark band with the name, end-wall windows. */}
      <Box x={B.x} y={B.y} w={B.w} d={B.d} h={B.h} color="var(--color-iso-wall)" top="var(--color-iso-roof)" line="rgb(0 0 0 / 0.12)" />
      {/* Tilt-up wall panel seams on the dock face and the end wall. */}
      {Array.from({ length: Math.floor(B.w / 12) }, (_, i) => (
        <polyline key={i} points={pts([[B.x + 12 * (i + 1), front, 0], [B.x + 12 * (i + 1), front, B.h - 4]])} stroke="black" strokeWidth={0.5} opacity={0.12} />
      ))}
      {[10, 20, 30].map((v) => (
        <polyline key={v} points={pts([[B.x + B.w, B.y + v, 0], [B.x + B.w, B.y + v, B.h - 4]])} stroke="black" strokeWidth={0.5} opacity={0.12} />
      ))}
      <FrontQuad x={B.x} y={front} w={B.w} z={B.h - 4} h={4} fill="var(--color-iso-band)" />
      <SideQuad x={B.x + B.w} y={B.y} d={B.d} z={B.h - 4} h={4} fill="var(--color-iso-band)" />
      <text transform={ON_Y_FACE(B.x + 6, front, B.h - 2.8)} fontFamily="var(--font-scene)" fontWeight={700} fontSize={7.5} letterSpacing={3} fill="white">
        WAREHOUSE · SHIPPING &amp; RECEIVING
      </text>
      {[0, 1, 2].map((i) => (
        <SideQuad key={i} x={B.x + B.w} y={B.y + 6 + i * 11} d={7} z={9} h={5} fill={night > 0.4 ? 'var(--color-iso-light)' : 'var(--color-iso-glass)'} />
      ))}
      {/* Office entrance on the end wall: glass doors under a canopy, with a walkway. */}
      <Ground x={B.x + B.w} y={B.y + 27} w={8} d={10} fill="var(--color-iso-curb)" />
      <SideQuad x={B.x + B.w} y={B.y + 29} d={6} z={0} h={7.5} fill="var(--color-iso-glass)" />
      <polyline points={pts([[B.x + B.w, B.y + 32, 0], [B.x + B.w, B.y + 32, 7.5]])} stroke="var(--color-iso-chrome)" strokeWidth={0.6} />
      <Box x={B.x + B.w} y={B.y + 27.5} z={8.4} w={4} d={9} h={0.8} color="var(--color-iso-band)" />
      {[18, 58, 98, 138].map((x) => (
        <Ground key={x} x={x} y={B.y + 8} z={B.h + 0.05} w={20} d={6} fill="white" opacity={0.35} />
      ))}
      {[30, 110].map((x) => (
        <Box key={x} x={x} y={B.y + 22} z={B.h} w={10} d={8} h={3.4} color="var(--color-iso-chrome)" line="var(--color-iso-steel)" />
      ))}
      <Box x={B.x} y={B.y} z={B.h} w={B.w} d={0.8} h={1} color="var(--color-iso-band)" shade={false} />
      {DOCKS.map((d, i) => (
        <DockDoor key={d} cx={colWX(i)} label={d} open={occupied?.has(d)} />
      ))}
      <LightPole x={-5} y={64} />
    </g>
  )
}

// What sits in front of the rigs: the right-hand and front fences, gates, guard shack, a tree and a pole.
export function Foreground({ gateFills, night = 0 }) {
  const gap = GATE_HALF + 1
  return (
    <g>
      <LightPole x={LOT_W + 4} y={64} />
      <Fence along="y" at={LOT_W} from={0} to={LOT_D} />
      <Fence along="x" at={LOT_D} from={GATE_WX[0] + gap} to={GATE_WX[1] - gap} />
      <GuardShack night={night} />
      {GATE_WX.map((x, i) => (
        <Gate key={x} cx={x} color={gateFills[i]} />
      ))}
      <Tree x={198} y={40} s={1.1} />
      <Tree x={200} y={120} />
    </g>
  )
}

// ---- Night lighting ----
// Night works like a lit stage, not a fog: the scene is darkened by multiplying a deep blue over it
// (which keeps contrast), and every light source cuts a soft pool out of that darkness, so whatever
// stands in the light shows its true colors. A warm soft-light cast tints the pools like sodium
// lamps, and the lamp heads themselves glow. Trucks always get some yard light so they stay readable.

const ISO_ANGLE = (Math.atan2(0.5, 1) * 180) / Math.PI // a world-x line on screen, in degrees

// Light sources: where each pool falls (world x, y), its size on screen, strength (0..1), and the
// lamp head that makes it (world x, y, z).
function nightLights(occupied) {
  const B = BUILDING
  const docks = DOCKS.map((d, i) => ({
    key: 'dock' + d,
    x: colWX(i) + 2,
    y: 13,
    rx: 54,
    ry: 27,
    k: occupied?.has(d) ? 1 : 0.8,
    lamp: [colWX(i) + 6.3, 0.2, 15.9],
  }))
  return [
    ...docks,
    { key: 'pole-l', x: -1, y: 70, rx: 118, ry: 58, k: 0.95, lamp: [-3.2, 64.8, 24.4] },
    { key: 'pole-r', x: LOT_W + 1, y: 70, rx: 118, ry: 58, k: 0.95, lamp: [LOT_W + 5.8, 64.8, 24.4] },
    // Wall packs along the building front light the drive lane between the docks and the bays.
    ...[0.22, 0.5, 0.78].map((f, i) => ({ key: 'lane' + i, x: LOT_W * f, y: 60, rx: 120, ry: 50, k: 0.5 })),
    // Spill over the staging bays.
    { key: 'bays', x: LOT_W / 2, y: BAY_WY + 26, rx: 190, ry: 70, k: 0.45 },
    ...[0, 1, 2].map((i) => ({ key: 'office' + i, x: B.x + B.w + 6, y: B.y + 10 + i * 11, rx: 26, ry: 14, k: 0.8, lamp: [B.x + B.w + 0.4, B.y + 9.5 + i * 11, 11] })),
    { key: 'shack', x: SHACK.x + 9, y: SHACK.y + 13, rx: 34, ry: 17, k: 0.9, lamp: [SHACK.x + 5, SHACK.y + 10.2, 6] },
  ]
}

// `rigs`: [{ cx, cy, art, driving }] for the trucks on the map (world center and articulated pose).
export function NightLighting({ occupied, night, warm, rigs = [] }) {
  const uid = 'nl' + useId().replace(/[^a-zA-Z0-9]/g, '')
  if (night < 0.01 && warm < 0.01) return null
  const lights = night >= 0.01 ? nightLights(occupied) : []
  const pool = (l, fill, extra = {}) => {
    const [cx, cy] = P(l.x, l.y, l.z ?? 0)
    return <ellipse key={l.key} cx={cx} cy={cy} rx={l.rx} ry={l.ry} fill={fill} {...extra} />
  }
  // Each truck sits in some yard light (longer along its length); driving trucks throw headlight beams.
  const rigGlow = rigs.map((r, i) => {
    const [cx, cy] = P(r.cx, r.cy)
    const th = (r.art.tt + r.art.tr) / 2
    const along = (Math.atan2((Math.cos(th) + Math.sin(th)) / 2, Math.cos(th) - Math.sin(th)) * 180) / Math.PI
    return (
      <ellipse key={'rig' + i} cx={cx} cy={cy} rx={RIG_L * C * 0.72} ry={RIG_W * C * 1.6} transform={`rotate(${r1(along)} ${cx} ${cy})`} fill={`url(#${uid}-hole)`} opacity={r.driving ? 0.55 : 0.62} />
    )
  })
  const beams = rigs
    .filter((r) => r.driving && !r.reversing)
    .map((r, i) => {
      const map = frameMap(r.art.K, r.art.tt)
      const corners = [map(49, 1), map(49, 8), map(76, 17), map(76, -8)].map(([x, y]) => [x, y, 0])
      return <polygon key={'beam' + i} points={pts(corners)} />
    })

  return (
    <g aria-hidden="true" pointerEvents="none">
      <defs>
        <radialGradient id={`${uid}-hole`}>
          <stop offset="0" stopColor="#000" stopOpacity="0.95" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0.78" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0.38" />
          <stop offset="0.85" stopColor="#000" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-warm`}>
          <stop offset="0" style={{ stopColor: 'var(--color-iso-glow)', stopOpacity: 0.7 }} />
          <stop offset="0.4" style={{ stopColor: 'var(--color-iso-glow)', stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-iso-glow)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={`${uid}-lamp`}>
          <stop offset="0" stopColor="#fffbe8" stopOpacity="1" />
          <stop offset="0.25" style={{ stopColor: 'var(--color-iso-light)', stopOpacity: 0.85 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-iso-glow)', stopOpacity: 0 }} />
        </radialGradient>
        <filter id={`${uid}-feather`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {/* White = full darkness; each pool, truck and beam lifts it. */}
        <mask id={`${uid}-mask`} maskUnits="userSpaceOnUse" x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h}>
          <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="white" />
          {lights.map((l) => pool(l, `url(#${uid}-hole)`, { opacity: l.k }))}
          {rigGlow}
          <g fill="black" opacity={0.85} filter={`url(#${uid}-feather)`}>
            {beams}
          </g>
        </mask>
      </defs>

      {/* Dawn and dusk: a warm wash over everything. */}
      {warm > 0.01 && (
        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="var(--color-iso-dusk)" style={{ mixBlendMode: 'multiply', opacity: `calc(var(--iso-tint) * ${(0.28 * warm).toFixed(3)})` }} />
      )}
      {night >= 0.01 && (
        <>
          {/* The dark, with the lit places cut out of it. */}
          <rect
            x={VIEW.x}
            y={VIEW.y}
            width={VIEW.w}
            height={VIEW.h}
            fill="var(--color-iso-night)"
            mask={`url(#${uid}-mask)`}
            style={{ mixBlendMode: 'multiply', opacity: `calc(var(--iso-tint) * ${(0.86 * night).toFixed(3)})` }}
          />
          {/* Warm sodium-lamp color in the pools: soft-light tints and brightens without fogging. */}
          <g style={{ mixBlendMode: 'soft-light' }} opacity={0.6 * night}>
            {lights.map((l) => pool(l, `url(#${uid}-warm)`, { opacity: l.k }))}
            <g fill="var(--color-iso-glow)" opacity={0.7} filter={`url(#${uid}-feather)`}>
              {beams}
            </g>
          </g>
          {/* The lamp heads. */}
          <g style={{ mixBlendMode: 'screen' }} opacity={night}>
            {lights
              .filter((l) => l.lamp)
              .map((l) => {
                const [cx, cy] = P(...l.lamp)
                return <circle key={l.key} cx={cx} cy={cy} r={l.key.startsWith('pole') ? 13 : 8} fill={`url(#${uid}-lamp)`} />
              })}
          </g>
        </>
      )}
    </g>
  )
}

// How dark it is (0 day .. 1 night) and how warm the light is (dawn, dusk) at a moment, by the local
// clock: night until 5, brightening to 7; dusk from about 6:30 PM, full dark by 8:30 PM.
export function daylight(ms) {
  const d = new Date(ms)
  const h = d.getHours() + d.getMinutes() / 60
  const night = h < 5 ? 1 : h < 7 ? 1 - (h - 5) / 2 : h < 18.6 ? 0 : h < 20.6 ? (h - 18.6) / 2 : 1
  const warm = Math.max(0, 1 - Math.abs(h - 6.4) / 1.4, 1 - Math.abs(h - 18.6) / 1.4)
  const phase = night > 0.7 ? 'Night' : night > 0.15 || warm > 0.3 ? (h < 12 ? 'Dawn' : 'Dusk') : 'Day'
  return { night, warm, phase }
}

// The scene's frame in screen units, sized to the lot with the warehouse roof and the street in view.
export const VIEW = (() => {
  // Wide enough on the left and low enough at the bottom for the gate chips on the street.
  const left = P(-16, LOT_D + 26)[0]
  const right = P(LOT_W + 14, -40)[0]
  const top = P(0, -42, 34)[1]
  const bottom = P(LOT_W + 4, LOT_D + 42)[1]
  return { x: Math.floor(left), y: Math.floor(top), w: Math.ceil(right - left), h: Math.ceil(bottom - top) }
})()
