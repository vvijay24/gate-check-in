import { useState } from 'react'
import * as ui from '../../ui'
import { Icon } from '../../icons'
import { clock12, duration } from '../../time'
import { inYard, isReleased } from '../../handoff'
import { apptStatus, STAGE_BEFORE_MIN } from '../../schedule'
import { Card, Empty, ShowTable } from './parts'
import { carrierOf } from './now'

// Shipping → Today's schedule: the day hour by hour, the orders to stage in the next hour, and every
// appointment with where the truck is now.

const MIN = 60000
const hourName = (h) => (h === 12 ? 'Noon' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`)
const hourOf = (ms) => new Date(ms).getHours()

// "32 trucks booked today. 16 are here, 2 are late. Next is Penske at 2:40 PM for Green Valley."
// `dayName` (another day, e.g. "Thu Nov 12"): "24 trucks were booked on Thu Nov 12. 24 arrived, 3 of them late."
export function scheduleSummary(schedule, byId, now, dayName) {
  const here = schedule.filter((a) => a.entryId).length
  const late = schedule.filter((a) => !a.entryId && apptStatus(a, null, now).key === 'overdue').length
  const next = schedule.find((a) => !a.entryId && a.ms >= now - 15 * MIN)
  if (dayName) {
    const lateIn = schedule.filter((a) => a.entryId && byId?.[a.entryId] && apptStatus(a, byId[a.entryId], now).key === 'late').length
    return {
      late: 0,
      line: schedule.length
        ? `${schedule.length} truck${schedule.length === 1 ? ' was' : 's were'} booked on ${dayName}. ${here} arrived, ${lateIn} of them late.`
        : `No bookings found for ${dayName}. Past days show the trucks that arrived with a booked time.`,
    }
  }
  if (!schedule.length) return { line: 'No bookings for today yet.', late: 0 }
  return {
    late,
    line: `${schedule.length} truck${schedule.length === 1 ? '' : 's'} booked today. ${here} ${here === 1 ? 'is' : 'are'} here, ${late} ${late === 1 ? 'is' : 'are'} late.${next ? ` Next is ${carrierOf(next)} at ${clock12(next.time)} for ${next.customer}.` : ''}`,
  }
}

// Where an arrived truck is now.
function whereNow(e) {
  if (!e) return ''
  if (e.timeOut) return `Left ${clock12(e.timeOut)}`
  if (inYard(e)) return `In the yard${e.release?.spot ? `, spot ${e.release.spot}` : ''}`
  if (isReleased(e)) return 'Released, leaving'
  if (e.dockDoor) return `At Dock ${e.dockDoor}`
  return e.orderReadyAt ? 'Waiting for a dock' : 'Waiting for the order'
}

// ---------------------------------------------------------------- Hour by hour
// `current`: the hour to highlight (today only), or null.
function HourColumns({ schedule, now, current }) {
  if (!schedule.length) return <Empty>No bookings for today yet.</Empty>
  const first = Math.min(...schedule.map((a) => hourOf(a.ms)))
  const last = Math.max(...schedule.map((a) => hourOf(a.ms)), current ?? 0)
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i).map((h) => {
    const inHour = schedule.filter((a) => hourOf(a.ms) === h)
    return { h, booked: inHour.length, arrived: inHour.filter((a) => a.entryId).length }
  })
  const top = Math.max(1, ...hours.map((x) => x.booked))
  const busiest = hours.reduce((b, x) => (x.booked > b.booked ? x : b), hours[0]).h
  return (
    <div className="grid gap-3 px-5 pt-4 pb-4">
      <div className="flex h-[150px] items-end gap-1.5 border-b border-line" role="img" aria-label="Bookings and arrivals by hour today. The table below has the numbers.">
        {hours.map((x) => {
          const show = x.h === current || x.h === busiest
          return (
            <div key={x.h} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              {show && (
                <span className="mb-0.5 text-[12px] font-semibold whitespace-nowrap tabular-nums">
                  {x.arrived}/{x.booked}
                </span>
              )}
              <span
                className={'relative w-full max-w-11 overflow-hidden rounded-t-md bg-signal-soft ' + (x.h === current ? 'ring-2 ring-signal ring-offset-1' : '')}
                style={{ height: `${(x.booked / top) * 100}%` }}
                title={`${hourName(x.h)}: ${x.booked} booked, ${x.arrived} arrived`}
              >
                <span className="absolute inset-x-0 bottom-0 bg-signal" style={{ height: `${x.booked ? (x.arrived / x.booked) * 100 : 0}%` }} />
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 text-[11.5px] text-muted" aria-hidden="true">
        {hours.map((x) => (
          <span key={x.h} className={'min-w-0 flex-1 truncate text-center ' + (x.h === current ? 'font-bold text-ink' : '')}>
            {hourName(x.h).replace(' ', '')}
          </span>
        ))}
      </div>
      <p className="text-[13px] text-muted">
        Each column is one hour. The pale part is the trucks booked in it and the dark part the ones that have arrived. Numbers show for {current != null ? 'this hour and ' : ''}the busiest one.
      </p>
      <ShowTable head={['Hour', { label: 'Booked', right: true }, { label: 'Arrived', right: true }]} rows={hours.map((x) => [hourName(x.h), `${x.booked} trucks`, `${x.arrived} trucks`])} />
    </div>
  )
}

// ---------------------------------------------------------------- Staging
const StagedMark = () => (
  <span className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-ok">
    <Icon name="check" size={16} />
    Staged
  </span>
)
const StageButton = ({ a, onStage }) => (
  <button type="button" onClick={() => onStage(a)} aria-label={`Mark ${a.orderNo} staged`} className={ui.btnSmall + ' px-3'}>
    Mark staged
  </button>
)

function OrdersToStage({ schedule, now, onStage }) {
  const list = schedule.filter((a) => !a.entryId && !a.staged && a.ms - now <= STAGE_BEFORE_MIN * MIN && a.ms >= now - 15 * MIN)
  return (
    <Card icon="orders" title="Orders to stage" sub="Bookings in the next hour whose order isn't at the dock yet">
      {list.length ? (
        <ul className="divide-y divide-hair px-5">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <b className="font-display tabular-nums">{clock12(a.time)}</b>
              <span className="min-w-0 flex-1">
                <b>{a.orderNo}</b>, {a.customer}, {carrierOf(a)} <span className="text-muted">({a.ms > now ? `in ${duration(a.ms - now)}` : 'due now'})</span>
              </span>
              <StageButton a={a} onStage={onStage} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Every order due in the next hour is staged.</Empty>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Appointments
const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'coming', label: 'Still to come', test: (a, s) => !a.entryId && s.key !== 'overdue' },
  { id: 'late', label: 'Late or no-show', test: (a, s) => s.key === 'overdue' || s.key === 'late' },
  { id: 'arrived', label: 'Arrived', test: (a) => !!a.entryId },
]
const STATUS_TAG = { late: 'bg-danger-soft text-danger', overdue: 'bg-danger-soft text-danger', due: 'bg-signal-soft text-signal', onTime: 'bg-ok-soft text-ok', early: 'bg-ok-soft text-ok' }

function Appointments({ schedule, byId, now, onStage, onView, isToday }) {
  const [filter, setFilter] = useState('all')
  const [all, setAll] = useState(false)
  const rows = schedule.map((a) => ({ a, e: a.entryId ? byId[a.entryId] : null, s: apptStatus(a, a.entryId ? byId[a.entryId] : null, now) }))
  const shownAll = rows.filter((r) => FILTERS.find((f) => f.id === filter).test(r.a, r.s))
  const shown = all ? shownAll : shownAll.slice(0, 8)
  return (
    <Card icon="calendar" title="Appointments" sub="Every booking today, earliest first">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2 px-5 pt-4 pb-3">
        {FILTERS.map((f) => {
          const n = rows.filter((r) => f.test(r.a, r.s)).length
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={
                'min-h-11 cursor-pointer rounded-full border px-4 text-[14px] font-semibold transition-colors duration-150 ' +
                (filter === f.id ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-panel hover:border-signal-bright')
              }
            >
              {f.label} <span className="tabular-nums opacity-75">({n})</span>
            </button>
          )
        })}
      </div>
      {shown.length ? (
        <div className="overflow-x-auto border-t border-hair">
          <table className={ui.table + ' min-w-[860px]'}>
            <thead>
              <tr>
                {['Booked', 'Order no.', 'Carrier', 'Customer', 'Load', 'Order', 'Status', ''].map((h, i) => (
                  <th key={i} className={ui.th}>
                    {h || <span className="sr-only">Entry</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ a, e, s }) => {
                const exception = e || s.key === 'overdue' || s.key === 'due'
                return (
                  <tr key={a.id} className={ui.tr + (s.key === 'due' ? ' bg-signal-tint' : '')}>
                    <td className={ui.tdTight + ' font-display font-bold whitespace-nowrap tabular-nums'}>{clock12(a.time)}</td>
                    <td className={ui.tdTight + ' whitespace-nowrap'}>{a.orderNo}</td>
                    <td className={ui.tdTight}>{carrierOf(a)}</td>
                    <td className={ui.tdTight}>{a.customer}</td>
                    <td className={ui.tdTight + ' whitespace-nowrap'}>{a.type === 'Drop Trailer' ? `${a.kind} drop trailer` : `${a.kind} ${a.pallets} pallets`}</td>
                    <td className={'px-3 py-1.5 whitespace-nowrap'}>
                      {e ? (
                        e.orderReadyAt ? (
                          <StagedMark />
                        ) : (
                          <span className="text-[14px] text-muted">Not ready yet</span>
                        )
                      ) : a.staged ? (
                        <StagedMark />
                      ) : isToday ? (
                        <StageButton a={a} onStage={onStage} />
                      ) : (
                        <span className="text-[14px] text-muted">Not staged</span>
                      )}
                    </td>
                    <td className={ui.tdTight}>
                      {exception ? (
                        <>
                          <span className={ui.tag + ' ' + STATUS_TAG[s.key]}>{s.key === 'due' ? 'Due now' : s.noShow ? 'No-show' : s.key === 'overdue' ? `${duration(now - a.ms)} late` : s.label}</span>
                          {e && <span className="block text-[13px] text-muted">{whereNow(e)}</span>}
                        </>
                      ) : (
                        <span className="text-[14px] text-muted">in {duration(a.ms - now)}</span>
                      )}
                    </td>
                    <td className={'px-3 py-1.5 whitespace-nowrap'}>
                      {e ? (
                        <button type="button" onClick={() => onView(e.id)} className={ui.btnGhost + ' px-2'}>
                          View entry
                        </button>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{rows.length ? 'No bookings match this filter.' : 'No bookings for today yet.'}</Empty>
      )}
      {shownAll.length > 8 && (
        <div className="border-t border-hair px-5 py-2">
          <button type="button" onClick={() => setAll((v) => !v)} className={ui.btnGhost + ' -ml-3'}>
            {all ? 'Show less' : `Show all (${shownAll.length})`}
          </button>
        </div>
      )}
    </Card>
  )
}

// `isToday`: the day shown is today, so it has orders to stage and a current hour.
export function ScheduleSection({ schedule, entries, now, onStage, onView, isToday = true }) {
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className={'grid items-start gap-5 ' + (isToday ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : '')}>
        <Card icon="chart" title="The day, hour by hour" sub="Trucks booked and arrived in each hour">
          <HourColumns schedule={schedule} now={now} current={isToday ? hourOf(now) : null} />
        </Card>
        {isToday && <OrdersToStage schedule={schedule} now={now} onStage={onStage} />}
      </div>
      <Appointments schedule={schedule} byId={byId} now={now} onStage={onStage} onView={onView} isToday={isToday} />
    </div>
  )
}
