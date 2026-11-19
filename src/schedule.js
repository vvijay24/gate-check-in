// SAMPLE: today's booking schedule (the trucks Shipping expects, by appointment slot). Made up until the
// real schedule is imported, and only shown while sample visits are loaded; without them there are no
// bookings. Each booking: { id, ms, time 'HH:MM', orderNo, carrier, customer, type 'Pickup' | 'Drop Trailer',
// kind 'Fresh' | 'Frozen', pallets, staged, entryId }.
import { arrivalMs, clock12, dayKey, duration, EARLY_GRACE_MIN, LATE_GRACE_MIN } from './time'
import { CARRIERS, CUSTOMERS } from './sampleData'

const MIN = 60000
// A booked truck more than this many minutes past its slot counts as a no-show.
export const NO_SHOW_MIN = 120
// An order should be staged (at the dock) this many minutes before its truck's slot.
export const STAGE_BEFORE_MIN = 60
// The last slot of the day: 7:40 PM.
const LAST_SLOT = 19 * 60 + 40

const pad = (n) => String(n).padStart(2, '0')
const hhmm = (ms) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
// A small seeded generator (the one sampleData.js uses), so the same day and slot always give the same
// booking. It mixes well, so neighbouring slots' seeds don't give look-alike bookings.
function seeded(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// A stable number from a string, for things picked without random draws.
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

// Not sample: the bookings a day's check-ins carried (every truck that arrived with a booked time), as
// booking rows matched to their entry. Past days in Today's schedule show these.
export function bookingsFromEntries(entries, day) {
  return entries
    .filter((e) => e.dateIn === day && e.appointmentTime)
    .map((e) => ({
      id: `bk-${e.id}`,
      ms: new Date(`${day}T${e.appointmentTime}`).getTime(),
      time: e.appointmentTime,
      orderNo: e.pickupNumber || '—',
      carrier: e.truckName || '—',
      customer: e.customerPickupFor || '—',
      type: (e.visitPurpose ?? []).includes('Drop Trailer') ? 'Drop Trailer' : 'Pickup',
      kind: e.loadSheet?.kind ?? (hash(e.id) % 5 < 3 ? 'Fresh' : 'Frozen'),
      pallets: e.loadSheet?.pallets ?? 18 + (hash(e.id) % 8),
      staged: !!e.orderReadyAt,
      entryId: e.id,
    }))
    .sort((a, b) => a.ms - b.ms)
}

// SAMPLE
export function makeSampleSchedule(entries, now = Date.now()) {
  if (!entries.some((e) => e.sample)) return []
  const today = dayKey(new Date(now))
  const daySeed = Number(today.replaceAll('-', ''))
  const midnight = new Date(`${today}T00:00`).getTime()
  const todays = entries.filter((e) => e.dateIn === today)
  const arrivedOrders = new Set(todays.map((e) => e.pickupNumber).filter(Boolean))

  // Today's arrivals that had an appointment, matched by order no. No random draws here, so a new
  // check-in never reshuffles the other bookings.
  const arrived = bookingsFromEntries(todays, today)

  // A made-up booking for slot minute `m` of today, drawn from its own seed.
  const make = (m, orderNo, random) => {
    const pick = (list) => list[Math.floor(random() * list.length)]
    const type = random() < 0.8 ? 'Pickup' : 'Drop Trailer'
    const kind = random() < 0.6 ? 'Fresh' : 'Frozen'
    const ms = midnight + m * MIN
    return {
      id: `bk-${today}-${m}`,
      ms,
      time: hhmm(ms),
      orderNo,
      carrier: pick(CARRIERS),
      customer: pick(CUSTOMERS),
      type,
      kind,
      pallets: 18 + Math.floor(random() * 8),
      // Staged once its slot is within the hour, about 3 in 5 of the time.
      staged: ms - now <= STAGE_BEFORE_MIN * MIN && random() < 0.6,
      entryId: null,
    }
  }

  // Two trucks that should already be here: 40 and 150 minutes ago.
  const nowMin = Math.floor((now - midnight) / MIN)
  const overdue = [40, 150]
    .filter((ago) => nowMin - ago >= 0)
    .map((ago, i) => make(nowMin - ago, `SO-${51298 + i}`, seeded(daySeed * 7 + i + 1)))

  // Slots every 20 minutes from now until 7:40 PM, about 4 in 5 booked.
  const future = []
  for (let m = Math.ceil((nowMin + 1) / 20) * 20; m <= LAST_SLOT; m += 20) {
    const random = seeded(daySeed * 1440 + m)
    if (random() < 0.8) future.push(make(m, `SO-${51200 + ((m / 20) % 96)}`, random))
  }

  return [...arrived, ...[...overdue, ...future].filter((a) => !arrivedOrders.has(a.orderNo))].sort((a, b) => a.ms - b.ms)
}

// Where a booking stands. Arrived: 'late' / 'early' / 'onTime'. Not here yet: 'overdue' (past its slot by
// more than the grace; `noShow` once NO_SHOW_MIN has passed), 'due' (within the grace either side) or
// 'expected'. `label` is the plain words for it.
export function apptStatus(a, entry, now = Date.now()) {
  if (entry) {
    const diff = Math.round((arrivalMs(entry) - a.ms) / MIN)
    if (diff > LATE_GRACE_MIN) return { key: 'late', label: `Arrived ${duration(diff * MIN)} late` }
    if (diff < -EARLY_GRACE_MIN) return { key: 'early', label: `Arrived ${duration(-diff * MIN)} early` }
    return { key: 'onTime', label: 'Arrived on time' }
  }
  const past = Math.round((now - a.ms) / MIN)
  if (past > NO_SHOW_MIN) return { key: 'overdue', noShow: true, label: `No-show, ${duration(past * MIN)} past the slot` }
  if (past > LATE_GRACE_MIN) return { key: 'overdue', label: `Not here, ${duration(past * MIN)} overdue` }
  if (past >= -LATE_GRACE_MIN) return { key: 'due', label: 'Due now' }
  return { key: 'expected', label: `Expected at ${clock12(a.time)}` }
}

// True when the truck isn't here yet, its slot is within STAGE_BEFORE_MIN and its order isn't staged.
export function needsStaging(a, entry, now = Date.now()) {
  if (entry || a.staged) return false
  const until = a.ms - now
  return until <= STAGE_BEFORE_MIN * MIN && until > -NO_SHOW_MIN * MIN
}

// SAMPLE: made-up (555) dispatch numbers. A customer pickup (carrier "Pickup") is reached through the
// customer; every other booking through its carrier's dispatch.
const customerPickup = (a) => a.carrier === 'Pickup'
export function phoneFor(a) {
  const h = hash(customerPickup(a) ? a.customer : a.carrier)
  return `(555) ${100 + (h % 900)}-${1000 + (Math.floor(h / 900) % 9000)}`
}
export function contactFor(a) {
  return customerPickup(a)
    ? { name: a.customer, role: 'Customer pickup', phone: phoneFor(a) }
    : { name: `${a.carrier} dispatch`, role: 'Carrier', phone: phoneFor(a) }
}
