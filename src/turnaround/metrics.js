// The kit's calculations (design/turnaround-kit/metrics.js), unchanged; only the export line at the end is added so the app can import them.
/* =====================================================================
   Turnaround metrics: the exact calculations behind the overview.
   Plain JavaScript, no dependencies. Works in the browser or in Node.

   Input: an array of truck visits, one object per truck:
     { visit_id, day: 'YYYY-MM-DD', visit_type: 'Delivery'|'Pickup'|'Drop trailer', carrier,
       appt: 'HH:MM', arrived: 'HH:MM',
       gate_in_min, dock_assign_min, preload_min, load_min, inspection_min, checkout_min }
   (stage minutes; see METRICS.md for how to get them from timestamps)

   Usage:
     const visits = computeVisitMetrics(rows);
     const summary = computeSummary(visits);   // week, by day, type, hour, carrier
     const stages  = computeStages(visits);    // each stage vs its target
     const impact  = computeImpact(computeVisitMetrics(manualRows), visits);  // before vs after
   ===================================================================== */

/** Per-truck times: Each truck’s minutes vs appointment, time at the door, gate-to-gate time and estimated detention ($75/h after 2 h free time). */
const computeVisitMetrics = (visits) => visits.map((v) => {
    const n = (k) => Number(v[k]);
    const clock = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
    const appt = clock(v.appt), arrived = clock(v.arrived);
    const delta = arrived - appt;
    const dock = n('preload_min') + n('load_min') + n('inspection_min');
    const g2g = n('gate_in_min') + n('dock_assign_min') + dock + n('checkout_min');
    const clockStart = Math.max(arrived, appt);
    const onClock = arrived + g2g - clockStart;
    const detention = delta > 15 ? 0 : Math.round(Math.max(0, onClock - 120) / 60 * 75);
    return {
      visit_id: v.visit_id, day: v.day, visit_type: v.visit_type, carrier: v.carrier, appt: v.appt, arrived: v.arrived,
      appt_hour: Math.floor(appt / 60),
      arrival_delta_min: delta, arrival_status: delta < -15 ? 'Early' : delta > 15 ? 'Late' : 'On time',
      gate_in_min: n('gate_in_min'), dock_assign_min: n('dock_assign_min'), preload_min: n('preload_min'),
      load_min: n('load_min'), inspection_min: n('inspection_min'), checkout_min: n('checkout_min'),
      dock_min: dock, g2g_min: g2g, detention_usd: detention,
    };
  });

/** Turnaround summary: Averages, shares and counts for the whole week, and by day, visit type, appointment hour and carrier. */
const computeSummary = (visit_metrics) => {
    const avg = (vs, k, d) => { const s = vs.reduce((a, v) => a + v[k], 0) / vs.length; const p = 10 ** d; return Math.round(s * p) / p; };
    const count = (vs, f) => vs.filter(f).length;
    const sum = (vs) => {
      const n = vs.length;
      return {
        trucks: n,
        delivery: count(vs, (v) => v.visit_type === 'Delivery'),
        pickup: count(vs, (v) => v.visit_type === 'Pickup'),
        drop: count(vs, (v) => v.visit_type === 'Drop trailer'),
        avg_gate_in: avg(vs, 'gate_in_min', 1), avg_assign: avg(vs, 'dock_assign_min', 1), avg_preload: avg(vs, 'preload_min', 1),
        avg_load: avg(vs, 'load_min', 1), avg_inspection: avg(vs, 'inspection_min', 1), avg_checkout: avg(vs, 'checkout_min', 1),
        avg_dock: avg(vs, 'dock_min', 0), avg_g2g: avg(vs, 'g2g_min', 0),
        early: count(vs, (v) => v.arrival_status === 'Early'),
        on_time: count(vs, (v) => v.arrival_status === 'On time'),
        late: count(vs, (v) => v.arrival_status === 'Late'),
        on_time_rate: Math.round(count(vs, (v) => v.arrival_status === 'On time') / n * 1000) / 1000,
        over_count: count(vs, (v) => v.g2g_min > 130),
        dock_over_count: count(vs, (v) => v.dock_min > 85),
        within_target_rate: Math.round(count(vs, (v) => v.g2g_min <= 130) / n * 1000) / 1000,
        detained: count(vs, (v) => v.detention_usd > 0),
        detention_usd: vs.reduce((a, v) => a + v.detention_usd, 0),
      };
    };
    const by = (kind, key) => {
      const m = new Map();
      visit_metrics.forEach((v) => { const g = String(v[key]); if (!m.has(g)) m.set(g, []); m.get(g).push(v); });
      return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([g, vs]) => ({ group_kind: kind, group: g, ...sum(vs) }));
    };
    return [
      { group_kind: 'all', group: 'all', ...sum(visit_metrics) },
      ...by('day', 'day'), ...by('type', 'visit_type'), ...by('hour', 'appt_hour'), ...by('carrier', 'carrier'),
    ];
  };

/** Stage times vs targets: Average minutes per stage this week, with each stage’s target range and the share of trucks inside it. */
const computeStages = (visit_metrics) => {
    const targets = [
      ['Gate check-in', 'gate_in_min', 3, 5], ['Dock assignment', 'dock_assign_min', 15, 30], ['Pre-loading', 'preload_min', 5, 10],
      ['Loading / unloading', 'load_min', 30, 60], ['Inspection', 'inspection_min', 10, 15], ['Gate checkout', 'checkout_min', 3, 5],
    ];
    return targets.map(([stage, k, lo, hi]) => {
      const vs = visit_metrics.map((v) => v[k]);
      return {
        stage, target_lo: lo, target_hi: hi,
        avg_min: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length * 10) / 10,
        within_rate: Math.round(vs.filter((x) => x <= hi).length / vs.length * 1000) / 1000,
      };
    });
  };

/** Per-truck times, manual week: The same per-truck times for the manual (paper and phone) week, plus its phone calls, paper handoffs and yard-search minutes. */
const computeBaselineMetrics = (baseline) => baseline.map((v) => {
    const n = (k) => Number(v[k]);
    const clock = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
    const appt = clock(v.appt), arrived = clock(v.arrived);
    const delta = arrived - appt;
    const dock = n('preload_min') + n('load_min') + n('inspection_min');
    const g2g = n('gate_in_min') + n('dock_assign_min') + dock + n('checkout_min');
    const onClock = arrived + g2g - Math.max(arrived, appt);
    return {
      visit_id: v.visit_id, day: v.day, visit_type: v.visit_type,
      gate_in_min: n('gate_in_min'), dock_assign_min: n('dock_assign_min'), preload_min: n('preload_min'),
      load_min: n('load_min'), inspection_min: n('inspection_min'), checkout_min: n('checkout_min'),
      dock_min: dock, g2g_min: g2g, detention_usd: delta > 15 ? 0 : Math.round(Math.max(0, onClock - 120) / 60 * 75),
      phone_calls: n('phone_calls'), paper_handoffs: n('paper_handoffs'), yard_search_min: n('yard_search_min'),
    };
  });

/** Manual vs digital: Manual week vs digital week: averages, totals, each stage and each weekday. The digital system passes updates on screen, so it counts no phone calls, paper handoffs or yard searches. */
const computeImpact = (baseline_metrics, visit_metrics) => {
    const b = baseline_metrics, a = visit_metrics;
    const avg = (vs, k) => vs.reduce((s, v) => s + v[k], 0) / vs.length;
    const total = (vs, k) => vs.reduce((s, v) => s + (v[k] || 0), 0);
    const share = (vs) => vs.filter((v) => v.g2g_min <= 130).length / vs.length;
    const rd = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
    const row = (kind, key, label, before, after, d) => ({
      kind, key, label, before: rd(before, d), after: rd(after, d), saved: rd(before - after, d),
      change_pct: before ? rd((after - before) / before, 3) : null,
    });
    const out = [
      row('kpi', 'g2g', 'Gate to gate, avg min', avg(b, 'g2g_min'), avg(a, 'g2g_min'), 0),
      row('kpi', 'dock_wait', 'Dock assignment wait, avg min', avg(b, 'dock_assign_min'), avg(a, 'dock_assign_min'), 0),
      row('kpi', 'gate_in', 'Gate check-in, avg min', avg(b, 'gate_in_min'), avg(a, 'gate_in_min'), 1),
      row('kpi', 'within', 'Trucks within 130 min', share(b), share(a), 3),
      row('kpi', 'detention', 'Detention, $ per week', total(b, 'detention_usd'), total(a, 'detention_usd'), 0),
      row('kpi', 'detention_year', 'Detention, $ per year at this pace', total(b, 'detention_usd') * 52, total(a, 'detention_usd') * 52, 0),
      row('kpi', 'truck_hours', 'Truck hours on site', total(b, 'g2g_min') / 60, total(a, 'g2g_min') / 60, 0),
      row('kpi', 'phone_calls', 'Phone calls gate to shipping', total(b, 'phone_calls'), 0, 0),
      row('kpi', 'paper_handoffs', 'Paper handoffs', total(b, 'paper_handoffs'), 0, 0),
      row('kpi', 'yard_search', 'Hours searching the yard', total(b, 'yard_search_min') / 60, 0, 0),
      row('kpi', 'trucks', 'Trucks', b.length, a.length, 0),
    ];
    [['gate_in_min', 'Gate check-in'], ['dock_assign_min', 'Dock assignment'], ['preload_min', 'Pre-loading'],
      ['load_min', 'Loading / unloading'], ['inspection_min', 'Inspection'], ['checkout_min', 'Gate checkout']]
      .forEach(([k, label]) => out.push(row('stage', k, label, avg(b, k), avg(a, k), 1)));
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const wd = (v) => names[new Date(v.day + 'T00:00:00Z').getUTCDay()];
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => {
      const bd = b.filter((v) => wd(v) === d), ad = a.filter((v) => wd(v) === d);
      if (!bd.length || !ad.length) return;
      out.push(row('weekday', d, d, avg(bd, 'g2g_min'), avg(ad, 'g2g_min'), 0));
      out.push(row('weekday_detention', d, d, total(bd, 'detention_usd'), total(ad, 'detention_usd'), 0));
    });
    return out;
  };

if (typeof module !== 'undefined') module.exports = { computeVisitMetrics, computeSummary, computeStages, computeBaselineMetrics, computeImpact };
if (typeof window !== 'undefined') window.TTMetrics = { computeVisitMetrics, computeSummary, computeStages, computeBaselineMetrics, computeImpact };

export { computeVisitMetrics, computeSummary, computeStages, computeBaselineMetrics, computeImpact }
