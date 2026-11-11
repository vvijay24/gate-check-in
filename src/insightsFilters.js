// Filters for the Insights tab. Every chart and figure is worked out from the entries that pass them.
import { dockKey } from './components/AssignDock'
import { DOCKS } from './yard'

export const NO_FILTERS = { carrier: '', customer: '', dock: '', kind: '', purpose: '' }
export const FILTER_KEYS = Object.keys(NO_FILTERS)
export const PURPOSES = ['Pickup', 'Delivery', 'Drop Trailer']

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const isDrop = (e) => (e.visitPurpose ?? []).includes('Drop Trailer')

export function matches(e, f) {
  if (f.carrier && !same(e.truckName, f.carrier)) return false
  if (f.customer && !same(e.customerPickupFor, f.customer)) return false
  if (f.dock && dockKey(e.dockDoor) !== f.dock) return false
  if (f.kind === 'live' && isDrop(e)) return false
  if (f.kind === 'drop' && !isDrop(e)) return false
  if (f.purpose && !(e.visitPurpose ?? []).includes(f.purpose)) return false
  return true
}

export const applyFilters = (entries, f) => (FILTER_KEYS.some((k) => f[k]) ? entries.filter((e) => matches(e, f)) : entries)
export const activeFilters = (f) => FILTER_KEYS.filter((k) => f[k])

// Names as typed, most frequent first; the same name in another case counts once.
function names(entries, field) {
  const counts = new Map()
  for (const e of entries) {
    const name = String(e[field] ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const c = counts.get(key) ?? { name, n: 0 }
    c.n++
    counts.set(key, c)
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((c) => c.name)
}

export const filterOptions = (entries) => ({ carriers: names(entries, 'truckName'), customers: names(entries, 'customerPickupFor'), docks: DOCKS })

export const FILTER_LABEL = {
  carrier: (v) => `Carrier: ${v}`,
  customer: (v) => `Customer: ${v}`,
  dock: (v) => `Dock ${v}`,
  kind: (v) => (v === 'live' ? 'Live visits only' : 'Dropped trailers only'),
  purpose: (v) => `Purpose: ${v}`,
}
