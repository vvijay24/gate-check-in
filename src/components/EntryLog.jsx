import { useState } from 'react'
import { flushSync } from 'react-dom'
import * as ui from '../ui'
import { LOG_COLUMNS, exportToExcel } from '../logColumns'
import AssignDock, { occupiedDocks } from './AssignDock'
import { dayKey } from '../time'

// Today = checked in today, plus anything still on site from earlier (the default view).
// Waiting = still on site (not checked out), including trucks already at a dock.
const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'departed', label: 'Departed' },
]

const MAX_ROWS = 7

const Dash = () => <span className="text-muted">—</span>

const statusOf = (e) => (e.timeOut ? 'Departed' : e.dockDoor ? 'At dock' : 'Waiting')
const hourOf = (e) => (e.timeIn ? Number(e.timeIn.slice(0, 2)) : null)
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
const sortedUnique = (values) => [...new Set(values.filter(Boolean))].sort()

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
    options: (rows) => sortedUnique(rows.map((e) => e.dateIn)).reverse().map((d) => ({ value: d, label: d })),
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
    options: () => ['Waiting', 'At dock', 'Departed'].map((s) => ({ value: s, label: s })),
    match: (e, v) => statusOf(e) === v,
  },
]

function StatusTag({ e }) {
  if (e.timeOut) return <span className={ui.tag + ' bg-ok-soft text-ok'}>Departed</span>
  if (e.dockDoor) return <span className={ui.tag + ' bg-ink text-panel'}>At dock {e.dockDoor}</span>
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
  const occupied = occupiedDocks(entries)

  // Search matches any field (the same fields the export has); tabs and counts apply on top of it.
  const q = search.trim().toLowerCase()
  const matches = q ? entries.filter((e) => LOG_COLUMNS.some((c) => String(c.get(e) ?? '').toLowerCase().includes(q))) : entries
  const waiting = matches.filter((e) => !e.timeOut)
  const departed = matches.filter((e) => e.timeOut)
  // All and Today: trucks still on site first; each group keeps newest-first order.
  const today = dayKey(new Date())
  const all = [...waiting, ...departed]
  const lists = { today: all.filter((e) => e.dateIn === today || !e.timeOut), all, waiting, departed }
  // Header dropdowns narrow the selected tab further.
  const active = COLUMNS.filter((c) => filters[c.id])
  const rows = lists[tab].filter((e) => active.every((c) => c.match(e, filters[c.id])))
  const setFilter = (id, value) => setFilters((f) => ({ ...f, [id]: value }))
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
        waiting: 'No trucks on site.',
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
        {active.length > 0 && (
          <button type="button" onClick={() => setFilters({})} className="cursor-pointer font-semibold underline">
            Clear filters
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
              shown.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2.5 font-semibold">{e.pickupNumber || <Dash />}</td>
                  <td className="px-3 py-2.5">{e.customerPickupFor || <Dash />}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{e.dateIn || <Dash />}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{e.timeIn || <Dash />}</td>
                  <td className="px-3 py-2.5">
                    <StatusTag e={e} />
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
              ))
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
