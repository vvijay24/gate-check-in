import { useMemo } from 'react'
import { arrivalMs, clockTime, departureMs, duration, minutesLate } from '../../time'
import { DETENTION_FREE_MIN } from '../../yard'
import { isDrop } from '../../metrics'
import { dockKey } from '../AssignDock'
import { previousRange, rangeMetrics, visitStages } from '../../analytics'
import { opsMetrics } from '../../ops'
import { Card, Strip, Tile } from './ui'
import { BarList, DROP, DayBars, LIVE, Legend, STAGES, SortTable, Trend, count, dur, money, pct, ptsDiff, weekdayDate } from './charts'
import { ArrivalHistogram, DayView, StayHistogram } from './control'
import { ProfileLink } from './nav'
import { VISIT_COLUMNS } from './sections'
import { OVERRUN, StageSpread } from './viz'

// Drill-down pages in Insights: one carrier, customer, dock or visit. Partner and dock pages use the
// same figures as the sections, worked out from that subject's visits only, with the whole yard
// (after the global filters) alongside for comparison.

const FREE_MS = DETENTION_FREE_MIN * 60000
const FREE_H = DETENTION_FREE_MIN / 60
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const Grid6 = ({ children }) => <Strip cols="grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">{children}</Strip>
const Pair = ({ children }) => <div className="grid gap-5 xl:grid-cols-2">{children}</div>

export function ProfileHeader({ kicker, title, meta, onBack, backLabel }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-muted">
          <button type="button" onClick={onBack} className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded hover:text-ink">
            <span aria-hidden="true">←</span> {backLabel}
          </button>
          <span aria-hidden="true" className="text-edge">/</span>
          <span className="text-signal-line">{kicker}</span>
        </nav>
        <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.015em] break-words">{title}</h2>
        {meta && <p className="mt-0.5 text-[13px] text-muted">{meta}</p>}
      </div>
    </div>
  )
}

// Range figures for a subset of the entries, with the period before and the operational figures.
function useSubject(subset, range, now, targets) {
  const r = useMemo(() => rangeMetrics(subset, range.from, range.to, now), [subset, range, now])
  const prev = useMemo(() => {
    const p = previousRange(range.from, range.to)
    return rangeMetrics(subset, p.from, p.to, now)
  }, [subset, range, now])
  const ops = useMemo(() => opsMetrics(subset, range.from, range.to, now, targets), [subset, range, now, targets])
  const trend = (value, base, format, lowerIsBetter) => (
    <Trend value={value} base={prev.totals.visits ? base : null} format={format} lowerIsBetter={lowerIsBetter} days={r.dayCount} />
  )
  return { r, prev, ops, trend }
}

function lastSeen(subset) {
  const latest = subset.reduce((m, e) => (arrivalMs(e) > (m ? arrivalMs(m) : -Infinity) ? e : m), null)
  return latest ? `last in ${weekdayDate(latest.dateIn)} ${latest.timeIn}` : 'never seen'
}

const VisitTable = ({ r }) => (
  <Card title="Visits" sub="Live visits in this range · click a visit to open it, a heading to sort">
    <SortTable columns={VISIT_COLUMNS} rows={r.stays} rowKey={(s) => s.e.id} initial={{ id: 'total', dir: 'desc' }} minWidth={860} empty="No live visits in this range." />
  </Card>
)

const NoVisits = ({ what }) => (
  <Card title="No visits in this range" sub={`${what} had no visits in this date range. Pick a longer range above, or clear a filter.`}>
    <div className="pb-5" />
  </Card>
)

// ---------- Carrier / customer ----------

function PartnerProfile({ kind, name, entries, range, now, settings, fleet, fleetOps, onBack, backLabel }) {
  const field = kind === 'carrier' ? 'truckName' : 'customerPickupFor'
  const subset = useMemo(() => entries.filter((e) => same(e[field], name)), [entries, field, name])
  const { r, ops, trend, prev } = useSubject(subset, range, now, settings.targets)
  const t = r.totals
  const word = kind === 'carrier' ? 'carriers' : 'customers'
  const overPct = t.live ? t.overFree / t.live : null
  const fleetOver = fleet.totals.live ? fleet.totals.overFree / fleet.totals.live : null
  const perVisit = t.live ? t.detentionCost / t.live : null
  const fleetPer = fleet.totals.live ? fleet.totals.detentionCost / fleet.totals.live : null
  const others = kind === 'carrier' ? r.customers : r.carriers
  const otherKind = kind === 'carrier' ? 'customer' : 'carrier'

  return (
    <>
      <ProfileHeader
        kicker={kind === 'carrier' ? 'Carrier' : 'Customer'}
        title={subset[0]?.[field] ?? name}
        meta={`${t.visits} visits in this range (${t.live} live, ${t.drops} drop) · ${lastSeen(subset)}`}
        onBack={onBack}
        backLabel={backLabel}
      />
      {!t.visits ? (
        <NoVisits what={name} />
      ) : (
        <>
          <Grid6>
            <Tile size="compact" label="Visits" value={t.visits} note={`${pct(fleet.totals.visits ? t.visits / fleet.totals.visits : null)} of all visits`} trend={trend(t.visits, prev.totals.visits, count)} spark={{ values: r.days.map((d) => d.visits), label: 'Visits per day' }} />
            <Tile
              size="compact"
              label="Typical stay (p50)"
              value={dur(ops.stays.p50)}
              note={`Slow end ${dur(ops.stays.p90)} · all ${word} ${dur(fleetOps.stays.p50)}`}
              tone={ops.stays.p50 == null || fleetOps.stays.p50 == null ? undefined : ops.stays.p50 > fleetOps.stays.p50 ? 'warn' : 'good'}
              spark={{ values: ops.days.map((d) => d.medianStayMs), label: 'Typical stay per day' }}
            />
            <Tile
              size="compact"
              label="On-time arrival"
              value={pct(t.onTimePct)}
              note={`All ${word} ${pct(fleet.totals.onTimePct)}`}
              tone={t.onTimePct == null ? undefined : t.onTimePct >= 0.8 ? 'good' : 'warn'}
              trend={trend(t.onTimePct, prev.totals.onTimePct, ptsDiff)}
            />
            <Tile size="compact" label="Past free time" value={pct(overPct)} note={`${t.overFree} of ${t.live} live · all ${word} ${pct(fleetOver)}`} tone={t.overFree ? 'warn' : 'good'} />
            <Tile
              size="compact"
              label="Est. detention"
              value={money(t.detentionCost)}
              note={`${pct(fleet.totals.detentionCost ? t.detentionCost / fleet.totals.detentionCost : null)} of the yard's`}
              tone={t.detentionCost ? 'alert' : 'good'}
              trend={trend(t.detentionCost, prev.totals.detentionCost, money, true)}
              spark={{ values: r.days.map((d) => d.detentionCost), label: 'Est. detention per day' }}
            />
            <Tile
              size="compact"
              label="Detention per visit"
              value={perVisit == null ? '—' : `$${perVisit.toFixed(2)}`}
              note={`All ${word} ${fleetPer == null ? '—' : `$${fleetPer.toFixed(2)}`}`}
              tone={perVisit == null || fleetPer == null ? undefined : perVisit > fleetPer ? 'warn' : 'good'}
            />
          </Grid6>

          <Pair>
            <Card title="Visits per Day" sub="Checked in each day" legend={<Legend items={[['Live', LIVE], ['Drop', DROP]]} />}>
              <DayBars days={r.days} series={[{ key: 'live', label: 'Live', color: LIVE }, { key: 'drops', label: 'Drop', color: DROP }]} />
            </Card>
            <Card title="Est. Detention per Day" sub="Live visits checked in each day">
              <DayBars days={r.days} series={[{ key: 'detentionCost', label: 'Est. detention', color: LIVE }]} format={money} />
            </Card>
          </Pair>

          <Pair>
            <Card title="Time on Site" sub={`Departed live visits · ${pct(ops.stays.overFreePct)} past the ${FREE_H} h free time`}>
              <StayHistogram stays={ops.stays} />
            </Card>
            <Card title="Handoff Times vs Target" sub="Typical and slow-end time for each handoff, this partner's trucks">
              <StageSpread stages={ops.stages} />
            </Card>
          </Pair>

          <Pair>
            <Card title="Arrivals vs Appointment" sub={`Minutes early (−) or late (+) · ${ops.arrival.count} with an appointment`}>
              <ArrivalHistogram arrival={ops.arrival} />
            </Card>
            <Card title={kind === 'carrier' ? 'Customers Served' : 'Carriers Used'} sub="Live visits in this range · click a name to open it">
              <BarList
                rows={[...others]
                  .sort((a, b) => b.visits - a.visits)
                  .slice(0, 10)
                  .map((o) => ({
                    label: o.name,
                    node: (
                      <ProfileLink kind={otherKind} id={o.name}>
                        {o.name}
                      </ProfileLink>
                    ),
                    value: o.visits,
                    note: money(o.detentionCost),
                  }))}
                color={LIVE}
                empty={kind === 'carrier' ? 'No pickups with a customer in this range.' : 'No carriers in this range.'}
              />
            </Card>
          </Pair>

          <VisitTable r={r} />
        </>
      )}
    </>
  )
}

// ---------- Dock ----------

function DockProfile({ dock, entries, range, now, settings, fleet, fleetOps, onBack, backLabel }) {
  const subset = useMemo(() => entries.filter((e) => dockKey(e.dockDoor) === dock), [entries, dock])
  const { r, ops, trend, prev } = useSubject(subset, range, now, settings.targets)
  const t = r.totals
  const row = r.docks.find((d) => d.dock === dock)
  const fleetRow = fleet.docks.find((d) => d.dock === dock)
  const inspect = ops.stages.find((s) => s.key === 'toInspectMs')
  const fleetInspect = fleetOps.stages.find((s) => s.key === 'toInspectMs')

  return (
    <>
      <ProfileHeader kicker="Dock" title={`Dock ${dock}`} meta={`${fleetRow?.loads ?? 0} loads assigned in this range · ${lastSeen(subset)}`} onBack={onBack} backLabel={backLabel} />
      <Grid6>
        <Tile size="compact" label="Loads" value={fleetRow?.loads ?? 0} note="Assigned to this dock" trend={trend(fleetRow?.loads ?? 0, prev.docks.find((d) => d.dock === dock)?.loads ?? 0, count)} />
        <Tile size="compact" label="In use" value={pct(fleetOps.dockUseByDock[dock])} note={`All docks ${pct(fleetOps.dockUse)} · operating hours`} />
        <Tile size="compact" label="Avg wait for this dock" value={dur(row?.avgWaitMs)} note={`All docks ${dur(fleet.totals.avgWaitDockMs)}`} />
        <Tile
          size="compact"
          label="Dock → inspected (p50)"
          value={dur(inspect?.p50)}
          note={`Slow end ${dur(inspect?.p90)} · all docks ${dur(fleetInspect?.p50)}`}
          tone={inspect?.p90 == null ? undefined : inspect.p90 > inspect.target ? 'warn' : 'good'}
        />
        <Tile size="compact" label="Avg time at dock" value={dur(row?.avgDwellMs)} note="Dock assigned to check-out" />
        <Tile size="compact" label="Est. detention" value={money(t.detentionCost)} note="Live visits at this dock" tone={t.detentionCost ? 'alert' : 'good'} spark={{ values: r.days.map((d) => d.detentionCost), label: 'Est. detention per day' }} />
      </Grid6>

      <DayView entries={entries} now={now} dates={fleet.days.map((d) => d.date)} docksOnly onlyDock={dock} />

      <Pair>
        <Card title="Handoff Times vs Target" sub="Trucks at this dock, departed in this range">
          <StageSpread stages={ops.stages} />
        </Card>
        <Card title="Carriers at This Dock" sub="Live visits · click a carrier to open it">
          <BarList
            rows={[...r.carriers]
              .sort((a, b) => b.visits - a.visits)
              .slice(0, 10)
              .map((c) => ({
                label: c.name,
                node: (
                  <ProfileLink kind="carrier" id={c.name}>
                    {c.name}
                  </ProfileLink>
                ),
                value: c.visits,
                note: `p50 ${dur(c.p50StayMs)}`,
              }))}
            color={LIVE}
            empty="No live visits at this dock in this range."
          />
        </Card>
      </Pair>

      <VisitTable r={r} />
    </>
  )
}

// ---------- Visit ----------

const MILESTONE_DOT = ['var(--color-ink)', 'var(--color-stage-1)', 'var(--color-stage-2)', 'var(--color-stage-3)', 'var(--color-stage-4)']

function VisitTimeline({ e, s, now }) {
  const start = arrivalMs(e)
  const end = e.timeOut ? departureMs(e) : now
  const drop = isDrop(e)
  const freeEnd = start + FREE_MS
  const scale = Math.max(end, drop ? end : freeEnd) - start || 1
  const X = (t) => `${Math.min(100, Math.max(0, ((t - start) / scale) * 100))}%`
  const points = [
    { t: start, label: `Arrived at ${e.gateIn || 'the gate'}`, sub: e.guardOnDuty && `Logged by ${e.guardOnDuty}` },
    { t: e.dockAssignedAt, label: `Dock ${e.dockDoor || '—'} assigned`, sub: s.waitDockMs != null && `after ${duration(s.waitDockMs)} waiting` },
    {
      t: e.loadingInspection?.inspectedAt,
      label: `Inspection ${e.loadingInspection?.result === 'Pass' ? 'passed' : e.loadingInspection?.result === 'Fail' ? 'failed' : 'saved'}`,
      sub: e.loadingInspection?.inspector && `by ${e.loadingInspection.inspector}${s.toInspectMs != null ? ` · ${duration(s.toInspectMs)} after docking` : ''}`,
    },
    { t: e.release?.releasedAt, label: 'Released by Shipping', sub: e.release?.releasedBy && `by ${e.release.releasedBy}${s.toReleaseMs != null ? ` · ${duration(s.toReleaseMs)} after inspection` : ''}` },
    { t: e.timeOut ? end : null, label: `Checked out at ${e.gateOut || 'the gate'}`, sub: e.guardOut && `by ${e.guardOut}` },
  ]
  const known = points.map((p, i) => ({ ...p, i })).filter((p) => Number.isFinite(p.t))
  // Bar segments between the recorded steps, in the stage colors.
  const segs = STAGES.map((st, i) => {
    const a = points[i].t ?? null
    const b = points[i + 1].t ?? null
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? { ...st, a, b } : null
  }).filter(Boolean)

  return (
    <div className="px-5 pt-4 pb-5">
      <div className="relative mt-6 mb-2">
        <div className="relative h-7 overflow-hidden rounded-md bg-track">
          {drop ? (
            <i className="absolute inset-y-0 left-0" style={{ width: X(end), background: 'var(--color-chart-drop)', opacity: 0.55 }} />
          ) : (
            segs.map((g) => <i key={g.key} className="absolute inset-y-0 border-r-2 border-panel" style={{ left: X(g.a), width: `calc(${X(g.b)} - ${X(g.a)})`, background: g.color }} />)
          )}
          {!drop && end > freeEnd && <i className="absolute inset-y-0 border-b-[3px] border-danger" style={{ left: X(freeEnd), right: `calc(100% - ${X(end)})`, background: OVERRUN }} />}
          {!e.timeOut && <i className="absolute inset-y-0 w-[3px] bg-warn" style={{ left: `calc(${X(end)} - 3px)` }} />}
        </div>
        {!drop && (
          <div className="absolute -top-6 bottom-0 border-l-2 border-dashed border-danger" style={{ left: X(freeEnd) }}>
            <span className={'absolute -top-0.5 text-[12px] font-bold whitespace-nowrap text-danger ' + ((freeEnd - start) / scale > 0.7 ? 'right-1.5' : 'left-1.5')}>
              Free time ends {clockTime(freeEnd)}
            </span>
          </div>
        )}
        {known.map((p) => (
          <i key={p.i} className="absolute top-3.5 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel" style={{ left: X(p.t), background: MILESTONE_DOT[p.i] }} />
        ))}
      </div>
      <ol className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-5">
        {points.map((p, i) => (
          <li key={i} className={'border-l-[3px] pl-3 ' + (Number.isFinite(p.t) ? '' : 'opacity-50')} style={{ borderColor: MILESTONE_DOT[i] }}>
            <b className="block text-[18px] tabular-nums">{Number.isFinite(p.t) ? clockTime(p.t) : '—'}</b>
            <span className="block text-[14px] font-semibold">{p.label}</span>
            <span className="block text-[12px] text-muted">{Number.isFinite(p.t) ? p.sub || '' : drop && i > 0 && i < 4 ? 'Not needed for a drop' : 'Not yet'}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0 border-b border-line py-2">
      <dt className="text-[12px] font-semibold text-muted">{label}</dt>
      <dd className="truncate text-[15px] font-semibold">{children || '—'}</dd>
    </div>
  )
}

function VisitProfile({ id, allEntries, now, onBack, backLabel }) {
  const e = allEntries.find((x) => String(x.id) === String(id))
  if (!e) {
    return (
      <>
        <ProfileHeader kicker="Visit" title="Visit not found" meta="It may have been deleted, or the sample data was removed." onBack={onBack} backLabel={backLabel} />
      </>
    )
  }
  const s = visitStages(e, now)
  const drop = isDrop(e)
  const late = minutesLate(e)
  const status = e.timeOut ? `Checked out ${clockTime(departureMs(e))}` : drop ? 'Dropped trailer on site' : 'On site now'
  const others = allEntries
    .filter((x) => x !== e && x.trailerNumber && same(x.trailerNumber, e.trailerNumber))
    .map((x) => visitStages(x, now))
    .sort((a, b) => arrivalMs(b.e) - arrivalMs(a.e))
  const insp = e.loadingInspection

  return (
    <>
      <ProfileHeader
        kicker="Visit"
        title={`${e.truckName || 'Unknown carrier'} · Trailer ${e.trailerNumber || '—'}`}
        meta={`${weekdayDate(e.dateIn)} ${e.timeIn} · ${(e.visitPurpose ?? []).join(', ') || 'No purpose'} · ${status}`}
        onBack={onBack}
        backLabel={backLabel}
      />
      <Grid6>
        <Tile size="compact" label="Time on site" value={dur(s.onSiteMs)} note={e.timeOut ? 'Check-in to check-out' : 'So far'} tone={drop ? undefined : s.overMs ? 'alert' : 'good'} />
        <Tile size="compact" label="Est. detention" value={drop ? '—' : money(s.cost)} note={drop ? 'No driver waiting' : s.overMs ? `${dur(s.overMs)} past ${FREE_H} h free time` : 'Within free time'} tone={drop ? undefined : s.cost ? 'alert' : 'good'} />
        <Tile size="compact" label="Wait for a dock" value={dur(s.waitDockMs)} note="Check-in to dock assigned" />
        <Tile size="compact" label="Dock → inspected" value={dur(s.toInspectMs)} note="Includes loading" />
        <Tile size="compact" label="Inspected → released" value={dur(s.toReleaseMs)} note="Waiting for Shipping" />
        <Tile size="compact" label="Released → out" value={dur(s.releaseToOutMs)} note="Shipping release to the gate" />
      </Grid6>

      <Card title="Timeline" sub="Each step as recorded, with the free time marked · striped red is time in detention">
        <VisitTimeline e={e} s={s} now={now} />
      </Card>

      <Card title="Details" sub="As entered at the Gate, at the dock and by Shipping">
        <dl className="grid gap-x-6 px-5 pt-2 pb-5 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Carrier">
            <ProfileLink kind="carrier" id={e.truckName}>
              {e.truckName}
            </ProfileLink>
          </Fact>
          <Fact label="Trailer #">{e.trailerNumber}</Fact>
          <Fact label="Driver">{e.truckerNameIn}</Fact>
          <Fact label="Driver phone">{e.driverPhone}</Fact>
          <Fact label="Customer">
            <ProfileLink kind="customer" id={e.customerPickupFor}>
              {e.customerPickupFor}
            </ProfileLink>
          </Fact>
          <Fact label="Order No">{e.pickupNumber}</Fact>
          <Fact label="Appointment">{e.appointmentTime ? `${e.appointmentTime}${late == null ? '' : late > 15 ? ` · ${late} min late` : late < -15 ? ` · ${-late} min early` : ' · on time'}` : 'None'}</Fact>
          <Fact label="Dock">
            {e.dockDoor ? (
              <ProfileLink kind="dock" id={dockKey(e.dockDoor)}>
                Dock {e.dockDoor}
              </ProfileLink>
            ) : null}
          </Fact>
          <Fact label="Staging bay">{e.waitingLocation}</Fact>
          <Fact label="Seals in / out">{[e.incomingSeals, e.outgoingSeals].filter(Boolean).join(' → ')}</Fact>
          <Fact label="Inspection">{insp ? `${insp.result}${insp.issues?.length ? ` · ${insp.issues.join(', ')}` : ''}` : null}</Fact>
          <Fact label="Seal applied at dock">{insp?.sealApplied}</Fact>
          <Fact label="Reefer">{e.reefer === 'Yes' ? `Yes · set ${e.tempSet}° · actual ${e.tempActual}°` : e.reefer}</Fact>
          <Fact label="Guard in / out">{[e.guardOnDuty, e.guardOut].filter(Boolean).join(' / ')}</Fact>
          <Fact label="Released by">{e.release?.releasedBy}</Fact>
          <Fact label="Corrected after saving">{e.edits ? `Yes (${e.edits})` : 'No'}</Fact>
        </dl>
      </Card>

      <Card title="Other Visits by This Trailer" sub="Every visit on record with the same trailer number">
        <SortTable columns={VISIT_COLUMNS} rows={others} rowKey={(x) => x.e.id} initial={{ id: 'total', dir: 'desc' }} minWidth={860} empty="This trailer has no other visits on record." />
      </Card>
    </>
  )
}

// ---------- Entry point ----------

export function ProfileView({ profile, ...props }) {
  if (profile.kind === 'visit') return <VisitProfile id={profile.id} {...props} />
  if (profile.kind === 'dock') return <DockProfile dock={profile.id} {...props} />
  return <PartnerProfile kind={profile.kind} name={profile.id} {...props} />
}
