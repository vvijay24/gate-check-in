import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { dayKey } from '../time'
import { DETENTION_FREE_MIN } from '../yard'
import { impactMetrics, previousRange, rangeMetrics, shiftDate } from '../analytics'
import { opsMetrics } from '../ops'
import { FILTER_KEYS, FILTER_LABEL, NO_FILTERS, PURPOSES, activeFilters, applyFilters, filterOptions } from '../insightsFilters'
import { loadImpactSettings, saveImpactSettings } from '../impactSettings'
import { Card } from './analytics/ui'
import { Trend, shortDate } from './analytics/charts'
import { HandoffSection, IMPACT_SUMMARY, ImpactSection, QualitySection, SettingsDialog } from './analytics/impact'
import { REPLAY_SUMMARY, ReplaySection } from './analytics/replay'
import { CONTROL_SUMMARY, ControlSection } from './analytics/control'
import { EXPLORER_SUMMARY, ExplorerSection } from './analytics/explorer'
import { ProfileView } from './analytics/profiles'
import { InsightsNav } from './analytics/nav'
import {
  CarriersSection,
  CustomersSection,
  DockSection,
  InspectionSection,
  OverviewSection,
  SUMMARY,
  SectionHeading,
  Takeaway,
  ThroughputSection,
} from './analytics/sections'

// Insights: how the yard is doing, live and over a range of days. Sections are grouped by the
// question they answer; every figure respects the global filters; names, docks and visits open their
// own drill-down page; and the whole view (section, range, filters, open page) lives in the URL so a
// link reopens it.

// Range presets: a number of days, or 'golive' (from the go-live date to today).
const PRESETS = [7, 14, 30, 'golive']

const SECTIONS = [
  { id: 'command', group: 'Live', label: 'Command Center', sub: 'The yard right now and through the day: load, docks, queue and what is stuck', View: ControlSection },
  { id: 'replay', group: 'Live', label: 'Yard Replay', sub: 'Watch any day on the yard map: arrivals, docking and departures', View: ReplaySection },
  { id: 'throughput', group: 'Flow & Time', label: 'Throughput', sub: 'Arrivals, departures, appointments and gate traffic', View: ThroughputSection },
  { id: 'turnaround', group: 'Flow & Time', label: 'Turnaround & Detention', sub: 'Where trucks lose time on site, and what it costs in detention', View: OverviewSection },
  { id: 'docks', group: 'Flow & Time', label: 'Docks', sub: 'Waits for a dock, the dock schedule and how each dock performs', View: DockSection },
  { id: 'handoffs', group: 'Flow & Time', label: 'Handoffs', sub: 'How quickly each team picks up a truck from the one before', View: HandoffSection },
  { id: 'carriers', group: 'Partners', label: 'Carriers', sub: 'Who brings the trucks, how long they stay and what they cost', View: CarriersSection },
  { id: 'customers', group: 'Partners', label: 'Customers', sub: 'Pickups and the customers they are for', View: CustomersSection },
  { id: 'inspections', group: 'Quality', label: 'Inspections', sub: 'Loading inspections: results, timing and who did them', View: InspectionSection },
  { id: 'quality', group: 'Quality', label: 'Data Quality', sub: 'Are the records complete, logged live, and catching mistakes?', View: QualitySection },
  { id: 'impact', group: 'Value', label: 'Digitization Impact', sub: 'What going digital is saving, and the money still on the table', View: ImpactSection },
  { id: 'explorer', group: 'Explore', label: 'Visit Explorer', sub: 'Every visit in the range: search, filter and open any one', View: ExplorerSection },
]
const GROUPS = [...new Set(SECTIONS.map((s) => s.group))]
const ALL_SUMMARIES = {
  command: CONTROL_SUMMARY,
  replay: REPLAY_SUMMARY,
  throughput: SUMMARY.gate,
  turnaround: SUMMARY.overview,
  docks: SUMMARY.docks,
  handoffs: IMPACT_SUMMARY.handoffs,
  carriers: SUMMARY.carriers,
  customers: SUMMARY.shipping,
  inspections: SUMMARY.inspections,
  quality: IMPACT_SUMMARY.quality,
  impact: IMPACT_SUMMARY.impact,
  explorer: EXPLORER_SUMMARY,
}
const PROFILE_WORD = { carrier: 'Carrier', customer: 'Customer', dock: 'Dock', visit: 'Visit' }
const profileName = (p) => (p.kind === 'dock' ? `Dock ${p.id}` : p.kind === 'visit' ? 'the visit' : p.id)

// ---------- URL ----------

// ?tab=insights&s=carriers&range=7 (or from=…&to=…)&carrier=…&open=carrier:Schneider
function readUrl() {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('tab') !== 'insights') return {}
    const open = q.get('open')
    const at = open ? open.indexOf(':') : -1
    return {
      section: SECTIONS.some((x) => x.id === q.get('s')) ? q.get('s') : undefined,
      preset: q.get('range') ? (q.get('range') === 'golive' ? 'golive' : Number(q.get('range'))) : q.get('from') ? null : undefined,
      from: q.get('from'),
      to: q.get('to'),
      filters: Object.fromEntries(FILTER_KEYS.map((k) => [k, q.get(k) ?? ''])),
      profile: at > 0 ? { kind: open.slice(0, at), id: open.slice(at + 1) } : null,
    }
  } catch {
    return {}
  }
}

function writeUrl({ section, preset, range, filters, profile }) {
  try {
    const q = new URLSearchParams({ tab: 'insights', s: section })
    if (preset) q.set('range', String(preset))
    else {
      q.set('from', range.from)
      q.set('to', range.to)
    }
    for (const k of FILTER_KEYS) if (filters[k]) q.set(k, filters[k])
    if (profile) q.set('open', `${profile.kind}:${profile.id}`)
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`)
  } catch {
    // Some embedded pages don't allow it; the view still works, the link just won't carry it.
  }
}

// ---------- Toolbar and filters ----------

// One option of a segmented control: the chosen one is a raised white chip on the gray track.
const segCls = (on) =>
  'min-h-9 cursor-pointer rounded-[5px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors ' +
  (on ? 'bg-panel text-ink shadow-[0_1px_2px_rgb(15_23_42/0.14),0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink')
// An outlined toolbar control.
const ctlCls = 'flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-edge bg-panel px-3 text-[13px] font-medium text-ink hover:bg-field'

function FilterPanel({ filters, options, onChange }) {
  const sel = 'min-h-10 w-full rounded-md border border-edge bg-panel px-2 text-[13.5px] text-ink'
  const field = (key, label, items) => (
    <label className="text-[12px] font-medium text-muted">
      <span className="mb-1 block">{label}</span>
      <select value={filters[key]} onChange={(ev) => onChange({ ...filters, [key]: ev.target.value })} className={sel}>
        {items.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {field('carrier', 'Carrier', [['', 'All carriers'], ...options.carriers.map((c) => [c, c])])}
      {field('customer', 'Customer', [['', 'All customers'], ...options.customers.map((c) => [c, c])])}
      {field('dock', 'Dock', [['', 'All docks'], ...options.docks.map((d) => [d, `Dock ${d}`])])}
      {field('kind', 'Visit type', [
        ['', 'Live and drops'],
        ['live', 'Live visits only'],
        ['drop', 'Dropped trailers only'],
      ])}
      {field('purpose', 'Purpose', [['', 'Any purpose'], ...PURPOSES.map((p) => [p, p])])}
    </div>
  )
}

function Toolbar({ from, to, today, preset, onPreset, onRange, days, filters, options, onFilters, exportButton, onCopyLink, copied }) {
  const custom = useRef(null)
  const [showFilters, setShowFilters] = useState(false)
  const dateCls = 'min-h-10 rounded-md border border-edge bg-panel px-2 text-[13.5px] text-ink'
  const close = () => custom.current && (custom.current.open = false)
  const active = activeFilters(filters)
  return (
    <div className="no-print rounded-xl bg-panel px-3 py-2.5 shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Date range" className="inline-flex flex-wrap gap-0.5 rounded-md bg-track p-0.5">
            {PRESETS.map((n) => (
              <button key={n} type="button" aria-pressed={preset === n} onClick={() => onPreset(n)} className={segCls(preset === n)}>
                {n === 'golive' ? 'Since go-live' : `${n}D`}
                <span className="sr-only">{n === 'golive' ? '' : ` (last ${n} days)`}</span>
              </button>
            ))}
          </div>
          <details ref={custom} className="relative" onKeyDown={(ev) => ev.key === 'Escape' && close()}>
            <summary
              className={ctlCls + ' list-none [&::-webkit-details-marker]:hidden ' + (preset ? '' : 'border-signal ring-1 ring-signal')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              <span className="figure text-[12.5px]">
                {shortDate(from)} – {shortDate(to)}
              </span>
              <span aria-hidden="true" className="text-muted">▾</span>
              <span className="sr-only">, choose custom dates</span>
            </summary>
            <div className="absolute left-0 z-20 mt-1.5 flex flex-wrap items-end gap-2 rounded-xl bg-panel p-3 shadow-raised">
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
          <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)} className={ctlCls + (showFilters ? ' bg-field' : '')}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />
            </svg>
            Filters
            {active.length > 0 && <span className="figure rounded bg-signal px-1.5 text-[11px] leading-5 text-signal-ink">{active.length}</span>}
          </button>
        </div>
        <span className="hidden text-[12px] text-muted 2xl:inline">
          {days} day{days === 1 ? '' : 's'} · ▲/▼ vs the {days} days before
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onCopyLink} className={ctlCls} aria-live="polite">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          {exportButton}
        </span>
      </div>
      {showFilters && (
        <div className="mt-2.5 border-t border-line px-1 pt-3 pb-1">
          <FilterPanel filters={filters} options={options} onChange={onFilters} />
        </div>
      )}
      {active.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line px-1 pt-2.5">
          <span className="eyebrow text-muted">Filtered</span>
          {active.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onFilters({ ...filters, [k]: '' })}
              aria-label={`Remove filter ${FILTER_LABEL[k](filters[k])}`}
              className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md bg-signal-soft px-2.5 text-[12.5px] font-medium text-signal-line ring-1 ring-signal/25 hover:ring-signal"
            >
              {FILTER_LABEL[k](filters[k])} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" onClick={() => onFilters(NO_FILTERS)} className="min-h-8 cursor-pointer text-[12.5px] font-medium text-muted underline hover:text-ink">
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

// Left padding that clears the fixed Insights rail (15rem) on wide screens (see the layout below). App
// uses it for the notices above Insights too, so the rail never covers them.
export const RAIL_PAD = 'lg:pl-60'

// Wide screens: a dark rail pinned to the window's left edge, from under the header (--header-h, set
// in App) to the bottom of the window, with the sections under their group headings. It never
// scrolls: its spacing follows the window's height (vh), and on short windows a section's figure
// shrinks to a dot beside its name.
// Narrow screens: a row of light buttons above the content.
function Sidebar({ section, onSelect, keys, sampleControl, settingsControl, inProfile }) {
  const toneCls = { alert: 'text-danger', warn: 'text-warn-line' }
  return (
    <aside className="rail no-print min-w-0 lg:fixed lg:top-[var(--header-h,114px)] lg:bottom-0 lg:left-0 lg:z-[5] lg:w-60 lg:overflow-hidden lg:border-r lg:border-line lg:bg-panel">
      <nav aria-label="Insights sections" className="lg:flex lg:h-full lg:flex-col lg:px-3 lg:py-[clamp(4px,1.2vh,12px)]">
        <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:block lg:overflow-visible lg:pb-0">
          {GROUPS.map((g) => (
            <li key={g} className="contents lg:block">
              <span className="eyebrow hidden px-3 pt-[clamp(3px,1.1vh,16px)] pb-[clamp(2px,0.5vh,6px)] text-[11.5px] leading-tight text-muted lg:block">{g}</span>
              <ul className="contents lg:block lg:space-y-0.5">
                {SECTIONS.filter((s) => s.group === g).map((s) => {
                  const on = section === s.id
                  const k = keys[s.id]
                  return (
                    <li key={s.id} className="shrink-0">
                      <button
                        type="button"
                        aria-current={on ? 'page' : undefined}
                        onClick={() => onSelect(s.id)}
                        className={
                          'relative min-h-10 w-full cursor-pointer rounded-md border px-3 py-1.5 text-left whitespace-nowrap transition-colors ' +
                          'lg:flex lg:min-h-[clamp(25px,3.8vh,44px)] lg:flex-col lg:justify-center lg:border-0 lg:py-[clamp(2px,0.5vh,6px)] ' +
                          'lg:before:absolute lg:before:top-2 lg:before:bottom-2 lg:before:left-0 lg:before:w-[3px] lg:before:rounded-full ' +
                          (on
                            ? 'border-signal bg-signal-soft text-signal-line lg:bg-signal-soft lg:text-signal-line lg:before:bg-signal' + (inProfile ? ' lg:before:bg-signal/60' : '')
                            : 'border-edge bg-panel text-ink hover:bg-field lg:bg-transparent lg:text-ink lg:hover:bg-field')
                        }
                      >
                        <span className="flex items-center gap-2 text-[13.5px] leading-tight font-medium">
                          {s.label}
                          {k?.tone && <i aria-hidden="true" className={'hidden h-1.5 w-1.5 shrink-0 rounded-full [@media(max-height:760px)]:lg:inline-block ' + (k.tone === 'alert' ? 'bg-danger' : 'bg-warn')} />}
                        </span>
                        {/* The section's figure only when it needs attention; otherwise just the name. */}
                        {k?.tone && (
                          <span className={'figure block text-[11.5px] lg:mt-0.5 [@media(max-height:760px)]:lg:sr-only ' + toneCls[k.tone]}>
                            ⚠ {k.key}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="mt-auto hidden flex-col items-start border-t border-line px-3 pt-1 lg:flex [&>button]:min-h-8">
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
async function exportAnalytics(r, impact, ops) {
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
  add('Spread', [
    ['Handoff', 'Typical p50 (min)', 'Slow end p90 (min)', 'Target (min)', 'On target %', 'Trucks'],
    ...ops.stages.map((s) => [s.label, minutes(s.p50), minutes(s.p90), minutes(s.target), percent(s.onTargetPct), s.n]),
    [],
    ['Time on site from (min)', 'to (min)', 'Departed live visits'],
    ...ops.stays.bins.map((b) => [minutes(b.from), b.to == null ? 'or more' : minutes(b.to), b.count]),
    [],
    ['Docks in use, share of operating hours %', percent(ops.dockUse)],
    ...Object.entries(ops.dockUseByDock).map(([d, u]) => [`  Dock ${d}`, percent(u)]),
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
    ['Avg waiting for release (min)', minutes(t.avgToReleaseMs)],
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
  const [url] = useState(readUrl)
  const [section, setSection] = useState(url.section ?? 'command')
  const [preset, setPreset] = useState(url.preset === undefined ? 7 : url.preset)
  const [range, setRange] = useState(() =>
    url.from && url.to ? { from: url.from, to: url.to } : { from: shiftDate(today, -((typeof url.preset === 'number' ? url.preset : 7) - 1)), to: today },
  )
  const [filters, setFilters] = useState(() => ({ ...NO_FILTERS, ...url.filters }))
  // Drill-down pages opened from one another; Back steps out one at a time.
  const [trail, setTrail] = useState(() => (url.profile ? [url.profile] : []))
  const profile = trail[trail.length - 1] ?? null
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [copied, setCopied] = useState(false)
  const [settings, setSettings] = useState(loadImpactSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const top = useRef(null)

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

  // "Since go-live" from a link is worked out once the entries are known.
  useEffect(() => {
    if (preset === 'golive') setRange({ from: goLive <= today ? goLive : today, to: today })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goLive])

  useEffect(() => writeUrl({ section, preset, range, filters, profile }), [section, preset, range, filters, profile])
  // Leaving Insights takes its view out of the address.
  useEffect(
    () => () => {
      try {
        window.history.replaceState(null, '', window.location.pathname)
      } catch {
        // Nothing to undo.
      }
    },
    [],
  )

  const choosePreset = (n) => {
    setPreset(n)
    setRange(n === 'golive' ? { from: goLive <= today ? goLive : today, to: today } : { from: shiftDate(today, -(n - 1)), to: today })
  }
  const chooseRange = (from, to) => {
    setPreset(null)
    setRange({ from, to })
  }
  const saveSettings = (next) => {
    setSettings(next)
    saveImpactSettings(next)
    setSettingsOpen(false)
  }
  const scrollUp = () => top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  const selectSection = (id) => {
    setSection(id)
    setTrail([])
    scrollUp()
  }
  const open = useCallback((p) => {
    setTrail((t) => {
      const last = t[t.length - 1]
      return last && last.kind === p.kind && last.id === p.id ? t : [...t, p]
    })
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])
  const back = () => {
    setTrail((t) => t.slice(0, -1))
    scrollUp()
  }
  const pendingStatus = useRef('')
  const go = useCallback((id, { status = '' } = {}) => {
    pendingStatus.current = status
    setSection(id)
    setTrail([])
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])
  const takeStatus = useCallback(() => {
    const s = pendingStatus.current
    pendingStatus.current = ''
    return s
  }, [])
  const nav = useMemo(() => ({ open, go, takeStatus }), [open, go, takeStatus])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', window.location.href)
    }
  }

  // Everything below is worked out from the entries that pass the filters.
  const scoped = useMemo(() => applyFilters(entries, filters), [entries, filters])
  const options = useMemo(() => filterOptions(entries), [entries])

  const r = useMemo(() => rangeMetrics(scoped, range.from, range.to, now), [scoped, range, now])
  const prev = useMemo(() => {
    const p = previousRange(range.from, range.to)
    return rangeMetrics(scoped, p.from, p.to, now)
  }, [scoped, range, now])
  const impact = useMemo(() => impactMetrics(scoped, range.from, range.to, now, effective, gateEvents), [scoped, range, now, effective, gateEvents])
  const prevImpact = useMemo(() => {
    const p = previousRange(range.from, range.to)
    return impactMetrics(scoped, p.from, p.to, now, effective, gateEvents)
  }, [scoped, range, now, effective, gateEvents])
  const ops = useMemo(() => opsMetrics(scoped, range.from, range.to, now, effective.targets), [scoped, range, now, effective])
  const prevOps = useMemo(() => {
    const p = previousRange(range.from, range.to)
    return opsMetrics(scoped, p.from, p.to, now, effective.targets)
  }, [scoped, range, now, effective])

  // The ▲/▼ line under a tile; blank when the previous period had no visits.
  const trend = (value, base, format, lowerIsBetter) => (
    <Trend value={value} base={prev.totals.visits ? base : null} format={format} lowerIsBetter={lowerIsBetter} days={r.dayCount} />
  )

  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      await exportAnalytics(r, impact, ops)
    } catch {
      setExportError('Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  const current = SECTIONS.find((s) => s.id === section)
  const View = current.View
  const hasData = r.totals.visits > 0
  const extra = { impact, prevImpact, ops }
  const summaries = hasData ? Object.fromEntries(SECTIONS.map((s) => [s.id, ALL_SUMMARIES[s.id](r, prev, r.dayCount, extra)])) : {}
  const backTo = trail.length > 1 ? trail[trail.length - 2] : null
  const backLabel = backTo ? `Back to ${PROFILE_WORD[backTo.kind].toLowerCase()} ${profileName(backTo)}` : `Back to ${current.label}`

  const settingsControl = (colors = 'text-muted hover:text-ink') => (
    <button type="button" onClick={() => setSettingsOpen(true)} className={'min-h-10 cursor-pointer text-[12.5px] font-medium underline underline-offset-2 ' + colors}>
      Targets &amp; go-live
    </button>
  )
  // A demo control, so it's a quiet link rather than a button beside Export.
  const sampleControl = (colors = 'text-muted hover:text-ink') =>
    sampleCount > 0 ? (
      <button
        type="button"
        onClick={() => window.confirm(`Remove the ${sampleCount} sample visits? Your real entries are kept.`) && onRemoveSample()}
        className={'min-h-10 cursor-pointer text-[12.5px] font-medium underline underline-offset-2 ' + colors}
      >
        Remove sample data ({sampleCount})
      </button>
    ) : (
      <button type="button" onClick={onLoadSample} className={'min-h-10 cursor-pointer text-[12.5px] font-medium underline underline-offset-2 ' + colors}>
        Load sample data
      </button>
    )

  const exportButton = (
    <span className="flex items-center gap-2">
      {exportError && <span className="font-semibold text-danger">{exportError}</span>}
      <button type="button" onClick={handleExport} disabled={!hasData || exporting} className={ui.btnSmallPrimary.replace('min-h-10', 'min-h-9').replace('text-[14px]', 'text-[13px]')}>
        {exporting ? 'Exporting…' : 'Export'}
      </button>
    </span>
  )

  return (
    <InsightsNav.Provider value={nav}>
      {/* On wide screens the sidebar is pinned outside the page flow, so the content is pushed right
          just enough to clear it. minmax(0, 1fr): below lg the sidebar's row of buttons scrolls
          sideways instead of widening the page. */}
      <div ref={top} className={'grid scroll-mt-[calc(var(--header-h,114px)+12px)] grid-cols-[minmax(0,1fr)] gap-5 lg:block ' + RAIL_PAD}>
        <Sidebar
          section={section}
          onSelect={selectSection}
          keys={summaries}
          inProfile={!!profile}
          sampleControl={sampleControl('text-muted hover:text-ink')}
          settingsControl={settingsControl('text-muted hover:text-ink')}
        />
        <SettingsDialog open={settingsOpen} settings={settings} defaultGoLive={defaultGoLive} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />

        <div className="mx-auto w-full max-w-[1760px] min-w-0 space-y-5">
          <Toolbar
            from={range.from}
            to={range.to}
            today={today}
            preset={preset}
            onPreset={choosePreset}
            onRange={chooseRange}
            days={r.dayCount}
            filters={filters}
            options={options}
            onFilters={setFilters}
            exportButton={exportButton}
            onCopyLink={copyLink}
            copied={copied}
          />

          {profile ? (
            <ProfileView
              key={`${profile.kind}:${profile.id}`}
              profile={profile}
              entries={scoped}
              allEntries={entries}
              range={range}
              now={now}
              settings={effective}
              fleet={r}
              fleetOps={ops}
              onBack={back}
              backLabel={backLabel}
            />
          ) : (
            <>
              <SectionHeading
                title={current.label}
                crumbs={['Insights', current.group]}
                info={
                  <>
                    {current.sub}.
                    {hasData && <span className="mt-1.5 block">{summaries[section].takeaway}</span>}
                  </>
                }
              />
              {!hasData ? (
                <Card
                  title="No visits in this range"
                  showSub
                  sub={activeFilters(filters).length ? 'Nothing matches the filters in this range. Clear a filter or pick a longer range.' : 'Pick a different range, or load the sample data to see how this tab works.'}
                >
                  <div className="px-5 pt-2 pb-5">{sampleControl()}</div>
                </Card>
              ) : (
                <>
                  {summaries[section].tone && summaries[section].alert && <Takeaway tone={summaries[section].tone}>{summaries[section].alert}</Takeaway>}
                  <View
                    r={r}
                    prev={prev}
                    trend={trend}
                    impact={impact}
                    prevImpact={prevImpact}
                    settings={settings}
                    onOpenSettings={() => setSettingsOpen(true)}
                    entries={scoped}
                    range={range}
                    ops={ops}
                    prevOps={prevOps}
                    now={now}
                  />
                </>
              )}
            </>
          )}

          {/* On narrow screens the sidebar is a row of buttons, so these links sit here. */}
          <div className="no-print flex flex-wrap gap-x-5 lg:hidden">
            {settingsControl()}
            {sampleControl()}
          </div>
        </div>
      </div>
    </InsightsNav.Provider>
  )
}
