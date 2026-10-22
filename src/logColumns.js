// Columns for the Log tab table and the Excel export, in display order.
// `get` returns the cell value; `number` marks numeric columns so Excel can sum/sort them.
const num = (v) => (v === '' || v == null || isNaN(v) ? '' : Number(v))

export const LOG_COLUMNS = [
  { header: 'Status', get: (e) => (e.timeOut ? 'Departed' : 'On site'), width: 10 },
  { header: 'Guard on Duty', get: (e) => e.guardOnDuty, width: 18 },
  { header: 'Purpose of Visit', get: (e) => (e.visitPurpose ?? []).join(', '), width: 22 },
  { header: 'Date In', get: (e) => e.dateIn, width: 12 },
  { header: 'Time In', get: (e) => e.timeIn, width: 9 },
  { header: 'Date Out', get: (e) => e.dateOut, width: 12 },
  { header: 'Time Out', get: (e) => e.timeOut, width: 9 },
  { header: 'Appointment Time', get: (e) => e.appointmentTime, width: 12 },
  { header: 'Truck Name', get: (e) => e.truckName, width: 18 },
  { header: 'Trailer #', get: (e) => e.trailerNumber, width: 12 },
  { header: 'Trucker Name Coming In', get: (e) => e.truckerNameIn, width: 20 },
  { header: 'Driver Phone # (In)', get: (e) => e.driverPhone, width: 16 },
  { header: 'Trucker Name Going Out', get: (e) => e.truckerNameOut, width: 20 },
  { header: 'Driver Phone # (Out)', get: (e) => e.driverPhoneOut, width: 16 },
  { header: 'Waiting Location', get: (e) => e.waitingLocation, width: 16 },
  { header: 'Order No', get: (e) => e.pickupNumber, width: 12 },
  { header: 'Customer Pick Up For', get: (e) => e.customerPickupFor, width: 22 },
  { header: 'Reefer?', get: (e) => e.reefer, width: 8 },
  { header: 'Temp Set (°F)', get: (e) => num(e.tempSet), number: true, width: 11 },
  { header: 'Temp Actual (°F)', get: (e) => num(e.tempActual), number: true, width: 13 },
  { header: 'Reefer Fuel In', get: (e) => e.fuelIn, width: 12 },
  { header: 'Fuel Going Out', get: (e) => e.fuelOut, width: 12 },
  { header: 'Empty Pallets', get: (e) => num(e.emptyPallets), number: true, width: 11 },
  { header: 'Lock Loads', get: (e) => e.lockLoads, width: 16 },
  { header: 'Pad Locks', get: (e) => e.padLocks, width: 16 },
  { header: 'Shipment Contents', get: (e) => e.shipmentContents, width: 40 },
  { header: 'Incoming Seals #', get: (e) => e.incomingSeals, width: 16 },
  { header: 'Seal Intact?', get: (e) => e.sealIntact, width: 11 },
  { header: 'Outgoing Seals #', get: (e) => e.outgoingSeals, width: 16 },
  { header: 'Green Seal #', get: (e) => e.greenSeal, width: 14 },
  { header: 'Odometer Photo', get: (e) => (e.odometerPhoto ? 'Yes' : 'No'), width: 10 },
]

export async function exportToExcel(entries, filename) {
  // Loaded on demand so the Gate tab doesn't pay for the spreadsheet library.
  const XLSX = await import('xlsx')
  const rows = entries.map((e) => LOG_COLUMNS.map((c) => c.get(e) ?? ''))
  const sheet = XLSX.utils.aoa_to_sheet([LOG_COLUMNS.map((c) => c.header), ...rows])
  sheet['!cols'] = LOG_COLUMNS.map((c) => ({ wch: c.width }))
  sheet['!autofilter'] = { ref: sheet['!ref'] }
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Gate Log')
  XLSX.writeFile(book, filename)
}
