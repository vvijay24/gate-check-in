import * as ui from '../../ui'
import { Icon } from '../../icons'
import CardHead from '../CardHead'

// Building blocks shared by the Shipping sections: the section title row, number tiles, cards, simple
// bar charts (always with their numbers written beside them, so no chart needs colour or hover alone),
// the Today / 7 days / 30 days switch and the link that opens the same view in Insights.

// Title row of a section: serif title, one line on what it is, and controls on the right.
export function SectionHead({ title, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="font-display text-[26px] leading-tight font-bold">{title}</h2>
        {sub && <p className="mt-1 max-w-[760px] text-[15px] text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function LivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-[12px] font-bold text-ok">
      <i className="inline-block size-1.5 rounded-full bg-ok" />
      Live
    </span>
  )
}

// A number tile. `tone`: bad | warn | good colours the icon (and the note for bad); otherwise quiet.
export function Tile({ icon, label, value, note, tone }) {
  const ic = { bad: 'bg-danger-soft text-danger', warn: 'bg-warn text-warn-ink', good: 'bg-ok-soft text-ok' }[tone] ?? 'bg-signal-tint text-signal'
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-[18px] bg-panel px-4 py-3.5 shadow-card">
      <span className={'row-span-2 grid size-11 place-items-center rounded-[14px] ' + ic}>
        <Icon name={icon} size={22} />
      </span>
      <span className="text-[13px] leading-tight font-semibold text-muted">{label}</span>
      <span className="font-display text-[30px] leading-none font-bold tabular-nums">{value}</span>
      <span className={'col-span-2 mt-1.5 border-t border-hair pt-2 text-[13px] ' + (tone === 'bad' ? 'font-semibold text-danger' : 'text-muted')}>{note}</span>
    </div>
  )
}

export const Tiles = ({ children }) => <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">{children}</div>

// A card with the tinted header strip.
export function Card({ icon, title, sub, right, className = '', children }) {
  return (
    <section className={ui.card + ' min-w-0 overflow-hidden ' + className}>
      <CardHead icon={icon} title={title} sub={sub} as="h3" size="text-[19px]">
        {right}
      </CardHead>
      {children}
    </section>
  )
}

export const Empty = ({ children }) => (
  <p className="flex items-start gap-2 px-5 py-6 text-muted">
    <Icon name="info" size={18} className="mt-0.5" />
    {children}
  </p>
)

// A table inside a card that scrolls sideways on small screens instead of squeezing.
export function Table({ head, minWidth = 640, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px]" style={{ minWidth }}>
        <thead className="bg-field text-[13px] font-semibold text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={ui.th + (typeof h === 'object' && h?.right ? ' text-right' : '')}>
                {typeof h === 'object' ? h.label : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hair">{children}</tbody>
      </table>
    </div>
  )
}
export const Td = ({ right, strong, className = '', children, ...rest }) => (
  <td className={ui.td + (right ? ' text-right tabular-nums' : '') + (strong ? ' font-semibold' : '') + ' ' + className} {...rest}>
    {children}
  </td>
)

// Horizontal bars: one row per item with its label and value written out. `rows`: [{ label, value,
// text, color }]; `max` scales the bars (default: the biggest value).
export function HBars({ rows, max, color = 'var(--color-chart-live)', labelWidth = 140 }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0))
  return (
    <ul className="grid gap-2.5" role="list">
      {rows.map((r) => (
        <li key={r.label} className="grid items-center gap-3 text-[14px]" style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr) auto` }}>
          <span className="truncate" title={r.label}>
            {r.label}
          </span>
          <span className="h-3 overflow-hidden rounded-full bg-field" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, ((r.value ?? 0) / top) * 100)}%`, background: r.color ?? color }} />
          </span>
          <b className="text-right tabular-nums">{r.text ?? r.value}</b>
        </li>
      ))}
    </ul>
  )
}

// Vertical bars with a label under each and the value above. `band`: [lo, hi] shaded target range.
// `rows`: [{ key, label, value, text, color, title }].
export function VBars({ rows, height = 150, band, color = 'var(--color-chart-live)', label }) {
  const top = Math.max(1, ...rows.map((r) => r.value ?? 0), band ? band[1] * 1.15 : 0)
  const y = (v) => (v / top) * 100
  return (
    <figure className="m-0" aria-label={label}>
      <div className="relative flex items-end gap-1.5 border-b border-line px-1" style={{ height }}>
        {band && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bg-ok-soft"
            style={{ bottom: `${y(band[0])}%`, height: `${y(band[1]) - y(band[0])}%` }}
          />
        )}
        {rows.map((r) => (
          <div key={r.key ?? r.label} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={r.title}>
            <span className="mb-0.5 text-[11.5px] font-semibold tabular-nums text-muted">{r.text ?? (r.value ? Math.round(r.value) : '')}</span>
            <span className="block w-full max-w-10 rounded-t-md" style={{ height: `${y(r.value ?? 0)}%`, background: r.color ?? color }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 px-1 pt-1 text-[11.5px] text-muted" aria-hidden="true">
        {rows.map((r) => (
          <span key={r.key ?? r.label} className="min-w-0 flex-1 truncate text-center">
            {r.label}
          </span>
        ))}
      </div>
    </figure>
  )
}

// Today / 7 days / 30 days.
export const RANGES = [
  { id: 1, label: 'Today' },
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
]
export function RangeSwitch({ value, onChange }) {
  return (
    <div role="group" aria-label="Range" className="flex gap-1 rounded-xl border border-hair bg-panel p-1 shadow-card">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          aria-pressed={value === r.id}
          onClick={() => onChange(r.id)}
          className={
            'min-h-9 cursor-pointer rounded-lg px-3 text-[14px] font-semibold transition-colors duration-150 ' +
            (value === r.id ? 'bg-signal text-signal-ink shadow-card' : 'text-ink hover:bg-signal-tint')
          }
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

// Opens the same view in Insights, with its full history and filters.
export function InsightsLink({ onOpen, section, children = 'Open in Insights' }) {
  return (
    <button type="button" onClick={() => onOpen(section)} className={ui.btnSmall + ' no-print'}>
      <Icon name="external" size={18} />
      {children}
    </button>
  )
}

// Grey legend chips under a chart.
export function Keys({ items }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
      {items.map(([name, color]) => (
        <span key={name} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
          {name}
        </span>
      ))}
    </div>
  )
}

// Tabs inside a section (Docks: Schedule · Loading · Inspection; Partners: Customers · Carriers ·
// Detention). `tabs`: [{ id, label, icon, badge, warn }].
export function SubTabs({ label, tabs, value, onChange }) {
  return (
    <div role="tablist" aria-label={label} className="no-print flex gap-1 overflow-x-auto rounded-2xl border border-hair bg-panel p-1.5 shadow-card">
      {tabs.map((t) => {
        const on = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={
              'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 font-display text-[15px] font-bold whitespace-nowrap transition-colors duration-150 ' +
              (on ? 'bg-signal text-signal-ink shadow-card' : 'text-muted hover:bg-signal-tint hover:text-ink')
            }
          >
            <Icon name={t.icon} size={18} />
            {t.label}
            {t.badge != null && (
              <span className={'rounded-full px-1.5 font-body text-[12px] font-bold tabular-nums ' + (t.warn ? 'bg-warn text-warn-ink' : on ? 'bg-panel/25' : 'bg-signal-soft text-signal')}>{t.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
