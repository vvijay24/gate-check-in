import { useEffect, useMemo, useRef, useState } from 'react'
import { TT } from '../turnaround/charts'
import { computeBaselineMetrics, computeImpact, computeStages, computeSummary, computeVisitMetrics } from '../turnaround/metrics'
import { DETENTION, DOCK_TARGET, G2G_TARGET, ON_TIME_WINDOW, STAGE_TARGETS } from '../turnaround/targets'
import { parseManualWeek, visitsInRange } from '../turnaround/visits'
import { deepDive } from '../turnaround/deepDives'
import { dayKey, shiftDate } from '../time'

// The truck turnaround Overview (design/turnaround-kit): a hero with the week's takeaway, six KPI cards
// that open detail views, the impact of going digital (manual week vs digital week), where the time
// goes, and arrivals and volume. Every number comes from the kit's metrics.js, fed from the saved visits.
// Where there's no data yet, the kit's sample data stands in, clearly labeled.

const MANUAL_KEY = 'manual-week'
const PRESETS = [7, 14, 30]
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayLabel = (key) => {
  const d = new Date(`${key}T00:00`)
  return `${WEEKDAY[d.getDay()]} ${d.getDate()}`
}
const longDate = (key) => new Date(`${key}T00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`
const F = () => TT.FMT

// Draws a kit chart into a div, and again when the div's width changes or `deps` change.
function Chart({ draw, deps, className = 'tt-chart', label }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let w = el.clientWidth
    draw(el)
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth
        draw(el)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return <div ref={ref} className={className} role="img" aria-label={label} />
}

function Spark({ rows, value, color, id, isBad }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || rows.length < 2) return
    const draw = () => TT.spark(el, { rows, key: (r) => r.group, value, color, id, isBad })
    let w = el.clientWidth
    draw()
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth
        draw()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows, value, color, id, isBad])
  return <span ref={ref} className="tt-spark" aria-hidden="true" />
}

// The six KPIs: how each reads its number from a summary row and from a truck, its target and colours.
// `src`: 'timed' (fully timed trucks) or 'count' (every truck checked in).
const KPIS = [
  {
    id: 'g2g',
    label: 'Gate-to-gate turnaround',
    accent: 'navy',
    src: 'timed',
    group: (s) => s.avg_g2g,
    truck: (v) => v.g2g_min,
    fmt: (v) => F().min(v),
    unit: 'min average',
    band: [G2G_TARGET.min, G2G_TARGET.max],
    bad: (v) => v > G2G_TARGET.max,
    target: `Target ${G2G_TARGET.min}–${G2G_TARGET.max} min`,
    about: `Minutes from gate check-in to gate checkout: check-in, dock assignment, pre-loading, loading or unloading, inspection and checkout. Target ${G2G_TARGET.min}–${G2G_TARGET.max} min.`,
    table: 'Slowest gate-to-gate first.',
    sort: (a, b) => b.g2g_min - a.g2g_min,
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  },
  {
    id: 'dock',
    label: 'Dock handling time',
    accent: 'yolk',
    src: 'timed',
    group: (s) => s.avg_dock,
    truck: (v) => v.dock_min,
    fmt: (v) => F().min(v),
    unit: 'min average',
    band: [DOCK_TARGET.min, DOCK_TARGET.max],
    bad: (v) => v > DOCK_TARGET.max,
    target: `Target ${DOCK_TARGET.min}–${DOCK_TARGET.max} min`,
    about: `Minutes the truck spends at the door: pre-loading, loading or unloading, and inspection. Target ${DOCK_TARGET.min}–${DOCK_TARGET.max} min.`,
    table: 'Longest time at the door first.',
    sort: (a, b) => b.dock_min - a.dock_min,
    icon: <><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8" /><path d="M7 17h10" /></>,
  },
  {
    id: 'ontime',
    label: 'On-time arrivals',
    accent: 'teal',
    src: 'count',
    group: (s) => s.on_time_rate,
    truck: (v) => v.arrival_delta_min,
    fmt: (v) => F().pct(v),
    truckFmt: (v) => `${v > 0 ? '+' : ''}${F().min(v)} min`,
    unit: 'of trucks',
    bad: () => false,
    target: `On time = within ±${ON_TIME_WINDOW} min of the appointment`,
    about: `Arrival time compared with the appointment time. On time = within ±${ON_TIME_WINDOW} min.`,
    table: 'Latest arrivals first (minutes after appointment; negative = early).',
    sort: (a, b) => b.arrival_delta_min - a.arrival_delta_min,
    icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></>,
  },
  {
    id: 'trucks',
    label: 'Trucks handled',
    accent: 'navy-2',
    src: 'count',
    group: (s) => s.trucks,
    truck: (v) => v.arrival_delta_min,
    fmt: (v) => F().int(v),
    truckFmt: (v) => `${v > 0 ? '+' : ''}${F().min(v)} min`,
    unit: 'trucks',
    bad: () => false,
    target: 'Deliveries, pickups and drop trailers',
    about: 'Every truck checked in at the gate shack: deliveries (unloading), pickups (loading) and drop trailers.',
    table: 'In arrival order.',
    sort: (a, b) => (a.day + a.arrived < b.day + b.arrived ? -1 : 1),
    icon: <><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>,
  },
  {
    id: 'within',
    label: 'Within turnaround target',
    accent: 'teal',
    src: 'timed',
    group: (s) => s.within_target_rate,
    truck: (v) => v.g2g_min,
    fmt: (v) => F().pct(v),
    truckFmt: (v) => `${F().min(v)} min`,
    unit: 'of trucks',
    bad: () => false,
    target: `Gate to gate ≤ ${G2G_TARGET.max} min`,
    about: `Share of trucks whose gate-to-gate time stayed at or under ${G2G_TARGET.max} min.`,
    table: 'Slowest gate-to-gate first.',
    sort: (a, b) => b.g2g_min - a.g2g_min,
    icon: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  },
  {
    id: 'detention',
    label: 'Detention risk',
    accent: 'red',
    src: 'timed',
    group: (s) => s.detention_usd,
    truck: (v) => v.detention_usd,
    fmt: (v) => F().usd(v),
    unit: 'in this range',
    bad: (v) => v > 0,
    target: `${DETENTION.freeMin / 60} h free time, then $${DETENTION.ratePerHour}/h`,
    about: `Estimate of what carriers could bill when we hold their trucks: the clock starts at the later of appointment and arrival, ${DETENTION.freeMin / 60} h free, then $${DETENTION.ratePerHour}/h. Trucks more than ${DETENTION.lateGraceMin} min late aren't charged.`,
    table: 'Largest estimated charge first.',
    sort: (a, b) => b.detention_usd - a.detention_usd,
    icon: <><path d="M12 3v18" /><path d="M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.7 4.5 3.2 4.5 1.6 4.5 3.3-2 3-4.5 3-4.5-1.3-4.5-3" /></>,
  },
]

function KpiCard({ k, all, days, onOpen }) {
  const v = k.group(all)
  const isBad = k.bad(v)
  const pill =
    k.id === 'detention'
      ? v > 0
        ? ['bad', '● Money at risk']
        : ['ok', '● No detention']
      : k.band
        ? isBad
          ? ['bad', '● Over target']
          : ['ok', '● On target']
        : k.id === 'within'
          ? v >= 0.9
            ? ['ok', '● On target']
            : ['bad', '● Below 90%']
          : null
  return (
    <button type="button" className={`tt-card accent-${k.accent}`} onClick={() => onOpen(k.id)}>
      <span className="tt-card-head">
        <span className="tt-ico">
          <svg viewBox="0 0 24 24">{k.icon}</svg>
        </span>
        <span className="tt-card-label">{k.label}</span>
      </span>
      <span className="tt-big">
        <b className={isBad ? 'is-bad' : undefined}>{Number.isFinite(v) ? k.fmt(v) : '—'}</b>
        <span className="tt-unit">{k.unit}</span>
      </span>
      <span className="tt-meta">
        {pill && <span className={`tt-pill ${pill[0]}`}>{pill[1]}</span>}
        <span className="tt-note">{k.target}</span>
      </span>
      <Spark rows={days} value={k.group} color={TT.C[{ 'navy-2': 'navy2' }[k.accent] ?? k.accent]} id={k.id} isBad={(r) => k.bad(k.group(r))} />
      <span className="tt-more">See details →</span>
    </button>
  )
}

// A clearly labeled "Sample data" note for a section running on the kit's sample.
function SampleTag({ children }) {
  return (
    <p className="tt-note" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500, color: 'var(--p-amber)' }}>
      ● Sample data: {children}
    </p>
  )
}

function Section({ eyebrow, title, children }) {
  return (
    <div className="tt-section">
      <div className="tt-section-head">
        <span className="tt-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <div className="tt-grid">{children}</div>
    </div>
  )
}

function Panel({ title, note, legend, wide, warm, children }) {
  return (
    <div className={'tt-panel' + (wide ? ' tt-wide' : '') + (warm ? ' warm' : '')}>
      <h3>{title}</h3>
      {note && <p className="tt-note">{note}</p>}
      {legend && <div className="tt-legend">{legend}</div>}
      {children}
    </div>
  )
}
const Key = ({ color, children }) => (
  <span>
    <i style={{ background: color }} />
    {children}
  </span>
)

// One detail view per KPI: pill tabs, a hero with the number, a mix of charts chosen for that metric
// (turnaround/deepDives.js, in the Live yard colors), and the trucks behind the number.
function Detail({ id, setId, data, rangeText }) {
  const k = KPIS.find((x) => x.id === id)
  const src = k.src === 'timed' ? data.timed : data.count
  const all = src.summary[0]
  const v = k.group(all)
  const trucks = [...src.visits].sort(k.sort)
  const tfmt = k.truckFmt ?? k.fmt
  const panels = deepDive(id, { visits: src.visits, summary: src.summary, labels: { day: dayLabel, longDay: longDate, hour: hourLabel } })
  return (
    <div className="tt">
      <div className="tt-top" style={{ '--accent': `var(--p-${k.accent})` }}>
        <button type="button" className="tt-back" onClick={() => setId(null)}>
          ← Overview
        </button>
        {KPIS.map((x) => (
          <button key={x.id} type="button" className={`tt-tab accent-${x.accent}`} aria-pressed={x.id === id} onClick={() => setId(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <header className={`tt-dhero accent-${k.accent}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="tt-eyebrow">Detail · {rangeText}</span>
          <h1>{k.label}</h1>
          <p className="tt-note">{k.about}</p>
          {data.sample && <p className="tt-note" style={{ color: 'var(--p-gold-1)' }}>● Sample data until real visits are fully timed</p>}
        </div>
        <span className="tt-big">
          <b>{Number.isFinite(v) ? k.fmt(v) : '—'}</b>
          <span className="tt-unit">{k.unit}</span>
        </span>
      </header>
      <div className="tt-grid dive-grid" style={{ '--accent': `var(--p-${k.accent})` }}>
        {panels.map((p) => (
          <Panel key={id + p.key} title={p.title} note={p.note} wide={p.wide} legend={p.legend.map(([name, c]) => <Key key={name} color={c}>{name}</Key>)}>
            <Chart label={p.title} deps={[id, src]} draw={p.draw} />
          </Panel>
        ))}
        <Panel title="Trucks behind this number" note={k.table} wide>
          <div className="tt-tablebox">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Trailer</th>
                  <th>Carrier</th>
                  <th className="hide-narrow">Type</th>
                  <th className="num">Appt</th>
                  <th className="num">Arrived</th>
                  {k.src === 'timed' && <th className="num">Dock min</th>}
                  {k.src === 'timed' && <th className="num">Gate to gate</th>}
                  <th className="num">{k.id === 'detention' ? 'Detention' : k.src === 'timed' ? 'Status' : 'vs appt'}</th>
                </tr>
              </thead>
              <tbody>
                {trucks.slice(0, 200).map((t) => (
                  <tr key={t.visit_id}>
                    <td>{dayLabel(t.day)}</td>
                    <td>{t.trailer ?? t.visit_id}</td>
                    <td>{t.carrier}</td>
                    <td className="hide-narrow">{t.visit_type}</td>
                    <td className="num">{t.appt}</td>
                    <td className="num">{t.arrived}</td>
                    {k.src === 'timed' && <td className={'num' + (t.dock_min > DOCK_TARGET.max ? ' bad' : '')}>{F().min(t.dock_min)}</td>}
                    {k.src === 'timed' && <td className={'num' + (t.g2g_min > G2G_TARGET.max ? ' bad' : '')}>{F().min(t.g2g_min)}</td>}
                    <td className={'num' + ((k.id === 'detention' && t.detention_usd > 0) || (k.src !== 'timed' && t.arrival_status === 'Late') ? ' bad' : '')}>
                      {k.id === 'detention' ? F().usd(t.detention_usd) : k.src === 'timed' ? (t.g2g_min > G2G_TARGET.max ? 'Over' : 'Within') : tfmt(t.arrival_delta_min)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}

export default function Overview({ entries, sampleCount, onLoadSample, onRemoveSample }) {
  const today = dayKey(new Date())
  const [days, setDays] = useState(7)
  const [detail, setDetail] = useState(null)
  const [manual, setManual] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(MANUAL_KEY)) ?? null
    } catch {
      return null
    }
  })
  const [importError, setImportError] = useState('')
  const fileRef = useRef(null)
  // The kit's sample data, loaded only when a section needs it.
  const [sample, setSample] = useState(null)
  const from = shiftDate(today, -(days - 1))
  const real = useMemo(() => visitsInRange(entries, from, today), [entries, from, today])
  const useSampleVisits = real.timedRows.length === 0
  const needSample = useSampleVisits || !manual
  useEffect(() => {
    if (!needSample || sample) return
    Promise.all([import('../turnaround/sample-truck-visits.json'), import('../turnaround/sample-manual-week.json')]).then(([v, m]) =>
      setSample({ visits: v.default, manual: m.default }),
    )
  }, [needSample, sample])

  // Every number below comes from the kit's metrics.js.
  const data = useMemo(() => {
    if (needSample && !sample) return null
    const timedRows = useSampleVisits ? sample.visits : real.timedRows
    const countRows = useSampleVisits ? sample.visits : real.countRows
    const timedVisits = computeVisitMetrics(timedRows)
    const countVisits = computeVisitMetrics(countRows)
    const rowOf = new Map(timedRows.concat(countRows).map((r) => [r.visit_id, r]))
    const withTrailer = (vs) => vs.map((v) => ({ ...v, trailer: rowOf.get(v.visit_id)?.trailer, door: rowOf.get(v.visit_id)?.door }))
    // The impact compares a manual week with the latest 7 days of the digital data.
    const lastDay = timedRows.reduce((m, r) => (r.day > m ? r.day : m), '')
    const weekStart = shiftDate(lastDay, -6)
    const digitalWeek = computeVisitMetrics(timedRows.filter((r) => r.day >= weekStart && r.day <= lastDay))
    const manualRows = manual ?? sample.manual
    return {
      sample: useSampleVisits,
      manualSample: !manual,
      timed: { visits: withTrailer(timedVisits), summary: computeSummary(timedVisits) },
      count: { visits: withTrailer(countVisits), summary: computeSummary(countVisits) },
      stages: computeStages(timedVisits),
      impact: digitalWeek.length ? computeImpact(computeBaselineMetrics(manualRows), digitalWeek) : [],
      manualCount: manualRows.length,
      drops: useSampleVisits ? null : real.drops,
      fullyTimed: real.timedRows.length,
      checkedIn: real.all.length,
    }
  }, [needSample, sample, useSampleVisits, real, manual])

  const importManual = async (ev) => {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setImportError('')
    try {
      const rows = parseManualWeek(await file.text())
      localStorage.setItem(MANUAL_KEY, JSON.stringify(rows))
      setManual(rows)
    } catch (err) {
      setImportError(err.message)
    }
  }
  const removeManual = () => {
    if (!window.confirm('Remove the imported manual week? The sample manual week will stand in again.')) return
    localStorage.removeItem(MANUAL_KEY)
    setManual(null)
  }

  const rangeText = days === 7 ? 'Last 7 days' : `Last ${days} days`
  const controls = (
    <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <div className="tt-top" role="group" aria-label="Date range" style={{ '--accent': 'var(--p-navy)' }}>
        {PRESETS.map((n) => (
          <button key={n} type="button" className="tt-tab" aria-pressed={days === n} onClick={() => setDays(n)}>
            Last {n} days
          </button>
        ))}
      </div>
      <span style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="tt-tab" onClick={() => fileRef.current?.click()}>
          Import manual week (CSV or JSON)
        </button>
        {manual && (
          <button type="button" className="tt-tab" onClick={removeManual}>
            Remove imported week ({manual.length})
          </button>
        )}
        {sampleCount > 0 ? (
          <button type="button" className="tt-tab" onClick={() => window.confirm(`Remove the ${sampleCount} sample visits? Your real entries are kept.`) && onRemoveSample()}>
            Remove sample visits ({sampleCount})
          </button>
        ) : (
          <button type="button" className="tt-tab" onClick={onLoadSample}>
            Load sample visits
          </button>
        )}
        <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" onChange={importManual} hidden />
      </span>
      {importError && (
        <p className="tt-note" role="alert" style={{ color: 'var(--p-red)', width: '100%' }}>
          Couldn't import that file: {importError}
        </p>
      )}
    </div>
  )

  if (!data) return <div className="tt">{controls}<p className="tt-note">Loading…</p></div>
  if (detail) return <Detail id={detail} setId={setDetail} data={data} rangeText={data.sample ? 'Sample week' : rangeText} />

  const { timed, count, stages, impact } = data
  const all = timed.summary[0]
  const allCount = count.summary[0]
  const daysTimed = timed.summary.filter((s) => s.group_kind === 'day')
  const daysCount = count.summary.filter((s) => s.group_kind === 'day')
  const imp = Object.fromEntries(impact.filter((r) => r.kind === 'kpi').map((r) => [r.key, r]))
  const impStages = impact.filter((r) => r.kind === 'stage')
  const impWeek = impact.filter((r) => r.kind === 'weekday')
  const impWeekDet = impact.filter((r) => r.kind === 'weekday_detention')
  const slowStage = [...stages].sort((a, b) => b.avg_min / b.target_hi - a.avg_min / a.target_hi)[0]
  const slowDay = [...daysTimed].sort((a, b) => b.avg_g2g - a.avg_g2g)[0]
  const firstDay = daysCount[0]?.group
  const lastDay = daysCount[daysCount.length - 1]?.group
  const stageColor = (i) => TT.C.stages[i]

  // One sentence: minutes saved, detention avoided, trucks over the limit, slowest stage, slowest day.
  const take = [
    imp.g2g && imp.g2g.saved > 0
      ? `Since going digital, trucks leave ${F().min(imp.g2g.saved)} min sooner (${F().min(imp.g2g.before)} → ${F().min(imp.g2g.after)} min) and about ${F().usd(imp.detention.saved)} a week of detention is avoided.`
      : imp.g2g
        ? `Gate to gate averages ${F().min(imp.g2g.after)} min against ${F().min(imp.g2g.before)} min in the manual week.`
        : '',
    `${all.over_count} of ${all.trucks} trucks went over ${G2G_TARGET.max} min.`,
    slowStage ? `The slowest stage against its target is ${slowStage.stage.toLowerCase()} (${F().min1(slowStage.avg_min)} min vs ${slowStage.target_lo}–${slowStage.target_hi}).` : '',
    slowDay ? `The slowest day was ${longDate(slowDay.group)} (${F().min(slowDay.avg_g2g)} min).` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="tt">
      {controls}
      <header className="tt-hero">
        <span className="tt-eyebrow">Gate to gate · {data.sample ? 'Sample week' : rangeText}</span>
        <h1>Truck turnaround overview</h1>
        <p className="tt-hero-sub">
          {firstDay && lastDay ? `${longDate(firstDay)} – ${longDate(lastDay)}` : rangeText} · every truck measured from gate check-in to gate checkout, against its appointment
          {!data.sample && ` · ${data.fullyTimed} of ${data.checkedIn} trucks fully timed${data.drops ? ` (${data.drops} drop trailer${data.drops === 1 ? '' : 's'} have no dock stages)` : ''}`}
        </p>
        {data.sample && <p className="tt-hero-sub" style={{ color: 'var(--p-yolk)', fontWeight: 500 }}>● Sample data: no fully timed visits in this range yet. Real numbers appear as trucks go through every step.</p>}
        <p className="tt-take">{take}</p>
      </header>

      <div className="tt-cards">
        {KPIS.map((k) => (
          <KpiCard key={k.id} k={k} all={k.src === 'timed' ? all : allCount} days={(k.src === 'timed' ? daysTimed : daysCount).slice(-7)} onOpen={setDetail} />
        ))}
      </div>

      {/* Impact of going digital */}
      <div className="tt-section">
        <div className="tt-ihero">
          <span className="tt-eyebrow">Impact of going digital</span>
          <h2>From paper and phone calls to one shared screen</h2>
          <p className="tt-ihero-sub">
            Manual week ({data.manualSample ? 'sample' : 'imported'}, {data.manualCount} trucks) vs digital week (latest 7 days{data.sample ? ', sample' : ''}).
          </p>
        </div>
        {data.manualSample && <SampleTag>the manual week is the kit's sample until you import your paper-log week.</SampleTag>}
        {impact.length === 0 ? (
          <p className="tt-note">Not enough data yet: no fully timed trucks in the latest 7 days.</p>
        ) : (
          <>
            <div className="tt-itiles">
              <div className="tt-itile">
                <span className="tt-itile-label">Faster per truck</span>
                <span className="tt-ibig">
                  <b>{F().min(imp.g2g.saved)}</b>
                  <span className="tt-unit">min saved</span>
                </span>
                <span className="tt-note">
                  {F().min(imp.g2g.before)} → {F().min(imp.g2g.after)} min gate to gate ({F().spct(imp.g2g.change_pct)})
                </span>
              </div>
              <div className="tt-itile hot">
                <span className="tt-itile-label">Detention avoided this week</span>
                <span className="tt-ibig">
                  <b>{F().usd(imp.detention.saved)}</b>
                </span>
                <span className="tt-note">About {F().usd(imp.detention_year.saved)} a year at this pace</span>
              </div>
              <div className="tt-itile">
                <span className="tt-itile-label">Shorter wait for a dock</span>
                <span className="tt-ibig">
                  <b>{F().min(imp.dock_wait.saved)}</b>
                  <span className="tt-unit">min saved</span>
                </span>
                <span className="tt-note">
                  {F().min(imp.dock_wait.before)} → {F().min(imp.dock_wait.after)} min per truck
                </span>
              </div>
              <div className="tt-itile">
                <span className="tt-itile-label">Trucks within target</span>
                <span className="tt-ibig">
                  <b>{F().pct(imp.within.after)}</b>
                </span>
                <span className="tt-note">Up from {F().pct(imp.within.before)}</span>
              </div>
              <div className="tt-itile">
                <span className="tt-itile-label">Phone calls no longer needed</span>
                <span className="tt-ibig">
                  <b>{F().int(imp.phone_calls.saved)}</b>
                  <span className="tt-unit">calls</span>
                </span>
                <span className="tt-note">
                  plus {F().int(imp.paper_handoffs.saved)} paper handoffs and {F().min(imp.yard_search.saved)} h searching the yard
                </span>
              </div>
              <div className="tt-itile">
                <span className="tt-itile-label">Truck hours freed up</span>
                <span className="tt-ibig">
                  <b>{F().min(imp.truck_hours.saved)}</b>
                  <span className="tt-unit">hours</span>
                </span>
                <span className="tt-note">
                  {F().min(imp.truck_hours.before)} → {F().min(imp.truck_hours.after)} truck hours on site
                </span>
              </div>
            </div>
            <div className="tt-grid">
              <Panel
                title="Every stage, manual vs digital"
                note="Average minutes per truck. The biggest gains are in the handoffs: check-in, waiting for a dock, finding the truck before loading, and paperwork at inspection and checkout."
                legend={
                  <>
                    <Key color="var(--chart-muted)">Manual week</Key>
                    <Key color="var(--p-teal)">Digital week</Key>
                  </>
                }
                wide
                warm
              >
                <Chart
                  label="Each stage, manual week vs digital week"
                  deps={[impStages]}
                  draw={(el) => TT.dumbbell(el, { rows: impStages, key: (r) => r.key, label: (r) => r.label, before: (r) => r.before, after: (r) => r.after, unit: ' min' })}
                />
              </Panel>
              <Panel
                title="Gate to gate by weekday"
                note={`Average minutes per truck. Red dashed line = the ${G2G_TARGET.max}-minute maximum.`}
                legend={
                  <>
                    <Key color="var(--chart-muted)">Manual week</Key>
                    <Key color="var(--p-navy)">Digital week</Key>
                  </>
                }
              >
                <Chart
                  label="Gate to gate by weekday, manual vs digital"
                  deps={[impWeek]}
                  draw={(el) =>
                    TT.groupBars(el, {
                      rows: impWeek,
                      key: (r) => r.key,
                      fmt: F().min,
                      ref: G2G_TARGET.max,
                      series: [
                        { field: 'before', name: 'Manual', color: TT.C.muted },
                        { field: 'after', name: 'Digital', color: TT.C.navy },
                      ],
                    })
                  }
                />
              </Panel>
              <Panel
                title="Detention by weekday"
                note="Estimated carrier charges, $ per day."
                legend={
                  <>
                    <Key color="var(--chart-muted)">Manual week</Key>
                    <Key color="var(--p-red)">Digital week</Key>
                  </>
                }
              >
                <Chart
                  label="Detention by weekday, manual vs digital"
                  deps={[impWeekDet]}
                  draw={(el) =>
                    TT.groupBars(el, {
                      rows: impWeekDet,
                      key: (r) => r.key,
                      fmt: F().usd,
                      series: [
                        { field: 'before', name: 'Manual', color: TT.C.muted },
                        { field: 'after', name: 'Digital', color: TT.C.red },
                      ],
                    })
                  }
                />
              </Panel>
            </div>
          </>
        )}
      </div>

      {/* Where the time goes */}
      <Section eyebrow="Process" title="Where the time goes">
        {data.sample && <SampleTag>no fully timed visits in this range yet.</SampleTag>}
        <Panel
          title="Average minutes per stage, by day"
          note={`Each bar is one day's average truck, stacked in the order a truck moves through the plant. The red dashed line is the gate-to-gate maximum.`}
          legend={
            <>
              <span className="grp">Gate &amp; yard</span>
              <Key color="var(--p-sky)">Gate check-in</Key>
              <Key color="var(--p-navy)">Dock assignment</Key>
              <Key color="var(--p-navy-2)">Gate checkout</Key>
              <span className="grp">At the door</span>
              <Key color="var(--p-gold-1)">Pre-loading</Key>
              <Key color="var(--p-yolk)">Loading / unloading</Key>
              <Key color="var(--p-amber)">Inspection</Key>
            </>
          }
          wide
        >
          <Chart
            label="Average minutes per stage by day"
            deps={[daysTimed]}
            draw={(el) =>
              TT.stackBars(el, {
                rows: daysTimed,
                key: (r) => r.group,
                label: dayLabel,
                fmt: F().min,
                ref: G2G_TARGET.max,
                refLabel: `Max ${G2G_TARGET.max} min`,
                series: ['avg_gate_in', 'avg_assign', 'avg_preload', 'avg_load', 'avg_inspection', 'avg_checkout'].map((field, i) => ({ field, name: STAGE_TARGETS[i].label, color: stageColor(i) })),
                tipHead: (r) => `${longDate(r.group)} · ${r.trucks} trucks`,
              })
            }
          />
        </Panel>
        <Panel title="Each stage against its target" note="Bar = average minutes in this range. Green band = target range. Values in red are past the top of the range." warm>
          <Chart
            label="Each stage against its target"
            deps={[stages]}
            draw={(el) =>
              TT.hbars(el, {
                rows: stages.map((s, i) => ({ ...s, i })),
                key: (r) => r.stage,
                label: (r) => r.stage,
                value: (r) => r.avg_min,
                fmt: (v) => F().min1(v) + ' min',
                band: (r) => [r.target_lo, r.target_hi],
                color: (r) => stageColor(r.i),
                isBad: (r) => r.avg_min > r.target_hi,
                tip: (r) => [r.stage, [[null, 'Average', F().min1(r.avg_min) + ' min'], [null, 'Target', `${r.target_lo}–${r.target_hi} min`], [null, 'Within', F().pct(r.within_rate)]]],
              })
            }
          />
        </Panel>
      </Section>

      {/* Arrivals and volume */}
      <Section eyebrow="Gate" title="Arrivals and volume">
        {data.sample && <SampleTag>no visits in this range yet.</SampleTag>}
        <Panel
          title="Trucks per day by visit type"
          legend={
            <>
              <Key color="var(--p-navy)">Delivery</Key>
              <Key color="var(--p-yolk)">Pickup</Key>
              <Key color="var(--p-teal)">Drop trailer</Key>
            </>
          }
          wide
        >
          <Chart
            label="Trucks per day by visit type"
            deps={[daysCount]}
            draw={(el) =>
              TT.stackBars(el, {
                rows: daysCount,
                key: (r) => r.group,
                label: dayLabel,
                fmt: F().int,
                series: [
                  { field: 'delivery', name: 'Delivery', color: TT.C.types[0] },
                  { field: 'pickup', name: 'Pickup', color: TT.C.types[1] },
                  { field: 'drop', name: 'Drop trailer', color: TT.C.types[2] },
                ],
                tipHead: (r) => `${longDate(r.group)} · ${r.trucks} trucks`,
              })
            }
          />
        </Panel>
        <Panel
          title="Arrival vs appointment"
          legend={
            <>
              <Key color="var(--p-teal)">Early</Key>
              <Key color="var(--p-navy)">On time</Key>
              <Key color="var(--p-red)">Late</Key>
            </>
          }
        >
          <Chart
            label="Arrival vs appointment"
            deps={[allCount]}
            draw={(el) =>
              TT.donut(el, {
                parts: [
                  { name: 'Early', value: allCount.early, color: TT.C.teal },
                  { name: 'On time', value: allCount.on_time, color: TT.C.navy },
                  { name: 'Late', value: allCount.late, color: TT.C.red },
                ],
                center: F().pct(allCount.on_time_rate),
                centerLabel: 'on time',
              })
            }
          />
        </Panel>
        <Panel title="Arrivals by appointment hour" note={`Bar = trucks per hour, coloured by their average gate to gate (red = over ${G2G_TARGET.max} min).`}>
          <Chart
            label="Arrivals by appointment hour"
            deps={[count, timed]}
            draw={(el) => {
              const speed = new Map(timed.summary.filter((s) => s.group_kind === 'hour').map((s) => [s.group, s.avg_g2g]))
              const rows = count.summary.filter((s) => s.group_kind === 'hour').sort((a, b) => a.group - b.group)
              TT.vbars(el, {
                rows,
                key: (r) => r.group,
                label: hourLabel,
                value: (r) => r.trucks,
                fmt: F().int,
                color: (r) => ((speed.get(r.group) ?? 0) > G2G_TARGET.max ? TT.C.red : TT.C.navy),
                tip: (r) => [hourLabel(r.group), [[null, 'Trucks', F().int(r.trucks)], [null, 'Avg gate to gate', speed.has(r.group) ? F().min(speed.get(r.group)) + ' min' : '—']]],
              })
            }}
          />
        </Panel>
        <Panel title="Does arriving late slow the whole visit?" note={`One dot per truck. Green band = on time. Above the red line = over the gate-to-gate maximum.`} wide>
          <Chart
            label="Minutes vs appointment against gate to gate"
            deps={[timed]}
            draw={(el) =>
              TT.scatter(el, {
                rows: timed.visits,
                x: (v) => v.arrival_delta_min,
                y: (v) => v.g2g_min,
                color: (v) => (v.g2g_min > G2G_TARGET.max ? TT.C.red : TT.C.navy),
                xBand: [-ON_TIME_WINDOW, ON_TIME_WINDOW],
                yRef: G2G_TARGET.max,
                xTitle: 'Minutes vs appointment',
                tip: (v) => [`${v.carrier} · ${dayLabel(v.day)}`, [[null, 'Vs appointment', `${v.arrival_delta_min > 0 ? '+' : ''}${v.arrival_delta_min} min`], [null, 'Gate to gate', F().min(v.g2g_min) + ' min']]],
              })
            }
          />
        </Panel>
      </Section>
    </div>
  )
}
