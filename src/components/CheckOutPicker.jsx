import { useEffect, useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, duration } from '../time'
import { isDrop } from '../metrics'
import { DETENTION_FREE_MIN, DETENTION_RATE_PER_HOUR, DETENTION_WARN_MIN } from '../yard'
import { checkOutBlock, isReleased } from '../handoff'

const MIN = 60000

// Detention state of a truck on site: past free time, close to it, or neither. Dropped trailers
// have no driver waiting, so they never count.
function detention(e, now) {
  if (isDrop(e)) return null
  const ms = now - arrivalMs(e)
  if (!Number.isFinite(ms)) return null
  if (ms > DETENTION_FREE_MIN * MIN) {
    const fee = Math.round(((ms - DETENTION_FREE_MIN * MIN) / (60 * MIN)) * DETENTION_RATE_PER_HOUR)
    return { level: 'over', text: `⚠ Over ${DETENTION_FREE_MIN / 60} h · est. $${fee}` }
  }
  if (ms > DETENTION_WARN_MIN * MIN) return { level: 'near', text: `Near free time · ${duration(DETENTION_FREE_MIN * MIN - ms)} left` }
  return null
}

const DETENTION_TAG = { over: 'bg-danger-soft text-danger', near: 'bg-signal text-signal-ink' }

// Short form of why a truck can't be checked out yet (the form explains in full).
const blockedShort = (e) =>
  e.loadingInspection?.result === 'Fail' ? 'Inspection failed · re-check' : !e.loadingInspection ? 'Not inspected yet' : 'Waiting for Shipping release'

// First step of Check Out: choose which on-site truck is leaving. One search box filters the list;
// Enter picks the truck when only one matches.
export default function CheckOutPicker({ entries, onPick }) {
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(Date.now)

  // Keeps the "ago" times and detention warnings current while the list is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const q = search.trim().toLowerCase()
  // Trucks at a dock with no inspection yet aren't listed (they can't leave); a note counts them.
  const notInspected = entries.filter((e) => !e.timeOut && e.dockDoor && !e.loadingInspection)
  const allOnSite = entries.filter((e) => !e.timeOut && !notInspected.includes(e))
  // Oldest first, so trucks already in detention lead the list.
  const onSite = allOnSite
    .filter((e) => !q || [e.trailerNumber, e.truckName, e.truckerNameIn, e.pickupNumber, e.dockDoor].join(' ').toLowerCase().includes(q))
    .sort((a, b) => arrivalMs(a) - arrivalMs(b))
  const overCount = allOnSite.filter((e) => detention(e, now)?.level === 'over').length
  // Trucks Shipping released come first, longest-released first; the rest follow.
  const released = onSite.filter(isReleased).sort((a, b) => a.release.releasedAt - b.release.releasedAt)
  const others = onSite.filter((e) => !isReleased(e))

  const handleSubmit = (ev) => {
    ev.preventDefault()
    if (onSite.length === 1) onPick(onSite[0])
  }

  const card = (e) => {
    const d = detention(e, now)
    const blocked = checkOutBlock(e)
    const rel = e.release
    return (
      <li key={e.id}>
        <button
          type="button"
          onClick={() => onPick(e)}
          className={
            'flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border-2 bg-page px-4 py-3 text-left hover:border-ink ' +
            (d?.level === 'over' ? 'border-danger' : 'border-line')
          }
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
            {rel && (
              <span className="block text-[15px] font-semibold text-ink">
                Released {duration(now - rel.releasedAt)} ago by {rel.releasedBy}
                {rel.note && <span className="block font-normal text-muted">Gate note: {rel.note}</span>}
              </span>
            )}
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {d && <span className={ui.tag + ' ' + DETENTION_TAG[d.level]}>{d.text}</span>}
              {blocked && <span className={ui.tag + ' bg-danger-soft text-danger'}>⛔ {blockedShort(e)}</span>}
            </span>
          </span>
          {blocked ? <span className={ui.btnSmall}>Can't leave yet</span> : <span className={ui.btnSmallPrimary}>Check Out</span>}
        </button>
      </li>
    )
  }

  return (
    <section className="overflow-hidden rounded-[10px] border border-line bg-panel">
      <div className="border-b border-line px-5 pt-5 pb-3">
        <h2 className="font-display text-[26px] leading-tight font-bold">Check a Trailer Out</h2>
        <p className="text-muted">
          {allOnSite.length} on site
          {overCount > 0 && (
            <>
              {' · '}
              <b className="text-danger">
                {overCount} past {DETENTION_FREE_MIN / 60} h free time
              </b>
            </>
          )}
          {' · '}Choose the truck that is leaving.
        </p>
        {notInspected.length > 0 && (
          <p className="text-[13px] text-muted">
            {notInspected.length} at {notInspected.length === 1 ? 'a dock' : 'docks'} not inspected yet (not shown)
          </p>
        )}
      </div>
      <div className="p-5">
        <form role="search" onSubmit={handleSubmit}>
          <label htmlFor="checkout-search" className={ui.label + ' mb-1'}>
            Find a truck on site
          </label>
          <input
            id="checkout-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Trailer #, carrier, trucker, order no, dock…"
            autoComplete="off"
            className={ui.input}
          />
          <p className="mt-1 text-[13px] text-muted" aria-live="polite">
            {q ? `${onSite.length} match${onSite.length === 1 ? ' · press Enter to check it out' : 'es'}` : 'Longest on site first.'}
          </p>
        </form>

        {onSite.length === 0 ? (
          <p className="py-5 text-muted">{q ? 'No trucks on site match that search.' : 'No trucks on site. Checked-in trucks appear here.'}</p>
        ) : (
          <>
            {released.length > 0 && (
              <section aria-labelledby="released-title" className="mt-4">
                <h3 id="released-title" className="mb-2 font-display text-[20px] leading-tight font-bold">
                  Released by Shipping ({released.length})
                </h3>
                <ul className="grid gap-2.5">{released.map(card)}</ul>
              </section>
            )}
            {others.length > 0 && (
              <section aria-labelledby="others-title" className="mt-4">
                {released.length > 0 && (
                  <h3 id="others-title" className="mb-2 font-display text-[20px] leading-tight font-bold text-muted">
                    Other trucks on site ({others.length})
                  </h3>
                )}
                <ul className="grid gap-2.5">{others.map(card)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  )
}
