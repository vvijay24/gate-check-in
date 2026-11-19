import * as ui from '../../ui'
import { Icon } from '../../icons'
import { dayKey } from '../../time'
import { NO_SHOW_MIN } from '../../schedule'
import { bookedPallets } from '../../loadSheet'

// Shipping → Now: a small summary of the whole day. Trucks that already left, trucks on site and booked
// trucks still to come (no-shows left out); their orders split into fresh and frozen; pallets for every
// order; cases only for orders with a load sheet ("so far").

const MIN = 60000
const n = (x) => x.toLocaleString()

export function daySummary(entries, schedule, now) {
  const today = dayKey(new Date(now))
  const here = entries.filter((e) => e.dateIn === today || !e.timeOut)
  const toCome = schedule.filter((a) => !a.entryId && now - a.ms <= NO_SHOW_MIN * MIN)
  const kinds = [...here.map((e) => e.loadSheet?.kind), ...toCome.map((a) => a.kind)]
  const orders = new Set([...here.map((e) => e.pickupNumber || e.id), ...toCome.map((a) => a.orderNo)])
  return {
    day: new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
    trucks: here.length + toCome.length,
    left: here.filter((e) => e.timeOut).length,
    onSite: here.filter((e) => !e.timeOut).length,
    toCome: toCome.length,
    orders: orders.size,
    fresh: kinds.filter((k) => k === 'Fresh').length,
    frozen: kinds.filter((k) => k === 'Frozen').length,
    unknown: kinds.filter((k) => !k).length,
    pallets:
      here.reduce((sum, e) => sum + (Number(e.loadingInspection?.palletsLoaded) || bookedPallets(e)), 0) + toCome.reduce((sum, a) => sum + (a.pallets || 0), 0),
    cases: here.reduce((sum, e) => sum + (e.loadSheet?.products ?? []).reduce((c, p) => c + p.cases, 0), 0),
  }
}

// One tile: an icon chip in its topic tint on top, the label, the figure, then a note or a small bar.
// Tints (index.css .mg-*) are the Overview's validated topic colours.
function Stat({ icon, tint, label, value, children }) {
  return (
    <div className="grid min-w-0 content-start gap-1 py-3.5 pr-4 xl:px-4">
      <span className={`mg-chip mg-${tint} grid size-9 place-items-center rounded-[10px]`} aria-hidden="true">
        <Icon name={icon} size={19} />
      </span>
      <span className="mt-1 text-[13px] font-semibold text-muted">{label}</span>
      <b className="font-display text-[21px] leading-tight tabular-nums">{value}</b>
      {children}
    </div>
  )
}

const note = 'text-[13px] text-muted tabular-nums'

// A thin split bar (2px gaps, rounded ends) with its key underneath: the numbers are always written out,
// so the bar never has to be read on its own. Parts with 0 are left out.
function Split({ label, parts }) {
  const total = parts.reduce((a, p) => a + p.n, 0)
  return (
    <span className="grid gap-1.5">
      {total > 0 && (
        <span className="flex h-2 gap-0.5" role="img" aria-label={`${label}: ${parts.map((p) => `${p.n} ${p.label}`).join(', ')}`}>
          {parts
            .filter((p) => p.n)
            .map((p) => (
              <i key={p.label} className="block h-full rounded-full" style={{ flexGrow: p.n, background: p.color }} title={`${p.n} ${p.label}`} />
            ))}
        </span>
      )}
      <span className={note + ' flex flex-wrap gap-x-2.5 gap-y-0.5'} aria-hidden="true">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1 whitespace-nowrap">
            <i className="inline-block size-2 rounded-full" style={{ background: p.color }} />
            {p.n} {p.label}
          </span>
        ))}
      </span>
    </span>
  )
}

// Truck states are in order (left → on site → to come), so one hue from dark to light. Fresh and frozen
// are two kinds: gold and blue (validated pair; gold is under 3:1 on white, so the counts are written out).
const STATE = { left: 'var(--color-signal)', onSite: 'var(--dive-blue)', toCome: 'color-mix(in srgb, var(--dive-blue) 35%, var(--color-panel))' }
const KIND = { Fresh: 'var(--dive-gold)', Frozen: 'var(--dive-blue)' }

export function DaySummary({ entries, schedule, now }) {
  const s = daySummary(entries, schedule, now)
  return (
    <section aria-labelledby="day-summary-title" className={ui.card + ' grid grid-cols-2 divide-hair px-5 sm:grid-cols-3 xl:grid-cols-[auto_repeat(5,minmax(0,1fr))] xl:divide-x'}>
      <div className="col-span-2 grid content-center gap-1 py-3.5 pr-5 sm:col-span-3 xl:col-span-1">
        <span className="grid size-9 place-items-center rounded-[10px] bg-chrome text-white" aria-hidden="true">
          <Icon name="calendar" size={19} />
        </span>
        <h3 id="day-summary-title" className="mt-1 grid leading-tight">
          <span className="text-[13px] font-semibold text-muted">Today</span>
          <span className="font-display text-[19px] font-bold whitespace-nowrap">{s.day}</span>
        </h3>
      </div>
      <Stat icon="truck" tint="time" label="Trucks" value={`${n(s.trucks)} ${s.trucks === 1 ? 'truck' : 'trucks'}`}>
        <Split
          label="Trucks"
          parts={[
            { n: s.left, label: 'left', color: STATE.left },
            { n: s.onSite, label: 'on site', color: STATE.onSite },
            { n: s.toCome, label: 'to come', color: STATE.toCome },
          ]}
        />
      </Stat>
      <Stat icon="orders" tint="arrive" label="Orders" value={`${n(s.orders)} ${s.orders === 1 ? 'order' : 'orders'}`}>
        <span className={note}>Booked and checked in</span>
      </Stat>
      <Stat icon="reefer" tint="quality" label="Fresh or frozen" value={`${s.fresh} · ${s.frozen}`}>
        <Split
          label="Fresh or frozen"
          parts={[
            { n: s.fresh, label: 'fresh', color: KIND.Fresh },
            { n: s.frozen, label: 'frozen', color: KIND.Frozen },
          ]}
        />
        {s.unknown > 0 && <span className={note}>{s.unknown} not known yet</span>}
      </Stat>
      <Stat icon="load" tint="money" label="Pallets" value={`${n(s.pallets)} pallets`}>
        <span className={note}>Booked or loaded</span>
      </Stat>
      <Stat icon="cases" tint="money" label="Cases" value={`${n(s.cases)} cases`}>
        <span className={note}>So far, from load sheets</span>
      </Stat>
    </section>
  )
}
