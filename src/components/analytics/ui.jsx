// Panels used across the Analytics sections: a titled card, a headline-number tile and a meter bar.

// `legend` sits on the title's line, to the right.
export function Card({ title, sub, badge, legend, children, className = '' }) {
  return (
    <section className={'min-w-0 rounded-[10px] border border-line bg-panel ' + className}>
      <div className="px-5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3 className="font-display text-[21px] leading-tight font-bold">
            {title}
            {badge}
          </h3>
          {legend}
        </div>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

// `size`: 'lead' is the section's main figure (big, fills its row's height); 'compact' is for the
// smaller figures under it; omitted is the regular tile.
export function Tile({ label, value, note, tone, trend, size }) {
  const border = { alert: 'border-t-danger', warn: 'border-t-signal', good: 'border-t-ok' }[tone] ?? 'border-t-line'
  const box = { lead: 'flex h-full flex-col justify-center px-6 py-5', compact: 'px-4 py-3' }[size] ?? 'px-4 py-3.5'
  const number =
    { lead: 'mt-1 mb-1 text-[46px] sm:text-[56px]', compact: 'mt-0.5 text-[26px]' }[size] ?? 'mt-1 mb-0.5 text-[30px] sm:text-[34px]'
  return (
    <div className={'rounded-[10px] border border-t-[6px] border-line bg-panel ' + box + ' ' + border}>
      <div className={(size === 'lead' ? 'text-[17px]' : 'text-sm') + ' font-semibold text-muted'}>{label}</div>
      <div className={number + ' leading-tight font-bold tabular-nums'}>{value}</div>
      <div className={(size === 'lead' ? 'text-[15px] ' : 'text-[13px] ') + (tone === 'alert' ? 'font-bold text-danger' : 'text-muted')}>{note}</div>
      {trend}
    </div>
  )
}

export function Meter({ value, max = 1, className = 'bg-ink' }) {
  const w = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded bg-track">
      <div className={'h-full rounded-r ' + className} style={{ width: `${w}%` }} />
    </div>
  )
}
