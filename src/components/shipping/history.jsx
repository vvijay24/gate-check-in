import { useEffect, useRef, useState } from 'react'
import * as ui from '../../ui'
import { Icon, IconChip } from '../../icons'
import { arrivalMs, clock12, clockTime, dayKey, departureMs, duration, minutesLate, shortDate } from '../../time'
import { isDrop } from '../../metrics'
import { inYard, isReleased } from '../../handoff'
import { checkedInAt, inspectionSavedAt } from '../../stages'
import { reasonById } from '../../delayReasons'
import { tempGap, tempStatus } from '../../loadSheet'
import { truckRows } from '../../turnaround/discovery'
import { chargeOf } from '../../turnaround/management'
import { SearchBox } from '../gate/GateHome'
import { cases } from './parts'

// Looking up an order when someone calls: "Find an order" at the top of every Shipping page searches every
// day kept on this device, and a result opens the order's history: a timeline from booking to leaving the
// gate, what was loaded, seals and temperatures, and any waiting charge, with a proof of shipment to print,
// save as a PDF or email.

const MAX_RESULTS = 8
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const has = (v, q) => String(v ?? '').toLowerCase().includes(q)
const filled = (v) => String(v ?? '').trim() !== ''
// "Thu Nov 12".
const longDay = (key) => {
  const d = new Date(`${key}T00:00`)
  return `${WEEKDAY[d.getDay()]} ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}
const carrierOf = (e) => (e.truckName === 'Pickup' && e.customerPickupFor ? `${e.customerPickupFor} (own truck)` : e.truckName || '—')
const leftAt = (e) => e.checkedOutAt ?? (e.timeOut ? departureMs(e) : null)
// A time on the order's arrival day reads "3:42 PM"; on another day "Nov 13, 7:10 AM".
const at = (e, ms) => (ms == null ? '' : dayKey(new Date(ms)) === e.dateIn ? clockTime(ms) : `${shortDate(dayKey(new Date(ms)))}, ${clockTime(ms)}`)

// Where the order is now, in a few words.
export function orderState(e) {
  if (e.timeOut) return `Left ${at(e, leftAt(e)) || clock12(e.timeOut)}`
  if (inYard(e)) return `Loaded in the yard${e.release?.spot ? `, spot ${e.release.spot}` : ''}`
  if (isReleased(e)) return 'Released, leaving'
  if (e.dockDoor) return `At Dock ${e.dockDoor}`
  return e.orderReadyAt ? 'Waiting for a dock' : 'Waiting for the order'
}

// ---------------------------------------------------------------- Find an order
export function FindOrder({ entries, onOpen }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const term = q.trim().toLowerCase()
  const all = term
    ? entries
        .filter((e) => [e.pickupNumber, e.trailerNumber, e.truckName, e.customerPickupFor, e.truckerNameIn, e.truckerNameOut].some((v) => has(v, term)))
        .sort((a, b) => (arrivalMs(b) || 0) - (arrivalMs(a) || 0))
    : []
  const results = all.slice(0, MAX_RESULTS)
  // Closes when focus or a tap goes outside the box.
  useEffect(() => {
    if (!open) return
    const out = (ev) => box.current && !box.current.contains(ev.target) && setOpen(false)
    document.addEventListener('pointerdown', out)
    document.addEventListener('focusin', out)
    return () => {
      document.removeEventListener('pointerdown', out)
      document.removeEventListener('focusin', out)
    }
  }, [open])
  return (
    <div ref={box} className="no-print relative w-full sm:w-[340px]" onKeyDown={(ev) => ev.key === 'Escape' && setOpen(false)}>
      <SearchBox
        id="find-order"
        label="Find an order on any day"
        placeholder="Find an order: order no., trailer, carrier…"
        value={q}
        onChange={(v) => {
          setQ(v)
          setOpen(true)
        }}
      />
      {open && term && (
        <div className="absolute top-full right-0 z-20 mt-1.5 w-full min-w-[min(100vw-2rem,420px)] animate-pop overflow-hidden rounded-2xl border border-hair bg-panel shadow-overlay">
          {results.length ? (
            <>
              <ul aria-label="Orders found" className="divide-y divide-hair">
                {results.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onOpen(e.id)
                      }}
                      className="grid min-h-14 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-signal-tint"
                    >
                      <span className="min-w-0">
                        <b className="block truncate text-[15px]">
                          {e.pickupNumber || 'No order no.'}
                          <span className="font-normal text-muted">, {e.customerPickupFor || carrierOf(e)}</span>
                        </b>
                        <span className="block truncate text-[13px] text-muted">
                          Trailer {e.trailerNumber || '—'}, {carrierOf(e)}, {longDay(e.dateIn)}
                        </span>
                      </span>
                      <span className="text-right text-[13px] font-semibold whitespace-nowrap">{orderState(e)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {all.length > MAX_RESULTS && (
                <p className="border-t border-hair px-4 py-2 text-[13px] text-muted">
                  Showing the newest {MAX_RESULTS} of {all.length}. Type more of the order no. or trailer to narrow it down.
                </p>
              )}
            </>
          ) : (
            <p className="flex items-start gap-2 px-4 py-3 text-[14px] text-muted">
              <Icon name="info" size={18} className="mt-0.5 shrink-0" />
              No order matches “{q.trim()}”. Check the order no. with the caller. Only orders kept on this device can be found.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Order history
// The steps of a visit, in order: [label, time, detail]. A step not reached yet has no time.
function steps(e) {
  const tc = e.trailerCheck
  const insp = e.loadingInspection
  const late = minutesLate(e)
  const inspAt = inspectionSavedAt(e)
  const pass = insp?.result === 'Pass' ? (insp.correctiveAction ? 'Passed after a re-check' : 'Passed') : insp ? 'Failed' : ''
  const temps = insp ? ['tempFront', 'tempMiddle', 'tempRear'].map((k) => insp[k]).filter(filled) : []
  return [
    ['Booked', e.appointmentTime ? new Date(`${e.dateIn}T${e.appointmentTime}`).getTime() : null, e.appointmentTime ? '' : 'Not booked'],
    [
      'Arrived at the gate',
      arrivalMs(e),
      [e.guardOnDuty && `Checked in by ${e.guardOnDuty}`, late == null ? '' : late > 15 ? `${duration(late * 60000)} late` : late < -15 ? `${duration(-late * 60000)} early` : 'On time'].filter(Boolean).join('. '),
    ],
    ['Order ready', e.orderReadyAt ?? null, e.orderReadyAt ? `${duration(e.orderReadyAt - checkedInAt(e))} after check-in` : ''],
    ['Dock assigned', e.dockAssignedAt ?? null, e.dockDoor ? `Dock ${e.dockDoor}` : ''],
    ['Empty trailer checked', tc?.savedAt ?? null, tc ? `${tc.result === 'Pass' ? 'Passed' : 'Failed'}${tc.technician ? ` by ${tc.technician}` : ''}` : ''],
    ['Loading', e.loadStartedAt ?? null, e.loadStartedAt ? (e.loadFinishedAt ? `Finished ${at(e, e.loadFinishedAt)}, took ${duration(e.loadFinishedAt - e.loadStartedAt)}` : 'Still loading') : ''],
    ['Load inspected', inspAt ?? null, insp ? [pass + (insp.inspector ? ` by ${insp.inspector}` : ''), temps.length && `Product ${temps.map((t) => `${t}°F`).join(', ')}`].filter(Boolean).join('. ') : ''],
    [
      'Released',
      e.release?.releasedAt ?? null,
      e.release ? `${e.release.toYard ? `To the yard${e.release.spot ? `, spot ${e.release.spot}` : ''}` : 'To the gate'}${e.release.releasedBy ? ` by ${e.release.releasedBy}` : ''}${e.release.seal ? `, seal ${e.release.seal}` : ''}` : '',
    ],
    ['Left the gate', leftAt(e), e.timeOut ? [e.guardOut && `Checked out by ${e.guardOut}`, e.truckerNameOut && `driver ${e.truckerNameOut}`].filter(Boolean).join(', ') : ''],
  ]
}

// What was loaded and what it cost, as [label, value] rows.
function facts(e) {
  const s = e.loadSheet
  const insp = e.loadingInspection
  const row = truckRows([e])[0]
  const charge = row ? chargeOf(row) : 0
  const box = s && tempStatus(e) !== 'none' ? `${s.boxTemp}°F, ${tempStatus(e) === 'out' ? 'out of range' : 'in range'} (${Math.abs(tempGap(e))}° ${tempGap(e) >= 0 ? 'over' : 'under'} the ${s.setPoint}°F set point)` : ''
  return {
    load: [
      ['Type', isDrop(e) ? 'Drop trailer' : 'Pickup'],
      ['Products', s ? `${s.kind}: ${s.products.map((p) => p.name).join(', ')}` : ''],
      ['Cases', s ? cases(s.products.reduce((n, p) => n + p.cases, 0)) : insp?.caseCount ? cases(Number(insp.caseCount)) : ''],
      ['Pallets', insp?.palletsLoaded ? `${insp.palletsLoaded} pallets` : s?.pallets ? `${s.pallets} pallets` : ''],
      ['Box temperature', box],
    ],
    seals: [
      ['Seal on arrival', e.incomingSeals ? `${e.incomingSeals}${e.sealIntact === 'No' ? ', not intact' : ''}` : ''],
      ['Seal applied', e.release?.seal || insp?.sealApplied || e.outgoingSeals || ''],
      ['Seal at check-out', e.timeOut ? (e.sealConfirmed === 'No' ? `Didn't match. ${e.sealNote || ''}` : e.sealConfirmed === 'Yes' ? 'Matched' : '') : ''],
      ['Reefer', e.reefer === 'Yes' ? `Set ${e.tempSet || '?'}°F, read ${e.tempActual || '?'}°F on arrival` : e.reefer === 'No' ? 'Dry van' : ''],
    ],
    time: [
      ['Time on site', row?.turn != null ? `${duration(row.turn * 60000)}${e.timeOut ? '' : ' so far'}` : ''],
      ['Waiting charge', charge > 0 ? `$${Math.round(charge).toLocaleString()}` : isDrop(e) ? 'None, drop trailer' : 'None'],
      ['Delay reason', e.delayReason ? reasonById(e.delayReason.id)?.label ?? e.delayReason.id : ''],
      ['Driver', [e.truckerNameIn, e.driverPhone].filter(Boolean).join(', ')],
    ],
  }
}

// The proof of shipment as plain sentences, for Email and Print.
export function proofText(e) {
  const f = facts(e)
  const line = (rows) =>
    rows
      .filter(([, v]) => filled(v))
      .map(([l, v]) => `${l}: ${v}.`)
      .join(' ')
  return [
    `Proof of shipment: order ${e.pickupNumber || 'no order no.'}${e.customerPickupFor ? ` for ${e.customerPickupFor}` : ''}`,
    `Trailer ${e.trailerNumber || '—'}, carrier ${carrierOf(e)}, ${longDay(e.dateIn)}.`,
    '',
    ...steps(e)
      .filter(([, ms]) => ms != null)
      .map(([label, ms, detail]) => `${label}: ${at(e, ms)}${detail ? `. ${detail}` : ''}.`),
    '',
    line(f.load),
    line(f.seals),
    line(f.time),
  ].join('\n')
}

// A titled group of label / value rows (the same as the entry pop-up's).
function Group({ icon, title, rows }) {
  return (
    <section aria-label={title} className="rounded-xl border border-hair bg-field px-4 py-3">
      <h3 className="mb-1.5 flex items-center gap-2 font-display text-[16px] font-bold">
        <Icon name={icon} size={18} className="text-signal" />
        {title}
      </h3>
      <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 break-words">{filled(value) ? value : '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// Prints only the order's history: index.css hides everything else while body has data-print="order-proof".
function printProof() {
  document.body.dataset.print = 'order-proof'
  const done = () => {
    delete document.body.dataset.print
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

// Opens while `entry` is set.
export function OrderHistory({ entry, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    if (entry) {
      if (!dialog.current?.open) dialog.current?.showModal()
    } else if (dialog.current?.open) dialog.current.close()
  }, [entry])
  const e = entry
  const f = e && facts(e)
  return (
    <dialog
      ref={dialog}
      id="order-proof"
      aria-labelledby="order-history-title"
      onClose={onClose}
      onClick={(ev) => ev.target === dialog.current && onClose()}
      className={'w-[95vw] max-w-[820px] ' + ui.dialog}
    >
      {e && (
        <div>
          <div className="flex items-center gap-3 bg-signal-tint px-5 py-4">
            <IconChip name="history" />
            <div className="min-w-0 flex-1">
              <h2 id="order-history-title" className="font-display text-[22px] leading-tight font-bold break-words">
                Order {e.pickupNumber || '(no order no.)'}
                {e.customerPickupFor ? `, ${e.customerPickupFor}` : ''}
              </h2>
              <p className="text-[15px] text-muted">
                Trailer {e.trailerNumber || '—'}, {carrierOf(e)}, {longDay(e.dateIn)}. <b className="text-ink">{orderState(e)}</b>
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={ui.btnGhost + ' no-print self-start'}>
              <Icon name="close" />
            </button>
          </div>

          <div className="order-proof-body grid max-h-[65vh] gap-4 overflow-y-auto p-5">
            <section aria-label="What happened, in order">
              <h3 className="mb-1 font-display text-[16px] font-bold">What happened</h3>
              <ol className="ml-1.5 border-l-2 border-hair">
                {steps(e).map(([label, ms, detail]) => (
                  <li key={label} className="relative grid gap-0.5 py-2 pl-5">
                    <i className={'absolute top-3.5 left-[-6px] size-2.5 rounded-full ring-2 ring-panel ' + (ms != null ? 'bg-signal' : 'bg-line')} aria-hidden="true" />
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <b className={'text-[15px] ' + (ms != null ? '' : 'text-muted')}>{label}</b>
                      <span className={'text-[14px] tabular-nums ' + (ms != null ? 'font-semibold' : 'text-muted')}>{ms != null ? at(e, ms) : detail || 'Not yet'}</span>
                    </span>
                    {ms != null && detail && <span className="text-[14px] text-muted">{detail}</span>}
                  </li>
                ))}
              </ol>
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <Group icon="load" title="What was loaded" rows={f.load} />
              <Group icon="seal" title="Seals and temperature" rows={f.seals} />
              <Group icon="time" title="Time, charges and driver" rows={f.time} />
            </div>
          </div>

          <div className="no-print flex flex-wrap items-center gap-3 border-t border-hair px-5 py-4">
            <p className="mr-auto text-[13px] text-muted">Proof of shipment: print it, save it as a PDF, or email it.</p>
            <button type="button" onClick={printProof} className={ui.btnSmall}>
              <Icon name="print" size={18} />
              Print / save as PDF
            </button>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Proof of shipment, order ${e.pickupNumber || e.trailerNumber || ''}`)}&body=${encodeURIComponent(proofText(e))}`}
              className={ui.btnSmall}
            >
              <Icon name="messages" size={18} />
              Email
            </a>
            <button type="button" onClick={onClose} className={ui.btnSmallPrimary}>
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
