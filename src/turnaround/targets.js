// Turnaround targets, exactly as listed in design/turnaround-kit/METRICS.md. The one place they are
// set: the Overview, the Shipping and Loading & Inspection timers (stages.js) and the detention rule
// all read them from here. Minutes.

// Each stage, in the order a truck moves through the plant. `field` is the kit's stage-minutes name.
export const STAGE_TARGETS = [
  { key: 'gateIn', field: 'gate_in_min', label: 'Gate check-in', min: 3, max: 5 },
  // Check-in to the order being ready (Shipping presses Order ready). A dock is only assigned after it.
  { key: 'orderWait', field: 'order_wait_min', label: 'Waiting for order', min: 0, max: 15 },
  // Order ready to dock assigned.
  { key: 'dockAssign', field: 'dock_assign_min', label: 'Dock assignment', min: 5, max: 15 },
  { key: 'preload', field: 'preload_min', label: 'Pre-loading', min: 5, max: 10 },
  { key: 'load', field: 'load_min', label: 'Loading', min: 30, max: 60 },
  { key: 'inspection', field: 'inspection_min', label: 'Inspection', min: 10, max: 15 },
  { key: 'checkout', field: 'checkout_min', label: 'Gate checkout', min: 3, max: 5 },
]

// Time at the door (pre-load + load + inspection) and gate to gate (all seven stages; 65–130 before the
// "Waiting for order" stage was added, widened by its 15 min).
export const DOCK_TARGET = { min: 45, max: 85 }
export const G2G_TARGET = { min: 65, max: 145 }

// Arrival within ±15 min of the appointment counts as on time.
export const ON_TIME_WINDOW = 15

// Detention: the free-time clock starts at the later of appointment and arrival; 2 h free, then $75/h.
// Trucks more than 15 min late aren't charged.
export const DETENTION = { freeMin: 120, ratePerHour: 75, lateGraceMin: 15 }
