// The deep dive behind each "Impact of going digital" tile on the Overview: manual week vs digital week,
// with a one-line finding, four headline figures and a mix of charts. Manual week is always orange and
// digital week teal (--dive-s1 / --dive-teal, checked light and dark with the dataviz palette check);
// red only where something got worse. Every number comes from the kit's metrics.js rows.
import * as d3 from 'd3'
import { TT } from './charts'
import { DETENTION, G2G_TARGET, STAGE_TARGETS } from './targets'

const V = (n) => `var(--dive-${n})`
const MAN = V('s1')
const DIG = V('teal')
const BAD = 'var(--p-red)'
// A saving inside the digital week (waterfall steps, hours back): a lighter teal, not a new series.
const SAVED = 'color-mix(in srgb, var(--dive-teal) 55%, var(--p-surface))'
const MD = [['Manual week', MAN], ['Digital week', DIG]]
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const wd = (day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${day}T00:00`).getDay()]
const HOURS = d3.range(5, 20)
const SHORT = { gate_in_min: 'Check-in', dock_wait_min: 'Dock wait', order_wait_min: 'Order wait', dock_assign_min: 'Dock assign', preload_min: 'Pre-load', load_min: 'Loading', inspection_min: 'Inspection', checkout_min: 'Checkout' }
const TYPES = ['Pickup', 'Drop trailer']
// The manual week has no "Order ready" time, so manual vs digital compares the whole wait for a dock (waiting
// for the order + dock assignment) as one stage; its target is the two added up.
const T = Object.fromEntries(STAGE_TARGETS.map((s) => [s.key, s]))
const DOCK_WAIT = { key: 'dockWait', field: 'dock_wait_min', label: 'Waiting for order and dock', min: T.orderWait.min + T.dockAssign.min, max: T.orderWait.max + T.dockAssign.max }
const IMPACT_STAGES = STAGE_TARGETS.filter((s) => s.key !== 'orderWait').map((s) => (s.key === 'dockAssign' ? DOCK_WAIT : s))
const FULL_TIME_HOURS = 2080

// The tiles, in the order they sit on the Overview.
export const IMPACT_DIVES = [
  { id: 'g2g', label: 'Faster per truck', accent: 'teal' },
  { id: 'detention', label: 'Detention avoided', accent: 'yolk' },
  { id: 'dock_wait', label: 'Shorter wait for a dock', accent: 'navy' },
  { id: 'within', label: 'Trucks within target', accent: 'teal' },
  { id: 'phone', label: 'Phone calls no longer needed', accent: 'navy-2' },
  { id: 'hours', label: 'Truck hours freed up', accent: 'navy' },
]
// Minutes per phone call and per paper handoff, for staff time. An estimate the user can change.
export const STAFF_MINUTES = { call: 3, paper: 2 }

/* ---------- chart helpers in the kit's style ---------- */
function tipOf(el) {
  const t = document.createElement('div')
  t.className = 'tt-tip'
  el.appendChild(t)
  return {
    show(ev, head, lines) {
      t.replaceChildren()
      const h = document.createElement('div')
      h.className = 'h'
      h.textContent = head
      t.appendChild(h)
      lines.forEach(([color, name, value]) => {
        const r = document.createElement('div')
        r.className = 'r'
        if (color) {
          const i = document.createElement('i')
          i.style.background = color
          r.appendChild(i)
        }
        const s = document.createElement('span')
        s.textContent = name ? `${name}: ${value}` : value
        r.appendChild(s)
        t.appendChild(r)
      })
      const b = el.getBoundingClientRect()
      let x = ev.clientX - b.left + 12
      t.style.opacity = 1
      if (x + t.offsetWidth > el.clientWidth) x = ev.clientX - b.left - t.offsetWidth - 12
      t.style.left = Math.max(0, x) + 'px'
      t.style.top = Math.max(0, Math.min(ev.clientY - b.top - 10, el.clientHeight - t.offsetHeight)) + 'px'
    },
    hide() {
      t.style.opacity = 0
    },
  }
}
function frame(el, H) {
  el.replaceChildren()
  const W = Math.max(280, el.clientWidth || 600)
  return { svg: d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`), W }
}
function yGrid(svg, y, x0, x1, fmt) {
  const g = svg.append('g')
  g.selectAll('line').data(y.ticks(4)).join('line').attr('x1', x0).attr('x2', x1).attr('y1', y).attr('y2', y).style('stroke', (d) => (d === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'))
  g.selectAll('text').data(y.ticks(4)).join('text').attr('x', x0 - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt)
}

// Lines over shared x keys, a crosshair tooltip, an optional target band, red maximum line, the gap
// between the first two series shaded, and the last value labeled.
// o: {keys, label, series:[{name, color, values}], fmt, band?, ref?, gap?, max?, endLabels?}
function lines(el, o) {
  const H = 250
  const { svg, W } = frame(el, H)
  const vals = o.series.flatMap((s) => s.values).filter((v) => v != null)
  if (!vals.length) return
  const y = d3.scaleLinear([0, o.max ?? (Math.max(d3.max(vals), o.band ? o.band[1] : 0, o.ref || 0) * 1.12 || 1)], [H - 26, 12]).nice()
  const ml = 50
  const x = d3.scalePoint(o.keys, [ml + 12, W - 18])
  const label = o.label || String
  if (o.band) svg.append('rect').attr('x', ml).attr('width', W - ml - 6).attr('y', y(o.band[1])).attr('height', y(o.band[0]) - y(o.band[1])).style('fill', 'var(--p-green)').attr('opacity', 0.12)
  yGrid(svg, y, ml, W - 6, o.fmt)
  const step = Math.max(1, Math.ceil(52 / (x.step() || 52)))
  svg.append('g').selectAll('text').data(o.keys.filter((_, i) => i % step === 0)).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text(label)
  if (o.gap) {
    const [a, b] = o.series
    const pts = o.keys.map((k, i) => ({ k, a: a.values[i], b: b.values[i] })).filter((p) => p.a != null && p.b != null)
    svg.append('path').datum(pts).attr('d', d3.area().x((p) => x(p.k)).y0((p) => y(p.b)).y1((p) => y(p.a)).curve(d3.curveMonotoneX)).style('fill', o.gap).attr('opacity', 0.16)
  }
  o.series.forEach((s) => {
    const pts = o.keys.map((k, i) => ({ k, v: s.values[i] })).filter((p) => p.v != null)
    if (!pts.length) return
    svg.append('path').datum(pts).attr('d', d3.line().x((p) => x(p.k)).y((p) => y(p.v)).curve(d3.curveMonotoneX)).style('fill', 'none').style('stroke', s.color).attr('stroke-width', 2.5)
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => x(p.k)).attr('cy', (p) => y(p.v)).attr('r', 4).style('fill', s.color).style('stroke', 'var(--p-surface)').attr('stroke-width', 2)
    if (o.endLabels) {
      const l = pts[pts.length - 1]
      svg.append('text').attr('class', 'v').attr('x', x(l.k) - 8).attr('y', y(l.v) - 10).attr('text-anchor', 'end').text(o.fmt(l.v))
    }
  })
  if (o.ref) svg.append('line').attr('x1', ml).attr('x2', W - 6).attr('y1', y(o.ref)).attr('y2', y(o.ref)).style('stroke', BAD).attr('stroke-dasharray', '6 4').attr('stroke-width', 1.5)
  const t = tipOf(el)
  const guide = svg.append('line').attr('y1', 10).attr('y2', H - 24).style('stroke', 'var(--chart-ref)').attr('opacity', 0)
  svg.append('g').selectAll('rect').data(o.keys).join('rect').attr('x', (k) => x(k) - x.step() / 2).attr('width', x.step()).attr('y', 0).attr('height', H).style('fill', 'transparent')
    .on('mousemove', (ev, k) => {
      guide.attr('x1', x(k)).attr('x2', x(k)).attr('opacity', 1)
      const i = o.keys.indexOf(k)
      t.show(ev, label(k), o.series.map((s) => [s.color, s.name, s.values[i] == null ? '—' : o.fmt(s.values[i])]))
    })
    .on('mouseleave', () => {
      guide.attr('opacity', 0)
      t.hide()
    })
}

// Manual average truck → what each stage saved (or added, in red) → digital average truck.
function waterfall(el, { start, steps, end }) {
  const F = TT.FMT
  const H = 270
  const { svg, W } = frame(el, H)
  let run = start.value
  const bars = [{ ...start, y0: 0, y1: start.value, total: true }]
  steps.forEach((s) => {
    bars.push({ ...s, y0: run - s.value, y1: run })
    run -= s.value
  })
  bars.push({ ...end, y0: 0, y1: end.value, total: true })
  const y = d3.scaleLinear([0, d3.max(bars, (b) => Math.max(b.y0, b.y1)) * 1.12 || 1], [H - 40, 14]).nice()
  const ml = 44
  const x = d3.scaleBand(bars.map((b) => b.name), [ml, W - 6]).padding(0.22)
  yGrid(svg, y, ml, W - 6, F.min)
  const t = tipOf(el)
  const bw = Math.min(x.bandwidth(), 52)
  const cx = (b) => x(b.name) + x.bandwidth() / 2
  const signed = (v) => `${v >= 0 ? '−' : '+'}${F.min1(Math.abs(v))}`
  bars.slice(0, -1).forEach((b, i) => {
    const next = bars[i + 1]
    const lvl = b.total ? b.y1 : b.y0
    svg.append('line').attr('x1', cx(b) + bw / 2).attr('x2', cx(next) - bw / 2).attr('y1', y(lvl)).attr('y2', y(lvl)).style('stroke', 'var(--chart-ref)').attr('stroke-dasharray', '3 3')
  })
  svg.append('g').selectAll('rect').data(bars).join('rect').attr('x', (b) => cx(b) - bw / 2).attr('width', bw).attr('rx', 4)
    .attr('y', (b) => y(Math.max(b.y0, b.y1))).attr('height', (b) => Math.max(2, Math.abs(y(b.y0) - y(b.y1)))).style('fill', (b) => b.color)
    .on('mousemove', (ev, b) => t.show(ev, b.long || b.name, [[b.color, null, b.total ? `${F.min(b.value)} min per truck` : `${signed(b.value)} min per truck`]]))
    .on('mouseleave', () => t.hide())
  svg.append('g').selectAll('text').data(bars).join('text').attr('class', 'v').attr('x', cx).attr('y', (b) => y(Math.max(b.y0, b.y1)) - 6).attr('text-anchor', 'middle')
    .text((b) => (b.total ? F.min(b.value) : signed(b.value)))
  svg.append('g').selectAll('text').data(bars).join('text').attr('x', cx).attr('y', H - 22).attr('text-anchor', 'middle').text((b) => b.name)
  svg.append('g').selectAll('text').data(bars.filter((b) => b.total)).join('text').attr('x', cx).attr('y', H - 6).attr('text-anchor', 'middle').style('fill', 'var(--color-fg-muted)').text('avg truck')
}

// Manual dot → digital dot per row; the change on the right (teal better, red worse, neutral ±0).
// rows: [{k, m, d}]
function dumbbell(el, o) {
  const rows = o.rows.filter((r) => r.m != null && r.d != null)
  const rowH = 40
  const H = rows.length * rowH + 30
  const { svg, W } = frame(el, H)
  if (!rows.length) return
  const fmt = o.fmt
  const better = (r) => (o.higherIsBetter ? r.d >= r.m : r.d <= r.m)
  const dl = (r) => (o.delta ? o.delta(r) : (r.d <= r.m ? '−' : '+') + fmt(Math.abs(r.m - r.d)))
  const flat = (r) => /^±0\b/.test(dl(r))
  const ml = 116
  const mr = 70
  const x = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.m, r.d)) * 1.05 || 1], [ml, W - mr]).nice()
  const y = d3.scaleBand(rows.map((r) => r.k), [6, H - 26]).padding(0.2)
  const ticks = x.ticks(Math.max(3, Math.floor((W - ml - mr) / 80)))
  svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', H - 24).style('stroke', 'var(--chart-grid)')
  svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text(fmt)
  const t = tipOf(el)
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(0,${y(r.k) + y.bandwidth() / 2})`)
    .on('mousemove', (ev, r) => t.show(ev, String(r.k), [[MAN, 'Manual week', fmt(r.m)], [DIG, 'Digital week', fmt(r.d)]]))
    .on('mouseleave', () => t.hide())
  g.append('rect').attr('y', -rowH / 2).attr('width', W).attr('height', rowH).style('fill', 'transparent')
  g.append('text').attr('x', ml - 12).attr('dy', '0.32em').attr('text-anchor', 'end').text((r) => r.k)
  g.append('line').attr('x1', (r) => x(r.m)).attr('x2', (r) => x(r.d)).style('stroke', (r) => (better(r) ? DIG : BAD)).attr('stroke-width', 6).attr('stroke-linecap', 'round').attr('opacity', 0.3)
  g.append('circle').attr('cx', (r) => x(r.m)).attr('r', 7).style('fill', MAN).style('stroke', 'var(--p-surface)').attr('stroke-width', 2)
  g.append('circle').attr('cx', (r) => x(r.d)).attr('r', 8).style('fill', DIG).style('stroke', 'var(--p-surface)').attr('stroke-width', 2)
  g.append('text').attr('class', (r) => 'v' + (better(r) || flat(r) ? '' : ' bad')).attr('x', W - mr + 12).attr('dy', '0.32em')
    .style('fill', (r) => (!flat(r) && better(r) ? DIG : null)).text(dl)
}

// Two donuts side by side, manual week and digital week, each with its name underneath.
function twinDonut(el, { m, d, centerLabel }) {
  const F = TT.FMT
  el.replaceChildren()
  el.style.display = 'grid'
  el.style.gridTemplateColumns = 'minmax(0,1fr) minmax(0,1fr)'
  ;[['Manual week', m], ['Digital week', d]].forEach(([name, parts]) => {
    const box = document.createElement('div')
    box.style.position = 'relative'
    el.appendChild(box)
    const c = document.createElement('div')
    box.appendChild(c)
    const total = d3.sum(parts, (p) => p.value)
    TT.donut(c, { parts, center: total ? F.pct(parts[0].value / total) : '—', centerLabel, height: 200 })
    const cap = document.createElement('p')
    cap.className = 'tt-note'
    cap.style.cssText = 'text-align:center;margin:4px 0 0'
    cap.textContent = name
    box.appendChild(cap)
  })
}

const grouped = (el, rows, fmt) =>
  TT.groupBars(el, { rows, key: (r) => r.k, fmt, series: [{ field: 'm', name: 'Manual week', color: MAN }, { field: 'd', name: 'Digital week', color: DIG }] })

/* ---------- the six deep dives ---------- */
// ctx: { man, dig, imp, staff } — `man` / `dig` are per-truck rows (kit metrics plus carrier, door and
// arrival hour), `imp` the kit's computeImpact kpi rows by key, `staff` the minutes per call / handoff.
// Returns { big, unit, about, take, stats: [[label, value, note, good]], panels }. A panel is
// { key, title, note, legend, wide, draw(el) }, or { kind: 'staff', … draw, drawSplit } or { kind: 'swap', rows }.
export function impactDive(id, { man, dig, imp, staff }) {
  const F = TT.FMT
  const avg = (vs, k) => (vs.length ? d3.mean(vs, (v) => v[k]) : null)
  const sum = (vs, k) => d3.sum(vs, (v) => v[k] || 0)
  const within = (vs, k = 'g2g_min', max = G2G_TARGET.max) => (vs.length ? vs.filter((v) => v[k] <= max).length / vs.length : null)
  // One row per group with the manual and digital value side by side.
  const pair = (keys, keyOf, fn) => keys.map((k) => {
    const m = man.filter((v) => keyOf(v) === k)
    const d = dig.filter((v) => keyOf(v) === k)
    return { k, m: m.length ? fn(m) : null, d: d.length ? fn(d) : null }
  })
  const both = (rows) => rows.filter((r) => r.m != null && r.d != null)
  const bins = (edges, field) =>
    edges.map((lo, i) => {
      const hi = edges[i + 1] ?? Infinity
      const n = (vs) => vs.filter((v) => v[field] >= lo && v[field] < hi).length
      return { k: hi === Infinity ? `${lo}+` : `${lo}–${hi}`, m: n(man), d: n(dig) }
    })
  const series = (rows) => [
    { name: 'Manual week', color: MAN, values: rows.map((r) => r.m) },
    { name: 'Digital week', color: DIG, values: rows.map((r) => r.d) },
  ]
  const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`
  const nD = dig.length
  const carriers = [...new Set(man.map((v) => v.carrier))].filter((c) => c && dig.some((v) => v.carrier === c))
  const minFmt = (v) => `${F.min(v)} min`
  const pts = (r) => {
    const p = Math.round((r.d - r.m) * 100)
    return (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p) + ' pts'
  }

  if (id === 'g2g') {
    const steps = IMPACT_STAGES.map((s) => {
      const value = avg(man, s.field) - avg(dig, s.field)
      return { name: SHORT[s.field], long: s.label, value, color: value >= 0 ? SAVED : BAD }
    })
    const top = [...steps].sort((a, b) => b.value - a.value)[0]
    const byHour = pair(HOURS, (v) => v.hour, (vs) => avg(vs, 'g2g_min'))
    const peak = both(byHour).sort((a, b) => b.m - b.d - (a.m - a.d))[0]
    return {
      big: F.min(imp.g2g.saved),
      unit: 'min saved per truck',
      about: `Gate check-in to gate checkout, ${F.min(imp.g2g.before)} → ${F.min(imp.g2g.after)} min on average (${F.spct(imp.g2g.change_pct)}).`,
      take: [
        `Most of the time came back at ${top.long.toLowerCase()} (${F.min1(top.value)} min per truck).`,
        peak && `The biggest gain by hour is for trucks arriving around ${hourLabel(peak.k)}: ${F.min(peak.m)} → ${F.min(peak.d)} min.`,
      ].filter(Boolean).join(' '),
      stats: [
        ['Manual week', minFmt(imp.g2g.before), `${man.length} trucks`],
        ['Digital week', minFmt(imp.g2g.after), `${nD} trucks`, true],
        ['Saved per truck', minFmt(imp.g2g.saved), F.spct(imp.g2g.change_pct)],
        ['Over the week', `${F.min((imp.g2g.saved * nD) / 60)} h`, 'at the digital week’s truck count', true],
      ],
      panels: [
        { key: 'waterfall', title: 'Where the minutes were saved', note: 'Average truck: manual week on the left, digital week on the right. Each step in between is one stage’s saving.', legend: [['Manual week', MAN], ['Saved at this stage', SAVED], ['Took longer', BAD], ['Digital week', DIG]], wide: true,
          draw: (el) => waterfall(el, { start: { name: 'Manual', value: avg(man, 'g2g_min'), color: MAN }, steps, end: { name: 'Digital', value: avg(dig, 'g2g_min'), color: DIG } }) },
        { key: 'spread', title: 'Spread of turnaround times', note: `Trucks per 20-minute band. The digital week shifts left, under the ${G2G_TARGET.max}-min maximum.`, legend: MD,
          draw: (el) => grouped(el, bins([0, 60, 80, 100, 120, 140, 160, 180], 'g2g_min'), F.int) },
        { key: 'type', title: 'By visit type', note: 'Average minutes gate to gate.', legend: MD,
          draw: (el) => dumbbell(el, { rows: pair(TYPES, (v) => v.visit_type, (vs) => avg(vs, 'g2g_min')), fmt: minFmt }) },
        { key: 'hour', title: 'By arrival hour', note: `Average minutes gate to gate for trucks arriving in each hour. The shaded gap is the time saved. Red dashed line = ${G2G_TARGET.max}-min maximum.`, legend: MD, wide: true,
          draw: (el) => lines(el, { keys: HOURS, label: hourLabel, fmt: F.min, ref: G2G_TARGET.max, gap: DIG, series: series(byHour) }) },
      ],
    }
  }

  if (id === 'detention') {
    const cm = man.filter((v) => v.detention_usd > 0)
    const cd = dig.filter((v) => v.detention_usd > 0)
    const run = (vs) => {
      let a = 0
      return WD.map((d) => (a += sum(vs.filter((v) => wd(v.day) === d), 'detention_usd')))
    }
    // Minutes past free time, back from the dollars.
    const overrun = (v) => (v.detention_usd / DETENTION.ratePerHour) * 60
    const ob = (vs, lo, hi) => vs.filter((v) => overrun(v) > lo && overrun(v) <= hi).length
    const byCarrier = pair(carriers, (v) => v.carrier, (vs) => sum(vs, 'detention_usd')).sort((a, b) => b.m - b.d - (a.m - a.d))
    const best = byCarrier[0]
    return {
      big: F.usd(imp.detention.saved),
      unit: 'this week',
      about: `Estimated charges ${F.usd(imp.detention.before)} → ${F.usd(imp.detention.after)} a week; about ${F.usd(imp.detention_year.saved)} a year at this pace. ${DETENTION.freeMin / 60} h free, then $${DETENTION.ratePerHour}/h.`,
      take: [
        `${cm.length} trucks were charged in the manual week and ${cd.length} in the digital week.`,
        best && best.m > best.d && `${best.k} saw the biggest drop (${F.usd(best.m)} → ${F.usd(best.d)}).`,
      ].filter(Boolean).join(' '),
      stats: [
        ['Trucks charged', `${cm.length} → ${cd.length}`, 'manual → digital', true],
        ['Average charge', `${F.usd(d3.mean(cm, (v) => v.detention_usd) || 0)} → ${F.usd(d3.mean(cd, (v) => v.detention_usd) || 0)}`, 'per charged truck'],
        ['Avoided this week', F.usd(imp.detention.saved), 'estimate', true],
        ['A year at this pace', F.usd(imp.detention_year.saved), '52 weeks like this one (estimate)', true],
      ],
      panels: [
        { key: 'run', title: 'How the week added up', note: 'Running total of estimated detention, Monday to Sunday. The shaded gap is the money avoided.', legend: [...MD, ['Avoided', SAVED]], wide: true,
          draw: (el) => lines(el, { keys: WD, fmt: F.usd, gap: DIG, endLabels: true, series: [{ name: 'Manual week', color: MAN, values: run(man) }, { name: 'Digital week', color: DIG, values: run(dig) }] }) },
        { key: 'past', title: 'How far past free time', note: `Charged trucks by minutes past the ${DETENTION.freeMin / 60}-hour free time.`, legend: MD,
          draw: (el) => grouped(el, [[0, 30, '1–30 min'], [30, 60, '30–60'], [60, 90, '60–90'], [90, Infinity, '90+']].map(([lo, hi, k]) => ({ k, m: ob(cm, lo, hi), d: ob(cd, lo, hi) })), F.int) },
        { key: 'weekday', title: 'By weekday', note: 'Estimated detention for each day of the week.', legend: MD,
          draw: (el) => grouped(el, pair(WD, (v) => wd(v.day), (vs) => sum(vs, 'detention_usd')).map((r) => ({ k: r.k, m: r.m ?? 0, d: r.d ?? 0 })), F.usd) },
        { key: 'carrier', title: 'By carrier', note: 'Estimated detention per carrier, biggest drop first. Red = went up.', legend: MD, wide: true,
          draw: (el) => dumbbell(el, { rows: byCarrier, fmt: F.usd }) },
      ],
    }
  }

  if (id === 'dock_wait') {
    const max = DOCK_WAIT
    const byHour = pair(HOURS, (v) => v.hour, (vs) => avg(vs, 'dock_wait_min'))
    const busy = pair(HOURS, (v) => v.hour, (vs) => vs.length).sort((a, b) => (b.m ?? 0) + (b.d ?? 0) - ((a.m ?? 0) + (a.d ?? 0)))[0]
    const busyRow = byHour.find((r) => r.k === busy?.k)
    const wMan = within(man, 'dock_wait_min', max.max) ?? 0
    const wDig = within(dig, 'dock_wait_min', max.max) ?? 0
    const parts = (w, n) => [
      { name: `Within ${max.max} min`, value: Math.round(w * n), color: DIG },
      { name: 'Longer', value: n - Math.round(w * n), color: 'var(--chart-muted)' },
    ]
    return {
      big: F.min(imp.dock_wait.saved),
      unit: 'min saved per truck',
      about: `Time from gate check-in until a dock is assigned, ${F.min(imp.dock_wait.before)} → ${F.min(imp.dock_wait.after)} min on average. Target ${max.min}–${max.max} min.`,
      take: [
        busyRow?.m != null && busyRow?.d != null && `The busiest arrival hour (${hourLabel(busy.k)}) waited ${F.min(busyRow.m)} min for a dock by paper and ${F.min(busyRow.d)} min on screen.`,
        `Trucks given a dock within ${max.max} min: ${F.pct(wMan)} → ${F.pct(wDig)}.`,
      ].filter(Boolean).join(' '),
      stats: [
        ['Average wait', `${F.min(imp.dock_wait.before)} → ${F.min(imp.dock_wait.after)} min`, 'manual → digital', true],
        [`Within ${max.max} min`, `${F.pct(wMan)} → ${F.pct(wDig)}`, 'of trucks', true],
        ['Longest wait', `${F.min(d3.max(man, (v) => v.dock_wait_min) ?? 0)} → ${F.min(d3.max(dig, (v) => v.dock_wait_min) ?? 0)} min`, 'single truck'],
        ['Waiting saved', `${F.min((imp.dock_wait.saved * nD) / 60)} h`, 'over the digital week', true],
      ],
      panels: [
        { key: 'hour', title: 'Wait for a dock, by arrival hour', note: `Average minutes from check-in to dock assigned. Green band = the ${max.min}–${max.max} min target; the shaded gap is the time saved.`, legend: MD, wide: true,
          draw: (el) => lines(el, { keys: HOURS, label: hourLabel, fmt: F.min, band: [max.min, max.max], gap: DIG, series: series(byHour) }) },
        { key: 'bands', title: 'How long trucks waited', note: 'Trucks per 15-minute band.', legend: MD,
          draw: (el) => grouped(el, bins([0, 15, 30, 45, 60, 75], 'dock_wait_min'), F.int) },
        { key: 'share', title: `Given a dock within ${max.max} minutes`, note: 'Share of trucks given a dock inside the target.', legend: [[`Within ${max.max} min`, DIG], ['Longer', 'var(--chart-muted)']],
          draw: (el) => twinDonut(el, { m: parts(wMan, man.length), d: parts(wDig, nD), centerLabel: 'within' }) },
        { key: 'weekday', title: 'By weekday', note: 'Average minutes waiting for a dock.', legend: MD, wide: true,
          draw: (el) => dumbbell(el, { rows: pair(WD, (v) => wd(v.day), (vs) => avg(vs, 'dock_wait_min')), fmt: minFmt }) },
      ],
    }
  }

  if (id === 'within') {
    const max = G2G_TARGET.max
    const om = man.filter((v) => v.g2g_min > max)
    const od = dig.filter((v) => v.g2g_min > max)
    const stageRows = IMPACT_STAGES.map((s) => ({ k: s.label, m: within(man, s.field, s.max), d: within(dig, s.field, s.max) }))
    const best = [...both(stageRows)].sort((a, b) => b.d - b.m - (a.d - a.m))[0]
    const daily = pair(WD, (v) => wd(v.day), (vs) => within(vs))
    const ob = (vs, lo, hi) => vs.filter((v) => v.g2g_min - max > lo && v.g2g_min - max <= hi).length
    return {
      big: F.pct(imp.within.after),
      unit: 'of trucks',
      about: `Share of trucks at or under ${max} min gate to gate, up from ${F.pct(imp.within.before)} in the manual week.`,
      take: [
        `${om.length} trucks went over ${max} min in the manual week, ${od.length} in the digital week.`,
        best && `The stage that improved most against its own target is ${best.k.toLowerCase()} (${F.pct(best.m)} → ${F.pct(best.d)} within).`,
      ].filter(Boolean).join(' '),
      stats: [
        [`Within ${max} min`, `${F.pct(imp.within.before)} → ${F.pct(imp.within.after)}`, 'manual → digital', true],
        ['Trucks over', `${om.length} → ${od.length}`, '', true],
        ['Average overrun', `${F.min(om.length ? avg(om, 'g2g_min') - max : 0)} → ${F.min(od.length ? avg(od, 'g2g_min') - max : 0)} min`, `for trucks over ${max}`],
        ['Worst truck', `${F.min(d3.max(man, (v) => v.g2g_min) ?? 0)} → ${F.min(d3.max(dig, (v) => v.g2g_min) ?? 0)} min`, 'gate to gate'],
      ],
      panels: [
        { key: 'daily', title: 'Within target, day by day', note: `Share of each weekday’s trucks at or under ${max} min. The shaded gap is the gain.`, legend: MD, wide: true,
          draw: (el) => lines(el, { keys: WD, fmt: (v) => F.pct(v).replace('.0%', '%'), max: 1, gap: DIG, series: series(daily) }) },
        { key: 'stages', title: 'Every stage against its own target', note: `Share of trucks inside each stage’s maximum (${IMPACT_STAGES.map((s) => `${SHORT[s.field].toLowerCase()} ${s.max}`).join(', ')} min).`, legend: MD,
          draw: (el) => dumbbell(el, { rows: stageRows, fmt: F.pct, higherIsBetter: true, delta: pts }) },
        { key: 'type', title: 'By visit type', note: `Share within ${max} min, manual → digital.`, legend: MD,
          draw: (el) => dumbbell(el, { rows: pair(TYPES, (v) => v.visit_type, (vs) => within(vs)), fmt: F.pct, higherIsBetter: true, delta: pts }) },
        { key: 'over', title: 'How far over, for the trucks that went over', note: `Trucks by minutes past the ${max}-min maximum.`, legend: MD, wide: true,
          draw: (el) => grouped(el, [[0, 15, '1–15 min'], [15, 30, '15–30'], [30, 60, '30–60'], [60, Infinity, '60+']].map(([lo, hi, k]) => ({ k, m: ob(om, lo, hi), d: ob(od, lo, hi) })), F.int) },
      ],
    }
  }

  if (id === 'phone') {
    const days = WD.map((d) => {
      const vs = man.filter((v) => wd(v.day) === d)
      return { k: d, n: vs.length, calls: sum(vs, 'phone_calls'), paper: sum(vs, 'paper_handoffs'), searchMin: sum(vs, 'yard_search_min') }
    }).filter((r) => r.n)
    // Staff hours: calls and handoffs × the minutes set on the page (an estimate); yard search is measured.
    const hoursByDay = days.map((r) => ({ k: r.k, n: r.n, calls: (r.calls * staff.call) / 60, paper: (r.paper * staff.paper) / 60, search: r.searchMin / 60 }))
    const staffH = d3.sum(hoursByDay, (r) => r.calls + r.paper + r.search)
    const fte = (staffH * 52) / FULL_TIME_HOURS
    const parts = [['Phone calls', 'calls', V('blue')], ['Paper handoffs', 'paper', V('gold')], ['Searching the yard', 'search', V('purple')]]
    const byHour = HOURS.map((h) => ({ k: h, n: sum(man.filter((v) => v.hour === h), 'phone_calls') }))
    const peak = [...byHour].sort((a, b) => b.n - a.n)[0]
    const docks = [...new Set(man.map((v) => v.door).filter((d) => d != null))].sort((a, b) => a - b).map((d) => ({ k: d, n: sum(man.filter((v) => v.door === d), 'yard_search_min') }))
    const perTruck = man.length ? imp.phone_calls.before / man.length : 0
    return {
      big: F.int(imp.phone_calls.saved),
      unit: 'calls a week',
      about: `In the manual week the gate and Shipping passed every update by phone and paper: ${F.int(imp.phone_calls.before)} calls, ${F.int(imp.paper_handoffs.before)} paper handoffs and ${F.min(imp.yard_search.before)} h walking the yard. The digital week needed none.`,
      take: [
        `About ${F.min(staffH)} staff hours a week went into calls, paper and walking the yard (${F.min1(man.length ? (staffH / man.length) * 60 : 0)} min per truck).`,
        `That is roughly ${F.int(Math.round(staffH * 52))} hours a year, about ${F.min1(fte)} full-time people.`,
        peak?.n > 0 && `The phone rang most for trucks arriving around ${hourLabel(peak.k)} (${peak.n} calls).`,
      ].filter(Boolean).join(' '),
      stats: [
        ['Staff time freed', `≈ ${F.min(staffH)} h`, 'a week (estimate)', true],
        ['A year at this pace', `≈ ${F.int(Math.round(staffH * 52))} h`, `about ${F.min1(fte)} full-time people`, true],
        ['Phone calls', `${F.int(imp.phone_calls.before)} → 0`, `${F.min1(perTruck)} per truck`],
        ['Paper handoffs', `${F.int(imp.paper_handoffs.before)} → 0`, `plus ${F.min1(imp.yard_search.before)} h searching the yard`],
      ],
      panels: [
        { kind: 'staff', key: 'staff', title: 'Staff time freed, by day', wide: true,
          note: 'Hours the gate, Shipping and dock staff spent on the phone, carrying paper and searching the yard in the manual week. Yard search is measured; calls and handoffs use the minutes below (an estimate, saved on this device).',
          legend: parts.map(([n, , c]) => [n, c]),
          draw: (el) => TT.stackBars(el, { rows: hoursByDay, key: (r) => r.k, fmt: (v) => F.min(v), series: parts.map(([name, field, color]) => ({ field, name, color })), tipHead: (r) => `${r.k} · ${F.min1(r.calls + r.paper + r.search)} h staff time` }),
          drawSplit: (el) => TT.donut(el, { parts: parts.map(([name, f, color]) => ({ name, value: Math.round(d3.sum(hoursByDay, (r) => r[f]) * 10) / 10, color })), center: `${F.min(staffH)} h`, centerLabel: 'a week', height: 260 }) },
        { key: 'calls', title: 'Calls and paper, by day (manual week)', note: 'Every one of these is now a status change on screen. The digital week has none.', legend: [['Phone calls', V('blue')], ['Paper handoffs', V('gold')]], wide: true,
          draw: (el) => TT.stackBars(el, { rows: days, key: (r) => r.k, fmt: F.int, series: [{ field: 'calls', name: 'Phone calls', color: V('blue') }, { field: 'paper', name: 'Paper handoffs', color: V('gold') }], tipHead: (r) => `${r.k} · ${r.n} trucks` }) },
        { key: 'hour', title: 'When the phone rang', note: 'Calls in the manual week by the truck’s arrival hour. Busy hours meant the most calls, right when people were busiest.', legend: [['Calls', V('blue')]],
          draw: (el) => TT.vbars(el, { rows: byHour, key: (r) => r.k, label: hourLabel, value: (r) => r.n, fmt: F.int, color: () => V('blue'), tip: (r) => [hourLabel(r.k), [[V('blue'), 'Calls', r.n]]] }) },
        { key: 'search', title: 'Searching the yard, by dock', note: 'Minutes spent finding the trailer before loading, manual week. The Live yard now shows where every truck is.', legend: [['Minutes searching', V('purple')]],
          draw: (el) => TT.vbars(el, { rows: docks, key: (r) => r.k, label: (d) => `Dock ${d}`, value: (r) => r.n, fmt: F.int, color: () => V('purple'), tip: (r) => [`Dock ${r.k}`, [[V('purple'), 'Searching', `${r.n} min`]]] }) },
        { kind: 'swap', key: 'swap', title: 'What replaced each call and sheet', note: 'The same handoffs still happen; they now travel on the shared screen.', wide: true,
          rows: [
            ['Gate phones Shipping: a truck has arrived', 'The truck appears on the Shipping board the moment the guard saves the check-in'],
            ['Shipping phones the gate with a dock number', 'Shipping taps a free dock; the driver’s dock shows at the gate'],
            ['Someone walks the yard to find the trailer', 'Live yard shows each truck’s dock and stage'],
            ['Inspection sheet carried to the office', 'The inspector saves the checklist on the tablet'],
            ['Release slip carried to the gate', 'The inspector taps Release to gate; Gate checkout opens with the Order No and seal filled in'],
          ] },
      ],
    }
  }

  // Truck hours freed up
  const stageHours = IMPACT_STAGES.map((s) => ({ k: s.label, v: ((avg(man, s.field) - avg(dig, s.field)) * nD) / 60 }))
  const docks = [...new Set(man.concat(dig).map((v) => v.door).filter((d) => d != null))].sort((a, b) => a - b)
  const dockSaved = (sum(man, 'dock_min') - sum(dig, 'dock_min')) / 60
  const avgDock = avg(dig, 'dock_min')
  const moreTrucks = avgDock ? Math.max(0, Math.floor((dockSaved * 60) / avgDock)) : 0
  const byCarrier = carriers.map((c) => {
    const d = dig.filter((v) => v.carrier === c)
    return { k: c, n: d.length, v: ((avg(man.filter((v) => v.carrier === c), 'g2g_min') - avg(d, 'g2g_min')) * d.length) / 60 }
  }).sort((a, b) => b.v - a.v)
  const hBars = (el, rows) =>
    TT.hbars(el, { rows, key: (r) => r.k, label: (r) => r.k, value: (r) => Math.abs(r.v), fmt: (v) => `${F.min1(v)} h`, color: (r) => (r.v >= 0 ? SAVED : BAD), isBad: (r) => r.v < 0,
      tip: (r) => [r.k, [[r.v >= 0 ? SAVED : BAD, r.v >= 0 ? 'Hours back' : 'Took longer', `${F.min1(Math.abs(r.v))} h`], ...(r.n ? [[null, 'Trucks', r.n]] : [])]] })
  return {
    big: F.min(imp.truck_hours.saved),
    unit: 'hours this week',
    about: `Total time trucks spent on site, ${F.min(imp.truck_hours.before)} → ${F.min(imp.truck_hours.after)} truck hours a week. Hours that drivers, docks and the yard get back.`,
    take: [
      dockSaved > 0 && `Dock time alone dropped by ${F.min(dockSaved)} hours, room for about ${moreTrucks} more trucks a week at today’s dock times.`,
      byCarrier[0]?.v > 0 && `${byCarrier[0].k} drivers got the most time back (${F.min1(byCarrier[0].v)} h).`,
    ].filter(Boolean).join(' '),
    stats: [
      ['Truck hours on site', `${F.min(imp.truck_hours.before)} → ${F.min(imp.truck_hours.after)}`, 'manual → digital', true],
      ['Dock hours freed', `${F.min(dockSaved)} h`, 'pre-load, loading and inspection', true],
      ['Room for', `≈ ${moreTrucks} more trucks`, 'a week, same docks (estimate)'],
      ['Per truck', minFmt(imp.g2g.saved), 'back to each driver'],
    ],
    panels: [
      { key: 'stages', title: 'Where the hours came back', note: 'Hours saved at each stage over the digital week’s trucks (average saving × trucks).', legend: [['Hours back', SAVED], ['Took longer', BAD]],
        draw: (el) => hBars(el, stageHours) },
      { key: 'weekday', title: 'Truck hours on site, by weekday', note: 'Total hours trucks spent between the gates.', legend: MD,
        draw: (el) => grouped(el, pair(WD, (v) => wd(v.day), (vs) => sum(vs, 'g2g_min') / 60).map((r) => ({ k: r.k, m: r.m ?? 0, d: r.d ?? 0 })), F.min) },
      { key: 'docks', title: 'Dock hours, by dock', note: 'Hours each dock was busy with pre-loading, loading and inspection. Freed dock hours are room for more trucks.', legend: MD, wide: true,
        draw: (el) => grouped(el, pair(docks, (v) => v.door, (vs) => sum(vs, 'dock_min') / 60).map((r) => ({ k: `Dock ${r.k}`, m: r.m ?? 0, d: r.d ?? 0 })), F.min) },
      { key: 'carrier', title: 'Driver hours back, by carrier', note: 'Hours saved over the digital week for each carrier’s trucks.', legend: [['Hours back', SAVED], ['Lost', BAD]], wide: true,
        draw: (el) => hBars(el, byCarrier) },
    ],
  }
}
