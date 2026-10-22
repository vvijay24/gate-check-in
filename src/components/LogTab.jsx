import { useState } from 'react'
import { LOG_COLUMNS, exportToExcel } from '../logColumns'
import * as ui from '../ui'

// Gate Log: every entry, one column per field, with Excel export of all rows.
export default function LogTab({ entries }) {
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const rows = entries

  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      await exportToExcel(rows, `gate-log-${stamp}.xlsx`)
    } catch {
      setExportError('Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-[26px] leading-tight font-bold">Gate Log</h2>

      <p className="text-muted" role="status">
        {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
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
                  No entries yet. Entries logged on the Gate tab appear here.
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
