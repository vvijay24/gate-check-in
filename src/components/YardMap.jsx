import { useEffect, useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, clockTime, duration } from '../time'
import { yardStatus, isDrop } from '../metrics'
import { DETENTION_FREE_MIN, DOCKS, STALE_WARN_H } from '../yard'
import { BAY_WY, Foreground, GATE_WX, LOT_D, NightLighting, P, RIG_L, RIG_W, Rig, SHACK, Scene, VIEW, colWX, daylight, pts, rigOrigin } from './YardScene'
import { poseAt, spotCenter, useYardDrives } from './yardMotion'
import { detentionState } from '../detention'
import { GATES } from '../formConfig'

// Status colors shared by the map and its legend: the ground under each rig and its pin. The pin's icon
// and the rig itself (tractor + trailer, or a trailer on landing gear) carry the status too.
export const STATUS = {
  // The pale yellow fill gets an amber outline (`line`) so waiting trucks stand out from the bays.
  waiting: { fill: 'var(--color-warn)', line: 'var(--color-warn-line)', dot: 'bg-warn ring-1 ring-warn-line', label: 'Waiting for a dock' },
  dock: { fill: 'var(--color-delivery)', dot: 'bg-delivery', label: 'At dock' },
  ready: { fill: 'var(--color-ok)', dot: 'bg-ok', label: 'Loaded, ready to leave' },
  drop: { fill: 'var(--color-drop)', dot: 'bg-drop', label: 'Dropped trailer' },
  departed: { fill: 'var(--color-line)', dot: 'bg-line', label: 'Departed' },
}

// Gate colors shared by the map and the Gate Activity Log: Gate 1 (in) green, Gate 2 (out) rose.
export const GATE_STYLE = {
  'Gate 1': { fill: 'var(--color-gate-in)', dot: 'bg-gate-in', tag: 'bg-gate-in-soft text-gate-in', label: 'Gate 1 · In' },
  'Gate 2': { fill: 'var(--color-gate-out)', dot: 'bg-gate-out', tag: 'bg-gate-out-soft text-gate-out', label: 'Gate 2 · Out' },
}

// Why a truck or trailer needs attention, or '' if it doesn't.
export function attention(e, now) {
  const ms = now - arrivalMs(e)
  if (isDrop(e)) return ms > STALE_WARN_H * 3600000 ? `In the yard over ${STALE_WARN_H}h` : ''
  return ms > DETENTION_FREE_MIN * 60000 ? `Detention: over ${DETENTION_FREE_MIN} min` : ''
}

// Map geometry lives in YardScene (isometric world units); rigs sit in the dock and bay columns.
const short = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '')

// Status marker: a round pin in the status color with an icon, so status never rests on color alone.
// Drawn centered on (0, 0) with radius 11.
export function StatusPin({ status }) {
  const dark = status === 'waiting'
  const ink = dark ? 'var(--color-warn-ink)' : 'white'
  return (
    <g>
      <circle r={11} fill={STATUS[status].fill} stroke={STATUS[status].line ?? 'white'} strokeWidth={2} />
      {status === 'waiting' && (
        <g fill="none" stroke={ink} strokeWidth={1.8} strokeLinecap="round">
          <circle r={5.6} />
          <polyline points="0,-3.2 0,0 2.6,1.6" />
        </g>
      )}
      {status === 'dock' && (
        <g fill="none" stroke={ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="-5,-1 -5,5 5,5 5,-1" />
          <polyline points="0,-6 0,2" />
          <polyline points="-2.8,-0.8 0,2 2.8,-0.8" />
        </g>
      )}
      {status === 'ready' && <polyline points="-5,0 -1.5,4 5.2,-3.6" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />}
      {status === 'drop' && (
        <g fill="none" stroke={ink} strokeWidth={1.7} strokeLinecap="round">
          <rect x={-6} y={-4.5} width={12} height={5.5} rx={1} fill={ink} />
          <polyline points="2.5,1 2.5,5.5" />
          <polyline points="0.8,5.5 4.2,5.5" />
          <circle cx={-3.6} cy={3.4} r={1.4} fill={ink} stroke="none" />
        </g>
      )}
    </g>
  )
}

function AlertBadge() {
  return (
    <g>
      <circle r={8.5} fill="var(--color-danger)" stroke="var(--color-panel)" strokeWidth={2} />
      <text y={4.6} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
        !
      </text>
    </g>
  )
}

// A screen-aligned label chip: `lines` of text on a panel-colored plate, centered on (0, 0)'s top edge.
function Plate({ lines, tone }) {
  const width = Math.max(...lines.map((l) => l.text.length * (l.size ?? 12.5) * 0.58)) + 14
  const height = lines.length * 15 + 6
  const fill = tone === 'inspect' ? 'var(--color-warn-soft)' : 'var(--color-panel)'
  const stroke = tone === 'inspect' ? 'var(--color-warn-line)' : 'var(--color-line)'
  return (
    <g>
      <rect x={-width / 2} y={0} width={width} height={height} rx={6} fill={fill} stroke={stroke} strokeWidth={1.2} opacity={0.96} />
      {lines.map((l, i) => (
        <text
          key={i}
          x={0}
          y={15 + i * 15}
          textAnchor="middle"
          fontSize={l.size ?? 12.5}
          fontWeight={l.bold ? 700 : 500}
          fill={l.muted ? 'var(--color-muted)' : 'var(--color-ink)'}
        >
          {l.text}
        </text>
      ))}
    </g>
  )
}

// Screen translate for a rig's origin: a parked rig sits in its spot facing S; a driving one is posed
// along its route.
const placeAt = (pose) => {
  const [ox, oy] = rigOrigin(pose.heading, pose.cx, pose.cy)
  const [sx, sy] = P(ox, oy, 0)
  return `translate(${Math.round(sx * 10) / 10} ${Math.round(sy * 10) / 10})`
}

// The ground patch under a parked rig, in its own units: status-colored, and the click / focus target.
const footprint = (drop, grow = 0) =>
  pts([[-2 - grow, -0.4 - grow, 0], [RIG_W + 2 + grow, -0.4 - grow, 0], [RIG_W + 2 + grow, (drop ? 36 : RIG_L) + 1.2 + grow, 0], [-2 - grow, (drop ? 36 : RIG_L) + 1.2 + grow, 0]])

// How close to trouble a parked rig is: 'over' past free time (or a dropped trailer left too long),
// 'near' close to it, or nothing.
function trouble(e, clock) {
  if (isDrop(e)) return attention(e, clock) ? 'over' : null
  return detentionState(e, clock)?.level ?? null
}

// `onSelect` is left out on the compact map, where the whole map is one button instead.
// `focus` (inspection view): 'on' highlights the rig with an INSPECT / RE-CHECK tag and its time at the
// dock; 'off' fades it into the background; undefined draws it normally. `pose` places it (parked or
// driving); a driving rig is drawn as a whole rig without its ground patch, glow or click target.
function Unit({ e, pose, driving, at, clock, selected, onSelect, focus, motion }) {
  const status = yardStatus(e, at)
  const alert = attention(e, clock)
  const on = focus === 'on'
  const drop = isDrop(e)
  const recheck = e.loadingInspection?.result === 'Fail'
  const atDockFor = e.dockAssignedAt ? `${duration(clock - e.dockAssignedAt)} at dock` : ''
  const label =
    (on ? `${recheck ? 'Re-check' : 'Inspect'} Dock ${e.dockDoor}: ` : '') +
    `Trailer ${e.trailerNumber}, ${e.truckName}, ${STATUS[status].label}${on && atDockFor ? `, ${atDockFor}` : ''}${alert ? `, ${alert}` : ''}`
  const rig = (
    <Rig
      carrier={e.truckName}
      trailerNumber={e.trailerNumber}
      drop={drop && !driving}
      reefer={e.reefer === 'Yes'}
      glow={selected && !driving}
      heading={pose.heading}
    />
  )
  if (driving) {
    return (
      <g transform={placeAt(pose)} opacity={(focus === 'off' ? 0.3 : 1) * pose.opacity} aria-hidden="true">
        {rig}
      </g>
    )
  }
  const select = onSelect && {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-pressed': selected,
    onClick: () => onSelect(e.id),
    onKeyDown: (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault()
        onSelect(e.id)
      }
    },
  }
  const pad = footprint(drop)
  const warn = trouble(e, clock)
  return (
    <g {...select} className={'yard-unit' + (onSelect ? ' cursor-pointer' : '')} opacity={focus === 'off' ? 0.3 : 1} transform={placeAt(pose)}>
      <title>{label}</title>
      {warn && (
        // Detention glow: amber as free time runs out, red once it's past (or a drop left too long).
        <polygon
          points={footprint(drop, 3)}
          fill={warn === 'over' ? 'var(--color-danger)' : 'var(--color-warn-line)'}
          opacity={0.7}
          filter="url(#iso-halo)"
        >
          {motion && <animate attributeName="opacity" values="0.75;0.3;0.75" dur={warn === 'over' ? '1.6s' : '2.6s'} repeatCount="indefinite" />}
        </polygon>
      )}
      <polygon points={pad} fill={on ? 'var(--color-signal)' : STATUS[status].fill} opacity={on ? 0.75 : 0.5} />
      {/* A ring on the ground, under the rig: dashed for a rig that needs its inspection, solid amber
          for keyboard focus (index.css). Selected rigs glow in their cab color instead (no box). */}
      <polygon
        className="ring"
        points={pad}
        fill="none"
        stroke={on && !selected ? 'var(--color-signal-line)' : 'transparent'}
        strokeWidth={3}
        strokeDasharray={on ? '7 4' : undefined}
      />
      {rig}
      {/* Transparent click target over the rig's patch of ground. */}
      <polygon points={pad} fill="transparent" />
    </g>
  )
}

// What floats above and in front of a parked rig: the status pin (or the INSPECT tag), the alert badge
// and the trailer # plate on the ground in front of the cab. Drawn after every rig so nothing covers them.
function UnitLabels({ e, pose, at, clock, focus }) {
  const status = yardStatus(e, at)
  const alert = attention(e, clock)
  const on = focus === 'on'
  const drop = isDrop(e)
  const recheck = e.loadingInspection?.result === 'Fail'
  const atDockFor = e.dockAssignedAt ? `${duration(clock - e.dockAssignedAt)} at dock` : ''
  const [pinX, pinY] = P(RIG_W / 2, 17, 24)
  const [plateX, plateY] = P(RIG_W / 2, (drop ? 36 : RIG_L) + 3, 0)
  return (
    <g aria-hidden="true" pointerEvents="none" opacity={focus === 'off' ? 0.3 : 1} transform={placeAt(pose)}>
      <line x1={pinX} y1={pinY + 11} x2={pinX} y2={pinY + 22} stroke="var(--color-ink)" strokeWidth={1.5} opacity={0.5} />
      <g transform={`translate(${pinX} ${pinY})`}>
        {on ? (
          <g transform="translate(0 -12)">
            <Plate tone="inspect" lines={[{ text: recheck ? 'RE-CHECK' : 'INSPECT', bold: true, size: 12 }]} />
          </g>
        ) : (
          <StatusPin status={status} />
        )}
        {alert && (
          <g transform={on ? 'translate(38 -10)' : 'translate(12 -10)'}>
            <AlertBadge />
          </g>
        )}
      </g>
      <g transform={`translate(${plateX} ${plateY})`}>
        <Plate
          lines={[
            { text: short(e.trailerNumber, 10) || '—', bold: true },
            ...(on && atDockFor ? [{ text: atDockFor, size: 11, bold: true }] : []),
          ]}
        />
      </g>
    </g>
  )
}

// Sun or moon and the light's name, top left of the scene.
function SkyChip({ phase, clock }) {
  const x = VIEW.x + 14
  const y = VIEW.y + 14
  const dark = phase === 'Night'
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect width={118} height={30} rx={15} fill="var(--color-panel)" opacity={0.9} />
      <g transform="translate(17 15)">
        {dark ? (
          <path d="M3 -7 A7.5 7.5 0 1 0 6.5 4.5 A6 6 0 1 1 3 -7 Z" fill="var(--color-ink)" />
        ) : (
          <g fill="none" stroke="var(--color-warn-line)" strokeWidth={1.8} strokeLinecap="round">
            <circle r={4.2} fill="var(--color-warn)" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <line key={a} x1={0} y1={-6.5} x2={0} y2={-8.6} transform={`rotate(${a})`} />
            ))}
          </g>
        )}
      </g>
      <text x={32} y={19.5} fontSize={12.5} fontWeight={700} fill="var(--color-ink)">
        {phase} · {clockTime(clock)}
      </text>
    </g>
  )
}

// "✓ Free" / "✓ Open" written on the ground of an empty dock or bay.
function FreeMark({ wx, wy, text }) {
  const [x, y] = P(wx, wy, 0)
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={13}
      fontWeight={700}
      fill="var(--color-ok)"
      stroke="var(--color-panel)"
      strokeWidth={3.5}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {text}
    </text>
  )
}

// Gate name and today's in / out counts on a chip below each gate; the guard shack's chip too.
function GateChips({ gateCounts }) {
  return (
    <g>
      {GATES.map((gate, i) => {
        const [x, y] = P(GATE_WX[i], LOT_D + 24, 0)
        const c = gateCounts[gate] ?? { in: 0, out: 0 }
        const fill = GATE_STYLE[gate]?.fill ?? 'var(--color-ink)'
        return (
          <g key={gate} transform={`translate(${x} ${y})`}>
            <rect x={-56} y={-2} width={112} height={36} rx={7} fill="var(--color-panel)" stroke={fill} strokeWidth={2} opacity={0.96} />
            <text y={13} textAnchor="middle" fontSize={13} fontWeight={700} fill={fill}>
              {gate.toUpperCase()} · {i === 0 ? 'IN' : 'OUT'}
            </text>
            <text y={28} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
              {c.in} in · {c.out} out
            </text>
          </g>
        )
      })}
      <g transform={`translate(${P(SHACK.x + 5, SHACK.y + 5, 17).join(' ')})`}>
        <rect x={-30} y={-12} width={60} height={20} rx={6} fill="var(--color-panel)" opacity={0.92} />
        <text y={3} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-ink)">
          GUARD
        </text>
      </g>
    </g>
  )
}

function Legend() {
  const items = [
    ['waiting', false, 'Waiting for a dock', 'In a staging bay'],
    ['dock', false, 'At dock', 'Loading or unloading'],
    ['ready', false, 'Loaded, ready to leave', 'Loading inspection passed'],
    ['drop', true, 'Dropped trailer', 'No tractor, on its landing gear'],
  ]
  return (
    <ul className="grid gap-2.5 text-sm max-lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
      {items.map(([status, drop, title, note]) => (
        <li key={status} className="grid grid-cols-[30px_1fr] items-center gap-2">
          <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
            <StatusPin status={status} />
          </svg>
          <span>
            <b className="block">{title}</b>
            <span className="text-[12px] text-muted">{note}</span>
          </span>
        </li>
      ))}
      <li className="grid grid-cols-[30px_1fr] items-center gap-2">
        <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
          <AlertBadge />
        </svg>
        <span>
          <b className="block">Needs attention</b>
          <span className="text-[12px] text-muted">
            Detention over {DETENTION_FREE_MIN} min, or trailer over {STALE_WARN_H}h
          </span>
        </span>
      </li>
    </ul>
  )
}

// `onInspect` is given (inspection view) only for a truck that needs its Loading Inspection.
function Detail({ e, place, at, clock, live, onEdit, onCheckOut, onInspect }) {
  if (!e) return <p className="text-sm text-muted">Select a truck or trailer on the map to see its details.</p>
  const status = yardStatus(e, at)
  if (status === 'departed') {
    return (
      <p className="text-sm">
        <b className="font-display text-[16px]">{e.trailerNumber}</b> <span className="text-muted">{e.truckName}</span>
        <span className="mt-1 block text-muted">Left at {e.timeOut}.</span>
      </p>
    )
  }
  const alert = attention(e, clock)
  return (
    <div>
      <div className="font-display text-[16px] leading-tight font-semibold break-words">
        {e.trailerNumber} <span className="font-body text-sm font-normal text-muted">{e.truckName}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-semibold">
        <svg width="18" height="18" viewBox="-13 -13 26 26" aria-hidden="true">
          <StatusPin status={status} />
        </svg>
        {STATUS[status].label}
      </div>
      <p className="mt-1 text-sm text-muted">
        {[place, (e.visitPurpose ?? []).join(' + '), `on site ${duration(clock - arrivalMs(e))} (in ${e.timeIn || '—'})`]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {alert && <p className="mt-1 text-sm font-bold text-danger">⚠ {alert}</p>}
      {/* Actions only make sense on the live yard, not a replayed moment. */}
      <div className={'mt-2 flex flex-wrap gap-2' + (live ? '' : ' hidden')}>
        {onInspect && (
          <button type="button" onClick={() => onInspect(e)} className={ui.btnSmallPrimary}>
            {e.loadingInspection?.result === 'Fail' ? 'Re-check' : 'Inspect'}
          </button>
        )}
        <button type="button" onClick={() => onCheckOut(e)} className={onInspect ? ui.btnSmall : ui.btnSmallPrimary}>
          Check out
        </button>
        <button type="button" onClick={() => onEdit(e)} className={ui.btnSmall}>
          View entry
        </button>
      </div>
    </div>
  )
}

// One-line legend for the compact map: status color and name only.
function MiniLegend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
      {['waiting', 'dock', 'ready', 'drop'].map((s) => (
        <li key={s} className="flex items-center gap-1">
          <svg width="16" height="16" viewBox="-13 -13 26 26" aria-hidden="true">
            <StatusPin status={s} />
          </svg>
          {STATUS[s].label}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <svg width="16" height="16" viewBox="-13 -13 26 26" aria-hidden="true">
          <AlertBadge />
        </svg>
        Needs attention
      </li>
    </ul>
  )
}

// Legend for the compact inspection view.
function InspectLegend({ count }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
      <li className="flex items-center gap-1.5 font-semibold">
        <i className="inline-block h-3 w-3 rounded-[3px] border-2 border-dashed border-warn-line" />
        {count ? `${count} need${count === 1 ? 's' : ''} inspection · tap one to inspect` : 'No trucks waiting for inspection'}
      </li>
      <li className="flex items-center gap-1.5 text-muted">
        <i className="inline-block h-3 w-3 rounded-[3px] bg-line" />
        Faded: other trucks and trailers
      </li>
      <li className="flex items-center gap-1.5 text-muted">
        <i className="inline-block h-2.5 w-2.5 rounded-full bg-danger" />
        Past free time
      </li>
    </ul>
  )
}

// Whether the viewer asked for reduced motion (pulsing glows stop), kept current if it changes.
function useReducedMotion() {
  const [query] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null))
  const [reduced, setReduced] = useState(() => Boolean(query?.matches))
  useEffect(() => {
    if (!query) return
    const onChange = () => setReduced(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [query])
  return reduced
}

// Schematic of the grounds with every truck and trailer on site at its door or bay, at moment `at`
// (Infinity = live). `clock` is the time durations are measured to, and sets the light (day, dusk,
// night). `compact` draws a small map to fit a narrow column, with a short legend; the whole map is
// one button that calls `onExpand`.
// Inspection view: `focus(e)` says which trucks need inspecting; they're highlighted and everything
// else is faded. With `onInspect`, a highlighted truck opens its inspection (on the compact map a tap
// does it directly, so the map is no longer one Enlarge button).
// `highlightId` selects a rig from outside the map (e.g. the truck picked or being inspected on Dock &
// Loading); a rig tapped on the full map is selected here instead, and gets a floating card.
// `animate`: trucks drive their routes when their spot changes (default: on a live map).
export default function YardMap({ yard, gateCounts, at, clock, live, onEdit, onCheckOut, compact, onExpand, focus, onInspect, highlightId, animate = live }) {
  const [tappedId, setSelectedId] = useState(null)
  const selectedId = tappedId ?? highlightId ?? null
  const motion = useReducedMotion() === false
  const focusOf = (e) => (focus ? (focus(e) ? 'on' : 'off') : undefined)
  const inspectTap = compact && focus && onInspect

  const units = []
  DOCKS.forEach((d, i) => {
    const e = yard.atDock.get(d)
    if (e) units.push({ e, spot: { kind: 'dock', i }, place: `Dock ${d}` })
  })
  yard.bays.forEach((e, i) => {
    if (e) units.push({ e, spot: { kind: 'bay', i }, place: `Bay ${i + 1}` })
  })
  const { drives, now } = useYardDrives(units, { enabled: motion && Boolean(animate), live: Boolean(live) })

  // Everything drawn on the lot: parked rigs at their spots, driving ones (and ones leaving, no longer
  // among `units`) posed along their routes; nearer ones (larger x + y) drawn later.
  const parkedPose = (spot) => {
    const [cx, cy] = spotCenter(spot)
    return { cx, cy, heading: 'S', opacity: 1 }
  }
  const items = units.map((u) => {
    const d = drives.get(u.e.id)
    return { ...u, pose: d ? poseAt(d, now) : parkedPose(u.spot), driving: Boolean(d) }
  })
  for (const [id, d] of drives) {
    if (d.kind === 'leave') items.push({ e: d.e, pose: poseAt(d, now), driving: true, leaving: true, id })
  }
  items.sort((p, q) => p.pose.cx + p.pose.cy - (q.pose.cx + q.pose.cy))
  const parked = items.filter((u) => !u.driving)

  const selected = parked.find((u) => u.e.id === selectedId) ??
    [...yard.overflow, ...yard.otherDocks].map((e) => ({ e, place: e.dockDoor ? `Dock ${e.dockDoor}` : 'No bay free' })).find((u) => u.e.id === selectedId)
  const occupied = new Set(DOCKS.filter((d) => yard.atDock.has(d)))
  const sky = daylight(clock)

  const map = (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      role={compact && !inspectTap ? undefined : 'group'}
      aria-label={compact && !inspectTap ? undefined : focus ? 'Inspection map: trucks at docks that need their loading inspection' : 'Yard map: docks, staging bays and gates'}
      aria-hidden={(compact && !inspectTap) || undefined}
      className="block h-auto w-full"
    >
      <Scene occupied={occupied} motion={motion} night={sky.night} />
      {items.map((u) => (
        <Unit
          key={(u.leaving ? 'leaving-' : '') + u.e.id}
          e={u.e}
          pose={u.pose}
          driving={u.driving}
          at={at}
          clock={clock}
          focus={focusOf(u.e)}
          motion={motion}
          selected={u.e.id === selectedId}
          onSelect={inspectTap ? (focus(u.e) ? () => onInspect(u.e) : undefined) : compact ? undefined : setSelectedId}
        />
      ))}
      <Foreground gateFills={GATES.map((g) => GATE_STYLE[g]?.fill ?? 'var(--color-signal)')} night={sky.night} />
      <NightLighting
        occupied={occupied}
        night={sky.night}
        warm={sky.warm}
        rigs={items.map((u) => ({ ...u.pose, driving: u.driving }))}
      />
      {DOCKS.map((d, i) => (yard.atDock.has(d) ? null : <FreeMark key={d} wx={colWX(i)} wy={26} text="✓ Free" />))}
      {yard.bays.map((e, i) => (e ? null : <FreeMark key={i} wx={colWX(i)} wy={BAY_WY + 26} text="✓ Open" />))}
      {parked.map((u) => (
        <UnitLabels key={u.e.id} e={u.e} pose={u.pose} at={at} clock={clock} focus={focusOf(u.e)} />
      ))}
      <GateChips gateCounts={gateCounts} />
      <SkyChip phase={sky.phase} clock={clock} />
    </svg>
  )

  // Compact inspection view: highlighted trucks are the buttons; Enlarge stays in the card header.
  if (inspectTap) {
    const count = units.filter((u) => focus(u.e)).length + [...yard.overflow, ...yard.otherDocks].filter(focus).length
    return (
      <div className="mt-3">
        <div className="overflow-hidden rounded-lg">{map}</div>
        <InspectLegend count={count} />
        {yard.otherDocks.some(focus) && (
          <p className="mt-2 text-[13px] text-muted">
            Also needing inspection, at docks not on the map: {yard.otherDocks.filter(focus).map((e) => `Dock ${e.dockDoor} (${e.trailerNumber})`).join(', ')}
          </p>
        )}
        <p className="mt-2 text-[12px] text-muted">Updated {clockTime(clock)}.</p>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Enlarge the yard map: ${yard.atDock.size} at docks, ${yard.bays.filter(Boolean).length} in staging bays`}
          className="block w-full cursor-zoom-in overflow-hidden rounded-lg focus-visible:outline-3 focus-visible:outline-signal-line"
        >
          {map}
        </button>
        <MiniLegend />
        {yard.overflow.length > 0 && (
          <p className="mt-2 text-[13px] font-semibold text-danger">⚠ {yard.overflow.length} more without a bay</p>
        )}
        <p className="mt-2 text-[12px] text-muted">Tap the map to enlarge it. Updated {clockTime(clock)}.</p>
      </div>
    )
  }

  // Floating card for the tapped truck, anchored just above it (or below it near the top of the map),
  // positioned in % of the map so it stays put as the map scales.
  let card = null
  if (selected) {
    const spotUnit = parked.find((u) => u.e.id === selected.e.id)
    let style = { left: '2%', top: '3%' }
    if (spotUnit) {
      // Above the truck when there's room; near the top of the map, beside its cab instead (to the
      // left when the cab is far enough right, else to the right) so the card covers less of the yard.
      const pct = ([x, y]) => [((x - VIEW.x) / VIEW.w) * 100, ((y - VIEW.y) / VIEW.h) * 100]
      const { cx, cy } = spotUnit.pose
      const [ax, ay] = pct(P(cx, cy - 8, 30))
      if (ay >= 36) {
        style = { left: `${Math.min(80, Math.max(20, ax))}%`, top: `${ay}%`, transform: 'translate(-50%, calc(-100% - 10px))' }
      } else {
        const [fx, fy] = pct(P(cx - RIG_W / 2, cy + RIG_L / 2, 6))
        const [rx] = pct(P(cx + RIG_W / 2, cy + RIG_L / 2, 6))
        style =
          fx > 38
            ? { left: `${fx}%`, top: `${fy}%`, transform: 'translate(calc(-100% - 12px), -50%)' }
            : { left: `${rx}%`, top: `${fy}%`, transform: 'translate(12px, -50%)' }
      }
    }
    card = (
      <div
        role="dialog"
        aria-label={`Trailer ${selected.e.trailerNumber}`}
        style={style}
        className="absolute z-10 w-[300px] max-w-[85%] rounded-xl border border-line bg-panel/85 p-3.5 pr-11 shadow-2xl backdrop-blur-md"
      >
        <button
          type="button"
          aria-label="Close truck details"
          onClick={() => setSelectedId(null)}
          className="absolute top-2 right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl leading-none text-muted hover:bg-field hover:text-ink"
        >
          ✕
        </button>
        <Detail
          e={selected.e}
          place={selected.place}
          at={at}
          clock={clock}
          live={live}
          onEdit={onEdit}
          onCheckOut={onCheckOut}
          onInspect={onInspect && focus && focus(selected.e) ? onInspect : undefined}
        />
      </div>
    )
  }

  return (
    // minmax(0, 1fr): on small screens the wide map scrolls inside its box rather than the page.
    <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div>
        <div className="overflow-x-auto rounded-lg">
          <div className="relative min-w-[700px]">
            {map}
            {card}
          </div>
        </div>
        {yard.overflow.length > 0 && (
          <p className="mt-2 text-sm font-semibold text-danger">
            ⚠ {yard.overflow.length} more without a bay:{' '}
            {yard.overflow.map((e, i) => (
              <span key={e.id}>
                {i > 0 && ', '}
                <button type="button" onClick={() => setSelectedId(e.id)} className="cursor-pointer underline">
                  {e.trailerNumber}
                </button>
              </span>
            ))}
          </p>
        )}
        {yard.otherDocks.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            Also at docks not on the map: {yard.otherDocks.map((e) => `Dock ${e.dockDoor} (${e.trailerNumber})`).join(', ')}
          </p>
        )}
      </div>
      <aside>
        <Legend />
        <p className="mt-3 text-[13px] text-muted">
          {selected ? 'Tap another truck, or ✕ to close its card.' : 'Tap a truck to see its details.'}
        </p>
        <p className="mt-2 text-[12px] text-muted">
          {live ? `Updated ${clockTime(clock)}.` : `Yard as it was at ${clockTime(clock)}.`} Trucks sit in the bay picked at check-in; any without one fill free bays in arrival order.
        </p>
      </aside>
    </div>
  )
}
