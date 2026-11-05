import { useEffect, useMemo, useRef, useState } from 'react'
import '../../turnaround/scope.css'
import { TT } from '../../turnaround/charts'
import { computeBaselineMetrics, computeImpact, computeVisitMetrics } from '../../turnaround/metrics'
import { G2G_TARGET } from '../../turnaround/targets'
import { parseManualWeek, visitsInRange } from '../../turnaround/visits'
import { IMPACT_DIVES, STAFF_MINUTES, impactDive } from '../../turnaround/impactDives'
import { dayKey, shiftDate } from '../../time'
import { Card, Info, Tile } from './ui'

// Manual vs Digital: a week from the old paper log (imported, or the kit's sample until then) against
// the latest 7 days in the app: minutes saved per truck, detention avoided, waits for a dock, trucks
// within target, phone calls and paper handoffs no longer needed, truck hours freed. Each figure opens
// a deep dive (turnaround/impactDives.js). The numbers are the turnaround kit's (metrics.js, METRICS.md).

const MANUAL_KEY = 'manual-week'
const STAFF_KEY = 'impact-staff-minutes'
const F = () => TT.FMT

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Kept in memory for this visit.
  }
}

// Draws a kit chart into a div, again when the div's width or `deps` change.
function Chart({ draw, deps, label, className = 'tt-chart' }) {
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

const Key = ({ color, children }) => (
  <span>
    <i style={{ background: color }} />
    {children}
  </span>
)

// The data: the manual week (imported or sample) and the latest 7 days of fully timed visits.
function useDigitalData(entries) {
  const [manual, setManualState] = useState(() => read(MANUAL_KEY, null))
  const setManual = (rows) => {
    setManualState(rows)
    write(MANUAL_KEY, rows)
  }
  const [sample, setSample] = useState(null)
  const today = dayKey(new Date())
  const real = useMemo(() => visitsInRange(entries, shiftDate(today, -27), today), [entries, today])
  const useSampleVisits = real.timedRows.length === 0
  const needSample = useSampleVisits || !manual
  useEffect(() => {
    if (!needSample || sample) return
    Promise.all([import('../../turnaround/sample-truck-visits.json'), import('../../turnaround/sample-manual-week.json')]).then(([v, m]) =>
      setSample({ visits: v.default, manual: m.default }),
    )
  }, [needSample, sample])

  const data = useMemo(() => {
    if (needSample && !sample) return null
    const timedRows = useSampleVisits ? sample.visits : real.timedRows
    const rowOf = new Map(timedRows.map((r) => [r.visit_id, r]))
    const lastDay = timedRows.reduce((m, r) => (r.day > m ? r.day : m), '')
    const weekStart = shiftDate(lastDay, -6)
    const digitalWeek = computeVisitMetrics(timedRows.filter((r) => r.day >= weekStart && r.day <= lastDay))
    const manualRows = manual ?? sample.manual
    const extra = (r) => ({ carrier: r?.carrier, door: r?.door ?? null, hour: Number(String(r?.arrived ?? '').slice(0, 2)) })
    const man = computeBaselineMetrics(manualRows).map((v, i) => ({ ...v, ...extra(manualRows[i]) }))
    const dig = digitalWeek.map((v) => ({ ...v, ...extra(rowOf.get(v.visit_id)) }))
    const impact = digitalWeek.length ? computeImpact(man, digitalWeek) : []
    return {
      sampleVisits: useSampleVisits,
      manualSample: !manual,
      manualCount: manualRows.length,
      impact,
      ctx: { man, dig, imp: Object.fromEntries(impact.filter((r) => r.kind === 'kpi').map((r) => [r.key, r])) },
    }
  }, [needSample, sample, useSampleVisits, real, manual])
  return { data, manual, setManual }
}

// A tile that opens its deep dive.
function DiveTile({ id, label, value, unit, note, hot, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className={
        'group/tile relative flex min-w-0 cursor-pointer flex-col rounded-xl bg-panel px-4 py-3.5 text-left shadow-card transition-colors hover:bg-field ' +
        (hot ? 'ring-1 ring-warn-line/40' : '')
      }
    >
      <i aria-hidden="true" className={'absolute inset-x-0 top-0 h-[3px] rounded-t-xl ' + (hot ? 'bg-warn' : 'bg-[#0e8a7e]')} />
      <span className="eyebrow text-muted">{label}</span>
      <span className="mt-1.5 flex items-baseline gap-1.5">
        <b className={'figure text-[28px] leading-none font-semibold ' + (hot ? 'text-warn-line' : 'text-[#0e8a7e] dark:text-[#2ec4b2]')}>{value}</b>
        {unit && <span className="text-[12.5px] text-muted">{unit}</span>}
      </span>
      {note && <span className="mt-1.5 text-[12.5px] leading-snug text-muted">{note}</span>}
      <span className="mt-auto pt-2 text-[12.5px] font-semibold text-signal-line">See details →</span>
    </button>
  )
}

// One deep dive: tabs to the others, the headline, four figures and the dive's charts.
function DiveView({ id, setId, data, staff, setStaff }) {
  const k = IMPACT_DIVES.find((x) => x.id === id)
  const d = impactDive(id, { ...data.ctx, staff })
  const { man, dig } = data.ctx
  const legendOf = (p) => p.legend && <div className="tt-legend">{p.legend.map(([name, c]) => <Key key={name} color={c}>{name}</Key>)}</div>
  const minBox = (key, label) => (
    <label className="flex items-center gap-2 text-[13px]">
      {label}
      <input
        type="number"
        min="0"
        max="30"
        step="0.5"
        value={staff[key]}
        onChange={(e) => setStaff({ ...staff, [key]: Math.max(0, Number(e.target.value) || 0) })}
        className="min-h-9 w-20 rounded-md border border-edge bg-panel px-2 text-ink"
      />
      min
    </label>
  )
  return (
    <div className="tt space-y-5">
      <div className="no-print flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setId(null)} className="min-h-9 cursor-pointer rounded-md bg-chrome px-3 text-[13px] font-semibold text-white">
          ← Manual vs Digital
        </button>
        {IMPACT_DIVES.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={x.id === id}
            onClick={() => setId(x.id)}
            className={
              'min-h-9 cursor-pointer rounded-md border px-3 text-[13px] font-semibold ' +
              (x.id === id ? 'border-signal bg-signal text-signal-ink' : 'border-edge bg-panel text-ink hover:bg-field')
            }
          >
            {x.label}
          </button>
        ))}
      </div>
      <section className="flex flex-wrap items-end justify-between gap-5 rounded-xl bg-chrome px-6 py-5 text-white">
        <div className="min-w-0 max-w-3xl space-y-1.5">
          <span className="eyebrow text-rail-muted">
            Manual week ({man.length} trucks) vs digital week ({dig.length} trucks)
          </span>
          <h3 className="text-[22px] leading-tight font-semibold">{k.label}</h3>
          <p className="text-[13px] text-rail-text">{d.about}</p>
          {(data.manualSample || data.sampleVisits) && (
            <p className="text-[12.5px] font-medium text-warn">
              ● Sample data:{' '}
              {[data.manualSample && 'the manual week is the kit’s sample until you import your paper-log week', data.sampleVisits && 'the digital week is sample data until real visits are fully timed']
                .filter(Boolean)
                .join('; ')}
              .
            </p>
          )}
        </div>
        <span className="flex items-baseline gap-2">
          <b className="figure text-[44px] leading-none font-semibold text-warn">{d.big}</b>
          <span className="text-[13px] text-rail-text">{d.unit}</span>
        </span>
      </section>
      {d.take && <p className="max-w-4xl text-[14.5px] leading-relaxed">{d.take}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.stats.map(([label, value, note, good]) => (
          <Tile key={label} size="compact" label={label} value={value} note={note} tone={good ? 'good' : undefined} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {d.panels.map((p) => (
          <div key={id + p.key} className={p.wide || p.kind ? 'xl:col-span-2' : ''}>
            <Card title={p.title} sub={p.note} legend={p.kind ? null : legendOf(p)}>
              <div className="px-5 pt-3 pb-5">
                {p.kind === 'swap' ? (
                  <div className="tt-tablebox">
                    <table className="imp-swap">
                      <thead>
                        <tr>
                          <th>Manual week</th>
                          <th>Digital week</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.rows.map(([before, after]) => (
                          <tr key={before}>
                            <td>{before}</td>
                            <td>{after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : p.kind === 'staff' ? (
                  <>
                    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
                      {minBox('call', 'Each phone call')}
                      {minBox('paper', 'Each paper handoff')}
                      <span className="text-[12.5px] text-muted">Estimates: change them to match the plant.</span>
                    </div>
                    {legendOf(p)}
                    <div className="imp-two mt-2">
                      <Chart label={p.title} deps={[id, data, staff]} draw={p.draw} />
                      <Chart label={`${p.title}: split`} deps={[id, data, staff]} draw={p.drawSplit} />
                    </div>
                  </>
                ) : (
                  <Chart label={p.title} deps={[id, data]} draw={p.draw} />
                )}
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DigitalSection({ entries }) {
  const { data, manual, setManual } = useDigitalData(entries)
  const [dive, setDive] = useState(null)
  const [staff, setStaffState] = useState(() => ({ ...STAFF_MINUTES, ...read(STAFF_KEY, {}) }))
  const setStaff = (next) => {
    setStaffState(next)
    write(STAFF_KEY, next)
  }
  const [importError, setImportError] = useState('')
  const fileRef = useRef(null)
  const importManual = async (ev) => {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setImportError('')
    try {
      setManual(parseManualWeek(await file.text()))
    } catch (err) {
      setImportError(err.message)
    }
  }
  const removeManual = () => {
    if (window.confirm('Remove the imported manual week? The sample manual week will stand in again.')) setManual(null)
  }

  if (!data) return <p className="text-muted">Loading…</p>
  if (dive && data.impact.length) return <DiveView id={dive} setId={setDive} data={data} staff={staff} setStaff={setStaff} />

  const imp = data.ctx.imp
  const stages = data.impact.filter((r) => r.kind === 'stage')
  const week = data.impact.filter((r) => r.kind === 'weekday')
  const weekDet = data.impact.filter((r) => r.kind === 'weekday_detention')

  return (
    <div className="tt space-y-5">
      <section className="rounded-xl bg-chrome px-6 py-5 text-white">
        <span className="eyebrow text-rail-muted">Manual vs digital</span>
        <h3 className="mt-1 text-[22px] leading-tight font-semibold">From paper and phone calls to one shared screen</h3>
        <p className="mt-1 text-[13px] text-rail-text">
          Manual week ({data.manualSample ? 'sample' : 'imported'}, {data.manualCount} trucks) vs digital week (latest 7 days{data.sampleVisits ? ', sample' : ''}).
        </p>
        <div className="no-print mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="min-h-9 cursor-pointer rounded-md bg-white/10 px-3 text-[13px] font-semibold text-white hover:bg-white/20">
            Import manual week (CSV or JSON)
          </button>
          {manual && (
            <button type="button" onClick={removeManual} className="min-h-9 cursor-pointer rounded-md px-2 text-[13px] font-semibold text-white underline">
              Remove imported week ({manual.length})
            </button>
          )}
          <Info label="the manual week file" tone="rail">
            One row per truck from the paper log: visit_id, day, visit_type, carrier, appt, arrived, the six stage minutes (gate_in_min, dock_assign_min, preload_min,
            load_min, inspection_min, checkout_min), phone_calls, paper_handoffs and yard_search_min.
          </Info>
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" onChange={importManual} hidden />
        </div>
        {importError && (
          <p role="alert" className="mt-2 text-[13px] font-semibold text-rail-alert">
            Couldn’t import that file: {importError}
          </p>
        )}
      </section>
      {data.manualSample && (
        <p className="text-[12.5px] font-medium text-warn-line">● Sample data: the manual week is the kit’s sample until you import your paper-log week.</p>
      )}
      {data.impact.length === 0 ? (
        <Card title="Not enough data yet" showSub sub="No fully timed trucks in the latest 7 days: a truck counts once it has its check-in, dock, loading, inspection and check-out times." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <DiveTile id="g2g" onOpen={setDive} label="Faster per truck" value={F().min(imp.g2g.saved)} unit="min saved" note={`${F().min(imp.g2g.before)} → ${F().min(imp.g2g.after)} min gate to gate`} />
            <DiveTile id="detention" onOpen={setDive} hot label="Detention avoided" value={F().usd(imp.detention.saved)} unit="a week" note={`About ${F().usd(imp.detention_year.saved)} a year at this pace`} />
            <DiveTile id="dock_wait" onOpen={setDive} label="Shorter wait for a dock" value={F().min(imp.dock_wait.saved)} unit="min saved" note={`${F().min(imp.dock_wait.before)} → ${F().min(imp.dock_wait.after)} min per truck`} />
            <DiveTile id="within" onOpen={setDive} label="Trucks within target" value={F().pct(imp.within.after)} note={`Up from ${F().pct(imp.within.before)} (≤ ${G2G_TARGET.max} min)`} />
            <DiveTile id="phone" onOpen={setDive} label="Phone calls not needed" value={F().int(imp.phone_calls.saved)} unit="calls" note={`plus ${F().int(imp.paper_handoffs.saved)} paper handoffs and ${F().min(imp.yard_search.saved)} h searching the yard`} />
            <DiveTile id="hours" onOpen={setDive} label="Truck hours freed" value={F().min(imp.truck_hours.saved)} unit="hours" note={`${F().min(imp.truck_hours.before)} → ${F().min(imp.truck_hours.after)} truck hours on site`} />
          </div>
          <Card
            title="Every Stage, Manual vs Digital"
            sub="Average minutes per truck. The biggest gains are in the handoffs: check-in, waiting for a dock, finding the truck before loading, and paperwork at inspection and checkout."
            legend={
              <div className="tt-legend">
                <Key color="var(--chart-muted)">Manual week</Key>
                <Key color="var(--p-teal)">Digital week</Key>
              </div>
            }
          >
            <div className="px-5 pt-3 pb-5">
              <Chart
                label="Each stage, manual week vs digital week"
                deps={[stages]}
                draw={(el) => TT.dumbbell(el, { rows: stages, key: (r) => r.key, label: (r) => r.label, before: (r) => r.before, after: (r) => r.after, unit: ' min' })}
              />
            </div>
          </Card>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card
              title="Gate to Gate by Weekday"
              sub={`Average minutes per truck. Red dashed line = the ${G2G_TARGET.max}-minute maximum.`}
              legend={
                <div className="tt-legend">
                  <Key color="var(--chart-muted)">Manual</Key>
                  <Key color="var(--p-navy)">Digital</Key>
                </div>
              }
            >
              <div className="px-5 pt-3 pb-5">
                <Chart
                  label="Gate to gate by weekday, manual vs digital"
                  deps={[week]}
                  draw={(el) =>
                    TT.groupBars(el, {
                      rows: week,
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
              </div>
            </Card>
            <Card
              title="Detention by Weekday"
              sub="Estimated carrier charges, $ per day."
              legend={
                <div className="tt-legend">
                  <Key color="var(--chart-muted)">Manual</Key>
                  <Key color="var(--p-red)">Digital</Key>
                </div>
              }
            >
              <div className="px-5 pt-3 pb-5">
                <Chart
                  label="Detention by weekday, manual vs digital"
                  deps={[weekDet]}
                  draw={(el) =>
                    TT.groupBars(el, {
                      rows: weekDet,
                      key: (r) => r.key,
                      fmt: F().usd,
                      series: [
                        { field: 'before', name: 'Manual', color: TT.C.muted },
                        { field: 'after', name: 'Digital', color: TT.C.red },
                      ],
                    })
                  }
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// Rail figure and the attention line: shown only when the digital week is slower than the manual one.
export const DIGITAL_SUMMARY = () => ({
  key: 'Paper log vs app',
  takeaway: <>A week from the paper log against the latest week in the app: minutes saved per truck, detention avoided, calls and paper no longer needed.</>,
})

