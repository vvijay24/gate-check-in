import { useId, useState } from 'react'
import { clockTime, dayKey } from '../../time'
import { DETENTION_FREE_MIN } from '../../yard'
import { YARD_STATES } from '../../ops'
import { LIVE, TableView, dur, niceStep, tooltipCls, weekdayDate } from './charts'

// Control-tower charts for the Overview: a sparkline, the yard's load through a day, each dock's
// schedule, distributions and stage spreads, and what's on site now. Same rules as charts.jsx:
// hover and keyboard details, a table view, and nothing told by color alone.

const HOUR = 3600000
const FREE_MS = DETENTION_FREE_MIN * 60000

// Fill for each yard state: the stage ramp, light (early in the stay) to dark (on the way out).
export const STATE_FILL = {
  waiting: 'var(--color-stage-1)',
  atDock: 'var(--color-stage-2)',
  awaitingRelease: 'var(--color-stage-3)',
  released: 'var(--color-stage-4)',
}
const STATE_LABEL = { ...Object.fromEntries(YARD_STATES.map((s) => [s.key, s.label])), drop: 'Dropped trailer' }
// Past free time: hatched red, so it reads without color too.
export const OVERRUN =
  'repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-danger) 85%, transparent) 0 3px, transparent 3px 7px)'

// ---------- Sparkline ----------

// A small trend line with a soft fill and the latest value dotted. Gaps (null) are skipped.
export function Spark({ values, className = 'h-8', color = LIVE, label }) {
  const id = 'sp' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && Number.isFinite(v))
  if (pts.length < 2) return null
  const n = Math.max(1, values.length - 1)
  const vs = pts.map((p) => p[1])
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const X = (i) => (i / n) * 100
  const Y = (v) => (hi === lo ? 50 : 90 - ((v - lo) / (hi - lo)) * 80)
  const line = pts.map(([i, v]) => `${X(i)},${Y(v)}`).join(' ')
  const [li, lv] = pts[pts.length - 1]
  return (
    <div className={'relative ' + className} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M${X(pts[0][0])},100 L${line.replaceAll(' ', ' L')} L${X(li)},100 Z`} fill={`url(#${id})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <i className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel" style={{ left: `${X(li)}%`, top: `${Y(lv)}%`, background: color }} />
    </div>
  )
}

// ---------- Day picker ----------

export function DayPicker({ dates, value, onChange }) {
  const i = dates.indexOf(value)
  const today = dayKey(new Date())
  const name = (d) => (d === today ? `Today · ${weekdayDate(d)}` : weekdayDate(d))
  const btn = 'grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-md border-2 border-line bg-panel font-bold disabled:cursor-default disabled:opacity-40'
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} disabled={i <= 0} onClick={() => onChange(dates[i - 1])} aria-label="Previous day">
        ‹
      </button>
      <select value={value} onChange={(ev) => onChange(ev.target.value)} aria-label="Day" className="min-h-11 rounded-md border-2 border-line bg-panel px-2 font-semibold text-ink">
        {[...dates].reverse().map((d) => (
          <option key={d} value={d}>
            {name(d)}
          </option>
        ))}
      </select>
      <button type="button" className={btn} disabled={i >= dates.length - 1} onClick={() => onChange(dates[i + 1])} aria-label="Next day">
        ›
      </button>
    </div>
  )
}

// ---------- Shared time axis for the day view ----------

// Label column · plot · right column; the yard load and dock schedule share it so their hours line up.
export const DAY_GRID = { gridTemplateColumns: '84px minmax(0,1fr) 64px' }
const hourText = (t) => {
  const h = new Date(t).getHours()
  return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`
}
const hoursIn = (win) => {
  const list = []
  for (let t = win.from; t <= win.to; t += HOUR) list.push(t)
  return list
}

function HourAxis({ win, now }) {
  const span = win.to - win.from
  const every = span > 14 * HOUR ? 3 : 2
  const X = (t) => ((t - win.from) / span) * 100
  return (
    <div className="relative h-5 text-[12px] text-muted tabular-nums">
      {hoursIn(win).map((t, i) =>
        i % every === 0 ? (
          <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${X(t)}%` }}>
            {hourText(t)}
          </span>
        ) : null,
      )}
      {now > win.from && now < win.to && (
        <span className="absolute -translate-x-1/2 rounded bg-signal px-1 font-bold text-signal-ink" style={{ left: `${X(now)}%` }}>
          Now
        </span>
      )}
    </div>
  )
}

const HourLines = ({ win }) => {
  const span = win.to - win.from
  return hoursIn(win).map((t) => <i key={t} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${((t - win.from) / span) * 100}%` }} />)
}
const NowLine = ({ win, now }) =>
  now > win.from && now < win.to ? (
    <i className="pointer-events-none absolute inset-y-0 z-[2] w-0.5 -translate-x-1/2 bg-signal-line" style={{ left: `${((now - win.from) / (win.to - win.from)) * 100}%` }} />
  ) : null

// ---------- Yard load through the day ----------

// Dropped trailers: a pale magenta band with a solid top edge, on top of the live trucks.
const DROP_FILL = 'color-mix(in oklab, var(--color-chart-drop) 38%, var(--color-panel))'
const LAYERS = [...YARD_STATES.map((s) => ({ ...s, fill: STATE_FILL[s.key] })), { key: 'drops', label: 'Dropped trailers', fill: 'drop' }]

export function YardLoadLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
      {LAYERS.map((l) => (
        <li key={l.key} className="flex items-center gap-1.5">
          <i
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{
              background: l.fill === 'drop' ? DROP_FILL : l.fill,
              boxShadow: l.fill === 'drop' ? 'inset 0 2px 0 var(--color-chart-drop)' : undefined,
            }}
          />
          {l.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <i className="inline-block w-4 border-t-2 border-dashed border-danger" />
        <span>⚠ Past free time</span>
      </li>
    </ul>
  )
}

export function YardLoad({ timeline, win, now }) {
  const [hover, setHover] = useState(null)
  const slots = timeline.slots.filter((s) => s.t >= win.from && s.t <= win.to)
  if (!slots.length) return <p className="py-6 text-muted">Nothing on site in these hours.</p>
  const span = win.to - win.from
  const X = (t) => ((t - win.from) / span) * 100
  const max = Math.max(1, ...slots.map((s) => s.total))
  const step = Math.max(1, Math.ceil(niceStep(max)))
  const top = step * Math.max(2, Math.ceil((max * 1.18) / step))
  const Y = (v) => 100 - (v / top) * 100
  const keys = LAYERS.map((l) => l.key)
  const cum = slots.map((s) => {
    let acc = 0
    return keys.map((k) => (acc += s[k]))
  })
  const areas = keys.map((k, li) => {
    const upper = slots.map((s, i) => `${X(s.t)},${Y(cum[i][li])}`)
    const lower = slots.map((s, i) => `${X(s.t)},${Y(li ? cum[i][li - 1] : 0)}`).reverse()
    return { k, d: `M${upper.join(' L')} L${lower.join(' L')} Z`, edge: upper.join(' ') }
  })
  const over = slots.map((s) => `${X(s.t)},${Y(s.overFree)}`).join(' ')
  const ticks = Array.from({ length: top / step }, (_, i) => (i + 1) * step)
  const h = hover == null ? null : slots[hover]

  const pick = (clientX, rect) => {
    const t = win.from + ((clientX - rect.left) / rect.width) * span
    const i = Math.round((t - slots[0].t) / (slots[1] ? slots[1].t - slots[0].t : 1))
    setHover(Math.max(0, Math.min(slots.length - 1, i)))
  }
  const onKey = (ev) => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault()
      const d = ev.key === 'ArrowRight' ? 1 : -1
      setHover((i) => Math.max(0, Math.min(slots.length - 1, (i ?? slots.length - 1) + d)))
    }
  }

  return (
    <div>
      <div className="grid" style={DAY_GRID}>
        <div className="relative pr-2">
          {ticks.map((v) => (
            <span key={v} className="absolute right-2 -translate-y-1/2 text-[12px] text-muted tabular-nums" style={{ top: `${Y(v)}%` }}>
              {v}
            </span>
          ))}
          <span className="absolute bottom-0 right-2 translate-y-1/2 text-[12px] text-muted">0</span>
        </div>
        <div
          tabIndex={0}
          role="img"
          aria-label={`Trucks on site through the day, peak ${timeline.peak?.total ?? 0}. Use the arrow keys for each 10 minutes.`}
          onMouseMove={(ev) => pick(ev.clientX, ev.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={onKey}
          className="relative h-[230px] border-b border-line"
        >
          {ticks.map((v) => (
            <i key={v} className="absolute inset-x-0 border-t border-line/70" style={{ top: `${Y(v)}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {areas.map((a) => (
              <path key={a.k} d={a.d} fill={a.k === 'drops' ? DROP_FILL : STATE_FILL[a.k]} />
            ))}
            {areas.map((a) => (
              <polyline
                key={a.k}
                points={a.edge}
                fill="none"
                stroke={a.k === 'drops' ? 'var(--color-chart-drop)' : 'var(--color-panel)'}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polyline points={over} fill="none" stroke="var(--color-danger)" strokeWidth="2.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            {h && <line x1={X(h.t)} x2={X(h.t)} y1="0" y2="100" stroke="var(--color-ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </svg>
          <NowLine win={win} now={now} />
          {timeline.peak?.total > 0 && !h && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded bg-panel/90 px-1 pb-1 text-[12px] font-bold whitespace-nowrap"
              style={{ left: `${Math.min(92, Math.max(8, X(timeline.peak.t)))}%`, top: `${Y(timeline.peak.total)}%` }}
            >
              Peak {timeline.peak.total} · {clockTime(timeline.peak.t)}
            </span>
          )}
          {h && (
            <div className={tooltipCls + ' top-1 -translate-x-1/2'} style={{ left: `${Math.min(84, Math.max(16, X(h.t)))}%` }}>
              <b>
                {clockTime(h.t)} · {h.total} on site
              </b>
              {[...LAYERS].reverse().map((l) => (
                <span key={l.key} className="block">
                  {l.label}: {h[l.key]}
                </span>
              ))}
              <span className="block font-semibold">⚠ Past free time: {h.overFree}</span>
            </div>
          )}
        </div>
        <div />
        <div />
        <HourAxis win={win} now={now} />
      </div>
      <TableView
        head={['Time', ...LAYERS.map((l) => l.label), 'Past free time']}
        rows={slots.filter((s) => new Date(s.t).getMinutes() === 0).map((s) => [clockTime(s.t), ...LAYERS.map((l) => s[l.key]), s.overFree])}
      />
    </div>
  )
}

// ---------- Dock schedule (Gantt) ----------

const DOCK_SEGS = [
  { key: 'atDock', label: 'At dock, not inspected' },
  { key: 'awaitingRelease', label: 'Inspected, awaiting release' },
  { key: 'released', label: 'Released, heading out' },
]

export function DockLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
      {DOCK_SEGS.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: STATE_FILL[s.key] }} />
          {s.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <i className="inline-block h-3 w-4 rounded-[3px] border border-danger" style={{ background: OVERRUN }} />⚠ Past free time
      </li>
      <li className="flex items-center gap-1.5">
        <i className="inline-block h-3 w-[3px] bg-signal" />
        Still at dock
      </li>
    </ul>
  )
}

const shortName = (e) => `${e.truckName || 'Unknown'} · ${e.trailerNumber || '—'}`

export function DockGantt({ schedule, win, now, use }) {
  const [hover, setHover] = useState(null)
  const span = win.to - win.from
  const X = (t) => ((Math.min(win.to, Math.max(win.from, t)) - win.from) / span) * 100
  const rows = []
  for (const row of schedule) for (const b of row.bars) rows.push([`Dock ${row.dock}`, shortName(b.e), clockTime(b.from), b.onSite ? 'Still on site' : clockTime(b.to), dur(b.to - b.from), b.freeEndsAt && b.to > b.freeEndsAt ? dur(b.to - b.freeEndsAt) : '—'])

  return (
    <div>
      <div className="grid gap-y-1.5" style={DAY_GRID}>
        <div />
        <HourAxis win={win} now={now} />
        <span className="text-right text-[12px] font-semibold text-muted">In use</span>
        {schedule.map((row, i) => (
          <DockRow key={row.dock} first={i === 0} row={row} win={win} now={now} X={X} use={use.byDock[row.dock]} hover={hover} setHover={setHover} />
        ))}
      </div>
      <TableView head={['Dock', 'Truck', 'Docked', 'Left', 'At dock', 'Past free time']} rows={rows} />
    </div>
  )
}

function DockRow({ row, first, win, now, X, use, hover, setHover }) {
  return (
    <>
      <div className="flex flex-col justify-center pr-2">
        <b className="text-[14px] leading-tight">Dock {row.dock}</b>
        <span className="text-[12px] text-muted">
          {row.bars.length} load{row.bars.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="relative h-11 rounded-md bg-field">
        <HourLines win={win} />
        <NowLine win={win} now={now} />
        {row.bars.map((b, i) => {
          const left = X(b.from)
          const width = Math.max(0.6, X(b.to) - left)
          const from = Math.max(b.from, win.from)
          const to = Math.min(b.to, win.to)
          if (to <= from) return null
          const over = b.freeEndsAt != null && b.to > b.freeEndsAt ? Math.max(0, (Math.max(b.freeEndsAt, from) - from) / (to - from)) : null
          const on = hover?.dock === row.dock && hover?.i === i
          const s = b.stages
          const label = `${shortName(b.e)}, ${clockTime(b.from)} to ${b.onSite ? 'now' : clockTime(b.to)}`
          return (
            <div
              key={b.e.id}
              tabIndex={0}
              aria-label={label}
              onMouseEnter={() => setHover({ dock: row.dock, i })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ dock: row.dock, i })}
              onBlur={() => setHover(null)}
              className={'absolute inset-y-1.5 z-[1] outline-offset-2' + (on ? ' z-[3]' : '')}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <div className={'relative flex h-full gap-[2px] overflow-hidden rounded-[4px] shadow-sm' + (on ? ' ring-2 ring-ink' : '')}>
                {b.segs.map((g) => {
                  const w = Math.min(g.to, win.to) - Math.max(g.from, win.from)
                  return w > 0 ? <i key={g.key} className="h-full" style={{ flexGrow: w, background: STATE_FILL[g.key] }} /> : null
                })}
                {over != null && over < 1 && <i className="absolute inset-y-0 right-0 border-b-[3px] border-danger" style={{ left: `${over * 100}%`, background: OVERRUN }} />}
                {b.onSite && <i className="absolute inset-y-0 right-0 w-[3px] bg-signal" />}
                {width > 5 && (
                  <span className="absolute top-1/2 left-1 max-w-[calc(100%-10px)] -translate-y-1/2 truncate rounded bg-panel/90 px-1 text-[11px] leading-4 font-semibold text-ink">
                    {b.e.truckName || 'Unknown'}
                  </span>
                )}
              </div>
              {on && (
                <div className={tooltipCls + (first ? ' top-full mt-1.5 ' : ' bottom-full mb-1.5 ') + (left > 60 ? 'right-0' : 'left-0')}>
                  <b>{shortName(b.e)}</b>
                  <span className="block">
                    Dock {row.dock} · {clockTime(b.from)} → {b.onSite ? 'still here' : clockTime(b.to)} ({dur(b.to - b.from)})
                  </span>
                  <span className="block">Waited for dock: {dur(s.waitDockMs)}</span>
                  <span className="block">Docked → inspected: {dur(s.toInspectMs)}</span>
                  <span className="block">Inspected → released: {dur(s.toReleaseMs)}</span>
                  {b.freeEndsAt != null && b.to > b.freeEndsAt && <span className="block font-semibold">⚠ {dur(b.to - b.freeEndsAt)} past free time</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-col items-end justify-center">
        <b className="text-[14px] tabular-nums">{use == null ? '—' : `${Math.round(use * 100)}%`}</b>
        <span className="mt-0.5 h-1.5 w-12 overflow-hidden rounded-full bg-track">
          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (use ?? 0) * 100)}%`, background: LIVE }} />
        </span>
      </div>
    </>
  )
}

// ---------- Histogram ----------

// `bins`: [{ from, to, count }] (from/to null = open-ended). `regions` shade a stretch ({ from, to,
// label, tone: 'danger' | 'ok' }); `markers` draw labeled lines ({ value, label, dashed, tone }).
// `edge(i)` labels the boundary before bin i (i = bins.length for the last edge), or null to skip.
export function Histogram({ bins, edge, binLabel, noun, regions = [], markers = [], height = 200 }) {
  const [hover, setHover] = useState(null)
  const n = bins.length
  const total = bins.reduce((s, b) => s + b.count, 0)
  const max = Math.max(1, ...bins.map((b) => b.count))
  const step = Math.max(1, Math.ceil(niceStep(max)))
  const top = step * Math.max(2, Math.ceil(max / step))
  const ticks = Array.from({ length: top / step }, (_, i) => (i + 1) * step)
  // Position of a value along the bins (they're equal width; open ends count as one bin).
  const pos = (v) => {
    const i = bins.findIndex((b) => (b.from == null || v >= b.from) && (b.to == null || v < b.to))
    if (i < 0) return v < (bins[0].to ?? 0) ? 0 : 100
    const b = bins[i]
    const f = b.from != null && b.to != null ? (v - b.from) / (b.to - b.from) : 0.5
    return ((i + f) / n) * 100
  }
  const tone = { danger: ['var(--color-danger-soft)', 'text-danger'], ok: ['var(--color-ok-soft)', 'text-ok'] }

  return (
    <div className="px-5 pb-5">
      <div className="relative pl-9" style={{ marginTop: 14 + (markers.length + regions.length) * 20 }}>
        <div className="relative border-b border-line" style={{ height }}>
          {regions.map((r) => {
            const l = r.from == null ? 0 : pos(r.from)
            const w = (r.to == null ? 100 : pos(r.to)) - l
            return (
              <div key={r.label} className="absolute inset-y-0" style={{ left: `${l}%`, width: `${w}%`, background: tone[r.tone][0] }}>
                <span
                  className={'absolute left-1 border-l-2 pl-1 text-[12px] font-bold whitespace-nowrap ' + tone[r.tone][1]}
                  style={{ top: -(markers.length + 1) * 20, borderColor: 'currentColor' }}
                >
                  {r.label}
                </span>
              </div>
            )
          })}
          {ticks.map((v) => (
            <div key={v} className="absolute inset-x-0 border-t border-line/70" style={{ bottom: `${(v / top) * 100}%` }}>
              <span className="absolute -left-1.5 -translate-x-full -translate-y-1/2 text-[12px] text-muted tabular-nums">{v}</span>
            </div>
          ))}
          <div className="absolute inset-0 grid items-end gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {bins.map((b, i) => (
              <div
                key={i}
                tabIndex={0}
                aria-label={`${binLabel(b)}: ${b.count} ${noun}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex h-full items-end justify-center"
              >
                <div className={'w-full max-w-[44px] rounded-t-[4px]' + (hover === i ? ' opacity-75' : '')} style={{ height: `${(b.count / top) * 100}%`, background: LIVE }} />
                {hover === i && (
                  <span className={tooltipCls + ' -translate-y-1.5'} style={{ bottom: `${(b.count / top) * 100}%` }}>
                    <b>{binLabel(b)}</b>
                    <span className="block">
                      {b.count} {noun} · {total ? Math.round((b.count / total) * 100) : 0}%
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
          {markers.map((m, i) => (
            <div
              key={m.label}
              className={'pointer-events-none absolute bottom-0 z-[2] border-l-2 ' + (m.dashed ? 'border-dashed ' : '') + (m.tone === 'danger' ? 'border-danger' : 'border-ink')}
              style={{ left: `${pos(m.value)}%`, top: -(markers.length - i) * 20 }}
            >
              <span className={'absolute -top-0.5 text-[12px] font-bold whitespace-nowrap ' + (pos(m.value) > 60 ? 'right-1 ' : 'left-1 ') + (m.tone === 'danger' ? 'text-danger' : '')}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
        <div className="relative h-5 text-[12px] text-muted tabular-nums">
          {Array.from({ length: n + 1 }, (_, i) => {
            const t = edge(i)
            return t == null ? null : (
              <span key={i} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${(i / n) * 100}%` }}>
                {t}
              </span>
            )
          })}
        </div>
      </div>
      <TableView head={['Range', noun[0].toUpperCase() + noun.slice(1), 'Share']} rows={bins.map((b) => [binLabel(b), b.count, total ? `${Math.round((b.count / total) * 100)}%` : '—'])} />
    </div>
  )
}

// ---------- Stage spread vs target ----------

// One row per handoff: the typical time (p50, filled dot) to the slow end (p90, open dot), the target
// as a dashed line, and the part of the spread past target in red.
export function StageSpread({ stages }) {
  const [hover, setHover] = useState(null)
  const maxMin = Math.max(1, ...stages.flatMap((s) => [(s.p90 ?? 0) / 60000, s.target / 60000])) * 1.08
  // Steps a dispatcher counts in: 5, 10, 15, 30 min, 1 h, 2 h.
  const step = [5, 10, 15, 30, 60, 120, 240].find((m) => maxMin / m <= 5) ?? 240
  const top = step * Math.ceil(maxMin / step)
  const X = (ms) => Math.min(100, (ms / 60000 / top) * 100)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const grid = { gridTemplateColumns: 'minmax(120px, 190px) minmax(0, 1fr) 112px' }

  return (
    <div className="px-5 pb-5">
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
        <li className="flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-full" style={{ background: LIVE }} />
          Typical (p50)
        </li>
        <li className="flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-full border-2 bg-panel" style={{ borderColor: LIVE }} />
          Slow end (p90)
        </li>
        <li className="flex items-center gap-1.5">
          <i className="inline-block h-3.5 border-l-2 border-dashed border-ink" />
          Target
        </li>
        <li className="flex items-center gap-1.5">
          <i className="inline-block h-1.5 w-4 rounded-full bg-danger" />⚠ Over target
        </li>
      </ul>
      <div className="mt-3 grid items-center gap-x-3" style={grid}>
        {stages.map((s, i) => {
          const ok = s.onTargetPct == null ? null : s.onTargetPct >= 0.8
          const p50 = s.p50 ?? 0
          const p90 = s.p90 ?? 0
          const overFrom = Math.max(p50, s.target)
          return (
            <div key={s.key} className="contents" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className="py-2.5">
                <b className="block text-[14px] leading-tight">{s.label}</b>
                <span className="text-[12px] text-muted">
                  {s.owner} · {s.n} trucks
                </span>
              </div>
              <div
                tabIndex={0}
                aria-label={`${s.label}: typical ${dur(s.p50)}, slow end ${dur(s.p90)}, target ${dur(s.target)}`}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative h-10"
              >
                {ticks.map((t) => (
                  <i key={t} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${(t / top) * 100}%` }} />
                ))}
                <i className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded bg-track" />
                {s.p50 != null && (
                  <>
                    <i className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: `${X(p50)}%`, width: `${Math.max(0, X(Math.min(p90, s.target)) - X(p50))}%`, background: LIVE, opacity: 0.5 }} />
                    {p90 > s.target && <i className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-danger" style={{ left: `${X(overFrom)}%`, width: `${X(p90) - X(overFrom)}%` }} />}
                    <i className="absolute top-1/2 z-[1] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel" style={{ left: `${X(p50)}%`, background: LIVE }} />
                    <i
                      className="absolute top-1/2 z-[1] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-panel"
                      style={{ left: `${X(p90)}%`, borderColor: p90 > s.target ? 'var(--color-danger)' : LIVE }}
                    />
                  </>
                )}
                <i className="absolute inset-y-0.5 z-[2] border-l-2 border-dashed border-ink" style={{ left: `${X(s.target)}%` }} />
                {hover === i && (
                  <span className={tooltipCls + ' bottom-full mb-1 -translate-x-1/2'} style={{ left: `${Math.min(80, Math.max(20, X(p90)))}%` }}>
                    <b>{s.label}</b>
                    <span className="block">
                      Typical {dur(s.p50)} · slow end {dur(s.p90)} · longest {dur(s.max)}
                    </span>
                    <span className="block">
                      Target {dur(s.target)} · {s.onTargetPct == null ? '—' : `${Math.round(s.onTargetPct * 100)}%`} on target
                    </span>
                  </span>
                )}
              </div>
              <div className="text-right">
                <b className="block text-[14px] tabular-nums">
                  {dur(s.p50)} <span className="font-normal text-muted">/</span> {dur(s.p90)}
                </b>
                <span className={'text-[12px] font-semibold ' + (ok == null ? 'text-muted' : ok ? 'text-ok' : 'text-danger')}>
                  {ok == null ? 'No data' : `${ok ? '✓' : '⚠'} ${Math.round(s.onTargetPct * 100)}% on target`}
                </span>
              </div>
            </div>
          )
        })}
        <div />
        <div className="relative h-5 text-[12px] text-muted tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${(t / top) * 100}%` }}>
              {t >= 60 && t % 60 === 0 ? `${t / 60}h` : dur(t * 60000)}
            </span>
          ))}
        </div>
        <div className="pt-1 text-right text-[12px] text-muted">p50 / p90</div>
      </div>
      <TableView
        head={['Handoff', 'Typical (p50)', 'Slow end (p90)', 'Target', 'On target']}
        rows={stages.map((s) => [s.label, dur(s.p50), dur(s.p90), dur(s.target), s.onTargetPct == null ? '—' : `${Math.round(s.onTargetPct * 100)}%`])}
      />
    </div>
  )
}

// ---------- On site now ----------

// Oldest first, each with how long it's been here against free time.
export function OnSiteQueue({ items, limit = 8 }) {
  if (!items.length) return <p className="px-5 pt-3 pb-5 text-muted">The yard is clear: nothing on site right now.</p>
  const shown = items.slice(0, limit)
  // Dropped trailers can sit for days; they don't set the scale (their bar just fills).
  const scale = Math.max(FREE_MS * 1.3, ...shown.filter((x) => !x.drop).map((x) => x.ageMs)) * 1.02
  const W = (ms) => `${Math.min(100, (ms / scale) * 100)}%`
  return (
    <div className="px-5 pt-2 pb-5">
      <ul className="divide-y divide-line">
        {shown.map((x) => (
          <li key={x.e.id} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,1.3fr)_auto] items-center gap-3 py-2.5">
            <span className="min-w-0">
              <b className="block truncate text-[14px]">{shortName(x.e)}</b>
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                <i
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: x.drop ? 'var(--color-chart-drop)' : STATE_FILL[x.state] }}
                />
                <span className="truncate">
                  {STATE_LABEL[x.state]}
                  {x.e.dockDoor ? ` · Dock ${x.e.dockDoor}` : ''}
                </span>
              </span>
            </span>
            <span className="relative h-2.5 rounded-full bg-track" role="img" aria-label={`On site ${dur(x.ageMs)}`}>
              {x.drop ? (
                <span className="absolute inset-y-0 left-0 rounded-full bg-muted/50" style={{ width: W(x.ageMs) }} />
              ) : (
                <>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: W(Math.min(x.ageMs, FREE_MS)), background: LIVE }} />
                  {x.overMs > 0 && <span className="absolute inset-y-0 rounded-r-full bg-danger" style={{ left: W(FREE_MS), width: `calc(${W(x.ageMs)} - ${W(FREE_MS)})` }} />}
                  <i className="absolute -inset-y-1 w-0.5 bg-ink/60" style={{ left: W(FREE_MS) }} title="Free time ends" />
                </>
              )}
            </span>
            <span className="text-right text-[14px] tabular-nums">
              <b>{dur(x.ageMs)}</b>
              {x.overMs > 0 && <span className="block text-[12px] font-semibold text-danger">⚠ +{dur(x.overMs)}</span>}
              {x.drop && <span className="block text-[12px] text-muted">no driver</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted">
        The tick on each bar is the end of the {DETENTION_FREE_MIN / 60} h free time.{items.length > limit ? ` ${items.length - limit} more on site.` : ''}
      </p>
    </div>
  )
}
