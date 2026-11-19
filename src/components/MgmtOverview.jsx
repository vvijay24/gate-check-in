import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import * as ui from '../ui'
import { Icon } from '../icons'
import { TT } from '../turnaround/charts'
import { clock12, clockTime, dayKey, duration, shiftDate } from '../time'
import { ASSUME, truckRows } from '../turnaround/discovery'
import {
  COMPARE,
  DEFAULT_PRESET,
  LEAVE_TARGET,
  ON_TIME_TARGET,
  OUT_IN_2H_TARGET,
  PASS_TARGET,
  PRESETS,
  STAGED_TARGET,
  STEPS,
  TURN_TARGET,
  WAIT_TARGET,
  byName,
  chargeOf,
  compareRange,
  daysIn,
  filterRows,
  fmtRange,
  isCarrierSide,
  paperSummary,
  readyVsSlot,
  reasons,
  series,
  summarize,
  topIssues,
  worstStep,
} from '../turnaround/management'
import { reasonById } from '../delayReasons'
import { DETENTION } from '../turnaround/targets'
import { ShowTable } from './shipping/parts'

// The Overview tab, for plant managers, logistics and finance: a filter bar (dates, comparison, carrier,
// customer, fresh or frozen), a navy headline, nine cards against their targets, then day by day, one
// visit step by step, what to fix first, carriers and customers, the paper week against this period, and
// how every number is worked out. Each card opens a deep dive with the trucks behind it. Bars only.
// Every figure comes from turnaround/management.js over truckRows() (turnaround/discovery.js).

const MANUAL_KEY = 'manual-week'
const MIN = 60000
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayLabel = (key) => `${WEEKDAY[new Date(`${key}T00:00`).getDay()]} ${Number(key.slice(8))}`
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const usd = (v) => (v == null ? '—' : `$${Math.round(v).toLocaleString()}`)
const dur = (m) => (m == null ? '—' : duration(m * MIN))
const C = () => TT.C
const NAVY = 'var(--p-navy)'
// Over target: a lighter navy with diagonal navy stripes (the pattern is defined once on the page, in
// OverPattern). It reads 2.1:1 on white, so the stripes and the words in each note carry the meaning too.
const OVER = 'url(#mg-over)'
const OVER_CSS = 'repeating-linear-gradient(135deg, var(--color-signal-bright) 0 3px, var(--color-signal-soft) 3px 6px)'
// Red is kept for money and the top issue; anything else off target is amber.
const MONEY = ['charges', 'perTruck', 'dispute']
const PAPER = 'var(--dive-s1)'
const DIGITAL = 'var(--dive-teal)'

// ---------------------------------------------------------------- Small parts
// The striped fill for over-target bars, referenced by every chart on the page as url(#mg-over).
const OverPattern = () => (
  <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="mg-over" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--color-signal-soft)" />
        <rect width="2.5" height="6" fill="var(--color-signal-bright)" />
      </pattern>
    </defs>
  </svg>
)
// The kit draws target lines and their labels in red; here they are a dark dashed line.
const calm = (el) => {
  el.querySelectorAll('line[stroke-dasharray]').forEach((l) => (l.style.stroke = 'var(--color-ink)'))
  el.querySelectorAll('svg > text').forEach((t) => {
    if (t.style.fill) t.style.fill = 'var(--color-ink)'
  })
}

// Draws a kit chart into a div, again when its width or `deps` change.
function Chart({ draw, deps, label, height = 220 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let w = el.clientWidth
    draw(el)
    calm(el)
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth
        draw(el)
        calm(el)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return <div ref={ref} className="tt-chart relative" style={{ minHeight: height }} role="img" aria-label={label} />
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
      {items.map(([name, color]) => (
        <span key={name} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-[4px] border border-hair" style={{ background: color }} aria-hidden="true" />
          {name}
        </span>
      ))}
    </div>
  )
}

// A chart panel: title, note (what each bar is, what the colour means, what's at the top), the chart,
// a legend for two or more series, and a table copy.
// `over`: the legend words for the striped over-target bars, e.g. "Over 2 hours".
function Panel({ title, note, legend, over, table, wide, children }) {
  return (
    <section className={'grid min-w-0 content-start gap-3 rounded-2xl border border-hair bg-panel p-5 shadow-card ' + (wide ? 'lg:col-span-2' : '')}>
      <h3 className="font-body text-[16.5px] font-bold">{title}</h3>
      {note && <p className="-mt-2 text-[13.5px] text-muted">{note}</p>}
      {(legend || over) && <Legend items={[...(legend ?? []), ...(over ? [['On target', NAVY], [over, OVER_CSS]] : [])]} />}
      {children}
      {table && <ShowTable head={table.head} rows={table.rows} />}
    </section>
  )
}

const SectionTitle = ({ id, title, sub }) => (
  <div className="grid gap-0.5">
    <h2 id={id} className="font-display text-[20px] leading-tight font-bold">
      {title}
    </h2>
    {sub && <p className="text-[14px] text-muted">{sub}</p>}
  </div>
)

// The ⓘ button: a 28px ring inside a 44px tap area.
const InfoButton = ({ on, onClick, label }) => (
  <button type="button" aria-pressed={on} aria-label={label} onClick={onClick} className="-m-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full">
    <span className={'grid size-7 place-items-center rounded-full border-[1.5px] text-[13px] font-bold transition-colors duration-150 ' + (on ? 'border-signal bg-signal text-signal-ink' : 'border-line text-signal hover:border-signal')}>i</span>
  </button>
)

// ---------------------------------------------------------------- Cards
// Each card's icon sits on a soft square in its topic's colour (index.css .mg-*): time is blue, money gold,
// arrivals and orders teal, quality purple. Red, amber and green stay for on and off target.
// Each card: what it reads, its target (`low`: lower is better), and its deep dive.
const CARDS = [
  {
    id: 'over',
    row: 1,
    icon: 'hourglass',
    topic: 'time',
    label: 'Trucks over 2 hours',
    value: (s) => s.over2h,
    fmt: pct,
    unit: 'of trucks',
    sub: (s) => `${s.overCount ?? 0} of ${s.done ?? 0} pickups`,
    target: 1 - OUT_IN_2H_TARGET,
    low: true,
    max: () => 1,
    targetText: `At most ${pct(1 - OUT_IN_2H_TARGET)}`,
    dive: 'turn',
    desc: 'Pickups that stayed longer than their 2 free hours, from arriving at the gate to leaving.',
    how: 'Pickups that left in these dates with more than 120 minutes from arriving at the gate to leaving, divided by every pickup that left. Drop trailers are left out because no driver waits.',
  },
  {
    id: 'charges',
    row: 1,
    icon: 'receipt',
    topic: 'money',
    label: 'Waiting charges',
    value: (s) => s.charges,
    fmt: usd,
    unit: 'in these dates',
    sub: (s) => (s.perMonth != null ? `About ${usd(s.perMonth)} a month at this pace` : ''),
    target: 0,
    low: true,
    max: (s, c) => Math.max(1, s.charges ?? 0, c?.charges ?? 0) * 1.2,
    targetText: 'None',
    dive: 'charges',
    desc: 'What carriers can charge us for keeping their drivers waiting.',
    how: `$${DETENTION.ratePerHour} for every hour a pickup stayed past its 2 free hours. The clock starts at the later of the booked time and arriving. Trucks more than ${DETENTION.lateGraceMin} minutes late and drop trailers are not charged.`,
  },
  {
    id: 'turn',
    row: 1,
    icon: 'time',
    topic: 'time',
    label: 'Average time on site',
    value: (s) => s.avgTurn,
    fmt: dur,
    unit: 'per pickup',
    sub: (s) => `${s.done ?? 0} pickups that left`,
    target: TURN_TARGET,
    low: true,
    max: () => TURN_TARGET * 2,
    targetText: `${TURN_TARGET / 60} hours or less`,
    dive: 'turn',
    desc: 'How long a pickup spent here, from arriving at the gate to leaving.',
    how: 'The average of arriving at the gate to leaving, over pickups that left in these dates.',
  },
  {
    id: 'ontime',
    row: 1,
    icon: 'calendarCheck',
    topic: 'arrive',
    label: 'On-time arrivals',
    value: (s) => s.onTime,
    fmt: pct,
    unit: 'of booked trucks',
    sub: (s) => `${s.lateCount ?? 0} late of ${s.booked ?? 0} booked`,
    target: ON_TIME_TARGET,
    low: false,
    max: () => 1,
    targetText: `${pct(ON_TIME_TARGET)} or more`,
    dive: 'late',
    desc: 'Booked trucks that arrived within 15 minutes of their booked time.',
    how: 'Booked trucks that arrived no more than 15 minutes before or after the booked time, divided by every booked truck. Trucks without a booking are left out.',
  },
  {
    id: 'pass',
    row: 1,
    icon: 'inspected',
    topic: 'quality',
    label: 'Passed first time',
    value: (s) => s.firstPass,
    fmt: pct,
    unit: 'of loads',
    sub: (s) => `${s.rechecked ?? 0} re-checked of ${s.inspected ?? 0}`,
    target: PASS_TARGET,
    low: false,
    max: () => 1,
    targetText: `${pct(PASS_TARGET)} or more`,
    dive: 'recheck',
    desc: 'Loads that passed their load inspection without a re-check.',
    how: 'Loads that passed with nothing to fix, divided by every load inspected.',
  },
  {
    id: 'wait',
    row: 2,
    icon: 'dock',
    topic: 'time',
    label: 'Wait for a dock',
    value: (s) => s.waitDock,
    fmt: dur,
    unit: 'per pickup',
    sub: () => 'Arriving to a dock assigned',
    target: WAIT_TARGET,
    low: true,
    max: () => WAIT_TARGET * 3,
    targetText: `${WAIT_TARGET} min or less`,
    dive: 'wait',
    desc: 'How long a pickup waited before it got a dock: first for its order, then for a free dock.',
    how: `The average of arriving at the gate to a dock assigned, over pickups that got a dock. The target is ${WAIT_TARGET} minutes: 15 for the order and 15 for a dock.`,
  },
  {
    id: 'staged',
    row: 2,
    icon: 'packageCheck',
    topic: 'arrive',
    label: 'Orders staged before the slot',
    value: (s) => s.staged,
    fmt: pct,
    unit: 'of booked orders',
    sub: (s) => `${s.stagedOf ?? 0} booked orders`,
    target: STAGED_TARGET,
    low: false,
    max: () => 1,
    targetText: `${pct(STAGED_TARGET)} or more`,
    dive: 'staged',
    desc: "Orders that were ready at the dock before the truck's booked time.",
    how: "Booked trucks whose order was marked ready at or before the booked time, divided by booked trucks whose order was marked ready. The target is an assumption to confirm.",
  },
  {
    id: 'perTruck',
    row: 2,
    icon: 'coins',
    topic: 'money',
    label: 'Waiting charges per truck',
    value: (s) => s.chargePerTruck,
    fmt: usd,
    unit: 'per pickup',
    sub: (s) => `${s.chargedCount ?? 0} trucks charged`,
    target: 0,
    low: true,
    max: (s, c) => Math.max(1, s.chargePerTruck ?? 0, c?.chargePerTruck ?? 0) * 1.2,
    targetText: 'None',
    dive: 'perTruck',
    desc: 'Waiting charges spread over every pickup that left, so busy and quiet periods compare fairly.',
    how: 'All waiting charges in these dates divided by the pickups that left.',
  },
  {
    id: 'dispute',
    row: 2,
    icon: 'scale',
    topic: 'money',
    label: 'Charges we can dispute',
    value: (s) => s.disputable,
    fmt: usd,
    unit: "on the carrier's side",
    sub: (s) => `${s.disputeCount ?? 0} trucks`,
    target: null,
    low: true,
    max: (s) => Math.max(1, s.charges ?? 0),
    targetText: 'Share of all charges',
    dive: 'dispute',
    desc: "Waiting charges where the delay was the carrier's: trailer not pre-cooled, trailer failed its check, or a driver or carrier issue.",
    how: "Charges above $0 on trucks whose delay reason is on the carrier's side. Reasons are picked by Shipping on the Now page.",
  },
]

// Percentages are judged as shown (rounded), so "95%" never sits beside "Off target".
const onTarget = (c, v) => {
  if (c.target == null || v == null) return null
  const x = c.fmt === pct ? Math.round(v * 100) / 100 : v
  return c.low ? x <= c.target : x >= c.target
}

// "▲ 5 points against Nov 5 - Nov 11": green when better, red when worse, plain when equal.
function Change({ c, v, cv, against, hot }) {
  if (v == null || cv == null) return <span className="text-[13px] text-muted">No figure to compare with</span>
  const diff = v - cv
  const points = Math.abs(Math.round(diff * 100))
  const unitDiff = c.fmt === pct ? `${points} point${points === 1 ? '' : 's'}` : c.fmt === usd ? usd(Math.abs(diff)) : dur(Math.abs(diff))
  const same = c.fmt === pct ? Math.round(diff * 100) === 0 : Math.round(diff) === 0
  if (same) return <span className="text-[13px] text-muted">Same as {against}</span>
  const better = c.low ? diff < 0 : diff > 0
  return (
    <span className="text-[13px] text-ink">
      {diff > 0 ? '▲' : '▼'} {unitDiff} against {against},{' '}
      <b className={better ? 'text-ok' : hot ? 'text-danger' : 'text-warn-ink'}>{better ? 'better' : 'worse'}</b>
    </span>
  )
}

// `top`: this card's deep dive is the top issue. Red is used only on money cards and the top issue.
function Card({ c, s, cmp, against, days, top, onOpen }) {
  const hot = MONEY.includes(c.id) || top
  const [how, setHow] = useState(false)
  const v = c.value(s)
  const ok = onTarget(c, v)
  const max = c.max(s, cmp)
  const fill = v == null ? 0 : Math.min(1, v / max)
  const tick = c.target != null ? Math.min(1, c.target / max) : null
  return (
    <article className="grid min-w-0 content-start gap-2.5 rounded-2xl border border-hair bg-panel p-4 shadow-card">
      <div className="flex items-start gap-2.5">
        <span className={'mg-chip grid size-10 shrink-0 place-items-center rounded-xl mg-' + c.topic}>
          <Icon name={c.icon} size={20} />
        </span>
        <h3 className="min-w-0 flex-1 pt-1.5 font-body text-[15px] leading-snug font-semibold">{c.label}</h3>
        <InfoButton on={how} onClick={() => setHow((x) => !x)} label={`How ${c.label.toLowerCase()} is worked out`} />
      </div>
      <p className="min-h-[3.6em] text-[13px] text-muted">{how ? <><b className="text-ink">How it's worked out: </b>{c.how}</> : c.desc}</p>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <b className="font-body text-[30px] leading-none tabular-nums">{c.fmt(v)}</b>
        <span className="text-[13px] text-muted">{c.unit}</span>
      </p>
      <p className="-mt-1 min-h-[1.4em] text-[13px] text-muted">{c.sub(s)}</p>
      <div className="grid gap-1.5">
        <span className="relative h-2 rounded-full bg-field" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill * 100}%`, background: NAVY }} />
          {tick != null && <span className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `calc(${tick * 100}% - 1px)` }} />}
        </span>
        <span className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          <span className="text-muted">Target: {c.targetText}</span>
          {ok != null && (
            <span className={ui.tag + ' ' + (ok ? 'bg-ok-soft text-ok' : hot ? 'bg-danger-soft text-danger' : 'bg-warn text-warn-ink')}>
              <Icon name={ok ? 'done' : 'warning'} size={14} />
              {ok ? 'On target' : top ? 'Off target, top issue' : 'Off target'}
            </span>
          )}
          {ok == null && c.id === 'dispute' && <span className={ui.tag + ' bg-signal-tint text-signal'}>{pct(s.charges ? (s.disputable ?? 0) / s.charges : null)} of charges</span>}
        </span>
      </div>
      <Change c={c} v={v} cv={cmp ? c.value(cmp) : null} against={against} hot={hot} />
      <MiniBars c={c} days={days} />
      <button type="button" onClick={onOpen} className={ui.btnGhost + ' -ml-3 w-fit'}>
        See why →
      </button>
    </article>
  )
}

// 14 days of the card's measure as small bars; days off target in red.
function MiniBars({ c, days }) {
  const vals = days.map((d) => c.value(d))
  const top = Math.max(...vals.filter((v) => v != null), c.target ?? 0, 0.0001)
  const bad = days.filter((d, i) => onTarget(c, vals[i]) === false).length
  return (
    <div>
      <div className="flex h-9 items-end gap-[3px]" aria-hidden="true">
        {days.map((d, i) => (
          <span
            key={d.day}
            title={`${dayLabel(d.day)}: ${c.fmt(vals[i])}`}
            className="min-w-0 flex-1 rounded-t-[3px]"
            style={{ height: vals[i] == null ? 2 : `${Math.max(6, (vals[i] / top) * 100)}%`, background: vals[i] == null ? 'var(--color-field)' : onTarget(c, vals[i]) === false ? OVER_CSS : NAVY }}
          />
        ))}
      </div>
      <span className="text-[12px] text-muted">
        Last 14 days{c.target != null ? `, ${bad} off target (striped)` : ''}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- Step by step
function StepBars({ rows }) {
  const top = Math.max(...rows.map((r) => STEPS.reduce((s, st) => s + (r.steps?.[st.key] ?? 0), 0)), 1)
  return (
    <div className="grid gap-4">
      {rows.map((r) => {
        const total = STEPS.reduce((s, st) => s + (r.steps?.[st.key] ?? 0), 0)
        return (
          <div key={r.label} className="grid gap-1.5">
            <span className="text-[14px] font-semibold">{r.label}</span>
            {total ? (
              <div className="flex items-center gap-3">
                <div className="flex h-14 min-w-0 overflow-hidden rounded-xl" style={{ width: `${(total / top) * 100}%` }} role="img" aria-label={`${r.label}: ${STEPS.map((st) => `${st.label} ${Math.round(r.steps[st.key] ?? 0)} min`).join(', ')}, ${dur(total)} in all`}>
                  {STEPS.map((st) => {
                    const v = r.steps?.[st.key] ?? 0
                    return (
                      <span key={st.key} className="grid min-w-0 place-items-center border-r-2 border-panel text-[13px] font-bold text-white last:border-r-0" style={{ flexGrow: v, flexBasis: 0, background: st.color }} title={`${st.label}: ${Math.round(v)} min`}>
                        {v / total > 0.08 ? `${Math.round(v)} min` : ''}
                      </span>
                    )
                  })}
                </div>
                <b className="shrink-0 font-body text-[16px] tabular-nums">{dur(total)}</b>
              </div>
            ) : (
              <p className="text-[14px] text-muted">Not enough fully timed trucks to show.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Carriers and customers
const NAME_COLS = [
  { id: 'trucks', label: 'Trucks', value: (r) => r.trucks, fmt: (v) => `${v}`, first: 'desc' },
  { id: 'onTime', label: 'On time', value: (r) => r.onTime, fmt: pct, first: 'asc', worst: 'min', miss: (v) => v < ON_TIME_TARGET },
  { id: 'avgTurn', label: 'Avg on site', value: (r) => r.avgTurn, fmt: dur, first: 'desc', worst: 'max', miss: (v) => v > TURN_TARGET },
  { id: 'over2h', label: 'Over 2 hours', value: (r) => r.over2h, fmt: pct, first: 'desc', worst: 'max', miss: (v) => v > 1 - OUT_IN_2H_TARGET },
  { id: 'charges', label: 'Waiting charges', value: (r) => r.charges, fmt: usd, first: 'desc', worst: 'max', miss: (v) => v > 0 },
]

function NameTable({ title, nameLabel, rows, onPick }) {
  const [sort, setSort] = useState({ id: 'trucks', dir: 'desc' })
  const col = NAME_COLS.find((c) => c.id === sort.id)
  const sorted = [...rows].sort((a, b) => {
    const x = col.value(a) ?? (sort.dir === 'asc' ? Infinity : -Infinity)
    const y = col.value(b) ?? (sort.dir === 'asc' ? Infinity : -Infinity)
    return sort.dir === 'asc' ? x - y : y - x
  })
  // The single worst value in each column, when it misses the target.
  const worst = Object.fromEntries(
    NAME_COLS.filter((c) => c.worst).map((c) => {
      const vals = rows.map((r) => c.value(r)).filter((v) => v != null)
      if (!vals.length) return [c.id, null]
      const w = c.worst === 'min' ? Math.min(...vals) : Math.max(...vals)
      return [c.id, c.miss(w) ? w : null]
    }),
  )
  // Ties: only the first row (in the current order) with the worst value is marked.
  const firstWorst = Object.fromEntries(NAME_COLS.filter((c) => worst[c.id] != null).map((c) => [c.id, sorted.find((r) => c.value(r) === worst[c.id])?.name]))
  const maxCharge = Math.max(1, ...rows.map((r) => r.charges))
  const toggle = (c) => setSort((s) => (s.id === c.id ? { id: c.id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id: c.id, dir: c.first }))
  return (
    <section className="grid min-w-0 content-start gap-3 rounded-2xl border border-hair bg-panel p-5 shadow-card">
      <h3 className="font-body text-[16.5px] font-bold">{title}</h3>
      <div className="tt-tablebox overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>{nameLabel}</th>
              {NAME_COLS.map((c) => (
                <th key={c.id} className="num" aria-sort={sort.id === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ padding: 0 }}>
                  <button type="button" onClick={() => toggle(c)} className="inline-flex min-h-11 w-full cursor-pointer items-center justify-end gap-1 px-3.5 font-semibold hover:text-ink">
                    {c.label}
                    <span aria-hidden="true">{sort.id === c.id ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.name}>
                <td style={{ padding: '2px 8px' }}>
                  <button type="button" onClick={() => onPick(r.name)} className="min-h-11 cursor-pointer rounded-lg px-1.5 text-left font-semibold text-signal underline decoration-line underline-offset-2 hover:decoration-signal">
                    {r.name}
                  </button>
                </td>
                {NAME_COLS.map((c) => {
                  const v = c.value(r)
                  const isWorst = worst[c.id] != null && v === worst[c.id] && firstWorst[c.id] === r.name
                  return (
                    <td key={c.id} className={'num ' + (isWorst ? 'font-bold' : '')}>
                      {isWorst && c.id !== 'charges' && <Icon name="warning" size={14} className="mr-1 inline align-[-2px] text-warn-edge" />}
                      {c.id === 'charges' ? (
                        <span className="flex items-center justify-end gap-2">
                          <span className="hidden h-2 w-16 overflow-hidden rounded-full bg-field sm:block" aria-hidden="true">
                            <span className="block h-full rounded-full" style={{ width: `${(v / maxCharge) * 100}%`, background: NAVY, opacity: 0.35 }} />
                          </span>
                          {isWorst && <Icon name="warning" size={14} className="text-warn-edge" />}
                          {c.fmt(v)}
                        </span>
                      ) : (
                        c.fmt(v)
                      )}
                      {isWorst && <span className="sr-only"> (the worst)</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Truck tables (deep dives)
const COLS = {
  day: { label: 'Day', get: (r) => dayLabel(r.day) },
  trailer: { label: 'Trailer', get: (r) => r.e.trailerNumber || '—' },
  carrier: { label: 'Carrier', get: (r) => r.carrier },
  customer: { label: 'Customer', get: (r) => r.customer },
  order: { label: 'Order no.', get: (r) => r.e.pickupNumber || '—' },
  arrived: { label: 'Arrived', get: (r) => clock12(r.e.timeIn) },
  booked: { label: 'Booked', get: (r) => (r.e.appointmentTime ? clock12(r.e.appointmentTime) : 'Not booked') },
  turn: { label: 'On site', get: (r) => dur(r.turn), num: true },
  orderWait: { label: 'Wait for order', get: (r) => dur(r.orderWait), num: true },
  dockWait: { label: 'Wait for dock', get: (r) => dur(r.dockWait), num: true },
  yardWait: { label: 'Before a dock', get: (r) => dur(r.yardWait), num: true },
  leave: { label: 'Waiting to leave', get: (r) => dur(r.paperwork), num: true },
  lateBy: { label: 'Late by', get: (r) => (r.lateMin > 0 ? dur(r.lateMin) : '—'), num: true },
  charge: { label: 'Charge', get: (r) => usd(chargeOf(r)), num: true },
  reason: { label: 'Reason', get: (r) => reasonById(r.reason)?.label ?? 'Not given' },
  result: { label: 'Inspection', get: (r) => (r.e.loadingInspection?.result === 'Pass' ? 'Passed after a re-check' : 'Failed') },
  fix: { label: 'What was done', get: (r) => r.e.loadingInspection?.correctiveAction || r.e.loadingInspection?.issues?.[0] || '—' },
  ready: {
    label: 'Order ready',
    get: (r) => {
      const v = readyVsSlot(r)
      return v == null ? '—' : v >= 0 ? `${dur(v)} before the slot` : `${dur(-v)} after the slot`
    },
    num: true,
  },
}

function TruckTable({ rows, cols, focus, showAll, setShowAll, picked, setPicked }) {
  const shown = showAll ? rows : rows.slice(0, 12)
  return (
    <section className="grid gap-3 rounded-2xl border border-hair bg-panel p-5 shadow-card">
      <h3 className="font-body text-[16.5px] font-bold">The trucks behind this</h3>
      <p className="-mt-2 text-[13.5px] text-muted">
        These are the {rows.length} truck{rows.length === 1 ? '' : 's'} behind this number. The ones that went most wrong are at the top.
      </p>
      {rows.length ? (
        <div className="tt-tablebox overflow-x-auto">
          <table>
            <thead>
              <tr>
                {picked && (
                  <th>
                    <span className="sr-only">Claim</span>
                  </th>
                )}
                {cols.map((k) => (
                  <th key={k} className={COLS[k].num ? 'num' : ''}>
                    {COLS[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  {picked && (
                    <td style={{ padding: '0 6px' }}>
                      <label className="grid size-11 cursor-pointer place-items-center">
                        <input type="checkbox" className="size-5 cursor-pointer accent-[var(--color-signal)]" checked={picked.has(r.id)} onChange={() => setPicked(r.id)} aria-label={`Claim trailer ${r.e.trailerNumber}`} />
                      </label>
                    </td>
                  )}
                  {cols.map((k) => (
                    <td key={k} className={(COLS[k].num ? 'num ' : '') + (k === focus ? 'font-bold' : '')} style={{ whiteSpace: k === 'fix' || k === 'reason' ? 'normal' : undefined }}>
                      {COLS[k].get(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[14px] text-muted">No trucks in these dates.</p>
      )}
      {rows.length > 12 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className={ui.btnGhost + ' -ml-3 w-fit'}>
          {showAll ? 'Show fewer' : `Show all (${rows.length})`}
        </button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Deep dives
const DIVES = [
  { id: 'charges', label: 'Waiting charges' },
  { id: 'turn', label: 'Time on site' },
  { id: 'wait', label: 'Waiting before a dock' },
  { id: 'late', label: 'Late carriers' },
  { id: 'recheck', label: 'Loads re-checked' },
  { id: 'leave', label: 'Slow to leave' },
  { id: 'staged', label: 'Orders staged' },
  { id: 'perTruck', label: 'Charges per truck' },
  { id: 'dispute', label: 'Charges we can dispute' },
]

// Bar chart helpers over the kit's TT functions. `bad(v)`: that bar is off target (striped light navy).
const dayBars = (days, value, fmt, bad, ref) => (el) =>
  TT.vbars(el, {
    rows: days,
    key: (d) => d.day,
    label: dayLabel,
    value: (d) => value(d) ?? 0,
    fmt,
    color: (d) => (bad && value(d) != null && bad(value(d)) ? OVER : NAVY),
    ref,
    refLabel: ref != null ? 'Target' : undefined,
    tip: (d) => [dayLabel(d.day), [[null, null, value(d) == null ? 'No trucks' : fmt(value(d))]]],
    height: 220,
  })
const nameBars = (rows, value, fmt, bad) => (el) =>
  TT.hbars(el, {
    rows,
    key: (r) => r.name,
    label: (r) => r.name,
    value: (r) => value(r) ?? 0,
    fmt,
    color: (r) => (bad && bad(value(r)) ? OVER : NAVY),
    tip: (r) => [r.name, [[null, null, fmt(value(r) ?? 0)]]],
  })

function diveOf(id, { rows, s, days }) {
  const live = rows.filter((r) => !r.drop)
  const doneLive = live.filter((r) => r.done && r.turn != null)
  const carriers = byName(rows, 'carrier')
  const why = reasons(rows)
  const dayTable = (fmt, value, head) => ({ head: ['Day', { label: head, right: true }], rows: days.map((d) => [dayLabel(d.day), value(d) == null ? '—' : fmt(value(d))]) })
  const nameTable = (list, fmt, value, head, first = 'Carrier') => ({ head: [first, { label: head, right: true }], rows: list.map((r) => [r.name, fmt(value(r) ?? 0)]) })
  const base = ['day', 'trailer', 'carrier', 'order']
  switch (id) {
    case 'charges': {
      const charged = rows.filter((r) => chargeOf(r) > 0).sort((a, b) => chargeOf(b) - chargeOf(a))
      const byCarrier = carriers.filter((c) => c.charges > 0).sort((a, b) => b.charges - a.charges)
      return {
        finding: s.charges ? `Waiting charges came to ${usd(s.charges)}, about ${usd(s.perMonth)} a month at this pace, from ${s.chargedCount} trucks that stayed past their free time.` : 'No waiting charges in these dates.',
        numbers: [
          ['Waiting charges', usd(s.charges), 'Target: none'],
          ['Trucks charged', `${s.chargedCount} of ${s.done}`, `Target: at most ${pct(1 - OUT_IN_2H_TARGET)} over 2 hours`],
          ['At this pace', `${usd(s.perMonth)} a month`, 'Assumes the same trucks every day'],
        ],
        action: byCarrier[0] ? `Start with ${byCarrier[0].name}: their trucks ran up ${usd(byCarrier[0].charges)}. Check the reasons below, and claim back the ones on the carrier's side.` : 'Keep trucks out within their 2 free hours.',
        charts: [
          { title: 'Waiting charges by day', note: `Each bar is one day. It shows what carriers can charge us: $${DETENTION.ratePerHour} for every hour a truck stayed past its 2 free hours.`, draw: dayBars(days, (d) => d.charges, usd), deps: [days], table: dayTable(usd, (d) => d.charges, 'Charges') },
          { title: 'By carrier', note: 'Each bar is one carrier. It shows the charges their trucks ran up. The most charged is at the top.', draw: nameBars(byCarrier, (r) => r.charges, usd), deps: [byCarrier], table: nameTable(byCarrier, usd, (r) => r.charges, 'Charges') },
          { title: 'By reason', note: "Each bar is one reason Shipping gave for a long stay. It shows the charges on those trucks. The most charged reason is at the top.", draw: nameBars(why.map((x) => ({ ...x, name: x.label })), (r) => r.charges, usd), deps: [why], table: nameTable(why.map((x) => ({ ...x, name: x.label })), usd, (r) => r.charges, 'Charges', 'Reason') },
        ],
        rows: charged,
        cols: [...base, 'turn', 'reason', 'charge'],
        focus: 'charge',
      }
    }
    case 'turn': {
      const list = [...doneLive].sort((a, b) => b.turn - a.turn)
      const longest = list[0]
      const byCarrier = carriers.filter((c) => c.avgTurn != null).sort((a, b) => b.avgTurn - a.avgTurn)
      return {
        finding: s.avgTurn != null ? `A pickup spent ${dur(s.avgTurn)} on site on average, and ${pct(s.over2h)} stayed over 2 hours.` : 'No pickups left in these dates.',
        numbers: [
          ['Average time on site', dur(s.avgTurn), `Target: ${TURN_TARGET / 60} hours or less`],
          ['Trucks over 2 hours', pct(s.over2h), `Target: at most ${pct(1 - OUT_IN_2H_TARGET)}`],
          ['Longest stay', longest ? dur(longest.turn) : '—', longest ? `Trailer ${longest.e.trailerNumber}, ${longest.carrier}` : ''],
        ],
        action: worstStep(s) ? `The step furthest past its target is ${worstStep(s).label.toLowerCase()}. Work on that first.` : 'Every step is within its target.',
        charts: [
          { title: 'Average time on site by day', note: `Each bar is one day. It shows the average time a pickup spent here. Striped bars are over our ${TURN_TARGET / 60}-hour target.`, over: `Over ${TURN_TARGET / 60} hours`, draw: dayBars(days, (d) => d.avgTurn, dur, (v) => v > TURN_TARGET, TURN_TARGET), deps: [days], table: dayTable(dur, (d) => d.avgTurn, 'Average on site') },
          {
            title: 'Where the time went, by day',
            note: 'Each bar is one day, split into the four parts of a visit. The tallest part is where most time went.',
            legend: STEPS.map((st) => [st.label, st.color]),
            draw: (el) =>
              TT.stackBars(el, {
                rows: days.map((d) => ({ day: d.day, ...Object.fromEntries(STEPS.map((st) => [st.key, d.steps[st.key] ?? 0])) })),
                key: (r) => r.day,
                label: dayLabel,
                series: STEPS.map((st) => ({ field: st.key, name: st.label, color: st.color })),
                fmt: (v) => `${Math.round(v)} min`,
                tipHead: (r) => dayLabel(r.day),
                height: 240,
              }),
            deps: [days],
            table: { head: ['Day', ...['For the order', 'For a dock', 'At the dock', 'To leave'].map((label) => ({ label, right: true }))], rows: days.map((d) => [dayLabel(d.day), ...STEPS.map((st) => dur(d.steps[st.key]))]) },
          },
          { title: 'By carrier', note: `Each bar is one carrier. It shows how long their pickups stayed on average. Striped bars are over ${TURN_TARGET / 60} hours. The longest is at the top.`, over: `Over ${TURN_TARGET / 60} hours`, draw: nameBars(byCarrier, (r) => r.avgTurn, dur, (v) => v > TURN_TARGET), deps: [byCarrier], table: nameTable(byCarrier, dur, (r) => r.avgTurn, 'Average on site') },
        ],
        rows: list,
        cols: [...base, 'arrived', 'yardWait', 'leave', 'turn'],
        focus: 'turn',
      }
    }
    case 'wait': {
      const list = live.filter((r) => r.yardWait != null).sort((a, b) => b.yardWait - a.yardWait)
      const hours = Array.from({ length: 15 }, (_, i) => 5 + i).map((h) => {
        const at = list.filter((r) => new Date(r.arrived).getHours() === h)
        return { day: String(h), name: h === 12 ? 'Noon' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`, wait: at.length ? at.reduce((a, r) => a + r.yardWait, 0) / at.length : null }
      })
      return {
        finding: s.waitDock != null ? `A pickup waited ${dur(s.waitDock)} on average before it got a dock: ${dur(s.steps.order)} for its order, then ${dur(s.steps.dock)} for a free dock.` : 'No pickups got a dock in these dates.',
        numbers: [
          ['Wait for a dock', dur(s.waitDock), `Target: ${WAIT_TARGET} min or less`],
          ['Wait for the order', dur(s.steps.order), '15 min or less'],
          ['Wait for a free dock', dur(s.steps.dock), '15 min or less'],
        ],
        action: (s.steps.order ?? 0) > (s.steps.dock ?? 0) ? 'Most of the wait is for the order. Stage orders before the booked slot, so trucks get a dock as they arrive.' : 'Most of the wait is for a free dock. Assign docks as soon as the order is ready, and look at the busiest hours below.',
        charts: [
          {
            title: 'The wait, by day',
            note: 'Each bar is one day, split into waiting for the order and then for a free dock. Our target is 30 minutes in all.',
            legend: [[STEPS[0].label, STEPS[0].color], [STEPS[1].label, STEPS[1].color]],
            draw: (el) =>
              TT.stackBars(el, {
                rows: days.map((d) => ({ day: d.day, order: d.steps.order ?? 0, dock: d.steps.dock ?? 0 })),
                key: (r) => r.day,
                label: dayLabel,
                series: [
                  { field: 'order', name: STEPS[0].label, color: STEPS[0].color },
                  { field: 'dock', name: STEPS[1].label, color: STEPS[1].color },
                ],
                fmt: (v) => `${Math.round(v)} min`,
                ref: WAIT_TARGET,
                refLabel: 'Target',
                tipHead: (r) => dayLabel(r.day),
              }),
            deps: [days],
            table: { head: ['Day', { label: 'For the order', right: true }, { label: 'For a dock', right: true }], rows: days.map((d) => [dayLabel(d.day), dur(d.steps.order), dur(d.steps.dock)]) },
          },
          {
            title: 'By hour of arrival',
            note: `Each bar is one hour of the day. It shows how long trucks arriving then waited for a dock. Striped bars are over ${WAIT_TARGET} minutes.`,
            over: `Over ${WAIT_TARGET} minutes`,
            draw: (el) =>
              TT.vbars(el, {
                rows: hours,
                key: (r) => r.day,
                label: (k) => hours.find((x) => x.day === k).name.replace(' ', ''),
                value: (r) => r.wait ?? 0,
                fmt: (v) => `${Math.round(v)} min`,
                color: (r) => (r.wait > WAIT_TARGET ? OVER : NAVY),
                tip: (r) => [r.name, [[null, null, r.wait == null ? 'No trucks' : dur(r.wait)]]],
                height: 220,
              }),
            deps: [list],
            table: { head: ['Hour', { label: 'Average wait', right: true }], rows: hours.map((x) => [x.name, dur(x.wait)]) },
          },
        ],
        rows: list,
        cols: [...base, 'arrived', 'orderWait', 'dockWait', 'yardWait'],
        focus: 'yardWait',
      }
    }
    case 'late': {
      const list = rows.filter((r) => r.arrival === 'Late').sort((a, b) => b.lateMin - a.lateMin)
      const byCarrier = carriers.filter((c) => c.onTime != null).sort((a, b) => a.onTime - b.onTime)
      const avgLate = list.length ? list.reduce((a, r) => a + r.lateMin, 0) / list.length : null
      return {
        finding: s.onTime != null ? `${pct(s.onTime)} of booked trucks arrived on time. ${list.length} came more than 15 minutes late, ${dur(avgLate)} late on average.` : 'No booked trucks in these dates.',
        numbers: [
          ['On-time arrivals', pct(s.onTime), `Target: ${pct(ON_TIME_TARGET)} or more`],
          ['Late trucks', `${list.length} of ${s.booked}`, 'More than 15 min after the booked time'],
          ['Late by, on average', dur(avgLate), 'Late trucks only'],
        ],
        action: byCarrier[0] && byCarrier[0].onTime < ON_TIME_TARGET ? `Talk to ${byCarrier[0].name}: ${pct(byCarrier[0].onTime)} of their trucks were on time.` : 'Every carrier is on target.',
        charts: [
          { title: 'On time by carrier', note: `Out of each carrier's booked trucks, how many arrived on time. Striped bars mean fewer than ${Math.round(ON_TIME_TARGET * 10)} in 10. The worst is at the top.`, over: `Fewer than ${Math.round(ON_TIME_TARGET * 10)} in 10 on time`, draw: nameBars(byCarrier, (r) => r.onTime, pct, (v) => v < ON_TIME_TARGET), deps: [byCarrier], table: nameTable(byCarrier, pct, (r) => r.onTime, 'On time') },
          { title: 'Late trucks by day', note: 'Each bar is one day. It shows how many booked trucks came more than 15 minutes late.', draw: dayBars(days, (d) => d.lateCount, (v) => `${Math.round(v)}`), deps: [days], table: dayTable((v) => `${v} trucks`, (d) => d.lateCount, 'Late trucks') },
        ],
        rows: list,
        cols: [...base, 'booked', 'arrived', 'lateBy'],
        focus: 'lateBy',
      }
    }
    case 'recheck': {
      const list = rows.filter((r) => r.rechecked).sort((a, b) => b.arrived - a.arrived)
      const fixes = new Map()
      for (const r of list) {
        const k = r.e.loadingInspection?.correctiveAction || r.e.loadingInspection?.issues?.[0] || 'Not fixed yet'
        fixes.set(k, (fixes.get(k) ?? 0) + 1)
      }
      const fixRows = [...fixes].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
      return {
        finding: s.firstPass != null ? `${pct(s.firstPass)} of loads passed inspection the first time. ${s.rechecked} had to be fixed and checked again.` : 'No loads inspected in these dates.',
        numbers: [
          ['Passed first time', pct(s.firstPass), `Target: ${pct(PASS_TARGET)} or more`],
          ['Re-checked', `${s.rechecked} of ${s.inspected}`, 'Loads that failed once'],
          ['Most common fix', fixRows[0]?.name ?? '—', fixRows[0] ? `${fixRows[0].n} loads` : ''],
        ],
        action: fixRows[0] ? `The most common fix was "${fixRows[0].name}". Check that step with the dock crew before loading.` : 'No loads were re-checked.',
        charts: [
          { title: 'Passed first time, by day', note: `Each bar is one day. It shows the share of loads that passed without a re-check. Striped bars are under ${pct(PASS_TARGET)}.`, over: `Under ${pct(PASS_TARGET)}`, draw: dayBars(days, (d) => d.firstPass, pct, (v) => v < PASS_TARGET), deps: [days], table: dayTable(pct, (d) => d.firstPass, 'Passed first time') },
          { title: 'What was done about it', note: 'Each bar is one fix the dock made after a failed inspection. It shows how many loads needed it. The most common is at the top.', draw: nameBars(fixRows, (r) => r.n, (v) => `${v}`), deps: [fixRows], table: nameTable(fixRows, (v) => `${v} loads`, (r) => r.n, 'Loads', 'Fix') },
        ],
        rows: list,
        cols: [...base, 'result', 'fix'],
        focus: 'result',
      }
    }
    case 'leave': {
      const list = doneLive.filter((r) => r.paperwork != null).sort((a, b) => b.paperwork - a.paperwork)
      const byCarrier = carriers.filter((c) => c.leave != null).sort((a, b) => b.leave - a.leave)
      return {
        finding: s.leave != null ? `A loaded truck waited ${dur(s.leave)} on average to leave after passing inspection.` : 'No loaded trucks left in these dates.',
        numbers: [
          ['Waiting to leave', dur(s.leave), `Target: ${LEAVE_TARGET} min or less`],
          ['Over the target', `${list.filter((r) => r.paperwork > LEAVE_TARGET).length} of ${list.length}`, 'Trucks'],
          ['Longest', list[0] ? dur(list[0].paperwork) : '—', list[0] ? `Trailer ${list[0].e.trailerNumber}` : ''],
        ],
        action: 'Release passed loads straight away, and have the paperwork ready before inspection ends.',
        charts: [
          { title: 'Waiting to leave, by day', note: `How long a loaded truck waited to leave after passing inspection. Striped bars are longer than our ${LEAVE_TARGET}-minute target.`, over: `Over ${LEAVE_TARGET} minutes`, draw: dayBars(days, (d) => d.leave, dur, (v) => v > LEAVE_TARGET, LEAVE_TARGET), deps: [days], table: dayTable(dur, (d) => d.leave, 'Waiting to leave') },
          { title: 'By carrier', note: `Each bar is one carrier. It shows how long their loaded trucks waited to leave. Striped bars are over ${LEAVE_TARGET} minutes. The longest is at the top.`, over: `Over ${LEAVE_TARGET} minutes`, draw: nameBars(byCarrier, (r) => r.leave, dur, (v) => v > LEAVE_TARGET), deps: [byCarrier], table: nameTable(byCarrier, dur, (r) => r.leave, 'Waiting to leave') },
        ],
        rows: list,
        cols: [...base, 'turn', 'leave'],
        focus: 'leave',
      }
    }
    case 'staged': {
      const list = rows.filter((r) => readyVsSlot(r) != null).sort((a, b) => readyVsSlot(a) - readyVsSlot(b))
      const customers = byName(rows, 'customer').filter((c) => c.staged != null).sort((a, b) => a.staged - b.staged)
      return {
        finding: s.staged != null ? `${pct(s.staged)} of booked orders were ready before the truck's slot. The rest made the truck wait.` : 'No booked orders in these dates.',
        numbers: [
          ['Staged before the slot', pct(s.staged), `Target: ${pct(STAGED_TARGET)} or more (to confirm)`],
          ['Ready after the slot', `${list.filter((r) => readyVsSlot(r) < 0).length} of ${list.length}`, 'Booked orders'],
          ['Wait for the order', dur(s.steps.order), '15 min or less'],
        ],
        action: customers[0] ? `Start with ${customers[0].name}'s orders: ${pct(customers[0].staged)} were staged in time.` : 'Stage each order an hour before its slot.',
        charts: [
          { title: 'Staged before the slot, by day', note: `Each bar is one day. It shows the share of booked orders ready before the truck's slot. Striped bars are under ${pct(STAGED_TARGET)}.`, over: `Under ${pct(STAGED_TARGET)}`, draw: dayBars(days, (d) => d.staged, pct, (v) => v < STAGED_TARGET), deps: [days], table: dayTable(pct, (d) => d.staged, 'Staged') },
          { title: 'By customer', note: `Each bar is one customer. It shows the share of their orders staged in time. Striped bars are under ${pct(STAGED_TARGET)}. The worst is at the top.`, over: `Under ${pct(STAGED_TARGET)}`, draw: nameBars(customers, (r) => r.staged, pct, (v) => v < STAGED_TARGET), deps: [customers], table: nameTable(customers, pct, (r) => r.staged, 'Staged', 'Customer') },
        ],
        rows: list,
        cols: [...base, 'customer', 'booked', 'ready'],
        focus: 'ready',
      }
    }
    case 'perTruck': {
      const list = doneLive.filter((r) => chargeOf(r) > 0).sort((a, b) => chargeOf(b) - chargeOf(a))
      const byCarrier = carriers.filter((c) => c.chargePerTruck != null).sort((a, b) => b.chargePerTruck - a.chargePerTruck)
      return {
        finding: s.chargePerTruck != null ? `Each pickup cost ${usd(s.chargePerTruck)} in waiting charges on average.` : 'No pickups left in these dates.',
        numbers: [
          ['Charges per truck', usd(s.chargePerTruck), 'Target: none'],
          ['Waiting charges', usd(s.charges), `${s.done} pickups`],
          ['Trucks charged', `${s.chargedCount}`, 'Stayed past 2 free hours'],
        ],
        action: byCarrier[0] ? `${byCarrier[0].name} costs the most per truck (${usd(byCarrier[0].chargePerTruck)}). Look at their trucks below.` : 'No charges.',
        charts: [
          { title: 'Charges per truck, by day', note: 'Each bar is one day. It shows the waiting charges spread over every pickup that left that day.', draw: dayBars(days, (d) => d.chargePerTruck, usd), deps: [days], table: dayTable(usd, (d) => d.chargePerTruck, 'Per truck') },
          { title: 'By carrier', note: 'Each bar is one carrier. It shows their waiting charges per pickup. The most costly is at the top.', draw: nameBars(byCarrier, (r) => r.chargePerTruck, usd), deps: [byCarrier], table: nameTable(byCarrier, usd, (r) => r.chargePerTruck, 'Per truck') },
        ],
        rows: list,
        cols: [...base, 'turn', 'charge'],
        focus: 'charge',
      }
    }
    default: {
      const list = rows.filter((r) => chargeOf(r) > 0 && isCarrierSide(r.reason)).sort((a, b) => chargeOf(b) - chargeOf(a))
      const why2 = why.filter((x) => x.carrier && x.charges > 0).map((x) => ({ ...x, name: x.label.replace(/ \(carrier's side\)/, '') }))
      const byCarrier = byName(list, 'carrier').map((c) => ({ ...c, name: c.name })).sort((a, b) => b.charges - a.charges)
      return {
        finding: list.length ? `${usd(s.disputable)} of the waiting charges were on the carrier's side, on ${list.length} trucks. We can ask the carriers to drop them.` : "No charges on the carrier's side in these dates.",
        numbers: [
          ['Charges we can dispute', usd(s.disputable), "On the carrier's side"],
          ['Trucks', `${list.length}`, 'With a charge'],
          ['Share of all charges', pct(s.charges ? s.disputable / s.charges : null), `Of ${usd(s.charges)}`],
        ],
        action: 'Copy the claim list below and send it to each carrier with the dates and reasons.',
        charts: [
          { title: 'By reason', note: "Each bar is one carrier-side reason. It shows the charges on those trucks. The biggest is at the top.", draw: nameBars(why2, (r) => r.charges, usd), deps: [why2], table: nameTable(why2, usd, (r) => r.charges, 'Charges', 'Reason') },
          { title: 'By carrier', note: 'Each bar is one carrier. It shows the charges we can dispute with them. The biggest is at the top.', draw: nameBars(byCarrier, (r) => r.charges, usd), deps: [byCarrier], table: nameTable(byCarrier, usd, (r) => r.charges, 'Charges') },
        ],
        rows: list,
        cols: [...base, 'turn', 'reason', 'charge'],
        focus: 'charge',
        claim: true,
      }
    }
  }
}

function Dive({ id, ctx, onOpen, onBack }) {
  const [showAll, setShowAll] = useState(false)
  const d = diveOf(id, ctx)
  const [unpicked, setUnpicked] = useState(() => new Set())
  const [copied, setCopied] = useState(false)
  const picked = d.claim ? new Set(d.rows.filter((r) => !unpicked.has(r.id)).map((r) => r.id)) : null
  const toggle = (rid) =>
    setUnpicked((s) => {
      const n = new Set(s)
      if (n.has(rid)) n.delete(rid)
      else n.add(rid)
      return n
    })
  const claimText = () => {
    const list = d.rows.filter((r) => picked.has(r.id))
    const lines = list.map(
      (r) => `${dayLabel(r.day)}, ${r.type}, trailer ${r.e.trailerNumber}, order ${r.e.pickupNumber || 'not given'}: ${(reasonById(r.reason)?.label ?? 'Other').replace(/ \(carrier's side\)/, '')}. On site ${dur(r.turn)}, charge ${usd(chargeOf(r))}.`,
    )
    const total = list.reduce((s, r) => s + chargeOf(r), 0)
    return [...lines, `Total: ${list.length} truck${list.length === 1 ? '' : 's'}, ${usd(total)}.`].join('\n')
  }
  const print = () => {
    flushSync(() => setShowAll(true))
    window.print()
  }
  return (
    <div className="grid gap-5">
      <nav aria-label="Deep dives" className="no-print flex flex-wrap gap-2">
        <button type="button" onClick={onBack} className={ui.btnSmallPrimary}>
          ← Overview
        </button>
        {DIVES.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-current={x.id === id ? 'page' : undefined}
            onClick={() => onOpen(x.id)}
            className={'min-h-11 cursor-pointer rounded-full border px-3.5 text-[14px] font-semibold transition-colors duration-150 ' + (x.id === id ? 'border-signal bg-signal-tint text-signal' : 'border-line bg-panel hover:border-signal-bright')}
          >
            {x.label}
          </button>
        ))}
        <button type="button" onClick={print} className={ui.btnSmall + ' ml-auto'}>
          <Icon name="print" size={18} />
          Print this page
        </button>
      </nav>
      <section className="on-chrome grid gap-2 rounded-2xl bg-chrome p-6 text-white shadow-card">
        <p className="text-[14px] text-rail-text">{DIVES.find((x) => x.id === id).label}</p>
        <h1 className="max-w-[60rem] font-display text-[26px] leading-snug font-bold">{d.finding}</h1>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {d.numbers.map(([label, value, target]) => (
          <div key={label} className="grid gap-1 rounded-2xl border border-hair bg-panel p-4 shadow-card">
            <span className="text-[13.5px] font-semibold text-muted">{label}</span>
            <b className="font-body text-[26px] leading-tight tabular-nums">{value}</b>
            <span className="text-[13px] text-muted">{target}</span>
          </div>
        ))}
      </div>
      <p className="flex items-start gap-2.5 rounded-2xl border border-signal-bright bg-signal-tint px-5 py-4 text-[15px]">
        <Icon name="info" className="mt-0.5 text-signal" />
        <span>
          <b>Suggested action: </b>
          {d.action}
        </span>
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {d.charts.map((c, i) => (
          <Panel key={c.title} title={c.title} note={c.note} legend={c.legend} over={c.over} table={c.table} wide={d.charts.length === 3 && i === 0}>
            <Chart draw={c.draw} deps={[...c.deps, id]} label={c.title} />
          </Panel>
        ))}
      </div>
      {d.claim && d.rows.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-3 rounded-2xl border border-hair bg-panel px-5 py-3 shadow-card">
          <button
            type="button"
            disabled={!picked.size}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(claimText())
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                setCopied(false)
              }
            }}
            className={ui.btnSmallPrimary}
          >
            <Icon name={copied ? 'done' : 'export'} size={18} />
            {copied ? 'Copied' : `Copy claim list (${picked.size})`}
          </button>
          <p className="min-w-0 flex-1 text-[14px] text-muted">Untick any truck you don't want to claim. The list copies as text you can paste into an email to the carrier.</p>
        </div>
      )}
      <TruckTable rows={d.rows} cols={d.cols} focus={d.focus} showAll={showAll} setShowAll={setShowAll} picked={picked} setPicked={toggle} />
    </div>
  )
}

// ---------------------------------------------------------------- The page
export default function MgmtOverview({ entries, sampleCount, onLoadSample, onRemoveSample }) {
  const today = dayKey(new Date())
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [custom, setCustom] = useState({ from: shiftDate(today, -6), to: today })
  const [compareId, setCompareId] = useState('prev')
  const [carrier, setCarrier] = useState('')
  const [customer, setCustomer] = useState('')
  const [kind, setKind] = useState('')
  const [dive, setDive] = useState(null)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(MANUAL_KEY)) ?? null
    } catch {
      return null
    }
  })
  const [manualSample, setManualSample] = useState(!manual)
  const barRef = useRef(null)
  // The paper week: the imported manual week, or the kit's sample until one is imported.
  useEffect(() => {
    if (manual) return
    import('../turnaround/sample-manual-week.json').then((m) => {
      setManual(m.default)
      setManualSample(true)
    })
  }, [manual])

  const range = preset === 'custom' ? (custom.from <= custom.to ? custom : { from: custom.to, to: custom.from }) : PRESETS.find((p) => p.id === preset).range(today)
  const all = useMemo(() => truckRows(entries), [entries])
  const filters = { carrier, customer, kind }
  const rows = useMemo(() => filterRows(all, { ...range, ...filters }), [all, range.from, range.to, carrier, customer, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = daysIn(range)
  const s = useMemo(() => summarize(rows, days), [rows, days])
  const paper = useMemo(() => paperSummary(manual), [manual])
  const cRange = compareRange(range, compareId)
  const cmp = useMemo(() => (compareId === 'paper' ? paper : summarize(filterRows(all, { ...cRange, ...filters }), daysIn(cRange))), [compareId, paper, all, cRange?.from, cRange?.to, carrier, customer, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const against = compareId === 'paper' ? 'the paper week' : fmtRange(cRange)
  const daySeries = useMemo(() => series(rows, range), [rows, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const last14 = useMemo(() => series(filterRows(all, filters), { from: shiftDate(range.to, -13), to: range.to }), [all, range.to, carrier, customer, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const issues = topIssues(s)
  const carriers = useMemo(() => byName(rows, 'carrier'), [rows])
  const customers = useMemo(() => byName(rows, 'customer'), [rows])
  const names = useMemo(() => ({ carrier: [...new Set(all.map((r) => r.carrier))].sort(), customer: [...new Set(all.map((r) => r.customer))].sort() }), [all])
  const who = [carrier, customer, kind && `${kind.toLowerCase()} loads`].filter(Boolean).join(', ') || 'all trucks'
  const context = `${fmtRange(range)}, ${who}, compared with ${compareId === 'paper' ? `the paper week${manualSample ? ' (sample)' : ''}` : fmtRange(cRange)}`
  const anyFilter = carrier || customer || kind
  const clear = () => {
    setCarrier('')
    setCustomer('')
    setKind('')
  }
  const openDive = (id) => {
    setDive(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const toBar = () => barRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // The plain-text summary for Copy and Email.
  const summaryText = () =>
    [
      `Overview: ${context}`,
      '',
      ...CARDS.map((c) => `${c.label}: ${c.fmt(c.value(s))} ${c.unit}${c.target != null ? ` (target: ${c.targetText.toLowerCase()})` : ''}`),
      '',
      issues[0] ? `Top issue: ${issues[0].title}. ${issues[0].line}` : 'Every measure is on target.',
    ].join('\n')
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const chip = (on) => 'min-h-11 cursor-pointer rounded-full border px-3.5 text-[14px] font-semibold whitespace-nowrap transition-colors duration-150 ' + (on ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-panel hover:border-signal-bright')
  const select = 'min-h-11 cursor-pointer rounded-[10px] border-[1.5px] border-line bg-panel px-2.5 text-[14px] font-semibold text-ink hover:border-signal-bright'
  const selectLabel = 'grid gap-1 text-[12.5px] font-semibold text-muted'

  const filterBar = (
    <section ref={barRef} aria-label="Filters" className="no-print grid scroll-mt-[calc(var(--header-h,114px)+56px)] gap-3 rounded-2xl border border-hair bg-panel p-4 shadow-card">
      <div role="group" aria-label="Dates" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)} className={chip(preset === p.id)}>
            {p.label}
          </button>
        ))}
        <button type="button" aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')} className={chip(preset === 'custom')}>
          Pick dates
        </button>
      </div>
      <button type="button" aria-expanded={phoneOpen} onClick={() => setPhoneOpen((v) => !v)} className={ui.btnSmall + ' w-full sm:hidden'}>
        <Icon name="settings" size={18} />
        Filters, compare, print
      </button>
      <div className={(phoneOpen ? 'flex' : 'hidden') + ' flex-wrap items-end gap-3 sm:flex'}>
        {preset === 'custom' && (
          <>
            <label className={selectLabel}>
              From
              <input type="date" value={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className={select} />
            </label>
            <label className={selectLabel}>
              To
              <input type="date" value={custom.to} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className={select} />
            </label>
          </>
        )}
        <label className={selectLabel}>
          Compare with
          <select value={compareId} onChange={(e) => setCompareId(e.target.value)} className={select}>
            {COMPARE.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={selectLabel}>
          Carrier
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={select + ' max-w-[180px]'}>
            <option value="">All carriers</option>
            {names.carrier.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className={selectLabel}>
          Customer
          <select value={customer} onChange={(e) => setCustomer(e.target.value)} className={select + ' max-w-[180px]'}>
            <option value="">All customers</option>
            {names.customer.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className={selectLabel}>
          Fresh / frozen
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={select}>
            <option value="">Both</option>
            <option value="Fresh">Fresh</option>
            <option value="Frozen">Frozen</option>
          </select>
        </label>
        {anyFilter && (
          <button type="button" onClick={clear} className={ui.btnGhost}>
            <Icon name="close" size={16} />
            Clear filters
          </button>
        )}
        <span className="flex flex-wrap gap-2 sm:ml-auto">
          <button type="button" onClick={() => window.print()} className={ui.btnSmall}>
            <Icon name="print" size={18} />
            Print / save as PDF
          </button>
          <a href={`mailto:?subject=${encodeURIComponent(`Truck overview, ${fmtRange(range)}`)}&body=${encodeURIComponent(summaryText())}`} className={ui.btnSmall}>
            <Icon name="messages" size={18} />
            Email summary
          </a>
          <button type="button" onClick={copySummary} className={ui.btnSmall}>
            <Icon name={copied ? 'done' : 'export'} size={18} />
            {copied ? 'Copied' : 'Copy summary'}
          </button>
        </span>
      </div>
    </section>
  )

  const strip = (
    <div className="no-print sticky top-[var(--header-h,114px)] z-[9] -mx-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hair bg-page/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5">
      <p className="min-w-0 flex-1 text-[14px]">
        <b>{context}</b>
      </p>
      <button type="button" onClick={toBar} className={ui.btnGhost + ' text-[14px]'}>
        Change
      </button>
    </div>
  )

  if (dive)
    return (
      <div className="tt tt-mgmt">
        <OverPattern />
        {strip}
        {filterBar}
        <Dive key={dive} id={dive} ctx={{ rows, s, days: daySeries }} onOpen={openDive} onBack={() => setDive(null)} />
      </div>
    )

  const worst = worstStep(s)
  const before = (s.steps.order ?? 0) + (s.steps.dock ?? 0)
  const biggest = [
    ['waiting before a dock', before],
    ['working at the dock', s.steps.work ?? 0],
    ['waiting to leave', s.steps.leave ?? 0],
  ].sort((a, b) => b[1] - a[1])[0]
  // The card for the top issue: the first card that opens its deep dive.
  const topCard = issues[0] && CARDS.find((c) => c.dive === issues[0].dive)?.id
  const cards = (row) => (
    <div className={'grid gap-4 sm:grid-cols-2 ' + (row === 1 ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-4')}>
      {CARDS.filter((c) => c.row === row).map((c) => (
        <Card key={c.id} c={c} s={s} cmp={cmp} against={against} days={last14} top={c.id === topCard} onOpen={() => openDive(c.dive)} />
      ))}
    </div>
  )
  const paperRows = paper && [
    { name: 'Time on site', paper: paper.avgTurn, now: s.avgTurn },
    { name: 'Wait for a dock', paper: paper.waitDock, now: s.waitDock },
    { name: 'At the dock', paper: paper.steps.work, now: s.steps.work },
    { name: 'Waiting to leave', paper: paper.leave, now: s.leave },
  ]
  const paperPct = paper && [
    { name: 'Over 2 hours', paper: paper.over2h, now: s.over2h },
    { name: 'On time', paper: paper.onTime, now: s.onTime },
  ]

  return (
    <div className="tt tt-mgmt">
      <OverPattern />
      {strip}
      {filterBar}

      {/* Headline */}
      <section aria-labelledby="mg-hero" className="on-chrome grid gap-3 rounded-2xl bg-chrome p-6 text-white shadow-card sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-rail-text">{context}</p>
          <span className="no-print flex flex-wrap gap-2">
            {sampleCount > 0 ? (
              <button type="button" onClick={() => window.confirm(`Remove the ${sampleCount} sample visits? Your real entries are kept.`) && onRemoveSample()} className="min-h-11 cursor-pointer rounded-[10px] border border-white/25 bg-white/10 px-3.5 text-[14px] font-semibold hover:bg-white/20">
                Remove sample data ({sampleCount})
              </button>
            ) : (
              <button type="button" onClick={onLoadSample} className="min-h-11 cursor-pointer rounded-[10px] border border-white/25 bg-white/10 px-3.5 text-[14px] font-semibold hover:bg-white/20">
                Load sample visits
              </button>
            )}
          </span>
        </div>
        <h1 id="mg-hero" className="font-display text-[28px] leading-tight font-bold">
          {rows.length ? 'Trucks over 2 hours' : 'No trucks in these dates'}
        </h1>
        {rows.length ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-3">
              <b className="font-body text-[48px] leading-none text-white tabular-nums">{pct(s.over2h)}</b>
              <span className="text-[17px]">of trucks stayed over 2 hours</span>
            </p>
            <p className="max-w-[62rem] text-[16px]">
              That ran up {usd(s.charges)} in waiting charges, about {usd(s.perMonth)} a month at this pace. The limit we're aiming for is {pct(1 - OUT_IN_2H_TARGET)}.
            </p>
            <p className="text-[14px] text-rail-text">
              {s.trucks} trucks: {s.pickups} pickups and {s.drops} drop trailers.
            </p>
            {s.avgTurn != null && (
              <p className="max-w-[62rem] border-l-[3px] border-signal-bright pl-4 text-[15px]">
                A truck spent {dur(s.avgTurn)} on site on average. Most of that time went on {biggest[0]} ({dur(biggest[1])}).{' '}
                {worst ? `The step furthest past its target is ${worst.label.toLowerCase()}, so that is the top issue below.` : 'Every step is within its target.'}
              </p>
            )}
          </>
        ) : (
          <p className="text-[16px]">Pick other dates, or load the sample visits to see how this page works.</p>
        )}
      </section>

      {/* Cards */}
      <section aria-labelledby="mg-cards" className="grid gap-4">
        <SectionTitle
          id="mg-cards"
          title="How we did"
          sub={`Against our targets, and against ${against}. A red pill marks money off target and the top issue. An amber pill marks anything else off target. Tap ⓘ for how a number is worked out.`}
        />
        {cards(1)}
        {cards(2)}
      </section>

      {/* Day by day */}
      <section aria-labelledby="mg-days" className="grid gap-4">
        <SectionTitle id="mg-days" title="Day by day" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Panel
            title="Average time on site"
            note={`Each bar is one day. It shows the average time a pickup spent here. Striped bars are over our ${TURN_TARGET / 60}-hour target, shown by the dashed line.`}
            over={`Over ${TURN_TARGET / 60} hours`}
            table={{ head: ['Day', { label: 'Average on site', right: true }], rows: daySeries.map((d) => [dayLabel(d.day), dur(d.avgTurn)]) }}
          >
            <Chart draw={dayBars(daySeries, (d) => d.avgTurn, dur, (v) => v > TURN_TARGET, TURN_TARGET)} deps={[daySeries]} label="Average time on site by day" />
          </Panel>
          <Panel title="Trucks handled" note="Each bar is one day. It shows every truck that checked in, pickups and drop trailers." table={{ head: ['Day', { label: 'Trucks', right: true }], rows: daySeries.map((d) => [dayLabel(d.day), `${d.trucks} trucks`]) }}>
            <Chart draw={dayBars(daySeries, (d) => d.trucks, (v) => `${Math.round(v)}`)} deps={[daySeries]} label="Trucks handled by day" />
          </Panel>
          <Panel
            title="Waiting charges"
            note={`Each bar is one day. It shows what carriers can charge us: $${DETENTION.ratePerHour} for every hour a truck stayed past its 2 free hours.`}
            table={{ head: ['Day', { label: 'Charges', right: true }], rows: daySeries.map((d) => [dayLabel(d.day), usd(d.charges)]) }}
          >
            <Chart draw={dayBars(daySeries, (d) => d.charges, usd)} deps={[daySeries]} label="Waiting charges by day" />
          </Panel>
        </div>
      </section>

      {/* Step by step */}
      <section aria-labelledby="mg-steps" className="grid gap-4 rounded-2xl border border-hair bg-panel p-5 shadow-card">
        <SectionTitle id="mg-steps" title="One truck's visit, step by step" sub="The average pickup, split into the four parts of a visit, with the minutes on each part and the total on the right." />
        <Legend items={STEPS.map((st) => [st.label, st.color])} />
        <StepBars rows={[{ label: `This period, ${fmtRange(range)}`, steps: s.steps }, { label: compareId === 'paper' ? `Paper week${manualSample ? ' (sample)' : ''}` : `Compared with ${fmtRange(cRange)}`, steps: cmp?.steps }]} />
        <ShowTable
          head={['Part of the visit', { label: 'This period', right: true }, { label: compareId === 'paper' ? 'Paper week' : fmtRange(cRange), right: true }, { label: 'Target', right: true }]}
          rows={STEPS.map((st) => [st.label, dur(s.steps[st.key]), dur(cmp?.steps?.[st.key]), `${st.target} min`])}
        />
      </section>

      {/* What to fix first */}
      <section aria-labelledby="mg-fix" className="grid gap-3 rounded-2xl border border-hair bg-panel p-5 shadow-card">
        <SectionTitle id="mg-fix" title="What to fix first" sub="Each measure that misses its target, the one furthest off first. Tap one for the trucks behind it." />
        {issues.length ? (
          <ol className="grid gap-2">
            {issues.map((x, i) => (
              <li key={x.dive + x.title}>
                <button type="button" onClick={() => openDive(x.dive)} className="grid min-h-14 w-full cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-hair bg-field px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-signal-bright hover:bg-signal-tint">
                  <span className={'grid size-9 place-items-center rounded-full font-body text-[15px] font-bold text-white ' + (i === 0 ? 'bg-danger' : 'bg-chrome')}>{i + 1}</span>
                  <span className="min-w-0">
                    <b className="block text-[15.5px]">
                      {x.title}
                      {i === 0 && <span className={ui.tag + ' ml-2 bg-danger-soft align-middle text-danger'}>Top issue</span>}
                    </b>
                    <span className="text-[14px] text-muted">{x.line}</span>
                  </span>
                  <span className="text-[14px] font-semibold text-signal">See why →</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[15px] text-muted">Every measure is on target in these dates.</p>
        )}
      </section>

      {/* Carriers and customers */}
      <section aria-labelledby="mg-names" className="grid gap-4">
        <SectionTitle id="mg-names" title="Carriers and customers" sub="Tap a column name to sort the table. Tap a name to show only that one on the whole page. A warning mark and bold type show the worst value in a column when it misses the target." />
        <div className="grid gap-5">
          <NameTable title="Carriers" nameLabel="Carrier" rows={carriers} onPick={(n) => { setCarrier(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
          <NameTable title="Customers" nameLabel="Customer" rows={customers} onPick={(n) => { setCustomer(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        </div>
      </section>

      {/* Paper week vs this period */}
      {paper && (
        <section aria-labelledby="mg-paper" className="grid gap-4">
          <SectionTitle
            id="mg-paper"
            title="Paper week vs this period"
            sub={`The impact of going digital: the paper week before the app (${manualSample ? 'the sample week until your own is imported' : `${fmtRange({ from: paper.from, to: paper.to })}, ${paper.trucks} trucks`}) against ${fmtRange(range)}.`}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Minutes per truck"
              note="Each pair of bars is one measure: orange for the paper week, teal for this period. Shorter is better."
              legend={[['Paper week', PAPER], ['This period', DIGITAL]]}
              table={{ head: ['Measure', { label: 'Paper week', right: true }, { label: 'This period', right: true }], rows: paperRows.map((r) => [r.name, dur(r.paper), dur(r.now)]) }}
            >
              <Chart
                draw={(el) => TT.groupBars(el, { rows: paperRows.map((r) => ({ ...r, paper: r.paper ?? 0, now: r.now ?? 0 })), key: (r) => r.name, label: String, series: [{ field: 'paper', name: 'Paper week', color: PAPER }, { field: 'now', name: 'This period', color: DIGITAL }], fmt: (v) => `${Math.round(v)} min` })}
                deps={[paper, s]}
                label="Minutes per truck, paper week against this period"
              />
            </Panel>
            <Panel
              title="Share of trucks"
              note="Each pair of bars is one measure: orange for the paper week, teal for this period. Fewer trucks over 2 hours and more on time is better."
              legend={[['Paper week', PAPER], ['This period', DIGITAL]]}
              table={{ head: ['Measure', { label: 'Paper week', right: true }, { label: 'This period', right: true }], rows: paperPct.map((r) => [r.name, pct(r.paper), pct(r.now)]) }}
            >
              <Chart
                draw={(el) => TT.groupBars(el, { rows: paperPct.map((r) => ({ ...r, paper: r.paper ?? 0, now: r.now ?? 0 })), key: (r) => r.name, label: String, series: [{ field: 'paper', name: 'Paper week', color: PAPER }, { field: 'now', name: 'This period', color: DIGITAL }], fmt: (v) => `${Math.round(v * 100)}%` })}
                deps={[paper, s]}
                label="Share of trucks, paper week against this period"
              />
            </Panel>
          </div>
          <p className="text-[14px] text-muted">
            Waiting charges per truck: {usd(paper.chargePerTruck)} in the paper week, {usd(s.chargePerTruck)} in this period.
          </p>
        </section>
      )}

      {/* How the numbers are worked out */}
      <details className="group rounded-2xl border border-hair bg-panel shadow-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-display text-[20px] font-bold [&::-webkit-details-marker]:hidden">
          <Icon name="chevron" size={18} className="text-signal transition-transform duration-150 group-open:rotate-90" />
          How the numbers are worked out
        </summary>
        <div className="grid gap-3 border-t border-hair p-5">
          <div className="tt-tablebox overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Measure</th>
                  <th>How it's worked out</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {CARDS.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'normal', fontWeight: 600 }}>{c.label}</td>
                    <td style={{ whiteSpace: 'normal' }}>{c.how}</td>
                    <td style={{ whiteSpace: 'normal' }}>{c.targetText}</td>
                  </tr>
                ))}
                {STEPS.map((st) => (
                  <tr key={st.key}>
                    <td style={{ whiteSpace: 'normal', fontWeight: 600 }}>{st.label}</td>
                    <td style={{ whiteSpace: 'normal' }}>
                      {{
                        order: 'From the check-in being saved to Shipping marking the order ready.',
                        dock: 'From the order being ready to a dock assigned.',
                        work: 'From a dock assigned to the load inspection saved: getting ready, loading and inspection.',
                        leave: 'From passing inspection to leaving the gate.',
                      }[st.key]}
                    </td>
                    <td>{st.target} min or less</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="font-body text-[16.5px] font-bold">Assumptions to confirm with the client</h3>
          <ul className="grid gap-1 text-[14px] sm:grid-cols-2">
            <li>An appointment slot is {ASSUME.slotMin} minutes.</li>
            <li>
              Docks work {ASSUME.dockHours[0]} AM to {ASSUME.dockHours[1] - 12} PM.
            </li>
            <li>The yard has {ASSUME.yardSpaces} parking spaces, with a warning at {pct(ASSUME.yardFullWarn)} full.</li>
            <li>
              {ASSUME.freeHours} free hours, then ${ASSUME.ratePerHour} an hour in waiting charges.
            </li>
            <li>First-time pass target {pct(ASSUME.passTarget)}, on-time target {pct(ASSUME.onTimeTarget)}, staged target {pct(ASSUME.stagedTarget)}.</li>
            <li>The paper week {manualSample ? 'is the sample week until your own paper-log week is imported' : 'is the week imported from the paper logs'}.</li>
          </ul>
        </div>
      </details>
    </div>
  )
}
