import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import * as ui from '../ui'
import { LATE_GRACE_MIN, arrivalMs, clockTime, dayKey, departureMs, duration, minutesLate } from '../time'
import { exportToExcel } from '../logColumns'
import { DETENTION_TAG, detentionState } from '../detention'
import { awaitingRelease, isReleased } from '../handoff'
import AssignDock, { occupiedDocks } from './AssignDock'
import Dashboard from './Dashboard'
import ReleaseDialog from './ReleaseDialog'

// Shipping tab: the yard dock board on top, then the outbound (Pickup) shipments table.
// After the inspection passes, Shipping releases the truck to the gate; until it leaves it is only
// adding detention.
const STATUS_TAG = {
  Waiting: 'bg-signal text-signal-ink',
  Loading: 'bg-ink text-panel',
  'Awaiting release': 'bg-ok text-panel',
  'Released to gate': 'bg-delivery-soft text-delivery',
  Shipped: 'bg-ok-soft text-ok',
}
const STATUSES = Object.keys(STATUS_TAG)
const MAX_ROWS = 7
const HOUR = 3600000

const statusOf = (e) =>
  e.timeOut ? 'Shipped' : isReleased(e) ? 'Released to gate' : awaitingRelease(e) ? 'Awaiting release' : e.dockDoor ? 'Loading' : 'Waiting'
const onSiteMs = (e, now) => (e.timeOut ? departureMs(e) : now) - arrivalMs(e)
const isLate = (e) => (minutesLate(e) ?? 0) > LATE_GRACE_MIN
const sortedUnique = (values) => [...new Set(values.filter(Boolean))].sort()
const choices = (labels) => labels.map(([value, label]) => ({ value, label }))

// The columns on screen, in order. `options` lists the header dropdown's choices for today's rows;
// `match` says whether an entry fits the chosen value. Export still has every field.
const COLUMNS = [
  {
    id: 'order',
    label: 'Order No',
    options: () => choices([['with', 'With order no'], ['none', 'No order no']]),
    match: (e, v) => (v === 'with' ? !!e.pickupNumber : !e.pickupNumber),
  },
  {
    id: 'customer',
    label: 'Customer',
    options: (rows) => sortedUnique(rows.map((e) => e.customerPickupFor)).map((c) => ({ value: c, label: c })),
    match: (e, v) => e.customerPickupFor === v,
  },
  {
    id: 'dock',
    label: 'Dock',
    options: (rows) => [
      ...sortedUnique(rows.map((e) => e.dockDoor)).map((d) => ({ value: d, label: `Dock ${d}` })),
      { value: 'none', label: 'No dock' },
    ],
    match: (e, v) => (v === 'none' ? !e.dockDoor : e.dockDoor === v),
  },
  {
    id: 'appt',
    label: 'Appointment / Arrived',
    options: () => choices([['ontime', 'On time'], ['late', 'Late'], ['none', 'No appointment']]),
    match: (e, v) => (v === 'none' ? !e.appointmentTime : !!e.appointmentTime && isLate(e) === (v === 'late')),
  },
  {
    id: 'onsite',
    label: 'Time on Site',
    options: () => choices([['0-1', 'Under 1 h'], ['1-2', '1–2 h'], ['2-4', '2–4 h'], ['4-', 'Over 4 h']]),
    match: (e, v, now) => {
      const [from, to] = v.split('-').map((h) => (h === '' ? Infinity : Number(h) * HOUR))
      const ms = onSiteMs(e, now)
      return ms >= from && ms < to
    },
  },
  {
    id: 'status',
    label: 'Status',
    options: () => STATUSES.map((s) => ({ value: s, label: s })),
    match: (e, v) => statusOf(e) === v,
  },
]

const Sub = ({ children }) => <span className="block text-[13px] text-muted">{children}</span>
const Warn = ({ children }) => <span className="block text-[13px] font-semibold text-danger">⚠ {children}</span>
const Dash = () => <span className="text-muted">—</span>

// Prints only this table: index.css hides everything else while body has data-print="outbound".
function printOutbound() {
  document.body.dataset.print = 'outbound'
  const done = () => {
    delete document.body.dataset.print
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

// `top` renders above the outbound table (the Gate Log); `children` render below it.
export default function ShippingDashboard({ entries, onAssignDock, onEdit, onCheckOut, onRelease, top, children }) {
  const [now, setNow] = useState(Date.now)
  // The truck whose Release to gate pop-up is open.
  const [releasingId, setReleasingId] = useState(null)
  const releasing = entries.find((e) => e.id === releasingId && awaitingRelease(e)) ?? null
  const startRelease = (e) => setReleasingId(e.id)
  // Header dropdown choices by column id; '' = All.
  const [filters, setFilters] = useState({})
  // The table shows the first MAX_ROWS rows until "Show all" is clicked.
  const [showAll, setShowAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const today = dayKey(new Date(now))
  const pickups = useMemo(() => entries.filter((e) => (e.visitPurpose ?? []).includes('Pickup')), [entries])

  const todays = useMemo(() => {
    const order = Object.fromEntries(STATUSES.map((s, i) => [s, i]))
    return pickups
      // Today's pickups, plus anything still on site from earlier.
      .filter((e) => e.dateIn === today || !e.timeOut)
      .sort((a, b) => order[statusOf(a)] - order[statusOf(b)] || arrivalMs(a) - arrivalMs(b))
  }, [pickups, today])

  const occupied = occupiedDocks(entries)
  const active = COLUMNS.filter((c) => filters[c.id])
  const rows = todays.filter((e) => active.every((c) => c.match(e, filters[c.id], now)))
  const shown = showAll ? rows : rows.slice(0, MAX_ROWS)
  const setFilter = (id, value) => setFilters((f) => ({ ...f, [id]: value }))

  // Print covers every filtered row, so expand the table before the print dialog opens.
  const handlePrint = () => {
    flushSync(() => setShowAll(true))
    printOutbound()
  }

  // Exports the filtered rows with every field, like the Entry Log.
  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      await exportToExcel(rows, `outbound-shipments-${today}.xlsx`)
    } catch {
      setExportError('Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dashboard
      entries={entries}
      onAssignDock={onAssignDock}
      onEdit={onEdit}
      onCheckOut={onCheckOut}
      onStartRelease={startRelease}
    >
      <ReleaseDialog
        entry={releasing}
        onClose={() => setReleasingId(null)}
        onRelease={(id, data) => {
          onRelease(id, data)
          setReleasingId(null)
        }}
      />
      {top}

      <section id="outbound" className="rounded-[10px] border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="font-display text-[26px] leading-tight font-bold">
            Outbound Shipments <span className="text-muted">({rows.length})</span>
          </h2>
          {active.length > 0 && (
            <button type="button" onClick={() => setFilters({})} className="no-print cursor-pointer font-semibold underline">
              Clear filters
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[14px]">
            <thead className="text-[13px] font-semibold text-muted">
              <tr className="border-y border-line">
                {COLUMNS.map((c) => (
                  <th key={c.id} className="px-3 py-2.5 align-top">
                    <span className="block">{c.label}</span>
                    <select
                      aria-label={`Filter by ${c.label}`}
                      value={filters[c.id] ?? ''}
                      onChange={(ev) => setFilter(c.id, ev.target.value)}
                      className={
                        'no-print mt-1 w-full max-w-[170px] cursor-pointer rounded-md border bg-panel px-1.5 py-1 text-[13px] font-normal text-ink ' +
                        (filters[c.id] ? 'border-signal' : 'border-line')
                      }
                    >
                      <option value="">All</option>
                      {c.options(todays).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
                <th className="no-print px-3 py-2.5 align-top">Options</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-muted">
                    {active.length
                      ? 'No pickups match these filters.'
                      : 'No pickups today and none still on site. Visits with Pickup ticked on the Gate form appear here.'}
                  </td>
                </tr>
              ) : (
                shown.map((e) => {
                  const s = statusOf(e)
                  const late = minutesLate(e)
                  const det = detentionState(e, now)
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="px-3 py-2.5 font-semibold">{e.pickupNumber || <Dash />}</td>
                      <td className="px-3 py-2.5">{e.customerPickupFor || <Dash />}</td>
                      {/* Assign dock only for pickups still on site without a dock. */}
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
                        {e.dockDoor ? (
                          e.dockDoor
                        ) : e.timeOut ? (
                          <Dash />
                        ) : (
                          <span className="no-print font-normal">
                            <AssignDock entry={e} occupied={occupied} onAssignDock={onAssignDock} compact />
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {e.appointmentTime ? `Appt ${e.appointmentTime}` : 'No appt'}
                        <Sub>
                          In {e.timeIn || '—'}
                          {e.dateIn !== today && ` · ${e.dateIn}`}
                        </Sub>
                        {late !== null && late > LATE_GRACE_MIN && <Warn>{duration(late * 60000)} late</Warn>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {duration(onSiteMs(e, now))}
                        {det && <span className={ui.tag + ' mt-1 block w-fit ' + DETENTION_TAG[det.level]}>{det.text}</span>}
                        {e.timeOut && <Sub>Left {e.timeOut}</Sub>}
                        {e.dockAssignedAt && <Sub>Docked {clockTime(e.dockAssignedAt)}</Sub>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={ui.tag + ' ' + STATUS_TAG[s]}>{s}</span>
                      </td>
                      <td className="no-print whitespace-nowrap px-3 py-2.5">
                        {/* Always shows "Options"; picking a choice runs it and the select snaps back. */}
                        <select
                          aria-label={`Options for ${e.truckName} ${e.trailerNumber}`}
                          value=""
                          onChange={(ev) => {
                            const choice = ev.target.value
                            if (choice === 'release') startRelease(e)
                            else if (choice === 'checkout') onCheckOut(e)
                            else onEdit(e)
                          }}
                          className="cursor-pointer rounded-md border border-line bg-panel px-2 py-1.5 text-[14px] font-semibold text-ink"
                        >
                          <option value="" disabled>
                            Options
                          </option>
                          {awaitingRelease(e) && <option value="release">Release to gate</option>}
                          <option value="checkout">{e.timeOut ? 'Edit Check Out' : 'Check Out'}</option>
                          <option value="edit">Edit Check In</option>
                        </select>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="no-print flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4">
          {rows.length > MAX_ROWS && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mr-auto cursor-pointer font-semibold underline">
              {showAll ? 'Show less' : `Show all (${rows.length})`}
            </button>
          )}
          {exportError && <span className="mr-auto font-semibold text-danger">{exportError}</span>}
          <button type="button" onClick={handlePrint} disabled={!rows.length} className={ui.btnSmall}>
            Print
          </button>
          <button type="button" onClick={handleExport} disabled={!rows.length || exporting} className={ui.btnSmallPrimary}>
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </section>
      {children}
    </Dashboard>
  )
}
