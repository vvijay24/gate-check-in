// Field layout mirrors the paper guard sheet: left column / right column, row by row.
export const EMPTY_FORM = {
  guardOnDuty: '',
  visitPurpose: [],
  timeIn: '',
  timeOut: '',
  reefer: '',
  tempSet: '',
  tempActual: '',
  dateIn: '',
  dateOut: '',
  appointmentTime: '',
  truckName: '',
  waitingLocation: '',
  driverPhone: '',
  driverPhoneOut: '',
  emptyPallets: '',
  pickupNumber: '',
  lockLoads: '',
  customerPickupFor: '',
  padLocks: '',
  shipmentContents: '',
  fuelIn: '',
  fuelOut: '',
  incomingSeals: '',
  sealIntact: '',
  trailerNumber: '',
  outgoingSeals: '',
  greenSeal: '',
  truckerNameIn: '',
  truckerNameOut: '',
  odometerPhoto: '',
}

// Required to log a truck's arrival. Listed in on-screen order so the first error gets focus.
export const REQUIRED_IN = [
  'dateIn',
  'timeIn',
  'visitPurpose',
  'truckName',
  'trailerNumber',
  'truckerNameIn',
  'odometerPhoto',
  'pickupNumber',
  'customerPickupFor',
  'incomingSeals',
  'sealIntact',
  'reefer',
  'tempSet',
  'tempActual',
  'fuelIn',
  'guardOnDuty',
]

// Only required when the visit includes a pickup.
const PICKUP_ONLY = ['pickupNumber', 'customerPickupFor']
// Only shown and required when the trailer is a reefer.
export const REEFER_ONLY = ['tempSet', 'tempActual', 'fuelIn', 'fuelOut']

export const isRequired = (name, form) =>
  REQUIRED_IN.includes(name) &&
  (!PICKUP_ONLY.includes(name) || form.visitPurpose.includes('Pickup')) &&
  isShown(name, form)

export const isShown = (name, form) => !REEFER_ONLY.includes(name) || form.reefer === 'Yes'

const FUEL_LEVELS = ['Empty', '1/4', '1/2', '3/4', 'Full']

// Form sections, grouped like guard-shack-log.html. `wide` fields span the full row;
// `newRow` fields start a new row, leaving the rest of the row above empty.
export const SECTIONS = [
  {
    title: 'Truck and Driver',
    purpose: true,
    fields: [
      { name: 'appointmentTime', label: 'Appointment Time', type: 'time' },
      { name: 'truckName', label: 'Truck Name', newRow: true },
      { name: 'trailerNumber', label: 'Trailer #' },
      { name: 'truckerNameIn', label: 'Trucker Name Coming In' },
      { name: 'driverPhone', label: 'Driver Phone # (In)', type: 'tel' },
      { name: 'truckerNameOut', label: 'Trucker Name Going Out' },
      { name: 'driverPhoneOut', label: 'Driver Phone # (Out)', type: 'tel' },
      { name: 'waitingLocation', label: 'Waiting Location', type: 'textarea', wide: true },
    ],
    odometer: true,
  },
  {
    title: 'Load',
    fields: [
      { name: 'pickupNumber', label: 'Order No' },
      { name: 'customerPickupFor', label: 'Customer Pick Up For' },
      { name: 'emptyPallets', label: 'How Many Empty Pallets', type: 'number', min: 0 },
      { name: 'greenSeal', label: 'Green Seal #' },
      { name: 'incomingSeals', label: 'Incoming Seals #' },
      { name: 'sealIntact', label: 'Seal Intact?', type: 'choice', options: ['Yes', 'No'] },
      { name: 'outgoingSeals', label: 'Outgoing Seals #' },
      { name: 'lockLoads', label: 'Lock Loads' },
      { name: 'padLocks', label: 'Pad Locks' },
      { name: 'shipmentContents', label: 'Shipment Contents', type: 'textarea', wide: true },
    ],
  },
  {
    title: 'Reefer',
    fields: [
      { name: 'reefer', label: 'Refrigerated Trailer?', type: 'choice', options: ['Yes', 'No'], wide: true },
      { name: 'tempSet', label: 'Set Point °F', type: 'number', step: 0.1 },
      { name: 'tempActual', label: 'Actual Temp °F', type: 'number', step: 0.1 },
      { name: 'fuelIn', label: 'Reefer Fuel Coming In', type: 'choice', options: FUEL_LEVELS, wide: true },
      { name: 'fuelOut', label: 'Fuel Going Out', type: 'choice', options: FUEL_LEVELS, wide: true },
    ],
  },
]

export const VISIT_PURPOSES = ['Delivery', 'Pickup', 'Drop Trailer']
