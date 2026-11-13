import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import * as ui from '../ui'
import { LOG_COLUMNS, exportToExcel } from '../logColumns'
import AssignDock, { occupiedDocks } from './AssignDock'
import { LATE_GRACE_MIN, arrivalMs, clockTime, dayKey, departureMs, duration, minutesLate } from '../time'
import { DETENTION_ICON, DETENTION_TAG, detentionState } from '../detention'
import { Icon } from '../icons'
import CardHead from './CardHead'
import { awaitingRelease, inYard, isReleased } from '../handoff'
import { isDrop } from '../metrics'
import { checkedInAt } from '../stages'
import { STAGE_TARGETS } from '../turnaround/targets'

const ORDER_WAIT_MAX = STAGE_TARGETS.find((s) => s.key === 'orderWait').max
// Check-in to "Order ready", ms.
const orderWait = (e) => e.orderReadyAt - checkedInAt(e)

// Today = checked in today, plus anything still on site from earlier (the default view).
// On site = not checked out yet, including trucks already at a dock.
const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All' },
  { id: 'onsite', label: 'On site' },
  { id: 'departed', label: 'Departed' },
]

const MAX_ROWS = 7

const Dash = () => <span className="text-muted">—</span>

// After a passed inspection: Awaiting release (the inspector's turn), then Released to gate (the Gate's
// turn). Same wording as Outbound Shipments.
const STATUSES = ['Waiting for order', 'Ready for a dock', 'At dock', 'Awaiting release', 'Released to gate', 'Released to yard', 'Departed']
const statusOf = (e) =>
  e.timeOut
    ? 'Departed'
    : inYard(e)
      ? 'Released to yard'
      : isReleased(e)
        ? 'Released to gate'
        : awaitingRelease(e)
          ? 'Awaiting release'
          : e.dockDoor
            ? 'At dock'
            : e.orderReadyAt
              ? 'Ready for a dock'
              : 'Waiting for order'
const HOUR = 3600000
const onSiteMs = (e, now) => (e.timeOut ? departureMs(e) : now) - arrivalMs(e)
const isLate = (e) => (minutesLate(e) ?? 0) > LATE_GRACE_MIN
const hourOf = (e) => (e.timeIn ? Number(e.timeIn.slice(0, 2)) : null)
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
const sortedUnique = (values) => [...new Set(values.filter(Boolean))].sort()

// "Today", "Yesterday" or "Oct 26" (with the year when it isn't this year). The export keeps full dates.
function friendlyDate(key) {
  if (!key) return ''
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(yesterday)) return 'Yesterday'
  const d = new Date(`${key}T00:00`)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) })
}

// The six columns on screen. `options` lists the header dropdown's choices for the rows in the tab;
// `match` says whether an entry fits the chosen value. Every field still goes into the Excel export.
const COLUMNS = [
  {
    id: 'order',
    label: 'Order No',
    minWidth: 170,
    options: () => [
      { value: 'with', label: 'With order no' },
      { value: 'none', label: 'No order no' },
    ],
    match: (e, v) => (v === 'with' ? !!e.pickupNumber : !e.pickupNumber),
  },
  {
    id: 'customer',
    label: 'Customer',
    options: (rows) => sortedUnique(rows.map((e) => e.customerPickupFor)).map((c) => ({ value: c, label: c })),
    match: (e, v) => e.customerPickupFor === v,
  },
  {
    id: 'date',
    label: 'Date In',
    minWidth: 110,
    options: (rows) => sortedUnique(rows.map((e) => e.dateIn)).reverse().map((d) => ({ value: d, label: friendlyDate(d) })),
    match: (e, v) => e.dateIn === v,
  },
  // From the old Outbound shipments table: the appointment against the arrival, and time on site.
  {
    id: 'appt',
    label: 'Appointment / Arrived',
    // On time / late, then the hour it arrived (what the Time In column used to filter by).
    options: (rows) => [
      { value: 'ontime', label: 'On time' },
      { value: 'late', label: 'Late' },
      { value: 'none', label: 'No appointment' },
      ...[...new Set(rows.map(hourOf).filter((h) => h !== null))]
        .sort((a, b) => a - b)
        .map((h) => ({ value: `h${h}`, label: `Arrived ${hourLabel(h)}–${hourLabel((h + 1) % 24)}` })),
    ],
    match: (e, v) =>
      v.startsWith('h') ? hourOf(e) === Number(v.slice(1)) : v === 'none' ? !e.appointmentTime : !!e.appointmentTime && isLate(e) === (v === 'late'),
  },
  {
    id: 'onsite',
    label: 'Time on Site',
    options: () => [
      { value: '0-1', label: 'Under 1 h' },
      { value: '1-2', label: '1–2 h' },
      { value: '2-4', label: '2–4 h' },
      { value: '4-', label: 'Over 4 h' },
    ],
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

// The dock number is in the Dock column, so the status doesn't repeat it.
function StatusTag({ e }) {
  if (e.timeOut) return <span className={ui.tag + ' bg-ok-soft text-ok'}>Departed</span>
  if (inYard(e)) return <span className={ui.tag + ' bg-drop-soft text-drop'}>Released to yard</span>
  if (isReleased(e)) return <span className={ui.tag + ' bg-delivery-soft text-delivery'}>Released to gate</span>
  if (awaitingRelease(e)) return <span className={ui.tag + ' bg-ok text-panel'}>Awaiting release</span>
  if (e.dockDoor) return <span className={ui.tag + ' bg-ink text-panel'}>At dock</span>
  return <span className={ui.tag + ' bg-warn text-warn-ink'}>{e.orderReadyAt ? 'Ready for a dock' : 'Waiting for order'}</span>
}

// Prints only the Entry Log: index.css hides everything else while body has data-print="entry-log".
function printEntryLog() {
  document.body.dataset.print = 'entry-log'
  const done = () => {
    delete document.body.dataset.print
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

// `initialFilters` (e.g. { status: 'Waiting for order' }): header filters already set when it opens.
export default function EntryLog({ entries, onEdit, onCheckOut, onDelete, onAssignDock, onOrderReady, initialFilters }) {
  const [tab, setTab] = useState('today')
  const [search, setSearch] = useState('')
  // Header dropdown choices by column id; '' = All.
  const [filters, setFilters] = useState(() => initialFilters ?? {})
  // The table shows the first MAX_ROWS rows until "Show all" is clicked.
  const [showAll, setShowAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  // Keeps the detention pills current.
  const [now, setNow] = useState(Date.now)
  const occupied = occupiedDocks(entries)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // The tab lists for a set of entries. All and Today: trucks still on site first; each group keeps
  // newest-first order.
  const today = dayKey(new Date(now))
  const tabLists = (list) => {
    const onsite = list.filter((e) => !e.timeOut)
    const departed = list.filter((e) => e.timeOut)
    const all = [...onsite, ...departed]
    return { today: all.filter((e) => e.dateIn === today || !e.timeOut), all, onsite, departed }
  }
  // Search matches any field (the same fields the export has); tabs and counts apply on top of it.
  const q = search.trim().toLowerCase()
  const matches = q ? entries.filter((e) => LOG_COLUMNS.some((c) => String(c.get(e) ?? '').toLowerCase().includes(q))) : entries
  const lists = tabLists(matches)
  // Header dropdowns narrow the selected tab further.
  const active = COLUMNS.filter((c) => filters[c.id])
  const rows = lists[tab].filter((e) => active.every((c) => c.match(e, filters[c.id], now)))
  const setFilter = (id, value) => setFilters((f) => ({ ...f, [id]: value }))
  const clearAll = () => {
    setSearch('')
    setFilters({})
  }

  // "Showing 4 of 31 · Today · search "penske" · Status: Waiting": what is narrowing the list.
  const tabTotal = tabLists(entries)[tab].length
  const narrowing = [
    TABS.find((t) => t.id === tab).label,
    q && `search “${search.trim()}”`,
    ...active.map((c) => `${c.label}: ${c.options(lists[tab]).find((o) => o.value === filters[c.id])?.label ?? filters[c.id]}`),
  ].filter(Boolean)
  const shown = showAll ? rows : rows.slice(0, MAX_ROWS)
  // Print covers every filtered row, so expand the table before the print dialog opens.
  const handlePrint = () => {
    flushSync(() => setShowAll(true))
    printEntryLog()
  }

  const empty = q || active.length
    ? 'No entries match your search or filters.'
    : {
        today: 'No check-ins today and no trucks on site. Earlier days are under All.',
        all: 'No entries yet. Trucks checked in on the Gate tab appear here.',
        onsite: 'No trucks on site.',
        departed: 'No trucks have departed yet.',
      }[tab]

  // Exports the rows in the selected tab, with the Gate Log's columns.
  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      await exportToExcel(rows, `entry-log-${tab}-${stamp}.xlsx`)
    } catch {
      setExportError('Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section id="entry-log" className="rounded-2xl border border-hair bg-panel shadow-card">
      <CardHead icon="log" title="Entry Log" sub="Every check-in, newest first">
        <div role="tablist" aria-label="Entry Log filter" className="no-print flex flex-wrap gap-1 rounded-xl border border-hair bg-panel p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                'min-h-10 cursor-pointer rounded-lg px-3.5 font-display text-[15px] font-bold transition-colors duration-150 ' +
                (tab === t.id ? 'bg-signal text-signal-ink shadow-card' : 'text-ink hover:bg-signal-tint')
              }
            >
              {t.label} <span className="font-semibold opacity-70">({lists[t.id].length})</span>
            </button>
          ))}
        </div>
      </CardHead>

      <div className="no-print flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
        <label htmlFor="entry-search" className="sr-only">
          Search the Entry Log
        </label>
        <input
          id="entry-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order no, customer, trailer, truck, trucker, seal, dock, guard…"
          className={ui.input + ' min-w-0 flex-1'}
        />
      </div>

      <div className="no-print flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 text-[14px]" aria-live="polite">
        <span>
          <b>
            Showing {rows.length} of {tabTotal}
          </b>
          <span className="text-muted"> · {narrowing.join(' · ')}</span>
        </span>
        {(q || active.length > 0) && (
          <button type="button" onClick={clearAll} className={ui.btnGhost + ' min-h-9'}>
            <Icon name="close" size={16} />
            Clear all
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left text-[14px]">
          <thead className="bg-field text-[13px] font-semibold text-muted">
            <tr className="border-y border-hair">
              {COLUMNS.map((c) => (
                <th key={c.id} className="px-3.5 py-3 align-top" style={c.minWidth ? { minWidth: c.minWidth } : undefined}>
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
                    {c.options(lists[tab]).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
              <th className="no-print px-3.5 py-3 align-top">Dock</th>
              <th className="no-print px-3.5 py-3 align-top">Options</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              shown.map((e) => {
                const det = detentionState(e, now)
                return (
                // A check-in saved in the last minute starts tinted and fades, so it's easy to spot.
                <tr
                  key={e.id}
                  className={
                    'align-top transition-colors duration-150 hover:bg-signal-tint' + (Date.now() - (e.createdAt ?? 0) < 60000 ? ' animate-fresh' : '')
                  }
                >
                  <td className="px-3.5 py-3">
                    <span className="font-semibold">{e.pickupNumber || <Dash />}</span>
                    {/* Which truck this is, even for deliveries and drops that have no order no. */}
                    <span className="block text-[13px] text-muted">
                      Trailer {e.trailerNumber || '—'}
                      {e.truckName && ` · ${e.truckName}`}
                    </span>
                  </td>
                  <td className="px-3.5 py-3">{e.customerPickupFor || <Dash />}</td>
                  <td className="whitespace-nowrap px-3.5 py-3" title={e.dateIn}>
                    {friendlyDate(e.dateIn) || <Dash />}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-3">
                    {e.appointmentTime ? `Appt ${e.appointmentTime}` : 'No appt'}
                    <span className="block text-[13px] text-muted">In {e.timeIn || '—'}</span>
                    {isLate(e) && (
                      <span className="flex items-center gap-1 text-[13px] font-semibold text-danger">
                        <Icon name="warning" size={14} />
                        {duration(minutesLate(e) * 60000)} late
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-3">
                    {Number.isFinite(onSiteMs(e, now)) ? duration(onSiteMs(e, now)) : <Dash />}
                    {det && (
                      <span className={ui.tag + ' mt-1 flex w-fit ' + DETENTION_TAG[det.level]}>
                        <Icon name={DETENTION_ICON[det.level]} size={14} />
                        {det.text}
                      </span>
                    )}
                    {e.timeOut && <span className="block text-[13px] text-muted">Left {e.timeOut}</span>}
                    {e.dockAssignedAt && <span className="block text-[13px] text-muted">Docked {clockTime(e.dockAssignedAt)}</span>}
                  </td>
                  <td className="px-3.5 py-3">
                    <StatusTag e={e} />
                    {/* The order: when it was ready and how long the truck waited for it. */}
                    {e.orderReadyAt ? (
                      <span className={'block text-[13px] ' + (orderWait(e) > ORDER_WAIT_MAX * 60000 ? 'font-semibold text-danger' : 'text-muted')}>
                        Order ready {clockTime(e.orderReadyAt)} · waited {duration(orderWait(e))}
                      </span>
                    ) : (
                      !e.timeOut &&
                      !e.dockDoor &&
                      !isDrop(e) && (
                        <span className={'block text-[13px] ' + (now - checkedInAt(e) > ORDER_WAIT_MAX * 60000 ? 'font-semibold text-danger' : 'text-muted')}>
                          Waiting {duration(now - checkedInAt(e))} for the order
                        </span>
                      )
                    )}
                  </td>
                  {/* Assign dock only for trucks still on site without a dock, once their order is ready. */}
                  <td className="no-print whitespace-nowrap px-3.5 py-3">
                    {e.dockDoor ? (
                      <span className="font-semibold">Dock {e.dockDoor}</span>
                    ) : e.timeOut ? (
                      <Dash />
                    ) : !e.orderReadyAt ? (
                      onOrderReady ? (
                        <button type="button" onClick={() => onOrderReady(e.id)} className={ui.btnSmallPrimary}>
                          <Icon name="done" size={18} />
                          Order ready
                        </button>
                      ) : (
                        <span className="text-[13px] text-muted">Order not ready</span>
                      )
                    ) : (
                      <AssignDock entry={e} occupied={occupied} onAssignDock={onAssignDock} compact />
                    )}
                  </td>
                  <td className="no-print whitespace-nowrap px-3.5 py-3">
                    {/* Always shows "Options"; picking a choice runs it and the select snaps back. */}
                    <select
                      aria-label={`Options for ${e.truckName} ${e.trailerNumber}`}
                      value=""
                      onChange={(ev) => {
                        const choice = ev.target.value
                        if (choice === 'checkout') onCheckOut(e)
                        else if (choice === 'edit') onEdit(e)
                        else if (choice === 'delete' && window.confirm(`Delete entry for ${e.truckName}?`)) onDelete(e.id)
                      }}
                      className="cursor-pointer rounded-lg border-[1.5px] border-line bg-panel px-2 py-1.5 text-[14px] font-semibold text-ink transition-colors hover:border-signal-bright"
                    >
                      <option value="" disabled>
                        Options
                      </option>
                      <option value="checkout">{e.timeOut ? 'Edit Check Out' : 'Check Out'}</option>
                      <option value="edit">Edit Check In</option>
                      <option value="delete">Delete</option>
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
  )
}
