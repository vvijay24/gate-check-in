// Runs the app's own metrics (src/metrics.js) over gate-log data and prints the results as JSON.
//
//   node .claude/skills/data-analytics/analyze.mjs --file <export.xlsx> [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//   node .claude/skills/data-analytics/analyze.mjs --sample [--from ...] [--to ...]
//   node .claude/skills/data-analytics/analyze.mjs --entries <entries.json>      (raw localStorage array)
//
// Without --from/--to it covers every date in the data. Durations are reported in minutes.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(resolve(root, 'package.json'))

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const fail = (msg) => {
  console.error(msg)
  process.exit(1)
}

// metrics.js uses extensionless imports and pulls in a .jsx file, so load it through Vite.
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
let metrics, time, yardConfig, sample
try {
  metrics = await vite.ssrLoadModule('/src/metrics.js')
  time = await vite.ssrLoadModule('/src/time.js')
  yardConfig = await vite.ssrLoadModule('/src/yard.js')
  sample = await vite.ssrLoadModule('/src/sampleData.js')
} finally {
  await vite.close()
}

// ---- Load entries ----------------------------------------------------------------------------

// Export header → entry field (the reverse of src/logColumns.js).
const FIELDS = {
  'Order No': 'pickupNumber',
  'Date In': 'dateIn',
  'Time In': 'timeIn',
  'Gate In': 'gateIn',
  'Guard on Duty (Check-In)': 'guardOnDuty',
  'Guard on Duty (Check-Out)': 'guardOut',
  'Date Out': 'dateOut',
  'Time Out': 'timeOut',
  'Gate Out': 'gateOut',
  'Dock #': 'dockDoor',
  'Appointment Time': 'appointmentTime',
  Carrier: 'truckName',
  'Trailer #': 'trailerNumber',
  'Trucker Name Coming In': 'truckerNameIn',
  'Trucker Name Going Out': 'truckerNameOut',
  'Waiting Location': 'waitingLocation',
  Customer: 'customerPickupFor',
  'Reefer?': 'reefer',
  'Temp Set (°F)': 'tempSet',
  'Temp Actual (°F)': 'tempActual',
  'Empty Pallets': 'emptyPallets',
  'Shipment Contents': 'shipmentContents',
  'Seal Intact?': 'sealIntact',
}
const INSPECTION = {
  'Loading Inspection': 'result',
  'Pallets Loaded': 'palletsLoaded',
  'Case Count': 'caseCount',
  'Total Weight (lbs)': 'totalWeight',
  'Technician Name': 'technician',
  'Inspected By': 'inspector',
}

const pad = (n) => String(n).padStart(2, '0')
// Excel may hand back real dates/times if someone edited the export; turn them back into strings.
const asDate = (v) => (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v ?? '').trim())
const asTime = (v) => (v instanceof Date ? `${pad(v.getHours())}:${pad(v.getMinutes())}` : String(v ?? '').trim())

function fromExport(file) {
  const XLSX = require('xlsx')
  const book = XLSX.read(readFileSync(file), { cellDates: true })
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' })
  return rows.map((r, i) => {
    const e = { id: `row-${i + 2}` }
    for (const [header, field] of Object.entries(FIELDS)) e[field] = r[header] === '' ? '' : String(r[header])
    for (const f of ['dateIn', 'dateOut']) e[f] = asDate(r[Object.keys(FIELDS).find((h) => FIELDS[h] === f)])
    for (const f of ['timeIn', 'timeOut', 'appointmentTime']) e[f] = asTime(r[Object.keys(FIELDS).find((h) => FIELDS[h] === f)])
    e.visitPurpose = String(r['Purpose of Visit'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    // "Dock Assigned" is exported as a local date-time string; it is best effort.
    const assigned = r['Dock Assigned'] instanceof Date ? r['Dock Assigned'].getTime() : Date.parse(r['Dock Assigned'])
    if (Number.isFinite(assigned)) e.dockAssignedAt = assigned
    if (r['Loading Inspection']) {
      e.loadingInspection = { issues: String(r['Inspection Issues'] ?? '').split(';').map((s) => s.trim()).filter(Boolean) }
      for (const [header, field] of Object.entries(INSPECTION)) e.loadingInspection[field] = r[header]
      // Inspection Date / Time (newer exports) give the inspection's moment for dock → inspected timing.
      const when = Date.parse(`${asDate(r['Inspection Date'])}T${asTime(r['Inspection Time']) || '00:00'}`)
      if (r['Inspection Date'] && Number.isFinite(when)) e.loadingInspection.inspectedAt = when
    }
    return e
  })
}

let entries, source
if (opt('file')) {
  entries = fromExport(resolve(opt('file')))
  source = opt('file')
} else if (opt('entries')) {
  entries = JSON.parse(readFileSync(resolve(opt('entries')), 'utf8'))
  source = opt('entries')
} else if (args.includes('--sample')) {
  entries = sample.makeSampleEntries(Date.now())
  source = 'sample data (src/sampleData.js)'
} else {
  fail('Give --file <export.xlsx>, --entries <entries.json> or --sample.')
}
if (!entries.length) fail(`No rows found in ${source}.`)

// ---- Work out the figures --------------------------------------------------------------------

const now = Date.now()
const dates = [...new Set(entries.map((e) => e.dateIn).filter(Boolean))].sort()
const from = opt('from') ?? dates[0]
const to = opt('to') ?? dates[dates.length - 1]
const inRange = dates.filter((d) => d >= from && d <= to)
if (!inRange.length) fail(`No visits between ${from} and ${to}. Dates in the data: ${dates[0]} to ${dates[dates.length - 1]}.`)

const min = (ms) => (ms == null || !Number.isFinite(ms) ? null : Math.round(ms / 60000))
const pct = (f) => (f == null ? null : Math.round(f * 1000) / 10)

const days = inRange.map((date) => {
  const m = metrics.dayMetrics(entries, date, now)
  return {
    date,
    visits: m.visits,
    live: m.liveCount,
    drops: m.dropCount,
    arrivals: m.arrivals,
    onTimePct: pct(m.otaPct),
    avgGateDwellMin: min(m.avgGateDwellMs),
    avgDockWaitMin: min(m.avgDockWaitMs),
    avgDockDwellMin: min(m.avgDockDwellMs),
    dockUtilizationPct: pct(m.dockUtilization),
    gateCounts: m.gateCounts,
    hourly: m.hourly,
    docks: m.doors.map((d) => ({ dock: d.door, loads: d.loads, utilizationPct: pct(d.utilization), avgDwellMin: min(d.avgDwellMs), avgWaitMin: min(d.avgWaitMs) })),
    carriers: m.leaderboard.map((c) => ({ name: c.name, visits: c.visits, avgTurnMin: min(c.avgTurnMs), onTimePct: pct(c.onTimePct), overFreeTime: c.detention })),
    customers: m.customers.map((c) => ({ name: c.name, pickups: c.pickups, avgTurnMin: min(c.avgTurnMs), onTimePct: pct(c.onTimePct), onSite: c.onSite })),
    guards: m.guards,
  }
})

// Totals across the range, recomputed from the visits themselves rather than averaging daily averages.
const period = entries.filter((e) => e.dateIn >= from && e.dateIn <= to)
const live = period.filter((e) => !metrics.isDrop(e))
const turn = (e) => time.departureMs(e) - time.arrivalMs(e)
const turns = live.filter((e) => e.timeOut).map(turn).filter(Number.isFinite)
const lates = period.map(time.minutesLate).filter((m) => m !== null)
const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null)

const rollup = (keyOf) => {
  const groups = new Map()
  for (const e of live) {
    const name = String(keyOf(e) ?? '').trim()
    if (!name) continue
    const k = name.toLowerCase()
    if (!groups.has(k)) groups.set(k, { name, visits: 0, turns: [], lates: [] })
    const g = groups.get(k)
    g.visits++
    if (e.timeOut && Number.isFinite(turn(e))) g.turns.push(turn(e))
    const l = time.minutesLate(e)
    if (l !== null) g.lates.push(l)
  }
  return [...groups.values()]
    .map((g) => ({
      name: g.name,
      visits: g.visits,
      avgTurnMin: min(avg(g.turns)),
      onTimePct: g.lates.length ? pct(g.lates.filter((l) => l <= time.LATE_GRACE_MIN).length / g.lates.length) : null,
      lateArrivals: g.lates.filter((l) => l > time.LATE_GRACE_MIN).length,
    }))
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name))
}

const yard = metrics.yardMetrics(entries, Infinity, now)

console.log(
  JSON.stringify(
    {
      source,
      generatedAt: new Date(now).toISOString(),
      range: { from, to, daysWithVisits: inRange.length },
      totals: {
        visits: period.length,
        live: live.length,
        drops: period.length - live.length,
        departed: period.filter((e) => e.timeOut).length,
        stillOnSite: period.filter((e) => !e.timeOut).length,
        scheduled: lates.length,
        onTimePct: lates.length ? pct(lates.filter((l) => l <= time.LATE_GRACE_MIN).length / lates.length) : null,
        lateArrivals: lates.filter((l) => l > time.LATE_GRACE_MIN).length,
        avgGateDwellMin: min(avg(turns)),
        overFreeTime: turns.filter((ms) => ms > yardConfig.DETENTION_FREE_MIN * 60000).length,
        inspections: {
          pass: period.filter((e) => e.loadingInspection?.result === 'Pass').length,
          fail: period.filter((e) => e.loadingInspection?.result === 'Fail').length,
        },
      },
      carriers: rollup((e) => e.truckName),
      customers: rollup((e) => e.customerPickupFor),
      yardNow: {
        onSite: yard.atDock.size + yard.waiting.length + yard.drops.length,
        atDock: yard.atDock.size,
        waiting: yard.waiting.length,
        drops: yard.drops.length,
        stagingCapacityPct: yard.capacityPct,
        longestWaitMin: min(yard.longestWaitMs),
        inventory: yard.inventory,
      },
      days,
    },
    null,
    2,
  ),
)
