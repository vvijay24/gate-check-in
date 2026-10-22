import { useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, duration } from '../time'

// First step of Check Out: choose which on-site truck is leaving.
export default function CheckOutPicker({ entries, onPick }) {
  const [search, setSearch] = useState('')
  const now = Date.now()
  const q = search.trim().toLowerCase()
  const allOnSite = entries.filter((e) => !e.timeOut)
  // Dropdown/suggestion list: on-site trucks by trailer #, for picking without scrolling.
  const byTrailer = [...allOnSite].sort((a, b) =>
    String(a.trailerNumber).localeCompare(String(b.trailerNumber), undefined, { numeric: true }),
  )
  const onSite = allOnSite
    .filter((e) => !q || [e.trailerNumber, e.truckName, e.truckerNameIn, e.pickupNumber, e.dockDoor].join(' ').toLowerCase().includes(q))
    .sort((a, b) => arrivalMs(a) - arrivalMs(b))

  return (
    <section className="overflow-hidden rounded-[10px] border border-line bg-panel">
      <div className="border-b border-line px-5 pt-5 pb-3">
        <h2 className="font-display text-[26px] leading-tight font-bold">Check a Trailer Out</h2>
        <p className="text-muted">Choose the truck that is leaving.</p>
      </div>
      <div className="p-5">
        <label htmlFor="checkout-search" className={ui.label + ' mb-1'}>
          Find a truck on site
        </label>
        <input
          id="checkout-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Trailer #, truck, trucker, order no, dock…"
          list="onsite-trailers"
          className={ui.input}
        />
        <datalist id="onsite-trailers">
          {byTrailer.map((e) => (
            <option key={e.id} value={e.trailerNumber}>
              {e.truckName}
            </option>
          ))}
        </datalist>

        <label htmlFor="checkout-select" className={ui.label + ' mt-3.5 mb-1'}>
          Or pick by Trailer #
        </label>
        <select
          id="checkout-select"
          value=""
          onChange={(ev) => {
            const picked = allOnSite.find((e) => e.id === ev.target.value)
            if (picked) onPick(picked)
          }}
          disabled={!byTrailer.length}
          className={ui.input}
        >
          <option value="">{byTrailer.length ? `Select a trailer (${byTrailer.length} on site)` : 'No trucks on site'}</option>
          {byTrailer.map((e) => (
            <option key={e.id} value={e.id}>
              {e.trailerNumber} · {e.truckName}
              {e.dockDoor ? ` · Dock ${e.dockDoor}` : ''}
            </option>
          ))}
        </select>

        {onSite.length === 0 ? (
          <p className="py-5 text-muted">{q ? 'No trucks on site match that search.' : 'No trucks on site. Checked-in trucks appear here.'}</p>
        ) : (
          <ul className="mt-4 grid gap-2.5">
            {onSite.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onPick(e)}
                  className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-line bg-page px-4 py-3 text-left hover:border-ink"
                >
                  <span className="min-w-0">
                    <span className="block font-display text-[23px] leading-tight font-bold break-words">
                      {e.trailerNumber} · {e.truckName}
                    </span>
                    <span className="block text-[15px] text-muted">
                      {[(e.visitPurpose ?? []).join(' + '), e.truckerNameIn, e.dockDoor && `Dock ${e.dockDoor}`, `In ${e.timeIn || '—'} (${duration(now - arrivalMs(e))} ago)`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className={ui.btnSmallPrimary}>Check Out</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
