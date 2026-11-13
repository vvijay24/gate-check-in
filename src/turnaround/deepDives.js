// The charts inside each Overview metric's deep dive: a different mix per metric, in the Live yard colors
// (index.css --dive-*, validated light and dark with the dataviz palette check). Red is kept for problems
// only: over target, late, and detention dollars. Every number comes from the kit's metrics.js rows.
import * as d3 from 'd3'
import { TT } from './charts'
import { DETENTION, DOCK_TARGET, G2G_TARGET, ON_TIME_WINDOW } from './targets'

const V = (n) => `var(--dive-${n})`
const BAD = 'var(--p-red)'
const OK = V('teal')
const MUTED = 'var(--chart-muted)'
// The seven stages in the order a truck moves; loading, inspection and checkout match the Live yard.
// Waiting for the order is grey, like the Live yard's "Waiting for order".
const STAGES = [
  ['avg_gate_in', 'Gate check-in', V('s1')],
  ['avg_order_wait', 'Waiting for order', V('s0')],
  ['avg_assign', 'Dock assignment', V('s2')],
  ['avg_preload', 'Pre-loading', V('s3')],
  ['avg_load', 'Loading', V('s4')],
  ['avg_inspection', 'Inspection', V('s5')],
  ['avg_checkout', 'Gate checkout', V('s6')],
]
export const TYPE_COLOR = { Pickup: V('gold'), 'Drop trailer': V('purple') }
const ARRIVAL = [
  { field: 'early', name: 'Early', color: V('purple') },
  { field: 'on_time', name: 'On time', color: OK },
  { field: 'late', name: 'Late', color: BAD },
]
const TYPES = [
  { field: 'pickup', name: 'Pickup', color: TYPE_COLOR.Pickup },
  { field: 'drop', name: 'Drop trailer', color: TYPE_COLOR['Drop trailer'] },
]
const legendOf = (series) => series.map((s) => [s.name, s.color])

// A running total as a line with a soft wash, in the kit's chart style.
function runLine(el, rows, { value, label, fmt, color }) {
  el.replaceChildren()
  const W = Math.max(280, el.clientWidth || 600)
  const H = 240
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
  let acc = 0
  const pts = rows.map((r) => ({ k: r.group, v: (acc += value(r)) }))
  if (!pts.length) return
  const y = d3.scaleLinear([0, d3.max(pts, (p) => p.v) * 1.15 || 1], [H - 24, 12]).nice()
  const ml = 54
  const x = d3.scalePoint(pts.map((p) => p.k), [ml + 12, W - 44])
  svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', ml).attr('x2', W - 6).attr('y1', y).attr('y2', y).style('stroke', 'var(--chart-grid)')
  svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', ml - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(fmt).style('fill', 'var(--chart-axis)').style('font-size', '12px')
  svg.append('g').selectAll('text').data(pts).join('text').attr('x', (p) => x(p.k)).attr('y', H - 6).attr('text-anchor', 'middle').text((p) => label(p.k)).style('fill', 'var(--chart-axis)').style('font-size', '12px')
  svg.append('path').datum(pts).attr('d', d3.area().x((p) => x(p.k)).y0(y(0)).y1((p) => y(p.v)).curve(d3.curveMonotoneX)).style('fill', color).attr('opacity', 0.12)
  svg.append('path').datum(pts).attr('d', d3.line().x((p) => x(p.k)).y((p) => y(p.v)).curve(d3.curveMonotoneX)).style('fill', 'none').style('stroke', color).attr('stroke-width', 2)
  svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => x(p.k)).attr('cy', (p) => y(p.v)).attr('r', 4.5).style('fill', color).style('stroke', 'var(--color-panel)').attr('stroke-width', 2)
    .append('title').text((p) => `${label(p.k)} · ${fmt(p.v)} so far`)
  const last = pts[pts.length - 1]
  svg.append('text').attr('x', x(last.k) + 8).attr('y', y(last.v) - 10).attr('text-anchor', 'end').text(fmt(last.v)).style('fill', 'var(--color-fg)').style('font-weight', 700).style('font-size', '14px')
}

// Panels for one metric. `ctx`: { visits, summary, labels: { day, longDay, hour } }. Each panel:
// { key, title, note, legend: [[name, color]], wide, draw(el) }.
export function deepDive(id, ctx) {
  const F = TT.FMT
  const { visits, summary } = ctx
  const { day, longDay, hour } = ctx.labels
  const all = summary[0]
  const by = (k) => summary.filter((s) => s.group_kind === k)
  const days = by('day')
  const hours = by('hour').sort((a, b) => a.group - b.group)
  const row = (c, n, v) => [c, n, v]
  const dayHead = (r) => `${longDay(r.group)} · ${r.trucks} trucks`
  const carriersBy = (f, dir = -1) => by('carrier').sort((a, b) => dir * (a[f] - b[f]))

  if (id === 'g2g') {
    const within = visits.filter((v) => v.g2g_min <= G2G_TARGET.max).length
    return [
      {
        key: 'stages', wide: true, title: 'Where the time went, by day',
        note: `Each bar is the day’s average truck, split into its six stages. Red dashed line = the ${G2G_TARGET.max}-min maximum.`,
        legend: STAGES.map(([, n, c]) => [n, c]),
        draw: (el) => TT.stackBars(el, { rows: days, key: (r) => r.group, label: day, fmt: F.min, ref: G2G_TARGET.max, refLabel: `Max ${G2G_TARGET.max} min`, series: STAGES.map(([field, name, color]) => ({ field, name, color })), tipHead: dayHead }),
      },
      {
        key: 'split', title: 'Within vs over target', note: 'Every truck in this range.', legend: [[`Within ${G2G_TARGET.max} min`, OK], ['Over', BAD]],
        draw: (el) => TT.donut(el, { parts: [{ name: `Within ${G2G_TARGET.max} min`, value: within, color: OK }, { name: 'Over', value: visits.length - within, color: BAD }], center: F.pct(visits.length ? within / visits.length : 0), centerLabel: 'within' }),
      },
      {
        key: 'type', title: 'By visit type', note: 'Average minutes gate to gate.', legend: Object.entries(TYPE_COLOR),
        draw: (el) => TT.hbars(el, { rows: by('type'), key: (r) => r.group, label: (r) => r.group, value: (r) => r.avg_g2g, fmt: (v) => F.min(v) + ' min', color: (r) => TYPE_COLOR[r.group], isBad: (r) => r.avg_g2g > G2G_TARGET.max, tip: (r) => [r.group, [row(TYPE_COLOR[r.group], 'Average', F.min(r.avg_g2g) + ' min'), row(null, 'Trucks', r.trucks)]] }),
      },
      {
        key: 'carrier', wide: true, title: 'By carrier, slowest first', note: `Red = the carrier averages over ${G2G_TARGET.max} min.`, legend: [['Within', OK], ['Over', BAD]],
        draw: (el) => TT.hbars(el, { rows: carriersBy('avg_g2g'), key: (r) => r.group, label: (r) => r.group, value: (r) => r.avg_g2g, fmt: (v) => F.min(v) + ' min', color: (r) => (r.avg_g2g > G2G_TARGET.max ? BAD : OK), isBad: (r) => r.avg_g2g > G2G_TARGET.max, tip: (r) => [r.group, [row(null, 'Average', F.min(r.avg_g2g) + ' min'), row(null, 'Trucks', r.trucks)]] }),
      },
    ]
  }

  if (id === 'dock') {
    const parts = [STAGES[2], STAGES[3], STAGES[4]]
    const top = Math.max(DOCK_TARGET.max + 20, ...visits.map((v) => v.dock_min))
    const bins = []
    for (let b = 0; b < top; b += 10) bins.push({ b, n: visits.filter((v) => v.dock_min >= b && v.dock_min < b + 10).length })
    const BAND = (b) => (b + 10 <= DOCK_TARGET.min ? OK : b >= DOCK_TARGET.max ? BAD : V('gold'))
    const docks = d3
      .rollups(visits.filter((v) => v.door != null && v.door !== ''), (g) => ({ avg: d3.mean(g, (v) => v.dock_min), n: g.length }), (v) => String(v.door))
      .map(([door, x]) => ({ door, ...x }))
      .sort((a, b) => String(a.door).localeCompare(String(b.door), undefined, { numeric: true }))
    return [
      {
        key: 'parts', wide: true, title: 'Time at the dock, by day',
        note: `Each bar is the day’s average truck at the dock. Red dashed line = the ${DOCK_TARGET.max}-min maximum.`,
        legend: parts.map(([, n, c]) => [n, c]),
        draw: (el) => TT.stackBars(el, { rows: days, key: (r) => r.group, label: day, fmt: F.min, ref: DOCK_TARGET.max, refLabel: `Max ${DOCK_TARGET.max} min`, series: parts.map(([field, name, color]) => ({ field, name, color })), tipHead: dayHead }),
      },
      {
        key: 'spread', title: 'Spread across trucks', note: 'How many trucks spent each 10 minutes at the dock.',
        legend: [[`Quick (under ${DOCK_TARGET.min})`, OK], [`In target (${DOCK_TARGET.min}–${DOCK_TARGET.max})`, V('gold')], [`Over ${DOCK_TARGET.max}`, BAD]],
        draw: (el) => TT.vbars(el, { rows: bins, key: (r) => r.b, label: (b) => `${b}`, value: (r) => r.n, fmt: F.int, color: (r) => BAND(r.b), tip: (r) => [`${r.b}–${r.b + 10} min`, [row(BAND(r.b), 'Trucks', r.n)]] }),
      },
      {
        key: 'docks', title: 'By dock', note: `Average minutes at each dock. Red = over ${DOCK_TARGET.max}.`, legend: [['Within', V('blue')], ['Over', BAD]],
        draw: (el) => TT.vbars(el, { rows: docks, key: (r) => r.door, label: (d) => `Dock ${d}`, value: (r) => r.avg, fmt: F.min, ref: DOCK_TARGET.max, color: (r) => (r.avg > DOCK_TARGET.max ? BAD : V('blue')), tip: (r) => [`Dock ${r.door}`, [row(null, 'Average', F.min(r.avg) + ' min'), row(null, 'Trucks', r.n)]] }),
      },
      {
        key: 'carrier', wide: true, title: 'By carrier, slowest first', note: 'Average minutes at the dock.', legend: [['Within', OK], ['Over', BAD]],
        draw: (el) => TT.hbars(el, { rows: carriersBy('avg_dock'), key: (r) => r.group, label: (r) => r.group, value: (r) => r.avg_dock, fmt: (v) => F.min(v) + ' min', color: (r) => (r.avg_dock > DOCK_TARGET.max ? BAD : OK), isBad: (r) => r.avg_dock > DOCK_TARGET.max, tip: (r) => [r.group, [row(null, 'Average', F.min(r.avg_dock) + ' min'), row(null, 'Trucks', r.trucks)]] }),
      },
    ]
  }

  if (id === 'ontime') {
    return [
      {
        key: 'days', wide: true, title: 'Arrivals by day', note: `Trucks per day, split by when they arrived against their appointment (on time = within ±${ON_TIME_WINDOW} min).`, legend: legendOf(ARRIVAL),
        draw: (el) => TT.stackBars(el, { rows: days, key: (r) => r.group, label: day, fmt: F.int, series: ARRIVAL, tipHead: dayHead }),
      },
      {
        key: 'split', title: 'Early, on time, late', note: 'Every truck in this range.', legend: legendOf(ARRIVAL),
        draw: (el) => TT.donut(el, { parts: ARRIVAL.map((s) => ({ name: s.name, value: all[s.field], color: s.color })), center: F.pct(all.on_time_rate), centerLabel: 'on time' }),
      },
      {
        key: 'hours', title: 'By appointment hour', note: 'Which slots run late.', legend: legendOf(ARRIVAL),
        draw: (el) => TT.stackBars(el, { rows: hours, key: (r) => r.group, label: hour, fmt: F.int, series: ARRIVAL, tipHead: (r) => `${hour(r.group)} · ${r.trucks} trucks` }),
      },
      {
        key: 'carrier', wide: true, title: 'On-time rate by carrier', note: 'Highest first.', legend: [['On-time rate', OK]],
        draw: (el) => TT.hbars(el, { rows: carriersBy('on_time_rate'), key: (r) => r.group, label: (r) => r.group, value: (r) => r.on_time_rate, fmt: F.pct, color: () => OK, tip: (r) => [r.group, [row(OK, 'On time', F.pct(r.on_time_rate)), row(null, 'Trucks', r.trucks)]] }),
      },
    ]
  }

  if (id === 'trucks') {
    return [
      {
        key: 'days', wide: true, title: 'Trucks per day', note: 'Split by visit type.', legend: legendOf(TYPES),
        draw: (el) => TT.stackBars(el, { rows: days, key: (r) => r.group, label: day, fmt: F.int, series: TYPES, tipHead: dayHead }),
      },
      {
        key: 'mix', title: 'Mix of visit types', note: 'Every truck in this range.', legend: legendOf(TYPES),
        draw: (el) => TT.donut(el, { parts: TYPES.map((s) => ({ name: s.name, value: all[s.field], color: s.color })), center: F.int(all.trucks), centerLabel: 'trucks' }),
      },
      {
        key: 'hours', title: 'Arrivals by appointment hour', note: 'When the gate is busiest, by type.', legend: legendOf(TYPES),
        draw: (el) => TT.stackBars(el, { rows: hours, key: (r) => r.group, label: hour, fmt: F.int, series: TYPES, tipHead: (r) => `${hour(r.group)} · ${r.trucks} trucks` }),
      },
      {
        key: 'carrier', wide: true, title: 'Top carriers', note: 'Trucks in this range.', legend: [['Trucks', V('blue')]],
        draw: (el) => TT.hbars(el, { rows: carriersBy('trucks'), key: (r) => r.group, label: (r) => r.group, value: (r) => r.trucks, fmt: F.int, color: () => V('blue'), tip: (r) => [r.group, [row(V('blue'), 'Trucks', r.trucks)]] }),
      },
    ]
  }

  if (id === 'within') {
    const rows = days.map((d) => ({ ...d, within_n: d.trucks - d.over_count }))
    return [
      {
        key: 'days', wide: true, title: 'Within vs over, by day', note: `Trucks per day at or under ${G2G_TARGET.max} min gate to gate, and over it.`, legend: [[`Within ${G2G_TARGET.max} min`, OK], ['Over', BAD]],
        draw: (el) => TT.stackBars(el, { rows, key: (r) => r.group, label: day, fmt: F.int, series: [{ field: 'within_n', name: `Within ${G2G_TARGET.max} min`, color: OK }, { field: 'over_count', name: 'Over', color: BAD }], tipHead: dayHead }),
      },
      {
        key: 'type', title: 'By visit type', note: 'Share within target.', legend: Object.entries(TYPE_COLOR),
        draw: (el) => TT.hbars(el, { rows: by('type'), key: (r) => r.group, label: (r) => r.group, value: (r) => r.within_target_rate, fmt: F.pct, color: (r) => TYPE_COLOR[r.group], tip: (r) => [r.group, [row(TYPE_COLOR[r.group], 'Within', F.pct(r.within_target_rate)), row(null, 'Trucks', r.trucks)]] }),
      },
      {
        key: 'late', title: 'Does arriving late slow the whole visit?', note: `One dot per truck. Green band = on time; above the red line = over ${G2G_TARGET.max} min.`, legend: [['Within', OK], ['Over', BAD]],
        draw: (el) => TT.scatter(el, { rows: visits, x: (v) => v.arrival_delta_min, y: (v) => v.g2g_min, color: (v) => (v.g2g_min > G2G_TARGET.max ? BAD : OK), xBand: [-ON_TIME_WINDOW, ON_TIME_WINDOW], yRef: G2G_TARGET.max, xTitle: 'Minutes vs appointment', tip: (v) => [`${v.carrier} · ${day(v.day)}`, [row(null, 'Vs appointment', `${v.arrival_delta_min} min`), row(null, 'Gate to gate', F.min(v.g2g_min) + ' min')]] }),
      },
      {
        key: 'carrier', wide: true, title: 'By carrier', note: 'Share of each carrier’s trucks within target, highest first.', legend: [['Within target', OK]],
        draw: (el) => TT.hbars(el, { rows: carriersBy('within_target_rate'), key: (r) => r.group, label: (r) => r.group, value: (r) => r.within_target_rate, fmt: F.pct, color: () => OK, tip: (r) => [r.group, [row(OK, 'Within', F.pct(r.within_target_rate)), row(null, 'Trucks', r.trucks)]] }),
      },
    ]
  }

  // Detention risk
  return [
    {
      key: 'days', title: 'Estimated charges by day', note: 'Dollars carriers could bill for each day’s trucks.', legend: [['Detention $', BAD]],
      draw: (el) => TT.vbars(el, { rows: days, key: (r) => r.group, label: day, value: (r) => r.detention_usd, fmt: F.usd, color: () => BAD, tip: (r) => [longDay(r.group), [row(BAD, 'Detention', F.usd(r.detention_usd)), row(null, 'Trucks charged', r.detained)]] }),
    },
    {
      key: 'total', title: 'Running total', note: 'How the range’s detention added up, day by day.', legend: [['Total so far', BAD]],
      draw: (el) => runLine(el, days, { value: (r) => r.detention_usd, label: day, fmt: F.usd, color: BAD }),
    },
    {
      key: 'held', wide: true, title: 'Who was held, who got charged',
      note: `One dot per truck. Red dots are charged; teal ones left within free time. Above the red line = on site past the ${DETENTION.freeMin / 60} h free.`,
      legend: [['Charged', BAD], ['No charge', OK]],
      draw: (el) => TT.scatter(el, { rows: visits, x: (v) => v.arrival_delta_min, y: (v) => v.g2g_min, color: (v) => (v.detention_usd > 0 ? BAD : OK), xBand: [-ON_TIME_WINDOW, ON_TIME_WINDOW], yRef: DETENTION.freeMin, xTitle: 'Minutes vs appointment', tip: (v) => [`${v.carrier} · ${day(v.day)}`, [row(null, 'On site', F.min(v.g2g_min) + ' min'), row(null, 'Charge', F.usd(v.detention_usd))]] }),
    },
    {
      key: 'carrier', wide: true, title: 'By carrier', note: 'Estimated charges in this range, largest first.', legend: [['Detention $', BAD], ['None', MUTED]],
      draw: (el) => TT.hbars(el, { rows: carriersBy('detention_usd'), key: (r) => r.group, label: (r) => r.group, value: (r) => r.detention_usd, fmt: F.usd, color: (r) => (r.detention_usd > 0 ? BAD : MUTED), tip: (r) => [r.group, [row(BAD, 'Detention', F.usd(r.detention_usd)), row(null, 'Trucks charged', r.detained)]] }),
    },
  ]
}
