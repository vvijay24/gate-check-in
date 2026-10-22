import { useState } from 'react'
import Field from './Field'
import OdometerPhoto from './OdometerPhoto'
import { EMPTY_FORM, REEFER_ONLY, REQUIRED_IN, SECTIONS, VISIT_PURPOSES, isRequired, isShown } from '../formConfig'
import * as ui from '../ui'

const pad = (n) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const nowTime = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function validate(form) {
  const errors = {}
  for (const key of REQUIRED_IN.filter((k) => isRequired(k, form))) {
    const value = form[key]
    const empty = Array.isArray(value) ? value.length === 0 : !String(value).trim()
    if (empty) errors[key] = 'Required'
  }
  if (errors.visitPurpose) errors.visitPurpose = 'Select at least one purpose'
  if (errors.odometerPhoto) errors.odometerPhoto = 'Take or upload a photo of the odometer'
  // Checking out: both time and date out are needed together.
  if (form.timeOut && !form.dateOut) errors.dateOut = 'Enter date out'
  if (form.dateOut && !form.timeOut) errors.timeOut = 'Enter time out'
  if (form.dateIn && form.dateOut && form.timeIn && form.timeOut) {
    if (`${form.dateOut}T${form.timeOut}` < `${form.dateIn}T${form.timeIn}`) {
      errors.timeOut = 'Out must be after in'
    }
  }
  return errors
}

function HeaderInput({ label, name, type, value, onChange, onNow, error, required }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* Now sits beside the label so the input keeps the same width as every other field. */}
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={`field-${name}`} className={ui.label}>
          {label}
          {required && <span className={ui.required}>*</span>}
        </label>
        {onNow && (
          <button type="button" onClick={onNow} className="no-print cursor-pointer text-[15px] font-semibold underline">
            Now
          </button>
        )}
      </div>
      <input
        id={`field-${name}`}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        className={ui.input + (error ? ui.inputError : '')}
      />
      {error && <p className={ui.errorText + ' mt-1'}>{error}</p>}
    </div>
  )
}

// The guard's name carries over so they only type it once per shift.
const freshForm = (guardOnDuty = '') => ({ ...EMPTY_FORM, guardOnDuty, dateIn: today(), timeIn: nowTime() })

// Section heading and field grid, matching guard-shack-log.html (h3 + .grid).
const sectionTitle =
  'mt-6 mb-2.5 border-t border-line pt-3.5 font-display text-[20px] leading-tight font-bold text-muted'
const firstSectionTitle = 'mb-2.5 font-display text-[20px] leading-tight font-bold text-muted'
// Fixed two columns (one on phones) so paired fields like name + phone stay side by side.
const grid = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2'

export default function GuardForm({ initial, defaultGuard, onSave, onCancel }) {
  const [form, setForm] = useState(() => initial ?? freshForm(defaultGuard))
  const [errors, setErrors] = useState({})
  const isEdit = Boolean(initial?.id)

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest)
  }
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.getElementById(`field-${Object.keys(errs)[0]}`)?.focus()
      return
    }
    // A dry van shouldn't keep reefer readings typed before the answer changed to No.
    onSave(form.reefer === 'Yes' ? form : { ...form, ...Object.fromEntries(REEFER_ONLY.map((k) => [k, ''])) })
    if (!isEdit) setForm(freshForm(form.guardOnDuty))
  }

  const handleClear = () => {
    setForm(initial ?? freshForm(form.guardOnDuty))
    setErrors({})
  }

  const header = (props) => (
    <HeaderInput {...props} value={form[props.name]} onChange={handleChange} error={errors[props.name]} required={isRequired(props.name, form)} />
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="overflow-hidden rounded-[10px] border border-line bg-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 pt-5 pb-3">
        <h2 className="font-display text-[26px] leading-tight font-bold">{isEdit ? 'Update Load Entry' : 'Check a Trailer In'}</h2>
        <span className="text-sm text-muted">
          <span className="text-danger">*</span> required to log arrival
        </span>
      </div>

      <div className="p-5">
        <section>
          <h3 className={firstSectionTitle}>Time In / Out</h3>
          {/* Fixed two columns so each date stays beside its time at every width. */}
          <div className="grid grid-cols-2 gap-3.5">
            {header({ label: 'Date In', name: 'dateIn', type: 'date', onNow: () => set({ dateIn: today() }) })}
            {header({ label: 'Time In', name: 'timeIn', type: 'time', onNow: () => set({ timeIn: nowTime() }) })}
            {header({ label: 'Date Out', name: 'dateOut', type: 'date', onNow: () => set({ dateOut: today() }) })}
            {header({
              label: 'Time Out',
              name: 'timeOut',
              type: 'time',
              onNow: () => set({ timeOut: nowTime(), dateOut: form.dateOut || today() }),
            })}
          </div>
        </section>

        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h3 className={sectionTitle}>{section.title}</h3>
            {section.purpose && (
              <fieldset className="mb-3.5">
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
                {errors.visitPurpose && <p className={ui.errorText + ' mt-1'}>{errors.visitPurpose}</p>}
              </fieldset>
            )}
            <div className={grid}>
              {section.fields.filter((f) => isShown(f.name, form)).map((f) => (
                <Field
                  key={f.name}
                  {...f}
                  value={form[f.name]}
                  onChange={handleChange}
                  required={isRequired(f.name, form)}
                  error={errors[f.name]}
                />
              ))}
            </div>
            {section.odometer && (
              <div className="mt-3.5">
                <OdometerPhoto
                  value={form.odometerPhoto}
                  onChange={(odometerPhoto) => {
                    set({ odometerPhoto })
                    if (odometerPhoto && errors.odometerPhoto) setErrors(({ odometerPhoto: _, ...rest }) => rest)
                  }}
                  required={isRequired('odometerPhoto', form)}
                  error={errors.odometerPhoto}
                />
              </div>
            )}
          </section>
        ))}

        <div className={grid + ' mt-6 border-t border-line pt-3.5'}>
          {header({ label: 'Guard on Duty', name: 'guardOnDuty', type: 'text' })}
        </div>
      </div>

      <div className="no-print flex flex-wrap justify-end gap-3 border-t border-line p-5">
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
        <button type="submit" className={ui.btnPrimary}>
          {isEdit ? 'Save Changes' : 'Log Entry'}
        </button>
      </div>
    </form>
  )
}
