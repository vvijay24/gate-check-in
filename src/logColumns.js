// Columns for the Log tab table and the Excel export, in display order.
// `get` returns the cell value; `number` marks numeric columns so Excel can sum/sort them.
const num = (v) => (v === '' || v == null || isNaN(v) ? '' : Number(v))

// Order No, Date In and Time In lead; the rest follow in form order.
export const LOG_COLUMNS = [
  { header: 'Order No', get: (e) => e.pickupNumber, width: 12 },
  { header: 'Date In', get: (e) => e.dateIn, width: 12 },
  { header: 'Time In', get: (e) => e.timeIn, width: 9 },
  { header: 'Gate In', get: (e) => e.gateIn, width: 8 },
  { header: 'Status', get: (e) => (e.timeOut ? 'Departed' : 'On site'), width: 10 },
  { header: 'Guard on Duty (Check-In)', get: (e) => e.guardOnDuty, width: 18 },
  { header: 'Guard on Duty (Check-Out)', get: (e) => e.guardOut, width: 18 },
  { header: 'Purpose of Visit', get: (e) => (e.visitPurpose ?? []).join(', '), width: 22 },
  { header: 'Date Out', get: (e) => e.dateOut, width: 12 },
  { header: 'Time Out', get: (e) => e.timeOut, width: 9 },
  { header: 'Gate Out', get: (e) => e.gateOut, width: 8 },
  { header: 'Dock #', get: (e) => e.dockDoor, width: 8 },
  { header: 'Dock Assigned', get: (e) => (e.dockAssignedAt ? new Date(e.dockAssignedAt).toLocaleString() : ''), width: 20 },
  { header: 'Appointment Time', get: (e) => e.appointmentTime, width: 12 },
  { header: 'Carrier', get: (e) => e.truckName, width: 18 },
  { header: 'Trailer #', get: (e) => e.trailerNumber, width: 12 },
  { header: 'Trucker Name Coming In', get: (e) => e.truckerNameIn, width: 20 },
  { header: 'Driver Phone # (In)', get: (e) => e.driverPhone, width: 16 },
  { header: 'Trucker Name Going Out', get: (e) => e.truckerNameOut, width: 20 },
  { header: 'Driver Phone # (Out)', get: (e) => e.driverPhoneOut, width: 16 },
  { header: 'Waiting Location', get: (e) => e.waitingLocation, width: 16 },
  { header: 'Customer', get: (e) => e.customerPickupFor, width: 22 },
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
  // Loading Inspection (Dock & Loading tab)
  { header: 'Loading Inspection', get: (e) => e.loadingInspection?.result ?? '', width: 12 },
  { header: 'Inspection Date', get: (e) => e.loadingInspection?.inspectionDate ?? '', width: 12 },
  { header: 'Inspection Time', get: (e) => e.loadingInspection?.inspectionTime ?? '', width: 10 },
  { header: 'Pre-Cool Temp (°F)', get: (e) => num(e.loadingInspection?.precoolTemp), number: true, width: 12 },
  { header: 'Product Temp Front (°F)', get: (e) => num(e.loadingInspection?.tempFront), number: true, width: 13 },
  { header: 'Product Temp Middle (°F)', get: (e) => num(e.loadingInspection?.tempMiddle), number: true, width: 13 },
  { header: 'Product Temp Rear (°F)', get: (e) => num(e.loadingInspection?.tempRear), number: true, width: 13 },
  { header: 'Pallets Loaded', get: (e) => num(e.loadingInspection?.palletsLoaded), number: true, width: 10 },
  { header: 'Case Count', get: (e) => num(e.loadingInspection?.caseCount), number: true, width: 10 },
  { header: 'Total Weight (lbs)', get: (e) => num(e.loadingInspection?.totalWeight), number: true, width: 12 },
  { header: 'Inspection Issues', get: (e) => (e.loadingInspection?.issues ?? []).join('; '), width: 40 },
  { header: 'Corrective Action', get: (e) => e.loadingInspection?.correctiveAction ?? '', width: 40 },
  { header: 'Technician Name', get: (e) => e.loadingInspection?.technician ?? '', width: 16 },
  { header: 'Inspected By', get: (e) => e.loadingInspection?.inspector ?? '', width: 16 },
  // Shipping release (Shipping tab) and the Gate's seal check at check-out
  { header: 'Released At', get: (e) => (e.release?.releasedAt ? new Date(e.release.releasedAt).toLocaleString() : ''), width: 20 },
  { header: 'Released By', get: (e) => e.release?.releasedBy ?? '', width: 16 },
  { header: 'Gate Note', get: (e) => e.release?.note ?? '', width: 30 },
  { header: 'Seal Confirmed at Gate', get: (e) => e.sealConfirmed ?? '', width: 12 },
  { header: 'Seal Note', get: (e) => e.sealNote ?? '', width: 30 },
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
