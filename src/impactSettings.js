// Settings for the Overview's Digitization Impact figures, kept in this browser:
// - goLive: the day the yard started using the app ("YYYY-MM-DD"); blank = the first real entry's date
// - targets: minutes each handoff should take at most
// - baseline: optional figures from before digitization (blank until someone finds them)
const KEY = 'impact-settings'

export const HANDOFFS = [
  { key: 'waitDockMs', label: 'Arrived → dock assigned', owner: 'Shipping', target: 30 },
  { key: 'toInspectMs', label: 'Docked → inspected', owner: 'Dock / QA', target: 60 },
  { key: 'toReleaseMs', label: 'Passed → released by Shipping', owner: 'Shipping', target: 10 },
  { key: 'releaseToOutMs', label: 'Released → checked out', owner: 'Gate', target: 10 },
]
// Part of "arrived → dock assigned": the time a dock was free for the truck but Shipping hadn't
// assigned it yet (the Gate → Shipping response). Kept apart from HANDOFFS so it isn't counted twice.
export const DOCK_RESPONSE = { key: 'dockResponseMs', label: 'Dock free → assigned', owner: 'Shipping', target: 10 }
export const DEFAULT_TARGETS = Object.fromEntries([...HANDOFFS, DOCK_RESPONSE].map((h) => [h.key, h.target]))

export const BASELINE_FIELDS = [
  { key: 'weeklyDetention', label: 'Detention fees per week ($)' },
  { key: 'loadsPerWeek', label: 'Live loads per week' },
  { key: 'avgOnSiteMin', label: 'Average time on site (minutes)' },
]

export function loadImpactSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) ?? {}
    return { goLive: saved.goLive ?? '', targets: { ...DEFAULT_TARGETS, ...saved.targets }, baseline: saved.baseline ?? {} }
  } catch {
    return { goLive: '', targets: { ...DEFAULT_TARGETS }, baseline: {} }
  }
}

export function saveImpactSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // The page keeps working with the settings in memory.
  }
}
