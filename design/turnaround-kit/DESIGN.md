# Turnaround design system

The look of the Truck Turnaround Overview dashboard, packaged for reuse in any web app.

## Files
- `theme.css`: every color, font, size and component style. Link it once and wrap the app in `<div class="tt">`.
- `charts.js`: d3 v7 chart helpers that match the theme (bars, stacked, grouped, horizontal with target bands, donut, scatter, before/after dumbbell, sparkline). Exposes `window.TT`.
- `demo.html`: a working page using both. Open it in a browser to see the look.

## Color means something
| Token | Light | Use |
|---|---|---|
| `--p-navy` | #16324F | Primary. Gate and yard time. Hero banners. |
| `--p-sky` / `--p-navy-2` | #8FB3D9 / #3A6EA5 | Gate check-in / gate checkout |
| `--p-gold-1` / `--p-yolk` / `--p-amber` | #F7D27A / #F2A900 / #D9731A | Time at the door: pre-loading / loading / inspection. Amber also for small section labels. |
| `--p-teal` | #0E8A7E | Good news: on time, savings, the digital week |
| `--p-red` | #C8102E | **Only** for over target or money at risk. Never decorative. |
| `--p-green` | #1E8E4E | Target bands (at low opacity) and "On target" pills |
| `--p-cream` | #FFF8EA | Warm tint for panels with comparisons |
| `--chart-muted` | #C9CED6 | The "before" or comparison series |

Fixed series colors:
- Stages, in order: sky, navy, gold, yolk, amber, navy-2 (`TT.C.stages`).
- Visit types: delivery = navy, pickup = yolk, drop trailer = teal (`TT.C.types`).
- Arrivals: early = teal, on time = navy, late = red.

Dark mode follows the OS, or set `<html data-theme="dark">` to force it. The palette swaps to brighter versions of the same hues.

## Type
- **Source Serif 4** for headlines and every big number (weight 400, tabular figures).
- **DM Sans** for everything else (400 / 500).
- Sizes: caption 12.5px, body 15px, heading 17px, title 26px. Hero title is 1.5× title; KPI numbers are 1.5× title; the detail-view number is 2.4× title.
- These are the closest free fonts to the dashboard's built-in ones. If your project has brand fonts, change `--font-serif` and `--font-sans`.

## Layout
1. **Hero banner**: navy radial gradient with a soft yolk circle at the bottom right. Contains a small amber label, a serif title, a muted subtitle, and a one-sentence takeaway with a yolk left rule.
2. **KPI cards**: an auto-fit grid (min 16rem). Each card has a colored icon chip (`--accent`), a label, a big serif number with unit, a status pill and target, a sparkline, and "See details →". On hover the card lifts 3px and the border takes the accent color. The whole card is a button that opens a detail view.
3. **Impact section**: a teal-to-navy banner, then tiles with big teal numbers (the money tile is yolk/amber), then before/after charts.
4. **Sections**: a small amber label above a serif `h2`, then a grid of panels (min 24rem; `.tt-wide` spans the full row). Each panel has an `h3`, a one-line note, a legend, then the chart.
5. **Detail view**: pill tabs (the active tab fills with the metric's accent) and a navy hero with an accent stripe on the left and the number in yolk. Below that, charts by day, type, hour and carrier, a distribution, and a sticky-header table whose underline uses the accent color.

## Chart rules
- Bars have rounded corners (rx 4–6), up to 40px wide (56px when stacked).
- Gridlines are 1px `--chart-grid`; tick labels are muted caption text. Margins are measured from the widest label so nothing gets cut off.
- A target range is a green band at 12–18% opacity. A maximum is a red dashed line (6 4) with a label.
- Over-target values turn red, both bars and value labels.
- Every chart has a hover tooltip: date or category first in muted text, then a colored swatch, name and value for each series.
- Number formats: minutes `,.0f`, shares `.1%`, money `$,.0f`, changes `+.0%`.
- Charts size from their container's width and redraw on resize (`TT.autoRedraw`).
