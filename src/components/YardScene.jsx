// Isometric drawing of the yard: the ground, the warehouse with its dock doors, the gates and the
// tractor-trailer rigs. Everything is plain SVG built from boxes in "world" units (about a foot each):
// x runs along the dock face, y from the dock face out to the street, z up. `P` projects a world point
// to the screen (2:1 isometric), so a box shows its top, its +y face (facing lower left) and its +x
// face (facing lower right). Light comes from the upper right: tops are brightest, +x faces a little
// darker and +y faces darker still, done with black overlays so one color per part is enough.
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

// A rig in its own frame: `a` runs along it from the trailer's rear (0) to the tractor's bumper (49),
// `c` across it (0..9), `z` up. `heading` places that frame in the world with the cab facing
// S (+y, toward the viewer's lower left: how trucks park), N (-y), E (+x) or W (-x); the rig then
// fills [0, 9] × [0, 49] (S, N) or [0, 49] × [0, 9] (E, W) from the origin. The c = 9 side is always
// the long side the viewer sees, so wheels and lettering go there; the cab front shows for S and E,
// the trailer's rear doors for N and W.
const RIG_FRAME = {
  S: (a, c, z) => [c, a, z],
  N: (a, c, z) => [c, RIG_L - a, z],
  E: (a, c, z) => [a, c, z],
  W: (a, c, z) => [RIG_L - a, c, z],
}
// Where a rig of this heading centered at (cx, cy) has its origin.
export const rigOrigin = (heading, cx, cy) =>
  heading === 'E' || heading === 'W' ? [cx - RIG_L / 2, cy - RIG_W / 2] : [cx - RIG_W / 2, cy - RIG_L / 2]

function rigKit(heading) {
  const map = RIG_FRAME[heading] ?? RIG_FRAME.S
  const frontShows = heading === 'S' || heading === 'E'
  // The visible long side is the plane x = 9 (S, N) or y = 9 (E, W).
  const sideIsX = heading === 'S' || heading === 'N'
  const quad = (corners, props) => <polygon points={pts(corners.map(([a, c, z]) => map(a, c, z)))} {...props} />
  const box = (a0, a1, c0, c1, z, h, props) => {
    const [x0, y0] = map(a0, c0, 0)
    const [x1, y1] = map(a1, c1, 0)
    return <Box x={Math.min(x0, x1)} y={Math.min(y0, y1)} z={z} w={Math.abs(x1 - x0)} d={Math.abs(y1 - y0)} h={h} {...props} />
  }
  // On the long side (c = cs): a quad spanning a0..a1 and z0..z1, a vertical line, a wheel, lettering.
  const side = (a0, a1, z0, z1, props, cs = RIG_W) => quad([[a0, cs, z0], [a1, cs, z0], [a1, cs, z1], [a0, cs, z1]], props)
  const sideLine = (key, a, z0, z1, props) => <polyline key={key} points={pts([map(a, RIG_W, z0), map(a, RIG_W, z1)])} {...props} />
  const planeMatrix = (x, y, z) => {
    const [sx, sy] = P(x, y, z)
    return `matrix(1 ${sideIsX ? -0.5 : 0.5} 0 1 ${r1(sx)} ${r1(sy)})`
  }
  const wheel = (a, key, r = 1.7) => {
    const [x, y, z] = map(a, RIG_W - 0.2, r)
    return (
      <g key={key} transform={planeMatrix(x, y, z)}>
        <circle r={r * C} fill="var(--color-iso-tire)" />
        <circle r={r * C * 0.5} fill="var(--color-iso-steel)" />
        <circle r={r * C * 0.18} fill="var(--color-iso-tire)" />
      </g>
    )
  }
  // Text along the long side between a0 and a1, reading left to right on screen whatever the heading.
  const sideText = (a0, a1, z, text, props) => {
    const e0 = map(a0, RIG_W, z)
    const e1 = map(a1, RIG_W, z)
    const start = P(...e0)[0] <= P(...e1)[0] ? e0 : e1
    return (
      <text transform={planeMatrix(...start)} {...props}>
        {text}
      </text>
    )
  }
  // Faces across the rig at a fixed a (the cab front at its a1, the trailer rear at a = 0).
  const across = (a, c0, c1, z0, z1, props) => quad([[a, c0, z0], [a, c1, z0], [a, c1, z1], [a, c0, z1]], props)
  return { map, frontShows, box, side, sideLine, wheel, sideText, across, quad }
}

// One rig, drawn from the origin in the given `heading` (default S, parked). `drop` draws the trailer
// alone on its landing gear; `reefer` adds the refrigeration unit; `glow` (selected) surrounds the rig
// with a glow in its carrier's paint.
export function Rig({ carrier, trailerNumber, drop, reefer, glow, heading = 'S' }) {
  const paint = paintOf(carrier)
  const k = rigKit(heading)
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
        fontFamily: 'var(--font-display)',
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
      {!k.frontShows && (
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
            {k.box(29, 48.4, 1.6, 7.4, 1.4, 1.6, { color: 'var(--color-iso-tire)', shade: false })}
            {k.wheel(31.2, 'd1')}
            {k.wheel(34.4, 'd2')}
            {k.wheel(45.4, 'f1')}
            {k.box(37.2, 40.8, RIG_W - 0.6, RIG_W + 0.4, 1.8, 1.8, { color: 'var(--color-iso-chrome)', line: 'var(--color-iso-steel)' })}
          </g>,
        ],
        [
          36,
          <g key="stack">{k.box(35.6, 36.2, 8.1, 8.7, 3.5, 11.6, { color: 'var(--color-iso-chrome)', line: 'var(--color-iso-steel)' })}</g>,
        ],
        [
          39.6,
          <g key="cab">
            {k.box(36.2, 43, 0.3, 8.7, 3, 8.4, { color: paint.color, line: cabLine })}
            {k.box(36.2, 39.8, 0.9, 8.1, 11.4, 1.6, { color: paint.color, line: cabLine })}
            {/* Side window, door seam and mirror. */}
            {k.side(40.2, 42.6, 8, 10.6, { fill: 'var(--color-iso-glass)' }, 8.7)}
            {k.side(39.6, 42.8, 3.6, 11, { fill: 'none', stroke: 'rgb(0 0 0 / 0.35)', strokeWidth: 0.4 }, 8.7)}
            {k.box(42.4, 42.8, 8.9, 9.4, 8.2, 1.8, { color: 'var(--color-iso-tire)', shade: false })}
            {k.frontShows && (
              <>
                {/* Two-pane windshield with a glint. */}
                {k.across(43, 0.9, 4.2, 8, 11, { fill: 'var(--color-iso-glass)' })}
                {k.across(43, 4.8, 8.1, 8, 11, { fill: 'var(--color-iso-glass)' })}
                {k.across(43, 1.2, 2.4, 10, 10.6, { fill: 'white', opacity: 0.35 })}
              </>
            )}
          </g>,
        ],
        [
          45.6,
          <g key="hood">
            {k.box(43, 48.3, 1, 8, 3, 5.4, { color: paint.color, line: cabLine })}
            {k.frontShows && (
              <>
                {/* Grille, headlights. */}
                {k.across(48.3, 2.6, 6.4, 3.6, 7.8, { fill: 'var(--color-iso-chrome)' })}
                {[0, 1, 2, 3, 4].map((i) => (
                  <polyline key={i} points={pts([k.map(48.3, 2.9, 4.2 + i * 0.75), k.map(48.3, 6.1, 4.2 + i * 0.75)])} stroke="var(--color-iso-steel)" strokeWidth={0.45} />
                ))}
                {k.across(48.3, 1.2, 2.3, 5.4, 6.4, { fill: 'var(--color-iso-light)' })}
                {k.across(48.3, 6.7, 7.8, 5.4, 6.4, { fill: 'var(--color-iso-light)' })}
              </>
            )}
          </g>,
        ],
        [48.7, <g key="bumper">{k.box(48.3, 49.1, 0.6, 8.4, 2.2, 1.3, { color: 'var(--color-iso-chrome)', line: 'var(--color-iso-steel)' })}</g>],
      ]

  // Back to front: rising `a` when the cab faces the viewer (S, E), falling when it faces away (N, W).
  const parts = [[17, trailer], [34.7, reeferUnit], ...tractor].filter(([, el]) => el)
  parts.sort((p, q) => (k.frontShows ? p[0] - q[0] : q[0] - p[0]))

  // Shadow: the rig's footprint, nudged toward the lower left.
  const [ox0, oy0] = k.map(0, 0, 0)
  const [ox1, oy1] = k.map(len, RIG_W, 0)
  const fx = Math.min(ox0, ox1)
  const fy = Math.min(oy0, oy1)
  return (
    <g>
      <Ground x={fx - 3} y={fy + 1} w={Math.abs(ox1 - ox0) + 2} d={Math.abs(oy1 - oy0)} fill="var(--color-iso-shadow)" filter="url(#iso-soft)" />
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
      <text transform={ON_Y_FACE(cx - 2.2, 0, 17.3)} fontFamily="var(--font-display)" fontWeight={700} fontSize={9.5} fill="white">
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

// Pole with a lamp (its light pool after dark is drawn by NightLights).
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
          fontFamily="var(--font-display)"
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
      <text transform={ON_GROUND(58, 76)} fontFamily="var(--font-display)" fontWeight={700} fontSize={10} letterSpacing={2} fill="var(--color-iso-paint)" opacity={0.75}>
        DRIVE LANE
      </text>
      <text transform={ON_GROUND(70, LOT_D + 19)} fontFamily="var(--font-display)" fontWeight={700} fontSize={10} letterSpacing={4} fill="var(--color-iso-paint)" opacity={0.5}>
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
      <text transform={ON_Y_FACE(B.x + 6, front, B.h - 2.8)} fontFamily="var(--font-display)" fontWeight={700} fontSize={7.5} letterSpacing={3} fill="white">
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

const Pool = ({ x, y, z = 0, rx, ry, opacity }) => {
  const [cx, cy] = P(x, y, z)
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-iso-glow)" opacity={Math.min(1, opacity * 1.25)} filter="url(#iso-halo)" style={{ mixBlendMode: 'screen' }} />
}

// Lights after dark, drawn above the night tint so they glow: a pool under each dock light (brighter
// at a dock in use), under each pole lamp, and a glow at the lit office and guard-shack windows.
export function NightLights({ occupied, night }) {
  if (night < 0.05) return null
  const B = BUILDING
  return (
    <g aria-hidden="true" pointerEvents="none">
      {DOCKS.map((d, i) => (
        <Pool key={d} x={colWX(i)} y={9} rx={40} ry={19} opacity={(occupied?.has(d) ? 0.55 : 0.3) * night} />
      ))}
      <Pool x={-2} y={70} rx={80} ry={40} opacity={0.4 * night} />
      <Pool x={LOT_W + 7} y={70} rx={80} ry={40} opacity={0.4 * night} />
      {[0, 1, 2].map((i) => (
        <Pool key={i} x={B.x + B.w + 2} y={B.y + 9.5 + i * 11} z={11} rx={16} ry={10} opacity={0.5 * night} />
      ))}
      <Pool x={SHACK.x + 8} y={SHACK.y + 12} z={4} rx={22} ry={12} opacity={0.5 * night} />
    </g>
  )
}

// Headlight beams on the ground ahead of a driving rig centered at (cx, cy), after dark.
export function Headlights({ cx, cy, heading, night }) {
  if (night < 0.05) return null
  const [ox, oy] = rigOrigin(heading, cx, cy)
  const map = RIG_FRAME[heading] ?? RIG_FRAME.S
  const corners = [map(49, 0.5, 0), map(49, 8.5, 0), map(70, 14, 0), map(70, -5, 0)].map(([x, y]) => [x + ox, y + oy, 0])
  return <polygon points={pts(corners)} fill="var(--color-iso-glow)" opacity={0.7 * night} filter="url(#iso-halo)" style={{ mixBlendMode: 'screen' }} aria-hidden="true" />
}

// How dark it is (0 day .. 1 night) and how warm the light is (dawn, dusk) at a moment, by the local
// clock: night until 5, brightening to 7; dusk from about 6:30 PM, full dark by 8:30 PM.
export function daylight(ms) {
  const d = new Date(ms)
  const h = d.getHours() + d.getMinutes() / 60
  const night = h < 5 ? 1 : h < 7 ? 1 - (h - 5) / 2 : h < 18.6 ? 0 : h < 20.6 ? (h - 18.6) / 2 : 1
  const warm = Math.max(0, 1 - Math.abs(h - 6.4) / 1.4, 1 - Math.abs(h - 18.6) / 1.4)
  const phase = night > 0.7 ? 'Night' : warm > 0.3 ? (h < 12 ? 'Dawn' : 'Dusk') : 'Day'
  return { night, warm, phase }
}

// The night and dusk wash over the whole scene (below the pins and labels). Its strength follows
// --iso-tint, lower in the app's dark theme, whose scene colors are already dark.
export function SkyTint({ night, warm }) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {warm > 0.01 && (
        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="var(--color-iso-dusk)" style={{ mixBlendMode: 'multiply', opacity: `calc(var(--iso-tint) * ${(0.3 * warm).toFixed(3)})` }} />
      )}
      {night > 0.01 && (
        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="var(--color-iso-night)" style={{ mixBlendMode: 'multiply', opacity: `calc(var(--iso-tint) * ${(0.7 * night).toFixed(3)})` }} />
      )}
    </g>
  )
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
