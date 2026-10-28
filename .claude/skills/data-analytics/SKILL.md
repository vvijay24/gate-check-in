---
name: data-analytics
description: Analyze the guard gate-log data for this trucking yard — on-time arrivals, gate dwell / turnaround, dock wait and utilization, detention, carrier and customer performance, busiest hours, guard activity, loading inspections. Use when the user asks questions about yard performance, trends, KPIs, or wants a report, chart or spreadsheet built from gate-log entries or an Entry Log export (.xlsx).
---

# Gate-log data analytics

Answer questions about yard performance using **the app's own calculations** so the numbers match
what the Overview tab shows (`src/components/Analytics.jsx`; `src/analytics.js` builds its range figures on `dayMetrics`). Don't recompute KPIs by hand when the script can produce them.

## 1. Get the data

The app keeps entries in the browser (`localStorage` key `guard-load-log`), not in the repo. Use, in order:

1. **An Excel export** — the user clicks **Export** on the Entry Log or Outbound Shipments table. Ask for the
   file path if they haven't given one. Export columns are defined in `src/logColumns.js`.
2. **A raw JSON dump** — if they need exact dock-assignment timestamps, have them run
   `copy(localStorage.getItem('guard-load-log'))` in the browser console and save it to a `.json` file.
3. **Sample data** — `src/sampleData.js` (14 days of generated visits). Only for demos or testing; always
   tell the user the results are from sample data.

## 2. Run the analysis

From the project root:

```
node .claude/skills/data-analytics/analyze.mjs --file "<export.xlsx>" [--from YYYY-MM-DD] [--to YYYY-MM-DD]
node .claude/skills/data-analytics/analyze.mjs --entries "<entries.json>" [...]
node .claude/skills/data-analytics/analyze.mjs --sample [...]
```

It loads `src/metrics.js` through Vite and prints JSON (durations in **minutes**, percentages 0–100):

- `totals` — visits, live vs drop, departed / still on site, on-time %, late arrivals, average gate dwell,
  visits over free time, inspection pass/fail, for the whole range.
- `carriers`, `customers` — per-name rollups over the range (visits, avg turnaround, on-time %, late count).
- `yardNow` — current yard state (at dock, waiting, drops, staging-bay capacity, inventory).
- `days[]` — per-day `dayMetrics`: arrivals breakdown, hourly check-ins (index = hour), gate counts,
  per-dock loads / utilization / dwell / wait, carrier leaderboard, customers, guards.

The output is large; pipe it through `node -e` to pull out just the parts the question needs.
For a question the script doesn't cover, write a short one-off script in the scratchpad that loads
`src/metrics.js` / `src/time.js` the same way (`vite.ssrLoadModule`) — don't edit `analyze.mjs` or the app
unless the user asks.

## 3. Metric definitions (from the code — keep answers consistent with them)

| Metric | Definition | Source |
|---|---|---|
| Live vs drop | A visit with **Drop Trailer** in Purpose of Visit is a drop; everything else is live. Turnaround, carrier and detention figures use live visits only. | `metrics.js` `isDrop` |
| Late / early | Arrival vs Appointment Time on the arrival day. More than **15 min** after = late; more than 15 min before = early. No appointment = unscheduled. | `time.js` `LATE_GRACE_MIN`, `EARLY_GRACE_MIN` |
| On-time % (OTA) | (early + on time) ÷ scheduled arrivals. Unscheduled visits are excluded. | `dayMetrics.otaPct` |
| Gate dwell / turnaround | Time In → Time Out (uses Date Out, or Date In if blank). Departed live visits only. | `dayMetrics.avgGateDwellMs` |
| Dock wait | Check-in → dock assigned. | `dayMetrics.avgDockWaitMs` |
| Dock dwell | Dock assigned → check-out. | `dayMetrics.avgDockDwellMs` |
| Dock utilization | Busy time across docks 1–6 ÷ (6 × the day's elapsed time; up to now for today). | `dayMetrics.dockUtilization` |
| Detention / over free time | On site longer than **120 min** (free time). Billed at **$75/h** after that; warning shown from 90 min. | `yard.js` `DETENTION_*` |
| Staging capacity | Trucks/trailers in the 6 staging bays ÷ 6. Alert at 85 %. | `yard.js` `STAGING_BAYS`, `YARD_ALERT_PCT` |
| Customer | Only filled in for pickups, so customer figures cover pickups only. | `customerPickupFor` |
| Gates | Gate 1 = in, Gate 2 = out. | `formConfig.js` `GATES` |

If these constants change in the code, the code wins — re-read the file rather than trusting this table.

## 4. Data caveats to mention when relevant

- The Excel export stores **Dock Assigned** as a local date-time string (no seconds), so dock wait,
  dwell and utilization from an export can differ by up to a minute from the app. JSON dumps are exact.
- Inspections record an Inspection Date and Time (exported since they were added). Older exports
  lack them, so dock → inspected timing is only available from newer exports or a JSON dump.
- Every load is frozen: the inspection limits are product ≤ 0°F and trailer pre-cool ≤ 10°F
  (`LIMIT` in `src/components/LoadingInspection.jsx`).
- Names are grouped ignoring case and surrounding spaces, but typos ("Penske" vs "Penkse") stay separate —
  point out likely duplicates rather than silently merging them.
- Small samples: flag percentages based on fewer than ~5 scheduled visits.

## 5. Presenting results

- **Default:** a short plain-language answer first (the number and what it means for the yard), then a
  compact table of the supporting figures. State the date range and the data source.
- Compare against the previous period of the same length (as the Overview tab does with
  `previousRange` in `src/analytics.js`) when it adds context, e.g. "on-time 70 %, down from 78 % last week".
- For waiting time and detention, `visitStages` in `src/analytics.js` splits each visit into
  wait for dock → dock to inspected → inspected to check-out.
- **Charts / dashboard page:** load the `dataviz` skill first. Use the app's colors where it helps:
  Gate 1 green `#2b7d52`, Gate 2 rose `#b8406a`, Delivery `#1f6fb2`, Pickup `#2b7d52`, Drop `#7a4fa0`.
- **Spreadsheet:** use the `xlsx` skill; keep the export's column names so it lines up with the app.
- Use the app's words: **Dock** (never "door"), **Gate 1 / Gate 2**, **Order No**, **Carrier**, **Customer**.
- Don't change app code as part of an analysis. If an analysis suggests a code or UI change, propose it
  and wait for approval (this project's standing rule).
