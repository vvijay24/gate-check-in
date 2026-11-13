// A month of made-up gate entries for trying out the dashboards. Each one is marked `sample: true`
// so it can be removed later without touching real entries. Same seed = same visits every time.
// The plant only loads outbound: about 4 in 5 visits are pickups (the driver waits), the rest drop an empty
// trailer that is loaded and released to the yard, then hooked by a driver later. Every visit waits for
// Shipping to mark its order ready before it gets a dock; now and then an order runs late.
// Weekends are quieter, dock waits and dock time shrink over the month (the team getting used to
// going digital), and now and then something goes wrong: a late or early truck, a broken seal, a
// reefer off temperature, a failed trailer check or load inspection that has to be re-checked.
import { EMPTY_FORM, GATE } from './formConfig'
import { dayKey } from './time'
import { DOCKS } from './yard'
import { CHECK_NAMES, LOAD_CHECKS, TRAILER_CHECKS } from './inspectionChecks'

const DAYS = 30
const CARRIERS = ['KLLM', 'Brannon Golden', 'Penske', 'Syfan', 'U S Citylink', 'Pickup']
const CUSTOMERS = ['US Foods', 'Vertical Cold', 'Decatur West', 'Green Valley', 'Gold Creek', 'Brakebush Bros','Pacific-Agri']
const DRIVERS = ['D. Brooks', 'L. Nguyen', 'C. Ramirez', 'T. Walker', 'A. Patel', 'K. Johnson', 'S. Miller', 'J. Lopez', 'M. Davis', 'R. Wilson']
const FUEL = ['1/4', '1/2', '3/4', 'Full']
// Check-ins by hour from 5 AM to 7 PM, busiest mid-morning.
const HOUR_WEIGHTS = [1, 2, 3, 4, 5, 5, 4, 4, 4, 4, 3, 3, 2, 1, 1]
// Trucks per day: [fewest, how many more at most], Sunday first.
const DAY_VOLUME = [[6, 5], [26, 8], [26, 8], [26, 8], [26, 8], [26, 8], [12, 5]]
// What a re-check fixed, by the check that failed.
const FIXES = {
  trailerClean: 'Swept and washed out, re-checked',
  odorFree: 'Aired out and washed, re-checked',
  palletsGood: 'Swapped the broken pallets, re-checked',
  packagingIntact: 'Re-wrapped the damaged cases, re-checked',
  loadSecured: 'Added load locks and straps, re-checked',
}

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
const TECHNICIANS = ['J. Ortiz', 'M. Chen', 'A. Patel', 'D. Brooks', 'L. Nguyen']

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
  let n = 0
  for (let d = 0; d < DAYS; d++) {
    const dayStart = new Date(firstDay)
    dayStart.setDate(dayStart.getDate() + d)
    const [fewest, more] = DAY_VOLUME[dayStart.getDay()]
    const times = Array.from({ length: fewest + Math.floor(random() * more) }, arrivalMinute).sort((a, b) => a - b)
    // 0 on the first day, 1 today: the wait for a dock starts ~60% longer and dock time ~25% longer.
    const progress = d / (DAYS - 1)
    const slowWait = 1.6 - 0.6 * progress
    const slowDock = 1.25 - 0.25 * progress

    for (const minute of times) {
      const arrive = dayStart.getTime() + minute * MIN
      if (arrive > now) continue
      const r = random()
      const purpose = r < 0.8 ? 'Pickup' : 'Drop Trailer'
      const drop = purpose === 'Drop Trailer'
      const carrier = pick(CARRIERS)
      const reefer = random() < 0.6
      const sealBroken = random() < 0.02
      // A reefer now and then arrives 4–7° off its set point.
      const tempOff = reefer && random() < 0.03 ? (random() < 0.5 ? -1 : 1) * between(4, 7) : 0
      const arrival = new Date(arrive)
      const e = {
        ...EMPTY_FORM,
        id: `sample-${++n}`,
        sample: true,
        // Most check-ins are saved within minutes; a few are typed in later from paper.
        createdAt: Math.min(now, arrive + Math.round((random() < 0.07 ? between(20, 150) : between(0, 4)) * MIN)),
        // An occasional check-in is corrected after saving.
        ...(random() < 0.04 && { edits: 1 }),
        dateIn: dayKey(arrival),
        timeIn: hhmm(arrival),
        gateIn: GATE,
        visitPurpose: [purpose],
        truckName: carrier,
        trailerNumber: random() < 0.7 ? String(10000 + Math.floor(random() * 89999)) : `${carrier.replace(/[^A-Z]/g, '').slice(0, 2)}-${1000 + Math.floor(random() * 8999)}`,
        truckerNameIn: pick(DRIVERS),
        driverPhone: `555-${100 + Math.floor(random() * 899)}-${1000 + Math.floor(random() * 8999)}`,
        guardOnDuty: guardAt(arrive),
        incomingSeals: String(400000 + Math.floor(random() * 99999)),
        sealIntact: sealBroken ? 'No' : 'Yes',
        reefer: reefer ? 'Yes' : 'No',
        tempSet: reefer ? '34' : '',
        tempActual: reefer ? (34 + (tempOff || between(-1.5, 1.5))).toFixed(1) : '',
        fuelIn: reefer ? pick(FUEL) : '',
        shipmentContents: sealBroken ? 'Seal broken on arrival · told Shipping' : tempOff ? 'Reefer off temp on arrival · told Shipping' : '',
      }
      // The guard started the check-in a few minutes before saving it (now and then it ran long). The
      // stage times vary with the visit number instead of new random draws, so the rest of the sample
      // stays the same.
      e.checkInStartedAt = e.createdAt - (3 + ((n * 7) % 5) + (n % 9 === 0 ? 4 : 0)) * MIN
      // Every visit is loaded for an order; only pickups (a driver waiting) have an appointment.
      e.pickupNumber = `SO-${50000 + n}`
      e.customerPickupFor = pick(CUSTOMERS)
      if (!drop) {
        // Most arrive around their appointment; about 1 in 20 is 45 min – 2 h late, a few come very early.
        const r2 = random()
        const offset = r2 < 0.05 ? -between(45, 120) : r2 < 0.08 ? between(45, 90) : between(-40, 25)
        const appt = Math.min(23 * 60 + 45, Math.max(0, Math.round((minute + offset) / 15) * 15))
        e.appointmentTime = `${pad(Math.floor(appt / 60))}:${pad(appt % 60)}`
      }

      let depart
      {
        // Now and then the empty trailer or the finished load fails its check and is fixed and re-checked,
        // which holds the dock 15–30 min longer. The app keeps only the latest check, so a visit that
        // already moved on shows the passing re-check (with what was done); one still waiting shows the fail.
        const trailerFail = random() < 0.02 && pick(['trailerClean', 'odorFree'])
        const loadFail = random() < 0.04 && pick(['palletsGood', 'packagingIntact', 'loadSecured'])
        const trailerDelay = trailerFail ? between(15, 30) * MIN : 0
        const recheckDelay = loadFail ? between(15, 30) * MIN : 0
        // Shipping marks the order ready (the product is staged): for a pickup usually within 15 min of
        // check-in, about 1 in 5 later; a dropped trailer's order can wait longer, as no driver is waiting.
        const orderWait = drop ? between(20, 180) : (random() < 0.2 ? between(16, 45) : between(0, 12)) * slowWait
        const orderReadyAt = Math.round(e.createdAt + orderWait * MIN)
        if (orderReadyAt <= now) Object.assign(e, { orderReadyAt, orderReadyBy: 'Shipping' })
        // Then it queues for the door that frees up first.
        let door = 0
        DOCKS.forEach((_, i) => {
          if (doorFree[i] < doorFree[door]) door = i
        })
        const dockAt = Math.max(orderReadyAt + between(3, 14) * slowWait * MIN, doorFree[door])
        const dwell = between(50, 125) * slowDock * MIN
        // A pickup leaves through the gate; a dropped trailer is released to the yard a few minutes after
        // it passes, which frees the dock, and is hooked by a driver hours later (now and then a day or two).
        const pickupDepart = Math.round(dockAt + trailerDelay + dwell + recheckDelay + between(4, 12) * MIN)
        if (dockAt <= now) {
          e.dockDoor = DOCKS[door]
          e.dockAssignedAt = Math.round(dockAt)
        }
        // Everything at a dock is inspected; the inspector then releases it partway through the time left.
        const firstInspectAt = Math.round(dockAt + trailerDelay + dwell * 0.75)
        const inspectedAt = Math.round(firstInspectAt + recheckDelay)
        const yardAt = Math.round(inspectedAt + between(4, 10) * MIN)
        depart = drop ? yardAt + Math.round((random() < 0.06 ? between(26, 52) : between(1, 8)) * 60) * MIN : pickupDepart
        doorFree[door] = drop ? yardAt : pickupDepart
        // Loading & Inspection's "Loading started / finished": a short pre-load, then loading, then the
        // inspection (each now and then running long).
        // The dock technician who checks and loads the trailer (picked without random() so the rest of the sample stays the same).
        const technician = TECHNICIANS[(n * 7) % TECHNICIANS.length]
        const firstTrailerAt = Math.round(dockAt + (2 + ((n * 5) % 9)) * MIN)
        const loadStartedAt = Math.round(firstTrailerAt + 2 * MIN + trailerDelay)
        const loadFinishedAt = Math.round(firstInspectAt - (9 + ((n * 3) % 9)) * MIN)
        if (loadFinishedAt > loadStartedAt + 5 * MIN) {
          // The empty trailer is checked just before loading starts (re-checked after a fail).
          const trailerAt = loadStartedAt - 2 * MIN
          const failedNow = trailerFail && trailerAt > now
          if (firstTrailerAt <= now) {
            const failed = TRAILER_CHECKS.find((c) => c.name === trailerFail)
            e.trailerCheck = {
              ...Object.fromEntries(TRAILER_CHECKS.map((c) => [c.name, 'Yes'])),
              ...(failedNow && { [trailerFail]: 'No' }),
              precoolTemp: String(-2 - (n % 6)),
              setPoint: e.tempSet || '-10',
              reeferRunning: 'Yes',
              technician,
              inspector: guardAt(failedNow ? firstTrailerAt : trailerAt),
              result: failedNow ? 'Fail' : 'Pass',
              issues: failedNow ? [`${failed.label}: No`] : [],
              ...(trailerFail && !failedNow && { correctiveAction: FIXES[trailerFail] }),
              savedAt: failedNow ? firstTrailerAt : trailerAt,
            }
          }
          if (loadStartedAt <= now) e.loadStartedAt = loadStartedAt
          if (loadFinishedAt <= now) e.loadFinishedAt = loadFinishedAt
        }
        const failedNow = loadFail && inspectedAt > now
        if (firstInspectAt <= now) {
          const failed = LOAD_CHECKS.find((c) => c.name === loadFail)
          const at = failedNow ? firstInspectAt : inspectedAt
          e.loadingInspection = {
            ...Object.fromEntries(CHECK_NAMES.map((name) => [name, 'Yes'])),
            ...(failedNow && { [loadFail]: 'No' }),
            precoolTemp: e.trailerCheck?.precoolTemp ?? '',
            reeferRunning: 'Yes',
            trailerCheckedAt: e.trailerCheck?.savedAt,
            result: failedNow ? 'Fail' : 'Pass',
            issues: failedNow ? [`${failed.label}: No`] : [],
            correctiveAction: loadFail && !failedNow ? FIXES[loadFail] : '',
            inspectedAt: at,
            savedAt: at,
            palletsLoaded: String(18 + Math.floor(random() * 8)),
            technician,
            inspector: guardAt(at),
            sealApplied: String(700000 + Math.floor(random() * 99999)),
          }
        }
        if (inspectedAt <= now) {
          const releasedAt = drop ? yardAt : Math.round(inspectedAt + (depart - inspectedAt) * (0.35 + random() * 0.4))
          if (releasedAt <= now) {
            e.release = {
              releasedAt,
              releasedBy: e.loadingInspection.inspector,
              paperwork: true,
              orderNo: e.pickupNumber ?? '',
              seal: e.loadingInspection.sealApplied,
              note: '',
              // Parking spots taken by loaded trailers still waiting for a hook are skipped.
              ...(drop && { toYard: true, spot: String(1 + ((n * 3) % 10)) }),
            }
          }
        }
      }

      if (depart <= now) {
        const out = new Date(depart)
        Object.assign(e, {
          dateOut: dayKey(out),
          timeOut: hhmm(out),
          gateOut: GATE,
          guardOut: guardAt(depart),
          truckerNameOut: drop ? pick(DRIVERS) : e.truckerNameIn,
          outgoingSeals: e.loadingInspection?.sealApplied ?? '',
          fuelOut: reefer ? pick(FUEL) : '',
          // The guard's check-out took a few minutes.
          checkOutStartedAt: depart - (2 + ((n * 3) % 5)) * MIN,
          checkedOutAt: depart,
        })
        // The gate checks the seal on anything that was released with one; now and then it differs.
        if (e.release?.seal) {
          const mismatch = random() < 0.02
          e.sealConfirmed = mismatch ? 'No' : 'Yes'
          if (mismatch) e.sealNote = `Seal on trailer reads ${700000 + Math.floor(random() * 99999)}`
        }
      }
      entries.push(e)
    }
  }
  // So the boards show a live Re-check: if no truck on site is failing, the latest one waiting for its
  // release fails its load inspection instead.
  if (!entries.some((e) => !e.timeOut && e.loadingInspection?.result === 'Fail')) {
    const e = entries.filter((x) => !x.timeOut && x.loadingInspection && !x.release).at(-1)
    if (e) {
      const failed = LOAD_CHECKS.find((c) => c.name === 'loadSecured')
      Object.assign(e.loadingInspection, { [failed.name]: 'No', result: 'Fail', issues: [`${failed.label}: No`], correctiveAction: '' })
    }
  }
  // No two loaded trailers waiting in the yard share a parking spot.
  const used = new Set()
  for (const e of entries.filter((x) => !x.timeOut && x.release?.toYard)) {
    let spot = Number(e.release.spot)
    while (used.has(String(spot))) spot = (spot % 10) + 1
    e.release.spot = String(spot)
    used.add(e.release.spot)
  }
  // Newest first, like the log.
  return entries.reverse()
}
