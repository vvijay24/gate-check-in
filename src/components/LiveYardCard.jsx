import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'
import CardHead from './CardHead'
import { DOCKS } from '../yard'
import { YARD_STAGES, yardHistory, yardStageAt } from '../liveYard'

// The Live yard at the top of Loading & Inspection: how many trucks are in each stage right now (the
// counts double as the chart's legend), which docks are free, and a stacked bar per half hour for the
// last six hours, ending with "Now". Hover or focus a bar for its breakdown; Show as table for the numbers.
// `compact` (Shipping, beside the stage chart): the counts become a strip above a shorter chart, in the same
// card style as the Shipping desk charts.

const M = { l: 30, r: 8, t: 18, b: 26 }

function YardBars({ points, focus, height: H = 280 }) {
  const box = useRef(null)
  const [w, setW] = useState(760)
  const [tip, setTip] = useState(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 760))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const total = (p) => YARD_STAGES.reduce((n, s) => n + p.counts[s.key], 0)
  const top = Math.max(4, Math.ceil(Math.max(...points.map(total)) / 4) * 4)
  const iw = w - M.l - M.r
  const ih = H - M.t - M.b
  const step = iw / points.length
  const bw = Math.min(36, step * 0.62)
  const y = (v) => M.t + ih - (v / top) * ih

  return (
    <div ref={box} className="relative min-w-0 overflow-x-clip">
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Trucks on site every half hour for the last six hours, by stage" className="block">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (top / 4) * i
          return (
            <g key={i}>
              <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} stroke="var(--chart-grid, var(--color-line))" />
              <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted text-[12px]">
                {v}
              </text>
            </g>
          )
        })}
        {points.map((p, i) => {
          const x = M.l + i * step + (step - bw) / 2
          const shown = YARD_STAGES.filter((s) => p.counts[s.key] > 0)
          let acc = 0
          const sum = total(p)
          return (
            <g key={p.at}>
              {shown.map((s, j) => {
                const v = p.counts[s.key]
                const y0 = y(acc)
                const y1 = y(acc + v)
                acc += v
                const dim = focus && focus !== s.key ? 0.25 : 1
                // The top segment ends in 4px rounded corners; a 2px gap separates the segments.
                if (j === shown.length - 1) {
                  const r = Math.min(4, y0 - y1)
                  return (
                    <path
                      key={s.key}
                      d={`M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z`}
                      fill={s.color}
                      opacity={dim}
                    />
                  )
                }
                return <rect key={s.key} x={x} y={y1 + 2} width={bw} height={Math.max(0, y0 - y1 - 2)} fill={s.color} opacity={dim} />
              })}
              {p.now && (
                <text x={x + bw / 2} y={y(sum) - 6} textAnchor="middle" className="fill-ink text-[12px] font-bold">
                  {sum}
                </text>
              )}
              {(i % 2 === 0 || p.now) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className={'text-[12px] ' + (p.now ? 'fill-ink font-bold' : 'fill-muted')}>
                  {p.label}
                </text>
              )}
              <rect
                x={M.l + i * step}
                y={M.t}
                width={step}
                height={ih}
                fill="transparent"
                tabIndex={0}
                aria-label={`${p.now ? 'Right now' : p.label}: ${sum} trucks. ${YARD_STAGES.map((s) => `${s.label} ${p.counts[s.key]}`).join(', ')}`}
                onMouseEnter={() => setTip(i)}
                onMouseLeave={() => setTip(null)}
                onFocus={() => setTip(i)}
                onBlur={() => setTip(null)}
                className="outline-none focus-visible:stroke-signal focus-visible:stroke-2"
              />
            </g>
          )
        })}
      </svg>
      {tip != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-chrome px-3 py-2 text-[13px] whitespace-nowrap text-white shadow-raised"
          style={{ left: Math.min(Math.max(M.l + tip * step + step / 2, 110), w - 110), top: y(total(points[tip])) - 8 }}
        >
          <b className="mb-1 block">
            {points[tip].now ? 'Right now' : points[tip].label} · {total(points[tip])} trucks
          </b>
          {YARD_STAGES.map((s) => (
            <span key={s.key} className="flex items-center gap-2">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
              <b className="ml-auto pl-4 tabular-nums">{points[tip].counts[s.key]}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LiveYardCard({ entries, now, compact }) {
  const [table, setTable] = useState(false)
  const [focus, setFocus] = useState(null)
  const points = useMemo(() => yardHistory(entries, now), [entries, now])
  const counts = points[points.length - 1].counts
  // Each dock with the stage of the truck at it, if any.
  const docks = useMemo(
    () =>
      DOCKS.map((d) => {
        const e = entries.find((x) => !x.timeOut && x.dockDoor === d)
        return { d, stage: e ? YARD_STAGES.find((s) => s.key === yardStageAt(e, now)) : null, e }
      }),
    [entries, now],
  )
  const free = docks.filter((x) => !x.e).length

  const dockChip = ({ d, stage, e }, size) => (
    <span
      key={d}
      title={e ? `Dock ${d}: ${stage?.label ?? 'in use'} · ${e.trailerNumber}` : `Dock ${d}: free`}
      aria-label={e ? `Dock ${d}, ${stage?.label ?? 'in use'}` : `Dock ${d}, free`}
      className={'grid place-items-center rounded-[9px] text-[13px] font-bold ' + size + ' ' + (e ? 'border-[1.5px] text-ink' : 'border border-dashed border-line bg-field text-muted')}
      style={e && stage ? { borderColor: stage.color, background: `color-mix(in srgb, ${stage.color} 22%, transparent)` } : undefined}
    >
      {d}
    </span>
  )
  const tableView = (
    <div className="max-h-[280px] overflow-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr>
            <th className={ui.th}>Time</th>
            {YARD_STAGES.map((s) => (
              <th key={s.key} className={ui.th + ' text-right'}>
                {s.label}
              </th>
            ))}
            <th className={ui.th + ' text-right'}>Total</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.at} className={ui.tr}>
              <td className="px-3.5 py-2 font-semibold">{p.now ? 'Now' : p.label}</td>
              {YARD_STAGES.map((s) => (
                <td key={s.key} className="px-3.5 py-2 text-right tabular-nums">
                  {p.counts[s.key]}
                </td>
              ))}
              <td className="px-3.5 py-2 text-right font-bold tabular-nums">{YARD_STAGES.reduce((n, s) => n + p.counts[s.key], 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  if (compact)
    return (
      <section aria-labelledby="live-yard-title" className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-[20px] bg-panel px-5 pt-4 pb-3.5 shadow-card">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 id="live-yard-title" className="font-display text-[20px] font-bold">
              Live yard
            </h3>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-[12px] font-bold text-ok">
              <i className="inline-block size-1.5 rounded-full bg-ok" />
              Live
            </span>
          </div>
          <p className="text-[13px] text-muted">Every truck on site by stage, every half hour for the last six hours</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {YARD_STAGES.map((s) => (
            <div
              key={s.key}
              onMouseEnter={() => setFocus(s.key)}
              onMouseLeave={() => setFocus(null)}
              className={'grid gap-1 rounded-xl px-3 py-2 transition-colors duration-150 ' + (focus === s.key ? 'bg-signal-tint' : 'bg-field')}
            >
              <span className="flex items-center gap-2 text-[13px] leading-tight font-semibold">
                <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </span>
              <b className="text-[24px] leading-none tabular-nums">{counts[s.key]}</b>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[12px] font-semibold tracking-wide text-muted uppercase">
            Docks · {free} of {DOCKS.length} free
          </span>
          <span className="flex gap-1.5">{docks.map((x) => dockChip(x, 'h-7 w-8'))}</span>
        </div>
        {table ? tableView : <YardBars points={points} focus={focus} height={230} />}
        <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table} className="w-fit cursor-pointer text-[14px] font-semibold text-signal">
          {table ? 'Show as chart' : 'Show as table'}
        </button>
      </section>
    )

  return (
    <section aria-labelledby="live-yard-title" className={ui.card}>
      <CardHead icon="speed" id="live-yard-title" title="Live yard" sub="Every truck on site right now, and the last six hours" size="text-[20px]">
        <span className="flex items-center gap-2 text-[14px] font-bold text-ok">
          <i className="inline-block size-2 rounded-full bg-ok shadow-[0_0_0_4px_var(--color-ok-soft)]" aria-hidden="true" />
          Live
        </span>
        <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table} className={ui.btnGhost}>
          <Icon name={table ? 'chart' : 'log'} size={18} />
          {table ? 'Show as chart' : 'Show as table'}
        </button>
      </CardHead>
      <div className="grid lg:grid-cols-[270px_minmax(0,1fr)]">
        <div className="grid content-start gap-1 border-b border-hair p-4 lg:border-r lg:border-b-0">
          {YARD_STAGES.map((s) => (
            <div
              key={s.key}
              onMouseEnter={() => setFocus(s.key)}
              onMouseLeave={() => setFocus(null)}
              className={'grid grid-cols-[12px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 ' + (focus === s.key ? 'bg-signal-tint' : '')}
            >
              <i className="size-3 rounded-[4px]" style={{ background: s.color }} aria-hidden="true" />
              <span className="leading-tight font-semibold">
                {s.label}
                <span className="block text-[12px] font-normal text-muted">{s.note}</span>
              </span>
              <b className="text-[28px] leading-none tabular-nums">{counts[s.key]}</b>
            </div>
          ))}
          <div className="mt-2 border-t border-hair px-1 pt-3">
            <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
              Docks · {free} of {DOCKS.length} free
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {docks.map((x) => dockChip(x, 'h-9'))}
            </div>
          </div>
        </div>
        <div className="min-w-0 p-4 pb-3">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <b className="text-[15px]">Trucks on site, every half hour</b>
            <span className="text-[13px] text-muted">{table ? 'Same numbers as the chart' : 'Hover or tab to a bar for the breakdown'}</span>
          </div>
          {table ? tableView : <YardBars points={points} focus={focus} />}
        </div>
      </div>
    </section>
  )
}
