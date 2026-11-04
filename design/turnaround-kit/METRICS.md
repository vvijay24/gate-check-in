# Overview metrics: what to show and how each is calculated

This is the new overview. It **replaces** the old overview metrics. The calculations are in `metrics.js`, exactly as the dashboard runs them.

## Data each truck visit needs
The cleanest source is a **timestamp at each handoff**, logged in the system by whoever does that step:

| Timestamp | Who records it |
|---|---|
| `arrived_at` | Guard: truck pulls up |
| `checked_in_at` | Guard: check-in form saved |
| `dock_assigned_at` | Shipping: door assigned |
| `preload_start_at` | Dock: truck at the door, prep starts |
| `load_start_at` / `load_end_at` | Dock: loading or unloading |
| `inspection_done_at` | Inspector |
| `checked_out_at` | Guard: checkout saved |

Plus `appointment_time`, `visit_type` (Delivery / Pickup / Drop trailer), `carrier` and `door`.

Stage minutes are the gaps between timestamps:
- `gate_in_min` = checked_in_at − arrived_at
- `dock_assign_min` = dock_assigned_at − checked_in_at
- `preload_min` = load_start_at − dock_assigned_at
- `load_min` = load_end_at − load_start_at
- `inspection_min` = inspection_done_at − load_end_at
- `checkout_min` = checked_out_at − inspection_done_at

If the app only stores check-in and checkout times today, add the missing timestamps to the screens shipping, dock and inspection use. Until then, only gate to gate can be calculated.

## Targets
| Stage | Target (min) |
|---|---|
| Gate check-in | 3–5 |
| Dock assignment | 15–30 |
| Pre-loading | 5–10 |
| Loading / unloading | 30–60 |
| Inspection | 10–15 |
| Gate checkout | 3–5 |
| **Dock time** (pre-load + load + inspection) | **45–85** |
| **Gate to gate** (all six) | **65–130** |

## Overview, top to bottom
1. **Hero**: the date range and a one-sentence takeaway (minutes saved, detention avoided, trucks over 130 min, slowest stage, slowest day).
2. **Six KPI cards**, each with a 7-day sparkline and click-through to a detail view:
   - **Gate-to-gate turnaround**: average `g2g_min`. Badge: on target if ≤ 130.
   - **Dock handling time**: average `dock_min`. Badge: on target if ≤ 85.
   - **On-time arrivals**: share of trucks arriving within ±15 min of appointment.
   - **Trucks handled**: count of visits.
   - **Within turnaround target**: share with `g2g_min` ≤ 130.
   - **Detention risk**: sum of `detention_usd`. The free-time clock starts at the later of appointment and arrival. 2 h free, then $75/h. Trucks more than 15 min late aren't charged.
3. **Impact of going digital**: manual week vs digital week.
   - Tiles: minutes saved per truck, detention avoided per week and per year (×52), dock-wait minutes saved, % within target (before → after), phone calls / paper handoffs / yard-search hours eliminated, truck-hours freed.
   - Charts: each stage before vs after (dumbbell), gate to gate by weekday, detention by weekday.
4. **Where the time goes**: average minutes per stage stacked by day with the 130 line, and each stage against its target band.
5. **Arrivals and volume**: trucks per day by type, an early / on-time / late donut, arrivals by appointment hour (colored by speed), and a scatter of minutes vs appointment against gate to gate.
6. **Detail view** (one per card): pill tabs to switch metric; a hero with the big number; charts by day, by visit type, by appointment hour and by carrier; a distribution; and a table of trucks, worst first.

## Before vs after data
The "manual week" needs the same stage minutes from before the digital system, plus `phone_calls`, `paper_handoffs` and `yard_search_min` per truck. Paper logs typed into a sheet are enough. The digital week counts zero for those three, because the updates now happen on screen.

## Reference
`reference/dashboard-overview-page.html` is the dashboard's own page source. It runs inside Claude's dashboard (it uses a `dash` data API), so use it for structure and wording, not as-is. `reference/*.json` is the sample data.
