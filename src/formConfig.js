// Field layout mirrors the paper guard sheet: left column / right column, row by row.
export const EMPTY_FORM = {
  guardOnDuty: '',
  guardOut: '',
  visitPurpose: [],
  timeIn: '',
  timeOut: '',
  gateIn: 'Gate',
  gateOut: '',
  reefer: '',
  tempSet: '',
  tempActual: '',
  dateIn: '',
  dateOut: '',
  appointmentTime: '',
  truckName: '',
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
  'appointmentTime',
  'truckName',
  'trailerNumber',
  'truckerNameIn',
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

// On-screen names of the Gate fields, also used by the error list ('Fix: Carrier, Trailer #').
export const FIELD_NAMES = {
  appointmentTime: 'Appointment Time',
  truckName: 'Carrier',
  trailerNumber: 'Trailer #',
  truckerNameIn: 'Trucker Name Coming In',
  driverPhone: 'Driver Phone # (In)',
  pickupNumber: 'Order No',
  customerPickupFor: 'Customer',
  emptyPallets: 'How Many Empty Pallets',
  incomingSeals: 'Incoming Seals #',
  sealIntact: 'Seal Intact?',
  shipmentContents: 'Shipment Contents',
  reefer: 'Refrigerated Trailer?',
  tempSet: 'Set Point °F',
  tempActual: 'Actual Temp °F',
  fuelIn: 'Reefer Fuel Coming In',
  truckerNameOut: 'Trucker Name Going Out',
  driverPhoneOut: 'Driver Phone # (Out)',
  outgoingSeals: 'Outgoing Seals #',
  greenSeal: 'Green Seal #',
  lockLoads: 'Lock Loads',
  padLocks: 'Pad Locks',
  fuelOut: 'Fuel Going Out',
}

export const VISIT_PURPOSES = ['Delivery', 'Pickup', 'Drop Trailer']

// Trucks come in and go out through the one gate; the forms record it without asking.
export const GATE = 'Gate'
export const GATES = [GATE]
