import { BAY_NAMES } from './yard'

// Field layout mirrors the paper guard sheet: left column / right column, row by row.
export const EMPTY_FORM = {
  guardOnDuty: '',
  guardOut: '',
  visitPurpose: [],
  timeIn: '',
  timeOut: '',
  gateIn: 'Gate 1',
  gateOut: '',
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

// Required to check a truck in. Listed in on-screen order so the first error gets focus.
export const REQUIRED_IN = [
  'dateIn',
  'timeIn',
  'gateIn',
  'visitPurpose',
  'truckName',
  'trailerNumber',
  'truckerNameIn',
  'waitingLocation',
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

// Required to check a truck out, in on-screen order.
export const REQUIRED_OUT = ['dateOut', 'timeOut', 'gateOut', 'truckerNameOut', 'outgoingSeals', 'fuelOut', 'guardOut']

// Only required when the visit includes a pickup (a loaded trailer leaves sealed).
const PICKUP_ONLY = ['pickupNumber', 'customerPickupFor', 'outgoingSeals']
// Only shown and required when the trailer is a reefer.
export const REEFER_ONLY = ['tempSet', 'tempActual', 'fuelIn', 'fuelOut']

export const isShown = (name, form) => !REEFER_ONLY.includes(name) || form.reefer === 'Yes'

export const isRequired = (name, form, mode = 'in') =>
  (mode === 'out' ? REQUIRED_OUT : REQUIRED_IN).includes(name) &&
  (!PICKUP_ONLY.includes(name) || (form.visitPurpose ?? []).includes('Pickup')) &&
  isShown(name, form)

const FUEL_LEVELS = ['Empty', '1/4', '1/2', '3/4', 'Full']

// Form sections, grouped like guard-shack-log.html. `wide` fields span the full row;
// `newRow` fields start a new row, leaving the rest of the row above empty;
// `pickupOnly` fields are disabled (and saved empty) unless Pickup is ticked.
export const SECTIONS_IN = [
  {
    title: 'Truck and Driver',
    purpose: true,
    fields: [
      { name: 'appointmentTime', label: 'Appointment Time', type: 'time', pickupOnly: true },
      { name: 'truckName', label: 'Carrier', newRow: true },
      { name: 'trailerNumber', label: 'Trailer #' },
      { name: 'truckerNameIn', label: 'Trucker Name Coming In' },
      { name: 'driverPhone', label: 'Driver Phone # (In)', type: 'tel' },
      { name: 'waitingLocation', label: 'Waiting Location (Staging Bay)', type: 'select', options: BAY_NAMES, placeholder: 'Select a free bay' },
    ],
    odometer: true,
  },
  {
    title: 'Load',
    fields: [
      { name: 'pickupNumber', label: 'Order No' },
      { name: 'customerPickupFor', label: 'Customer' },
      { name: 'emptyPallets', label: 'How Many Empty Pallets', type: 'number', min: 0 },
      { name: 'incomingSeals', label: 'Incoming Seals #', newRow: true },
      { name: 'sealIntact', label: 'Seal Intact?', type: 'choice', options: ['Yes', 'No'] },
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
    ],
  },
]

// Check Out sections. `times` puts Date Out / Time Out at the top of the section;
// `emptyNote` is shown instead of fields when none apply (e.g. a dry van has no reefer readings).
// The Guard on Duty section is added by the form after these.
export const SECTIONS_OUT = [
  {
    title: 'Truck and Driver',
    times: true,
    fields: [
      { name: 'truckerNameOut', label: 'Trucker Name Going Out' },
      { name: 'driverPhoneOut', label: 'Driver Phone # (Out)', type: 'tel' },
    ],
  },
  {
    title: 'Load',
    fields: [
      { name: 'outgoingSeals', label: 'Outgoing Seals #' },
      { name: 'greenSeal', label: 'Green Seal #' },
      { name: 'lockLoads', label: 'Lock Loads' },
      { name: 'padLocks', label: 'Pad Locks' },
    ],
  },
  {
    title: 'Reefer',
    emptyNote: 'Not a refrigerated trailer, so there are no reefer readings to record.',
    fields: [{ name: 'fuelOut', label: 'Fuel Going Out', type: 'choice', options: FUEL_LEVELS, wide: true }],
  },
]

export const VISIT_PURPOSES = ['Delivery', 'Pickup', 'Drop Trailer']

// Trucks normally enter through Gate 1 and leave through Gate 2; the form pre-selects those.
export const GATES = ['Gate 1', 'Gate 2']
