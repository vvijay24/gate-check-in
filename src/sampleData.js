// Two weeks of made-up gate entries for trying out the dashboards. Each one is marked `sample: true`
// so it can be removed later without touching real entries. Same seed = same visits every time.
import { EMPTY_FORM } from './formConfig'
import { dayKey } from './time'
import { BAY_NAMES, DOCKS } from './yard'

const DAYS = 14
const CARRIERS = ['KLLM', 'Brannon Golden', 'Penske', 'Syfan', 'U S Citylink', 'Pickup']
const CUSTOMERS = ['US Foods', 'Vertical Cold', 'Decatur West', 'Green Valley', 'Gold Creek', 'Brakebush Bros','Pacific-Agri']
const DRIVERS = ['D. Brooks', 'L. Nguyen', 'C. Ramirez', 'T. Walker', 'A. Patel', 'K. Johnson', 'S. Miller', 'J. Lopez', 'M. Davis', 'R. Wilson']
const FUEL = ['1/4', '1/2', '3/4', 'Full']
// Shipping staff who release trucks to the gate.
const SHIPPERS = ['M. Ortiz', 'K. Chen', 'D. Patel']
// Check-ins by hour from 5 AM to 7 PM, busiest mid-morning.
const HOUR_WEIGHTS = [1, 2, 3, 4, 5, 5, 4, 4, 4, 4, 3, 3, 2, 1, 1]

function seeded(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n) => String(n).padStart(2, '0')
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const MIN = 60000

export function makeSampleEntries(now = Date.now()) {
  const random = seeded(20261027)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const between = (a, b) => a + random() * (b - a)
  const guardAt = (ms) => (new Date(ms).getHours() >= 14 ? 'R. Singh' : random() < 0.55 ? 'M. Alvarez' : 'J. Carter')
  const arrivalMinute = () => {
    let r = random() * HOUR_WEIGHTS.reduce((a, b) => a + b, 0)
    let h = 0
    while (r > HOUR_WEIGHTS[h]) r -= HOUR_WEIGHTS[h++]
    return (5 + h) * 60 + Math.floor(random() * 60)
  }

  const firstDay = new Date(now)
  firstDay.setHours(0, 0, 0, 0)
  firstDay.setDate(firstDay.getDate() - (DAYS - 1))

  const entries = []
  const doorFree = DOCKS.map(() => 0)
  const bayFree = BAY_NAMES.map(() => 0)
  let n = 0
  for (let d = 0; d < DAYS; d++) {
    const dayStart = new Date(firstDay)
    dayStart.setDate(dayStart.getDate() + d)
    const times = Array.from({ length: 26 + Math.floor(random() * 8) }, arrivalMinute).sort((a, b) => a - b)

    for (const minute of times) {
      const arrive = dayStart.getTime() + minute * MIN
      if (arrive > now) continue
      const r = random()
      const purpose = r < 0.4 ? 'Delivery' : r < 0.85 ? 'Pickup' : 'Drop Trailer'
      const carrier = pick(CARRIERS)
      const reefer = random() < 0.6
      const arrival = new Date(arrive)
      const e = {
        ...EMPTY_FORM,
        id: `sample-${++n}`,
        sample: true,
        createdAt: arrive,
        dateIn: dayKey(arrival),
        timeIn: hhmm(arrival),
        gateIn: 'Gate 1',
        visitPurpose: [purpose],
        truckName: carrier,
        trailerNumber: random() < 0.7 ? String(10000 + Math.floor(random() * 89999)) : `${carrier.replace(/[^A-Z]/g, '').slice(0, 2)}-${1000 + Math.floor(random() * 8999)}`,
        truckerNameIn: pick(DRIVERS),
        driverPhone: `555-${100 + Math.floor(random() * 899)}-${1000 + Math.floor(random() * 8999)}`,
        guardOnDuty: guardAt(arrive),
        incomingSeals: String(400000 + Math.floor(random() * 99999)),
        sealIntact: 'Yes',
        reefer: reefer ? 'Yes' : 'No',
        tempSet: reefer ? '34' : '',
        tempActual: reefer ? (34 + between(-1.5, 1.5)).toFixed(1) : '',
        fuelIn: reefer ? pick(FUEL) : '',
      }
      if (purpose === 'Pickup') {
        const appt = Math.round((minute + between(-40, 25)) / 15) * 15
        e.appointmentTime = `${pad(Math.floor(appt / 60))}:${pad(appt % 60)}`
        e.pickupNumber = `SO-${50000 + n}`
        e.customerPickupFor = pick(CUSTOMERS)
      }

      let depart
      // When the visit stops needing a staging bay: docked, or (for a drop) collected.
      let leavesBay
      if (purpose === 'Drop Trailer') {
        // Most dropped trailers are collected within a day; a few sit long enough to go stale.
        depart = arrive + Math.round((random() < 0.06 ? between(26, 52) : between(1, 8)) * 60) * MIN
        leavesBay = depart
      } else {
        // Trucks queue for the door that frees up first, then load or unload.
        let door = 0
        DOCKS.forEach((_, i) => {
          if (doorFree[i] < doorFree[door]) door = i
        })
        const dockAt = Math.max(arrive + between(4, 30) * MIN, doorFree[door])
        const dwell = (purpose === 'Pickup' ? between(50, 135) : between(35, 85)) * MIN
        depart = Math.round(dockAt + dwell + between(4, 12) * MIN)
        doorFree[door] = depart
        leavesBay = dockAt
        if (dockAt <= now) {
          e.dockDoor = DOCKS[door]
          e.dockAssignedAt = Math.round(dockAt)
        }
        // Everything at a dock is inspected; Shipping then releases it to the gate partway through
        // the time left before it departs.
        const inspectedAt = Math.round(dockAt + dwell * 0.75)
        if (inspectedAt <= now) {
          e.loadingInspection = {
            result: 'Pass',
            issues: [],
            inspectedAt,
            palletsLoaded: String(18 + Math.floor(random() * 8)),
            inspector: guardAt(inspectedAt),
            sealApplied: String(700000 + Math.floor(random() * 99999)),
          }
          const releasedAt = Math.round(inspectedAt + (depart - inspectedAt) * (0.35 + random() * 0.4))
          if (releasedAt <= now) {
            e.release = {
              releasedAt,
              releasedBy: pick(SHIPPERS),
              paperwork: true,
              orderNo: e.pickupNumber ?? '',
              seal: e.loadingInspection.sealApplied,
              note: '',
            }
          }
        }
      }

      // The guard picks the first bay free on arrival; with every bay full, none.
      const bay = bayFree.findIndex((free) => free <= arrive)
      if (bay >= 0) {
        e.waitingLocation = BAY_NAMES[bay]
        bayFree[bay] = leavesBay
      }

      if (depart <= now) {
        const out = new Date(depart)
        Object.assign(e, {
          dateOut: dayKey(out),
          timeOut: hhmm(out),
          gateOut: 'Gate 2',
          guardOut: guardAt(depart),
          truckerNameOut: purpose === 'Drop Trailer' ? pick(DRIVERS) : e.truckerNameIn,
          outgoingSeals: e.loadingInspection?.sealApplied ?? '',
          fuelOut: reefer ? pick(FUEL) : '',
        })
      }
      entries.push(e)
    }
  }
  // Newest first, like the log.
  return entries.reverse()
}
