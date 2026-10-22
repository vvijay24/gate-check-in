import { useState } from 'react'
import * as ui from '../ui'
import { LOG_COLUMNS, exportToExcel } from '../logColumns'
import AssignDock, { occupiedDocks } from './AssignDock'

// Waiting = still on site (not checked out), including trucks already at a dock.
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'departed', label: 'Departed' },
]

const Dash = () => <span className="text-muted">—</span>
const Sub = ({ children }) => <span className="block text-[13px] text-muted">{children}</span>

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
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const occupied = occupiedDocks(entries)

  // Search matches any field (the same fields the export has); tabs and counts apply on top of it.
  const q = search.trim().toLowerCase()
  const matches = q ? entries.filter((e) => LOG_COLUMNS.some((c) => String(c.get(e) ?? '').toLowerCase().includes(q))) : entries
  const waiting = matches.filter((e) => !e.timeOut)
  const departed = matches.filter((e) => e.timeOut)
  // All: trucks still on site first; each group keeps newest-first order.
  const lists = { all: [...waiting, ...departed], waiting, departed }
  const rows = lists[tab]

  const empty = q
    ? 'No entries match your search.'
    : {
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

      <div className="no-print px-5 pb-4">
        <label htmlFor="entry-search" className="sr-only">
          Search the Entry Log
        </label>
        <input
          id="entry-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order no, trailer, truck, trucker, seal, dock, guard…"
          className={ui.input}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-[14px]">
          <thead className="text-[13px] font-semibold text-muted">
            <tr className="border-y border-line">
              <th className="px-3 py-2.5">Order No</th>
              <th className="px-3 py-2.5">Date In</th>
              <th className="px-3 py-2.5">Time In</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Trailer / Truck</th>
              <th className="px-3 py-2.5">Purpose</th>
              <th className="px-3 py-2.5">Trucker</th>
              <th className="px-3 py-2.5">Out</th>
              <th className="px-3 py-2.5">Odometer</th>
              <th className="no-print px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2.5 font-semibold">{e.pickupNumber || <Dash />}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{e.dateIn || <Dash />}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{e.timeIn || <Dash />}</td>
                  <td className="px-3 py-2.5">
                    <StatusTag e={e} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{e.trailerNumber || '—'}</span>
                    <Sub>{e.truckName}</Sub>
                  </td>
                  <td className="px-3 py-2.5">
                    {(e.visitPurpose ?? []).length ? (
                      <span className="flex flex-wrap gap-1">
                        {e.visitPurpose.map((p) => (
                          <span key={p} className={ui.tag + ' ' + (ui.PURPOSE_STYLES[p]?.tag ?? '')}>
                            {p}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {e.truckerNameIn || <Dash />}
                    {e.driverPhone && <Sub>{e.driverPhone}</Sub>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {e.timeOut ? (
                      <>
                        {e.timeOut}
                        <Sub>{e.dateOut}</Sub>
                      </>
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {e.odometerPhoto ? (
                      <img src={e.odometerPhoto} alt={`Odometer for ${e.truckName}`} className="h-10 w-14 rounded border border-line object-cover" />
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="no-print whitespace-nowrap px-3 py-2.5">
                    {!e.timeOut && !e.dockDoor && (
                      <div className="mb-2">
                        <AssignDock entry={e} occupied={occupied} onAssignDock={onAssignDock} compact />
                      </div>
                    )}
                    <button onClick={() => onCheckOut(e)} className="mr-3 cursor-pointer font-semibold underline">
                      {e.timeOut ? 'Edit check-out' : 'Check out'}
                    </button>
                    <button onClick={() => onEdit(e)} className="mr-3 cursor-pointer underline">
                      Edit check-in
                    </button>
                    <button
                      onClick={() => window.confirm(`Delete entry for ${e.truckName}?`) && onDelete(e.id)}
                      className="cursor-pointer text-danger underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="no-print flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4">
        {exportError && <span className="mr-auto font-semibold text-danger">{exportError}</span>}
        <button type="button" onClick={printEntryLog} disabled={!rows.length} className={ui.btnSmall}>
          Print
        </button>
        <button type="button" onClick={handleExport} disabled={!rows.length || exporting} className={ui.btnSmallPrimary}>
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </section>
  )
}
