import { useState } from 'react'
import { duration } from '../../time'
import { DETENTION_FREE_MIN } from '../../yard'

// Charts, tables and small pieces shared by the Analytics sections. Every chart has hover details
// and a "Show as table" view, so nothing depends on color alone.

export const LIVE = 'var(--color-chart-live)'
export const DROP = 'var(--color-chart-drop)'
export const THIRD = 'var(--color-chart-3)'
export const FOURTH = 'var(--color-chart-4)'

export const shortDate = (key) => new Date(`${key}T00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })
export const weekdayDate = (key) => new Date(`${key}T00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
export const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
export const ptsDiff = (v) => `${Math.round(v * 100)} pts`
export const money = (v) => `$${Math.round(v ?? 0).toLocaleString()}`
export const dur = (ms) => (ms == null ? '—' : duration(ms))
export const count = (v) => String(Math.round(v))
export const minutesToDur = (m) => duration(m * 60000)
export const th = 'px-3 py-2.5 whitespace-nowrap'
export const td = 'px-3 py-2.5'

const tooltipCls = 'pointer-events-none absolute z-10 rounded-md bg-chrome px-2.5 py-1.5 text-[13px] whitespace-nowrap text-white'

// A round step (1, 2, 5 × 10ⁿ) so `ticks` steps cover `max`.
function niceStep(max, ticks = 4) {
  const raw = Math.max(max, 1) / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)
}

// Labels every few days so a 30-day axis doesn't crowd.
const labelEvery = (n) => Math.max(1, Math.ceil(n / 10))

// Change against the previous period: green when it's an improvement, red when not.
export function Trend({ value, base, lowerIsBetter, format, days }) {
  const cls = 'mt-1 text-[12px] '
  const label = `prev ${days} days`
  if (value == null || base == null) return <div className={cls + 'text-muted'}>No data for {label}</div>
  const diff = value - base
  if (format(Math.abs(diff)) === format(0)) return <div className={cls + 'text-muted'}>Same as {label}</div>
  const good = lowerIsBetter ? diff < 0 : diff > 0
  return (
    <div className={cls + 'font-semibold ' + (good ? 'text-ok' : 'text-danger')}>
      {diff > 0 ? '▲' : '▼'} {format(Math.abs(diff))} vs {label}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
      {items.map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: color }} />
          {label}
        </li>
      ))}
    </ul>
  )
}

export function TableView({ head, rows }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold">Show as table</summary>
      <table className="mt-2 w-full max-w-md text-sm">
        <thead className="text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={'py-1 font-semibold ' + (i ? 'text-right' : 'text-left')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={'py-1 ' + (j ? 'text-right tabular-nums' : '')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function YTicks({ step }) {
  return [1, 2, 3, 4].map((t) => (
    <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / 4) * 100}%` }}>
      <span className="absolute -top-2.5 -left-1 -translate-x-full text-[12px] whitespace-nowrap text-muted tabular-nums">{step(t)}</span>
    </div>
  ))
}

function DateAxis({ days }) {
  const every = labelEvery(days.length)
  return (
    <div className="mt-1 grid gap-1 text-center text-[12px] text-muted" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d, i) => (
        <span key={d.date} className="whitespace-nowrap">
          {i % every === 0 ? shortDate(d.date) : ''}
        </span>
      ))}
    </div>
  )
}

// One bar per day; with several `series` ({ key, label, color }) the bars stack, first at the bottom.
export function DayBars({ days, series, format = count, scale = (v) => v }) {
  const [hover, setHover] = useState(null)
  const totalOf = (d) => series.reduce((s, x) => s + (d[x.key] ?? 0), 0)
  const step = niceStep(scale(Math.max(0, ...days.map(totalOf))))
  const top = step * 4
  const h = (v) => `${(scale(v) / top) * 100}%`

  return (
    <div className="px-5 pb-5">
      <div className="relative mt-4 pl-12">
        <div className="relative grid h-[220px] items-end gap-1 border-b border-line" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          <YTicks step={(t) => format(step * t, true)} />
          {days.map((d, i) => {
            const total = totalOf(d)
            const parts = series.filter((x) => d[x.key] > 0)
            return (
              <div
                key={d.date}
                tabIndex={0}
                aria-label={`${weekdayDate(d.date)}: ${series.map((x) => `${x.label} ${format(d[x.key] ?? 0)}`).join(', ')}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex h-full flex-col items-center justify-end"
              >
                {/* Stacked top-down, 2px apart; only the top segment is rounded. */}
                <div className={'flex w-[min(28px,85%)] flex-col-reverse gap-0.5' + (hover === i ? ' opacity-75' : '')} style={{ height: h(total) }}>
                  {parts.map((x, j) => (
                    <div key={x.key} className={j === parts.length - 1 ? 'rounded-t' : ''} style={{ flexGrow: d[x.key], background: x.color }} />
                  ))}
                </div>
                {hover === i && (
                  <span className={tooltipCls + ' -translate-y-1.5'} style={{ bottom: h(total) }}>
                    <b>{weekdayDate(d.date)}</b>
                    {series.map((x) => (
                      <span key={x.key} className="block">
                        {x.label}: {format(d[x.key] ?? 0)}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <DateAxis days={days} />
      </div>
      <TableView head={['Date', ...series.map((x) => x.label)]} rows={days.map((d) => [weekdayDate(d.date), ...series.map((x) => format(d[x.key] ?? 0))])} />
    </div>
  )
}

// One value per day as a line; days where `value` is null leave a gap. `max` fixes the top (1 for %).
export function DayLine({ days, value, format, max, tip, refLine }) {
  const [hover, setHover] = useState(null)
  const values = days.map(value)
  const step = max ? max / 4 : niceStep(Math.max(0, ...values.filter((v) => v != null), refLine?.value ?? 0))
  const top = step * 4
  const n = days.length
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100)
  const y = (v) => 100 - (v / top) * 100
  const segments = []
  let run = []
  values.forEach((v, i) => {
    if (v == null) {
      if (run.length) segments.push(run)
      run = []
    } else run.push(`${x(i)},${y(v)}`)
  })
  if (run.length) segments.push(run)

  return (
    <div className="px-5 pb-5">
      <div className="relative mt-4 pr-2 pl-12">
        <div className="relative h-[180px] border-b border-line">
          <YTicks step={(t) => format(step * t)} />
          {refLine && (
            <div className="absolute inset-x-0 border-t-2 border-dashed border-danger" style={{ bottom: `${(refLine.value / top) * 100}%` }}>
              <span className="absolute right-0 -top-5 text-[12px] font-semibold text-danger">{refLine.label}</span>
            </div>
          )}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {segments.map((s, i) => (
              <polyline key={i} points={s.join(' ')} fill="none" stroke="var(--color-ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="var(--color-muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </svg>
          {values.map((v, i) =>
            v == null ? null : (
              <i
                key={days[i].date}
                className={'absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-ink ring-2 ring-panel' + (hover === i ? ' scale-125' : '')}
                style={{ left: `${x(i)}%`, bottom: `${(v / top) * 100}%` }}
              />
            ),
          )}
          {/* Hover strips, one per day, wider than the dots. */}
          <div className="absolute inset-0 flex">
            {days.map((d, i) => (
              <div
                key={d.date}
                tabIndex={0}
                aria-label={`${weekdayDate(d.date)}: ${tip(d)}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="h-full flex-1"
              />
            ))}
          </div>
          {hover !== null && (
            <span className={tooltipCls + ' top-0 -translate-x-1/2 -translate-y-full'} style={{ left: `${Math.min(85, Math.max(15, x(hover)))}%` }}>
              <b>{weekdayDate(days[hover].date)}</b>
              <br />
              {tip(days[hover])}
            </span>
          )}
        </div>
        <div className="relative mt-1 h-4 text-[12px] text-muted">
          {days.map((d, i) =>
            i % labelEvery(n) === 0 ? (
              <span key={d.date} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(i)}%` }}>
                {shortDate(d.date)}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <TableView head={['Date', 'Value']} rows={days.map((d, i) => [weekdayDate(d.date), values[i] == null ? '—' : format(values[i])])} />
    </div>
  )
}

// Counts by day and hour (`field` holds 24 numbers per day), shaded light (few) to dark (many) in one hue.
const shade = (n, max) => (n ? `color-mix(in oklab, var(--color-chart-live) ${Math.round(15 + 85 * (n / max))}%, var(--color-panel))` : 'var(--color-field)')

export function HourGrid({ days, field, noun }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...days.flatMap((d) => d[field]))
  const byHour = Array.from({ length: 24 }, (_, h) => days.reduce((s, d) => s + d[field][h], 0))
  const peak = byHour.indexOf(Math.max(...byHour))
  const grid = { gridTemplateColumns: '64px repeat(24, minmax(0, 1fr))' }

  return (
    <div className="px-5 pb-5">
      <p className="text-sm text-muted">
        {byHour[peak] ? `Busiest hour overall: ${hourLabel(peak)}–${hourLabel((peak + 1) % 24)} (${byHour[peak]} ${noun})` : `No ${noun} in this range`}
      </p>
      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[560px]">
          {days.map((d) => (
            <div key={d.date} className="grid gap-0.5 pb-0.5" style={grid}>
              <span className="pr-2 text-right text-[12px] leading-[18px] whitespace-nowrap text-muted">{shortDate(d.date)}</span>
              {d[field].map((n, h) => (
                <div
                  key={h}
                  tabIndex={0}
                  aria-label={`${weekdayDate(d.date)}, ${hourLabel(h)}: ${n} ${noun}`}
                  onMouseEnter={() => setHover({ d, h, n })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ d, h, n })}
                  onBlur={() => setHover(null)}
                  className={'h-[18px] rounded-[3px]' + (hover?.d === d && hover?.h === h ? ' ring-2 ring-ink' : '')}
                  style={{ background: shade(n, max) }}
                />
              ))}
            </div>
          ))}
          <div className="grid gap-0.5 pt-1 text-center text-[12px] text-muted" style={grid}>
            <span />
            {byHour.map((_, h) => (
              <span key={h}>{h % 3 === 0 ? `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` : ''}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <span className="flex items-center gap-1.5 text-muted">
          Fewer
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <i key={f} className="inline-block h-3 w-5 rounded-[3px]" style={{ background: shade(f * max, max) }} />
          ))}
          More (max {max} in an hour)
        </span>
        <span className="font-semibold" aria-live="polite">
          {hover ? `${weekdayDate(hover.d.date)}, ${hourLabel(hover.h)}: ${hover.n} ${noun}` : ' '}
        </span>
      </div>
      <TableView head={['Hour', `${noun} (all days)`]} rows={byHour.map((n, h) => (n ? [hourLabel(h), n] : null)).filter(Boolean)} />
    </div>
  )
}

// Labeled rows with a bar each, e.g. arrivals by timing or failure reasons.
export function BarList({ rows, color = 'var(--color-ink)', empty }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="px-5 pb-5 text-muted">{empty}</p>
  return (
    <ul className="space-y-2.5 px-5 pt-3 pb-5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] items-center gap-3 text-[14px]">
          <span className="truncate font-semibold">{r.label}</span>
          <span className="h-3 overflow-hidden rounded bg-track">
            <span className="block h-full rounded-r" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} />
          </span>
          <span className="text-right whitespace-nowrap tabular-nums">
            {r.value}
            {r.note && <span className="text-muted"> · {r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export const STAGES = [
  { key: 'waitDockMs', label: 'Waiting for a dock', color: LIVE },
  { key: 'toInspectMs', label: 'At dock until inspected', color: DROP },
  { key: 'toReleaseMs', label: 'Waiting for Shipping release', color: THIRD },
  { key: 'releaseToOutMs', label: 'Released until check-out', color: FOURTH },
]

// The average stay split into its four stages, with the free-time line marked.
export function StageBar({ stages }) {
  const [hover, setHover] = useState(null)
  const freeMs = DETENTION_FREE_MIN * 60000
  const total = STAGES.reduce((s, x) => s + (stages[x.key] ?? 0), 0)
  if (!stages.count || !total) {
    return (
      <p className="px-5 pb-5 text-muted">
        No departed visits went through every stage (dock, inspection and Shipping release) in this range. Visits from before the
        release step was added aren't counted.
      </p>
    )
  }
  const scale = Math.max(total, freeMs) * 1.08
  const w = (ms) => `${(ms / scale) * 100}%`

  return (
    <div className="px-5 pb-5">
      <p className="text-sm text-muted">
        Average of {stages.count} departed visits · total {dur(total)} ·{' '}
        {total > freeMs ? <b className="text-danger">{dur(total - freeMs)} over free time</b> : `${dur(freeMs - total)} under free time`}
      </p>
      <div className="relative mt-8">
        <div className="flex h-11 gap-0.5" role="img" aria-label={STAGES.map((x) => `${x.label} ${dur(stages[x.key])}`).join(', ')}>
          {STAGES.map((x, i) => (
            <div
              key={x.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={'relative first:rounded-l last:rounded-r' + (hover === i ? ' opacity-80' : '')}
              style={{ width: w(stages[x.key] ?? 0), background: x.color }}
            >
              {hover === i && (
                <span className={tooltipCls + ' bottom-full left-1/2 mb-1.5 -translate-x-1/2'}>
                  {x.label}: {dur(stages[x.key])}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* Free-time marker */}
        <div className="absolute -top-6 bottom-0 border-l-2 border-dashed border-danger" style={{ left: w(freeMs) }}>
          <span className="absolute -top-0.5 left-1.5 text-[12px] font-semibold whitespace-nowrap text-danger">Free time {DETENTION_FREE_MIN / 60} h</span>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        {STAGES.map((x) => (
          <li key={x.key} className="flex items-start gap-2 text-[14px]">
            <i className="mt-1 inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: x.color }} />
            <span>
              <b>{x.label}</b>
              <span className="block text-muted">
                {dur(stages[x.key])} · {Math.round(((stages[x.key] ?? 0) / total) * 100)}% of the stay
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// A table whose headers sort it; `columns` give each column's value (for sorting) and how it shows.
export function SortTable({ columns, rows, initial, empty, rowKey = (r) => r.name, minWidth = 640 }) {
  const [sort, setSort] = useState(initial)
  const col = columns.find((c) => c.id === sort.id)
  const sorted = [...rows].sort((a, b) => {
    const va = col.value(a)
    const vb = col.value(b)
    // Blank values always go last.
    if (va == null) return vb == null ? 0 : 1
    if (vb == null) return -1
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb
    return sort.dir === 'asc' ? cmp : -cmp
  })
  const toggle = (c) => setSort((s) => (s.id === c.id ? { id: c.id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id: c.id, dir: c.numeric ? 'desc' : 'asc' }))

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px]" style={{ minWidth }}>
        <thead className="text-[13px] font-semibold text-muted">
          <tr className="border-y border-line">
            {columns.map((c) => (
              <th key={c.id} className={th + (c.numeric ? ' text-right' : '')} aria-sort={sort.id === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => toggle(c)} className="cursor-pointer font-semibold hover:text-ink">
                  {c.label}
                  <span aria-hidden="true" className="ml-1">
                    {sort.id === c.id ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.id} className={td + (c.numeric ? ' text-right tabular-nums' : '')}>
                    {c.render ? c.render(r) : c.value(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
