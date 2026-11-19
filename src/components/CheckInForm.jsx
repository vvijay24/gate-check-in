import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'
import { VISIT_PURPOSES, isRequired } from '../formConfig'
import { EARLY_GRACE_MIN, LATE_GRACE_MIN, minutesLate } from '../time'
import { PHONE_PROPS, cleanForSave, dayLabel, freshCheckIn, phoneInput, timeLabel, validate } from '../gateForm'
import { visitMemory } from '../visitMemory'
import OdometerPhoto from './OdometerPhoto'
import { Badge, Chips, CompactGate, FieldBox, LinkButton, More, Note, PANEL_BODY, PANEL_FOOT, PRESS, Recap, Seg, StepBar, Stepper, Suggest, panelBtn, panelGo } from './gate/parts'

// Gate Check In on one page, kept simple for the guard: (1) purpose and appointment at the window,
// (2) vehicle details from the driver, (3) the trailer — seal, reefer, and optional extras — then a short
// recap and Check In in the bar at the bottom. Used for new check-ins and for editing one. The guard on
// duty comes from the page header. One panel shows a step at a time: Next, Back, then Check In.

const PURPOSE = {
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
// Required answers by step, for each step's done mark and for opening the step a missing answer is on.
const SECTION_FIELDS = [
  ['dateIn', 'timeIn', 'gateIn', 'visitPurpose', 'appointmentTime', 'driverPhone', 'truckerNameIn'],
  ['pickupNumber', 'customerPickupFor', 'trailerNumber', 'truckName'],
  ['incomingSeals', 'sealIntact', 'reefer', 'tempSet', 'tempActual', 'fuelIn'],
]
// The three steps, as named in the bar on top of the panel.
const STEPS = [
  { id: 'in-checkin', label: 'Check In' },
  { id: 'in-vehicle', label: 'Vehicle' },
  { id: 'in-trailer', label: 'Trailer' },
]
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

export default function CheckInForm({ initial, entries, guard, onSave, onCancel }) {
  const isEdit = Boolean(initial?.id)
  const start = () => initial ?? freshCheckIn()
  // The form as it was last started, saved or cleared; Clear only asks first when something differs.
  const baseline = useRef(null)
  // When the guard started this check-in (their first answer), to time the Gate's check-in. Not shown
  // to the guard; the Overview reports it. A form left open between trucks doesn't count.
  const openedAt = useRef(null)
  const [form, setForm] = useState(() => (baseline.current = start()))
  const [errors, setErrors] = useState({})
  // The step on screen (0–2): one panel with Next / Back, and Check In on the last step.
  const [step, setStep] = useState(0)
  // The panel's body keeps one height on every step (sized to fit Vehicle for a pickup); a longer step,
  // e.g. Trailer with a reefer, scrolls inside it.
  const bodyRef = useRef(null)
  // Shown after a new check-in is saved, e.g. "Trailer T123 · Acme". Cleared when the next entry starts.
  const [checkedIn, setCheckedIn] = useState(null)
  // The returning-trailer card: dismissed or used for this trailer #.
  const [match, setMatch] = useState({ dismissed: '', used: '' })
  const [nameFromPhone, setNameFromPhone] = useState(false)
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
  const sectionOk = left.map((l) => l.length === 0)
  // A section counts as started once the guard has answered something in it. The arrival date, time
  // and gate are filled in automatically, so they don't make Purpose look started.
  const sectionStarted = [
    ['visitPurpose', 'appointmentTime', 'driverPhone', 'truckerNameIn'],
    ['pickupNumber', 'customerPickupFor', 'trailerNumber', 'truckName'],
    ['incomingSeals', 'sealIntact', 'reefer', 'tempSet', 'tempActual', 'fuelIn', 'odometerPhoto', 'emptyPallets', 'shipmentContents'],
  ].map((names) => names.some((n) => filled(form[n])))

  // "Seen before": on Check In, the driver's last visit found by phone; on Vehicle, the trailer's last visit.
  const lastVisit = step === 0 ? memory.lastVisitByPhone(form.driverPhone) : memory.lastVisit(form.trailerNumber)
  const key = step === 0 ? 'p' + String(form.driverPhone ?? '').replace(/\D/g, '') : 't' + trailerKey(form.trailerNumber)
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
    if (step < 2) return goStep(step + 1)
    // A new check-in is logged by the guard on duty now; an edit keeps who logged it.
    const data = { ...form, guardOnDuty: isEdit ? form.guardOnDuty || guard : guard }
    const errs = validate(data, 'in')
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Each missing answer is marked red at its field, and steps with one turn red in the bar. Open the
      // first such step and put the cursor in its first red field (a frame later, once it has rendered).
      const first = Object.keys(errs)[0]
      setStep(stepOf(first))
      requestAnimationFrame(() => {
        const el = document.getElementById(`field-${first}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
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
      setStep(0)
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
  // Check In's compact sizes: 48px boxes and buttons, 16px text.
  const input = ui.input.replace('min-h-[52px]', 'min-h-12').replace('text-[17px]', 'text-[16px]')
  const inputCls = (name, extra = '') => input + (err(name) ? ui.inputError : '') + ' ' + extra
  const bigInput = 'font-display font-semibold tracking-wide'

  // The step a field is on (fields not in a step's list, e.g. the note, count as the last step).
  const stepOf = (name) => {
    const i = SECTION_FIELDS.findIndex((names) => names.includes(name))
    return i === -1 ? 2 : i
  }
  const goStep = (i) => {
    setStep(i)
    bodyRef.current?.scrollTo({ top: 0 })
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  // Back / Next / Check In, pinned at the foot of the panel.
  const stepButtons = (
    <div className={PANEL_FOOT}>
      {step > 0 && (
        <button type="button" onClick={() => goStep(step - 1)} className={panelBtn(ui.btn)}>
          <Icon name="chevron" size={18} className="rotate-180" />
          Back
        </button>
      )}
      {step < 2 ? (
        <button type="button" onClick={() => goStep(step + 1)} className={panelBtn(ui.btnPrimary) + ' ml-auto'}>
          Next
          <Icon name="chevron" size={18} />
        </button>
      ) : (
        <button type="submit" className={panelGo(true) + ' ml-auto'}>
          <Icon name={isEdit ? 'done' : 'checkIn'} size={20} />
          {isEdit ? 'Save Changes' : 'Check In'}
        </button>
      )}
    </div>
  )
  // Missing answers per step, for the red marks in the step bar.
  const bads = STEPS.map((_, i) => Object.keys(errors).filter((n) => stepOf(n) === i).length)
  const loggedBy = isEdit ? form.guardOnDuty || guard : guard
  const enterNext = (next) => (e) => {
    // The keyboard's Next / Enter moves to the following field instead of submitting the form.
    if (e.key !== 'Enter') return
    e.preventDefault()
    document.getElementById(`field-${next}`)?.focus()
  }
  // Enter on a step's last box opens the next step with the cursor in its first box.
  const enterStep = (i, first) => (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    goStep(i)
    requestAnimationFrame(() => document.getElementById(`field-${first}`)?.focus({ preventScroll: true }))
  }
  // Shown under the driver (Check In) or the trailer (Vehicle) when they've been here before.
  const seenCard =
    lastVisit && match.used === key ? (
      <div className="sm:col-span-2">
        <Note tone="ok" icon="done">
          Filled from the last visit. Check it's the same driver.
        </Note>
      </div>
    ) : (
      lastVisit &&
      !sameAsLast &&
      match.dismissed !== key && (
        <div className="flex animate-pop flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-signal-bright bg-signal-tint px-4 py-2 sm:col-span-2">
          <Icon name="history" size={20} className="text-signal" />
          <div className="min-w-0 flex-1">
            <b className="block font-display text-[14px]">Seen before · {dayLabel(lastVisit.dateIn)}</b>
            <span className="text-[14px] text-muted">{[lastVisit.truckName, lastVisit.truckerNameIn].filter(Boolean).join(' · ')}</span>
          </div>
          <button type="button" onClick={() => setMatch({ dismissed: key, used: '' })} className={ui.btnGhost}>
            Not this one
          </button>
          <button type="button" onClick={useLast} className={ui.btnSmallPrimary}>
            Use these
          </button>
        </div>
      )
    )

  return (
    <form onSubmit={submit} noValidate className="relative grid gap-4">
      {/* Out of the flow (no grid gap), so this panel lines up with Check Out's beside it. */}
      <div ref={topRef} className="absolute top-0 scroll-mt-[calc(var(--header-h,114px)+16px)]" />
      {checkedIn && (
        <div role="status" className="animate-pop rounded-2xl border border-ok/25 bg-ok-soft px-5 py-4 shadow-raised">
          <p className="flex items-center gap-2 font-display text-[20px] leading-tight font-bold text-ok">
            <Icon name="done" size={26} />
            Checked in
          </p>
          <p className="text-[16px]">{checkedIn} is checked in. The form is ready for the next truck.</p>
        </div>
      )}
      {isEdit && <p className="text-[15px] text-muted">Editing trailer <b className="text-ink">{initial.trailerNumber}</b></p>}

      {/* One panel: a three-step bar on top, the step's fields (always Step 1's height; longer steps
          scroll inside), and Back / Next / Check In pinned at the foot. */}
      <CompactGate>
      <section aria-labelledby="in-step-title" className={ui.card + ' overflow-hidden'}>
        <StepBar
          label="Check In steps"
          steps={STEPS}
          step={step}
          onStep={goStep}
          bads={bads}
          tones={STEPS.map((_, i) => (bads[i] ? 'error' : i === step ? 'now' : sectionOk[i] ? 'done' : sectionStarted[i] ? 'started' : 'todo'))}
        />
        <h2 id="in-step-title" className="sr-only">
          {STEPS[step].label}, step {step + 1} of 3
        </h2>

        <div
          ref={bodyRef}
          className={PANEL_BODY + ' sm:grid-cols-2'}
        >
          {/* 1 · Check In: purpose, appointment, then the driver (the phone can fill in the name). */}
          {step === 0 && (
            <>
              <FieldBox name="visitPurpose" label="What's it here for?" required group error={err('visitPurpose')} className="sm:col-span-2">
                <div role="group" aria-labelledby="field-visitPurpose-label" className="flex flex-wrap gap-2">
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
                          'inline-flex min-h-12 items-center gap-2 rounded-full px-5 font-display text-[15px] leading-tight font-bold ' +
                          (on ? PURPOSE[p].on + ' shadow-card' : (err('visitPurpose') ? 'border-danger' : 'border-line') + ' bg-field text-ink hover:border-signal-bright hover:bg-panel')
                        }
                      >
                        <Icon name={on ? 'check' : PURPOSE[p].icon} size={18} />
                        {p === 'Drop Trailer' ? 'Drop trailer' : p}
                      </button>
                    )
                  })}
                </div>
              </FieldBox>
              <FieldBox name="appointmentTime" label="Appointment time" required error={err('appointmentTime')} after={<ApptBadge form={form} />} className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chips label="Appointment times" items={apptChoices(form.timeIn)} value={form.appointmentTime} onPick={(appointmentTime) => set({ appointmentTime })} />
                  <input type="time" {...text('appointmentTime')} aria-label="Other appointment time" className={inputCls('appointmentTime', 'w-auto max-w-[180px]')} />
                </div>
              </FieldBox>
              <FieldBox name="driverPhone" label="Driver phone" required error={err('driverPhone')}>
                <input
                  id="field-driverPhone"
                  name="driverPhone"
                  {...PHONE_PROPS}
                  value={form.driverPhone ?? ''}
                  onChange={(e) => setPhone(phoneInput(e.target.value))}
                  enterKeyHint="next"
                  onKeyDown={enterNext('truckerNameIn')}
                  className={inputCls('driverPhone', bigInput)}
                />
              </FieldBox>
              <FieldBox
                name="truckerNameIn"
                label="Driver name"
                required
                error={err('truckerNameIn')}
                hint={nameFromPhone && form.truckerNameIn ? 'From a past visit with this phone number' : undefined}
              >
                <input
                  {...text('truckerNameIn')}
                  enterKeyHint="next"
                  onKeyDown={enterStep(1, hasPickup ? 'pickupNumber' : 'trailerNumber')}
                  onChange={(e) => {
                    set({ truckerNameIn: e.target.value })
                    setNameFromPhone(false)
                  }}
                  className={inputCls('truckerNameIn')}
                />
              </FieldBox>
              {seenCard}
            </>
          )}

          {/* 2 · Vehicle: Order No | Customer (pickups only), then Trailer # | Carrier. Customer and Carrier
              suggest names seen before once 2 letters are typed. */}
          {step === 1 && (
            <>
              {hasPickup && (
                <>
                  <FieldBox name="pickupNumber" label="Order No" required error={err('pickupNumber')}>
                    <input {...text('pickupNumber')} autoComplete="off" enterKeyHint="next" onKeyDown={enterNext('customerPickupFor')} className={inputCls('pickupNumber', bigInput)} />
                  </FieldBox>
                  <FieldBox name="customerPickupFor" label="Customer" required error={err('customerPickupFor')}>
                    <Suggest
                      name="customerPickupFor"
                      value={form.customerPickupFor}
                      onChange={(customerPickupFor) => set({ customerPickupFor })}
                      options={memory.allCustomers}
                      placeholder="Start typing"
                      enterKeyHint="next"
                      onKeyDown={enterNext('trailerNumber')}
                      className={inputCls('customerPickupFor')}
                    />
                  </FieldBox>
                </>
              )}
              <FieldBox name="trailerNumber" label="Trailer #" required error={err('trailerNumber')}>
                <input {...text('trailerNumber')} autoComplete="off" enterKeyHint="next" onKeyDown={enterNext('truckName')} className={inputCls('trailerNumber', bigInput)} />
              </FieldBox>
              <FieldBox name="truckName" label="Carrier" required error={err('truckName')}>
                <Suggest
                  name="truckName"
                  value={form.truckName}
                  onChange={(truckName) => set({ truckName })}
                  options={memory.allCarriers}
                  placeholder="Start typing"
                  enterKeyHint="next"
                  onKeyDown={enterStep(2, 'incomingSeals')}
                  className={inputCls('truckName')}
                />
              </FieldBox>
              {seenCard}
            </>
          )}

          {/* 3 · Trailer */}
          {step === 2 && (
            <>
              <FieldBox name="incomingSeals" label="Seal #" required error={err('incomingSeals')}>
                <input {...text('incomingSeals')} inputMode="numeric" autoComplete="off" enterKeyHint="done" className={inputCls('incomingSeals', bigInput)} />
              </FieldBox>
              <FieldBox name="sealIntact" label="Seal intact?" required group error={err('sealIntact')}>
                <Seg name="sealIntact" value={form.sealIntact} onChange={(sealIntact) => set({ sealIntact })} error={err('sealIntact')} options={[{ value: 'Yes' }, { value: 'No', danger: true }]} />
              </FieldBox>
              {form.sealIntact === 'No' && (
                <div className="sm:col-span-2">
                  <Note>Broken or missing seal: tell Shipping</Note>
                </div>
              )}
              <FieldBox name="reefer" label="Reefer?" required group error={err('reefer')} className={reefer ? '' : 'sm:col-span-2'}>
                <Seg name="reefer" value={form.reefer} onChange={(v) => set({ reefer: v })} error={err('reefer')} options={[{ value: 'Yes' }, { value: 'No', label: 'No, dry van' }]} />
              </FieldBox>
              {reefer && (
                <>
                  <FieldBox name="fuelIn" label="Reefer fuel" required group error={err('fuelIn')}>
                    <Seg name="fuelIn" value={form.fuelIn} onChange={(fuelIn) => set({ fuelIn })} error={err('fuelIn')} options={FUEL} />
                  </FieldBox>
                  <FieldBox name="tempSet" label="Set point °F" required error={err('tempSet')}>
                    <Stepper name="tempSet" label="set point °F" value={form.tempSet} onChange={(tempSet) => set({ tempSet })} error={err('tempSet')} />
                  </FieldBox>
                  <FieldBox name="tempActual" label="Actual °F" required error={err('tempActual')}>
                    <Stepper name="tempActual" label="actual temp °F" value={form.tempActual} onChange={(tempActual) => set({ tempActual })} error={err('tempActual')} />
                  </FieldBox>
                  {tempGap > 3 && (
                    <div className="sm:col-span-2">
                      <Note>{tempGap.toFixed(1)}° off the set point: tell Shipping</Note>
                    </div>
                  )}
                </>
              )}
              <div className="sm:col-span-2">
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
              </div>
              <div className="sm:col-span-2">
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
              </div>
            </>
          )}
        </div>

        {stepButtons}
      </section>
      </CompactGate>

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

    </form>
  )
}
