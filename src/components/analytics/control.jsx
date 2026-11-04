import { useMemo, useState } from 'react'
import { clockTime, dayKey, duration } from '../../time'
import { DETENTION_FREE_MIN } from '../../yard'
import { opsDay } from '../../ops'
import { Card, Strip, Tile } from './ui'
import { dur, money, pct, ptsDiff } from './charts'
import { STUCK_COLUMNS } from './impact'
import { SortTable } from './charts'
import { DayPicker, DockGantt, DockLegend, Histogram, OnSiteQueue, StageSpread, YardLoad, YardLoadLegend } from './viz'

// Operations Control: the control-tower view of the yard. What's on site now, how the yard and each
// dock ran through a day, and how stays and handoffs are spread, not just their averages.

const FREE_MS = DETENTION_FREE_MIN * 60000
const FREE_H = DETENTION_FREE_MIN / 60
const STEP = 20 * 60000

// ---------- Distributions, shared with the other sections ----------

export function StayHistogram({ stays }) {
  const n = stays.bins.length
  return (
    <Histogram
      bins={stays.bins}
      noun="visits"
      binLabel={(b) => (b.to == null ? `${duration(b.from)} or more` : `${duration(b.from)} to ${duration(b.to)}`)}
      edge={(i) => (i < n && (i * STEP) % 3600000 === 0 ? (i ? `${(i * STEP) / 3600000}h` : '0') : null)}
      regions={[{ from: FREE_MS, to: null, label: '⚠ Detention', tone: 'danger' }]}
      markers={
        stays.p50 == null
          ? []
          : [
              { value: stays.p50, label: `Typical (p50) ${dur(stays.p50)}` },
              { value: stays.p90, label: `Slow end (p90) ${dur(stays.p90)}`, dashed: true },
            ]
      }
    />
  )
}

const signed = (m) => (m > 0 ? `+${m}` : String(m))
export function ArrivalHistogram({ arrival }) {
  const n = arrival.bins.length
  return (
    <Histogram
      bins={arrival.bins}
      noun="arrivals"
      binLabel={(b) =>
        b.from == null
          ? 'More than an hour early'
          : b.to == null
            ? 'An hour or more late'
            : b.to <= 0
              ? `${-b.to}–${-b.from} min early`
              : `${b.from}–${b.to} min late`
      }
      edge={(i) => (i > 0 && i < n && arrival.bins[i].from % 20 === 0 ? signed(arrival.bins[i].from) : null)}
      regions={[{ from: -15, to: 15, label: '✓ On time', tone: 'ok' }]}
      markers={arrival.median == null ? [] : [{ value: arrival.median, label: `Median ${signed(Math.round(arrival.median))} min` }]}
    />
  )
}

// On narrow screens the time line keeps a readable width and scrolls sideways.
const Wide = ({ children }) => (
  <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:overflow-visible md:px-0">
    <div className="min-w-[680px] pt-2 md:min-w-0 md:pt-0">{children}</div>
  </div>
)

// ---------- Day view: yard load and dock schedule on one time axis ----------

export function DayView({ entries, now, dates, docksOnly = false, onlyDock }) {
  const today = dayKey(new Date(now))
  const [picked, setPicked] = useState(null)
  const day = dates.includes(picked) ? picked : dates.includes(today) ? today : dates[dates.length - 1]
  const d = useMemo(() => {
    const day0 = opsDay(entries, day, now)
    if (!onlyDock) return day0
    return { ...day0, schedule: day0.schedule.filter((row) => row.dock === onlyDock) }
  }, [entries, day, now, onlyDock])
  const hours = `${clockTime(d.window.from)}–${clockTime(Math.min(d.window.to, now))}`
  const sub = docksOnly
    ? `Each bar is a truck at a dock, from dock assigned to check-out · in use = share of operating hours (${hours})`
    : `How full the yard was through the day, and what each dock did, on one time line · operating hours ${hours}`
  return (
    <Card title={docksOnly ? 'Dock Schedule' : 'Day View'} sub={sub} legend={<DayPicker dates={dates} value={day} onChange={setPicked} />}>
      <div className="px-5 pt-4 pb-5">
        {!docksOnly && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h4 className="font-semibold">
                Trucks on site <span className="font-normal text-muted">· every 10 min</span>
              </h4>
              <YardLoadLegend />
            </div>
            <Wide>
              <YardLoad timeline={d.timeline} win={d.window} now={now} />
            </Wide>
          </>
        )}
        <div className={'mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ' + (docksOnly ? '' : 'mt-7 border-t border-line pt-5')}>
          <h4 className="font-semibold">
            {docksOnly ? 'Docks in use' : 'Dock schedule'}{' '}
            <span className="font-normal text-muted">
              {docksOnly ? `${pct(d.use.all)} of operating hours` : `· docks in use ${pct(d.use.all)} of operating hours`}
            </span>
          </h4>
          <DockLegend />
        </div>
        <Wide>
          <DockGantt schedule={d.schedule} win={d.window} now={now} use={d.use} />
        </Wide>
      </div>
    </Card>
  )
}

// ---------- The section ----------

const KpiGrid = ({ children }) => <Strip cols="grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">{children}</Strip>

export function ControlSection({ r, prev, trend, ops, prevOps, entries, now, impact }) {
  const n = ops.now
  const today = dayKey(new Date(now))
  const todayOps = useMemo(() => opsDay(entries, today, now), [entries, today, now])
  const slots = todayOps.timeline.slots.filter((s, i) => i % 3 === 0 && s.t >= todayOps.window.from)
  const departedToday = ops.days.find((d) => d.date === today)?.departures ?? todayOps.schedule.length
  const avgDepartures = ops.days.length ? ops.days.reduce((s, d) => s + d.departures, 0) / ops.days.length : null
  const t = r.totals
  const dates = r.days.map((d) => d.date)

  return (
    <>
      <KpiGrid>
        <Tile
          size="compact"
          label="On site now"
          value={n.live}
          note={`${n.waiting} waiting for a dock · ${n.drops} drop${n.drops === 1 ? '' : 's'}`}
          spark={{ values: slots.map((s) => s.total), label: 'Trucks on site today, every 30 minutes' }}
        />
        <Tile
          size="compact"
          label="Past free time now"
          value={n.over}
          note={n.over ? `${money(n.accruingPerHour)}/h detention accruing` : 'No detention accruing'}
          tone={n.over ? 'alert' : 'good'}
          spark={{ values: slots.map((s) => s.overFree), label: 'Trucks past free time today, every 30 minutes' }}
        />
        <Tile
          size="compact"
          label="Departures today"
          value={departedToday}
          note={avgDepartures == null ? 'Checked out at the gate' : `Avg ${Math.round(avgDepartures)}/day in this range`}
          spark={{ values: ops.days.map((d) => d.departures), label: 'Departures per day in this range' }}
        />
        <Tile
          size="compact"
          label="Typical stay (p50)"
          value={dur(ops.stays.p50)}
          note={`Slow end (p90) ${dur(ops.stays.p90)} · free ${FREE_H} h`}
          tone={ops.stays.p90 == null ? undefined : ops.stays.p90 > FREE_MS ? 'warn' : 'good'}
          trend={trend(ops.stays.p50, prevOps.stays.p50, duration, true)}
          spark={{ values: ops.days.map((d) => d.medianStayMs), label: 'Typical stay per day' }}
        />
        <Tile
          size="compact"
          label="Docks in use"
          value={pct(ops.dockUse)}
          note="Share of operating hours"
          trend={trend(ops.dockUse, prevOps.dockUse, ptsDiff)}
          spark={{ values: ops.days.map((d) => d.dockUse), label: 'Dock use per day' }}
        />
        <Tile
          size="compact"
          label="On-time arrival"
          value={pct(t.onTimePct)}
          note={t.scheduled ? `${r.arrivals.late} late of ${t.scheduled} appointments` : 'No appointments'}
          tone={t.onTimePct == null ? undefined : t.onTimePct >= 0.8 ? 'good' : 'warn'}
          trend={trend(t.onTimePct, prev.totals.onTimePct, ptsDiff)}
          spark={{ values: r.days.map((d) => d.onTimePct), label: 'On-time arrival per day' }}
        />
      </KpiGrid>

      <DayView entries={entries} now={now} dates={dates} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card
          title="Time on Site"
          sub={`Departed live visits in this range, in 20-minute steps · ${pct(ops.stays.overFreePct)} stayed past the ${FREE_H} h free time`}
        >
          <StayHistogram stays={ops.stays} />
        </Card>
        <Card title="Handoff Times vs Target" sub="Typical and slow-end time for each handoff, departed trucks in this range">
          <StageSpread stages={ops.stages} />
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="On Site Now" sub={`${n.live} truck${n.live === 1 ? '' : 's'} and ${n.drops} dropped trailer${n.drops === 1 ? '' : 's'}, longest here first`}>
          <OnSiteQueue items={n.onSite} />
        </Card>
        <Card title="Stuck Right Now" sub="On site and over a handoff's target at this moment, longest over first">
          <SortTable
            columns={STUCK_COLUMNS}
            rows={impact.stuck}
            rowKey={(s) => s.e.id}
            initial={{ id: 'over', dir: 'desc' }}
            minWidth={520}
            empty="No trucks are over a handoff target right now."
          />
        </Card>
      </div>
    </>
  )
}

// Sidebar figure and takeaway.
export const CONTROL_SUMMARY = (r, prev, days, { ops }) => {
  const n = ops.now
  const worst = [...ops.stages].filter((s) => s.p90 != null).sort((a, b) => b.p90 / b.target - a.p90 / a.target)[0]
  return {
    key: `${n.live} on site${n.over ? ` · ${n.over} over` : ''}`,
    tone: n.over ? 'alert' : undefined,
    takeaway: (
      <>
        Right now <b>{n.live}</b> truck{n.live === 1 ? '' : 's'} on site
        {n.over ? (
          <>
            , <b className="text-danger">{n.over} past free time</b> ({money(n.accruingPerHour)}/h accruing)
          </>
        ) : (
          ', none past free time'
        )}
        . A typical stay is <b>{dur(ops.stays.p50)}</b>, the slow end {dur(ops.stays.p90)}.{' '}
        {worst && worst.p90 > worst.target && (
          <>
            Furthest over target: <b>{worst.label.toLowerCase()}</b> (slow end {dur(worst.p90)} vs {dur(worst.target)}).
          </>
        )}
      </>
    ),
  }
}

