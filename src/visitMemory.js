// What the Gate remembers from earlier visits saved on this device, so guards confirm instead of
// retyping: a returning trailer's last carrier and driver, the name behind a known phone number, and
// recent carriers and customers to tap. Nothing is filled in without the guard choosing it.
import { arrivalMs } from './time'

const trailerKey = (s) => String(s ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
const phoneKey = (s) => String(s ?? '').replace(/\D/g, '')

// Up to `n` distinct values of `field`, most recent visit first (case and spaces ignored).
function recent(list, field, n) {
  const seen = new Set()
  const out = []
  for (const e of list) {
    const value = String(e[field] ?? '').trim()
    const key = value.toLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    out.push(value)
    if (out.length === n) break
  }
  return out
}

// `excludeId`: the visit being edited, so it doesn't match itself.
export function visitMemory(entries, excludeId) {
  const time = (e) => (Number.isFinite(arrivalMs(e)) ? arrivalMs(e) : (e.createdAt ?? 0))
  const list = entries.filter((e) => e.id !== excludeId).sort((a, b) => time(b) - time(a))
  const byTrailer = new Map()
  const byPhone = new Map()
  for (const e of list) {
    const t = trailerKey(e.trailerNumber)
    if (t && !byTrailer.has(t)) byTrailer.set(t, e)
    const p = phoneKey(e.driverPhone)
    if (p.length >= 7 && e.truckerNameIn && !byPhone.has(p)) byPhone.set(p, e.truckerNameIn)
  }
  return {
    // The last visit of this trailer, or undefined. Needs at least 3 characters to match.
    lastVisit: (trailer) => (trailerKey(trailer).length >= 3 ? byTrailer.get(trailerKey(trailer)) : undefined),
    // The driver's name last seen with this phone number, or undefined.
    nameForPhone: (phone) => byPhone.get(phoneKey(phone)),
    carriers: recent(list, 'truckName', 6),
    customers: recent(list, 'customerPickupFor', 5),
  }
}
