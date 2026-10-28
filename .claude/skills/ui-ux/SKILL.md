---
name: ui-ux
description: UI/UX rules for the guard gate-log app (React + Tailwind v4) — who uses it, the design tokens and shared class strings, the established table / filter / dialog / tile / sidebar patterns, wording (Dock, Gate 1 · In), charts, accessibility, responsive layout and how to work on UI here. Use whenever adding, changing, restyling or reviewing any screen, component, table, form, chart, dialog or layout in this project.
---

# UI/UX for the gate-log app

Build screens that look like they were always part of this app. Reuse what exists before inventing
anything; when the request needs something new, follow the closest existing pattern and say so.
Before handing off, go through [checklist.md](checklist.md).

## 1. Who uses it

- **Guards at the gate**, often on a tablet, sometimes with gloves, in bright light, while a driver waits.
  Gate forms must be fast and forgiving: big targets, few required fields, clear errors.
- **Shipping and dock staff** scan boards and tables for what needs action next (waiting trucks,
  free docks, inspections due).
- **Managers** read the Overview tab (`src/components/Analytics.jsx`) for trends and detention cost.

So: large controls, high contrast, plain words, and the next action always visible.

## 2. Tokens, type and shared classes

- **Colors are tokens** in `src/index.css` (`@theme`): `page`, `panel`, `ink`, `muted`, `line`, `field`,
  `chrome`, `signal` (yellow accent / primary action), `ok`, `danger`, the purpose colors `delivery`,
  `pickup`, `drop`, gates `gate-in` (green) / `gate-out` (rose), yard map `asphalt`, `bay`, `building`,
  `track`, and charts `chart-live`, `chart-drop`, `chart-3`. Use them as Tailwind utilities
  (`bg-panel`, `text-muted`, `border-line`) or `var(--color-…)`. **Never hard-code hex in components.**
- **A new token goes in three places**: `@theme` (light), the `@media (prefers-color-scheme: dark)` block,
  and the `:root[data-theme="dark"]` block. Missing one breaks dark mode.
- **Type**: Barlow for body (`font-body`, 15px base), Barlow Condensed for headings and buttons
  (`font-display`, bold). Page headings ~28px, card titles 21px, table text 14px, notes 13px.
- **Shared class strings** in `src/ui.js` — use them, don't restyle:
  - `btn` / `btnPrimary` (56px, gate forms), `btnSmall` / `btnSmallPrimary` (44px, boards and tables).
    Primary = yellow `signal`; there is one primary action per area.
  - `input`, `label`, `required`, `errorText`, `inputError` for form fields (`Field.jsx` wraps them).
  - `seg(on, bad)` for segmented choices; `tag` for status pills; `PURPOSE_STYLES` for Delivery /
    Pickup / Drop Trailer colors.
- **Shape**: cards `rounded-[10px] border border-line bg-panel`; buttons `rounded-[10px] border-2`;
  pills `rounded-full`.

## 3. Established patterns (copy these)

| Need | Pattern | Example |
|---|---|---|
| Data table | `COLUMNS` array of `{ id, label, options(rows), match(row, value) }`; a `<select>` under each header (All + choices), `border-signal` when active; **Clear filters** link; first `MAX_ROWS` (5–7) rows then **Show all (n)** / **Show less**; footer with **Print** and **Export** | `EntryLog.jsx`, `ShippingDashboard.jsx` |
| Free-text column filter | `search: true` column → text box instead of a select (for IDs like Trailer #) | — |
| Print one section | `body[data-print="<id>"]` rules in `index.css`; expand rows with `flushSync(() => setShowAll(true))` before `window.print()` | `printOutbound` |
| Export | `exportToExcel(rows, filename)` from `src/logColumns.js` (all fields); multi-sheet via lazy `import('xlsx')` | Analytics `exportAnalytics` |
| Row actions | `<select value="">` with a disabled **Options** placeholder; picking runs the action and it snaps back | Entry Log, Outbound |
| Assign | `AssignDock` (pass `compact` inside tables) — only when the truck is on site and has no dock | |
| Status | Pill with words + color (`ui.tag` + soft background); never color alone | `STATUS_TAG`, `STATUS` in `YardMap.jsx` |
| Pop-up | Native `<dialog>` + `showModal()`; closes on Esc, a **Close** button, or a backdrop click (`ev.target === dialog`); padding on an inner wrapper so clicks on it don't close | Live yard map **⤢ Enlarge** in `Dashboard.jsx` |
| Selectable tiles | `<button aria-pressed>`; selected = `border-signal`; one panel-level action acts on the selection | At the Docks + **Inspect** |
| Headline numbers | `Tile` (label, big value, note, `tone` good/warn/alert, ▲/▼ `Trend` vs previous period) | `analytics/ui.jsx`, `analytics/charts.jsx` |
| Section with sub-views | Left sidebar (sticky, `aria-current`) on `lg`, a row of buttons on small screens | Overview tab |
| Notices | `role="status"` banner with `border-signal` for success; `role="alert"` with `border-danger` for problems; auto-clear after 3 s | `App.jsx` |
| Empty state | Say why it's empty and what to do ("Pick a different range, or load the sample data") | |

Live data: boards refresh on a timer (30–60 s) via `setInterval` in `useEffect`; show "● Live" or the
moment shown when it isn't live.

## 4. Wording

- **Dock**, never "Door" (code fields like `dockDoor` stay; on-screen text says Dock). The trailer
  checklist item "Doors and seals close properly" is about trailer doors and stays.
- **Gate 1 · In** (green) and **Gate 2 · Out** (rose). **Order No**, **Carrier**, **Customer**,
  **Trailer #**, **Check In / Check Out**, **Live / Drop**, **Est. detention**.
- Sentence-style labels, short. Buttons are verbs ("Assign dock", "Inspect · Dock 3").
- Times like `1h 49m` (`duration()` in `src/time.js`); clock times via `clockTime()`; dates short ("Oct 28").
- Say what's missing instead of showing blanks: `—` for no value, "No appointment", "No dock".

## 5. Charts

Load the **`dataviz`** skill before writing any chart. In this app:
- Draw charts with plain HTML/SVG like `src/components/analytics/charts.jsx` (`DayBars`, `DayLine`,
  `HourGrid`, `StageBar`, `BarList`) — reuse those before writing a new one. No chart library.
- Run the palette validator for any new color set, in light **and** dark. Current validated sets:
  live/drop = `chart-live` / `chart-drop`; three stages = blue → orange → purple (`chart-3` is only valid
  next to orange).
- One y-axis per chart; two measures → two charts. Hover/focus tooltip on every mark, a legend for ≥ 2
  series, and **Show as table**.

## 6. Accessibility

- Visible focus: the global yellow `:focus-visible` outline — never remove it without a replacement.
- Targets ≥ 44px (`min-h-11`); gate-form controls 52–56px.
- Every input has a `<label>`; icon-only or symbolic controls get `aria-label`; charts get `role="img"`
  or per-mark `aria-label`s and a table view.
- Tabs use `role="tablist"`/`tab`/`tabpanel` with `aria-selected`; toggles use `aria-pressed`; sortable
  headers set `aria-sort`; the current sidebar item uses `aria-current`.
- Never rely on color alone (add words, icons, ▲/▼, or position). Text contrast ≥ 4.5:1 in both themes;
  don't put white text on mid-tone chart colors.
- Destructive actions confirm first (`window.confirm` is the current pattern).

## 7. Responsive layout

- Page width caps at 1400px (`max-w-[1400px]`), side padding `px-4 sm:px-5`. Must work from phone width.
- Grids collapse: tiles `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`; side-by-side cards `xl:grid-cols-2`;
  sidebars `lg:grid-cols-[210px_minmax(0,1fr)]`. Always `minmax(0, …)` / `min-w-0` so content can shrink.
- Wide tables scroll inside their card (`overflow-x-auto` + a `min-w-[…]` table), never the page.
- The header and tabs are sticky; sticky sidebars sit below them (`lg:top-[136px]`).
- Mark controls that shouldn't print with `no-print`.

## 8. How to work on UI in this project

- **Explain the planned change and ask before editing** — this user's standing rule. Offer choices
  (with a recommended one) when there's a real design decision, e.g. a naming clash or layout split.
- Keep edits in the file's existing style (single quotes, no semicolons, Tailwind classes inline,
  short "why" comments). **Do not run Prettier or other formatters** — there is no config and it
  rewrites whole files.
- Verify with `npx vite build`; for logic, render with Vite SSR + `react-dom/server` in a temp script.
  The dev server is usually running at http://localhost:5173.
- Say plainly when something wasn't checked in a real browser (hover position, chart look, print).
- Don't commit or push unless asked.
