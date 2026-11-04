/* =====================================================================
   Turnaround charts: d3 v7 helpers that match theme.css
   Load d3 first: <script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
   Every function draws into an element (usually <div class="tt-chart">),
   sizes itself from the element's width, and can be called again to redraw.
   ===================================================================== */
(function () {
  const V = (n) => `var(--p-${n})`;
  const C = {
    navy: V('navy'), navy2: V('navy-2'), sky: V('sky'), yolk: V('yolk'), gold: V('gold-1'), amber: V('amber'),
    teal: V('teal'), red: V('red'), green: V('green'), muted: 'var(--chart-muted)',
    // stage order: gate check-in, dock assignment, pre-loading, loading/unloading, inspection, gate checkout
    stages: ['sky', 'navy', 'gold-1', 'yolk', 'amber', 'navy-2'].map(V),
    // visit types: delivery, pickup, drop trailer
    types: ['navy', 'yolk', 'teal'].map(V),
  };
  const FMT = {
    min: (v) => d3.format(',.0f')(v), min1: (v) => d3.format(',.1f')(v), pct: (v) => d3.format('.1%')(v),
    int: (v) => d3.format(',')(v), usd: (v) => '$' + d3.format(',.0f')(v), spct: (v) => d3.format('+.0%')(v).replace('-', '−'),
  };

  function computed(color, host) {
    const p = document.createElement('span'); p.style.color = color; p.hidden = true; host.appendChild(p);
    const c = getComputedStyle(p).color; p.remove(); return c;
  }
  function tip(el) {
    const t = document.createElement('div'); t.className = 'tt-tip'; el.appendChild(t);
    return {
      show(ev, head, lines) {
        t.replaceChildren();
        const h = document.createElement('div'); h.className = 'h'; h.textContent = head; t.appendChild(h);
        (lines || []).forEach(([color, name, value]) => {
          const r = document.createElement('div'); r.className = 'r';
          if (color) { const i = document.createElement('i'); i.style.background = color; r.appendChild(i); }
          const s = document.createElement('span'); s.textContent = name ? `${name}: ${value}` : value; r.appendChild(s);
          t.appendChild(r);
        });
        const b = el.getBoundingClientRect();
        let x = ev.clientX - b.left + 12, y = ev.clientY - b.top - 10;
        t.style.opacity = 1;
        if (x + t.offsetWidth > el.clientWidth) x = ev.clientX - b.left - t.offsetWidth - 12;
        t.style.left = Math.max(0, x) + 'px'; t.style.top = Math.max(0, Math.min(y, el.clientHeight - t.offsetHeight)) + 'px';
      },
      hide() { t.style.opacity = 0; },
    };
  }
  function svgIn(el, H) {
    el.replaceChildren();
    const W = Math.max(280, el.clientWidth || 600);
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    return { svg, W, H };
  }
  function textWidth(svg, strings) {
    const t = svg.append('text'); let w = 0;
    strings.forEach((s) => { t.text(s); w = Math.max(w, t.node().getComputedTextLength()); });
    t.remove(); return w;
  }
  function yAxis(svg, y, x0, x1, fmt, n) {
    const ticks = y.ticks(n || 4), g = svg.append('g');
    g.selectAll('line').data(ticks).join('line').attr('x1', x0).attr('x2', x1).attr('y1', y).attr('y2', y)
      .style('stroke', (d) => (d === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'));
    g.selectAll('text').data(ticks).join('text').attr('x', x0 - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt);
  }
  function xLabels(svg, x, keys, label, yPos) {
    const widest = textWidth(svg, keys.map(label));
    const step = Math.max(1, Math.ceil((widest + 8) / x.step()));
    svg.append('g').selectAll('text').data(keys.filter((_, i) => i % step === 0)).join('text')
      .attr('x', (k) => x(k) + x.bandwidth() / 2).attr('y', yPos).attr('text-anchor', 'middle').text(label);
  }
  function refLine(svg, x0, x1, yv, label, W) {
    svg.append('line').attr('x1', x0).attr('x2', x1).attr('y1', yv).attr('y2', yv).style('stroke', C.red).attr('stroke-dasharray', '6 4').attr('stroke-width', 1.5);
    if (label) svg.append('text').attr('x', W - 8).attr('y', yv - 6).attr('text-anchor', 'end').style('fill', C.red).text(label);
  }

  /* Vertical bars.
     o: {rows, key(r), label(key), value(r), fmt, color(r)?, band:[lo,hi]?, ref?, refLabel?, tip(r)->[head, lines], height} */
  function vbars(el, o) {
    const H = o.height || 240, { svg, W } = svgIn(el, H);
    const top = d3.max([...o.rows.map(o.value), o.band ? o.band[1] : 0, o.ref || 0]) || 1;
    const y = d3.scaleLinear([0, top * 1.12], [H - 24, 10]).nice();
    const ml = textWidth(svg, y.ticks(4).map(o.fmt)) + 12;
    const x = d3.scaleBand(o.rows.map(o.key), [ml, W - 6]).padding(0.28);
    if (o.band) svg.append('rect').attr('x', ml).attr('width', W - 6 - ml).attr('y', y(o.band[1])).attr('height', y(o.band[0]) - y(o.band[1])).style('fill', C.green).attr('opacity', 0.12);
    yAxis(svg, y, ml, W - 6, o.fmt);
    const bw = Math.min(x.bandwidth(), 40), t = tip(el);
    svg.append('g').selectAll('rect').data(o.rows).join('rect')
      .attr('x', (r) => x(o.key(r)) + (x.bandwidth() - bw) / 2).attr('width', bw)
      .attr('y', (r) => y(o.value(r))).attr('height', (r) => Math.max(0, y(0) - y(o.value(r)))).attr('rx', 6)
      .style('fill', (r) => (o.color ? o.color(r) : (o.band && o.value(r) > o.band[1] ? C.red : C.navy)))
      .on('mousemove', (ev, r) => o.tip && t.show(ev, ...o.tip(r))).on('mouseleave', () => t.hide());
    if (o.ref) refLine(svg, ml, W - 6, y(o.ref), o.refLabel, W);
    xLabels(svg, x, o.rows.map(o.key), o.label || String, H - 6);
  }

  /* Horizontal bars with optional target band per row.
     o: {rows, key(r), label(r), value(r), fmt, color(r,i), band(r)->[lo,hi]?, isBad(r)?, tip(r)} */
  function hbars(el, o) {
    const rowH = 30, H = o.rows.length * rowH + 10, { svg, W } = svgIn(el, H);
    const ml = textWidth(svg, o.rows.map(o.label)) + 12;
    const mr = textWidth(svg, o.rows.map((r) => o.fmt(o.value(r)))) + 14;
    const top = d3.max(o.rows, (r) => Math.max(o.value(r), o.band ? o.band(r)[1] : 0)) || 1;
    const x = d3.scaleLinear([0, top * 1.05], [ml, W - mr]);
    const y = d3.scaleBand(o.rows.map(o.key), [4, H - 6]).padding(0.3);
    const t = tip(el);
    if (o.band) svg.append('g').selectAll('rect').data(o.rows).join('rect')
      .attr('x', (r) => x(o.band(r)[0])).attr('width', (r) => x(o.band(r)[1]) - x(o.band(r)[0]))
      .attr('y', (r) => y(o.key(r)) - 3).attr('height', y.bandwidth() + 6).attr('rx', 4).style('fill', C.green).attr('opacity', 0.18);
    svg.append('line').attr('x1', ml).attr('x2', ml).attr('y1', 0).attr('y2', H - 4).style('stroke', 'var(--chart-axis)');
    const g = svg.append('g').selectAll('g').data(o.rows).join('g');
    g.append('text').attr('x', ml - 8).attr('y', (r) => y(o.key(r)) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(o.label);
    g.append('rect').attr('x', ml).attr('y', (r) => y(o.key(r))).attr('height', y.bandwidth()).attr('rx', 4)
      .attr('width', (r) => Math.max(0, x(o.value(r)) - ml)).style('fill', (r, i) => (o.color ? o.color(r, i) : C.navy))
      .on('mousemove', (ev, r) => o.tip && t.show(ev, ...o.tip(r))).on('mouseleave', () => t.hide());
    g.append('text').attr('class', (r) => 'v' + (o.isBad && o.isBad(r) ? ' bad' : '')).attr('x', (r) => x(o.value(r)) + 6)
      .attr('y', (r) => y(o.key(r)) + y.bandwidth() / 2).attr('dy', '0.32em').text((r) => o.fmt(o.value(r)));
  }

  /* Stacked bars. o: {rows, key(r), label(key), series:[{field,name,color}], fmt, ref?, refLabel?, tipHead(r), height} */
  function stackBars(el, o) {
    const H = o.height || 260, { svg, W } = svgIn(el, H);
    const fields = o.series.map((s) => s.field);
    const stacked = d3.stack().keys(fields)(o.rows);
    const top = Math.max(d3.max(o.rows, (r) => d3.sum(fields, (f) => r[f])), o.ref || 0);
    const y = d3.scaleLinear([0, top * 1.1], [H - 24, 10]).nice();
    const ml = textWidth(svg, y.ticks(5).map(o.fmt)) + 12;
    const x = d3.scaleBand(o.rows.map(o.key), [ml, W - 6]).padding(0.3);
    yAxis(svg, y, ml, W - 6, o.fmt, 5);
    const bw = Math.min(x.bandwidth(), 56), t = tip(el);
    svg.append('g').selectAll('g').data(stacked).join('g').style('fill', (s, i) => o.series[i].color)
      .selectAll('rect').data((s) => s).join('rect')
      .attr('x', (d) => x(o.key(d.data)) + (x.bandwidth() - bw) / 2).attr('width', bw)
      .attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1]) - 1.5))
      .on('mousemove', (ev, d) => t.show(ev, o.tipHead ? o.tipHead(d.data) : o.key(d.data), o.series.map((s) => [s.color, s.name, o.fmt(d.data[s.field])]).reverse()))
      .on('mouseleave', () => t.hide());
    if (o.ref) refLine(svg, ml, W - 6, y(o.ref), o.refLabel, W);
    xLabels(svg, x, o.rows.map(o.key), o.label || String, H - 6);
  }

  /* Grouped bars (e.g. manual vs digital). o: {rows, key(r), label(key), series:[{field,name,color}], fmt, ref?, height} */
  function groupBars(el, o) {
    const H = o.height || 240, { svg, W } = svgIn(el, H);
    const top = d3.max([...o.rows.flatMap((r) => o.series.map((s) => r[s.field])), o.ref || 0]) || 1;
    const y = d3.scaleLinear([0, top * 1.12], [H - 24, 10]).nice();
    const ml = textWidth(svg, y.ticks(4).map(o.fmt)) + 12;
    const x = d3.scaleBand(o.rows.map(o.key), [ml, W - 6]).padding(0.25);
    const xs = d3.scaleBand(o.series.map((s) => s.field), [0, x.bandwidth()]).padding(0.12);
    yAxis(svg, y, ml, W - 6, o.fmt);
    const t = tip(el);
    svg.append('g').selectAll('g').data(o.rows).join('g').attr('transform', (r) => `translate(${x(o.key(r))},0)`)
      .selectAll('rect').data((r) => o.series.map((s) => ({ r, s }))).join('rect')
      .attr('x', (d) => xs(d.s.field)).attr('width', xs.bandwidth()).attr('rx', 4)
      .attr('y', (d) => y(d.r[d.s.field])).attr('height', (d) => Math.max(0, y(0) - y(d.r[d.s.field]))).style('fill', (d) => d.s.color)
      .on('mousemove', (ev, d) => t.show(ev, (o.label || String)(o.key(d.r)), o.series.map((s) => [s.color, s.name, o.fmt(d.r[s.field])])))
      .on('mouseleave', () => t.hide());
    if (o.ref) refLine(svg, ml, W - 6, y(o.ref), null, W);
    xLabels(svg, x, o.rows.map(o.key), o.label || String, H - 6);
  }

  /* Donut. o: {parts:[{name,value,color}], center, centerLabel, height} */
  function donut(el, o) {
    const H = o.height || 240, { svg, W } = svgIn(el, H);
    const r = Math.min(W, H) / 2 - 8, total = d3.sum(o.parts, (p) => p.value);
    const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`), t = tip(el);
    g.selectAll('path').data(d3.pie().sort(null).value((p) => p.value)(o.parts)).join('path')
      .attr('d', d3.arc().innerRadius(r * 0.62).outerRadius(r).padAngle(0.02).cornerRadius(4)).style('fill', (d) => d.data.color)
      .on('mousemove', (ev, d) => t.show(ev, d.data.name, [[d.data.color, null, `${FMT.int(d.data.value)} (${FMT.pct(d.data.value / total)})`]]))
      .on('mouseleave', () => t.hide());
    g.append('text').attr('class', 'v').attr('text-anchor', 'middle').attr('dy', '-0.1em')
      .style('font-family', 'var(--font-serif)').style('font-size', 'var(--fs-title)').text(o.center);
    if (o.centerLabel) g.append('text').attr('text-anchor', 'middle').attr('dy', '1.4em').text(o.centerLabel);
  }

  /* Scatter. o: {rows, x(r), y(r), color(r), xBand:[lo,hi]?, yRef?, xTitle, tip(r), height} */
  function scatter(el, o) {
    const H = o.height || 260, { svg, W } = svgIn(el, H);
    const xe = d3.extent(o.rows, o.x);
    const y = d3.scaleLinear([0, Math.max(d3.max(o.rows, o.y), o.yRef || 0) * 1.05], [H - 30, 10]).nice();
    const ml = textWidth(svg, y.ticks(5).map(FMT.min)) + 12;
    const x = d3.scaleLinear([Math.min(xe[0], -30), Math.max(xe[1], 30)], [ml, W - 10]).nice();
    if (o.xBand) svg.append('rect').attr('x', x(o.xBand[0])).attr('width', x(o.xBand[1]) - x(o.xBand[0])).attr('y', 10).attr('height', H - 40).style('fill', C.green).attr('opacity', 0.12);
    yAxis(svg, y, ml, W - 10, FMT.min, 5);
    svg.append('g').selectAll('text').data(x.ticks(Math.max(3, Math.floor((W - ml) / 70)))).join('text')
      .attr('x', x).attr('y', H - 14).attr('text-anchor', 'middle').text((d) => (d > 0 ? '+' : '') + d);
    if (o.xTitle) svg.append('text').attr('x', W - 10).attr('y', H - 1).attr('text-anchor', 'end').text(o.xTitle);
    if (o.yRef) refLine(svg, ml, W - 10, y(o.yRef), null, W);
    const t = tip(el);
    svg.append('g').selectAll('circle').data(o.rows).join('circle')
      .attr('cx', (r) => x(o.x(r))).attr('cy', (r) => y(o.y(r))).attr('r', 4.5)
      .style('fill', o.color).attr('fill-opacity', 0.75).style('stroke', 'var(--p-surface)').attr('stroke-width', 1)
      .on('mousemove', (ev, r) => o.tip && t.show(ev, ...o.tip(r))).on('mouseleave', () => t.hide());
  }

  /* Dumbbell: before vs after per row. o: {rows, key(r), label(r), before(r), after(r), fmt, unit} */
  function dumbbell(el, o) {
    const rowH = 40, H = o.rows.length * rowH + 30, { svg, W } = svgIn(el, H);
    const unit = o.unit || '', fmt = o.fmt || FMT.min1;
    const delta = (r) => o.before(r) - o.after(r);
    const dl = (r) => (delta(r) >= 0 ? '−' : '+') + fmt(Math.abs(delta(r))) + unit;
    const ml = textWidth(svg, o.rows.map(o.label)) + 14, mr = textWidth(svg, o.rows.map(dl)) + 16;
    const x = d3.scaleLinear([0, d3.max(o.rows, (r) => Math.max(o.before(r), o.after(r))) * 1.05], [ml, W - mr]).nice();
    const y = d3.scaleBand(o.rows.map(o.key), [6, H - 26]).padding(0.2);
    const ticks = x.ticks(Math.max(3, Math.floor((W - ml - mr) / 80)));
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', H - 24).style('stroke', 'var(--chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text(fmt);
    const t = tip(el);
    const g = svg.append('g').selectAll('g').data(o.rows).join('g').attr('transform', (r) => `translate(0,${y(o.key(r)) + y.bandwidth() / 2})`)
      .on('mousemove', (ev, r) => t.show(ev, o.label(r), [[C.muted, 'Before', fmt(o.before(r)) + unit], [C.teal, 'After', fmt(o.after(r)) + unit]]))
      .on('mouseleave', () => t.hide());
    g.append('rect').attr('y', -rowH / 2).attr('width', W).attr('height', rowH).style('fill', 'transparent');
    g.append('text').attr('x', ml - 10).attr('dy', '0.32em').attr('text-anchor', 'end').text(o.label);
    g.append('line').attr('x1', (r) => x(o.before(r))).attr('x2', (r) => x(o.after(r)))
      .style('stroke', (r) => (delta(r) > 0 ? C.teal : C.muted)).attr('stroke-width', 6).attr('stroke-linecap', 'round').attr('opacity', 0.35);
    g.append('circle').attr('cx', (r) => x(o.before(r))).attr('r', 7).style('fill', C.muted);
    g.append('circle').attr('cx', (r) => x(o.after(r))).attr('r', 8).style('fill', C.teal).style('stroke', 'var(--p-surface)').attr('stroke-width', 2);
    g.append('text').attr('class', 'v').attr('x', W - mr + 10).attr('dy', '0.32em').style('fill', (r) => (delta(r) > 0 ? C.teal : 'var(--color-fg-muted)')).text(dl);
  }

  /* Sparkline with soft area. o: {rows, key(r), value(r), color, isBad(r)?, id} */
  function spark(el, o) {
    el.replaceChildren();
    const W = Math.max(120, el.clientWidth || 200), H = 44;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scalePoint(o.rows.map(o.key), [5, W - 5]);
    const y = d3.scaleLinear([0, d3.max(o.rows, o.value) || 1], [H - 2, 6]);
    const gid = 'sg-' + (o.id || Math.random().toString(36).slice(2));
    const grad = svg.append('defs').append('linearGradient').attr('id', gid).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    [[0, .32], [.5, .12], [1, 0]].forEach(([off, a]) => grad.append('stop').attr('offset', off).style('stop-color', o.color).style('stop-opacity', a));
    svg.append('path').datum(o.rows).attr('d', d3.area().x((r) => x(o.key(r))).y0(H).y1((r) => y(o.value(r)))).style('fill', `url(#${gid})`);
    svg.append('path').datum(o.rows).attr('d', d3.line().x((r) => x(o.key(r))).y((r) => y(o.value(r))))
      .style('fill', 'none').style('stroke', o.color).attr('stroke-width', 2.5).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    svg.selectAll('circle').data(o.rows).join('circle').attr('cx', (r) => x(o.key(r))).attr('cy', (r) => y(o.value(r)))
      .attr('r', (r, i) => (i === o.rows.length - 1 ? 4 : 2.5)).style('fill', (r) => (o.isBad && o.isBad(r) ? C.red : o.color))
      .style('stroke', 'var(--p-surface)').attr('stroke-width', 1.5);
  }

  /* Redraw on resize: TT.autoRedraw(el, () => TT.vbars(el, {...})) */
  function autoRedraw(el, draw) {
    let w = 0; draw();
    new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; draw(); } }).observe(el);
  }

  window.TT = { C, FMT, computed, vbars, hbars, stackBars, groupBars, donut, scatter, dumbbell, spark, autoRedraw };
})();
