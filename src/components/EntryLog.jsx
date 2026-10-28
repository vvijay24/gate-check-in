import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import * as ui from '../ui'
import { LOG_COLUMNS, exportToExcel } from '../logColumns'
import AssignDock, { occupiedDocks } from './AssignDock'
import { dayKey } from '../time'
import { DETENTION_TAG, detentionState } from '../detention'
import { awaitingRelease, isReleased } from '../handoff'

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

// After a passed inspection: Awaiting release (Shipping's turn), then Released to gate (the Gate's
// turn). Same wording as Outbound Shipments.
const STATUSES = ['Waiting', 'At dock', 'Awaiting release', 'Released to gate', 'Departed']
const statusOf = (e) =>
  e.timeOut ? 'Departed' : isReleased(e) ? 'Released to gate' : awaitingRelease(e) ? 'Awaiting release' : e.dockDoor ? 'At dock' : 'Waiting'
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

// The five columns on screen. `options` lists the header dropdown's choices for the rows in the tab;
// `match` says whether an entry fits the chosen value. Every field still goes into the Excel export.
const COLUMNS = [
  {
    id: 'order',
    label: 'Order No',
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
    options: (rows) => sortedUnique(rows.map((e) => e.dateIn)).reverse().map((d) => ({ value: d, label: friendlyDate(d) })),
    match: (e, v) => e.dateIn === v,
  },
  {
    id: 'time',
    label: 'Time In',
    options: (rows) =>
      [...new Set(rows.map(hourOf).filter((h) => h !== null))]
        .sort((a, b) => a - b)
        .map((h) => ({ value: String(h), label: `${hourLabel(h)}–${hourLabel((h + 1) % 24)}` })),
    match: (e, v) => hourOf(e) === Number(v),
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
  if (isReleased(e)) return <span className={ui.tag + ' bg-delivery-soft text-delivery'}>Released to gate</span>
  if (awaitingRelease(e)) return <span className={ui.tag + ' bg-ok text-panel'}>Awaiting release</span>
  if (e.dockDoor) return <span className={ui.tag + ' bg-ink text-panel'}>At dock</span>
  return <span className={ui.tag + ' bg-signal text-signal-ink'}>Waiting</span>
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

export default function EntryLog({ entries, onEdit, onCheckOut, onDelete, onAssignDock }) {
  const [tab, setTab] = useState('today')
  const [search, setSearch] = useState('')
  // Header dropdown choices by column id; '' = All.
  const [filters, setFilters] = useState({})
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
  const rows = lists[tab].filter((e) => active.every((c) => c.match(e, filters[c.id])))
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
    <section id="entry-log" className="rounded-[10px] border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="font-display text-[26px] leading-tight font-bold">Entry Log</h2>
        <div role="tablist" aria-label="Entry Log filter" className="no-print flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                'min-h-11 cursor-pointer rounded-lg border-2 px-4 font-display text-lg font-bold ' +
                (tab === t.id ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-panel text-ink')
              }
            >
              {t.label} <span className="font-semibold opacity-70">({lists[t.id].length})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-3 px-5 pb-4">
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
          <button type="button" onClick={clearAll} className="cursor-pointer font-semibold underline">
            Clear all
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
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
                    {c.options(lists[tab]).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
              <th className="no-print px-3 py-2.5 align-top">Dock</th>
              <th className="no-print px-3 py-2.5 align-top">Options</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              shown.map((e) => {
                const det = detentionState(e, now)
                return (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{e.pickupNumber || <Dash />}</span>
                    {/* Which truck this is, even for deliveries and drops that have no order no. */}
                    <span className="block text-[13px] text-muted">
                      Trailer {e.trailerNumber || '—'}
                      {e.truckName && ` · ${e.truckName}`}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{e.customerPickupFor || <Dash />}</td>
                  <td className="whitespace-nowrap px-3 py-2.5" title={e.dateIn}>
                    {friendlyDate(e.dateIn) || <Dash />}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{e.timeIn || <Dash />}</td>
                  <td className="px-3 py-2.5">
                    <StatusTag e={e} />
                    {det && <span className={ui.tag + ' mt-1 block w-fit ' + DETENTION_TAG[det.level]}>{det.text}</span>}
                  </td>
                  {/* Assign dock only for trucks still on site without a dock. */}
                  <td className="no-print whitespace-nowrap px-3 py-2.5">
                    {e.dockDoor ? (
                      <span className="font-semibold">Dock {e.dockDoor}</span>
                    ) : e.timeOut ? (
                      <Dash />
                    ) : (
                      <AssignDock entry={e} occupied={occupied} onAssignDock={onAssignDock} compact />
                    )}
                  </td>
                  <td className="no-print whitespace-nowrap px-3 py-2.5">
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
                      className="cursor-pointer rounded-md border border-line bg-panel px-2 py-1.5 text-[14px] font-semibold text-ink"
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
  )
}
