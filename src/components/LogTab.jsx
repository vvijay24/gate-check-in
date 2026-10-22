import { useMemo, useState } from 'react'
import { VISIT_PURPOSES } from '../formConfig'
import { LOG_COLUMNS, exportToExcel } from '../logColumns'
import * as ui from '../ui'

const STATUS_OPTIONS = ['On site', 'Departed']

export default function LogTab({ entries }) {
  const [search, setSearch] = useState('')
  const [dateIn, setDateIn] = useState('')
  const [purpose, setPurpose] = useState('')
  const [status, setStatus] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter(
      (e) =>
        (!dateIn || e.dateIn === dateIn) &&
        (!purpose || (e.visitPurpose ?? []).includes(purpose)) &&
        (!status || (e.timeOut ? 'Departed' : 'On site') === status) &&
        (!q || LOG_COLUMNS.some((c) => String(c.get(e) ?? '').toLowerCase().includes(q))),
    )
  }, [entries, search, dateIn, purpose, status])

  const filtered = Boolean(search || dateIn || purpose || status)

  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      await exportToExcel(rows, `gate-log-${dateIn || stamp}.xlsx`)
    } catch {
      setExportError('Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-[26px] leading-tight font-bold">Gate Log</h2>
      <div className="flex flex-wrap items-end gap-3 rounded-[10px] border border-line bg-panel p-5">
        <div className="min-w-56 flex-1">
          <label htmlFor="log-search" className={ui.label + ' mb-1'}>Search</label>
          <input
            id="log-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Truck, trailer, seal, driver, guard, order no…"
            className={ui.input}
          />
        </div>
        <div>
          <label htmlFor="log-date" className={ui.label + ' mb-1'}>Date In</label>
          <input id="log-date" type="date" value={dateIn} onChange={(e) => setDateIn(e.target.value)} className={ui.input} />
        </div>
        <div>
          <label htmlFor="log-purpose" className={ui.label + ' mb-1'}>Purpose</label>
          <select id="log-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={ui.input}>
            <option value="">All</option>
            {VISIT_PURPOSES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="log-status" className={ui.label + ' mb-1'}>Status</label>
          <select id="log-status" value={status} onChange={(e) => setStatus(e.target.value)} className={ui.input}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setDateIn('')
              setPurpose('')
              setStatus('')
            }}
            className={ui.btnSmall + ' min-h-[52px]'}
          >
            Clear Filters
          </button>
        )}
      </div>

      <p className="text-muted" role="status">
        Showing {rows.length} of {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        {rows.length > 0 && ' · Export includes the rows shown'}
        {exportError && <span className="ml-2 font-semibold text-danger">{exportError}</span>}
      </p>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead className="text-[13px] font-semibold text-muted">
            <tr className="border-b border-line">
              {LOG_COLUMNS.map((c) => (
                <th key={c.header} className="whitespace-nowrap px-3 py-2.5">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={LOG_COLUMNS.length} className="px-3 py-6 text-muted">
                  {filtered ? 'No entries match these filters.' : 'No entries yet. Entries logged on the Gate tab appear here.'}
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className="align-top">
                  {LOG_COLUMNS.map((c) => {
                    const value = c.get(e)
                    if (c.header === 'Status') {
                      return (
                        <td key={c.header} className="px-3 py-2">
                          <span className={ui.tag + (e.timeOut ? ' bg-ok-soft text-ok' : ' bg-signal text-signal-ink')}>{value}</span>
                        </td>
                      )
                    }
                    if (c.header === 'Odometer Photo') {
                      return (
                        <td key={c.header} className="px-3 py-2">
                          {e.odometerPhoto ? (
                            <img src={e.odometerPhoto} alt={`Odometer for ${e.truckName}`} className="h-10 w-14 rounded border border-line object-cover" />
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      )
                    }
                    return (
                      <td key={c.header} className={'max-w-56 px-3 py-2 break-words' + (c.number ? ' text-right' : '')}>
                        {value === '' || value == null ? <span className="text-muted">—</span> : value}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Export sits below the table, after the rows it exports. */}
      <div className="flex justify-end">
        <button type="button" onClick={handleExport} disabled={!rows.length || exporting} className={ui.btnSmallPrimary}>
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </section>
  )
}
