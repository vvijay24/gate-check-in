import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import * as ui from '../ui'
import { LATE_GRACE_MIN, arrivalMs, clockTime, dayKey, departureMs, duration, minutesLate } from '../time'
import { exportToExcel } from '../logColumns'
import { DETENTION_ICON, DETENTION_TAG, detentionState } from '../detention'
import { Icon } from '../icons'
import CardHead from './CardHead'
import { awaitingRelease, inYard, isReleased } from '../handoff'
import AssignDock, { occupiedDocks } from './AssignDock'
import ShippingBoard from './ShippingBoard'
import { LiveYard } from './Dashboard'

// Shipping tab: the Shipping desk board on top (who needs a dock, which dock is free, what has passed
// inspection, with a timer on every truck and live charts), then one tabbed area for the outbound (Pickup)
// shipments table, the Entry Log and the yard map. After the inspection passes, the inspector releases the
// truck to the gate on Loading & Inspection; Shipping sees the status but can't release.
const STATUS_TAG = {
  'Waiting for order': 'bg-warn text-warn-ink',
  'Ready for a dock': 'bg-warn text-warn-ink',
  Loading: 'bg-ink text-panel',
  'Awaiting release': 'bg-ok text-panel',
  'Released to gate': 'bg-delivery-soft text-delivery',
  'Released to yard': 'bg-drop-soft text-drop',
  Shipped: 'bg-ok-soft text-ok',
}
const STATUSES = Object.keys(STATUS_TAG)
const MAX_ROWS = 7
const HOUR = 3600000

const statusOf = (e) =>
  e.timeOut
    ? 'Shipped'
    : inYard(e)
      ? 'Released to yard'
      : isReleased(e)
        ? 'Released to gate'
        : awaitingRelease(e)
          ? 'Awaiting release'
          : e.dockDoor
            ? 'Loading'
            : e.orderReadyAt
              ? 'Ready for a dock'
              : 'Waiting for order'
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
const Warn = ({ children }) => (
  <span className="flex items-center gap-1 text-[13px] font-semibold text-danger">
    <Icon name="warning" size={14} />
    {children}
  </span>
)
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

const MORE_TABS = [
  { id: 'out', label: 'Outbound shipments', icon: 'truck' },
  { id: 'log', label: 'Entry log', icon: 'log' },
  { id: 'map', label: 'Yard map', icon: 'yard' },
]

// `top` is the Entry Log (its tab); `children` render below everything.
export default function ShippingDashboard({ entries, onAssignDock, onOrderReady, onEdit, onUpdateEntry, onCheckOut, top, children }) {
  const [now, setNow] = useState(Date.now)
  // Which table (or the map) shows under the board.
  const [more, setMore] = useState('out')
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
    <div className="grid gap-6">
      <ShippingBoard entries={entries} onAssignDock={onAssignDock} onOrderReady={onOrderReady} onUpdateEntry={onUpdateEntry} />

      {/* Tables and map, one at a time */}
      <div role="tablist" aria-label="Tables and map" className="no-print flex flex-wrap gap-1 rounded-2xl border border-hair bg-panel p-1.5 shadow-card">
        {MORE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={more === t.id}
            onClick={() => setMore(t.id)}
            className={
              'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 font-display text-[15px] font-bold transition-colors duration-150 ' +
              (more === t.id ? 'bg-signal text-signal-ink shadow-card' : 'text-muted hover:bg-signal-tint hover:text-ink')
            }
          >
            <Icon name={t.icon} size={18} />
            {t.label}
            {t.id === 'out' && <span className="font-body text-[13px] font-semibold opacity-80">{rows.length}</span>}
          </button>
        ))}
      </div>
      {more === 'log' && top}
      {more === 'map' && <LiveYard entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} />}

      {more === 'out' && (
        <section id="outbound" className="rounded-2xl border border-hair bg-panel shadow-card">
          <CardHead
            icon="truck"
            title={
              <>
                Outbound Shipments <span className="font-semibold text-muted">({rows.length})</span>
              </>
            }
            sub="Today's pickups and any still on site"
          >
            {active.length > 0 && (
              <button type="button" onClick={() => setFilters({})} className={'no-print ' + ui.btnGhost}>
                <Icon name="close" size={18} />
                Clear filters
              </button>
            )}
          </CardHead>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[14px]">
              <thead className="bg-field text-[13px] font-semibold text-muted">
                <tr className="border-b border-hair">
                  {COLUMNS.map((c) => (
                    <th key={c.id} className="px-3.5 py-3 align-top">
                      <span className="block">{c.label}</span>
                      <select
                        aria-label={`Filter by ${c.label}`}
                        value={filters[c.id] ?? ''}
                        onChange={(ev) => setFilter(c.id, ev.target.value)}
                        className={
                          'no-print mt-1 w-full max-w-[170px] cursor-pointer rounded-lg border-[1.5px] bg-panel px-1.5 py-1 text-[13px] font-normal text-ink transition-colors ' +
                          (filters[c.id] ? 'border-signal' : 'border-line hover:border-signal-bright')
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
                  <th className="no-print px-3.5 py-3 align-top">Options</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted">
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
                      <tr key={e.id} className="align-top transition-colors duration-150 hover:bg-signal-tint">
                        <td className="px-3.5 py-3 font-semibold">{e.pickupNumber || <Dash />}</td>
                        <td className="px-3.5 py-3">{e.customerPickupFor || <Dash />}</td>
                        {/* Assign dock only for pickups still on site without a dock, once their order is ready. */}
                        <td className="whitespace-nowrap px-3.5 py-3 font-semibold">
                          {e.dockDoor ? (
                            e.dockDoor
                          ) : e.timeOut ? (
                            <Dash />
                          ) : !e.orderReadyAt ? (
                            <span className="text-[13px] font-normal text-muted">Order not ready</span>
                          ) : (
                            <span className="no-print font-normal">
                              <AssignDock entry={e} occupied={occupied} onAssignDock={onAssignDock} compact />
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3">
                          {e.appointmentTime ? `Appt ${e.appointmentTime}` : 'No appt'}
                          <Sub>
                            In {e.timeIn || '—'}
                            {e.dateIn !== today && ` · ${e.dateIn}`}
                          </Sub>
                          {late !== null && late > LATE_GRACE_MIN && <Warn>{duration(late * 60000)} late</Warn>}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3">
                          {duration(onSiteMs(e, now))}
                          {det && (
                            <span className={ui.tag + ' mt-1 flex w-fit ' + DETENTION_TAG[det.level]}>
                              <Icon name={DETENTION_ICON[det.level]} size={14} />
                              {det.text}
                            </span>
                          )}
                          {e.timeOut && <Sub>Left {e.timeOut}</Sub>}
                          {e.dockAssignedAt && <Sub>Docked {clockTime(e.dockAssignedAt)}</Sub>}
                        </td>
                        <td className="px-3.5 py-3">
                          <span className={ui.tag + ' ' + STATUS_TAG[s]}>{s}</span>
                        </td>
                        <td className="no-print whitespace-nowrap px-3.5 py-3">
                          {/* Always shows "Options"; picking a choice runs it and the select snaps back. */}
                          <select
                            aria-label={`Options for ${e.truckName} ${e.trailerNumber}`}
                            value=""
                            onChange={(ev) => {
                              const choice = ev.target.value
                              if (choice === 'checkout') onCheckOut(e)
                              else onEdit(e)
                            }}
                            className="cursor-pointer rounded-lg border-[1.5px] border-line bg-panel px-2 py-1.5 text-[14px] font-semibold text-ink transition-colors hover:border-signal-bright"
                          >
                            <option value="" disabled>
                              Options
                            </option>
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

          <div className="no-print flex flex-wrap items-center justify-end gap-3 border-t border-hair px-5 py-4">
            {rows.length > MAX_ROWS && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className={'mr-auto ' + ui.btnGhost}>
                {showAll ? 'Show less' : `Show all (${rows.length})`}
              </button>
            )}
            {exportError && <span className="mr-auto font-semibold text-danger">{exportError}</span>}
            <button type="button" onClick={handlePrint} disabled={!rows.length} className={ui.btnSmall}>
              <Icon name="print" />
              Print
            </button>
            <button type="button" onClick={handleExport} disabled={!rows.length || exporting} className={ui.btnSmallPrimary}>
              <Icon name="export" />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </section>
      )}
      {children}
    </div>
  )
}
