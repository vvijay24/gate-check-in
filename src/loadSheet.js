// The load sheet: what went on the trailer (fresh or frozen product, cases, pallets) and the box
// temperature once loading is finished. SAMPLE until the load sheet is on a form: only sample visits
// have one, made by addSampleLoadSheets below.

// SAMPLE: placeholder temperature rules, to be confirmed with QA. `set` is the reefer set point and
// `within` how far the box may be from it, both °F.
export const TEMP_RULES = {
  Fresh: { set: 28, within: 4 },
  Frozen: { set: 0, within: 5 },
}

// SAMPLE: products by kind.
export const PRODUCTS = {
  Fresh: ['Whole birds, iced', 'Boneless breast', 'Wings', 'Thighs', 'Drumsticks', 'Tenders'],
  Frozen: ['IQF breast fillets', 'Frozen wings', 'Frozen tenders', 'Leg quarters', 'Breaded nuggets'],
}

// What's going on the trailer, in a few words, the same on every screen: "Frozen, 22 pallets: Wings,
// Thighs". Kind and pallets come first so they stay in view when a long product list is cut short. Without
// a load sheet, the customer the order is for; '' when neither is known.
export function loadLine(e) {
  const s = e.loadSheet
  const pallets = e.loadingInspection?.palletsLoaded || s?.pallets
  if (s?.products?.length) return `${s.kind}${pallets ? `, ${pallets} pallets` : ''}: ${s.products.map((p) => p.name).join(', ')}`
  return e.customerPickupFor ? `For ${e.customerPickupFor}${pallets ? `, ${pallets} pallets` : ''}` : ''
}

// A stable number from a string (the one schedule.js uses).
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

// SAMPLE: the pallets the order was booked for, until bookings are imported. The load sheet's count when
// there is one, otherwise a made-up 18-25 that stays the same for the truck. Today's schedule uses it too.
export function bookedPallets(e) {
  return e.loadSheet?.pallets ?? 18 + (hash(e.id) % 8)
}

// The pallets, on a line of their own: "20 pallets loaded" once the crew has counted them in the loading
// check, "22 pallets booked" until then.
export function palletLine(e) {
  const loaded = Number(e.loadingInspection?.palletsLoaded)
  if (loaded) return `${loaded} ${loaded === 1 ? 'pallet' : 'pallets'} loaded`
  return `${bookedPallets(e)} pallets booked`
}

// What the pallets are: "Fresh: Wings, Thighs", or the customer the order is for without a load sheet.
export function productLine(e) {
  const s = e.loadSheet
  if (s?.products?.length) return `${s.kind}: ${s.products.map((p) => p.name).join(', ')}`
  return e.customerPickupFor ? `For ${e.customerPickupFor}` : ''
}

// Both, for screen readers and tooltips.
export const loadSummary = (e) => [palletLine(e), productLine(e)].filter(Boolean).join(', ')

// Box temperature minus the set point (°F), or null when the box hasn't been read yet.
export function tempGap(e) {
  const s = e.loadSheet
  if (!s || s.boxTemp == null) return null
  return Math.round((s.boxTemp - s.setPoint) * 10) / 10
}

// 'in' (within the rule), 'out' (outside it) or 'none' (no reading yet).
export function tempStatus(e) {
  const gap = tempGap(e)
  if (gap == null) return 'none'
  return Math.abs(gap) <= (TEMP_RULES[e.loadSheet.kind]?.within ?? 0) ? 'in' : 'out'
}

// SAMPLE: a load sheet on every sample visit. Its own seed, so the visits themselves don't change.
// The box is read only once loading is finished; about 1 in 12 readings is out of range.
export function addSampleLoadSheets(entries) {
  let seed = 4127
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (const e of entries) {
    if (!e.sample) continue
    const kind = random() < 0.6 ? 'Fresh' : 'Frozen'
    const rule = TEMP_RULES[kind]
    const list = PRODUCTS[kind]
    const count = 1 + Math.floor(random() * 3)
    const start = Math.floor(random() * list.length)
    const products = Array.from({ length: count }, (_, i) => ({ name: list[(start + i) % list.length], cases: 40 * (2 + Math.floor(random() * 10)) }))
    const pallets = Number(e.loadingInspection?.palletsLoaded) || 18 + Math.floor(random() * 8)
    const out = random() < 1 / 12
    const off = out ? (random() < 0.5 ? -1 : 1) * (rule.within + 1 + random() * 3) : (random() * 2 - 1) * rule.within * 0.8
    e.loadSheet = {
      kind,
      products,
      pallets,
      setPoint: rule.set,
      ...(e.loadFinishedAt && { boxTemp: Math.round((rule.set + off) * 10) / 10, readAt: e.loadFinishedAt }),
    }
  }
  return entries
}
