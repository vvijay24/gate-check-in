// Logic shared by the Gate's Check In and Check Out pages: starting values, validation and field
// names for the error list. The fields and required rules themselves live in formConfig.js.
import { EMPTY_FORM, FIELD_NAMES, REEFER_ONLY, REQUIRED_IN, REQUIRED_OUT, isRequired } from './formConfig'

const pad = (n) => String(n).padStart(2, '0')
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const nowTime = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// "14:45" → "2:45 PM"
export const timeLabel = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

// "2026-11-04" → "Today", "Yesterday" or "Nov 2"
export const dayLabel = (key) => {
  if (!key) return ''
  if (key === today()) return 'Today'
  const d = new Date(`${key}T00:00`)
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// A new check-in: arrived now, through Gate 1.
export const freshCheckIn = () => ({ ...EMPTY_FORM, dateIn: today(), timeIn: nowTime() })

// Starting values when checking a truck out: now, Gate 2, the same driver unless the trailer is being
// dropped (a different truck usually collects it), and the seal the truck was released with.
export const checkOutStart = (entry) =>
  entry.timeOut
    ? entry
    : {
        ...entry,
        dateOut: entry.dateOut || today(),
        timeOut: nowTime(),
        gateOut: entry.gateOut || 'Gate 2',
        truckerNameOut: entry.truckerNameOut || (entry.visitPurpose?.includes('Drop Trailer') ? '' : entry.truckerNameIn),
        driverPhoneOut: entry.driverPhoneOut || (entry.visitPurpose?.includes('Drop Trailer') ? '' : entry.driverPhone),
        outgoingSeals: entry.outgoingSeals || entry.release?.seal || '',
      }

// Required fields left empty (and other problems), by field name.
export function validate(form, mode) {
  const errors = {}
  const required = mode === 'out' ? REQUIRED_OUT : REQUIRED_IN
  for (const key of required.filter((k) => isRequired(k, form, mode))) {
    const value = form[key]
    const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim()
    if (empty) errors[key] = 'Required'
  }
  if (errors.visitPurpose) errors.visitPurpose = 'Select at least one purpose'
  if (errors.guardOnDuty) errors.guardOnDuty = 'Set the guard on duty at the top of the page'
  if (errors.guardOut) errors.guardOut = 'Set the guard on duty at the top of the page'
  if (mode === 'out' && form.dateIn && form.dateOut && form.timeIn && form.timeOut) {
    if (`${form.dateOut}T${form.timeOut}` < `${form.dateIn}T${form.timeIn}`) errors.timeOut = 'Out must be after in'
  }
  return errors
}

// A dry van shouldn't keep reefer readings typed before the answer changed to No.
export const cleanForSave = (form) => (form.reefer === 'Yes' ? form : { ...form, ...Object.fromEntries(REEFER_ONLY.map((k) => [k, ''])) })

// Names for the error list, by field name.
export const FIELD_LABELS = {
  ...FIELD_NAMES,
  dateIn: 'Date In',
  timeIn: 'Time In',
  gateIn: 'Gate In',
  dateOut: 'Date Out',
  timeOut: 'Time Out',
  gateOut: 'Gate Out',
  visitPurpose: 'Purpose of Visit',
  odometerPhoto: 'Odometer photo',
  guardOnDuty: 'Guard on duty',
  guardOut: 'Guard on duty',
  sealConfirmed: 'Seal matches',
  sealNote: 'Seal found on the trailer',
}
