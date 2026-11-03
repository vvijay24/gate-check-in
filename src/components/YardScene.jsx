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
export const GATE_WX = [44, 136]
const BAY_FRONT = BAY_WY + RIG_L + 3

// Text laid on a face or on the ground: the matrix maps the text's x axis onto the face.
const ON_X_FACE = (x, y, z) => {
  const [sx, sy] = P(x, y, z)
  return `matrix(1 -0.5 0 1 ${r1(sx)} ${r1(sy)})`
}
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

// A wheel on the +x side: a disc in the plane x, centered at (y, z).
function Wheel({ x, y, z = 1.7, r = 1.7 }) {
  const [sx, sy] = P(x, y, z)
  const m = `matrix(1 -0.5 0 1 ${r1(sx)} ${r1(sy)})`
  return (
    <g transform={m}>
      <circle r={r * C} fill="var(--color-iso-tire)" />
      <circle r={r * C * 0.5} fill="var(--color-iso-steel)" />
      <circle r={r * C * 0.18} fill="var(--color-iso-tire)" />
    </g>
  )
}

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

// One rig drawn at the origin: trailer from y = 0 (rear, at the dock) to y = 34, tractor in front facing
// +y. `drop` draws the trailer alone on its landing gear; `reefer` adds the refrigeration unit.
// `glow` (selected) surrounds the rig with a glow in its carrier's paint.
export function Rig({ carrier, trailerNumber, drop, reefer, glow }) {
  const paint = paintOf(carrier)
  const T = { x: 0, y: 0, z: 4.2, w: RIG_W, d: 34, h: 9.4 }
  const tx = T.x + T.w
  const name = short(String(carrier || '').toUpperCase(), 15)
  return (
    <g>
      {/* Shadow, cast toward the lower left by light from the upper right. */}
      <Ground x={-3} y={1} w={RIG_W + 2} d={drop ? 36 : RIG_L} fill="var(--color-iso-shadow)" filter="url(#iso-soft)" />
      <g filter={glow ? `url(#iso-glow-${paint.index})` : undefined}>

      {/* Trailer underframe and rear tandem. */}
      <Box x={1} y={0.5} z={2.6} w={7} d={33} h={1.6} color="var(--color-iso-tire)" shade={false} />
      <Wheel x={tx - 0.2} y={4} />
      <Wheel x={tx - 0.2} y={7.6} />
      {drop && (
        <>
          {/* Landing gear legs and sand shoes. */}
          <Box x={6.8} y={27.6} z={0} w={0.8} d={0.8} h={4.2} color="var(--color-iso-steel)" />
          <Box x={1.4} y={27.6} z={0} w={0.8} d={0.8} h={4.2} color="var(--color-iso-steel)" />
          <Box x={1.2} y={27.2} z={0} w={6.6} d={1.6} h={0.4} color="var(--color-iso-tire)" />
        </>
      )}

      {/* Trailer body with its ribs, carrier stripe and lettering. */}
      <Box {...T} color="var(--color-iso-trailer)" line="var(--color-iso-steel)" />
      {Array.from({ length: 12 }, (_, i) => (
        <polyline
          key={i}
          points={pts([[tx, 1.4 + i * 2.8, T.z + 0.2], [tx, 1.4 + i * 2.8, T.z + T.h - 0.2]])}
          stroke="var(--color-iso-steel)"
          strokeWidth={0.35}
          opacity={0.55}
        />
      ))}
      <SideQuad x={tx} y={0.4} d={33.2} z={T.z + 0.6} h={1.3} fill={paint.color} />
      <SideQuad x={tx} y={0.4} d={33.2} z={T.z + T.h - 1.2} h={0.5} fill={paint.color} opacity={0.85} />
      <text
        transform={ON_X_FACE(tx, 31, T.z + 4.6)}
        fontFamily="var(--font-display)"
        fontWeight={700}
        fontSize={10}
        letterSpacing={0.4}
        fill={paint.light ? 'var(--color-iso-band)' : paint.color}
      >
        {name}
      </text>
      <text transform={ON_X_FACE(tx, 7.4, T.z + 7.4)} fontFamily="var(--font-body)" fontWeight={700} fontSize={5.2} fill="var(--color-iso-band)">
        {short(String(trailerNumber || ''), 10)}
      </text>
      {/* Marker lights along the top edge. */}
      <SideQuad x={tx} y={33} d={0.7} z={T.z + T.h - 0.5} h={0.4} fill="var(--color-paint-2)" />

      {reefer && (
        <>
          {/* Reefer unit on the trailer nose, with its grille. */}
          <Box x={1.3} y={34} z={7.2} w={6.4} d={1.5} h={5.8} color="var(--color-iso-chrome)" line="var(--color-iso-steel)" />
          {[0, 1, 2, 3].map((i) => (
            <polyline key={i} points={pts([[1.9, 35.5, 8.3 + i * 1.2], [7.1, 35.5, 8.3 + i * 1.2]])} stroke="var(--color-iso-steel)" strokeWidth={0.5} />
          ))}
        </>
      )}

      {!drop && (
        <g>
          {/* Tractor frame, drive axles under the trailer nose and the steer axle. */}
          <Box x={1.6} y={29} z={1.4} w={5.8} d={19.4} h={1.6} color="var(--color-iso-tire)" shade={false} />
          <Wheel x={tx - 0.3} y={31.2} />
          <Wheel x={tx - 0.3} y={34.4} />
          <Wheel x={tx - 0.6} y={45.4} />
          {/* Fuel tank and step under the cab. */}
          <Box x={tx - 0.6} y={37.2} z={1.8} w={1} d={3.6} h={1.8} color="var(--color-iso-chrome)" line="var(--color-iso-steel)" />
          {/* Cab and sleeper, roof fairing, hood. */}
          <Box x={0.3} y={36.2} z={3} w={8.4} d={6.8} h={8.4} color={paint.color} line="rgb(0 0 0 / 0.25)" />
          <Box x={0.9} y={36.2} z={11.4} w={7.2} d={3.6} h={1.6} color={paint.color} line="rgb(0 0 0 / 0.25)" />
          <Box x={1} y={43} z={3} w={7} d={5.3} h={5.4} color={paint.color} line="rgb(0 0 0 / 0.25)" />
          {/* Windshield (two panes), side window and door seam. */}
          <FrontQuad x={0.9} y={43} w={3.3} z={8} h={3} fill="var(--color-iso-glass)" />
          <FrontQuad x={4.8} y={43} w={3.3} z={8} h={3} fill="var(--color-iso-glass)" />
          <FrontQuad x={1.2} y={43} w={1.2} z={10} h={0.6} fill="white" opacity={0.35} />
          <SideQuad x={8.7} y={40.2} d={2.4} z={8} h={2.6} fill="var(--color-iso-glass)" />
          <SideQuad x={8.7} y={39.6} d={3.2} z={3.6} h={7.4} fill="none" stroke="rgb(0 0 0 / 0.35)" strokeWidth={0.4} />
          {/* Grille, headlights, bumper. */}
          <FrontQuad x={2.6} y={48.3} w={3.8} z={3.6} h={4.2} fill="var(--color-iso-chrome)" />
          {[0, 1, 2, 3, 4].map((i) => (
            <polyline key={i} points={pts([[2.9, 48.3, 4.2 + i * 0.75], [6.1, 48.3, 4.2 + i * 0.75]])} stroke="var(--color-iso-steel)" strokeWidth={0.45} />
          ))}
          <FrontQuad x={1.2} y={48.3} w={1.1} z={5.4} h={1} fill="var(--color-iso-light)" />
          <FrontQuad x={6.7} y={48.3} w={1.1} z={5.4} h={1} fill="var(--color-iso-light)" />
          <Box x={0.6} y={48.3} z={2.2} w={7.8} d={0.8} h={1.3} color="var(--color-iso-chrome)" line="var(--color-iso-steel)" />
          {/* Exhaust stack and mirror. */}
          <Box x={8.1} y={35.6} z={3.5} w={0.6} d={0.6} h={11.6} color="var(--color-iso-chrome)" line="var(--color-iso-steel)" />
          <Box x={8.9} y={42.4} z={8.2} w={0.5} d={0.4} h={1.8} color="var(--color-iso-tire)" shade={false} />
        </g>
      )}
      </g>
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

function LightPole({ x, y }) {
  return (
    <g>
      <Box x={x} y={y} z={0} w={0.6} d={0.6} h={24} color="var(--color-iso-steel)" />
      <Box x={x - 2.4} y={y - 0.2} z={24} w={3.2} d={1} h={0.8} color="var(--color-iso-band)" />
      <FrontQuad x={x - 2.2} y={y + 0.8} w={2.8} z={24} h={0.3} fill="var(--color-iso-light)" />
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
  const half = 13
  return (
    <g>
      <Ground x={cx - half} y={LOT_D - 2} w={half * 2} d={4} fill={color} opacity={0.85} />
      <Box x={cx - half - 1.6} y={LOT_D - 0.8} w={1.6} d={1.6} h={4.4} color="var(--color-iso-band)" />
      {Array.from({ length: 6 }, (_, i) => (
        <Box
          key={i}
          x={cx - half + i * 3.6}
          y={LOT_D - 0.3}
          z={3.4}
          w={3.6}
          d={0.6}
          h={0.7}
          color={i % 2 ? 'var(--color-iso-paint)' : 'var(--color-paint-1)'}
          shade={false}
        />
      ))}
    </g>
  )
}

function GuardShack() {
  const x = 84
  const y = 154
  return (
    <g>
      <Ground x={x - 2} y={y - 2} w={16} d={16} fill="var(--color-iso-curb)" />
      <Box x={x} y={y} w={12} d={12} h={9} color="var(--color-iso-wall)" line="rgb(0 0 0 / 0.15)" />
      <FrontQuad x={x + 1.5} y={y + 12} w={9} z={4} h={3.6} fill="var(--color-iso-glass)" />
      <SideQuad x={x + 12} y={y + 1.5} d={9} z={4} h={3.6} fill="var(--color-iso-glass)" />
      <FrontQuad x={x + 2} y={y + 12} w={2} z={4.8} h={1.4} fill="white" opacity={0.3} />
      <Box x={x - 1} y={y - 1} z={9} w={14} d={14} h={1.2} color="var(--color-iso-band)" />
    </g>
  )
}

// `occupied` holds the dock numbers with a truck backed in (their doors are drawn open). `motion`: the
// selected rig's glow may pulse (off when the viewer asks for reduced motion).
export function Scene({ occupied, motion }) {
  const B = BUILDING
  const front = B.y + B.d
  return (
    <g>
      <defs>
        <filter id="iso-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
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
        <SideQuad key={i} x={B.x + B.w} y={B.y + 6 + i * 11} d={7} z={9} h={5} fill="var(--color-iso-glass)" />
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
      <LightPole x={MARGIN / 2} y={70} />
    </g>
  )
}

// What sits in front of the rigs: the right-hand and front fences, gates, guard shack, a tree and a pole.
export function Foreground({ gateFills }) {
  return (
    <g>
      <LightPole x={LOT_W - MARGIN / 2} y={70} />
      <Fence along="y" at={LOT_W} from={0} to={LOT_D} />
      <Fence along="x" at={LOT_D} from={0} to={GATE_WX[0] - 15} />
      <Fence along="x" at={LOT_D} from={GATE_WX[0] + 15} to={GATE_WX[1] - 15} />
      <Fence along="x" at={LOT_D} from={GATE_WX[1] + 15} to={LOT_W} />
      <GuardShack />
      {GATE_WX.map((x, i) => (
        <Gate key={x} cx={x} color={gateFills[i]} />
      ))}
      <Tree x={196} y={40} s={1.1} />
      <Tree x={198} y={120} />
    </g>
  )
}

// The scene's frame in screen units, sized to the lot with the warehouse roof and the street in view.
export const VIEW = (() => {
  const left = P(-6, LOT_D + 24)[0]
  const right = P(LOT_W + 14, -40)[0]
  const top = P(0, -42, 34)[1]
  const bottom = P(LOT_W, LOT_D + 26)[1]
  return { x: Math.floor(left), y: Math.floor(top), w: Math.ceil(right - left), h: Math.ceil(bottom - top) }
})()
