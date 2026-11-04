import { Spark } from './viz'

// Panels used across Insights: a titled card, a headline-figure tile, a strip of tiles and a meter.

// A panel with a header row (title, subtitle, and `legend` or controls on the right) over its body.
export function Card({ title, sub, badge, legend, children, className = '' }) {
  return (
    <section className={'min-w-0 rounded-xl bg-panel shadow-card ' + className}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-[14.5px] leading-snug font-semibold tracking-[-0.005em]">
            {title}
            {badge}
          </h3>
          {sub && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{sub}</p>}
        </div>
        {legend}
      </div>
      {children}
    </section>
  )
}

// Numbers (money, %, durations) show in the mono face so they line up; names stay in the text face.
const isWordy = (v) => typeof v === 'string' && /[A-Za-z]{3,}/.test(v)

// `size`: 'lead' is the section's main figure (fills its row's height); 'compact' sits in a strip;
// omitted is the regular tile. `tone` (good / warn / alert) colors a thin top edge and the note.
// `spark` ({ values, label }) adds a small trend line, one value per day of the range.
export function Tile({ label, value, note, tone, trend, size, spark }) {
  const bar = { alert: 'bg-danger', warn: 'bg-warn', good: 'bg-ok' }[tone]
  const box = { lead: 'flex h-full flex-col px-6 py-5 ' + (spark ? 'justify-between' : 'justify-center'), compact: 'flex flex-col px-4 py-3.5' }[size] ?? 'px-4 py-3.5'
  const number = { lead: 'mt-2 text-[40px]', compact: 'mt-1.5 text-[24px]' }[size] ?? 'mt-1.5 text-[28px]'
  return (
    <div className={'relative min-w-0 overflow-hidden rounded-xl bg-panel shadow-card ' + box}>
      {bar && <i aria-hidden="true" className={'absolute inset-x-0 top-0 h-[3px] ' + bar} />}
      <div className="eyebrow truncate text-muted">{label}</div>
      <div className={number + ' leading-none font-semibold ' + (isWordy(value) ? 'truncate tracking-[-0.01em]' : 'figure')}>{value}</div>
      <div className={'mt-2 text-[12.5px] leading-snug ' + (tone === 'alert' ? 'font-semibold text-danger' : 'text-muted')}>{note}</div>
      {trend}
      {spark && size !== 'lead' && <div className="min-h-2 flex-1" />}
      {spark && (
        <Spark
          values={spark.values}
          label={spark.label}
          color={tone === 'alert' ? 'var(--color-danger)' : undefined}
          className={size === 'lead' ? 'mt-4 h-16 w-full' : 'mt-1 h-8 w-full'}
        />
      )}
    </div>
  )
}

// Tiles joined into one panel with hairline dividers, like an instrument strip. `cols` are the
// grid-cols classes per breakpoint.
export function Strip({ cols = 'grid-cols-2 sm:grid-cols-3 2xl:grid-cols-5', children }) {
  return (
    <div
      className={
        'grid overflow-hidden rounded-xl bg-panel shadow-card ' +
        '[&>*]:rounded-none [&>*]:shadow-[inset_-1px_-1px_0_var(--color-line)] ' +
        cols
      }
    >
      {children}
    </div>
  )
}

export function Meter({ value, max = 1, className = 'bg-ink' }) {
  const w = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
      <div className={'h-full rounded-full ' + className} style={{ width: `${w}%` }} />
    </div>
  )
}
