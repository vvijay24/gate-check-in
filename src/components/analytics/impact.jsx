import { useEffect, useRef, useState } from 'react'
import * as ui from '../../ui'
import { duration } from '../../time'
import { BASELINE_FIELDS, DEFAULT_TARGETS, DOCK_RESPONSE, HANDOFFS } from '../../impactSettings'
import { Card, Meter, Tile } from './ui'
import { BarList, DayBars, DayLine, LIVE, SortTable, count, dur, money, pct, ptsDiff, shortDate } from './charts'
import { LeadRow, Pair, Tiles, visitCell } from './sections'

// The Overview sections about the digitization itself: what it is saving and what's still on the table
// (Digitization Impact), how fast the teams hand trucks on (Handoffs), and whether the records are
// complete and used live (Data Quality). Each gets `r` / `prev` (range figures), `trend`, `impact` /
// `prevImpact` (impactMetrics for this range and the one before) and `onOpenSettings`.

const perLoad = (v) => (v == null ? '—' : `$${v.toFixed(2)}`)
const perWeek = (v) => `${money(v)}/wk`
// "Passed → released by Shipping" → "passed → released by Shipping", for use mid-sentence.
const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)
// "▼ 12% vs the starting point" style comparison against the first two weeks from go-live.
function vsStart(value, base, format, lowerIsBetter = true) {
  if (value == null || base == null) return null
  const diff = value - base
  if (format(Math.abs(diff)) === format(0)) return 'Same as the starting point'
  const better = lowerIsBetter ? diff < 0 : diff > 0
  return (
    <span className={better ? 'font-semibold text-ok' : 'font-semibold text-danger'}>
      {diff > 0 ? '▲' : '▼'} {format(Math.abs(diff))} vs the starting point
    </span>
  )
}

function StartNote({ impact }) {
  return impact.start ? (
    <>
      Starting point: first two weeks from go-live ({shortDate(impact.start.from)}–{shortDate(impact.start.to)})
    </>
  ) : (
    <>The starting point forms after 2 weeks of use ({impact.daysSinceGoLive} day{impact.daysSinceGoLive === 1 ? '' : 's'} so far)</>
  )
}

export function ImpactSection({ r, prev, trend, impact, prevImpact, settings, onOpenSettings }) {
  const t = r.totals
  const p = prev.totals
  const s = impact.start
  const perLoadNow = t.live ? t.detentionCost / t.live : null
  const perLoadPrev = p.live ? p.detentionCost / p.live : null
  const overNow = t.live ? t.overFree / t.live : null
  const overPrev = p.live ? p.overFree / p.live : null
  const baseline = settings.baseline ?? {}
  const hasBaseline = Number(baseline.weeklyDetention) > 0
  const weeklyNow = r.dayCount ? (t.detentionCost / r.dayCount) * 7 : null

  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label="Money on the table"
            value={perWeek(impact.allOpportunityPerWeek)}
            note={`Est. detention avoidable if every handoff met its target · ${money(impact.allOpportunity)} in this range`}
            tone={impact.allOpportunity > 0 ? 'alert' : 'good'}
            trend={trend(impact.allOpportunityPerWeek, prevImpact.allOpportunityPerWeek, money, true)}
          />
        }
      >
        <Card title="Where the Money Is" sub="Est. detention avoided per week if only that handoff met its target · the biggest lever is in bold red">
          <BarList
            rows={impact.handoffs.map((h) => ({
              label: h.label,
              value: Math.round(h.opportunityPerWeek),
              text: perWeek(h.opportunityPerWeek),
              note: `${pct(h.onTargetPct)} on target`,
              strong: h === impact.biggest,
              color: h === impact.biggest ? 'var(--color-danger)' : 'var(--color-ink)',
            }))}
            empty="No departed trucks in this range."
          />
          <p className="px-5 pb-5 text-[13px] text-muted">
            Each row assumes only that handoff improves, so the rows don't add up to the total.{' '}
            <button type="button" onClick={onOpenSettings} className="cursor-pointer font-semibold text-ink underline">
              Change targets
            </button>
          </p>
        </Card>
      </LeadRow>

      <Card
        title="Weekly Detention Fees"
        sub={
          <>
            Est. fees for trucks checked in each week · <StartNote impact={impact} />
          </>
        }
      >
        <DayBars
          days={impact.weeks}
          series={[{ key: 'detention', label: 'Est. detention', color: LIVE }]}
          format={money}
          dayLabel={(w) => `Week of ${shortDate(w.from)}`}
          refLine={s ? { value: s.weeklyDetention, label: `Starting point ${perWeek(s.weeklyDetention)}` } : undefined}
        />
      </Card>

      <Tiles>
        <Tile
          size="compact"
          label="Detention per live load"
          value={perLoad(perLoadNow)}
          note={s ? vsStart(perLoadNow, s.perLoad, perLoad) : <StartNote impact={impact} />}
          trend={trend(perLoadNow, perLoadPrev, perLoad, true)}
        />
        <Tile
          size="compact"
          label="Loads past free time"
          value={pct(overNow)}
          note={s ? vsStart(overNow, s.overFreePct, ptsDiff) : <StartNote impact={impact} />}
          trend={trend(overNow, overPrev, ptsDiff, true)}
        />
        <Tile
          size="compact"
          label="Avg time on site"
          value={dur(t.avgOnSiteMs)}
          note={s ? vsStart(t.avgOnSiteMs, s.avgOnSiteMs, duration) : <StartNote impact={impact} />}
          trend={trend(t.avgOnSiteMs, p.avgOnSiteMs, duration, true)}
        />
        <Tile size="compact" label="Handoffs on target" value={pct(impact.onTargetPct)} note="All four handoffs together" trend={trend(impact.onTargetPct, prevImpact.onTargetPct, ptsDiff)} />
        <Tile size="compact" label="Mistakes caught" value={impact.quality.blocked + impact.quality.sealMismatches} note="Blocked check-outs and seal mismatches" />
        <Tile
          size="compact"
          label="Details not re-typed"
          value={count(impact.shared.total)}
          note={`About ${Math.round(impact.shared.perTruck ?? 0)} per truck, entered once at the Gate`}
          trend={trend(impact.shared.total, prevImpact.shared.total, count)}
        />
      </Tiles>

      <Card title="Before Digitization" sub="Compare with the paper-based months, once those figures are found (e.g. past detention invoices)">
        {hasBaseline ? (
          <div className="grid gap-3 px-5 pt-3 pb-5 sm:grid-cols-3">
            <BeforeNow label="Detention per week" before={money(Number(baseline.weeklyDetention))} now={money(weeklyNow)} better={weeklyNow < Number(baseline.weeklyDetention)} />
            {Number(baseline.loadsPerWeek) > 0 && (
              <BeforeNow
                label="Detention per live load"
                before={perLoad(Number(baseline.weeklyDetention) / Number(baseline.loadsPerWeek))}
                now={perLoad(perLoadNow)}
                better={perLoadNow < Number(baseline.weeklyDetention) / Number(baseline.loadsPerWeek)}
              />
            )}
            {Number(baseline.avgOnSiteMin) > 0 && (
              <BeforeNow
                label="Avg time on site"
                before={duration(Number(baseline.avgOnSiteMin) * 60000)}
                now={dur(t.avgOnSiteMs)}
                better={t.avgOnSiteMs < Number(baseline.avgOnSiteMin) * 60000}
              />
            )}
            <p className="text-sm sm:col-span-3">
              Saved in this range vs before: <b>{money(Math.max(0, (Number(baseline.weeklyDetention) / 7) * r.dayCount - t.detentionCost))}</b>{' '}
              <span className="text-muted">(est., from the weekly figure)</span>
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 px-5 pt-2 pb-5">
            <p className="text-muted">Add your pre-digital figures to see what's been saved since go-live.</p>
            <button type="button" onClick={onOpenSettings} className={ui.btnSmall}>
              Add figures
            </button>
          </div>
        )}
      </Card>
    </>
  )
}

function BeforeNow({ label, before, now, better }) {
  return (
    <div className={'rounded-lg border border-t-[5px] border-line px-4 py-3 ' + (better ? 'border-t-ok' : 'border-t-danger')}>
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2 tabular-nums">
        <span className="text-muted line-through">{before}</span>
        <span className="text-muted" aria-hidden="true">
          →
        </span>
        <span className="sr-only">before, now</span>
        <b className="text-[26px] leading-tight">{now}</b>
      </div>
    </div>
  )
}

const HANDOFF_COLUMNS = [
  {
    id: 'label',
    label: 'Handoff',
    value: (h) => HANDOFFS.findIndex((x) => x.key === h.key),
    render: (h) => (
      <>
        <b>{h.label}</b>
        <span className="block text-[13px] text-muted">{h.owner}</span>
      </>
    ),
  },
  { id: 'avg', label: 'Avg', value: (h) => h.avgMs, render: (h) => dur(h.avgMs), numeric: true },
  { id: 'target', label: 'Target', value: (h) => h.targetMin, render: (h) => `${h.targetMin}m`, numeric: true },
  {
    id: 'ontarget',
    label: 'On target',
    value: (h) => h.onTargetPct,
    numeric: true,
    render: (h) => (
      <span className="flex items-center justify-end gap-2">
        <span className="hidden w-24 sm:flex">
          <Meter value={h.onTargetPct ?? 0} className={h.onTargetPct >= 0.8 ? 'bg-ok' : h.onTargetPct >= 0.5 ? 'bg-signal' : 'bg-danger'} />
        </span>
        <span className="w-10">{pct(h.onTargetPct)}</span>
      </span>
    ),
  },
  { id: 'money', label: 'Money on the table', value: (h) => h.opportunityPerWeek, render: (h) => perWeek(h.opportunityPerWeek), numeric: true },
]

const STUCK_COLUMNS = [
  { id: 'visit', label: 'Truck', value: (s) => s.e.truckName ?? '', render: visitCell },
  { id: 'step', label: 'Stuck at', value: (s) => s.step, render: (s) => <b>{s.step}</b> },
  { id: 'since', label: 'For', value: (s) => s.sinceMs, render: (s) => dur(s.sinceMs), numeric: true },
  { id: 'over', label: 'Over target', value: (s) => s.overMs, render: (s) => <b className="text-danger">{dur(s.overMs)}</b>, numeric: true },
]

// One step of the Gate → Shipping chain.
function ChainStep({ title, value, note, children, tone }) {
  const edge = { good: 'border-t-ok', warn: 'border-t-signal', alert: 'border-t-danger' }[tone] ?? 'border-t-line'
  return (
    <div className={'min-w-0 rounded-lg border border-t-[5px] border-line px-3.5 py-3 ' + edge}>
      <div className="text-sm font-semibold text-muted">{title}</div>
      <div className="mt-0.5 text-[26px] leading-tight font-bold tabular-nums">{value}</div>
      <div className="text-[13px] text-muted">{note}</div>
      {children && <div className="mt-1 text-[12px]">{children}</div>}
    </div>
  )
}
const Arrow = () => (
  <span aria-hidden="true" className="hidden self-center text-[22px] text-muted lg:block">
    →
  </span>
)

// Arrival → check-in saved → Shipping sees it → dock assigned once one is free. On paper the middle
// step was a second form and a walk or a call; now it's one shared record.
function GateShippingCard({ impact, prevImpact, onOpenSettings }) {
  const g = impact.gateShipping
  const s = g.start
  const toneLive = g.livePct == null ? undefined : g.livePct >= 0.9 ? 'good' : 'warn'
  const toneResp = g.responseOnTargetPct == null ? undefined : g.responseOnTargetPct >= 0.8 ? 'good' : g.responseOnTargetPct >= 0.5 ? 'warn' : 'alert'
  return (
    <Card
      title="Gate → Shipping"
      sub={
        <>
          From the truck's arrival to its dock, once on two paper forms. The wait for a dock is split into time with no dock free for it (capacity) and time
          with a dock free but not yet assigned (response) ·{' '}
          <button type="button" onClick={onOpenSettings} className="cursor-pointer font-semibold text-ink underline">
            Change target
          </button>
        </>
      }
    >
      <div className="grid gap-3 px-5 pt-3 pb-5 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        <ChainStep title="1 · Arrival → check-in saved" value={dur(g.avgLoggedMs)} note={`${pct(g.livePct)} saved within 15 min`} tone={toneLive}>
          {s ? vsStart(g.avgLoggedMs, s.avgLoggedMs, duration) : null}
        </ChainStep>
        <Arrow />
        <ChainStep title="2 · Saved → Shipping sees it" value="Instant" note="One shared record: no second form, call or walk" tone="good" />
        <Arrow />
        <ChainStep title="3 · Waiting for a free dock" value={dur(g.avgNoDockMs)} note="Every dock busy, or taken by trucks ahead (capacity)">
          {s ? vsStart(g.avgNoDockMs, s.avgNoDockMs, duration) : null}
        </ChainStep>
        <Arrow />
        <ChainStep
          title={`4 · ${DOCK_RESPONSE.label}`}
          value={dur(g.avgFreeDockMs)}
          note={`${pct(g.responseOnTargetPct)} within ${g.targetMin} min · ${perWeek(g.opportunityPerWeek)} on the table`}
          tone={toneResp}
        >
          {s ? vsStart(g.avgFreeDockMs, s.avgFreeDockMs, duration) : trendWords(g.avgFreeDockMs, prevImpact.gateShipping.avgFreeDockMs)}
        </ChainStep>
      </div>
    </Card>
  )
}
// "▼ 3m vs previous period" for the chain, where no starting point exists yet.
function trendWords(value, base) {
  if (value == null || base == null) return null
  const diff = value - base
  if (duration(Math.abs(diff)) === duration(0)) return 'Same as the previous period'
  return (
    <span className={diff < 0 ? 'font-semibold text-ok' : 'font-semibold text-danger'}>
      {diff > 0 ? '▲' : '▼'} {duration(Math.abs(diff))} vs the previous period
    </span>
  )
}

export function HandoffSection({ trend, impact, prevImpact, onOpenSettings }) {
  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label="Handoffs on target"
            value={pct(impact.onTargetPct)}
            note="Share of team handoffs (dock, inspection, release, gate) done within their target"
            tone={impact.onTargetPct == null ? undefined : impact.onTargetPct >= 0.8 ? 'good' : 'warn'}
            trend={trend(impact.onTargetPct, prevImpact.onTargetPct, ptsDiff)}
          />
        }
      >
        <Card title="Handoffs on Target by Day" sub="All four handoffs together, by check-in day · gaps are days with no departed trucks">
          <DayLine
            days={impact.handoffDays}
            value={(d) => d.onTargetPct}
            max={1}
            format={pct}
            tip={(d) => (d.onTargetPct == null ? 'No departed trucks' : `${pct(d.onTargetPct)} on target of ${d.checks} handoffs`)}
          />
        </Card>
      </LeadRow>

      <GateShippingCard impact={impact} prevImpact={prevImpact} onOpenSettings={onOpenSettings} />

      <Card
        title="Each Handoff"
        sub={
          <>
            Average time, target and money on the table per week ·{' '}
            <button type="button" onClick={onOpenSettings} className="cursor-pointer font-semibold text-ink underline">
              Change targets
            </button>
          </>
        }
      >
        <SortTable columns={HANDOFF_COLUMNS} rows={impact.handoffs} rowKey={(h) => h.key} initial={{ id: 'label', dir: 'asc' }} minWidth={680} empty="No departed trucks in this range." />
      </Card>

      <Card title="Stuck Right Now" sub="Trucks on site that are over a handoff's target at this moment, longest over first">
        <SortTable columns={STUCK_COLUMNS} rows={impact.stuck} rowKey={(s) => s.e.id} initial={{ id: 'over', dir: 'desc' }} minWidth={640} empty="No trucks are over a handoff target right now." />
      </Card>
    </>
  )
}

const GUARD_COLUMNS = [
  { id: 'name', label: 'Guard', value: (g) => g.name, render: (g) => <b>{g.name}</b> },
  { id: 'checkIns', label: 'Check-ins', value: (g) => g.checkIns, numeric: true },
  { id: 'live', label: 'Logged live', value: (g) => g.livePct, render: (g) => pct(g.livePct), numeric: true },
  { id: 'edited', label: 'Corrected later', value: (g) => g.edited, numeric: true },
]

function Stat({ value, label }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <b className="block text-[26px] leading-tight tabular-nums">{value}</b>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  )
}

export function QualitySection({ r, impact }) {
  const q = impact.quality
  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label="Records complete"
            value={pct(q.completePct)}
            note={`of ${q.docked} departed trucks that had a dock have every timestamp: arrival, dock, inspection, release, check-out`}
            tone={q.completePct == null ? undefined : q.completePct >= 0.95 ? 'good' : 'warn'}
          />
        }
      >
        <Card title="Mistakes Caught by the System" sub="Things that could slip through on paper and are now stopped or flagged">
          <div className="grid grid-cols-2 gap-3 px-5 pt-3 pb-5 xl:grid-cols-4">
            <Stat value={q.blocked} label="Check-outs blocked: not inspected or not released" />
            <Stat value={q.sealMismatches} label={`Seal mismatches found at the gate (of ${q.sealChecks} checked)`} />
            <Stat value={r.inspections.failed} label="Failed inspections caught before loading out" />
            <Stat value={q.edited} label="Entries corrected after saving" />
          </div>
        </Card>
      </LeadRow>

      <Tiles>
        <Tile size="compact" label="Inspections fully answered" value={pct(q.answeredPct)} note={`of ${q.inspections} inspections`} />
        <Tile
          size="compact"
          label="Logged live"
          value={pct(q.livePct)}
          note="Saved within 15 min of the Time In"
          tone={q.livePct == null ? undefined : q.livePct >= 0.9 ? 'good' : 'warn'}
        />
        <Tile size="compact" label="Corrected after saving" value={pct(q.editedPct)} note={`${q.edited} of ${q.visits} entries`} />
        <Tile size="compact" label="Seal checks at the gate" value={count(q.sealChecks)} note={`${q.sealMismatches} didn't match`} />
      </Tiles>

      <Card
        title="One Form Instead of Two"
        sub={`Details the Gate enters once that Shipping and the Gate reuse without re-typing. On paper each was written on both forms: ${count(
          impact.shared.total,
        )} details this range, about ${Math.round(impact.shared.perTruck ?? 0)} per truck.`}
      >
        <BarList rows={impact.shared.byField.map((f) => ({ label: f.label, value: f.count }))} empty="No check-ins in this range." />
      </Card>

      <Card title="By Guard" sub="Who logs check-ins live and how often entries need correcting · click a heading to sort">
        <SortTable columns={GUARD_COLUMNS} rows={q.guards} initial={{ id: 'checkIns', dir: 'desc' }} minWidth={480} empty="No check-ins in this range." />
      </Card>
      <p className="text-[13px] text-muted">
        Blocked check-outs are counted from the day this was added; "logged live" covers entries saved since the app recorded save times.
      </p>
    </>
  )
}

// Sidebar figure and takeaway for the three sections (same shape as SUMMARY in sections.jsx).
export const IMPACT_SUMMARY = {
  impact: (r, prev, days, { impact }) => {
    const b = impact.biggest
    const s = impact.start
    const now = r.totals.live ? r.totals.detentionCost / r.totals.live : null
    return {
      key: `${perWeek(impact.allOpportunityPerWeek)} on the table`,
      tone: impact.allOpportunity > 0 ? 'alert' : undefined,
      takeaway: (
        <>
          Est. detention <b>{money(r.totals.detentionCost)}</b> in these {days} days. Meeting every handoff target would save about{' '}
          <b>{perWeek(impact.allOpportunityPerWeek)}</b>.{' '}
          {b?.opportunity > 0 && (
            <>
              The biggest lever is <b>{lcFirst(b.label)}</b> ({perWeek(b.opportunityPerWeek)}, {pct(b.onTargetPct)} on target).{' '}
            </>
          )}
          {s && now != null && s.perLoad != null && (
            <>
              Detention per load is {perLoad(now)} vs {perLoad(s.perLoad)} in the first two weeks.
            </>
          )}
        </>
      ),
    }
  },
  handoffs: (r, prev, days, { impact }) => {
    const weakest = [...impact.handoffs].filter((h) => h.onTargetPct != null).sort((a, b) => a.onTargetPct - b.onTargetPct)[0]
    return {
      key: `${pct(impact.onTargetPct)} on target`,
      tone: impact.onTargetPct != null && impact.onTargetPct < 0.8 ? 'warn' : undefined,
      takeaway: (
        <>
          <b>{pct(impact.onTargetPct)}</b> of handoffs met their targets.{' '}
          {weakest && (
            <>
              Weakest: <b>{lcFirst(weakest.label)}</b> ({pct(weakest.onTargetPct)} within {weakest.targetMin} min).{' '}
            </>
          )}
          Gate → Shipping: once a dock was free, Shipping took <b>{dur(impact.gateShipping.avgFreeDockMs)}</b> on average to assign it (
          {pct(impact.gateShipping.responseOnTargetPct)} within {impact.gateShipping.targetMin} min).{' '}
          {impact.stuck.length ? `${impact.stuck.length} truck${impact.stuck.length === 1 ? ' is' : 's are'} over a target right now.` : 'No truck is over a target right now.'}
        </>
      ),
    }
  },
  quality: (r, prev, days, { impact }) => {
    const q = impact.quality
    return {
      key: `${pct(q.completePct)} complete`,
      tone: q.completePct != null && q.completePct < 0.9 ? 'warn' : undefined,
      takeaway: (
        <>
          <b>{pct(q.completePct)}</b> of docked trucks have every timestamp and <b>{pct(q.livePct)}</b> of check-ins were logged live. The system
          stopped <b>{q.blocked}</b> check-out{q.blocked === 1 ? '' : 's'} and caught <b>{q.sealMismatches}</b> seal mismatch
          {q.sealMismatches === 1 ? '' : 'es'}.
        </>
      ),
    }
  },
}

// Go-live date, handoff targets and the optional pre-digital figures, in a pop-up.
export function SettingsDialog({ open, settings, defaultGoLive, onSave, onClose }) {
  const dialog = useRef(null)
  const [form, setForm] = useState(settings)

  useEffect(() => {
    if (open) {
      setForm(settings)
      if (!dialog.current?.open) dialog.current?.showModal()
    } else if (dialog.current?.open) {
      dialog.current.close()
    }
  }, [open, settings])

  const setTarget = (key, value) => setForm((f) => ({ ...f, targets: { ...f.targets, [key]: value } }))
  const setBaseline = (key, value) => setForm((f) => ({ ...f, baseline: { ...f.baseline, [key]: value } }))
  const submit = (ev) => {
    ev.preventDefault()
    // A blank or non-positive target falls back to its default.
    const targets = Object.fromEntries(
      [...HANDOFFS, DOCK_RESPONSE].map((h) => [h.key, Number(form.targets[h.key]) > 0 ? Number(form.targets[h.key]) : DEFAULT_TARGETS[h.key]]),
    )
    onSave({ ...form, targets })
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="impact-settings-title"
      onClose={onClose}
      onClick={(ev) => ev.target === dialog.current && onClose()}
      className="m-auto w-[95vw] max-w-[620px] rounded-[10px] border border-line bg-panel p-0 text-ink backdrop:bg-black/60"
    >
      {open && (
        <form onSubmit={submit} noValidate className="space-y-5 p-5">
          <h2 id="impact-settings-title" className="font-display text-[26px] leading-tight font-bold">
            Targets &amp; go-live
          </h2>

          <label className="flex flex-col gap-1">
            <span className={ui.label}>Go-live date</span>
            <input type="date" value={form.goLive} onChange={(e) => setForm((f) => ({ ...f, goLive: e.target.value }))} className={ui.input} />
            <span className="text-[13px] text-muted">
              The day the yard started using the app. Left blank, it's the first entry's date ({shortDate(defaultGoLive)}). The first two weeks from here are the
              starting point.
            </span>
          </label>

          <fieldset>
            <legend className={ui.label + ' mb-1'}>Handoff targets (minutes)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {[...HANDOFFS, DOCK_RESPONSE].map((h) => (
                <label key={h.key} className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">
                    {h.label}
                    {h === DOCK_RESPONSE && <span className="block text-[12px] font-normal text-muted">Gate → Shipping response, once a dock is free</span>}
                  </span>
                  <input type="number" min={1} value={form.targets[h.key]} onChange={(e) => setTarget(h.key, e.target.value)} className={ui.input} />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={ui.label + ' mb-1'}>Before digitization (optional)</legend>
            <p className="mb-2 text-[13px] text-muted">From the paper-based months, e.g. past detention invoices. Leave blank until you have them.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {BASELINE_FIELDS.map((b) => (
                <label key={b.key} className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{b.label}</span>
                  <input type="number" min={0} value={form.baseline?.[b.key] ?? ''} onChange={(e) => setBaseline(b.key, e.target.value)} className={ui.input} />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className={ui.btn}>
              Cancel
            </button>
            <button type="submit" className={ui.btnPrimary}>
              Save
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
