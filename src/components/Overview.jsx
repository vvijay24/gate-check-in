import { useEffect, useMemo, useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, clockTime, dayKey, duration } from '../time'
import { dayBaseline, dayMetrics, gateLog, visitsByDate, yardMetrics, yardStatus } from '../metrics'
import {
  DETENTION_FREE_MIN,
  DETENTION_RATE_PER_HOUR,
  DETENTION_WARN_MIN,
  STAGING_BAYS,
  STALE_HIGH_H,
  STALE_WARN_H,
  YARD_ALERT_PCT,
} from '../yard'
import YardMap, { STATUS } from './YardMap'

// Overview tab: a date bar, headline numbers, the yard map and gate log, then gate, yard, dock and
// carrier metrics. Day totals follow the chosen date; the yard sections show one moment of it
// (live for today, or a replayed time on the map's time bar).
const GATE_LOG_ROWS = 15
// Headline figures are compared with the average of this many earlier days.
const TREND_DAYS = 7
// Day buttons shown in the date bar.
const DATE_CHIPS = 7
// Play day: starts at 5 AM and moves PLAY_STEP_MIN of yard time every PLAY_TICK_MS.
const PLAY_FROM_MIN = 5 * 60
const PLAY_STEP_MIN = 10
const PLAY_TICK_MS = 250

const shiftDate = (key, days) => {
  const d = new Date(`${key}T00:00`)
  d.setDate(d.getDate() + days)
  return dayKey(d)
}
const minuteOfDay = (ms) => {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}
const atMinute = (key, minute) => new Date(`${key}T00:00`).getTime() + minute * 60000
const shortDate = (key) => new Date(`${key}T00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })
const longDate = (key) => new Date(`${key}T00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })

const pct = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`)
const Dash = () => <span className="text-muted">—</span>
const Sub = ({ children }) => <span className="block text-[13px] text-muted">{children}</span>
const th = 'px-3 py-2.5 whitespace-nowrap'
const td = 'px-3 py-2.5'

const badgeCls = 'ml-2 inline-block rounded-full px-2 py-0.5 align-middle font-body text-[13px] font-semibold whitespace-nowrap '

// Marks the yard sections: "● Live", or the replayed moment, e.g. "◷ At 2:40 PM, Oct 21".
function MomentBadge({ moment, date, today }) {
  if (moment === null) return <span className={badgeCls + 'bg-ok-soft text-ok'}>● Live</span>
  return (
    <span className={badgeCls + 'bg-signal text-signal-ink'}>
      ◷ At {clockTime(moment)}
      {date !== today && `, ${shortDate(date)}`}
    </span>
  )
}

function SectionTitle({ children, badge }) {
  return (
    <h2 className="pt-1.5 font-display text-[28px] leading-tight font-bold">
      {children}
      {badge}
    </h2>
  )
}

function Card({ title, sub, badge, children, className = '' }) {
  return (
    <section className={'min-w-0 rounded-[10px] border border-line bg-panel ' + className}>
      <div className="px-5 pt-5">
        <h3 className="font-display text-[21px] leading-tight font-bold">
          {title}
          {badge}
        </h3>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

// A colored square beside the status words; the words carry the meaning.
function StatusDot({ status, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap">
      <i className={'inline-block h-2.5 w-2.5 shrink-0 rounded-[3px] ' + STATUS[status].dot} />
      {children ?? STATUS[status].label}
    </span>
  )
}

// Status words with the truck's door or bay at moment `at`, e.g. "Waiting for door · Bay 2".
function placeStatus(e, yard, at) {
  const status = yardStatus(e, at)
  const bay = yard.bayOf.get(e.id)
  const where = bay ? `Bay ${bay}` : 'no bay free'
  const text = {
    waiting: `Waiting for door · ${where}`,
    drop: `Dropped · ${where}`,
    dock: `At dock ${e.dockDoor}`,
    ready: `Ready to leave · Dock ${e.dockDoor}`,
    departed: 'Departed',
  }[status]
  return <StatusDot status={status}>{text}</StatusDot>
}

function Tile({ label, value, note, tone, trend }) {
  const border = { alert: 'border-t-danger', warn: 'border-t-signal', good: 'border-t-ok' }[tone] ?? 'border-t-line'
  return (
    <div className={'rounded-[10px] border border-t-[6px] border-line bg-panel px-4 py-3.5 ' + border}>
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div className="mt-1 mb-0.5 text-[30px] leading-tight font-bold sm:text-[34px]">{value}</div>
      <div className={'text-[13px] ' + (tone === 'alert' ? 'font-bold text-danger' : 'text-muted')}>{note}</div>
      {trend}
    </div>
  )
}

const ptsDiff = (v) => `${Math.round(v * 100)} pts`

// Change against the earlier-days average, green when it's an improvement and red when not.
function Trend({ value, base, days, lowerIsBetter, format }) {
  const cls = 'mt-1 text-[12px] '
  if (value === null || base === null) return <div className={cls + 'text-muted'}>No earlier days to compare</div>
  // Fewer than TREND_DAYS when the log doesn't go back that far.
  const avgLabel = `${days}-day avg`
  const diff = value - base
  if (format(Math.abs(diff)) === format(0)) return <div className={cls + 'text-muted'}>Same as {avgLabel}</div>
  const good = lowerIsBetter ? diff < 0 : diff > 0
  return (
    <div className={cls + 'font-semibold ' + (good ? 'text-ok' : 'text-danger')}>
      {diff > 0 ? '▲' : '▼'} {format(Math.abs(diff))} vs {avgLabel}
    </div>
  )
}

function Meter({ value, max = 1, className = 'bg-ink' }) {
  const w = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded bg-track">
      <div className={'h-full rounded-r ' + className} style={{ width: `${w}%` }} />
    </div>
  )
}

function HourlyChart({ hourly }) {
  const [hover, setHover] = useState(null)
  const step = Math.max(1, Math.ceil(Math.max(...hourly) / 4))
  const top = step * 4
  const peak = hourly.indexOf(Math.max(...hourly))
  const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
  const total = hourly.reduce((a, b) => a + b, 0)

  return (
    <div className="px-5 pb-5">
      <p className="text-sm text-muted">
        Check-ins per hour · {total} total{total > 0 && ` · peak ${hourLabel(peak)} (${hourly[peak]})`}
      </p>
      <div className="relative mt-4 pl-6">
        <div className="relative grid h-[200px] grid-cols-24 items-end gap-0.5 border-b border-line">
          {[1, 2, 3, 4].map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / 4) * 100}%` }}>
              <span className="absolute -top-2.5 -left-1 -translate-x-full text-[12px] text-muted tabular-nums">{step * t}</span>
            </div>
          ))}
          {hourly.map((n, h) => (
            <div
              key={h}
              tabIndex={0}
              aria-label={`${hourLabel(h)}: ${n} check-ins`}
              onMouseEnter={() => setHover(h)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(h)}
              onBlur={() => setHover(null)}
              className="relative flex h-full items-end justify-center"
            >
              {n > 0 && (
                <div
                  className={'w-[min(24px,80%)] rounded-t ' + (h === peak ? 'bg-delivery' : 'bg-ink') + (hover === h ? ' opacity-75' : '')}
                  style={{ height: `${(n / top) * 100}%` }}
                />
              )}
              {h === peak && n > 0 && (
                <span className="absolute pb-0.5 text-[13px] font-bold" style={{ bottom: `${(n / top) * 100}%` }}>
                  {n}
                </span>
              )}
              {hover === h && (
                <span
                  className="pointer-events-none absolute z-10 -translate-y-1.5 rounded-md bg-chrome px-2.5 py-1.5 text-[13px] whitespace-nowrap text-white"
                  style={{ bottom: `${(n / top) * 100}%` }}
                >
                  {hourLabel(h)}: {n} check-in{n === 1 ? '' : 's'}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-24 gap-0.5 text-center text-[12px] text-muted tabular-nums">
          {hourly.map((_, h) => (
            <span key={h} className={h % 6 === 3 ? 'max-sm:invisible' : ''}>
              {h % 3 === 0 ? `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` : ''}
            </span>
          ))}
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold">Show as table</summary>
        <table className="mt-2 w-full max-w-xs text-sm">
          <tbody className="divide-y divide-line">
            {hourly.map((n, h) =>
              n ? (
                <tr key={h}>
                  <td className="py-1">{hourLabel(h)}</td>
                  <td className="py-1 text-right tabular-nums">{n}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function ArrivalBreakdown({ day }) {
  const rows = [
    ['Early', day.arrivals.early],
    ['On time', day.arrivals.onTime],
    ['Late', day.arrivals.late],
    ['Unscheduled', day.arrivals.unscheduled, 'work-ins'],
  ]
  const max = Math.max(1, ...rows.map((r) => r[1]))
  return (
    <div className="px-5 pb-5">
      <div className="mt-3.5 grid gap-2.5">
        {rows.map(([name, n, note]) => (
          <div key={name} className="grid grid-cols-[110px_1fr] items-center gap-2.5">
            <div className="font-semibold">
              {name}
              {note && <span className="block text-[12px] font-normal text-muted">{note}</span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 min-w-1 rounded-r bg-ink" style={{ width: `calc((100% - 32px) * ${n / max})` }} />
              <span className="font-bold tabular-nums">{n}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3.5 text-sm text-muted">
        On-time rate = (early + on time) ÷ scheduled{day.scheduled ? ` = ${day.arrivals.early + day.arrivals.onTime} ÷ ${day.scheduled}` : ''}. Only
        Pickup visits have an appointment time, so deliveries and drops count as unscheduled.
      </p>
    </div>
  )
}

function YardCapacity({ yard }) {
  const over = yard.capacityPct > YARD_ALERT_PCT
  const open = STAGING_BAYS - yard.bayCount
  const inv = [
    ['Inbound loaded', yard.inventory.inbound, 'border-l-delivery'],
    ['Outbound empty', yard.inventory.outboundEmpty, 'border-l-pickup'],
    ['Outbound loaded', yard.inventory.outboundLoaded, 'border-l-pickup'],
    ['Dropped', yard.inventory.dropped, 'border-l-drop'],
  ]
  return (
    <div className="px-5 pb-5">
      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-5xl leading-none font-bold">{yard.capacityPct}%</span>
        <span className="text-base text-muted">
          {yard.bayCount} of {STAGING_BAYS} bays
        </span>
      </div>
      <div className="relative mt-3">
        <div className="h-[22px] overflow-hidden rounded-md bg-track">
          <div className={'h-full rounded-l-md ' + (over ? 'bg-danger' : 'bg-ink')} style={{ width: `${Math.min(100, yard.capacityPct)}%` }} />
        </div>
        <div className="absolute -top-1 -bottom-1 border-l-2 border-ink" style={{ left: `${YARD_ALERT_PCT}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-muted">
        <span>0</span>
        <span className="mr-[12%] ml-auto">{YARD_ALERT_PCT}% alert</span>
        <span>{STAGING_BAYS} bays</span>
      </div>
      <p className={'mt-2.5 rounded-md px-3 py-2 text-sm font-semibold ' + (over ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok')}>
        {over
          ? `⚠ Yard is over ${YARD_ALERT_PCT}% full. ${open > 0 ? `${open} bay${open === 1 ? '' : 's'} open.` : `${-open} without a bay.`}`
          : `✓ ${open} bay${open === 1 ? '' : 's'} open.`}
      </p>

      <h3 className="mt-5 font-display text-[21px] leading-tight font-bold">Trailer Inventory</h3>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {inv.map(([label, n, border]) => (
          <div key={label} className={'rounded-lg border-l-8 bg-page px-3 py-2.5 ' + border}>
            <b className="block text-[28px] leading-tight">{n}</b>
            <span className="text-[13px] font-semibold text-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StaleTag({ ms }) {
  if (ms > STALE_HIGH_H * 3600000) return <span className={ui.tag + ' bg-danger-soft text-danger'}>⚠ Over {STALE_HIGH_H}h</span>
  if (ms > STALE_WARN_H * 3600000) return <span className={ui.tag + ' bg-signal text-signal-ink'}>Over {STALE_WARN_H}h</span>
  return <span className={ui.tag + ' bg-ok-soft text-ok'}>OK</span>
}

function RiskTag({ ms }) {
  if (ms > DETENTION_FREE_MIN * 60000) return <span className={ui.tag + ' bg-danger-soft text-danger'}>⚠ High</span>
  if (ms > DETENTION_WARN_MIN * 60000) return <span className={ui.tag + ' bg-signal text-signal-ink'}>Warning</span>
  return <span className={ui.tag + ' bg-ok-soft text-ok'}>Low</span>
}

function EmptyRow({ cols, children }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-muted">
        {children}
      </td>
    </tr>
  )
}

function DropVsLive({ day }) {
  const visits = day.liveCount + day.dropCount
  return (
    <Card title="Drop vs. Live" sub="Visits checked in on this date">
      <div className="px-5 pb-5">
        {visits === 0 ? (
          <p className="py-3 text-muted">No visits on this date.</p>
        ) : (
          <>
            <div role="img" aria-label={`Live ${day.liveCount} visits, Drop ${day.dropCount} visits`} className="mt-3.5 flex h-7 gap-0.5">
              {day.liveCount > 0 && <div className="h-full rounded-l bg-ink last:rounded-r" style={{ width: `${(day.liveCount / visits) * 100}%` }} />}
              {day.dropCount > 0 && <div className="h-full rounded-r bg-drop first:rounded-l" style={{ width: `${(day.dropCount / visits) * 100}%` }} />}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-5">
              {[
                ['Live', day.liveCount, 'bg-ink'],
                ['Drop', day.dropCount, 'bg-drop'],
              ].map(([label, n, bg]) => (
                <div key={label} className="flex items-center gap-2">
                  <i className={'inline-block h-3 w-3 rounded-[3px] ' + bg} />
                  <span>
                    <b className="text-[22px]">{n}</b> {label} · {Math.round((n / visits) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="mt-3.5 text-sm text-muted">Live = Delivery or Pickup with the driver waiting. Drop = any visit with Drop Trailer ticked.</p>
      </div>
    </Card>
  )
}

const arrowCls =
  'w-11 shrink-0 cursor-pointer rounded-[10px] border-2 border-line bg-field text-[26px] font-bold disabled:cursor-not-allowed disabled:opacity-35 max-sm:h-11'

// Day buttons with each day's visit count, ‹ › to step a day, and a picker for older dates.
function DateBar({ date, today, counts, onSelect }) {
  // The last seven days, or a week around an older chosen date.
  const daysBack = Math.round((new Date(`${today}T00:00`) - new Date(`${date}T00:00`)) / 86400000)
  const lastOffset = Math.max(0, daysBack - 3)
  const days = Array.from({ length: DATE_CHIPS }, (_, i) => shiftDate(today, -(lastOffset + DATE_CHIPS - 1 - i)))

  return (
    <div
      role="group"
      aria-label="Choose a day"
      className="no-print sticky top-[120px] z-[5] flex flex-wrap items-stretch gap-2 rounded-[10px] border border-line bg-panel p-2.5 shadow-sm sm:flex-nowrap"
    >
      <button type="button" aria-label="Previous day" onClick={() => onSelect(shiftDate(date, -1))} className={arrowCls}>
        ‹
      </button>
      <div
        role="tablist"
        aria-label="Days"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          onSelect(shiftDate(date, e.key === 'ArrowRight' ? 1 : -1))
        }}
        className="order-3 grid min-w-0 basis-full grid-flow-col auto-cols-[minmax(84px,1fr)] gap-1.5 overflow-x-auto sm:order-none sm:flex-1 sm:basis-auto"
      >
        {days.map((d) => {
          const on = d === date
          const day = new Date(`${d}T00:00`)
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(d)}
              className={
                'min-h-16 cursor-pointer rounded-[10px] border-2 px-2 py-1.5 text-left ' +
                (on ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-field hover:border-ink')
              }
            >
              <span className={'block text-[13px] font-semibold ' + (on ? '' : 'text-muted')}>
                {d === today ? 'Today' : day.toLocaleDateString([], { weekday: 'short' })}
              </span>
              <span className="block font-display text-[21px] leading-tight font-bold">{shortDate(d)}</span>
              <span className={'block text-[12px] ' + (on ? '' : 'text-muted')}>{counts.get(d) ?? 0} visits</span>
            </button>
          )
        })}
      </div>
      <button type="button" aria-label="Next day" disabled={date >= today} onClick={() => onSelect(shiftDate(date, 1))} className={arrowCls}>
        ›
      </button>
      <label className="flex flex-col justify-center gap-0.5 text-[13px] font-semibold text-muted max-sm:flex-1">
        Pick a date
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          className="min-h-10 rounded-lg border-2 border-line bg-field px-2 text-ink"
        />
      </label>
    </div>
  )
}

// Play / pause and a slider to move the yard sections through the chosen day.
function TimeBar({ date, minute, maxMinute, live, playing, onPlay, onMinute, onLive }) {
  return (
    <div className="no-print mt-3 flex flex-wrap items-center gap-2.5 rounded-lg bg-page px-3 py-2.5">
      <button type="button" onClick={onPlay} className={ui.btnSmallPrimary}>
        {playing ? '❚❚ Pause' : '▶ Play day'}
      </button>
      <label htmlFor="overview-time" className="text-sm font-semibold text-muted">
        Yard at
      </label>
      <input
        id="overview-time"
        type="range"
        min={0}
        max={maxMinute}
        step={5}
        value={minute}
        onChange={(e) => onMinute(+e.target.value)}
        className="min-w-40 flex-1 accent-ink"
      />
      <output htmlFor="overview-time" className="min-w-[86px] font-display text-[22px] font-bold">
        {clockTime(atMinute(date, minute))}
      </output>
      {!live && (
        <button type="button" onClick={onLive} className={ui.btnSmall}>
          Back to live
        </button>
      )}
    </div>
  )
}

export default function Overview({ entries, onEdit, onCheckOut, sampleCount, onLoadSample, onRemoveSample }) {
  const [now, setNow] = useState(Date.now)
  const [date, setDate] = useState(() => dayKey(new Date()))
  // The moment the yard sections show: null = live, otherwise a time (ms) on the chosen date.
  const [moment, setMoment] = useState(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const today = dayKey(new Date(now))
  const live = moment === null
  const maxMinute = date === today ? minuteOfDay(now) : 24 * 60 - 1
  const minute = live ? maxMinute : minuteOfDay(moment)
  // Moving to the end of today means live again.
  const toMinute = (key, m) => (key === today && m >= maxMinute ? null : atMinute(key, Math.min(m, maxMinute)))

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setMoment((m) => toMinute(date, (m === null ? maxMinute : minuteOfDay(m)) + PLAY_STEP_MIN)), PLAY_TICK_MS)
    return () => clearInterval(t)
  }, [playing, date, today, maxMinute]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (playing && minute >= maxMinute) setPlaying(false)
  }, [playing, minute, maxMinute])

  const selectDate = (key) => {
    const d = key > today ? today : key
    setPlaying(false)
    setDate(d)
    // Today opens live; a past day opens at the current time of day, so days compare like for like.
    setMoment(d === today ? null : atMinute(d, minuteOfDay(now)))
  }
  const play = () => {
    if (playing) return setPlaying(false)
    if (minute >= maxMinute) setMoment(atMinute(date, PLAY_FROM_MIN))
    setPlaying(true)
  }

  const at = live ? Infinity : moment
  const clock = live ? now : moment
  const yard = useMemo(() => yardMetrics(entries, at, clock), [entries, at, clock])
  const day = useMemo(() => dayMetrics(entries, date, now), [entries, date, now])
  const log = useMemo(() => gateLog(entries, at).slice(0, GATE_LOG_ROWS), [entries, at])
  const counts = useMemo(() => visitsByDate(entries), [entries])
  const base = useMemo(() => dayBaseline(entries, date, now, today, TREND_DAYS), [entries, date, now, today])
  const badge = <MomentBadge moment={moment} date={date} today={today} />
  const atNote = live ? '' : ` at ${clockTime(clock)}`
  const trend = (value, baseValue, format, lowerIsBetter = false) => (
    <Trend value={value} base={baseValue} days={base.days} format={format} lowerIsBetter={lowerIsBetter} />
  )

  const high = yard.detention.filter((r) => r.ms > DETENTION_FREE_MIN * 60000).length
  const warn = yard.detention.filter((r) => r.ms > DETENTION_WARN_MIN * 60000).length - high
  const yardOver = yard.capacityPct > YARD_ALERT_PCT
  const maxTurn = Math.max(1, ...day.leaderboard.map((c) => c.avgTurnMs ?? 0))

  return (
    <div className="space-y-5">
      <DateBar date={date} today={today} counts={counts} onSelect={selectDate} />
      <div className="-mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <b className="font-display text-[22px]">{date === today ? 'Today' : longDate(date)}</b>
        {badge}
        <span className="text-sm text-muted">
          {live
            ? 'The map and yard sections update as trucks move.'
            : 'Day totals cover the whole day; the map and yard sections show the moment on the time bar.'}
        </span>
        {!live && (
          <button type="button" onClick={() => selectDate(today)} className="cursor-pointer text-sm font-semibold underline">
            Back to today, live
          </button>
        )}
        <span className="no-print ml-auto">
          {sampleCount > 0 ? (
            <button
              type="button"
              onClick={() => window.confirm(`Remove the ${sampleCount} sample visits? Your real entries are kept.`) && onRemoveSample()}
              className={ui.btnSmall}
            >
              Remove sample data ({sampleCount})
            </button>
          ) : (
            <button type="button" onClick={onLoadSample} className={ui.btnSmall}>
              Load sample data
            </button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Avg gate dwell"
          value={duration(day.avgGateDwellMs ?? NaN)}
          note={`${day.departedLiveCount} live visits checked out`}
          trend={trend(day.avgGateDwellMs, base.avgGateDwellMs, duration, true)}
        />
        <Tile
          label="On-time arrival"
          value={pct(day.otaPct)}
          note={day.scheduled ? `${day.arrivals.early + day.arrivals.onTime} of ${day.scheduled} appointments` : 'No appointments'}
          tone={day.otaPct === null ? undefined : day.otaPct >= 0.8 ? 'good' : 'warn'}
          trend={trend(day.otaPct, base.otaPct, ptsDiff)}
        />
        <Tile
          label="Yard capacity"
          value={`${yard.capacityPct}%`}
          note={`${yardOver ? `⚠ Over ${YARD_ALERT_PCT}% · ` : ''}${yard.bayCount} of ${STAGING_BAYS} bays${atNote}`}
          tone={yardOver ? 'alert' : undefined}
        />
        <Tile
          label="Dock door utilization"
          value={pct(day.dockUtilization)}
          note={date === today ? 'Since midnight' : 'Whole day'}
          trend={trend(day.dockUtilization, base.dockUtilization, ptsDiff)}
        />
        <Tile
          label="Dock queue"
          value={yard.waiting.length}
          note={(yard.waiting.length ? `Longest wait ${duration(yard.longestWaitMs)}` : 'No one waiting') + atNote}
          tone={yard.waiting.length > 2 ? 'warn' : undefined}
        />
        <Tile
          label="Detention: high risk"
          value={high}
          note={`${high ? `⚠ Over ${DETENTION_FREE_MIN} min · ` : ''}${warn} in warning${atNote}`}
          tone={high ? 'alert' : warn ? 'warn' : 'good'}
        />
      </div>

      <SectionTitle badge={badge}>Yard Map</SectionTitle>
      <Card title="Grounds Layout" sub="Dock doors, staging bays and gates. Tap a truck or trailer for details.">
        <div className="px-5 pb-5">
          <TimeBar
            date={date}
            minute={minute}
            maxMinute={maxMinute}
            live={live}
            playing={playing}
            onPlay={play}
            onMinute={(m) => {
              setPlaying(false)
              setMoment(toMinute(date, m))
            }}
            onLive={() => selectDate(today)}
          />
          <YardMap yard={yard} gateCounts={day.gateCounts} at={at} clock={clock} live={live} onEdit={onEdit} onCheckOut={onCheckOut} />
        </div>
      </Card>

      <Card
        title="Gate Activity Log"
        badge={badge}
        sub={`Most recent gate transactions first · status shows where each truck ${live ? 'is now' : 'was at that time'}`}
      >
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
            <thead className="text-[13px] font-semibold text-muted">
              <tr className="border-y border-line">
                <th className={th}>Time</th>
                <th className={th}>Type</th>
                <th className={th}>Gate</th>
                <th className={th}>Trailer ID</th>
                <th className={th}>Carrier</th>
                <th className={th}>Purpose</th>
                <th className={th}>{live ? 'Current status' : 'Status at that time'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {log.length === 0 ? (
                <EmptyRow cols={7}>No gate activity yet. Check-ins and check-outs on the Gate tab appear here.</EmptyRow>
              ) : (
                log.map((t) => (
                  <tr key={t.key}>
                    <td className={td + ' whitespace-nowrap tabular-nums'}>
                      {clockTime(t.at)}
                      {dayKey(new Date(t.at)) !== date && <Sub>{shortDate(dayKey(new Date(t.at)))}</Sub>}
                    </td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <span aria-hidden="true" className="grid h-[22px] w-[22px] place-items-center rounded-md bg-page text-[13px]">
                          {t.type === 'Entry' ? '↓' : '↑'}
                        </span>
                        {t.type}
                      </span>
                    </td>
                    <td className={td + ' whitespace-nowrap'}>{t.gate || <Dash />}</td>
                    <td className={td + ' font-semibold'}>{t.entry.trailerNumber || <Dash />}</td>
                    <td className={td}>{t.entry.truckName || <Dash />}</td>
                    <td className={td}>
                      <span className="flex flex-wrap gap-1">
                        {(t.entry.visitPurpose ?? []).map((p) => (
                          <span key={p} className={ui.tag + ' ' + (ui.PURPOSE_STYLES[p]?.tag ?? '')}>
                            {p}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className={td}>{placeStatus(t.entry, yard, at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle>Gate &amp; Throughput</SectionTitle>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Hourly Gate Traffic">
          <HourlyChart hourly={day.hourly} />
        </Card>
        <Card title="Arrival Breakdown" sub="Against the appointment time · early/late = more than 15 min off">
          <ArrivalBreakdown day={day} />
        </Card>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="Guard Activity" sub="Check-ins logged and check-outs made on this date, by guard">
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
              <thead className="text-[13px] font-semibold text-muted">
                <tr className="border-y border-line">
                  <th className={th}>Guard</th>
                  <th className={th + ' text-right'}>Check-ins</th>
                  <th className={th + ' text-right'}>Check-outs</th>
                  <th className={th + ' text-right'}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {day.guards.length === 0 ? (
                  <EmptyRow cols={4}>No gate activity on this date.</EmptyRow>
                ) : (
                  day.guards.map((g) => (
                    <tr key={g.name}>
                      <td className={td + ' font-semibold'}>{g.name}</td>
                      <td className={td + ' text-right tabular-nums'}>{g.checkIns}</td>
                      <td className={td + ' text-right tabular-nums'}>{g.checkOuts}</td>
                      <td className={td + ' text-right font-bold tabular-nums'}>{g.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <DropVsLive day={day} />
      </div>

      <SectionTitle badge={badge}>Yard Occupancy &amp; Trailers</SectionTitle>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="Yard Capacity" sub="Staging bays in use (trucks waiting for a door + dropped trailers)">
          <YardCapacity yard={yard} />
        </Card>
        <Card
          title="Dropped Trailers & Stale Alerts"
          sub={
            yard.drops.length
              ? `${yard.drops.length} on site · avg yard dwell ${duration(yard.drops.reduce((s, e) => s + (clock - arrivalMs(e)), 0) / yard.drops.length)} · flagged after ${STALE_WARN_H}h, high after ${STALE_HIGH_H}h`
              : `Flagged after ${STALE_WARN_H}h, high after ${STALE_HIGH_H}h`
          }
        >
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-[14px]">
              <thead className="text-[13px] font-semibold text-muted">
                <tr className="border-y border-line">
                  <th className={th}>Trailer / Carrier</th>
                  <th className={th}>Where</th>
                  <th className={th}>Dropped</th>
                  <th className={th + ' text-right'}>In yard</th>
                  <th className={th}>Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {yard.drops.length === 0 ? (
                  <EmptyRow cols={5}>No dropped trailers on site.</EmptyRow>
                ) : (
                  yard.drops.map((e) => {
                    const ms = clock - arrivalMs(e)
                    return (
                      <tr key={e.id}>
                        <td className={td}>
                          <b>{e.trailerNumber}</b>
                          <Sub>{e.truckName}</Sub>
                        </td>
                        <td className={td + ' whitespace-nowrap'}>
                          {e.dockDoor ? `Dock ${e.dockDoor}` : yard.bayOf.has(e.id) ? `Bay ${yard.bayOf.get(e.id)}` : 'No bay free'}
                        </td>
                        <td className={td + ' whitespace-nowrap'}>
                          {e.dateIn} {e.timeIn}
                        </td>
                        <td className={td + ' text-right whitespace-nowrap tabular-nums'}>{duration(ms)}</td>
                        <td className={td}>
                          <StaleTag ms={ms} />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <SectionTitle>Dock &amp; Loading</SectionTitle>
      <Card
        title="Dock Doors"
        sub="Utilization = docked hours ÷ available hours · dock wait = check-in to docked · dock dwell = docked to check-out"
      >
        <div className="mt-3.5 grid grid-cols-2 gap-3 px-5 lg:grid-cols-4">
          {[
            [pct(day.dockUtilization), 'Door utilization'],
            [duration(day.avgDockWaitMs ?? NaN), 'Avg dock wait'],
            [duration(day.avgDockDwellMs ?? NaN), 'Avg dock dwell'],
            [yard.waiting.length, live ? 'Waiting for a door (live)' : `Waiting for a door at ${clockTime(clock)}`],
          ].map(([v, label]) => (
            <div key={label} className="rounded-lg bg-page px-3 py-2.5">
              <b className="block text-[26px] leading-tight">{v}</b>
              <span className="text-[13px] font-semibold text-muted">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-[14px]">
            <thead className="text-[13px] font-semibold text-muted">
              <tr className="border-y border-line">
                <th className={th}>Door</th>
                <th className={th}>{live ? 'Now' : `At ${clockTime(clock)}`}</th>
                <th className={th}>Utilization</th>
                <th className={th + ' text-right'}>Loads</th>
                <th className={th + ' text-right'}>Avg wait</th>
                <th className={th + ' text-right'}>Avg dwell</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {day.doors.map((d) => {
                const e = yard.atDock.get(d.door)
                return (
                  <tr key={d.door}>
                    <td className={td + ' w-12 font-display text-[22px] font-bold'}>{d.door}</td>
                    <td className={td}>
                      {e ? (
                        <StatusDot status={yardStatus(e, at)}>
                          {yardStatus(e, at) === 'ready' ? 'Ready to leave' : 'In use'} · {e.trailerNumber}
                        </StatusDot>
                      ) : (
                        <span className="font-semibold text-ok">✓ Free</span>
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex min-w-36 items-center gap-2">
                        <Meter value={d.utilization ?? 0} />
                        <b className="w-11 text-right tabular-nums">{pct(d.utilization)}</b>
                      </div>
                    </td>
                    <td className={td + ' text-right tabular-nums'}>{d.loads}</td>
                    <td className={td + ' text-right whitespace-nowrap tabular-nums'}>{duration(d.avgWaitMs ?? NaN)}</td>
                    <td className={td + ' text-right whitespace-nowrap tabular-nums'}>{duration(d.avgDwellMs ?? NaN)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle>Carriers &amp; Detention</SectionTitle>
      <Card
        title="Detention Risk"
        badge={badge}
        sub={`Trucks on site with a driver (drops left out) · free time ${DETENTION_FREE_MIN} min from check-in · est. fee $${DETENTION_RATE_PER_HOUR}/hr after free time`}
      >
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
            <thead className="text-[13px] font-semibold text-muted">
              <tr className="border-y border-line">
                <th className={th}>Risk</th>
                <th className={th}>Trailer / Carrier</th>
                <th className={th}>Status</th>
                <th className={th}>Checked in</th>
                <th className={th + ' text-right'}>On site</th>
                <th className={th + ' text-right'}>Free time left</th>
                <th className={th + ' text-right'}>Est. fee</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {yard.detention.length === 0 ? (
                <EmptyRow cols={8}>No trucks waiting on site{atNote}.</EmptyRow>
              ) : (
                yard.detention.map(({ e, ms }) => {
                  const overMin = ms / 60000 - DETENTION_FREE_MIN
                  return (
                    <tr key={e.id}>
                      <td className={td}>
                        <RiskTag ms={ms} />
                      </td>
                      <td className={td}>
                        <b>{e.trailerNumber}</b>
                        <Sub>{e.truckName}</Sub>
                      </td>
                      <td className={td}>{placeStatus(e, yard, at)}</td>
                      <td className={td + ' whitespace-nowrap'}>
                        {e.timeIn}
                        {e.dateIn !== date && <Sub>{shortDate(e.dateIn)}</Sub>}
                      </td>
                      <td className={td + ' text-right whitespace-nowrap tabular-nums'}>{duration(ms)}</td>
                      <td className={td + ' text-right whitespace-nowrap tabular-nums'}>
                        {overMin > 0 ? <b>{duration(overMin * 60000)} over</b> : duration(-overMin * 60000)}
                      </td>
                      <td className={td + ' text-right tabular-nums'}>
                        {overMin > 0 ? `$${Math.round((overMin / 60) * DETENTION_RATE_PER_HOUR)}` : <Dash />}
                      </td>
                      <td className={td + ' whitespace-nowrap'}>
                        {live && (
                          <button onClick={() => onCheckOut(e)} className="cursor-pointer font-semibold underline">
                            Check out
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="Carrier Leaderboard" sub="Fastest average turnaround first · live visits checked in on this date">
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
              <thead className="text-[13px] font-semibold text-muted">
                <tr className="border-y border-line">
                  <th className={th}>#</th>
                  <th className={th}>Carrier</th>
                  <th className={th + ' text-right'}>Visits</th>
                  <th className={th}>Avg turnaround</th>
                  <th className={th + ' text-right'}>On-time</th>
                  <th className={th + ' text-right'}>Detention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {day.leaderboard.length === 0 ? (
                  <EmptyRow cols={6}>No live visits on this date.</EmptyRow>
                ) : (
                  day.leaderboard.map((c, i) => (
                    <tr key={c.name}>
                      <td className={td + ' w-10 font-display text-[22px] font-bold'}>{i + 1}</td>
                      <td className={td + ' font-semibold'}>{c.name}</td>
                      <td className={td + ' text-right tabular-nums'}>{c.visits}</td>
                      <td className={td}>
                        {c.avgTurnMs === null ? (
                          <span className="text-muted">Still on site</span>
                        ) : (
                          <div className="flex min-w-36 items-center gap-2">
                            <Meter value={c.avgTurnMs} max={maxTurn} />
                            <b className="whitespace-nowrap tabular-nums">{duration(c.avgTurnMs)}</b>
                          </div>
                        )}
                      </td>
                      <td className={td + ' text-right tabular-nums'}>{pct(c.onTimePct)}</td>
                      <td className={td + ' text-right tabular-nums'}>{c.detention}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-4 text-sm text-muted">On-time shows “—” when the carrier had no appointments.</p>
        </Card>

        <Card title="Customers" sub="Pickups checked in on this date, busiest customer first">
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead className="text-[13px] font-semibold text-muted">
                <tr className="border-y border-line">
                  <th className={th}>Customer</th>
                  <th className={th + ' text-right'}>Pickups</th>
                  <th className={th + ' text-right'}>Avg turnaround</th>
                  <th className={th + ' text-right'}>On-time</th>
                  <th className={th + ' text-right'}>On site</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {day.customers.length === 0 ? (
                  <EmptyRow cols={5}>No pickups with a customer on this date.</EmptyRow>
                ) : (
                  day.customers.map((c) => (
                    <tr key={c.name}>
                      <td className={td + ' font-semibold'}>{c.name}</td>
                      <td className={td + ' text-right tabular-nums'}>{c.pickups}</td>
                      <td className={td + ' text-right whitespace-nowrap tabular-nums'}>
                        {c.avgTurnMs === null ? <span className="text-muted">Still on site</span> : duration(c.avgTurnMs)}
                      </td>
                      <td className={td + ' text-right tabular-nums'}>{pct(c.onTimePct)}</td>
                      <td className={td + ' text-right tabular-nums'}>{c.onSite || <Dash />}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-4 text-sm text-muted">From the Customer field on the Check In form, which is filled in for pickups.</p>
        </Card>
      </div>
    </div>
  )
}
