// Turns the app's saved visits into the rows the kit's metrics.js expects (METRICS.md), so every
// Overview number comes from computeVisitMetrics / computeSummary / computeStages / computeImpact.
import { arrivalMs, departureMs, dayKey } from '../time'
import { checkedInAt, inspectionSavedAt } from '../stages'

const MIN = 60000
const pad = (n) => String(n).padStart(2, '0')
const hhmm = (ms) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The kit has one visit type per truck; a visit with several purposes ticked counts as the first one.
const TYPE = { Delivery: 'Delivery', Pickup: 'Pickup', 'Drop Trailer': 'Drop trailer' }
export const visitType = (e) => TYPE[(e.visitPurpose ?? [])[0]] ?? 'Delivery'

// When the truck left: the saved check-out time, or the typed Time Out for older entries.
const checkedOutAt = (e) => e.checkedOutAt ?? (e.timeOut ? departureMs(e) : NaN)

// Each handoff's timestamp (METRICS.md "Data each truck visit needs").
function stamps(e) {
  return {
    arrived: arrivalMs(e),
    checkedIn: checkedInAt(e),
    dockAssigned: e.dockAssignedAt ?? NaN,
    loadStart: e.loadStartedAt ?? NaN,
    loadEnd: e.loadFinishedAt ?? NaN,
    inspectionDone: inspectionSavedAt(e) ?? NaN,
    checkedOut: checkedOutAt(e),
  }
}

// Minutes between two timestamps, or null if either is missing or they're out of order.
const gap = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round(((b - a) / MIN) * 10) / 10 : null)

// The common fields of a kit row.
function base(e) {
  const arrived = arrivalMs(e)
  return {
    visit_id: e.id,
    day: e.dateIn,
    visit_type: visitType(e),
    carrier: e.truckName || '—',
    // Older visits without an appointment count as on time.
    appt: e.appointmentTime || hhmm(arrived),
    arrived: hhmm(arrived),
    door: e.dockDoor || '',
    trailer: e.trailerNumber || '—',
  }
}

// A fully timed visit as a kit row, or null when it's a dropped trailer (no dock stages in this app) or
// any of the seven timestamps is missing.
export function toTimedRow(e) {
  if (visitType(e) === 'Drop trailer' || !e.timeOut) return null
  const s = stamps(e)
  const mins = {
    gate_in_min: gap(s.arrived, s.checkedIn),
    dock_assign_min: gap(s.checkedIn, s.dockAssigned),
    preload_min: gap(s.dockAssigned, s.loadStart),
    load_min: gap(s.loadStart, s.loadEnd),
    inspection_min: gap(s.loadEnd, s.inspectionDone),
    checkout_min: gap(s.inspectionDone, s.checkedOut),
  }
  if (Object.values(mins).some((v) => v == null)) return null
  return { ...base(e), ...mins }
}

// Every visit as a kit row for counting (trucks handled, visit types, arrivals). Stage minutes are 0,
// so only the counts from these rows are used, never their times.
export const toCountRow = (e) => ({ ...base(e), gate_in_min: 0, dock_assign_min: 0, preload_min: 0, load_min: 0, inspection_min: 0, checkout_min: 0 })

// Visits checked in from `from` to `to` ("YYYY-MM-DD", inclusive): all of them for counts, and the fully
// timed ones for times.
export function visitsInRange(entries, from, to) {
  const all = entries.filter((e) => e.dateIn >= from && e.dateIn <= to && Number.isFinite(arrivalMs(e)))
  const timed = all.map(toTimedRow).filter(Boolean)
  return { all, countRows: all.map(toCountRow), timedRows: timed, drops: all.filter((e) => visitType(e) === 'Drop trailer').length }
}

export const todayKey = () => dayKey(new Date())

// Manual-week rows: the kit's format, plus phone_calls, paper_handoffs and yard_search_min. Accepts
// the kit's JSON array, or CSV with those column names in a header row.
export const MANUAL_FIELDS = [
  'visit_id', 'day', 'visit_type', 'carrier', 'appt', 'arrived',
  'gate_in_min', 'dock_assign_min', 'preload_min', 'load_min', 'inspection_min', 'checkout_min',
  'phone_calls', 'paper_handoffs', 'yard_search_min',
]
const NUMERIC = MANUAL_FIELDS.slice(6)

export function parseManualWeek(text) {
  const trimmed = text.trim()
  let rows
  if (trimmed.startsWith('[')) rows = JSON.parse(trimmed)
  else {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim())
    const head = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    rows = lines.slice(1).map((l) => {
      const cells = l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      return Object.fromEntries(head.map((h, i) => [h, cells[i]]))
    })
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error('No rows found in the file.')
  const missing = MANUAL_FIELDS.filter((f) => !(f in rows[0]))
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`)
  const bad = rows.findIndex((r) => NUMERIC.some((f) => !Number.isFinite(Number(r[f]))) || !/^\d{1,2}:\d{2}$/.test(r.appt) || !/^\d{1,2}:\d{2}$/.test(r.arrived))
  if (bad >= 0) throw new Error(`Row ${bad + 2} has a missing or non-numeric value.`)
  return rows.map((r) => ({ ...r, ...Object.fromEntries(NUMERIC.map((f) => [f, Number(r[f])])) }))
}
