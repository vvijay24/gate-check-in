import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'
import { GATES, VISIT_PURPOSES, isRequired } from '../formConfig'
import { EARLY_GRACE_MIN, LATE_GRACE_MIN, minutesLate } from '../time'
import { FIELD_LABELS, cleanForSave, dayLabel, freshCheckIn, timeLabel, validate } from '../gateForm'
import { visitMemory } from '../visitMemory'
import ErrorSummary from './ErrorSummary'
import OdometerPhoto from './OdometerPhoto'
import { Badge, BottomBar, Chips, FieldBox, GateStep, GateTopLine, LinkButton, More, Note, PRESS, Recap, Seg, Stepper, goButton } from './gate/parts'

// Gate Check In on one page, kept simple for the guard: (1) purpose and appointment at the window,
// (2) vehicle details from the driver, (3) the trailer — seal, reefer, and optional extras — then a short
// recap and Check In in the bar at the bottom. Used for new check-ins and for editing one. The guard on
// duty comes from the page header; `switcher` (Check In / Check Out) sits in the top line.

const PURPOSE = {
  Delivery: { icon: 'load', on: 'border-delivery bg-delivery-soft text-delivery' },
  Pickup: { icon: 'truck', on: 'border-pickup bg-pickup-soft text-pickup' },
  'Drop Trailer': { icon: 'drop', on: 'border-drop bg-drop-soft text-drop' },
}
const FUEL = [
  { value: 'Empty', danger: true },
  { value: '1/4', label: '¼' },
  { value: '1/2', label: '½' },
  { value: '3/4', label: '¾' },
  { value: 'Full' },
]
const FUEL_LABEL = { '1/4': '¼', '1/2': '½', '3/4': '¾' }
// Required answers by step, for the progress bar and "Still needed" (only those that apply count).
const SECTION_FIELDS = [
  ['dateIn', 'timeIn', 'gateIn', 'visitPurpose', 'appointmentTime'],
  ['trailerNumber', 'truckName', 'truckerNameIn', 'pickupNumber', 'customerPickupFor'],
  ['incomingSeals', 'sealIntact', 'reefer', 'tempSet', 'tempActual', 'fuelIn'],
]
const STEP_IDS = ['in-purpose', 'in-vehicle', 'in-trailer']
// Short names for "Still needed".
const SHORT = {
  dateIn: 'Date in',
  timeIn: 'Time in',
  gateIn: 'Gate in',
  visitPurpose: 'Purpose',
  appointmentTime: 'Appointment time',
  trailerNumber: 'Trailer #',
  truckName: 'Carrier',
  truckerNameIn: 'Driver name',
  pickupNumber: 'Order No',
  customerPickupFor: 'Customer',
  incomingSeals: 'Seal #',
  sealIntact: 'Seal intact',
  reefer: 'Reefer',
  tempSet: 'Set point',
  tempActual: 'Actual temp',
  fuelIn: 'Reefer fuel',
}
const filled = (v) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '')
const trailerKey = (s) => String(s ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()

// Appointment buttons: quarter hours around the arrival time.
function apptChoices(timeIn) {
  const [h, m] = (timeIn || '00:00').split(':').map(Number)
  const base = Math.floor((h * 60 + m) / 15) * 15
  return [-15, 0, 15, 30]
    .map((d) => base + d)
    .filter((t) => t >= 0 && t < 24 * 60)
    .map((t) => {
      const value = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
      return { value, label: timeLabel(value) }
    })
}

function ApptBadge({ form }) {
  const late = minutesLate(form)
  if (late == null) return null
  if (late > LATE_GRACE_MIN) return <Badge tone="danger">{late} min late</Badge>
  if (late < -EARLY_GRACE_MIN) return <Badge tone="warn">{-late} min early</Badge>
  return <Badge tone="ok">On time</Badge>
}

export default function CheckInForm({ initial, entries, guard, switcher, onSave, onCancel }) {
  const isEdit = Boolean(initial?.id)
  const start = () => initial ?? freshCheckIn()
  // The form as it was last started, saved or cleared; Clear only asks first when something differs.
  const baseline = useRef(null)
  // When the guard started this check-in (their first answer), to time the Gate's check-in. Not shown
  // to the guard; the Overview reports it. A form left open between trucks doesn't count.
  const openedAt = useRef(null)
  const [form, setForm] = useState(() => (baseline.current = start()))
  const [errors, setErrors] = useState({})
  const [editArrival, setEditArrival] = useState(false)
  // Shown after a new check-in is saved, e.g. "Trailer T123 · Acme". Cleared when the next entry starts.
  const [checkedIn, setCheckedIn] = useState(null)
  // The returning-trailer card: dismissed or used for this trailer #.
  const [match, setMatch] = useState({ dismissed: '', used: '' })
  const [nameFromPhone, setNameFromPhone] = useState(false)
  const summaryRef = useRef(null)
  const topRef = useRef(null)
  const memory = useMemo(() => visitMemory(entries, initial?.id), [entries, initial?.id])

  useEffect(() => {
    if (!checkedIn) return
    const t = setTimeout(() => setCheckedIn(null), 8000)
    return () => clearTimeout(t)
  }, [checkedIn])

  // Changing answers clears their errors and the "Check In Confirmed" banner.
  const set = (patch) => {
    openedAt.current ??= Date.now()
    setForm((f) => ({ ...f, ...patch }))
    setErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([k]) => !(k in patch))))
    setCheckedIn(null)
  }
  const text = (name) => ({ id: `field-${name}`, name, value: form[name] ?? '', onChange: (e) => set({ [name]: e.target.value }) })
  const required = (name) => isRequired(name, form, 'in')
  const purposes = form.visitPurpose ?? []
  const hasPickup = purposes.includes('Pickup')
  const dropOnly = purposes.length > 0 && purposes.every((p) => p === 'Drop Trailer')
  const reefer = form.reefer === 'Yes'

  // Progress: required answers that apply, by section.
  const bySection = SECTION_FIELDS.map((names) => names.filter(required))
  const left = bySection.map((names) => names.filter((n) => !filled(form[n])))
  const total = bySection.flat().length
  const missing = left.flat()
  const sectionOk = left.map((l) => l.length === 0)
  // A section counts as started once the guard has answered something in it. The arrival date, time
  // and gate are filled in automatically, so they don't make Purpose look started.
  const sectionStarted = [
    ['visitPurpose', 'appointmentTime'],
    ['trailerNumber', 'truckName', 'truckerNameIn', 'driverPhone', 'pickupNumber', 'customerPickupFor'],
    ['incomingSeals', 'sealIntact', 'reefer', 'tempSet', 'tempActual', 'fuelIn', 'odometerPhoto', 'emptyPallets', 'shipmentContents'],
  ].map((names) => names.some((n) => filled(form[n])))

  const lastVisit = memory.lastVisit(form.trailerNumber)
  const key = trailerKey(form.trailerNumber)
  const sameAsLast =
    lastVisit &&
    [['truckName', 'truckName'], ['truckerNameIn', 'truckerNameIn'], ['driverPhone', 'driverPhone']].every(
      ([a, b]) => String(form[a] ?? '').trim().toLowerCase() === String(lastVisit[b] ?? '').trim().toLowerCase(),
    )
  const useLast = () => {
    set({ truckName: lastVisit.truckName ?? '', truckerNameIn: lastVisit.truckerNameIn ?? '', driverPhone: lastVisit.driverPhone ?? '' })
    setMatch({ dismissed: '', used: key })
  }
  const setPhone = (driverPhone) => {
    const known = !form.truckerNameIn.trim() && memory.nameForPhone(driverPhone)
    set(known ? { driverPhone, truckerNameIn: known } : { driverPhone })
    if (known) setNameFromPhone(true)
  }
  const togglePurpose = (p) =>
    set({ visitPurpose: purposes.includes(p) ? purposes.filter((x) => x !== p) : VISIT_PURPOSES.filter((x) => x === p || purposes.includes(x)) })

  const tempGap = reefer && filled(form.tempSet) && filled(form.tempActual) ? Math.abs(parseFloat(form.tempActual) - parseFloat(form.tempSet)) : 0

  const submit = (ev) => {
    ev.preventDefault()
    // A new check-in is logged by the guard on duty now; an edit keeps who logged it.
    const data = { ...form, guardOnDuty: isEdit ? form.guardOnDuty || guard : guard }
    const errs = validate(data, 'in')
    setErrors(errs)
    if (Object.keys(errs).length) {
      if (errs.dateIn || errs.timeIn || errs.gateIn) setEditArrival(true)
      // Show the list of what's missing; its links jump to each field. Wait a frame so it has rendered.
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        summaryRef.current?.focus({ preventScroll: true })
      })
      return
    }
    onSave(cleanForSave(isEdit ? data : { ...data, checkInStartedAt: openedAt.current ?? Date.now() }))
    if (!isEdit) {
      openedAt.current = null
      setForm((baseline.current = freshCheckIn()))
      setCheckedIn(`Trailer ${data.trailerNumber} · ${data.truckName}`)
      setMatch({ dismissed: '', used: '' })
      setNameFromPhone(false)
      setEditArrival(false)
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Clear (new entry) or Revert (editing) asks first when anything has been typed.
  const handleClear = () => {
    const typed = JSON.stringify(form) !== JSON.stringify(baseline.current)
    if (typed && !window.confirm(isEdit ? 'Undo your changes to this entry?' : 'Clear everything typed on this form?')) return
    setForm((baseline.current = start()))
    setErrors({})
    setMatch({ dismissed: '', used: '' })
    setNameFromPhone(false)
  }

  const err = (name) => errors[name]
  const inputCls = (name, extra = '') => ui.input + (err(name) ? ui.inputError : '') + ' ' + extra
  const bigInput = 'min-h-[64px] font-display text-[26px] tracking-wide'

  const progress = { filled: total - missing.length, total }
  // "Still needed": each name jumps to its step.
  const stillNeeded = left.flatMap((names, i) => names.map((n) => [SHORT[n] ?? FIELD_LABELS[n] ?? n, STEP_IDS[i]]))
  const loggedBy = isEdit ? form.guardOnDuty || guard : guard
  const enterNext = (next) => (e) => {
    // The keyboard's Next / Enter moves to the following field instead of submitting the form.
    if (e.key !== 'Enter') return
    e.preventDefault()
    document.getElementById(`field-${next}`)?.focus()
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div ref={topRef} className="scroll-mt-[calc(var(--header-h,114px)+16px)]" />
      <GateTopLine
        switcher={switcher}
        where={
          <>
            <span className={ui.tag + ' bg-gate-in text-signal-ink'}>{form.gateIn || 'Gate 1'} · In</span>
            {isEdit ? <b className="text-ink">Editing trailer {initial.trailerNumber}</b> : null}
            <span>
              Arrived <b className="text-ink">{timeLabel(form.timeIn) || '—'}</b> · {dayLabel(form.dateIn) || '—'}
            </span>
            <LinkButton icon={editArrival ? 'check' : 'edit'} onClick={() => setEditArrival((v) => !v)} aria-expanded={editArrival}>
              {editArrival ? 'Done' : 'Edit'}
            </LinkButton>
          </>
        }
        progress={progress}
      />

      {editArrival && (
        <div className={ui.card + ' grid animate-fade gap-4 px-5 py-4 sm:grid-cols-[1fr_1fr_1.4fr]'}>
          <FieldBox name="dateIn" label="Date in" required error={err('dateIn')}>
            <input type="date" {...text('dateIn')} className={inputCls('dateIn')} />
          </FieldBox>
          <FieldBox name="timeIn" label="Time in" required error={err('timeIn')}>
            <input type="time" {...text('timeIn')} className={inputCls('timeIn')} />
          </FieldBox>
          <FieldBox name="gateIn" label="Gate in" required group error={err('gateIn')}>
            <Seg
              name="gateIn"
              value={form.gateIn}
              onChange={(gateIn) => set({ gateIn })}
              error={err('gateIn')}
              options={GATES.map((g) => ({ value: g, disabled: g === 'Gate 2' }))}
            />
          </FieldBox>
        </div>
      )}

      {checkedIn && (
        <div role="status" className="animate-pop rounded-2xl border border-ok/25 bg-ok-soft px-5 py-4 shadow-raised">
          <p className="flex items-center gap-2 font-display text-[20px] leading-tight font-bold text-ok">
            <Icon name="done" size={26} />
            Checked in
          </p>
          <p className="text-[16px]">{checkedIn} is checked in. The form is ready for the next truck.</p>
        </div>
      )}
      <ErrorSummary errors={errors} action={isEdit ? 'saving' : 'check-in'} summaryRef={summaryRef} labels={FIELD_LABELS} />

      {/* 1 · Purpose */}
      <GateStep n={1} of={3} id="in-purpose" icon="purpose" title="Purpose" hint="What it's here for and when it was booked" ok={sectionOk[0]} started={sectionStarted[0]}>
        <FieldBox name="visitPurpose" label="What's it here for?" required group error={err('visitPurpose')}>
          <div role="group" aria-labelledby="field-visitPurpose-label" className="grid grid-cols-3 gap-2.5">
            {VISIT_PURPOSES.map((p, i) => {
              const on = purposes.includes(p)
              return (
                <button
                  key={p}
                  id={i === 0 ? 'field-visitPurpose' : undefined}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePurpose(p)}
                  className={
                    PRESS +
                    'flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-xl px-2 font-display text-[17px] leading-tight font-bold sm:flex-row sm:gap-2.5 ' +
                    (on ? PURPOSE[p].on + ' shadow-raised' : (err('visitPurpose') ? 'border-danger' : 'border-line') + ' bg-field text-ink hover:border-signal-bright hover:bg-panel')
                  }
                >
                  <Icon name={PURPOSE[p].icon} size={26} />
                  {p === 'Drop Trailer' ? 'Drop' : p}
                </button>
              )
            })}
          </div>
        </FieldBox>
        <FieldBox name="appointmentTime" label="Appointment time" required error={err('appointmentTime')} after={<ApptBadge form={form} />}>
          <Chips label="Appointment times" items={apptChoices(form.timeIn)} value={form.appointmentTime} onPick={(appointmentTime) => set({ appointmentTime })} />
          <input type="time" {...text('appointmentTime')} aria-label="Other appointment time" className={inputCls('appointmentTime', 'max-w-[220px]')} />
        </FieldBox>
      </GateStep>

      {/* 2 · Vehicle details */}
      <GateStep n={2} of={3} id="in-vehicle" icon="truck" title="Vehicle details" hint="Trailer, carrier and driver" ok={sectionOk[1]} started={sectionStarted[1]}>
        <FieldBox name="trailerNumber" label="Trailer #" required error={err('trailerNumber')}>
          <input {...text('trailerNumber')} autoComplete="off" enterKeyHint="next" onKeyDown={enterNext('truckName')} className={inputCls('trailerNumber', bigInput)} />
        </FieldBox>
        {lastVisit && match.used === key ? (
          <Note tone="ok" icon="done">
            Filled from the last visit. Check it's the same driver.
          </Note>
        ) : (
          lastVisit &&
          !sameAsLast &&
          match.dismissed !== key && (
            <div className="flex animate-pop flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-signal-bright bg-signal-tint px-4 py-3">
              <Icon name="history" size={24} className="text-signal" />
              <div className="min-w-0 flex-1">
                <b className="block font-display text-[16px]">Seen before · {dayLabel(lastVisit.dateIn)}</b>
                <span className="text-[15px] text-muted">{[lastVisit.truckName, lastVisit.truckerNameIn].filter(Boolean).join(' · ')}</span>
              </div>
              <button type="button" onClick={() => setMatch({ dismissed: key, used: '' })} className={ui.btnGhost}>
                Not this one
              </button>
              <button type="button" onClick={useLast} className={ui.btnSmallPrimary}>
                Use these details
              </button>
            </div>
          )
        )}
        <FieldBox name="truckName" label="Carrier" required error={err('truckName')}>
          <Chips label="Recent carriers" items={memory.carriers} value={form.truckName} onPick={(truckName) => set({ truckName })} />
          <input {...text('truckName')} placeholder="Or type it" enterKeyHint="next" onKeyDown={enterNext('truckerNameIn')} className={inputCls('truckName')} />
        </FieldBox>
        <FieldBox
          name="truckerNameIn"
          label="Driver name"
          required
          error={err('truckerNameIn')}
          hint={nameFromPhone && form.truckerNameIn ? 'Filled in from a past visit with this phone number' : undefined}
        >
          <input
            {...text('truckerNameIn')}
            enterKeyHint="next"
            onKeyDown={enterNext(hasPickup ? 'pickupNumber' : 'incomingSeals')}
            onChange={(e) => {
              set({ truckerNameIn: e.target.value })
              setNameFromPhone(false)
            }}
            className={inputCls('truckerNameIn')}
          />
        </FieldBox>
        {hasPickup && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox name="pickupNumber" label="Order No" required error={err('pickupNumber')}>
              <input {...text('pickupNumber')} enterKeyHint="next" onKeyDown={enterNext('customerPickupFor')} className={inputCls('pickupNumber')} />
            </FieldBox>
            <FieldBox name="customerPickupFor" label="Customer" required error={err('customerPickupFor')}>
              <Chips label="Recent customers" items={memory.customers} value={form.customerPickupFor} onPick={(customerPickupFor) => set({ customerPickupFor })} />
              <input {...text('customerPickupFor')} placeholder="Or type it" enterKeyHint="next" onKeyDown={enterNext('incomingSeals')} className={inputCls('customerPickupFor')} />
            </FieldBox>
          </div>
        )}
        <More label="driver phone" open={filled(form.driverPhone)}>
          <FieldBox name="driverPhone" label="Driver phone" hint="A number seen before fills in the driver's name.">
            <input id="field-driverPhone" type="tel" inputMode="tel" value={form.driverPhone ?? ''} onChange={(e) => setPhone(e.target.value)} className={inputCls('driverPhone')} />
          </FieldBox>
        </More>
      </GateStep>

      {/* 3 · Trailer */}
      <GateStep n={3} of={3} id="in-trailer" icon={reefer ? 'reefer' : 'seal'} title="Trailer" hint={reefer ? 'Seal, reefer temperature and fuel' : 'Seal and what kind of trailer'} ok={sectionOk[2]} started={sectionStarted[2]}>
        <FieldBox name="incomingSeals" label="Seal #" required error={err('incomingSeals')}>
          <input {...text('incomingSeals')} inputMode="numeric" autoComplete="off" enterKeyHint="done" className={inputCls('incomingSeals', bigInput)} />
        </FieldBox>
        <FieldBox name="sealIntact" label="Seal intact?" required group error={err('sealIntact')}>
          <Seg name="sealIntact" value={form.sealIntact} onChange={(sealIntact) => set({ sealIntact })} error={err('sealIntact')} options={[{ value: 'Yes' }, { value: 'No', danger: true }]} />
        </FieldBox>
        {form.sealIntact === 'No' && <Note>Broken or missing seal: tell Shipping</Note>}
        <FieldBox name="reefer" label="Reefer?" required group error={err('reefer')}>
          <Seg name="reefer" value={form.reefer} onChange={(v) => set({ reefer: v })} error={err('reefer')} options={[{ value: 'Yes' }, { value: 'No', label: 'No, dry van' }]} />
        </FieldBox>
        {reefer && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBox name="tempSet" label="Set point °F" required error={err('tempSet')}>
                <Stepper name="tempSet" label="set point °F" value={form.tempSet} onChange={(tempSet) => set({ tempSet })} error={err('tempSet')} />
              </FieldBox>
              <FieldBox name="tempActual" label="Actual °F" required error={err('tempActual')}>
                <Stepper name="tempActual" label="actual temp °F" value={form.tempActual} onChange={(tempActual) => set({ tempActual })} error={err('tempActual')} />
              </FieldBox>
            </div>
            {tempGap > 3 && <Note>{tempGap.toFixed(1)}° off the set point: tell Shipping</Note>}
            <FieldBox name="fuelIn" label="Reefer fuel" required group error={err('fuelIn')}>
              <Seg name="fuelIn" value={form.fuelIn} onChange={(fuelIn) => set({ fuelIn })} error={err('fuelIn')} options={FUEL} />
            </FieldBox>
          </>
        )}
        <More
          label={dropOnly ? 'odometer photo, note' : 'odometer photo, empty pallets, note'}
          open={filled(form.odometerPhoto) || filled(form.shipmentContents) || (filled(form.emptyPallets) && form.emptyPallets !== '0')}
        >
          <OdometerPhoto value={form.odometerPhoto} onChange={(odometerPhoto) => set({ odometerPhoto })} required={required('odometerPhoto')} error={err('odometerPhoto')} />
          {!dropOnly && (
            <FieldBox name="emptyPallets" label="Empty pallets" className="max-w-[320px]">
              <Stepper name="emptyPallets" label="empty pallets" value={form.emptyPallets} min={0} inputMode="numeric" onChange={(emptyPallets) => set({ emptyPallets })} />
            </FieldBox>
          )}
          <FieldBox name="shipmentContents" label="Note">
            <textarea {...text('shipmentContents')} rows={2} placeholder="What's on the trailer, damage, anything unusual" className={inputCls('shipmentContents', 'min-h-[72px] resize-y')} />
          </FieldBox>
        </More>
      </GateStep>

      <Recap
        lines={[
          [purposes.join(' + '), form.appointmentTime && `appt ${timeLabel(form.appointmentTime)}`],
          [
            form.trailerNumber && <b key="t">{form.trailerNumber}</b>,
            form.truckName,
            form.truckerNameIn,
            hasPickup && form.pickupNumber && `order ${form.pickupNumber}`,
            hasPickup && form.customerPickupFor,
          ],
          [
            form.incomingSeals && (
              <span key="s">
                Seal {form.incomingSeals}
                {form.sealIntact === 'No' ? <b className="text-danger"> NOT intact</b> : form.sealIntact === 'Yes' ? ' intact' : ''}
              </span>
            ),
            reefer
              ? `Reefer ${form.tempSet || '?'}°/${form.tempActual || '?'}° · fuel ${FUEL_LABEL[form.fuelIn] ?? (form.fuelIn || '?')}`
              : form.reefer === 'No' && 'Dry van',
          ],
        ]}
      />
      <div className="no-print flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[15px] text-muted">
        <span className="mr-2 flex items-center gap-1.5">
          <Icon name="people" size={16} />
          Logged by <b className={loggedBy ? 'text-ink' : 'text-danger'}>{loggedBy || 'no guard set (top of the page)'}</b>
        </span>
        {onCancel && (
          <LinkButton icon="close" onClick={onCancel}>
            Cancel
          </LinkButton>
        )}
        <LinkButton icon="undo" onClick={handleClear}>
          {isEdit ? 'Revert' : 'Clear'}
        </LinkButton>
        <LinkButton icon="print" onClick={() => window.print()}>
          Print
        </LinkButton>
      </div>

      <BottomBar missing={stillNeeded}>
        <button type="submit" className={goButton(!missing.length)}>
          <Icon name={isEdit ? 'done' : 'checkIn'} size={24} />
          {isEdit ? 'Save Changes' : 'Check In'}
        </button>
      </BottomBar>
    </form>
  )
}
