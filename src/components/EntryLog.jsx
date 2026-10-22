import * as ui from '../ui'

const fmt = (date, time) => (date ? `${date} ${time || ''}`.trim() : '')

function EntryCard({ e, onEdit, onCheckOut, onDelete }) {
  const purposes = e.visitPurpose ?? []
  const meta = [
    purposes.length > 0 && <b key="t" className="font-semibold text-ink">{purposes.join(' + ')}</b>,
    e.truckerNameIn && <span key="d">Trucker Name: {e.truckerNameIn}</span>,
  ].filter(Boolean)

  return (
    <div className="grid grid-cols-[8px_1fr] overflow-hidden rounded-lg bg-page">
      {/* One color band per purpose, stacked. */}
      <div className="flex flex-col">
        {purposes.length ? (
          purposes.map((p) => <div key={p} className={'flex-1 ' + (ui.PURPOSE_STYLES[p]?.stripe ?? 'bg-line')} />)
        ) : (
          <div className="flex-1 bg-line" />
        )}
      </div>
      <div className="flex gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[23px] leading-tight font-bold break-words">
              {e.trailerNumber} · {e.truckName}
            </span>
            {e.timeOut ? (
              <span className={ui.tag + ' bg-ok-soft text-ok'}>Departed</span>
            ) : (
              <span className={ui.tag + ' bg-signal text-signal-ink'}>On site</span>
            )}
          </div>
          {meta.length > 0 && (
            <div className="text-[15px] text-muted">
              {meta.reduce((acc, m, i) => (i ? [...acc, ' · ', m] : [m]), [])}
            </div>
          )}
          <div className="text-[15px] text-muted">
            In {fmt(e.dateIn, e.timeIn) || '—'}
            {e.timeOut && <> · Out {fmt(e.dateOut, e.timeOut)}</>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button onClick={() => onCheckOut(e)} className={e.timeOut ? ui.btnSmall : ui.btnSmallPrimary}>
              {e.timeOut ? 'Edit check-out' : 'Check out'}
            </button>
            <button onClick={() => onEdit(e)} className="cursor-pointer py-1 text-sm underline">
              Edit check-in
            </button>
            <button
              onClick={() => window.confirm(`Delete entry for ${e.truckName}?`) && onDelete(e.id)}
              className="cursor-pointer py-1 text-sm text-danger underline"
            >
              Delete
            </button>
          </div>
        </div>
        {e.odometerPhoto && (
          <img
            src={e.odometerPhoto}
            alt={`Odometer for ${e.truckName}`}
            className="h-16 w-20 shrink-0 rounded border border-line object-cover"
          />
        )}
      </div>
    </div>
  )
}

export default function EntryLog({ entries, onEdit, onCheckOut, onDelete }) {
  // Trucks still on site first; each group keeps newest-first order.
  const sorted = [...entries.filter((e) => !e.timeOut), ...entries.filter((e) => e.timeOut)]
  const onSite = entries.length - entries.filter((e) => e.timeOut).length

  return (
    <section className="no-print rounded-[10px] border border-line bg-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-[26px] leading-tight font-bold">Entry Log</h2>
        <div className="flex gap-7 text-[15px] text-muted">
          <div>
            <b className="block font-display text-[40px] leading-none text-ink">{onSite}</b>On site
          </div>
          <div>
            <b className="block font-display text-[40px] leading-none text-ink">{entries.length}</b>Total
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-5 text-muted">No entries yet. Logged trucks will appear here.</p>
      ) : (
        <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((e) => (
            <EntryCard key={e.id} e={e} onEdit={onEdit} onCheckOut={onCheckOut} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  )
}
