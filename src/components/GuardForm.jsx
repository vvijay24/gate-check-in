import { useEffect, useRef, useState } from 'react'
import Field from './Field'
import OdometerPhoto from './OdometerPhoto'
import {
  EMPTY_FORM,
  GATES,
  REEFER_ONLY,
  REQUIRED_IN,
  REQUIRED_OUT,
  SECTIONS_IN,
  SECTIONS_OUT,
  VISIT_PURPOSES,
  isRequired,
  isShown,
} from '../formConfig'
import { BAY_NAMES } from '../yard'
import * as ui from '../ui'
import { clockTime } from '../time'
import { checkOutBlock, expectedSeal } from '../handoff'

const pad = (n) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const nowTime = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// `optional` lists required fields to skip this time (e.g. the bay when every bay is full).
function validate(form, mode, optional = []) {
  const errors = {}
  const required = mode === 'out' ? REQUIRED_OUT : REQUIRED_IN
  for (const key of required.filter((k) => isRequired(k, form, mode) && !optional.includes(k))) {
    const value = form[key]
    const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim()
    if (empty) errors[key] = 'Required'
  }
  if (errors.visitPurpose) errors.visitPurpose = 'Select at least one purpose'
  if (errors.odometerPhoto) errors.odometerPhoto = 'Take or upload a photo of the odometer'
  if (errors.waitingLocation) errors.waitingLocation = 'Pick a free staging bay'
  if (mode === 'out' && form.dateIn && form.dateOut && form.timeIn && form.timeOut) {
    if (`${form.dateOut}T${form.timeOut}` < `${form.dateIn}T${form.timeIn}`) {
      errors.timeOut = 'Out must be after in'
    }
  }
  return errors
}

// Date and time inputs; they start filled with today / now when the form opens.
function HeaderInput({ label, name, type, value, onChange, error, required }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`field-${name}`} className={ui.label}>
        {label}
        {required && <span className={ui.required}>*</span>}
      </label>
      <input
        id={`field-${name}`}
        name={name}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `field-${name}-error` : undefined}
        className={ui.input + (error ? ui.inputError : '')}
      />
      {error && (
        <p id={`field-${name}-error`} className={ui.errorText + ' mt-1'}>
          {error}
        </p>
      )}
    </div>
  )
}

// The guard's name carries over so they only type it once per shift.
const freshForm = (guardOnDuty = '') => ({ ...EMPTY_FORM, guardOnDuty, dateIn: today(), timeIn: nowTime() })

// Starting values when checking a truck out: now, the current guard, and the same driver
// unless the trailer is being dropped (a different truck usually collects it).
const checkOutForm = (entry, guard) =>
  entry.timeOut
    ? entry
    : {
        ...entry,
        dateOut: entry.dateOut || today(),
        timeOut: nowTime(),
        gateOut: entry.gateOut || 'Gate 2',
        guardOut: entry.guardOut || guard,
        truckerNameOut: entry.truckerNameOut || (entry.visitPurpose?.includes('Drop Trailer') ? '' : entry.truckerNameIn),
        driverPhoneOut: entry.driverPhoneOut || (entry.visitPurpose?.includes('Drop Trailer') ? '' : entry.driverPhone),
      }

// Section heading and field grid, matching guard-shack-log.html (h3 + .grid).
const sectionTitle =
  'mt-6 mb-2.5 border-t border-line pt-3.5 font-display text-[20px] leading-tight font-bold text-muted'
const firstSectionTitle = 'mb-2.5 font-display text-[20px] leading-tight font-bold text-muted'
// Fixed two columns (one on phones) so paired fields like name + phone stay side by side.
const grid = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2'
// Save / confirm bar, pinned to the bottom of the screen while the form scrolls.
const actionBar =
  'no-print sticky bottom-0 z-10 rounded-b-[10px] border-t border-line p-4 shadow-[0_-6px_16px_rgb(0_0_0/0.08)] sm:p-5'

// Names for the error summary, by field name: the configured fields plus those the form adds itself.
const FIELD_LABELS = {
  ...Object.fromEntries([...SECTIONS_IN, ...SECTIONS_OUT].flatMap((s) => s.fields).map((f) => [f.name, f.label])),
  dateIn: 'Date In',
  timeIn: 'Time In',
  gateIn: 'Gate In',
  dateOut: 'Date Out',
  timeOut: 'Time Out',
  gateOut: 'Gate Out',
  visitPurpose: 'Purpose of Visit',
  odometerPhoto: 'Odometer photo',
  guardOnDuty: 'Guard on Duty',
  guardOut: 'Guard Checking Out',
  sealConfirmed: 'Seal matches',
  sealNote: 'Seal note',
}

// Lists every field that stopped the save, each a link that jumps to (and focuses) the field.
// `labels` names the fields (the Loading Inspection passes its own).
export function ErrorSummary({ errors, action, summaryRef, labels = FIELD_LABELS }) {
  const names = Object.keys(errors)
  if (!names.length) return null
  const jump = (ev, name) => {
    ev.preventDefault()
    const el = document.getElementById(`field-${name}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus({ preventScroll: true })
  }
  return (
    <div ref={summaryRef} tabIndex={-1} role="alert" className="mb-5 rounded-lg border-l-[6px] border-danger bg-danger-soft px-4 py-3">
      <p className="font-display text-[21px] leading-tight font-bold text-danger">
        {names.length === 1 ? '1 thing needs' : `${names.length} things need`} fixing before {action}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {names.map((name) => (
          <li key={name}>
            <a href={`#field-${name}`} onClick={(ev) => jump(ev, name)} className="inline-block py-1 font-semibold text-danger underline">
              {labels[name] ?? name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Read-only arrival details shown at the top of the Check Out form.
function ArrivalSummary({ e }) {
  const rows = [
    ['Purpose', (e.visitPurpose ?? []).join(' + ')],
    ['Arrived', [e.dateIn, e.timeIn].filter(Boolean).join(' ')],
    ['Gate In', e.gateIn],
    ['Waiting at', e.waitingLocation],
    ['Trucker In', e.truckerNameIn],
    ['Dock', e.dockDoor],
    ['Order No', e.pickupNumber],
    ['Customer', e.customerPickupFor],
    ['Incoming Seals #', e.incomingSeals && `${e.incomingSeals}${e.sealIntact ? ` (intact: ${e.sealIntact})` : ''}`],
    ['Reefer', e.reefer === 'Yes' ? `${e.tempActual || '—'}°F, set ${e.tempSet || '—'}°F, fuel in ${e.fuelIn || '—'}` : e.reefer],
    ['Checked in by', e.guardOnDuty],
    ['Inspection', e.loadingInspection?.result],
    ['Released', e.release?.releasedAt && `${clockTime(e.release.releasedAt)} by ${e.release.releasedBy}`],
    ['Gate note', e.release?.note],
  ].filter(([, v]) => v)
  return (
    <section className="rounded-lg bg-page p-4">
      <div className="font-display text-[23px] leading-tight font-bold">
        {e.trailerNumber} · {e.truckName}
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[15px] sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="inline text-muted">{k}: </dt>
            <dd className="inline font-semibold break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// `takenBays` maps bay name → the truck holding it, so those bays can't be picked.
export default function GuardForm({ mode = 'in', initial, defaultGuard, takenBays = new Map(), onSave, onCancel }) {
  const start = () => (mode === 'out' ? checkOutForm(initial, defaultGuard) : (initial ?? freshForm(defaultGuard)))
  // The form as it was last started, saved or cleared; Clear only asks first when something differs.
  const baseline = useRef(null)
  const [form, setForm] = useState(() => (baseline.current = start()))
  const summaryRef = useRef(null)
  const [errors, setErrors] = useState({})
  // A new check-out asks "Confirm Check Out?" before saving.
  const [confirming, setConfirming] = useState(false)
  // Shown after a new check-in is saved, e.g. "Trailer T123 · Acme". Cleared when the next entry starts.
  const [checkedIn, setCheckedIn] = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    if (!checkedIn) return
    const t = setTimeout(() => setCheckedIn(null), 8000)
    return () => clearTimeout(t)
  }, [checkedIn])
  const isEdit = Boolean(initial?.id)
  const isOut = mode === 'out'
  // Re-opening a truck that already left edits its departure rather than checking it out again.
  const editingDeparture = isOut && Boolean(initial?.timeOut)
  // A truck that was at a dock can only leave once its inspection passed and Shipping released it.
  const blocked = isOut && !editingDeparture ? checkOutBlock(initial) : ''
  // The seal the guard should find on the trailer (from the release or the inspection). Asked on a
  // new check-out only, so editing an older departure doesn't demand it.
  const sealToCheck = isOut && !editingDeparture ? expectedSeal(initial) : ''
  const sections = isOut ? SECTIONS_OUT : SECTIONS_IN
  const hasPickup = (form.visitPurpose ?? []).includes('Pickup')
  // Bays held by other trucks; when editing, this truck's own bay stays pickable.
  const taken = new Map([...takenBays].filter(([, e]) => e.id !== initial?.id))
  const allBaysFull = BAY_NAMES.every((b) => taken.has(b))
  const optional = allBaysFull ? ['waitingLocation'] : []
  const bayProps = {
    disabledOptions: [...taken.keys()],
    optionNotes: Object.fromEntries([...taken].map(([bay, e]) => [bay, `In use · ${e.trailerNumber}`])),
    hint: allBaysFull ? 'All staging bays are full, so this can be left blank.' : undefined,
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest)
    setCheckedIn(null)
  }
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const save = () => {
    let data = form
    // A dry van shouldn't keep reefer readings typed before the answer changed to No.
    if (form.reefer !== 'Yes') data = { ...data, ...Object.fromEntries(REEFER_ONLY.map((k) => [k, ''])) }
    // Likewise, Pickup-only fields (Appointment Time) are cleared when Pickup isn't ticked.
    if (!isOut && !hasPickup) {
      const pickupOnly = SECTIONS_IN.flatMap((s) => s.fields).filter((f) => f.pickupOnly)
      data = { ...data, ...Object.fromEntries(pickupOnly.map((f) => [f.name, ''])) }
    }
    onSave(data)
    if (!isEdit) {
      setForm((baseline.current = freshForm(form.guardOnDuty)))
      setCheckedIn(`Trailer ${form.trailerNumber} · ${form.truckName}`)
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (blocked) return
    const errs = validate(form, mode, optional)
    // Seal check at the gate: required when a seal was recorded; a mismatch needs a note.
    if (sealToCheck && !form.sealConfirmed) errs.sealConfirmed = 'Required'
    if (sealToCheck && form.sealConfirmed === 'No' && !String(form.sealNote ?? '').trim()) errs.sealNote = 'Describe the seal found on the trailer'
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Show the summary of everything missing; its links jump to each field. Wait a frame so it has rendered.
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        summaryRef.current?.focus({ preventScroll: true })
      })
      return
    }
    if (isOut && !editingDeparture) {
      setConfirming(true)
      return
    }
    save()
  }

  // Clear (new entry) or Revert (editing) asks first when anything has been typed, so one stray tap
  // doesn't lose a half-done entry.
  const handleClear = () => {
    const typed = JSON.stringify(form) !== JSON.stringify(baseline.current)
    if (typed && !window.confirm(isEdit ? 'Undo your changes to this entry?' : 'Clear everything typed on this form?')) return
    setForm((baseline.current = start()))
    setErrors({})
  }

  const required = (name) => isRequired(name, form, mode) && !optional.includes(name)
  const header = (props) => (
    <HeaderInput {...props} value={form[props.name]} onChange={handleChange} error={errors[props.name]} required={required(props.name)} />
  )
  // Trucks come in through Gate 1 and leave through Gate 2, so the other gate can't be picked.
  const gate = (name, label, closedGate) => (
    <Field
      name={name}
      label={label}
      type="choice"
      options={GATES}
      disabledOptions={[closedGate]}
      value={form[name] ?? ''}
      onChange={handleChange}
      required={required(name)}
      error={errors[name]}
    />
  )

  const title = isOut
    ? `${editingDeparture ? 'Edit Check-Out' : 'Check Out'} · Trailer ${initial.trailerNumber}`
    : isEdit
      ? 'Update Check-In'
      : 'Check a Trailer In'
  const submitLabel = isOut ? (editingDeparture ? 'Save Changes' : 'Check Out') : isEdit ? 'Save Changes' : 'Check In'

  return (
    // No overflow-hidden here: it would stop the action bar below from sticking to the screen bottom.
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="scroll-mt-[140px] rounded-[10px] border border-line bg-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 pt-5 pb-3">
        <h2 className="font-display text-[26px] leading-tight font-bold">{title}</h2>
        <span className="text-sm text-muted">
          <span className="text-danger">*</span> required to {isOut ? 'check out' : 'log arrival'}
        </span>
      </div>

      <div className="p-5">
        {checkedIn && (
          <div role="status" className="mb-5 rounded-lg border-l-[6px] border-ok bg-ok-soft px-4 py-3">
            <p className="font-display text-[23px] leading-tight font-bold text-ok">✓ Check In Confirmed</p>
            <p className="text-[15px]">{checkedIn} is checked in. The form is ready for the next truck.</p>
          </div>
        )}
        {blocked && (
          <div role="alert" className="mb-5 rounded-lg border-l-[6px] border-danger bg-danger-soft px-4 py-3">
            <p className="font-display text-[22px] leading-tight font-bold text-danger">⛔ This truck can't be checked out yet</p>
            <p className="text-[15px]">{blocked}</p>
          </div>
        )}
        <ErrorSummary errors={errors} action={isOut ? 'check-out' : isEdit ? 'saving' : 'check-in'} summaryRef={summaryRef} />
        {isOut && <ArrivalSummary e={initial} />}

        {!isOut && (
          <section>
            <h3 className={firstSectionTitle}>Time In</h3>
            {/* Fixed two columns so the date stays beside its time at every width. */}
            <div className="grid grid-cols-2 gap-3.5">
              {header({ label: 'Date In', name: 'dateIn', type: 'date' })}
              {header({ label: 'Time In', name: 'timeIn', type: 'time' })}
            </div>
            <div className="mt-3.5">{gate('gateIn', 'Gate In', 'Gate 2')}</div>
          </section>
        )}

        {sections.map((section) => {
          const fields = section.fields.filter((f) => isShown(f.name, form))
          if (!fields.length && !section.emptyNote) return null
          return (
            <section key={section.title}>
              <h3 className={sectionTitle}>{section.title}</h3>
              {section.times && (
                <div className="mb-3.5 grid grid-cols-2 gap-3.5">
                  {header({ label: 'Date Out', name: 'dateOut', type: 'date' })}
                  {header({ label: 'Time Out', name: 'timeOut', type: 'time' })}
                </div>
              )}
              {section.times && <div className="mb-3.5">{gate('gateOut', 'Gate Out', 'Gate 1')}</div>}
              {!fields.length && <p className="text-muted">{section.emptyNote}</p>}
              {section.purpose && (
                <fieldset className="mb-3.5" aria-invalid={errors.visitPurpose ? true : undefined} aria-describedby={errors.visitPurpose ? 'field-visitPurpose-error' : undefined}>
                  <legend className={ui.label + ' mb-1'}>
                    Purpose of Visit
                    <span className={ui.required}>*</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {VISIT_PURPOSES.map((purpose, i) => (
                      <label
                        key={purpose}
                        className={
                          'flex min-h-[52px] min-w-36 flex-1 cursor-pointer items-center gap-3 rounded-[10px] border-2 bg-field px-4 font-semibold ' +
                          (errors.visitPurpose ? 'border-danger ' : 'border-line ') +
                          ui.PURPOSE_STYLES[purpose].check
                        }
                      >
                        <input
                          id={i === 0 ? 'field-visitPurpose' : undefined}
                          type="checkbox"
                          checked={form.visitPurpose.includes(purpose)}
                          onChange={(e) => {
                            set({
                              visitPurpose: e.target.checked
                                ? VISIT_PURPOSES.filter((p) => p === purpose || form.visitPurpose.includes(p))
                                : form.visitPurpose.filter((p) => p !== purpose),
                            })
                            if (errors.visitPurpose) setErrors(({ visitPurpose: _, ...rest }) => rest)
                          }}
                          className="h-6 w-6 shrink-0 cursor-pointer"
                        />
                        {purpose}
                      </label>
                    ))}
                  </div>
                  {errors.visitPurpose && (
                    <p id="field-visitPurpose-error" className={ui.errorText + ' mt-1'}>
                      {errors.visitPurpose}
                    </p>
                  )}
                </fieldset>
              )}
              <div className={grid}>
                {fields.map((f) => {
                  const locked = f.pickupOnly && !hasPickup
                  return (
                    <Field
                      key={f.name}
                      {...f}
                      value={form[f.name] ?? ''}
                      onChange={handleChange}
                      required={required(f.name)}
                      error={errors[f.name]}
                      disabled={locked}
                      hint={locked ? 'Tick Pickup above to enter this.' : undefined}
                      {...(f.name === 'waitingLocation' ? bayProps : {})}
                    />
                  )
                })}
              </div>
              {section.odometer && (
                <div className="mt-3.5">
                  <OdometerPhoto
                    value={form.odometerPhoto}
                    onChange={(odometerPhoto) => {
                      set({ odometerPhoto })
                      if (odometerPhoto && errors.odometerPhoto) setErrors(({ odometerPhoto: _, ...rest }) => rest)
                    }}
                    required={required('odometerPhoto')}
                    error={errors.odometerPhoto}
                  />
                </div>
              )}
            </section>
          )
        })}

        {isOut && sealToCheck && (
          <section>
            <h3 className={sectionTitle}>Seal Check</h3>
            <div className={grid}>
              <Field
                name="sealConfirmed"
                label={`Seal on the trailer matches ${sealToCheck}?`}
                type="choice"
                options={['Yes', 'No']}
                dangerOptions={['No']}
                value={form.sealConfirmed ?? ''}
                onChange={handleChange}
                required
                error={errors.sealConfirmed}
                wide
              />
              {form.sealConfirmed === 'No' && (
                <Field
                  name="sealNote"
                  label="Seal found on the trailer"
                  type="textarea"
                  value={form.sealNote ?? ''}
                  onChange={handleChange}
                  required
                  error={errors.sealNote}
                  warning="The seal doesn't match: tell Shipping before the truck leaves"
                  wide
                />
              )}
            </div>
          </section>
        )}

        {isOut ? (
          <section>
            <h3 className={sectionTitle}>Guard on Duty</h3>
            <div className={grid}>{header({ label: 'Guard Checking Out', name: 'guardOut', type: 'text' })}</div>
          </section>
        ) : (
          <div className={grid + ' mt-6 border-t border-line pt-3.5'}>
            {header({ label: 'Guard on Duty', name: 'guardOnDuty', type: 'text' })}
          </div>
        )}
      </div>

      {/* The action bar (or the confirm step) sticks to the bottom of the screen so guards don't
          scroll to the end of the form to save. */}
      {confirming ? (
        <div role="alertdialog" aria-labelledby="confirm-checkout-title" className={actionBar + ' bg-page'}>
          <p id="confirm-checkout-title" className="font-display text-[23px] leading-tight font-bold">
            Confirm Check Out?
          </p>
          <p className="mt-1 text-muted">
            Trailer {initial.trailerNumber} · {initial.truckName} leaving at {form.timeOut} on {form.dateOut}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={save} autoFocus className={ui.btnPrimary}>
              Yes, check out
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={ui.btn}>
              Go back to form
            </button>
          </div>
        </div>
      ) : (
        <div className={actionBar + ' flex flex-wrap justify-end gap-3 bg-panel'}>
          {onCancel && (
            <button type="button" onClick={onCancel} className={ui.btn}>
              Cancel
            </button>
          )}
          <button type="button" onClick={handleClear} className={ui.btn}>
            {isEdit ? 'Revert' : 'Clear'}
          </button>
          <button type="button" onClick={() => window.print()} className={ui.btn}>
            Print
          </button>
          <button type="submit" disabled={Boolean(blocked)} className={ui.btnPrimary}>
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  )
}
