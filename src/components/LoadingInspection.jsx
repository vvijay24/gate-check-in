import { useEffect, useRef, useState } from 'react'
import Field from './Field'
import { ErrorSummary } from './GuardForm'
import * as ui from '../ui'
import { arrivalMs, dayKey, duration } from '../time'
import { DETENTION_TAG, detentionState } from '../detention'
import { LOAD_CHECKS, TRAILER_CHECKS } from '../inspectionChecks'

// Pre-loading inspection for outbound poultry. Every load is frozen, so one set of limits applies:
// typical cold-chain figures; confirm them against the plant's HACCP plan.
const LIMIT = { product: 0, precool: 10 }

const YES_NO = ['Yes', 'No']

const PRODUCT_TEMPS = [
  { name: 'tempFront', label: 'Product Temp Front °F' },
  { name: 'tempMiddle', label: 'Product Temp Middle °F' },
  { name: 'tempRear', label: 'Product Temp Rear °F' },
]

// The trailer check before loading: the empty trailer's condition and temperatures.
const TRAILER_REQUIRED = [...TRAILER_CHECKS.map((c) => c.name), 'setPoint', 'precoolTemp', 'reeferRunning', 'inspector']
const TRAILER_FIELDS = [...TRAILER_REQUIRED]

// Drafts per truck and checklist, kept in this browser until saved, so walking away loses nothing.
const DRAFTS = 'inspection-drafts'
const readDrafts = () => {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS)) ?? {}
  } catch {
    return {}
  }
}
const writeDraft = (key, form) => {
  try {
    const all = readDrafts()
    if (form) all[key] = form
    else delete all[key]
    localStorage.setItem(DRAFTS, JSON.stringify(all))
  } catch {
    // A full storage only loses the draft, never a saved inspection.
  }
}
export const hasDraft = (id, part) => !!readDrafts()[`${id}:${part}`]
const hhmm = (ms) => (Number.isFinite(ms) ? timeOf(new Date(ms)) : '')

// Required fields, in on-screen order so the first error gets focus.
const REQUIRED = [
  'inspectionDate',
  'inspectionTime',
  ...TRAILER_CHECKS.map((c) => c.name),
  'setPoint',
  'precoolTemp',
  ...PRODUCT_TEMPS.map((t) => t.name),
  'reeferRunning',
  'palletsLoaded',
  ...LOAD_CHECKS.map((c) => c.name),
  'loadStart',
  'loadFinish',
  'sealApplied',
  'technician',
  'inspector',
]

// Field names for the error summary.
const LABELS = {
  inspectionDate: 'Inspection Date',
  inspectionTime: 'Inspection Time',
  ...Object.fromEntries([...TRAILER_CHECKS, ...LOAD_CHECKS, ...PRODUCT_TEMPS].map((c) => [c.name, c.label])),
  setPoint: 'Reefer Set Point °F',
  precoolTemp: 'Trailer Pre-Cool Temp °F',
  reeferRunning: 'Reefer Running (Continuous)',
  palletsLoaded: 'Pallets Loaded',
  loadStart: 'Loading Start',
  loadFinish: 'Loading Finish',
  sealApplied: 'Seal # Applied',
  technician: 'Technician Name',
  inspector: 'Inspected By',
  correctiveAction: 'Corrective Action',
}

const pad = (n) => String(n).padStart(2, '0')
const timeOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const nowTime = () => timeOf(new Date())
// The moment the inspection took place, from its Inspection Date and Time.
const inspectionMs = (f) => new Date(`${f.inspectionDate}T${f.inspectionTime || '00:00'}`).getTime()

// A new inspection starts at today / now. One saved before these fields existed takes the time it
// was saved.
const blank = (entry) => {
  const at = entry.loadingInspection?.inspectedAt ? new Date(entry.loadingInspection.inspectedAt) : new Date()
  return {
    inspectionDate: dayKey(at),
    inspectionTime: timeOf(at),
    ...Object.fromEntries([...TRAILER_CHECKS, ...LOAD_CHECKS].map((c) => [c.name, ''])),
    setPoint: entry.tempSet || '',
    precoolTemp: '',
    ...Object.fromEntries(PRODUCT_TEMPS.map((t) => [t.name, ''])),
    reeferRunning: '',
    palletsLoaded: '',
    caseCount: '',
    totalWeight: '',
    loadStart: '',
    loadFinish: '',
    sealApplied: entry.outgoingSeals || '',
    correctiveAction: '',
    technician: '',
    inspector: '',
    notes: '',
  }
}

// Everything that makes the trailer check fail.
export function trailerIssues(f) {
  const issues = []
  for (const c of TRAILER_CHECKS) if (f[c.name] === 'No') issues.push(`${c.label}: No`)
  if (f.reeferRunning === 'No') issues.push('Reefer not running in continuous mode')
  if (f.precoolTemp !== '' && f.precoolTemp != null && Number(f.precoolTemp) > LIMIT.precool) issues.push(`Trailer pre-cool ${f.precoolTemp}°F is above ${LIMIT.precool}°F`)
  return issues
}

// Everything that makes the load fail, as readable lines.
export function inspectionIssues(f) {
  const issues = []
  for (const c of [...TRAILER_CHECKS, ...LOAD_CHECKS]) if (f[c.name] === 'No') issues.push(`${c.label}: No`)
  if (f.reeferRunning === 'No') issues.push('Reefer not running in continuous mode')
  for (const t of PRODUCT_TEMPS) {
    const v = f[t.name]
    if (v !== '' && Number(v) > LIMIT.product) issues.push(`${t.label.replace(' °F', '')} ${v}°F is above ${LIMIT.product}°F`)
  }
  if (f.precoolTemp !== '' && Number(f.precoolTemp) > LIMIT.precool) {
    issues.push(`Trailer pre-cool ${f.precoolTemp}°F is above ${LIMIT.precool}°F`)
  }
  return issues
}

function validate(f, issues, part = 'load') {
  const errors = {}
  for (const key of part === 'trailer' ? TRAILER_REQUIRED : REQUIRED) if (!String(f[key] ?? '').trim()) errors[key] = 'Required'
  if (part === 'trailer') return errors
  // A few minutes' leeway for clocks that differ.
  if (f.inspectionDate && f.inspectionTime && inspectionMs(f) > Date.now() + 5 * 60000) errors.inspectionTime = "Can't be in the future"
  if (f.loadStart && f.loadFinish && f.loadFinish < f.loadStart) errors.loadFinish = 'Finish must be after start'
  if (issues.length && !f.correctiveAction.trim()) errors.correctiveAction = 'Describe the corrective action for this failed inspection'
  return errors
}

const sectionRow = 'mt-6 mb-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5'
const sectionTitle = 'font-display text-[16px] leading-tight font-semibold text-muted'
const grid = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2 2xl:grid-cols-3'
const filled = (v) => String(v ?? '').trim() !== ''

// A section heading, with an optional action (Mark all Yes) at its right.
function Section({ title, action }) {
  return (
    <div className={sectionRow}>
      <h3 className={sectionTitle}>{title}</h3>
      {action}
    </div>
  )
}

// Result so far, progress, issues and the truck's detention, kept in view beside the form.
function StatusPanel({ entry, issues, answered, total, now }) {
  const done = answered === total
  const det = detentionState(entry, now)
  const fail = issues.length > 0
  const issueList = (
    <ul className="mt-1 list-disc pl-5 text-[14px] text-danger">
      {issues.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  )
  return (
    <aside className="space-y-3 @3xl:sticky @3xl:top-0 @3xl:self-start">
      {/* Pass / Fail is given only once every required field is answered; until then, problems
          already found are listed without calling the result. */}
      {done ? (
        // The result pops in with its mark drawing itself; keyed on the result so a change replays it.
        <div
          key={fail ? 'fail' : 'pass'}
          role="status"
          className={'pop-in flex items-start gap-3 rounded-xl px-4 py-3 ' + (fail ? 'bg-danger-soft' : 'bg-ok-soft')}
        >
          <svg width="40" height="40" viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
            <circle cx="15" cy="15" r="14" fill={fail ? 'var(--color-danger)' : 'var(--color-ok)'} />
            {fail ? (
              <path className="draw" d="M10 10 L20 20 M20 10 L10 20" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
            ) : (
              <path className="draw" d="M8.5 15.5 L13 20 L21.5 10.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          <div className="min-w-0">
            <div className={'font-display text-[19px] leading-tight font-semibold ' + (fail ? 'text-danger' : 'text-ok')}>{fail ? 'Result: Fail' : 'Result: Pass'}</div>
            {fail ? issueList : <p className="text-sm">Every check passed. Save to send it to Shipping.</p>}
          </div>
        </div>
      ) : (
        <div role="status" className={'rounded-xl border-l-[6px] bg-panel px-4 py-3 shadow-card ' + (fail ? 'border-l-danger' : 'border-l-line')}>
          <div className="font-display text-[16px] leading-tight font-semibold text-muted">Result: shown when the inspection is complete</div>
          {fail ? (
            <>
              <p className="mt-1 text-sm font-semibold text-danger">Problems found so far:</p>
              {issueList}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">No problems found so far.</p>
          )}
        </div>
      )}

      {/* Progress ring: required answers so far, green when all are in. */}
      <div
        className="flex items-center gap-4 rounded-xl bg-panel px-4 py-3 shadow-card"
        role="progressbar"
        aria-label="Required fields answered"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
      >
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--color-track)" strokeWidth="7" />
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke={done ? 'var(--color-ok)' : 'var(--color-signal)'}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${(answered / total) * 163.4} 163.4`}
            transform="rotate(-90 32 32)"
            style={{ transition: 'stroke-dasharray 0.3s ease' }}
          />
          <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--color-ink)">
            {Math.round((answered / total) * 100)}%
          </text>
        </svg>
        <div className="text-sm">
          <div className="font-semibold">Required answered</div>
          <div className="text-muted tabular-nums">
            {answered} of {total}
            {done ? ' · all in' : ` · ${total - answered} to go`}
          </div>
        </div>
      </div>

      {/* Inspection time counts toward detention, so show how long the truck has been here. */}
      <div className="rounded-xl bg-panel px-4 py-3 text-sm shadow-card">
        <div className="font-semibold">On site {duration(now - arrivalMs(entry))}</div>
        {det ? (
          <span className={ui.tag + ' mt-1 ' + DETENTION_TAG[det.level]}>{det.text}</span>
        ) : (
          <span className="text-muted">Within free time</span>
        )}
      </div>
    </aside>
  )
}

// `part`: 'trailer' (the empty trailer, before loading) or 'load' (the full inspection after loading;
// the trailer check's answers come along). `inspector`: the inspector on duty, filled in as Inspected By.
export function InspectionForm({ entry, part = 'load', inspector = '', onSave, onSaveTrailerCheck, onCancel, onChangeTruck }) {
  const trailer = part === 'trailer'
  const draftKey = `${entry.id}:${part}`
  const [form, setForm] = useState(() => {
    const tc = entry.trailerCheck ?? {}
    const fromTrailer = Object.fromEntries(TRAILER_FIELDS.filter((k) => tc[k] != null && tc[k] !== '').map((k) => [k, tc[k]]))
    return {
      ...blank(entry),
      inspector,
      ...fromTrailer,
      loadStart: hhmm(entry.loadStartedAt),
      loadFinish: hhmm(entry.loadFinishedAt),
      ...(trailer ? {} : (entry.loadingInspection ?? {})),
      ...(trailer && entry.trailerCheck ? fromTrailer : {}),
      ...(readDrafts()[draftKey] ?? {}),
    }
  })
  const [touched, setTouched] = useState(false)
  // A passed trailer check is shown folded on the load inspection; Edit opens it again.
  const [showTrailer, setShowTrailer] = useState(trailer || entry.trailerCheck?.result !== 'Pass')
  useEffect(() => {
    if (touched) writeDraft(draftKey, form)
  }, [form, touched, draftKey])
  const [errors, setErrors] = useState({})
  const [now, setNow] = useState(Date.now)
  const summaryRef = useRef(null)
  const issues = trailer ? trailerIssues(form) : inspectionIssues(form)
  const result = issues.length ? 'Fail' : 'Pass'
  // Corrective Action becomes required (and appears) once the load is failing.
  const required = trailer ? TRAILER_REQUIRED : issues.length ? [...REQUIRED, 'correctiveAction'] : REQUIRED
  const answered = required.filter((k) => filled(form[k])).length

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setTouched(true)
    setForm((f) => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest)
  }

  // Answers Yes to the group's unanswered checks; a No already given is left alone.
  const markAllYes = (checks) => {
    const open = checks.filter((c) => !form[c.name]).map((c) => c.name)
    setTouched(true)
    setForm((f) => ({ ...f, ...Object.fromEntries(open.map((n) => [n, 'Yes'])) }))
    setErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([k]) => !open.includes(k))))
  }
  const allYesButton = (checks) => {
    const open = checks.filter((c) => !form[c.name]).length
    return (
      <button type="button" onClick={() => markAllYes(checks)} disabled={!open} className={ui.btnSmall}>
        Mark all Yes{open ? ` (${open})` : ''}
      </button>
    )
  }

  // "Above 0°F limit" under a temperature that's too warm for frozen product.
  const tooWarm = (name, max) => (filled(form[name]) && Number(form[name]) > max ? `Above ${max}°F limit` : undefined)

  const field = (props) => (
    <Field
      key={props.name}
      {...props}
      value={form[props.name] ?? ''}
      onChange={handleChange}
      required={required.includes(props.name)}
      error={errors[props.name]}
    />
  )
  // A checklist row: its mark shows the answer (✓ Yes, ✕ No, empty circle while unanswered).
  const check = (c) => {
    const v = form[c.name]
    const mark = (
      <span
        aria-hidden="true"
        className={
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ' +
          (v === 'Yes' ? 'bg-ok text-panel' : v === 'No' ? 'bg-danger text-panel' : 'ring-2 ring-line')
        }
      >
        {v === 'Yes' ? '✓' : v === 'No' ? '✕' : ''}
      </span>
    )
    return field({
      ...c,
      label: (
        <span className="inline-flex items-center gap-2 align-middle text-ink">
          {mark}
          {c.label}
        </span>
      ),
      type: 'choice',
      options: YES_NO,
      dangerOptions: ['No'],
    })
  }

  const timeField = (name, label) => (
    <div key={name} className="flex min-w-0 flex-col gap-1">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={`field-${name}`} className={ui.label}>
          {label}
          <span className={ui.required}>*</span>
        </label>
        <button
          type="button"
          onClick={() => handleChange({ target: { name, value: nowTime() } })}
          className="cursor-pointer text-[15px] font-semibold underline"
        >
          Now
        </button>
      </div>
      <input
        id={`field-${name}`}
        name={name}
        type="time"
        value={form[name]}
        onChange={handleChange}
        className={ui.input + (errors[name] ? ui.inputError : '')}
      />
      {errors[name] && <p className={ui.errorText}>{errors[name]}</p>}
    </div>
  )

  const submit = (ev) => {
    ev.preventDefault()
    const errs = validate(form, issues, part)
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Show the summary of everything missing; its links jump to each field.
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        summaryRef.current?.focus({ preventScroll: true })
      })
      return
    }
    writeDraft(draftKey, null)
    if (trailer) {
      onSaveTrailerCheck(entry.id, { ...Object.fromEntries(TRAILER_FIELDS.map((k) => [k, form[k]])), result, issues, savedAt: Date.now() })
      return
    }
    // inspectedAt is the Inspection Date and Time entered (used for dock → inspected timing);
    // savedAt records when the form was actually saved.
    onSave(entry.id, { ...form, result, issues, inspectedAt: inspectionMs(form), savedAt: Date.now(), trailerCheckedAt: entry.trailerCheck?.savedAt })
  }

  return (
    <form onSubmit={submit} noValidate>
      {/* Which truck this is; Change truck goes back up to the dock tiles. */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-page p-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-muted">{trailer ? 'Trailer check before loading' : 'Inspecting the load'}</div>
          <div className="font-display text-[18px] leading-tight font-semibold">
            Dock {entry.dockDoor} · Trailer {entry.trailerNumber} · {entry.truckName}
          </div>
          <div className="text-[15px] text-muted">
            {[entry.pickupNumber && `Order No ${entry.pickupNumber}`, entry.customerPickupFor && `For ${entry.customerPickupFor}`, entry.truckerNameIn]
              .filter(Boolean)
              .join(' · ') || 'No order details entered at check-in'}
          </div>
        </div>
        {onChangeTruck && (
          <button type="button" onClick={onChangeTruck} className={ui.btnSmall + ' no-print'}>
            Change truck
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-5 @3xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* On narrow screens the status panel comes first, above the questions. */}
        <div className="@3xl:order-2">
          <StatusPanel entry={entry} issues={issues} answered={answered} total={required.length} now={now} />
        </div>

        <div className="min-w-0 @3xl:order-1">
          <ErrorSummary errors={errors} action="saving the inspection" summaryRef={summaryRef} labels={LABELS} />

          {!trailer && (
            <>
              {/* When the inspection took place; starts at today / now. */}
              <h3 className={sectionTitle + ' mb-2.5'}>Inspection</h3>
              <div className={grid}>
                {field({ name: 'inspectionDate', label: 'Inspection Date', type: 'date' })}
                {field({ name: 'inspectionTime', label: 'Inspection Time', type: 'time' })}
              </div>
            </>
          )}

          {showTrailer ? (
            <>
              <Section title="Trailer Condition" action={allYesButton(TRAILER_CHECKS)} />
              <div className={grid}>{TRAILER_CHECKS.map(check)}</div>
            </>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ok/30 bg-ok-soft px-4 py-3 text-[14px]">
              <span>
                <b className="text-ok">✓ Trailer check passed</b>
                {entry.trailerCheck?.savedAt && ` at ${hhmm(entry.trailerCheck.savedAt)}`}
                {entry.trailerCheck?.inspector && ` by ${entry.trailerCheck.inspector}`} · pre-cool {entry.trailerCheck?.precoolTemp}°F
              </span>
              <button type="button" onClick={() => setShowTrailer(true)} className="min-h-9 cursor-pointer font-semibold underline">
                Show trailer answers
              </button>
            </div>
          )}

          <Section title="Temperature" />
          <p className="mb-2.5 text-sm text-muted">
            {trailer ? `Empty trailer pre-cool ${LIMIT.precool}°F or below.` : `Frozen product: ${LIMIT.product}°F or below; trailer pre-cool ${LIMIT.precool}°F or below.`}
          </p>
          <div className={grid}>
            {showTrailer && field({ name: 'setPoint', label: 'Reefer Set Point °F', type: 'number', step: 0.1 })}
            {showTrailer && field({ name: 'precoolTemp', label: 'Trailer Pre-Cool Temp °F', type: 'number', step: 0.1, warning: tooWarm('precoolTemp', LIMIT.precool) })}
            {showTrailer && field({ name: 'reeferRunning', label: 'Reefer Running (Continuous)', type: 'choice', options: YES_NO, dangerOptions: ['No'] })}
            {!trailer && PRODUCT_TEMPS.map((t) => field({ ...t, type: 'number', step: 0.1, warning: tooWarm(t.name, LIMIT.product) }))}
          </div>

          {trailer ? (
            <>
              <Section title="Sign-Off" />
              <div className={grid}>{field({ name: 'inspector', label: 'Checked By' })}</div>
            </>
          ) : (
          <>
          <Section title="Load" action={allYesButton(LOAD_CHECKS)} />
          <div className={grid}>
            {field({ name: 'palletsLoaded', label: 'Pallets Loaded', type: 'number', min: 0 })}
            {field({ name: 'caseCount', label: 'Case Count', type: 'number', min: 0 })}
            {field({ name: 'totalWeight', label: 'Total Weight (lbs)', type: 'number', min: 0 })}
            {LOAD_CHECKS.map(check)}
            {timeField('loadStart', 'Loading Start')}
            {timeField('loadFinish', 'Loading Finish')}
          </div>

          <Section title="Seal and Sign-Off" />
          <div className={grid}>
            {field({ name: 'sealApplied', label: 'Seal # Applied' })}
            {field({ name: 'technician', label: 'Technician Name' })}
            {field({ name: 'inspector', label: 'Inspected By' })}
            {issues.length > 0 && field({ name: 'correctiveAction', label: 'Corrective Action', type: 'textarea', wide: true })}
            {field({ name: 'notes', label: 'Notes', type: 'textarea', wide: true })}
          </div>
          </>
          )}
        </div>
      </div>

      {/* Pinned to the bottom of the screen while the form scrolls, like the Gate form. */}
      <div className="no-print sticky bottom-0 z-10 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-3 rounded-b-[10px] border-t border-line bg-panel p-4 shadow-[0_-6px_16px_rgb(0_0_0/0.08)] sm:p-5">
        {touched && <span className="mr-auto self-center text-[13px] text-muted">Draft saved on this device</span>}
        <button type="button" onClick={onCancel} className={ui.btn}>
          {touched ? 'Close · keep draft' : 'Cancel'}
        </button>
        <button type="submit" className={ui.btnPrimary}>
          {trailer ? (issues.length ? 'Save · trailer not OK' : 'Trailer OK · save') : entry.loadingInspection ? 'Update Inspection' : 'Save Inspection'}
        </button>
      </div>
    </form>
  )
}

// Inspection panel shown under At the Docks: select a dock tile and press Inspect to open the form.
// `selected`: { id, part } of the checklist open ('trailer' or 'load'), or null.
export default function LoadingInspection({ atDock, selected, onSelect, onSave, onSaveTrailerCheck, inspector }) {
  const entry = atDock.find((e) => e.id === selected?.id)
  const changeTruck = () => document.getElementById('at-the-docks')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <section id="loading-inspection" className="scroll-mt-[calc(var(--header-h,114px)+16px)] rounded-xl bg-panel shadow-card p-5">
      <h2 className="font-display text-[20px] leading-tight font-semibold">{selected?.part === 'trailer' ? 'Trailer Check' : 'Loading Inspection'}</h2>
      {entry ? (
        <div className="mt-4">
          <InspectionForm
            key={`${entry.id}:${selected.part}`}
            entry={entry}
            part={selected.part}
            inspector={inspector}
            onSave={onSave}
            onSaveTrailerCheck={onSaveTrailerCheck}
            onCancel={() => onSelect(null)}
            onChangeTruck={changeTruck}
          />
        </div>
      ) : (
        <p className="mt-2 text-muted">
          {atDock.length
            ? 'Pick a truck’s next step under At the Docks: check the empty trailer, time the loading, then inspect the load.'
            : 'No trucks at a dock. Assign a dock on the Shipping tab, then inspect the truck here.'}
        </p>
      )}
    </section>
  )
}
