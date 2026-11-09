import { useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, clockTime, duration } from '../time'
import { yardStatus, isDrop } from '../metrics'
import { DETENTION_FREE_MIN, DOCKS, STALE_WARN_H } from '../yard'
import { GATE } from '../formConfig'
import { Icon } from '../icons'
import { detentionState } from '../detention'

// Status colors shared by the map and its legend. The icon shape
// (tractor + trailer, or trailer on landing gear) also tells trucks from dropped trailers.
export const STATUS = {
  waiting: { fill: 'var(--color-warn-edge)', dot: 'bg-warn-edge', label: 'Waiting for a dock' },
  dock: { fill: 'var(--color-delivery)', dot: 'bg-delivery', label: 'At dock' },
  ready: { fill: 'var(--color-ok)', dot: 'bg-ok', label: 'Loaded, ready to leave' },
  drop: { fill: 'var(--color-drop)', dot: 'bg-drop', label: 'Dropped trailer' },
  departed: { fill: 'var(--color-line)', dot: 'bg-line', label: 'Departed' },
}


// Why a truck or trailer needs attention, or '' if it doesn't. Detention follows the same rule as
// everywhere else (detention.js).
export function attention(e, now) {
  if (isDrop(e)) return now - arrivalMs(e) > STALE_WARN_H * 3600000 ? `In the yard over ${STALE_WARN_H}h` : ''
  return detentionState(e, now)?.level === 'over' ? `Detention: over ${DETENTION_FREE_MIN} min` : ''
}

// Map geometry (SVG units). Docks share the warehouse width; the yard lane below holds LANE_SLOTS
// trucks side by side (no numbered spots), and any more are listed under the map.
const COLS = DOCKS.length
const colX = (i) => 60 + (880 / COLS) * (i + 0.5)
const LANE_SLOTS = 10
const SLOT_W = 860 / LANE_SLOTS
const laneX = (i) => 70 + SLOT_W * i + (SLOT_W - 44) / 2
const W = 44
const TRAILER = 92
const CAB = 24
const GAP = 2
const DOCK_Y = 116
const LANE_Y = 336
// The one gate, in the middle of the street side; the guard shack sits just right of it.
const GATE_X = 500
const GATE_W = 160

const short = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '')

function TruckIcon({ status, drop }) {
  const fill = STATUS[status].fill
  return (
    <>
      <rect width={W} height={TRAILER} rx={4} fill={fill} stroke="var(--color-panel)" strokeWidth={2} />
      {drop ? (
        <>
          <rect x={6} y={TRAILER + GAP} width={6} height={12} fill="var(--color-ink)" />
          <rect x={W - 12} y={TRAILER + GAP} width={6} height={12} fill="var(--color-ink)" />
        </>
      ) : (
        <>
          <rect x={4} y={TRAILER + GAP} width={W - 8} height={CAB} rx={6} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} />
          <rect x={9} y={TRAILER + GAP + 12} width={W - 18} height={6} rx={2} fill={fill} />
        </>
      )}
    </>
  )
}

// `onSelect` is left out on the compact map, where the whole map is one button instead.
// `focus` (inspection view): 'on' draws the truck highlighted with a vertical INSPECT / RE-CHECK label
// and its time at the dock; 'off' fades it into the background; undefined draws it normally.
function Unit({ e, x, y, at, clock, selected, onSelect, focus }) {
  const status = yardStatus(e, at)
  const alert = attention(e, clock)
  const on = focus === 'on'
  const recheck = e.loadingInspection?.result === 'Fail'
  const atDockFor = e.dockAssignedAt ? `${duration(clock - e.dockAssignedAt)} at dock` : ''
  const label =
    (on ? `${recheck ? 'Re-check' : 'Inspect'} Dock ${e.dockDoor}: ` : '') +
    `Trailer ${e.trailerNumber}, ${e.truckName}, ${STATUS[status].label}${on && atDockFor ? `, ${atDockFor}` : ''}${alert ? `, ${alert}` : ''}`
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
  return (
    <g
      {...select}
      className={'yard-unit' + (onSelect ? ' cursor-pointer' : '')}
      opacity={focus === 'off' ? 0.25 : 1}
      style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform 1.2s ease, opacity 0.3s ease' }}
    >
      <title>{label}</title>
      <rect
        className="hit"
        x={-6}
        y={-6}
        width={W + 12}
        height={TRAILER + CAB + GAP + 12}
        rx={8}
        fill="transparent"
        stroke={selected ? 'var(--color-ink)' : on ? 'var(--color-signal)' : 'transparent'}
        strokeWidth={3}
        strokeDasharray={on && !selected ? '6 4' : undefined}
      />
      <TruckIcon status={status} drop={isDrop(e)} />
      {/* Panel color reads on the trailer color in both light and dark mode. */}
      {on && (
        <text
          x={W / 2}
          y={TRAILER / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13}
          fontWeight={700}
          letterSpacing={1}
          fill="var(--color-panel)"
          transform={`rotate(-90 ${W / 2} ${TRAILER / 2})`}
        >
          {recheck ? 'RE-CHECK' : 'INSPECT'}
        </text>
      )}
      {alert && (
        <>
          <circle cx={W} cy={0} r={11} fill="var(--color-danger)" stroke="var(--color-panel)" strokeWidth={2} />
          <text x={W} y={5} textAnchor="middle" fontSize={15} fontWeight={800} fill="#fff">
            !
          </text>
        </>
      )}
      <text x={W / 2} y={TRAILER + CAB + GAP + 16} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--color-ink)">
        {short(e.trailerNumber, 9)}
      </text>
      {/* In the inspection view, time at the dock replaces the carrier name. */}
      <text
        x={W / 2}
        y={TRAILER + CAB + GAP + 31}
        textAnchor="middle"
        fontSize={12}
        fontWeight={on ? 700 : undefined}
        fill={on ? 'var(--color-ink)' : 'var(--color-muted)'}
      >
        {on && atDockFor ? atDockFor : short(e.truckName, 14)}
      </text>
    </g>
  )
}

function Grounds({ gateCounts }) {
  const text = { fill: 'var(--color-ink)', fontWeight: 700 }
  return (
    <g>
      <rect width={1000} height={660} rx={8} fill="var(--color-asphalt)" />
      <rect x={60} y={14} width={880} height={96} rx={4} fill="var(--color-building)" />
      <text x={500} y={52} textAnchor="middle" fontSize={20} {...text} fontFamily="var(--font-display)">
        WAREHOUSE
      </text>
      {DOCKS.map((d, i) => (
        <g key={d}>
          <rect x={colX(i) - 34} y={76} width={68} height={34} rx={3} fill="var(--color-panel)" />
          <text x={colX(i)} y={99} textAnchor="middle" fontSize={15} {...text}>
            Dock {d}
          </text>
          <rect x={colX(i) - 36} y={112} width={72} height={128} fill="none" stroke="var(--color-line)" strokeWidth={2} />
        </g>
      ))}
      <text x={500} y={287} textAnchor="middle" fontSize={13} fontWeight={600} letterSpacing={2} fill="var(--color-muted)">
        DRIVE LANE →
      </text>
      <rect x={60} y={306} width={880} height={190} rx={4} fill="var(--color-lane)" stroke="var(--color-line)" strokeWidth={2} />
      <text x={70} y={326} fontSize={13} fontWeight={700} letterSpacing={1} fill="var(--color-muted)">
        YARD · WAITING FOR A DOCK, THEN DROPPED TRAILERS
      </text>
      <line x1={0} y1={530} x2={1000} y2={530} stroke="var(--color-ink)" strokeWidth={3} />
      <g>
        <rect x={GATE_X - GATE_W / 2} y={525} width={GATE_W} height={10} fill="var(--color-asphalt)" />
        <rect x={GATE_X - GATE_W / 2} y={527} width={GATE_W} height={6} rx={2} fill="var(--color-signal)" />
        <text x={GATE_X} y={518} textAnchor="middle" fontSize={14} {...text} fill="var(--color-signal)">
          {GATE.toUpperCase()} · IN / OUT
        </text>
        <text x={GATE_X} y={560} textAnchor="middle" fontSize={13} fill="var(--color-muted)">
          {gateCounts[GATE]?.in ?? 0} in · {gateCounts[GATE]?.out ?? 0} out
        </text>
      </g>
      <rect x={GATE_X + GATE_W / 2 + 20} y={548} width={100} height={64} rx={4} fill="var(--color-building)" />
      <text x={GATE_X + GATE_W / 2 + 70} y={585} textAnchor="middle" fontSize={13} {...text}>
        GUARD SHACK
      </text>
      <rect y={630} width={1000} height={30} fill="var(--color-building)" />
      <text x={500} y={650} textAnchor="middle" fontSize={12} fontWeight={600} letterSpacing={3} fill="var(--color-ink)">
        STREET
      </text>
    </g>
  )
}

function Legend() {
  const items = [
    ['waiting', false, 'Waiting for a dock', 'In the yard lane'],
    ['dock', false, 'At dock', 'Loading or unloading'],
    ['ready', false, 'Loaded, ready to leave', 'Loading inspection passed'],
    ['drop', true, 'Dropped trailer', 'No tractor, landing gear down'],
  ]
  return (
    <ul className="grid gap-2.5 text-sm max-lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
      {items.map(([status, drop, title, note]) => (
        <li key={status} className="grid grid-cols-[30px_1fr] items-center gap-2">
          <svg width="26" height="36" viewBox="-2 -2 48 124" aria-hidden="true">
            <TruckIcon status={status} drop={drop} />
          </svg>
          <span>
            <b className="block">{title}</b>
            <span className="text-[12px] text-muted">{note}</span>
          </span>
        </li>
      ))}
      <li className="grid grid-cols-[30px_1fr] items-center gap-2">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="13" cy="13" r="11" fill="var(--color-danger)" />
          <text x="13" y="18" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff">
            !
          </text>
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
        <b className="font-display text-[18px]">{e.trailerNumber}</b> <span className="text-muted">{e.truckName}</span>
        <span className="mt-1 block text-muted">Left at {e.timeOut}.</span>
      </p>
    )
  }
  const alert = attention(e, clock)
  return (
    <div>
      <div className="font-display text-[18px] leading-tight font-bold break-words">
        {e.trailerNumber} <span className="font-body text-sm font-normal text-muted">{e.truckName}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-semibold">
        <i className={'inline-block h-2.5 w-2.5 rounded-[3px] ' + STATUS[status].dot} />
        {STATUS[status].label}
      </div>
      <p className="mt-1 text-sm text-muted">
        {[place, (e.visitPurpose ?? []).join(' + '), `on site ${duration(clock - arrivalMs(e))} (in ${e.timeIn || '—'})`]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {alert && (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-danger">
          <Icon name="warning" size={16} />
          {alert}
        </p>
      )}
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
          <i className={'inline-block h-2.5 w-2.5 rounded-[3px] ' + STATUS[s].dot} />
          {STATUS[s].label}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <i className="inline-block h-2.5 w-2.5 rounded-full bg-danger" />
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
        <i className="inline-block h-3 w-3 rounded-[3px] border-2 border-dashed border-signal" />
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

// Schematic of the grounds with every truck and trailer on site at its dock or in the yard lane, at moment `at`
// (Infinity = live). `clock` is the time durations are measured to. `compact` draws a small map to fit
// a narrow column, with a short legend; the whole map is one button that calls `onExpand`.
// Inspection view: `focus(e)` says which trucks need inspecting; they're highlighted and everything
// else is faded. With `onInspect`, a highlighted truck opens its inspection (on the compact map a tap
// does it directly, so the map is no longer one Enlarge button).
export default function YardMap({ yard, gateCounts, at, clock, live, onEdit, onCheckOut, compact, onExpand, focus, onInspect }) {
  const [selectedId, setSelectedId] = useState(null)
  const focusOf = (e) => (focus ? (focus(e) ? 'on' : 'off') : undefined)
  const inspectTap = compact && focus && onInspect

  const units = []
  DOCKS.forEach((d, i) => {
    const e = yard.atDock.get(d)
    if (e) units.push({ e, x: colX(i) - W / 2, y: DOCK_Y, place: `Dock ${d}` })
  })
  // Waiting trucks and dropped trailers line up in the yard lane; past its width they're listed below.
  const inYard = (e) => (isDrop(e) ? 'Parked in the yard' : 'Waiting in the yard')
  yard.lane.slice(0, LANE_SLOTS).forEach((e, i) => units.push({ e, x: laneX(i), y: LANE_Y, place: inYard(e) }))
  const extra = yard.lane.slice(LANE_SLOTS)
  const selected = units.find((u) => u.e.id === selectedId) ??
    [...extra, ...yard.otherDocks].map((e) => ({ e, place: e.dockDoor ? `Dock ${e.dockDoor}` : inYard(e) })).find((u) => u.e.id === selectedId)

  const map = (
    <svg
      viewBox="0 0 1000 660"
      role={compact && !inspectTap ? undefined : 'group'}
      aria-label={compact && !inspectTap ? undefined : focus ? 'Inspection map: trucks at docks that need their loading inspection' : 'Yard map: docks, yard lane and gates'}
      aria-hidden={(compact && !inspectTap) || undefined}
      className={'block h-auto w-full' + (compact ? '' : ' min-w-[700px]')}
    >
      <Grounds gateCounts={gateCounts} />
      {DOCKS.map((d, i) =>
        yard.atDock.has(d) ? null : (
          <text key={d} x={colX(i)} y={182} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--color-ok)">
            ✓ Free
          </text>
        ),
      )}
      {yard.lane.length === 0 && (
        <text x={500} y={410} textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--color-muted)">
          No trucks waiting or trailers parked in the yard
        </text>
      )}
      {units.map((u) => (
        <Unit
          key={u.e.id}
          e={u.e}
          x={u.x}
          y={u.y}
          at={at}
          clock={clock}
          selected={u.e.id === selectedId}
          focus={focusOf(u.e)}
          onSelect={
            inspectTap ? (focus(u.e) ? () => onInspect(u.e) : undefined) : compact ? undefined : setSelectedId
          }
        />
      ))}
    </svg>
  )

  // Compact inspection view: highlighted trucks are the buttons; Enlarge stays in the card header.
  if (inspectTap) {
    const count = units.filter((u) => focus(u.e)).length + [...extra, ...yard.otherDocks].filter(focus).length
    return (
      <div>
        <div className="overflow-hidden rounded-xl">{map}</div>
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
      <div>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Enlarge the yard map: ${yard.atDock.size} at docks, ${yard.lane.length} in the yard`}
          className="block w-full cursor-zoom-in overflow-hidden rounded-xl focus-visible:outline-3 focus-visible:outline-signal"
        >
          {map}
        </button>
        <MiniLegend />
        {extra.length > 0 && <p className="mt-2 text-[13px] font-semibold">+{extra.length} more in the yard: {extra.map((e) => e.trailerNumber).join(', ')}</p>}
        <p className="mt-2 text-[12px] text-muted">Tap the map to enlarge it. Updated {clockTime(clock)}.</p>
      </div>
    )
  }

  return (
    <div className="mt-3.5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <div className="overflow-x-auto rounded-xl">{map}</div>
        {extra.length > 0 && (
          <p className="mt-2 text-sm font-semibold">
            +{extra.length} more in the yard:{' '}
            {extra.map((e, i) => (
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
        <div className="mt-4 min-h-[92px] rounded-xl border border-hair bg-signal-tint p-3.5">
          <Detail
            e={selected?.e}
            place={selected?.place}
            at={at}
            clock={clock}
            live={live}
            onEdit={onEdit}
            onCheckOut={onCheckOut}
            onInspect={onInspect && focus && selected && focus(selected.e) ? onInspect : undefined}
          />
        </div>
        <p className="mt-2 text-[12px] text-muted">
          {live ? `Updated ${clockTime(clock)}.` : `Yard as it was at ${clockTime(clock)}.`} Trucks waiting for a dock, then dropped trailers, line up in the yard lane in arrival order.
        </p>
      </aside>
    </div>
  )
}
