import { useEffect, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'
import { GATES, isRequired } from '../formConfig'
import { arrivalMs, clockTime, departureMs, duration } from '../time'
import { checkOutBlock, expectedSeal, isReleased } from '../handoff'
import { DETENTION_ICON, DETENTION_TAG, detentionState } from '../detention'
import { FIELD_LABELS, checkOutStart, dayLabel, timeLabel, validate } from '../gateForm'
import ErrorSummary from './ErrorSummary'
import { BottomBar, FieldBox, GateStep, GateTopLine, More, Note, Recap, Seg, goButton } from './gate/parts'

// Gate Check Out on one page, kept simple for the guard: (1) the truck leaving — picked from the list,
// with what's already known — (2) the driver going out, (3) the seal and reefer fuel, then a short recap
// and Check Out → "Confirm Check Out?" in the bar at the bottom. Without `initial` only the truck list
// shows; picking a truck calls `onPick`, which opens this page for it. A truck that already left opens
// for editing its departure. `switcher` (Check In / Check Out) sits in the top line.

const FUEL = [
  { value: 'Empty', danger: true },
  { value: '1/4', label: '¼' },
  { value: '1/2', label: '½' },
  { value: '3/4', label: '¾' },
  { value: 'Full' },
]
const FUEL_LABEL = { '1/4': '¼', '1/2': '½', '3/4': '¾' }
const STRIPE = { Delivery: 'bg-delivery', Pickup: 'bg-pickup', 'Drop Trailer': 'bg-drop' }
const PURPOSE_TAG = { Delivery: 'bg-delivery-soft text-delivery', Pickup: 'bg-pickup-soft text-pickup', 'Drop Trailer': 'bg-drop-soft text-drop' }
const filled = (v) => String(v ?? '').trim() !== ''
// Short names for "Still needed".
const SHORT = {
  dateOut: 'Date out',
  timeOut: 'Time out',
  gateOut: 'Gate out',
  truckerNameOut: 'Driver name',
  sealConfirmed: 'Seal check',
  sealNote: 'Seal found',
  outgoingSeals: 'Outgoing seal #',
  fuelOut: 'Reefer fuel',
}

// Short form of why a truck can't leave yet.
const blockedShort = (e) =>
  e.loadingInspection?.result === 'Fail' ? 'Inspection failed · re-check' : !e.loadingInspection ? 'Not inspected yet' : 'Waiting for the inspector to release'

function Pills({ e, now }) {
  const det = detentionState(e, now)
  const blocked = checkOutBlock(e)
  return (
    <span className="flex flex-wrap gap-1.5">
      {blocked ? (
        <span className={ui.tag + ' bg-danger-soft text-danger'}>
          <Icon name="blocked" size={14} />
          {blockedShort(e)}
        </span>
      ) : (
        isReleased(e) && (
          <span className={ui.tag + ' bg-ok-soft text-ok'}>
            <Icon name="done" size={14} />
            Ready to leave
          </span>
        )
      )}
      {det && (
        <span className={ui.tag + ' ' + DETENTION_TAG[det.level]}>
          <Icon name={DETENTION_ICON[det.level]} size={14} />
          {det.text}
        </span>
      )}
    </span>
  )
}

// One truck in the list: one row, tap to open it.
function TruckRow({ e, now, onPick }) {
  const purposes = e.visitPurpose ?? []
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(e)}
        className="grid w-full cursor-pointer grid-cols-[6px_1fr_auto] items-center overflow-hidden rounded-xl border-[1.5px] border-line bg-panel text-left hover:border-signal-bright"
      >
        <span className="flex h-full flex-col">
          {(purposes.length ? purposes : ['']).map((p) => (
            <span key={p} className={'flex-1 ' + (STRIPE[p] ?? 'bg-line')} />
          ))}
        </span>
        <span className="grid min-w-0 gap-1 px-4 py-2.5">
          <b className="font-display text-[19px] leading-tight break-words">
            {e.trailerNumber} · {e.truckName}
          </b>
          <span className="text-[15px] text-muted">
            {[e.dockDoor ? `Dock ${e.dockDoor}` : 'In the yard', e.truckerNameIn, `here ${duration(now - arrivalMs(e))}`].filter(Boolean).join(' · ')}
          </span>
          <Pills e={e} now={now} />
        </span>
        <span aria-hidden="true" className="px-4 font-display text-[22px] text-muted">
          ›
        </span>
      </button>
    </li>
  )
}

// Step 1 without a truck picked: search and the list of trucks on site, ready ones first.
function TruckList({ entries, now, onPick }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = entries
    .filter((e) => !e.timeOut)
    .filter((e) => !q || [e.trailerNumber, e.truckName, e.truckerNameIn, e.pickupNumber, e.dockDoor].join(' ').toLowerCase().includes(q))
  // Released longest-ago first; then trucks that can leave, then those that can't, longest here first.
  const rank = (e) => (isReleased(e) && !checkOutBlock(e) ? 0 : checkOutBlock(e) ? 2 : 1)
  const sorted = [...shown].sort(
    (a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.release.releasedAt - b.release.releasedAt : arrivalMs(a) - arrivalMs(b)),
  )

  const submit = (ev) => {
    ev.preventDefault()
    if (sorted.length === 1) onPick(sorted[0])
  }

  return (
    <>
      <form role="search" onSubmit={submit}>
        <label htmlFor="checkout-search" className="sr-only">
          Find a truck on site
        </label>
        <input
          id="checkout-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Trailer #, carrier or driver"
          autoComplete="off"
          className={ui.input}
        />
      </form>
      {sorted.length === 0 ? (
        <p className="text-[16px] text-muted">{q ? 'No trucks on site match that search.' : 'No trucks on site. Checked-in trucks appear here.'}</p>
      ) : (
        <ul className="grid gap-2">
          {sorted.map((e) => (
            <TruckRow key={e.id} e={e} now={now} onPick={onPick} />
          ))}
        </ul>
      )}
    </>
  )
}

export default function CheckOutPage({ entries, initial, guard, switcher, onPick, onSave, onCancel }) {
  const [now, setNow] = useState(Date.now)
  // Keeps "here 2h 10m" and detention current while the page is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  if (!initial) {
    const onSite = entries.filter((e) => !e.timeOut)
    const ready = onSite.filter((e) => isReleased(e) && !checkOutBlock(e)).length
    return (
      <div className="grid gap-4">
        <GateTopLine
          switcher={switcher}
          where={
            <>
              <span className={ui.tag + ' bg-gate-out text-signal-ink'}>Gate 2 · Out</span>
              <span>
                <b className="text-ink">{onSite.length}</b> on site · <b className="text-ok">{ready}</b> ready to leave
              </span>
            </>
          }
        />
        <GateStep n={1} id="out-find" title="Truck leaving">
          <TruckList entries={entries} now={now} onPick={onPick} />
        </GateStep>
      </div>
    )
  }
  return <CheckOutForm entry={initial} guard={guard} switcher={switcher} now={now} onSave={onSave} onCancel={onCancel} />
}

function CheckOutForm({ entry, guard, switcher, now, onSave, onCancel }) {
  // Re-opening a truck that already left edits its departure rather than checking it out again.
  const editing = Boolean(entry.timeOut)
  // A truck that was at a dock can only leave once its inspection passed and the inspector released it.
  const blocked = editing ? '' : checkOutBlock(entry)
  // The seal the guard should find (from the release or the inspection); asked on a new check-out only.
  const sealToCheck = editing ? '' : expectedSeal(entry)
  const baseline = useRef(null)
  // When the guard opened this check-out, to time it (not shown to the guard; the Overview reports it).
  const openedAt = useRef(Date.now())
  const [form, setForm] = useState(() => (baseline.current = checkOutStart(entry)))
  const [errors, setErrors] = useState({})
  const [editTime, setEditTime] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const hasDriverIn = filled(entry.truckerNameIn)
  const [driver, setDriver] = useState(() =>
    hasDriverIn && String(form.truckerNameOut ?? '').trim() === entry.truckerNameIn.trim() ? 'same' : 'diff',
  )
  const summaryRef = useRef(null)

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([k]) => !(k in patch))))
    setConfirming(false)
  }
  const text = (name) => ({ id: `field-${name}`, name, value: form[name] ?? '', onChange: (e) => set({ [name]: e.target.value }) })
  const err = (name) => errors[name]
  const inputCls = (name, extra = '') => ui.input + (err(name) ? ui.inputError : '') + ' ' + extra
  const required = (name) => isRequired(name, form, 'out')
  const reefer = entry.reefer === 'Yes'
  const pickup = (entry.visitPurpose ?? []).includes('Pickup')

  const chooseDriver = (v) => {
    setDriver(v)
    set(
      v === 'same'
        ? { truckerNameOut: entry.truckerNameIn, driverPhoneOut: entry.driverPhone ?? '' }
        : { truckerNameOut: '', driverPhoneOut: '' },
    )
  }

  // Required answers by section, for the progress strip.
  const vehicle = ['dateOut', 'timeOut', 'gateOut', 'truckerNameOut'].filter(required)
  const sealReefer = [
    ...(sealToCheck ? ['sealConfirmed'] : []),
    ...(form.sealConfirmed === 'No' ? ['sealNote'] : []),
    ...['outgoingSeals', 'fuelOut'].filter(required),
  ]
  const left = [vehicle, sealReefer].map((names) => names.filter((n) => !filled(form[n])))
  const total = vehicle.length + sealReefer.length
  const missing = left.flat()
  // Vehicle details start filled in (time out, Gate 2, same driver); the seal section counts as started
  // once the guard answers something there (the outgoing seal can come pre-filled from the release).
  const sealStarted = ['sealConfirmed', 'sealNote', 'fuelOut', 'greenSeal', 'lockLoads', 'padLocks'].some((n) => filled(form[n]))

  const submit = (ev) => {
    ev.preventDefault()
    if (blocked) return
    const data = { ...form, guardOut: editing ? form.guardOut || guard : guard }
    const errs = validate(data, 'out')
    // The guard's name comes from the header, so its error points there.
    if (errs.guardOut) {
      errs.guardOnDuty = errs.guardOut
      delete errs.guardOut
    }
    if (sealToCheck && !form.sealConfirmed) errs.sealConfirmed = 'Required'
    if (sealToCheck && form.sealConfirmed === 'No' && !filled(form.sealNote)) errs.sealNote = 'Describe the seal found on the trailer'
    setErrors(errs)
    if (Object.keys(errs).length) {
      if (errs.dateOut || errs.timeOut || errs.gateOut) setEditTime(true)
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        summaryRef.current?.focus({ preventScroll: true })
      })
      return
    }
    // A new check-out asks once more against accidental taps; editing a departure saves straight away.
    if (editing) onSave(data)
    else setConfirming(true)
  }
  const save = () => onSave({ ...form, guardOut: guard, checkOutStartedAt: openedAt.current, checkedOutAt: Date.now() })

  const handleRevert = () => {
    if (JSON.stringify(form) !== JSON.stringify(baseline.current) && !window.confirm('Undo your changes to this check-out?')) return
    setForm(checkOutStart(entry))
    setErrors({})
  }

  const fuelIn = FUEL_LABEL[entry.fuelIn] ?? entry.fuelIn

  const progress = { filled: total - missing.length, total, blocked: Boolean(blocked) }
  const stepOf = (n) => (['dateOut', 'timeOut', 'gateOut', 'truckerNameOut'].includes(n) ? 'out-driver' : 'out-seal')
  const stillNeeded = missing.map((n) => [SHORT[n] ?? FIELD_LABELS[n] ?? n, stepOf(n)])
  const by = editing ? form.guardOut || guard : guard
  const det = editing ? null : detentionState(entry, now)
  const facts = [
    (entry.visitPurpose ?? []).join(' + '),
    entry.dockDoor ? `Dock ${entry.dockDoor}` : 'In the yard',
    `${editing ? 'stayed' : 'here'} ${duration((editing ? departureMs(entry) : now) - arrivalMs(entry))}`,
    entry.pickupNumber && `order ${entry.pickupNumber}`,
    entry.release?.releasedAt && `released ${clockTime(entry.release.releasedAt)} by ${entry.release.releasedBy}`,
  ].filter(Boolean)

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <GateTopLine
        switcher={switcher}
        where={
          <>
            <span className={ui.tag + ' bg-gate-out text-signal-ink'}>{form.gateOut || 'Gate 2'} · Out</span>
            <span>
              {editing ? 'Left' : 'Leaving'} <b className="text-ink">{timeLabel(form.timeOut) || '—'}</b> · {dayLabel(form.dateOut) || '—'}
            </span>
            <button type="button" onClick={() => setEditTime((v) => !v)} aria-expanded={editTime} className="min-h-9 cursor-pointer px-1 font-semibold text-signal underline">
              {editTime ? 'Done' : 'Edit'}
            </button>
          </>
        }
        progress={progress}
      />

      {editTime && (
        <div className="grid gap-4 rounded-2xl border border-hair bg-panel px-5 py-4 shadow-card sm:grid-cols-[1fr_1fr_1.4fr]">
          <FieldBox name="dateOut" label="Date out" required error={err('dateOut')}>
            <input type="date" {...text('dateOut')} className={inputCls('dateOut')} />
          </FieldBox>
          <FieldBox name="timeOut" label="Time out" required error={err('timeOut')}>
            <input type="time" {...text('timeOut')} className={inputCls('timeOut')} />
          </FieldBox>
          <FieldBox name="gateOut" label="Gate out" required group error={err('gateOut')}>
            <Seg
              name="gateOut"
              value={form.gateOut}
              onChange={(gateOut) => set({ gateOut })}
              error={err('gateOut')}
              options={GATES.map((g) => ({ value: g, disabled: g === 'Gate 1' }))}
            />
          </FieldBox>
        </div>
      )}

      <ErrorSummary errors={errors} action={editing ? 'saving' : 'check-out'} summaryRef={summaryRef} labels={FIELD_LABELS} />

      {/* 1 · Truck leaving: what's already known, with a way back to the list */}
      <GateStep n={1} id="out-find" title="Truck leaving" ok={!blocked} started>
        <div className="grid gap-1">
          <b className="font-display text-[24px] leading-tight break-words">
            {entry.trailerNumber} · {entry.truckName}
          </b>
          <span className="text-[16px] text-muted">{facts.join(' · ')}</span>
          {det && (
            <span className="mt-1">
              <span className={ui.tag + ' ' + DETENTION_TAG[det.level]}>
                <Icon name={DETENTION_ICON[det.level]} size={14} />
                {det.text}
              </span>
            </span>
          )}
        </div>
        {entry.release?.note && (
          <Note tone="warn" icon="info">
            Gate note from the inspector: {entry.release.note}
          </Note>
        )}
        {blocked && <Note icon="blocked">Can't leave yet: {blocked} Ask the driver to wait and tell Shipping.</Note>}
        <button type="button" onClick={onCancel} className="min-h-10 w-fit cursor-pointer font-semibold text-signal underline">
          {editing ? 'Back' : 'Pick a different truck'}
        </button>
      </GateStep>

      <fieldset disabled={Boolean(blocked)} className="m-0 grid min-w-0 gap-4 border-0 p-0 disabled:opacity-50">
        {/* 2 · Driver */}
        <GateStep n={2} id="out-driver" title="Driver" ok={!blocked && left[0].length === 0} started>
          {hasDriverIn && (
            <FieldBox name="driverChoice" label="Who is driving out?" group>
              <Seg
                name="driverChoice"
                value={driver}
                onChange={chooseDriver}
                options={[
                  { value: 'same', label: `Same driver · ${entry.truckerNameIn}` },
                  { value: 'diff', label: 'Different driver' },
                ]}
              />
            </FieldBox>
          )}
          {driver === 'diff' && (
            <>
              <FieldBox name="truckerNameOut" label="Driver name going out" required={required('truckerNameOut')} error={err('truckerNameOut')}>
                <input {...text('truckerNameOut')} className={inputCls('truckerNameOut')} />
              </FieldBox>
              <More label="driver phone" open={filled(form.driverPhoneOut)}>
                <FieldBox name="driverPhoneOut" label="Driver phone">
                  <input {...text('driverPhoneOut')} type="tel" inputMode="tel" className={inputCls('driverPhoneOut')} />
                </FieldBox>
              </More>
            </>
          )}
        </GateStep>

        {/* 3 · Seal (and reefer) */}
        <GateStep n={3} id="out-seal" title={reefer ? 'Seal and reefer' : 'Seal'} ok={!blocked && left[1].length === 0} started={sealStarted}>
          {sealToCheck && (
            <FieldBox
              name="sealConfirmed"
              label={
                <>
                  Seal matches <b className="text-[18px] text-ink">{sealToCheck}</b>?
                </>
              }
              required
              group
              error={err('sealConfirmed')}
            >
              <Seg
                name="sealConfirmed"
                value={form.sealConfirmed}
                onChange={(sealConfirmed) => set({ sealConfirmed })}
                error={err('sealConfirmed')}
                options={[{ value: 'Yes' }, { value: 'No', danger: true }]}
              />
            </FieldBox>
          )}
          {form.sealConfirmed === 'No' && (
            <>
              <FieldBox name="sealNote" label="Seal found on the trailer" required error={err('sealNote')}>
                <input {...text('sealNote')} placeholder="Number on the seal, or what's wrong" className={inputCls('sealNote')} />
              </FieldBox>
              <Note>Seal doesn't match: tell Shipping before the truck leaves</Note>
            </>
          )}
          {pickup && (
            <FieldBox
              name="outgoingSeals"
              label="Outgoing seal #"
              required={required('outgoingSeals')}
              error={err('outgoingSeals')}
              hint={entry.release?.seal && form.outgoingSeals === entry.release.seal ? "From the release" : undefined}
            >
              <input {...text('outgoingSeals')} inputMode="numeric" autoComplete="off" className={inputCls('outgoingSeals', 'min-h-[64px] font-display text-[26px] tracking-wide')} />
            </FieldBox>
          )}
          {reefer && (
            <FieldBox
              name="fuelOut"
              label="Reefer fuel going out"
              required
              group
              error={err('fuelOut')}
              after={fuelIn && <span className="text-[15px] text-muted">came in at {fuelIn}</span>}
            >
              <Seg name="fuelOut" value={form.fuelOut} onChange={(fuelOut) => set({ fuelOut })} error={err('fuelOut')} options={FUEL} />
            </FieldBox>
          )}
          {!sealToCheck && !pickup && !reefer && <p className="text-[16px] text-muted">No seal was recorded and it's not a reefer: nothing to check here.</p>}
          <More
            label={pickup ? 'green seal, lock loads, pad locks' : 'outgoing seal, green seal, lock loads, pad locks'}
            open={filled(form.greenSeal) || filled(form.lockLoads) || filled(form.padLocks) || (!pickup && filled(form.outgoingSeals))}
          >
            {!pickup && (
              <FieldBox name="outgoingSeals" label="Outgoing seal #">
                <input {...text('outgoingSeals')} inputMode="numeric" className={inputCls('outgoingSeals')} />
              </FieldBox>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <FieldBox name="greenSeal" label="Green seal #">
                <input {...text('greenSeal')} inputMode="numeric" className={inputCls('greenSeal')} />
              </FieldBox>
              <FieldBox name="lockLoads" label="Lock loads">
                <input {...text('lockLoads')} className={inputCls('lockLoads')} />
              </FieldBox>
              <FieldBox name="padLocks" label="Pad locks">
                <input {...text('padLocks')} className={inputCls('padLocks')} />
              </FieldBox>
            </div>
          </More>
        </GateStep>
      </fieldset>

      <Recap
        lines={[
          [
            <b key="t">{entry.trailerNumber}</b>,
            entry.truckName,
            form.truckerNameOut && `driver ${form.truckerNameOut}${driver === 'same' ? ' (same)' : ''}`,
            `leaving ${timeLabel(form.timeOut)} · ${form.gateOut}`,
          ],
          [
            sealToCheck &&
              (form.sealConfirmed === 'Yes' ? (
                `Seal matches ${sealToCheck}`
              ) : form.sealConfirmed === 'No' ? (
                <b key="s" className="text-danger">
                  Seal does NOT match
                </b>
              ) : (
                'Seal not checked yet'
              )),
            form.outgoingSeals && `out seal ${form.outgoingSeals}`,
            reefer && `fuel ${FUEL_LABEL[form.fuelOut] ?? (form.fuelOut || '?')}${fuelIn ? ` (in ${fuelIn})` : ''}`,
          ],
        ]}
      />
      <p className="no-print flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[15px] text-muted">
        <span className="flex items-center gap-1.5">
          <Icon name="people" size={16} />
          Checked out by <b className={by ? 'text-ink' : 'text-danger'}>{by || 'no guard set (top of the page)'}</b>
        </span>
        {editing && (
          <button type="button" onClick={handleRevert} className="min-h-10 cursor-pointer font-semibold text-signal underline">
            Revert
          </button>
        )}
        <button type="button" onClick={() => window.print()} className="min-h-10 cursor-pointer font-semibold text-signal underline">
          Print
        </button>
      </p>

      {confirming ? (
        <BottomBar
          tint
          message={
            <span role="alertdialog" aria-labelledby="confirm-checkout-title" className="block text-ink">
              <b id="confirm-checkout-title" className="block font-display text-[19px] leading-tight">
                Confirm Check Out?
              </b>
              Trailer {entry.trailerNumber} · {entry.truckName} leaving through {form.gateOut} at {timeLabel(form.timeOut)}.
            </span>
          }
        >
          <button type="button" onClick={() => setConfirming(false)} className={ui.btn}>
            Go back
          </button>
          <button type="button" onClick={save} autoFocus className={goButton(true)}>
            <Icon name="checkOut" size={24} />
            Yes, check out
          </button>
        </BottomBar>
      ) : (
        <BottomBar missing={blocked ? [] : stillNeeded} message={blocked ? <b className="text-danger">Can't leave yet: {blockedShort(entry)}</b> : undefined}>
          <button type="submit" disabled={Boolean(blocked)} className={goButton(!blocked && !missing.length)}>
            <Icon name={editing ? 'done' : 'checkOut'} size={24} />
            {editing ? 'Save Changes' : `Check Out · ${entry.trailerNumber}`}
          </button>
        </BottomBar>
      )}
    </form>
  )
}
