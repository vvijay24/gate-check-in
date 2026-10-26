import { useState } from 'react'
import Field from './Field'
import * as ui from '../ui'

// Pre-loading inspection for outbound poultry. Limits are typical cold-chain figures;
// confirm them against the plant's HACCP plan.
const LIMITS = {
  Fresh: { product: 40, precool: 40 },
  'Further Processed': { product: 40, precool: 40 },
  Frozen: { product: 0, precool: 10 },
}

const YES_NO = ['Yes', 'No']

// Checks that must be answered Yes for the load to pass.
const TRAILER_CHECKS = [
  { name: 'trailerClean', label: 'Trailer clean and free of debris' },
  { name: 'odorFree', label: 'Free of odors' },
  { name: 'noPests', label: 'No signs of pests' },
  { name: 'structureIntact', label: 'Walls, floor and ceiling intact' },
  { name: 'doorsSeal', label: 'Doors and seals close properly' },
  { name: 'noChemicals', label: 'No chemicals or non-food items' },
]
const LOAD_CHECKS = [
  { name: 'palletsGood', label: 'Pallets in good condition' },
  { name: 'packagingIntact', label: 'Packaging and labels intact' },
  { name: 'loadSecured', label: 'Load secured (load locks / straps)' },
]
const PRODUCT_TEMPS = [
  { name: 'tempFront', label: 'Product Temp Front °F' },
  { name: 'tempMiddle', label: 'Product Temp Middle °F' },
  { name: 'tempRear', label: 'Product Temp Rear °F' },
]

// Required fields, in on-screen order so the first error gets focus.
const REQUIRED = [
  'productType',
  'lotCodes',
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

const pad = (n) => String(n).padStart(2, '0')
const nowTime = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const blank = (entry) => ({
  productType: '',
  lotCodes: '',
  bolNumber: '',
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
})

// Everything that makes the load fail, as readable lines.
export function inspectionIssues(f) {
  const issues = []
  for (const c of [...TRAILER_CHECKS, ...LOAD_CHECKS]) if (f[c.name] === 'No') issues.push(`${c.label}: No`)
  if (f.reeferRunning === 'No') issues.push('Reefer not running in continuous mode')
  const limit = LIMITS[f.productType]
  if (limit) {
    for (const t of PRODUCT_TEMPS) {
      const v = f[t.name]
      if (v !== '' && Number(v) > limit.product) issues.push(`${t.label.replace(' °F', '')} ${v}°F is above ${limit.product}°F`)
    }
    if (f.precoolTemp !== '' && Number(f.precoolTemp) > limit.precool) {
      issues.push(`Trailer pre-cool ${f.precoolTemp}°F is above ${limit.precool}°F`)
    }
  }
  return issues
}

function validate(f, issues) {
  const errors = {}
  for (const key of REQUIRED) if (!String(f[key] ?? '').trim()) errors[key] = 'Required'
  if (f.loadStart && f.loadFinish && f.loadFinish < f.loadStart) errors.loadFinish = 'Finish must be after start'
  if (issues.length && !f.correctiveAction.trim()) errors.correctiveAction = 'Describe the corrective action for this failed inspection'
  return errors
}

const sectionTitle = 'mt-6 mb-2.5 border-t border-line pt-3.5 font-display text-[20px] leading-tight font-bold text-muted'
const grid = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3'

function InspectionForm({ entry, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({ ...blank(entry), ...(entry.loadingInspection ?? {}) }))
  const [errors, setErrors] = useState({})
  const issues = inspectionIssues(form)
  const result = issues.length ? 'Fail' : 'Pass'
  const complete = REQUIRED.every((k) => String(form[k] ?? '').trim())

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest)
  }

  const field = (props) => (
    <Field
      key={props.name}
      {...props}
      value={form[props.name] ?? ''}
      onChange={handleChange}
      required={REQUIRED.includes(props.name) || (props.name === 'correctiveAction' && issues.length > 0)}
      error={errors[props.name]}
    />
  )

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
    const errs = validate(form, issues)
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.getElementById(`field-${Object.keys(errs)[0]}`)?.focus()
      return
    }
    onSave(entry.id, { ...form, result, issues, inspectedAt: Date.now() })
  }

  const limit = LIMITS[form.productType]

  return (
    <form onSubmit={submit} noValidate>
      <div className="rounded-lg bg-page p-4">
        <div className="font-display text-[23px] leading-tight font-bold">
          Dock {entry.dockDoor} · {entry.trailerNumber} · {entry.truckName}
        </div>
        <div className="text-[15px] text-muted">
          {[entry.pickupNumber && `Order No ${entry.pickupNumber}`, entry.customerPickupFor && `For ${entry.customerPickupFor}`, entry.truckerNameIn]
            .filter(Boolean)
            .join(' · ') || 'No order details entered at check-in'}
        </div>
      </div>

      <h3 className={sectionTitle}>Shipment</h3>
      <div className={grid}>
        {field({ name: 'productType', label: 'Product Type', type: 'choice', options: Object.keys(LIMITS), wide: true })}
        {field({ name: 'lotCodes', label: 'Lot / Production Codes' })}
        {field({ name: 'bolNumber', label: 'BOL #' })}
      </div>

      <h3 className={sectionTitle}>Trailer Condition</h3>
      <div className={grid}>{TRAILER_CHECKS.map((c) => field({ ...c, type: 'choice', options: YES_NO }))}</div>

      <h3 className={sectionTitle}>Temperature</h3>
      {limit && (
        <p className="mb-2.5 text-sm text-muted">
          {form.productType}: product must be {limit.product}°F or below; trailer pre-cool {limit.precool}°F or below.
        </p>
      )}
      <div className={grid}>
        {field({ name: 'setPoint', label: 'Reefer Set Point °F', type: 'number', step: 0.1 })}
        {field({ name: 'precoolTemp', label: 'Trailer Pre-Cool Temp °F', type: 'number', step: 0.1 })}
        {field({ name: 'reeferRunning', label: 'Reefer Running (Continuous)', type: 'choice', options: YES_NO })}
        {PRODUCT_TEMPS.map((t) => field({ ...t, type: 'number', step: 0.1 }))}
      </div>

      <h3 className={sectionTitle}>Load</h3>
      <div className={grid}>
        {field({ name: 'palletsLoaded', label: 'Pallets Loaded', type: 'number', min: 0 })}
        {field({ name: 'caseCount', label: 'Case Count', type: 'number', min: 0 })}
        {field({ name: 'totalWeight', label: 'Total Weight (lbs)', type: 'number', min: 0 })}
        {LOAD_CHECKS.map((c) => field({ ...c, type: 'choice', options: YES_NO }))}
        {timeField('loadStart', 'Loading Start')}
        {timeField('loadFinish', 'Loading Finish')}
      </div>

      <h3 className={sectionTitle}>Seal and Sign-Off</h3>
      <div
        role="status"
        className={'mb-3.5 rounded-lg border-l-[6px] px-4 py-3 ' + (issues.length ? 'border-danger bg-danger-soft' : 'border-ok bg-ok-soft')}
      >
        <div className={'font-display text-[22px] font-bold ' + (issues.length ? 'text-danger' : 'text-ok')}>
          {issues.length ? '⚠ Result: Fail' : complete ? '✓ Result: Pass' : 'Result: Pass so far'}
        </div>
        {issues.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-[15px] text-danger">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        ) : (
          !complete && <p className="text-sm text-muted">Fill in every required field to complete the inspection.</p>
        )}
      </div>
      <div className={grid}>
        {field({ name: 'sealApplied', label: 'Seal # Applied' })}
        {field({ name: 'technician', label: 'Technician Name' })}
        {field({ name: 'inspector', label: 'Inspected By' })}
        {field({ name: 'correctiveAction', label: 'Corrective Action', type: 'textarea', wide: true })}
        {field({ name: 'notes', label: 'Notes', type: 'textarea', wide: true })}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className={ui.btn}>
          Cancel
        </button>
        <button type="submit" className={ui.btnPrimary}>
          {entry.loadingInspection ? 'Update Inspection' : 'Save Inspection'}
        </button>
      </div>
    </form>
  )
}

// Inspection panel shown under At the Docks: pick a truck at a dock, then fill in its inspection.
export default function LoadingInspection({ atDock, selectedId, onSelect, onSave }) {
  const entry = atDock.find((e) => e.id === selectedId)

  return (
    <section id="loading-inspection" className="rounded-[10px] border border-line bg-panel p-5">
      <h2 className="font-display text-[26px] leading-tight font-bold">Loading Inspection</h2>
      <div className="mt-3 max-w-md">
        <label htmlFor="inspection-truck" className={ui.label + ' mb-1'}>
          Truck at a dock
        </label>
        <select
          id="inspection-truck"
          value={entry ? entry.id : ''}
          onChange={(ev) => onSelect(ev.target.value || null)}
          disabled={!atDock.length}
          className={ui.input}
        >
          <option value="">{atDock.length ? 'Select a truck to inspect' : 'No trucks at a dock'}</option>
          {atDock.map((e) => (
            <option key={e.id} value={e.id}>
              Dock {e.dockDoor} · {e.trailerNumber} · {e.truckName}
              {e.loadingInspection ? ` (${e.loadingInspection.result})` : ''}
            </option>
          ))}
        </select>
      </div>

      {entry ? (
        <div className="mt-4">
          <InspectionForm key={entry.id} entry={entry} onSave={onSave} onCancel={() => onSelect(null)} />
        </div>
      ) : (
        <p className="mt-3 text-muted">Choose a truck at a dock, or tap Inspect on its card above, to start the loading inspection.</p>
      )}
    </section>
  )
}
