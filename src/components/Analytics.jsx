import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { dayKey } from '../time'
import { DETENTION_FREE_MIN } from '../yard'
import { impactMetrics, previousRange, rangeMetrics, shiftDate } from '../analytics'
import { loadImpactSettings, saveImpactSettings } from '../impactSettings'
import { Card } from './analytics/ui'
import { Trend, shortDate } from './analytics/charts'
import { HandoffSection, IMPACT_SUMMARY, ImpactSection, QualitySection, SettingsDialog } from './analytics/impact'
import {
  DockSection,
  GateSection,
  InspectionSection,
  OverviewSection,
  SUMMARY,
  SectionHeading,
  ShippingSection,
  Takeaway,
} from './analytics/sections'

// Analytics, shown as the "Overview" tab: how the yard did over a range of days, with a sidebar of
// sections. Its purpose is showing what digitizing the yard saves: detention fees, miscommunication
// between teams (handoffs) and mistakes, opening on Digitization Impact.

// Range presets: a number of days, or 'golive' (from the go-live date to today).
const PRESETS = [7, 14, 30, 'golive']

const SECTIONS = [
  { id: 'impact', label: 'Digitization Impact', sub: "What going digital is saving, and the money still on the table", View: ImpactSection },
  { id: 'overview', label: 'Detention & Wait Time', sub: 'Where trucks lose time on site, and what it costs in detention', View: OverviewSection },
  { id: 'handoffs', label: 'Handoffs', sub: 'How quickly each team picks up a truck from the one before', View: HandoffSection },
  { id: 'gate', label: 'Gate Operations', sub: 'Arrivals, appointments, gate traffic and carriers', View: GateSection },
  { id: 'shipping', label: 'Shipping', sub: 'Pickups and customers', View: ShippingSection },
  { id: 'docks', label: 'Dock & Loading', sub: 'Waits for a dock, dock use and time at each dock', View: DockSection },
  { id: 'inspections', label: 'Inspections', sub: 'Loading inspections: results, timing and who did them', View: InspectionSection },
  { id: 'quality', label: 'Data Quality', sub: 'Are the records complete, logged live, and catching mistakes?', View: QualitySection },
]
const ALL_SUMMARIES = { ...SUMMARY, ...IMPACT_SUMMARY }

// One toolbar for the whole tab: the range presets, the chosen dates (Custom… opens From / To),
// what the ▲/▼ compare against, and Export.
function Toolbar({ from, to, today, preset, onPreset, onRange, days, exportButton }) {
  const custom = useRef(null)
  const seg = (on) =>
    'min-h-11 cursor-pointer rounded-md border-2 px-3.5 font-semibold ' + (on ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-panel text-ink')
  const dateCls = 'min-h-11 rounded-md border-2 border-line bg-panel px-2 text-ink'
  const close = () => custom.current && (custom.current.open = false)
  return (
    <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-line bg-panel p-2.5">
      <div role="group" aria-label="Date range" className="flex flex-wrap items-center gap-2">
        {PRESETS.map((n) => (
          <button key={n} type="button" aria-pressed={preset === n} onClick={() => onPreset(n)} className={seg(preset === n)}>
            {n === 'golive' ? 'Since go-live' : `Last ${n} days`}
          </button>
        ))}
        {/* The chosen dates; opening it shows From / To for a custom range. Esc or Done closes it. */}
        <details ref={custom} className="relative" onKeyDown={(ev) => ev.key === 'Escape' && close()}>
          <summary
            className={
              'flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md border-2 px-3.5 font-semibold [&::-webkit-details-marker]:hidden ' +
              (preset ? 'border-line bg-panel text-ink' : 'border-signal bg-signal text-signal-ink')
            }
          >
            {shortDate(from)} → {shortDate(to)} <span aria-hidden="true">▾</span>
            <span className="sr-only">, choose custom dates</span>
          </summary>
          <div className="absolute left-0 z-20 mt-1.5 flex flex-wrap items-end gap-2 rounded-[10px] border border-line bg-panel p-3 shadow-lg">
            <label className="text-sm font-semibold text-muted">
              <span className="block">From</span>
              <input type="date" value={from} max={to} onChange={(ev) => ev.target.value && onRange(ev.target.value, to)} className={dateCls} />
            </label>
            <label className="text-sm font-semibold text-muted">
              <span className="block">To</span>
              <input type="date" value={to} min={from} max={today} onChange={(ev) => ev.target.value && onRange(from, ev.target.value)} className={dateCls} />
            </label>
            <button type="button" onClick={close} className={ui.btnSmall}>
              Done
            </button>
          </div>
        </details>
      </div>
      <span className="text-sm text-muted">
        {days} day{days === 1 ? '' : 's'} · ▲/▼ vs the {days} days before
      </span>
      <span className="ml-auto">{exportButton}</span>
    </div>
  )
}

// Wide screens: a dark rail pinned to the window's left edge, from under the header (--header-h, set
// in App) to the bottom of the window; it stays put while the section scrolls.
// Narrow screens: a row of light buttons above the content.
// Each item shows its section's key figure (⚠ and colored when it needs attention); the sample-data
// link sits below the menu.
function Sidebar({ section, onSelect, keys, sampleControl, settingsControl }) {
  const toneCls = { alert: 'font-semibold text-danger lg:text-rail-alert', warn: 'font-semibold text-ink lg:text-white' }
  return (
    <aside className="no-print lg:fixed lg:bottom-0 lg:left-0 lg:top-[var(--header-h,114px)] lg:z-[5] lg:w-60 lg:overflow-y-auto lg:bg-rail">
      {/* Wide screens: 12px panel margin + 12px item padding puts every line of text 24px from the
          window edge; items are all 64px tall with 8px between them. */}
      <nav aria-label="Analytics sections" className="lg:py-4">
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
        {SECTIONS.map((s) => {
          const on = section === s.id
          const k = keys[s.id]
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => onSelect(s.id)}
                className={
                  'min-h-11 w-full cursor-pointer rounded-md border-2 px-3.5 py-1.5 text-left whitespace-nowrap ' +
                  'lg:flex lg:min-h-16 lg:flex-col lg:justify-center lg:border-0 lg:px-3 lg:py-2 ' +
                  (on
                    ? 'border-signal bg-signal text-signal-ink'
                    : 'border-line bg-panel text-ink hover:bg-field lg:bg-transparent lg:text-rail-text lg:hover:bg-white/10 lg:hover:text-white')
                }
              >
                <span className="block font-semibold lg:text-[17px] lg:leading-tight">{s.label}</span>
                {k && (
                  <span className={'block text-[13px] tabular-nums lg:mt-0.5 lg:text-[14px] ' + (on ? (k.tone ? 'font-semibold' : '') : (toneCls[k.tone] ?? 'text-muted lg:text-rail-muted'))}>
                    {k.tone && '⚠ '}
                    {k.key}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mx-3 mt-4 hidden flex-col items-start border-t border-white/15 px-3 pt-2 lg:flex">
        {settingsControl}
        {sampleControl}
      </div>
      </nav>
    </aside>
  )
}

const minutes = (ms) => (ms == null ? '' : Math.round(ms / 60000))
const percent = (v) => (v == null ? '' : Math.round(v * 1000) / 10)
const dollars = (v) => Math.round(v ?? 0)

// One workbook for the range. Durations in minutes, costs in dollars.
async function exportAnalytics(r, impact) {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  const add = (name, rows) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name)
  const t = r.totals
  const q = impact.quality
  add('Impact', [
    ['Range', `${r.from} to ${r.to}`],
    ['Go-live', impact.goLive],
    ['Est. detention ($)', dollars(t.detentionCost)],
    ['Money on the table per week ($, if every handoff met its target)', dollars(impact.allOpportunityPerWeek)],
    ['Handoffs on target %', percent(impact.onTargetPct)],
    ['Starting point: detention per week ($)', impact.start ? dollars(impact.start.weeklyDetention) : 'forms after 2 weeks'],
    ['Starting point: detention per live load ($)', impact.start?.perLoad != null ? Math.round(impact.start.perLoad * 100) / 100 : ''],
    [],
    ['Week starting', 'Week ending', 'Est. detention ($)', 'Live loads', 'Detention per load ($)', 'Loads past free time %', 'Avg time on site (min)'],
    ...impact.weeks.map((w) => [w.from, w.to, dollars(w.detention), w.live, w.perLoad != null ? Math.round(w.perLoad * 100) / 100 : '', percent(w.overFreePct), minutes(w.avgOnSiteMs)]),
  ])
  add('Handoffs', [
    ['Handoff', 'Owner', 'Target (min)', 'Avg (min)', 'On target %', 'Trucks timed', 'Money on the table per week ($)'],
    ...impact.handoffs.map((h) => [h.label, h.owner, h.targetMin, minutes(h.avgMs), percent(h.onTargetPct), h.count, dollars(h.opportunityPerWeek)]),
    [],
    ['Gate → Shipping'],
    ['Avg arrival → check-in saved (min)', minutes(impact.gateShipping.avgLoggedMs)],
    ['Check-ins saved within 15 min %', percent(impact.gateShipping.livePct)],
    ['Avg waiting with no dock free (min)', minutes(impact.gateShipping.avgNoDockMs)],
    ['Avg waiting with a dock free, not assigned (min)', minutes(impact.gateShipping.avgFreeDockMs)],
    [`Dock assigned within ${impact.gateShipping.targetMin} min of being free %`, percent(impact.gateShipping.responseOnTargetPct)],
    ['Money on the table per week ($)', dollars(impact.gateShipping.opportunityPerWeek)],
    [],
    ['Stuck right now', 'Trailer #', 'Carrier', 'For (min)', 'Over target (min)'],
    ...impact.stuck.map((s) => [s.step, s.e.trailerNumber, s.e.truckName, minutes(s.sinceMs), minutes(s.overMs)]),
  ])
  add('Data Quality', [
    ['Records complete %', percent(q.completePct)],
    ['Inspections fully answered %', percent(q.answeredPct)],
    ['Logged live % (saved within 15 min of Time In)', percent(q.livePct)],
    ['Entries corrected after saving', q.edited],
    ['Seal checks at the gate', q.sealChecks],
    ['Seal mismatches found', q.sealMismatches],
    ['Check-outs blocked', q.blocked],
    ['Details not re-typed (one form instead of two)', impact.shared.total],
    ...impact.shared.byField.map((f) => [`  ${f.label}`, f.count]),
    [],
    ['Guard', 'Check-ins', 'Logged live %', 'Corrected later'],
    ...q.guards.map((g) => [g.name, g.checkIns, percent(g.livePct), g.edited]),
  ])
  add('Summary', [
    ['Range', `${r.from} to ${r.to}`],
    ['Visits', t.visits],
    ['Live', t.live],
    ['Drop', t.drops],
    ['On-time arrival %', percent(t.onTimePct)],
    ['Avg time on site (min)', minutes(t.avgOnSiteMs)],
    ['Avg wait for dock (min)', minutes(t.avgWaitDockMs)],
    ['Avg dock to inspected (min)', minutes(t.avgToInspectMs)],
    ['Avg waiting for Shipping release (min)', minutes(t.avgToReleaseMs)],
    ['Avg release to check-out (min)', minutes(t.avgReleaseToOutMs)],
    ['Dock utilization %', percent(t.dockUtilization)],
    [`Visits over ${DETENTION_FREE_MIN} min`, t.overFree],
    ['Est. detention ($)', dollars(t.detentionCost)],
    ['Loading inspections', r.inspections.count],
    ['Inspections passed %', percent(r.inspections.passPct)],
    ['Inspected past free time', r.inspections.late.length],
  ])
  add('Daily', [
    ['Date', 'Visits', 'Live', 'Drop', 'Pickups', 'On time %', 'Avg wait for dock (min)', 'Avg dock to inspected (min)', 'Inspections', `Over ${DETENTION_FREE_MIN} min`, 'Est. detention ($)'],
    ...r.days.map((d) => [d.date, d.visits, d.live, d.drops, d.pickups, percent(d.onTimePct), minutes(d.avgWaitDockMs), minutes(d.avgToInspectMs), d.inspections, d.overFree, dollars(d.detentionCost)]),
  ])
  add('Visit Stages', [
    ['Date In', 'Time In', 'Carrier', 'Trailer #', 'Dock #', 'Purpose', 'Wait for dock (min)', 'Dock to inspected (min)', 'Waiting for release (min)', 'Release to check-out (min)', 'Released by', 'Time on site (min)', 'Still on site', 'Est. detention ($)'],
    ...r.stays.map((s) => [
      s.e.dateIn,
      s.e.timeIn,
      s.e.truckName,
      s.e.trailerNumber,
      s.e.dockDoor,
      (s.e.visitPurpose ?? []).join(', '),
      minutes(s.waitDockMs),
      minutes(s.toInspectMs),
      minutes(s.toReleaseMs),
      minutes(s.releaseToOutMs),
      s.e.release?.releasedBy ?? '',
      minutes(s.onSiteMs),
      s.onSite ? 'Yes' : 'No',
      dollars(s.cost),
    ]),
  ])
  add('Docks', [
    ['Dock', 'Loads', 'Utilization %', 'Avg wait for dock (min)', 'Avg dock to inspected (min)', 'Avg time at dock (min)', 'Est. detention ($)'],
    ...r.docks.map((d) => [d.dock, d.loads, percent(d.utilization), minutes(d.avgWaitMs), minutes(d.avgToInspectMs), minutes(d.avgDwellMs), dollars(d.detentionCost)]),
  ])
  const partners = (list, label) => [
    [label, 'Visits', 'Avg turnaround (min)', 'Avg dock to inspected (min)', 'On time %', 'Inspections passed %', `Over ${DETENTION_FREE_MIN} min`, 'Est. detention ($)'],
    ...list.map((c) => [c.name, c.visits, minutes(c.avgTurnMs), minutes(c.avgToInspectMs), percent(c.onTimePct), percent(c.passPct), c.overFree, dollars(c.detentionCost)]),
  ]
  add('Carriers', partners(r.carriers, 'Carrier'))
  add('Customers', partners(r.customers, 'Customer'))
  add('Inspectors', partners(r.inspections.inspectors, 'Inspected by'))
  XLSX.writeFile(book, `analytics-${r.from}-to-${r.to}.xlsx`)
}

export default function Analytics({ entries, gateEvents = [], sampleCount, onLoadSample, onRemoveSample }) {
  const [now, setNow] = useState(Date.now)
  const today = dayKey(new Date(now))
  const [section, setSection] = useState('impact')
  const [preset, setPreset] = useState(7)
  const [range, setRange] = useState(() => ({ from: shiftDate(today, -6), to: today }))
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [settings, setSettings] = useState(loadImpactSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  // Go-live: the date set in Targets & go-live, else the first real (non-sample) entry's date, else
  // the first entry's.
  const firstDate = (list) => list.reduce((m, e) => (e.dateIn && (!m || e.dateIn < m) ? e.dateIn : m), '')
  const defaultGoLive = firstDate(entries.filter((e) => !e.sample)) || firstDate(entries) || today
  const goLive = settings.goLive || defaultGoLive
  const effective = useMemo(() => ({ ...settings, goLive }), [settings, goLive])

  const choosePreset = (n) => {
    setPreset(n)
    setRange(n === 'golive' ? { from: goLive <= today ? goLive : today, to: today } : { from: shiftDate(today, -(n - 1)), to: today })
  }
  const saveSettings = (next) => {
    setSettings(next)
    saveImpactSettings(next)
    setSettingsOpen(false)
  }
  const chooseRange = (from, to) => {
    setPreset(null)
    setRange({ from, to })
  }

  const r = useMemo(() => rangeMetrics(entries, range.from, range.to, now), [entries, range, now])
  const prev = useMemo(() => {
    const p = previousRange(range.from, range.to)
    return rangeMetrics(entries, p.from, p.to, now)
  }, [entries, range, now])
  const impact = useMemo(() => impactMetrics(entries, range.from, range.to, now, effective, gateEvents), [entries, range, now, effective, gateEvents])
  const prevImpact = useMemo(() => {
    const p = previousRange(range.from, range.to)
    return impactMetrics(entries, p.from, p.to, now, effective, gateEvents)
  }, [entries, range, now, effective, gateEvents])

  // The ▲/▼ line under a tile; blank when the previous period had no visits.
  const trend = (value, base, format, lowerIsBetter) => (
    <Trend value={value} base={prev.totals.visits ? base : null} format={format} lowerIsBetter={lowerIsBetter} days={r.dayCount} />
  )

  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      await exportAnalytics(r, impact)
    } catch {
      setExportError('Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  const current = SECTIONS.find((s) => s.id === section)
  const View = current.View
  const hasData = r.totals.visits > 0
  // Sidebar figure and takeaway for every section (none when the range is empty).
  const extra = { impact, prevImpact }
  const summaries = hasData ? Object.fromEntries(SECTIONS.map((s) => [s.id, ALL_SUMMARIES[s.id](r, prev, r.dayCount, extra)])) : {}
  const settingsControl = (colors = 'text-muted hover:text-ink') => (
    <button type="button" onClick={() => setSettingsOpen(true)} className={'min-h-11 cursor-pointer text-sm font-semibold underline ' + colors}>
      Targets &amp; go-live
    </button>
  )

  // A demo control, so it's a quiet link rather than a button beside Export. `colors` suits where it
  // sits: light text on the dark sidebar rail, muted text on the page.
  const sampleControl = (colors = 'text-muted hover:text-ink') =>
    sampleCount > 0 ? (
      <button
        type="button"
        onClick={() => window.confirm(`Remove the ${sampleCount} sample visits? Your real entries are kept.`) && onRemoveSample()}
        className={'min-h-11 cursor-pointer text-sm font-semibold underline ' + colors}
      >
        Remove sample data ({sampleCount})
      </button>
    ) : (
      <button type="button" onClick={onLoadSample} className={'min-h-11 cursor-pointer text-sm font-semibold underline ' + colors}>
        Load sample data
      </button>
    )

  const exportButton = (
    <span className="flex items-center gap-2">
      {exportError && <span className="font-semibold text-danger">{exportError}</span>}
      <button type="button" onClick={handleExport} disabled={!hasData || exporting} className={ui.btnSmallPrimary}>
        {exporting ? 'Exporting…' : 'Export'}
      </button>
    </span>
  )

  return (
    // On wide screens the sidebar is pinned outside the page flow, so the content is pushed right
    // just enough to clear it: the page column starts max(0, (100vw - 1400px) / 2) + 20px from the
    // window edge, and the content should start at least 240px + 20px in.
    <div className="grid gap-5 lg:block lg:pl-[max(0px,calc(240px_-_max(0px,(100vw_-_1400px)/2)))]">
      <Sidebar
        section={section}
        onSelect={setSection}
        keys={summaries}
        sampleControl={sampleControl('text-rail-muted hover:text-white')}
        settingsControl={settingsControl('text-rail-muted hover:text-white')}
      />
      <SettingsDialog open={settingsOpen} settings={settings} defaultGoLive={defaultGoLive} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />

      <div className="min-w-0 space-y-5">
        <Toolbar
          from={range.from}
          to={range.to}
          today={today}
          preset={preset}
          onPreset={choosePreset}
          onRange={chooseRange}
          days={r.dayCount}
          exportButton={exportButton}
        />

        <SectionHeading title={current.label} sub={current.sub} />

        {!hasData ? (
          <Card title="No visits in this range" sub="Pick a different range, or load the sample data to see how this tab works.">
            <div className="px-5 pt-2 pb-5">{sampleControl()}</div>
          </Card>
        ) : (
          <>
            <Takeaway>{summaries[section].takeaway}</Takeaway>
            <View r={r} prev={prev} trend={trend} impact={impact} prevImpact={prevImpact} settings={settings} onOpenSettings={() => setSettingsOpen(true)} />
          </>
        )}

        {/* On narrow screens the sidebar is a row of buttons, so the sample-data link sits here. */}
        <div className="no-print flex flex-wrap gap-x-5 lg:hidden">
          {settingsControl()}
          {sampleControl()}
        </div>
      </div>
    </div>
  )
}
