import { useEffect, useMemo, useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, clockTime, dayKey, departureMs, duration } from '../time'
import Dashboard, { StatTile } from './Dashboard'

// Shipping tab: the yard dock board on top, then the outbound (Pickup) shipments table.
const STATUSES = ['Waiting', 'Loading', 'Shipped']
const STATUS_TAG = {
  Waiting: 'bg-signal text-signal-ink',
  Loading: 'bg-ink text-panel',
  Shipped: 'bg-ok-soft text-ok',
}
// Arriving more than this after the appointment counts as late.
const LATE_GRACE_MIN = 15

const statusOf = (e) => (e.timeOut ? 'Shipped' : e.dockDoor ? 'Loading' : 'Waiting')

// Minutes late against the appointment on the arrival day (negative = early).
const minutesLate = (e) => {
  if (!e.appointmentTime || !e.dateIn) return null
  const appt = new Date(`${e.dateIn}T${e.appointmentTime}`).getTime()
  const diff = Math.round((arrivalMs(e) - appt) / 60000)
  return Number.isFinite(diff) ? diff : null
}

const Sub = ({ children }) => <span className="block text-[13px] text-muted">{children}</span>
const Warn = ({ children }) => <span className="block text-[13px] font-semibold text-danger">⚠ {children}</span>
const Dash = () => <span className="text-muted">—</span>

export default function ShippingDashboard({ entries, onAssignDock, onOpen }) {
  const [now, setNow] = useState(Date.now)
  const [date, setDate] = useState(() => dayKey(new Date()))
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const today = dayKey(new Date(now))
  const pickups = useMemo(() => entries.filter((e) => (e.visitPurpose ?? []).includes('Pickup')), [entries])

  // Counts are always for today, whatever date the table is filtered to.
  const shippedToday = pickups.filter((e) => e.timeOut && (e.dateOut || e.dateIn) === today)
  const arrivedToday = pickups.filter((e) => e.dateIn === today)
  const turns = shippedToday.map((e) => departureMs(e) - arrivalMs(e)).filter(Number.isFinite)
  const avgTurn = turns.length ? duration(turns.reduce((s, t) => s + t, 0) / turns.length) : null

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const order = { Waiting: 0, Loading: 1, Shipped: 2 }
    return pickups
      // The chosen day's pickups; on today's view, also anything still on site from earlier.
      .filter((e) => e.dateIn === date || (date === today && !e.timeOut))
      .filter((e) => !status || statusOf(e) === status)
      .filter(
        (e) =>
          !q ||
          [e.pickupNumber, e.customerPickupFor, e.truckName, e.trailerNumber, e.truckerNameIn, e.outgoingSeals, e.greenSeal, e.dockDoor]
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => order[statusOf(a)] - order[statusOf(b)] || arrivalMs(a) - arrivalMs(b))
  }, [pickups, date, today, status, search])

  return (
    <div className="space-y-5">
      <Dashboard
        entries={entries}
        onAssignDock={onAssignDock}
        onOpen={onOpen}
        extraTiles={
          <>
            <StatTile label="Pickups today" value={arrivedToday.length} detail="Arrived at the gate today" />
            <StatTile label="Shipped today" value={shippedToday.length} detail={avgTurn ? `Average turn time ${avgTurn}` : 'No pickups shipped yet today'} />
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-[10px] border border-line bg-panel p-5">
        <div className="min-w-56 flex-1">
          <label htmlFor="ship-search" className={ui.label + ' mb-1'}>Search</label>
          <input
            id="ship-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order no, customer, carrier, trailer, seal, dock…"
            className={ui.input}
          />
        </div>
        <div>
          <label htmlFor="ship-date" className={ui.label + ' mb-1'}>Date In</label>
          <input id="ship-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={ui.input} />
        </div>
        <div>
          <label htmlFor="ship-status" className={ui.label + ' mb-1'}>Status</label>
          <select id="ship-status" value={status} onChange={(e) => setStatus(e.target.value)} className={ui.input}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <section className="rounded-[10px] border border-line bg-panel">
        <h2 className="px-5 pt-5 pb-3 font-display text-[26px] leading-tight font-bold">
          Outbound Shipments <span className="text-muted">({rows.length})</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-[14px]">
            <thead className="text-[13px] font-semibold text-muted">
              <tr className="border-y border-line">
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Order No / Customer</th>
                <th className="px-3 py-2.5">Carrier / Trailer</th>
                <th className="px-3 py-2.5">Driver</th>
                <th className="px-3 py-2.5">Dock</th>
                <th className="px-3 py-2.5">Appointment / Arrived</th>
                <th className="px-3 py-2.5">Time on Site</th>
                <th className="px-3 py-2.5">Seals</th>
                <th className="px-3 py-2.5">Reefer</th>
                <th className="px-3 py-2.5">Contents</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-muted">
                    No pickups for this date{status || search ? ' match these filters' : ''}. Visits with Pickup ticked on the Gate form appear here.
                  </td>
                </tr>
              ) : (
                rows.map((e) => {
                  const s = statusOf(e)
                  const late = minutesLate(e)
                  const onSiteMs = (e.timeOut ? departureMs(e) : now) - arrivalMs(e)
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="px-3 py-2.5">
                        <span className={ui.tag + ' ' + STATUS_TAG[s]}>{s}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold">{e.pickupNumber || '—'}</span>
                        <Sub>{e.customerPickupFor || 'No customer entered'}</Sub>
                      </td>
                      <td className="px-3 py-2.5">
                        {e.truckName || <Dash />}
                        <Sub>Trailer {e.trailerNumber || '—'}</Sub>
                      </td>
                      <td className="px-3 py-2.5">
                        {e.truckerNameIn || <Dash />}
                        {e.driverPhone && (
                          <a href={`tel:${e.driverPhone}`} className="block text-[13px] text-muted underline">
                            {e.driverPhone}
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-semibold">{e.dockDoor || <Dash />}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {e.appointmentTime ? `Appt ${e.appointmentTime}` : 'No appt'}
                        <Sub>
                          In {e.timeIn || '—'}
                          {e.dateIn !== date && ` · ${e.dateIn}`}
                        </Sub>
                        {late !== null && late > LATE_GRACE_MIN && <Warn>{duration(late * 60000)} late</Warn>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {duration(onSiteMs)}
                        {e.timeOut && <Sub>Left {e.timeOut}</Sub>}
                        {e.dockAssignedAt && <Sub>Docked {clockTime(e.dockAssignedAt)}</Sub>}
                      </td>
                      <td className="px-3 py-2.5">
                        Out {e.outgoingSeals || '—'}
                        <Sub>Green {e.greenSeal || '—'}</Sub>
                        {s === 'Shipped' && !e.outgoingSeals && <Warn>No outgoing seal</Warn>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {e.reefer === 'Yes' ? (
                          <>
                            {e.tempActual || '—'}°F <span className="text-muted">(set {e.tempSet || '—'}°F)</span>
                            <Sub>Fuel out {e.fuelOut || '—'}</Sub>
                          </>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className="max-w-64 px-3 py-2.5 break-words">
                        {e.shipmentContents || <Dash />}
                        {e.emptyPallets !== '' && e.emptyPallets != null && <Sub>Empty pallets {e.emptyPallets}</Sub>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <button onClick={() => onOpen(e)} className="cursor-pointer font-semibold underline">
                          {e.timeOut ? 'Edit' : 'Open'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
