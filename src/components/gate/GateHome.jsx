import { useState } from 'react'
import * as ui from '../../ui'
import { Icon, IconChip } from '../../icons'
import { clock12, clockTime, duration } from '../../time'
import { isReleased } from '../../handoff'
import { NO_SHOW_MIN } from '../../schedule'

// The Gate's home: a slim status strip, then Check in and Check out side by side, each a short list to
// pick from (today's bookings / trucks released to leave) with a search for anything else. Picking a row
// opens that column's form under a "Back to …" button. No list scrolls inside the page: the lists are
// capped (4 rows before typing, 6 when searching) and every row shows whole.

const MIN = 60000
const FIRST_ROWS = 4
const SEARCH_ROWS = 6

// Where a booking stands against its slot: over 15 min after it is late (red), within 15 min either side
// is due now (slate), otherwise how long until it (muted).
export function bookingState(a, now) {
  const past = Math.round((now - a.ms) / MIN)
  if (past > 15) return { key: 'late', label: `${duration(past * MIN)} late`, cls: 'text-danger' }
  if (past >= -15) return { key: 'due', label: 'Due now', cls: 'text-signal' }
  return { key: 'later', label: `in ${duration(-past * MIN)}`, cls: 'text-muted' }
}

// Bookings the guard can still check in: not arrived, and not yet a no-show.
export const openBookings = (schedule, now) => schedule.filter((a) => !a.entryId && now - a.ms <= NO_SHOW_MIN * MIN)

// "1:30" without AM/PM, for the time column (the list is today's, in order).
const shortClock = (ms) => clockTime(ms).replace(/\s?[AP]M$/i, '')
// A customer picking up with its own truck books under the carrier "Pickup".
const carrierName = (a) => (a.carrier === 'Pickup' ? `${a.customer} (own truck)` : a.carrier)
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const has = (text, q) => String(text ?? '').toLowerCase().includes(q)

// The navy strip above the two columns.
export function GateBar({ entries, schedule, now, guard }) {
  const onSite = entries.filter((e) => !e.timeOut).length
  const late = openBookings(schedule, now).filter((a) => bookingState(a, now).key === 'late').length
  const ready = entries.filter(isReleased).length
  return (
    <div className="on-chrome flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl bg-chrome px-5 py-3 text-[15px] text-white shadow-card">
      <p className="min-w-0 flex-1">
        <b>{plural(onSite, 'truck')} on site</b>
        {late > 0 && (
          <>
            , <b className="text-signal-bright">{plural(late, 'booked truck')} late</b>
          </>
        )}
        , {ready} ready to leave
      </p>
      {guard && <p className="text-rail-text">Logging as <b className="text-white">{guard}</b>.</p>}
    </div>
  )
}

// The white panel both pickers share: header, search, the rows, and a footer.
function Picker({ icon, title, note, id, search, children, foot }) {
  return (
    <section aria-labelledby={id} className={ui.card + ' overflow-hidden'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-signal-tint px-5 py-3.5">
        <IconChip name={icon} />
        <h2 id={id} className="font-display text-[20px] leading-tight font-bold">
          {title}
        </h2>
        <p className="ml-auto text-[14px] font-semibold text-muted">{note}</p>
      </div>
      <div className="grid gap-3 px-5 pt-4 pb-4">
        {search}
        {children}
      </div>
      <div className="flex min-h-[60px] flex-wrap items-center gap-3 border-t border-hair bg-field/60 px-5 py-2">{foot}</div>
    </section>
  )
}

// A search box with its own 44px clear button. Plain text with inputMode search, so the browser doesn't
// add a second clear button of its own.
function SearchBox({ id, label, placeholder, value, onChange }) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="text"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        className={ui.input.replace('min-h-[52px]', 'min-h-12').replace('text-[17px]', 'text-[16px]') + ' pr-12 pl-10'}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => {
            onChange('')
            document.getElementById(id)?.focus()
          }}
          className="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-signal-tint hover:text-ink"
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  )
}

// One row: a single button, at least 64px tall.
function Row({ lead, leadCls = 'w-[56px]', title, line, state, onClick }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="grid min-h-16 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-hair bg-field px-3.5 py-2 text-left transition-colors duration-150 hover:border-signal-bright hover:bg-signal-tint"
      >
        <span className={'font-display text-[19px] leading-tight font-bold tabular-nums ' + leadCls}>{lead}</span>
        <span className="min-w-0">
          <b className="block truncate font-display text-[16px] leading-tight">{title}</b>
          <span className="block truncate text-[14px] text-muted">{line}</span>
        </span>
        <span className="text-right text-[14px] font-semibold whitespace-nowrap">{state}</span>
        <Icon name="chevron" size={18} className="text-muted" />
      </button>
    </li>
  )
}

const NoMatch = ({ children }) => (
  <p className="flex min-h-16 items-start gap-2 rounded-xl border border-dashed border-line px-4 py-3 text-[15px] text-muted">
    <Icon name="info" size={18} className="mt-0.5 shrink-0" />
    {children}
  </p>
)

// Where the typed text goes on a not-booked check-in: "SO…" is an order no., anything with a digit a
// trailer, otherwise a carrier.
export function notBookedStart(q) {
  const t = q.trim()
  if (!t) return {}
  if (/^so/i.test(t)) return { pickupNumber: t.toUpperCase() }
  if (/\d/.test(t)) return { trailerNumber: t.toUpperCase() }
  return { truckName: t }
}

// Check in: today's bookings not here yet. `onPick(booking)`; `onNotBooked(typed)` opens an empty form.
export function InPicker({ schedule, now, onPick, onNotBooked }) {
  const [q, setQ] = useState('')
  const open = openBookings(schedule, now)
  const rank = { late: 0, due: 1, later: 2 }
  const sorted = [...open].sort((a, b) => rank[bookingState(a, now).key] - rank[bookingState(b, now).key] || a.ms - b.ms)
  const term = q.trim().toLowerCase()
  const rows = term ? sorted.filter((a) => [a.orderNo, a.carrier, a.customer].some((v) => has(v, term))).slice(0, SEARCH_ROWS) : sorted.slice(0, FIRST_ROWS)
  const nextHour = open.filter((a) => a.ms - now <= 60 * MIN).length
  return (
    <Picker
      icon="checkIn"
      title="Check in"
      id="in-pick-title"
      note={`${nextHour} due in the next hour`}
      search={<SearchBox id="in-search" label="Find a booking" placeholder="Order no., carrier or customer" value={q} onChange={setQ} />}
      foot={
        <>
          <p className="min-w-0 flex-1 text-[14px] text-muted">{open.length ? `${open.length} booked, not here yet. Type to find any.` : 'No bookings for today yet.'}</p>
          <button type="button" onClick={() => onNotBooked(term && !rows.length ? q : '')} className={ui.btnSmall}>
            <Icon name="checkIn" size={18} />
            {term && !rows.length ? `Check in “${q.trim()}” as not booked` : 'Truck not booked'}
          </button>
        </>
      }
    >
      {rows.length ? (
        <ul className="grid gap-2" aria-label="Bookings">
          {rows.map((a) => {
            const s = bookingState(a, now)
            return (
              <Row
                key={a.id}
                lead={shortClock(a.ms)}
                title={carrierName(a)}
                line={`${a.orderNo}, ${a.customer}`}
                state={<span className={s.cls}>{s.label}</span>}
                onClick={() => onPick(a)}
              />
            )
          })}
        </ul>
      ) : term ? (
        <NoMatch>No booking matches “{q.trim()}”.</NoMatch>
      ) : (
        <NoMatch>No bookings for today yet. Tap Truck not booked to check a truck in.</NoMatch>
      )}
    </Picker>
  )
}

// Check out: trucks released to leave; searching covers every truck on site. `onPick(entry)`.
export function OutPicker({ entries, onPick }) {
  const [q, setQ] = useState('')
  const onSite = entries.filter((e) => !e.timeOut)
  const released = onSite.filter(isReleased).sort((a, b) => a.release.releasedAt - b.release.releasedAt)
  const term = q.trim().toLowerCase()
  const rows = term
    ? onSite
        .filter((e) => [e.trailerNumber, e.truckName, e.pickupNumber, e.truckerNameIn].some((v) => has(v, term)))
        .sort((a, b) => Number(isReleased(b)) - Number(isReleased(a)) || (a.release?.releasedAt ?? 0) - (b.release?.releasedAt ?? 0))
        .slice(0, SEARCH_ROWS)
    : released.slice(0, FIRST_ROWS)
  const more = Math.max(0, released.length - FIRST_ROWS)
  const busy = onSite.length - released.length
  // "2 more released, 7 still loading or waiting. Type to find any truck on site."
  const parts = [!term && more > 0 && `${more} more released`, busy > 0 && `${busy} still loading or waiting`].filter(Boolean)
  const footLine = parts.length ? `${parts.join(', ')}. Type to find any truck on site.` : onSite.length ? 'Every truck on site is listed.' : 'No trucks on site.'
  const place = (e) =>
    [e.release?.toYard ? (e.release.spot ? `Yard spot ${e.release.spot}` : 'In the yard') : e.dockDoor ? `Dock ${e.dockDoor}` : 'Waiting for a dock', e.pickupNumber].filter(Boolean).join(', ')
  return (
    <Picker
      icon="checkOut"
      title="Check out"
      id="out-pick-title"
      note={released.length ? `${released.length} released, ready to go` : 'None released yet'}
      search={<SearchBox id="out-search" label="Find a truck on site" placeholder="Trailer, carrier, order no. or driver" value={q} onChange={setQ} />}
      foot={
        <p className="text-[14px] text-muted">{footLine}</p>
      }
    >
      {rows.length ? (
        <ul className="grid gap-2" aria-label="Trucks leaving">
          {rows.map((e) => (
            <Row
              key={e.id}
              lead={e.trailerNumber || '—'}
              leadCls="w-[84px] truncate text-[15px] tracking-tight"
              title={e.truckName === 'Pickup' && e.customerPickupFor ? `${e.customerPickupFor} (own truck)` : e.truckName || '—'}
              line={place(e)}
              state={
                isReleased(e) ? (
                  <span className={ui.tag + ' bg-ok-soft text-ok'}>Released {shortClock(e.release.releasedAt)}</span>
                ) : (
                  <span className={ui.tag + ' bg-warn text-warn-ink'}>Not released</span>
                )
              }
              onClick={() => onPick(e)}
            />
          ))}
        </ul>
      ) : term ? (
        <NoMatch>No truck on site matches “{q.trim()}”. Check the trailer # with the driver, or call Shipping.</NoMatch>
      ) : (
        <NoMatch>{onSite.length ? 'No truck is released yet. Type to find a truck on site.' : 'No trucks on site.'}</NoMatch>
      )}
    </Picker>
  )
}

// Above an open form: back to the list, and (from a booking) what was filled in from the schedule.
export function PanelBack({ label, onBack, booking, now }) {
  const s = booking && bookingState(booking, now)
  return (
    <div className="grid gap-2">
      <button type="button" onClick={onBack} className={ui.btnGhost + ' w-fit -ml-3'}>
        <Icon name="chevron" size={18} className="rotate-180" />
        {label}
      </button>
      {booking && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-hair bg-signal-tint px-4 py-2.5 text-[14px]">
          <b className="font-display text-[16px] tabular-nums">{clock12(booking.time)}</b>
          <span className={'font-semibold ' + s.cls}>{s.label}</span>
          <span className="min-w-0">
            {booking.orderNo}, {booking.customer}, {carrierName(booking)}. <span className="text-muted">Filled in from today's schedule.</span>
          </span>
        </p>
      )}
    </div>
  )
}
