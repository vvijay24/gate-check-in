import { duration } from '../../time'
import { DETENTION_FREE_MIN, DETENTION_RATE_PER_HOUR } from '../../yard'
import { GATE_STYLE } from '../YardMap'
import { Card, Meter, Strip, Tile } from './ui'
import { ArrivalHistogram, DayView, StayHistogram } from './control'
import { ProfileLink } from './nav'
import { StageSpread } from './viz'
import {
  BarList,
  DROP,
  DayBars,
  DayLine,
  HourGrid,
  LIVE,
  Legend,
  STAGES,
  SortTable,
  StageBar,
  count,
  dur,
  hourLabel,
  minutesToDur,
  money,
  pct,
  ptsDiff,
  weekdayDate,
} from './charts'

// The five Analytics sections. Each gets `r` (this range), `prev` (the range before) and `trend`,
// which draws the ▲/▼ line under a tile. Each opens with its main figure beside its key chart, then
// a row of the other figures; SUMMARY (end of file) gives each its sidebar figure and takeaway line.

const FREE_H = DETENTION_FREE_MIN / 60
export const toMin = (ms) => (ms == null ? null : ms / 60000)
// Three per row until the screen is very wide, so the numbers never crowd beside the sidebar.
export const Tiles = ({ children }) => <Strip>{children}</Strip>
export const Pair = ({ children }) => <div className="grid gap-5 xl:grid-cols-2">{children}</div>
// The section's main figure (1/3) beside the chart that explains it (2/3); both stretch to the taller.
export const LeadRow = ({ lead, children }) => (
  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
    {lead}
    {children}
  </div>
)

// Breadcrumb trail, title and one-line description at the top of a section or drill-down page.
export function SectionHeading({ title, sub, crumbs = [] }) {
  return (
    <div className="min-w-0">
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-muted">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true" className="text-edge">/</span>}
              {c}
            </span>
          ))}
        </nav>
      )}
      <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.015em] break-words">{title}</h2>
      {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
    </div>
  )
}

// The section's one-line takeaway, read before the numbers.
export function Takeaway({ children }) {
  return (
    <div role="note" className="flex flex-col gap-1 rounded-xl border-l-[3px] border-l-signal bg-panel px-4 py-3 shadow-card sm:flex-row sm:gap-4">
      <span className="eyebrow shrink-0 pt-0.5 text-signal-line">Summary</span>
      <p className="text-[14px] leading-relaxed">{children}</p>
    </div>
  )
}

// Visit identity used by the visit tables.
export const visitCell = (s) => (
  <>
    <ProfileLink kind="visit" id={s.e.id}>
      {s.e.truckName || 'Unknown carrier'}
    </ProfileLink>
    <span className="block text-[13px] text-muted">
      Trailer {s.e.trailerNumber || '—'} · {weekdayDate(s.e.dateIn)} {s.e.timeIn}
    </span>
  </>
)

// The three stage columns; the longest stage of each visit is bold red, so the cause stands out.
const stageColumns = STAGES.map((x) => ({
  id: x.key,
  label: x.label,
  numeric: true,
  value: (s) => s[x.key],
  render: (s) => {
    const worst = STAGES.reduce((a, b) => ((s[b.key] ?? -1) > (s[a.key] ?? -1) ? b : a))
    return worst.key === x.key && s[x.key] != null ? <b className="text-danger">{dur(s[x.key])}</b> : dur(s[x.key])
  },
}))

export const VISIT_COLUMNS = [
  { id: 'visit', label: 'Visit', value: (s) => s.e.truckName ?? '', render: visitCell, minW: 190 },
  ...stageColumns,
  { id: 'total', label: 'Time on site', numeric: true, value: (s) => s.onSiteMs, render: (s) => <>{dur(s.onSiteMs)}{s.onSite && <span className="block text-[13px] text-muted">still on site</span>}</> },
  { id: 'cost', label: 'Est. detention', numeric: true, value: (s) => s.cost, render: (s) => (s.cost ? money(s.cost) : '—'), bar: 'danger' },
]

const partnerColumns = (kind, extra = []) => [
  {
    id: 'name',
    label: 'Name',
    value: (r) => r.name,
    render: (r) => (
      <ProfileLink kind={kind} id={r.name}>
        {r.name}
      </ProfileLink>
    ),
  },
  { id: 'visits', label: 'Visits', value: (r) => r.visits, numeric: true, bar: true },
  { id: 'turn', label: 'Avg turnaround', value: (r) => r.avgTurnMs, render: (r) => dur(r.avgTurnMs), numeric: true },
  ...extra,
  { id: 'ontime', label: 'On time', value: (r) => r.onTimePct, render: (r) => pct(r.onTimePct), numeric: true },
  { id: 'over', label: `Over ${FREE_H} h`, value: (r) => r.overFree, numeric: true },
  { id: 'cost', label: 'Est. detention', value: (r) => r.detentionCost, render: (r) => money(r.detentionCost), numeric: true, bar: 'danger' },
]

export function OverviewSection({ r, prev, trend, ops }) {
  const t = r.totals
  const p = prev.totals
  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label="Est. detention"
            value={money(t.detentionCost)}
            note={`${t.overFree} of ${t.live} live visits went past ${FREE_H} h free time · $${DETENTION_RATE_PER_HOUR}/h after that`}
            tone={t.detentionCost ? 'alert' : 'good'}
            trend={trend(t.detentionCost, p.detentionCost, money, true)}
            spark={{ values: r.days.map((d) => d.detentionCost), label: 'Est. detention per day' }}
          />
        }
      >
        <Card title="Where the Time Goes" sub="An average pickup's stay, stage by stage. The inspection time is when it was saved, so the middle stage includes loading.">
          <StageBar stages={r.stages} />
        </Card>
      </LeadRow>

      <Tiles>
        <Tile
          size="compact"
          label={`Over ${FREE_H} h free time`}
          value={t.overFree}
          note={`of ${t.live} live visits`}
          tone={t.overFree ? 'warn' : 'good'}
          trend={trend(t.overFree, p.overFree, count, true)}
          spark={{ values: r.days.map((d) => d.overFree), label: 'Visits past free time per day' }}
        />
        <Tile
          size="compact"
          label="Typical stay (p50)"
          value={dur(ops.stays.p50)}
          note={`Slow end (p90) ${dur(ops.stays.p90)} · average ${dur(t.avgOnSiteMs)}`}
          trend={trend(t.avgOnSiteMs, p.avgOnSiteMs, duration, true)}
          spark={{ values: ops.days.map((d) => d.medianStayMs), label: 'Typical stay per day' }}
        />
        <Tile
          size="compact"
          label="Avg wait for dock"
          value={dur(t.avgWaitDockMs)}
          note="Check-in to dock assigned"
          trend={trend(t.avgWaitDockMs, p.avgWaitDockMs, duration, true)}
          spark={{ values: r.days.map((d) => d.avgWaitDockMs), label: 'Average wait for a dock per day' }}
        />
        <Tile
          size="compact"
          label="Avg dock → inspected"
          value={dur(t.avgToInspectMs)}
          note="Includes loading"
          trend={trend(t.avgToInspectMs, p.avgToInspectMs, duration, true)}
          spark={{ values: r.days.map((d) => d.avgToInspectMs), label: 'Average dock to inspected per day' }}
        />
        <Tile
          size="compact"
          label="Inspections passed"
          value={pct(r.inspections.passPct)}
          note={r.inspections.count ? `${r.inspections.passed} of ${r.inspections.count}` : 'No inspections'}
          tone={r.inspections.passPct == null ? undefined : r.inspections.passPct === 1 ? 'good' : 'warn'}
          trend={trend(r.inspections.passPct, prev.inspections.passPct, ptsDiff)}
        />
      </Tiles>

      <Pair>
        <Card title="Time on Site" sub={`Departed live visits, in 20-minute steps · ${pct(ops.stays.overFreePct)} stayed past ${FREE_H} h free time`}>
          <StayHistogram stays={ops.stays} />
        </Card>
        <Card title="Est. Detention Cost per Day" sub={`Live visits checked in each day · time past ${DETENTION_FREE_MIN} min × $${DETENTION_RATE_PER_HOUR}/h`}>
          <DayBars days={r.days} series={[{ key: 'detentionCost', label: 'Est. detention', color: LIVE }]} format={money} />
        </Card>
      </Pair>

      <Card title="Longest Stays" sub="The longest live visits in this range. The longest stage of each is in red. Click a heading to sort.">
        <SortTable columns={VISIT_COLUMNS} rows={r.longest} rowKey={(s) => s.e.id} initial={{ id: 'total', dir: 'desc' }} minWidth={860} empty="No live visits in this range." />
      </Card>
    </>
  )
}

export function ThroughputSection({ r, prev, trend, ops }) {
  const t = r.totals
  const p = prev.totals
  const a = r.arrivals
  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label="On-time arrival"
            value={pct(t.onTimePct)}
            note={t.scheduled ? `${t.onTime} of ${t.scheduled} appointments arrived no more than 15 min late` : 'No appointments'}
            tone={t.onTimePct == null ? undefined : t.onTimePct >= 0.8 ? 'good' : 'warn'}
            trend={trend(t.onTimePct, p.onTimePct, ptsDiff)}
            spark={{ values: r.days.map((d) => d.onTimePct), label: 'On-time arrival per day' }}
          />
        }
      >
        <Card title="On-time Arrival by Day" sub="Gaps are days with no appointments">
          <DayLine
            days={r.days}
            value={(d) => d.onTimePct}
            max={1}
            format={pct}
            tip={(d) => (d.onTimePct == null ? 'No appointments' : `${pct(d.onTimePct)} on time of ${d.scheduled} appointments`)}
          />
        </Card>
      </LeadRow>

      <Tiles>
        <Tile
          size="compact"
          label="Visits"
          value={t.visits}
          note={`${t.live} live · ${t.drops} drop`}
          trend={trend(t.visits, p.visits, count)}
          spark={{ values: r.days.map((d) => d.visits), label: 'Visits per day' }}
        />
        <Tile size="compact" label="Late arrivals" value={a.late} note="Over 15 min after appointment" trend={trend(a.late, prev.arrivals.late, count, true)} />
        <Tile size="compact" label="Avg gate dwell" value={dur(t.avgGateDwellMs)} note={`${t.departedLive} live visits checked out`} trend={trend(t.avgGateDwellMs, p.avgGateDwellMs, duration, true)} />
        {Object.entries(r.gates).map(([gate, c]) => (
          <Tile key={gate} size="compact" label={GATE_STYLE[gate]?.label ?? gate} value={gate === 'Gate 1' ? c.in : c.out} note={`${c.in} in · ${c.out} out`} />
        ))}
      </Tiles>

      <Pair>
        <Card title="Visits per Day" sub="Checked in each day" legend={<Legend items={[['Live', LIVE], ['Drop', DROP]]} />}>
          <DayBars days={r.days} series={[{ key: 'live', label: 'Live', color: LIVE }, { key: 'drops', label: 'Drop', color: DROP }]} />
        </Card>
        <Card
          title="Arrivals vs Appointment"
          sub={`Minutes early (−) or late (+) · ${a.early} early, ${a.onTime} on time, ${a.late} late · ${a.unscheduled} without an appointment aren't shown`}
        >
          <ArrivalHistogram arrival={ops.arrival} />
        </Card>
      </Pair>

      <Pair>
        <Card title="Departures per Day" sub="Trucks and trailers checked out at Gate 2 each day">
          <DayBars days={ops.days} series={[{ key: 'departures', label: 'Departures', color: LIVE }]} />
        </Card>
        <Card title="Peak on Site per Day" sub="Most trucks and trailers on site at once, every 10 minutes">
          <DayBars days={ops.days} series={[{ key: 'peakOnSite', label: 'Peak on site', color: LIVE }]} />
        </Card>
      </Pair>

      <Card title="Busiest Hours" sub="Check-ins by day and hour">
        <HourGrid days={r.days} field="hourly" noun="check-ins" />
      </Card>
    </>
  )
}

export function CustomersSection({ r, prev, trend }) {
  const s = r.shipping
  const p = prev.shipping
  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label={`Pickups over ${FREE_H} h free time`}
            value={s.overFree}
            note={`of ${s.pickups} pickups · est. ${money(s.detentionCost)} in detention`}
            tone={s.overFree ? 'alert' : 'good'}
            trend={trend(s.overFree, p.overFree, count, true)}
          />
        }
      >
        <Card title="Pickups per Day" sub="Live visits with Pickup ticked, by check-in day">
          <DayBars days={r.days} series={[{ key: 'pickups', label: 'Pickups', color: LIVE }]} />
        </Card>
      </LeadRow>

      <Tiles>
        <Tile
          size="compact"
          label="Pickups"
          value={s.pickups}
          note="Live visits with Pickup ticked"
          trend={trend(s.pickups, p.pickups, count)}
          spark={{ values: r.days.map((d) => d.pickups), label: 'Pickups per day' }}
        />
        <Tile size="compact" label="Avg turnaround" value={dur(s.avgTurnMs)} note="Check-in to check-out" trend={trend(s.avgTurnMs, p.avgTurnMs, duration, true)} />
        <Tile
          size="compact"
          label="On-time pickups"
          value={pct(s.onTimePct)}
          note={s.scheduled ? `${s.scheduled} with an appointment` : 'No appointments'}
          tone={s.onTimePct == null ? undefined : s.onTimePct >= 0.8 ? 'good' : 'warn'}
          trend={trend(s.onTimePct, p.onTimePct, ptsDiff)}
        />
        <Tile size="compact" label="Est. detention" value={money(s.detentionCost)} note="Pickups only" tone={s.detentionCost ? 'alert' : 'good'} trend={trend(s.detentionCost, p.detentionCost, money, true)} />
        <Tile size="compact" label="Customers" value={r.customers.length} note="With a pickup in this range" />
      </Tiles>

      <Card title="Stay by Customer" sub={`Typical (p50) to slow-end (p90) time on site for each customer's pickups, against the ${FREE_H} h free time · busiest 8`}>
        <PartnerSpread rows={r.customers} kind="customer" />
      </Card>

      <Card title="Customers" sub="Pickups with a customer filled in · click a name to open it, a heading to sort">
        <SortTable
          columns={partnerColumns('customer', [{ id: 'inspect', label: 'Dock → inspected', value: (c) => c.avgToInspectMs, render: (c) => dur(c.avgToInspectMs), numeric: true }])}
          rows={r.customers}
          initial={{ id: 'cost', dir: 'desc' }}
          minWidth={820}
          empty="No pickups with a customer in this range."
        />
      </Card>
    </>
  )
}

const DOCK_COLUMNS = [
  {
    id: 'dock',
    label: 'Dock',
    value: (d) => Number(d.dock),
    render: (d) => (
      <ProfileLink kind="dock" id={d.dock}>
        Dock {d.dock}
      </ProfileLink>
    ),
    numeric: true,
  },
  { id: 'loads', label: 'Loads', value: (d) => d.loads, numeric: true, bar: true },
  {
    id: 'util',
    label: 'Utilization',
    value: (d) => d.utilization,
    numeric: true,
    render: (d) => (
      <span className="flex items-center justify-end gap-2">
        <span className="hidden w-20 sm:flex">
          <Meter value={d.utilization ?? 0} className="bg-chart-live" />
        </span>
        <span className="w-10">{pct(d.utilization)}</span>
      </span>
    ),
  },
  { id: 'wait', label: 'Avg wait for dock', value: (d) => d.avgWaitMs, render: (d) => dur(d.avgWaitMs), numeric: true },
  { id: 'inspect', label: 'Avg dock → inspected', value: (d) => d.avgToInspectMs, render: (d) => dur(d.avgToInspectMs), numeric: true },
  { id: 'dwell', label: 'Avg time at dock', value: (d) => d.avgDwellMs, render: (d) => dur(d.avgDwellMs), numeric: true },
  { id: 'cost', label: 'Est. detention', value: (d) => d.detentionCost, render: (d) => money(d.detentionCost), numeric: true, bar: 'danger' },
]

export function DockSection({ r, prev, trend, impact, ops, prevOps, entries, now }) {
  // The wait split into capacity (no dock free for the truck) and response (a dock free, not assigned).
  const g = impact?.gateShipping
  const split = g?.docked ? ` · ${dur(g.avgNoDockMs)} with no dock free · ${dur(g.avgFreeDockMs)} with a dock free` : ''
  const t = r.totals
  const p = prev.totals
  const loads = r.docks.reduce((s, d) => s + d.loads, 0)
  const cost = r.docks.reduce((s, d) => s + d.detentionCost, 0)
  const prevCost = prev.docks.reduce((s, d) => s + d.detentionCost, 0)
  const waitingLong = r.days.filter((d) => d.avgWaitDockMs > 30 * 60000).length
  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label="Avg wait for a dock"
            value={dur(t.avgWaitDockMs)}
            note={`Check-in to dock assigned${split} · ${waitingLong} day${waitingLong === 1 ? '' : 's'} averaged over 30 min`}
            tone={waitingLong ? 'warn' : 'good'}
            trend={trend(t.avgWaitDockMs, p.avgWaitDockMs, duration, true)}
            spark={{ values: r.days.map((d) => d.avgWaitDockMs), label: 'Average wait for a dock per day' }}
          />
        }
      >
        <Card title="Wait for a Dock by Day" sub="Average check-in to dock assigned, live visits">
          <DayLine
            days={r.days}
            value={(d) => toMin(d.avgWaitDockMs)}
            format={minutesToDur}
            tip={(d) => (d.avgWaitDockMs == null ? 'No docks assigned' : `Average wait ${dur(d.avgWaitDockMs)}`)}
          />
        </Card>
      </LeadRow>

      <Tiles>
        <Tile
          size="compact"
          label="Docks in use"
          value={pct(ops.dockUse)}
          note="Share of operating hours, all docks"
          trend={trend(ops.dockUse, prevOps.dockUse, ptsDiff)}
          spark={{ values: ops.days.map((d) => d.dockUse), label: 'Dock use per day' }}
        />
        <Tile size="compact" label="Loads at docks" value={loads} note={`Across ${r.docks.length} docks`} trend={trend(loads, prev.docks.reduce((s, d) => s + d.loads, 0), count)} />
        <Tile size="compact" label="Avg dock → inspected" value={dur(t.avgToInspectMs)} note="Includes loading" trend={trend(t.avgToInspectMs, p.avgToInspectMs, duration, true)} />
        <Tile size="compact" label="Days with long waits" value={waitingLong} note="Avg wait for a dock over 30 min" tone={waitingLong ? 'warn' : 'good'} />
        <Tile size="compact" label="Est. detention" value={money(cost)} note="Live visits by dock assigned" tone={cost ? 'alert' : 'good'} trend={trend(cost, prevCost, money, true)} />
      </Tiles>

      <DayView entries={entries} now={now} dates={r.days.map((d) => d.date)} docksOnly />

      <Card title="Dock Assignments by Hour" sub="When trucks got a dock">
        <HourGrid days={r.days} field="dockHourly" noun="dock assignments" />
      </Card>

      <Card title="Dock Performance" sub="Docks assigned in this range · utilization is the share of operating hours a dock was in use · click a dock to open it">
        <SortTable columns={DOCK_COLUMNS} rows={r.docks.map((d) => ({ ...d, utilization: ops.dockUseByDock[d.dock] ?? d.utilization }))} rowKey={(d) => d.dock} initial={{ id: 'dock', dir: 'asc' }} minWidth={820} empty="No docks assigned in this range." />
      </Card>
    </>
  )
}

// Stay per partner as a p50–p90 spread against free time, busiest first.
const FREE_MS = DETENTION_FREE_MIN * 60000
export function PartnerSpread({ rows, kind, limit = 8 }) {
  const list = [...rows]
    .filter((p) => p.p50StayMs != null)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
    .map((p) => ({
      key: p.name,
      label: p.name,
      node: (
        <ProfileLink kind={kind} id={p.name}>
          {p.name}
        </ProfileLink>
      ),
      owner: `${p.visits} visits`,
      n: p.departed,
      p50: p.p50StayMs,
      p90: p.p90StayMs,
      max: p.maxStayMs,
      target: FREE_MS,
      onTargetPct: p.withinFreePct,
    }))
  if (!list.length) return <p className="px-5 pt-2 pb-5 text-muted">No departed visits in this range.</p>
  return <StageSpread stages={list} words={{ target: `Free time (${FREE_H} h)`, on: 'within free time', unit: 'departed', over: 'Past free time' }} />
}

const CARRIER_COLUMNS = (total) => [
  ...partnerColumns('carrier').slice(0, 2),
  { id: 'share', label: 'Share', value: (r) => (total ? r.visits / total : null), render: (r) => pct(total ? r.visits / total : null), numeric: true },
  { id: 'p50', label: 'Typical stay', value: (r) => r.p50StayMs, render: (r) => dur(r.p50StayMs), numeric: true },
  { id: 'p90', label: 'Slow end', value: (r) => r.p90StayMs, render: (r) => dur(r.p90StayMs), numeric: true },
  { id: 'ontime', label: 'On time', value: (r) => r.onTimePct, render: (r) => pct(r.onTimePct), numeric: true },
  { id: 'within', label: 'Within free time', value: (r) => r.withinFreePct, render: (r) => pct(r.withinFreePct), numeric: true },
  { id: 'per', label: '$ per visit', value: (r) => r.perVisit, render: (r) => (r.perVisit == null ? '—' : `$${r.perVisit.toFixed(2)}`), numeric: true },
  { id: 'cost', label: 'Est. detention', value: (r) => r.detentionCost, render: (r) => money(r.detentionCost), numeric: true, bar: 'danger' },
]

export function CarriersSection({ r, prev, trend }) {
  const list = [...r.carriers].sort((a, b) => b.detentionCost - a.detentionCost)
  const total = r.carriers.reduce((s, c) => s + c.visits, 0)
  const cost = r.totals.detentionCost
  const top3 = list.slice(0, 3).reduce((s, c) => s + c.detentionCost, 0)
  const onTime = [...r.carriers].filter((c) => c.onTimePct != null && c.visits >= 3).sort((a, b) => b.onTimePct - a.onTimePct)
  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label="Detention from the top 3 carriers"
            value={money(top3)}
            note={`${pct(cost ? top3 / cost : null)} of all est. detention · ${r.carriers.length} carriers made live visits`}
            tone={top3 ? 'alert' : 'good'}
            trend={trend(cost, prev.totals.detentionCost, money, true)}
          />
        }
      >
        <Card title="Detention by Carrier" sub="Est. detention in this range, costliest first · click a carrier to open it">
          <BarList
            rows={list.slice(0, 8).map((c, i) => ({
              label: c.name,
              node: (
                <ProfileLink kind="carrier" id={c.name}>
                  {c.name}
                </ProfileLink>
              ),
              value: Math.round(c.detentionCost),
              text: money(c.detentionCost),
              note: `${c.overFree} over ${FREE_H} h`,
              strong: i === 0,
              color: i === 0 ? 'var(--color-danger)' : 'var(--color-ink)',
            }))}
            empty="No live visits in this range."
          />
        </Card>
      </LeadRow>

      <Strip cols="grid-cols-2 xl:grid-cols-4">
        <Tile size="compact" label="Carriers" value={r.carriers.length} note={`${total} live visits between them`} />
        <Tile
          size="compact"
          label="Most on time"
          value={onTime[0]?.name ?? '—'}
          note={onTime[0] ? `${pct(onTime[0].onTimePct)} of appointments on time` : 'Needs 3+ visits with an appointment'}
          tone={onTime[0] ? 'good' : undefined}
        />
        <Tile
          size="compact"
          label="Least on time"
          value={onTime.length > 1 ? onTime[onTime.length - 1].name : '—'}
          note={onTime.length > 1 ? `${pct(onTime[onTime.length - 1].onTimePct)} of appointments on time` : 'Needs 2+ carriers to compare'}
          tone={onTime.length > 1 ? 'warn' : undefined}
        />
        <Tile
          size="compact"
          label="Busiest carrier"
          value={[...r.carriers].sort((a, b) => b.visits - a.visits)[0]?.name ?? '—'}
          note={(() => {
            const b = [...r.carriers].sort((a, b) => b.visits - a.visits)[0]
            return b ? `${b.visits} visits · ${pct(total ? b.visits / total : null)} of all` : 'No visits'
          })()}
        />
      </Strip>

      <Card title="Stay by Carrier" sub={`Typical (p50) to slow-end (p90) time on site, against the ${FREE_H} h free time · busiest 8 carriers`}>
        <PartnerSpread rows={r.carriers} kind="carrier" />
      </Card>

      <Card title="Carrier Scorecard" sub="Live visits (drops left out) · click a carrier to open it, a heading to sort">
        <SortTable columns={CARRIER_COLUMNS(total)} rows={r.carriers} initial={{ id: 'cost', dir: 'desc' }} minWidth={980} empty="No live visits in this range." />
      </Card>
    </>
  )
}

const INSPECTOR_COLUMNS = [
  { id: 'name', label: 'Inspected by', value: (r) => r.name, render: (r) => <b>{r.name}</b> },
  { id: 'visits', label: 'Inspections', value: (r) => r.visits, numeric: true, bar: true },
  { id: 'pass', label: 'Passed', value: (r) => r.passPct, render: (r) => pct(r.passPct), numeric: true },
  { id: 'inspect', label: 'Avg dock → inspected', value: (r) => r.avgToInspectMs, render: (r) => dur(r.avgToInspectMs), numeric: true },
  { id: 'over', label: `Over ${FREE_H} h`, value: (r) => r.overFree, numeric: true },
  { id: 'cost', label: 'Est. detention', value: (r) => r.detentionCost, render: (r) => money(r.detentionCost), numeric: true },
]

const LATE_INSPECTION_COLUMNS = [
  { id: 'visit', label: 'Visit', value: (s) => s.e.truckName ?? '', render: visitCell },
  { id: 'dock', label: 'Dock', value: (s) => s.e.dockDoor || null, render: (s) => (s.e.dockDoor ? `Dock ${s.e.dockDoor}` : '—') },
  ...stageColumns.slice(0, 2),
  {
    id: 'reached',
    label: 'Inspected after',
    numeric: true,
    value: (s) => s.arrivalToInspectMs,
    render: (s) => (
      <>
        {dur(s.arrivalToInspectMs)}
        <span className="block text-[13px] text-danger">{dur(s.arrivalToInspectMs - DETENTION_FREE_MIN * 60000)} past free time</span>
      </>
    ),
  },
  { id: 'cost', label: 'Est. detention', numeric: true, value: (s) => s.cost, render: (s) => (s.cost ? money(s.cost) : '—') },
]

export function InspectionSection({ r, prev, trend }) {
  const i = r.inspections
  const p = prev.inspections
  return (
    <>
      <LeadRow
        lead={
          <Tile
            size="lead"
            label="Inspected past free time"
            value={i.late.length}
            note={`of ${i.count} inspections weren't saved within ${FREE_H} h of the truck arriving`}
            tone={i.late.length ? 'alert' : 'good'}
            trend={trend(i.late.length, p.late.length, count, true)}
          />
        }
      >
        <Card title="Dock → Inspected by Day" sub="Average dock assigned to inspection saved, by check-in day">
          <DayLine
            days={r.days}
            value={(d) => toMin(d.avgToInspectMs)}
            format={minutesToDur}
            tip={(d) => (d.avgToInspectMs == null ? 'No inspections' : `Average ${dur(d.avgToInspectMs)} · ${d.inspections} inspections`)}
          />
        </Card>
      </LeadRow>

      <Tiles>
        <Tile
          size="compact"
          label="Inspections"
          value={i.count}
          note="Loading inspections saved"
          trend={trend(i.count, p.count, count)}
          spark={{ values: r.days.map((d) => d.inspections), label: 'Inspections per day' }}
        />
        <Tile
          size="compact"
          label="Passed"
          value={pct(i.passPct)}
          note={i.count ? `${i.passed} of ${i.count}` : 'No inspections'}
          tone={i.passPct == null ? undefined : i.passPct === 1 ? 'good' : 'warn'}
          trend={trend(i.passPct, p.passPct, ptsDiff)}
        />
        <Tile size="compact" label="Failed" value={i.failed} note="Needed corrective action" tone={i.failed ? 'alert' : 'good'} trend={trend(i.failed, p.failed, count, true)} />
        <Tile size="compact" label="Avg dock → inspected" value={dur(i.avgToInspectMs)} note="Includes loading" trend={trend(i.avgToInspectMs, p.avgToInspectMs, duration, true)} />
        <Tile size="compact" label="Avg waiting for release" value={dur(i.avgToReleaseMs)} note="Inspection passed to Shipping release" trend={trend(i.avgToReleaseMs, p.avgToReleaseMs, duration, true)} />
        <Tile size="compact" label="Avg released → out" value={dur(i.avgReleaseToOutMs)} note="Shipping release to gate check-out" trend={trend(i.avgReleaseToOutMs, p.avgReleaseToOutMs, duration, true)} />
      </Tiles>

      <Card title="Failure Reasons" sub="Issues noted on failed inspections">
        <BarList rows={i.issues.map((x) => ({ label: x.issue, value: x.count }))} color="var(--color-danger)" empty="No failed inspections in this range." />
      </Card>

      <Card title="Inspected After Free Time" sub={`Inspections saved more than ${FREE_H} h after the truck arrived, latest first · these trucks were already in detention`}>
        <SortTable
          columns={LATE_INSPECTION_COLUMNS}
          rows={i.late}
          rowKey={(s) => s.e.id}
          initial={{ id: 'reached', dir: 'desc' }}
          minWidth={820}
          empty="Every inspection in this range was done within free time."
        />
      </Card>

      <Card title="Inspectors" sub="Who saved each inspection · click a heading to sort">
        <SortTable columns={INSPECTOR_COLUMNS} rows={i.inspectors} initial={{ id: 'visits', dir: 'desc' }} minWidth={680} empty="No inspections in this range." />
      </Card>
    </>
  )
}

// ---- Sidebar figure and takeaway line for each section ----

// "▼ $55 vs the previous 7 days", or '' when there's nothing to compare.
function change(value, base, format, days) {
  if (value == null || base == null) return ''
  const diff = value - base
  if (format(Math.abs(diff)) === format(0)) return `, the same as the previous ${days} days`
  return `, ${diff > 0 ? '▲' : '▼'} ${format(Math.abs(diff))} vs the previous ${days} days`
}

const STAGE_WORDS = {
  waitDockMs: 'waiting for a dock',
  toInspectMs: 'at the dock before inspection (includes loading)',
  toReleaseMs: 'waiting for Shipping to release it after inspection',
  releaseToOutMs: 'between Shipping release and check-out at the gate',
}

// For each section: `key` is the figure beside its sidebar item (with a tone when it needs attention);
// `takeaway` is the plain sentence at the top of the section.
export const SUMMARY = {
  overview: (r, prev, days) => {
    const t = r.totals
    const longest = STAGES.reduce((a, b) => ((r.stages[b.key] ?? -1) > (r.stages[a.key] ?? -1) ? b : a))
    const base = prev.totals.visits ? prev.totals.detentionCost : null
    return {
      key: money(t.detentionCost),
      tone: t.overFree ? 'alert' : undefined,
      takeaway: (
        <>
          {r.stages.count ? (
            <>
              The longest wait is <b>{STAGE_WORDS[longest.key]}</b>: {dur(r.stages[longest.key])} on average.{' '}
            </>
          ) : null}
          Est. detention <b>{money(t.detentionCost)}</b> from {t.overFree} visits past free time{change(t.detentionCost, base, money, days)}.
        </>
      ),
    }
  },
  gate: (r, prev, days) => {
    const t = r.totals
    const byHour = Array.from({ length: 24 }, (_, h) => r.days.reduce((s, d) => s + d.hourly[h], 0))
    const peak = byHour.indexOf(Math.max(...byHour))
    const base = prev.totals.visits ? prev.totals.onTimePct : null
    return {
      key: `${pct(t.onTimePct)} on time`,
      tone: t.onTimePct != null && t.onTimePct < 0.8 ? 'warn' : undefined,
      takeaway: (
        <>
          <b>{pct(t.onTimePct)}</b> of appointments arrived on time ({r.arrivals.late} late){change(t.onTimePct, base, ptsDiff, days)}.{' '}
          {byHour[peak] > 0 && (
            <>
              Busiest hour: <b>{hourLabel(peak)}</b> with {byHour[peak]} check-ins.
            </>
          )}
        </>
      ),
    }
  },
  carriers: (r, prev, days) => {
    const list = [...r.carriers].sort((a, b) => b.detentionCost - a.detentionCost)
    const w = list[0]
    const slow = [...r.carriers].filter((c) => c.p90StayMs != null && c.visits >= 3).sort((a, b) => b.p90StayMs - a.p90StayMs)[0]
    return {
      key: `${r.carriers.length} carriers`,
      tone: undefined,
      takeaway: (
        <>
          {w?.detentionCost > 0 ? (
            <>
              <ProfileLink kind="carrier" id={w.name}>
                {w.name}
              </ProfileLink>{' '}
              cost the most in detention ({money(w.detentionCost)}, {w.overFree} visits past free time).{' '}
            </>
          ) : (
            'No carrier ran past free time in this range. '
          )}
          {slow && (
            <>
              Slowest slow end: <b>{slow.name}</b> ({dur(slow.p90StayMs)} at p90).
            </>
          )}
        </>
      ),
    }
  },
  shipping: (r, prev, days) => {
    const s = r.shipping
    const worst = [...r.customers].sort((a, b) => b.detentionCost - a.detentionCost)[0]
    const base = prev.totals.visits ? prev.shipping.overFree : null
    return {
      key: `${s.overFree} over ${FREE_H} h`,
      tone: s.overFree ? 'alert' : undefined,
      takeaway: (
        <>
          <b>{s.overFree}</b> of {s.pickups} pickups went past free time, est. <b>{money(s.detentionCost)}</b>
          {change(s.overFree, base, count, days)}.{' '}
          {worst?.detentionCost > 0 && (
            <>
              Costliest customer: <b>{worst.name}</b> ({money(worst.detentionCost)}).
            </>
          )}
        </>
      ),
    }
  },
  docks: (r, prev, days) => {
    const t = r.totals
    const used = r.docks.filter((d) => d.avgToInspectMs != null)
    const slow = [...used].sort((a, b) => b.avgToInspectMs - a.avgToInspectMs)[0]
    const fast = [...used].sort((a, b) => a.avgToInspectMs - b.avgToInspectMs)[0]
    const base = prev.totals.visits ? prev.totals.avgWaitDockMs : null
    return {
      key: `${dur(t.avgWaitDockMs)} wait`,
      tone: t.avgWaitDockMs > 30 * 60000 ? 'warn' : undefined,
      takeaway: (
        <>
          Trucks waited <b>{dur(t.avgWaitDockMs)}</b> on average for a dock{change(t.avgWaitDockMs, base, duration, days)}.{' '}
          {slow && fast && slow !== fast && (
            <>
              Dock {slow.dock} took longest to inspection (<b>{dur(slow.avgToInspectMs)}</b>); Dock {fast.dock} was quickest ({dur(fast.avgToInspectMs)}).
            </>
          )}
        </>
      ),
    }
  },
  inspections: (r, prev, days) => {
    const i = r.inspections
    const base = prev.totals.visits ? prev.inspections.late.length : null
    return {
      key: `${i.late.length} late`,
      tone: i.late.length ? 'alert' : undefined,
      takeaway: (
        <>
          {i.count} inspections, <b>{pct(i.passPct)}</b> passed. Average <b>{dur(i.avgToInspectMs)}</b> from dock to inspection;{' '}
          <b>{i.late.length}</b> weren't done within {FREE_H} h of arrival{change(i.late.length, base, count, days)}.
        </>
      ),
    }
  },
}
