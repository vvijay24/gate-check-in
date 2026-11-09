---
name: ui-ux
description: UI/UX rules for the guard gate-log app (React + Tailwind v4) — who uses it, the design tokens and shared class strings, the established table / filter / dialog / tile / sidebar patterns, wording (Dock, Gate · In), charts, accessibility, responsive layout and how to work on UI here. Use whenever adding, changing, restyling or reviewing any screen, component, table, form, chart, dialog or layout in this project.
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
- **Managers** read the Overview tab (`src/components/Overview.jsx`, the truck turnaround overview from `design/turnaround-kit/`) for turnaround, detention and the impact of going digital.

So: large controls, high contrast, plain words, and the next action always visible.

## 2. Visual direction: calm modern

White cards floating on a pale page, depth from soft shadows rather than heavy borders, one clear focal
point per card, and slate used sparingly as the accent. Expressive through icons, tinted headers and
short motion — never at the cost of big targets, contrast or plain words.

- **Depth**: cards and tiles `shadow-card` + a hairline `border-hair`; primary buttons and hovered tiles
  `shadow-raised`; dialogs and pop-overs `shadow-overlay`. No heavy 2px borders except form fields.
- **Radius scale**: 8px inputs (`rounded-lg`), 10–12px buttons and inner items (`rounded-[10px]` /
  `rounded-xl`), 16px cards, tiles and dialogs (`rounded-2xl`), `rounded-full` pills and badges.
- **Spacing**: 8px grid. Card body `p-4`/`p-5`, `gap-6` / `space-y-6` between cards and sections; separate
  form sections with `border-hair` + space, not strong lines.
- **Card anatomy**: `CardHead` (`src/components/CardHead.jsx`) — tinted `bg-signal-tint` strip with an
  icon chip, title, one-line muted subtitle, and controls on the right — then the body. Overview cards
  use the Overview's kit cards (`tt-card`, `tt-panel`) on the Overview.
- **Hierarchy**: one page/section title (with an icon chip on the Overview), card titles 21–26px, the
  single most important number or action largest in its card.
- **Surfaces inside cards**: list items and inner panels `rounded-xl border border-hair bg-field`, hover
  `bg-signal-tint`; info boxes `bg-signal-tint`.
- **Toggles**: a segmented track (`rounded-xl bg-field p-1` or `bg-panel border-hair`), the chosen option a
  slate chip (`bg-signal text-signal-ink shadow-card`); `seg()` for form choices (chosen = raised white
  chip with slate border).
- **Icons**: Lucide via `src/icons.jsx` — `<Icon name="…" />` (20px; 24px on gate buttons, 14–16px in pills
  and notes) and `<IconChip>`. Always beside a word and `aria-hidden`; icon-only buttons need an
  `aria-label`. One meaning per icon — use the `ICONS` map (gate shield, Check In/Out log-in/log-out,
  Shipping truck, Dock warehouse, Overview chart, waiting clock, inspect clipboard, inspected
  shield-check, done circle-check, failed circle-x, blocked ban, warning triangle, export download, print
  printer, close x …); add to the map rather than importing Lucide directly. No emoji (⚠ ✓ ⛔) in the UI.
- **Motion**: 150–200ms `ease-out` transitions on hover/press/selection; `animate-pop` for dialogs, notices
  and result banners, `animate-fade` for small reveals, `animate-fresh` for a just-added row. Tiles may
  lift `-translate-y-0.5` on hover. Never animate live-refreshing numbers; no bounce or parallax.
  `index.css` turns all animation and transitions off for `prefers-reduced-motion`.
- **Print**: shadows are removed in print; keep `no-print` on controls.

## 3. Tokens, type and shared classes

- **Slate palette, light only** (no dark theme): navy `#0F1E3A` (header, rail, text), slate `#1E2F4F`
  (actions, selection, focus), grey-blue `#A7B6D0` (on-navy accents, selected small toggles), white
  cards on a pale `#EEF1F6` page.
- **Colors are tokens** in `src/index.css` (`@theme`): `page`, `panel`, `ink`, `muted`, `line` (form
  borders), `hair` (card / row hairlines), `field`, `chrome`, `signal` (slate primary action / selection /
  focus, with white `signal-ink`), `signal-hover`, `signal-tint` (card headers, table headers, hover rows),
  `signal-soft` (small text on a tint, chat bubbles), `signal-bright` (grey-blue: badges and the clock on
  the header, selected chips with `text-chrome`, focus ring on navy), `warn` / `warn-ink` (yellow "needs
  attention" pills: Waiting, Not inspected, near detention), `warn-edge` (amber for warn
  bars, meters and waiting trucks on the map — 3:1 on white), `ok`, `danger`, the purpose colors
  `delivery` (teal), `pickup`, `drop`, yard map `asphalt`,
  `lane` (the yard lane), `building`, `track`, charts `chart-live`, `chart-drop`, the visit-stage scale
  `stage-1`…`stage-4`, shadows `shadow-card` / `shadow-raised` / `shadow-overlay`, and motion
  `animate-fade` / `animate-pop` / `animate-fresh`. Use them as Tailwind utilities or `var(--color-…)`.
  **Never hard-code hex in components.**
- **Never use `signal` to mean status** — it is slate (an action color). Warnings use `warn` / `warn-edge`.
- **Focus on navy**: inside `<header>`, `.on-chrome`, or the `.on-rail` sidebar (wide screens) the focus
  ring turns grey-blue automatically; add `on-chrome` to any new navy surface.
- **Palette** follows the turnaround kit (`design/turnaround-kit/theme.css`): navy, navy-2, sky, yolk, teal; red only for
  over target / costing money. **Dark mode is supported** (system setting, or `data-theme` on `<html>`).
- **Type**: DM Sans for body (`font-body`, 15px base) and for buttons and labels (`font-display`, bold);
  headings (`h1`–`h3` with `font-display`) render in Source Serif 4 automatically. DM Sans runs wide, so the scale is a step smaller than it was with Barlow Condensed: main tabs 17px, page titles 24–26px,
  card / section titles 18–20px, gate step headings 20px, big buttons 18–19px, small buttons 15px, inputs 17px, Yes/No and
  choice buttons 17px, − / + boxes 22px, chips 15px, body 15px, table text 14px, notes 13px. Big KPI numbers may stay
  larger. Tap-target heights don't shrink with the text (44px boards, 52–56px gate).
- **Shared class strings** in `src/ui.js` — use them, don't restyle:
  - Buttons in three tiers: `btnPrimary` / `btnSmallPrimary` (slate, `shadow-raised`; one per area),
    `btn` / `btnSmall` (white, thin border; secondary), `btnGhost` (text only: Show all, Clear filters,
    Close, View entry). 56px on gate forms, 44px on boards and tables. Put an `<Icon>` before the verb.
  - `input`, `label`, `required`, `errorText`, `inputError` for form fields (`Field.jsx` wraps them).
  - `seg(on, bad, danger)` for segmented choices; `tag` for status pills (icon + word);
    `PURPOSE_STYLES` for Delivery / Pickup / Drop Trailer colors.
  - `card`, `cardHead`, `tile`, `th` / `tr` / `td`, `dialog` for the surfaces above.

## 4. Established patterns (copy these)

| Need | Pattern | Example |
|---|---|---|
| Data table | `CardHead` with the title and count; `COLUMNS` array of `{ id, label, options(rows), match(row, value) }`; a `<select>` under each header (All + choices), `border-signal` when active; tinted header row (`bg-field`), `divide-hair` rows with hover tint; **Clear filters** ghost button; first `MAX_ROWS` (5–7) rows then **Show all (n)** / **Show less**; footer with **Print** and **Export** (with icons) | `EntryLog.jsx`, `ShippingDashboard.jsx` |
| Free-text column filter | `search: true` column → text box instead of a select (for IDs like Trailer #) | — |
| Print one section | `body[data-print="<id>"]` rules in `index.css`; expand rows with `flushSync(() => setShowAll(true))` before `window.print()` | `printOutbound` |
| Export | `exportToExcel(rows, filename)` from `src/logColumns.js` (all fields); multi-sheet via lazy `import('xlsx')` | Entry Log |
| Row actions | `<select value="">` with a disabled **Options** placeholder; picking runs the action and it snaps back | Entry Log, Outbound |
| Assign | `AssignDock` (pass `compact` inside tables) — only when the truck is on site and has no dock | |
| Status | Pill with icon + words + color (`ui.tag` + soft background); never color alone. Detention pills take `DETENTION_ICON` from `detention.js` | `InspectionTag` in `Dashboard.jsx`, `STATUS` in `YardMap.jsx` |
| Pop-up | Native `<dialog>` + `showModal()` with `ui.dialog`; closes on Esc, a **Close** button, or a backdrop click (`ev.target === dialog`); padding on an inner wrapper so clicks on it don't close | Live yard map **Enlarge** in `Dashboard.jsx`, `ReleaseDialog.jsx` |
| Selectable tiles | `<button aria-pressed>`; selected = raised white chip (`border-signal bg-panel shadow-raised`); one panel-level action acts on the selection | At the Docks + **Inspect** |
| Headline numbers | `Tile` (optional `icon`, label, big value, note, `tone` good/warn/alert as a thin top bar, ▲/▼ `Trend` vs previous period) | Shipping "Right now" strip; Overview uses kit `tt-card` |
| Section with sub-views | Left sidebar (sticky, `aria-current`, an icon per item) — a navy rail on `lg` with a grey-blue bar on the current item, a row of chips on small screens | Overview tab |
| Notices | `role="status"` card (`shadow-raised`, `animate-pop`, done icon) for success; `role="alert"` on `bg-danger-soft` with a warning icon for problems; auto-clear after 3 s | `App.jsx` |
| Empty state | Info icon + why it's empty and what to do ("Pick a different range, or load the sample data") | `Panel` in `Dashboard.jsx` |
| Gate form (guard data entry) | Keep it simple for a guard with a tablet in one hand, dressed like the other tabs: `GateHeader` (serif **Gate** title, one line on who's ready to leave, `GuardOnDuty` pill, four `GateTile`s — On site, Ready to leave (opens Check Out), Arrived today, Can't leave yet — coloured only when they need action), a sticky `GateTopLine` (Check In / Check Out segmented switch, gate · time · Edit, one thin bar red under ⅓ → amber → green with "7 of 10"), one column of `GateStep` cards in the order the guard works (tinted header strip: icon chip white → amber when started → green tick when done, popping briefly on change, "STEP 2 OF 3", title, one-line hint), short labels, required fields first and optional ones under `More (optional)` (chevron), a short `Recap`, small actions as `LinkButton` ghosts with icons, and a sticky `BottomBar` with "Still needed" (names jump to their step) and the main button in the same place (`goButton`: green when ready, no pulse). Tap before type: `Seg`, `Chips`, `Stepper` (all share `PRESS`: 1.5px border, 150ms colour, 1px press, picked = raised); problems in red with `Note`; known values shown, not asked; Enter/Next moves to the next field. No side panels, illustrations or looping motion. Every control has id `field-<name>` for `ErrorSummary` | `CheckInForm.jsx`, `CheckOutPage.jsx`, `gate/parts.jsx` |
| Stage timer | Every timed step comes from `src/stages.js` (Check in 3–7, Dock assigned 15–30, Pre-loading 5–10, Loading 30–60, Inspection 10–15, Release 7–10, Check out 3–5 min; `currentStage(e)` says which one an on-site truck is in). Show it with `TimerPill` (time, green → amber inside the window → red past the limit) and `TimerLine` (thin bar with the window striped, plus "8m left of 30 min" / "11m over the 30-min limit"), and one `TimerLegend` per page. Refresh every 15 s. Gate form times are recorded, never shown to the guard | `components/StageTimer.jsx`, Shipping, Loading & Inspection |
| Work board (desk) | For a desk role, lay the page out the way the work moves: a one-line read of the situation, `Kpi` tiles that only take colour when they need action, the resources at a glance (dock doors: free / busy with step progress), then lanes in order (Needs a dock → At the docks → Passed inspection, view only), each truck once, oldest/most urgent first, with its timer and its one action. Assign by tapping a free dock (on the card or the door) — no typing. Live charts and the tables/map (in tabs) go below the board | `ShippingBoard.jsx`, `ShippingDashboard.jsx` |
| Work in stages (dock) | Sections in the order the work moves, each truck in exactly one: Loading (trailer check → Loading started → Loading finished) above Inspection (inspect → re-check → passed → **Release to gate**). Only the inspector releases, from the passed card (`ReleaseDialog`, signed by the inspector on duty); Shipping sees the status but has no release button anywhere. Each card: dock eyebrow + status pill, trailer, carrier · customer, a two-step progress, the stage timer, and **one** full-width next-step button pinned to the bottom. The checklist opens inside its own section (not a page jump), in short numbered steps with "All good" for Yes/No groups and the gate `BottomBar`; drafts stay on the device until saved. Live yard on top, map folded at the bottom | `Dashboard.jsx` (DockBoard), `LoadingInspection.jsx`, `LiveYardCard.jsx` |
| Person on duty | Set on the device, signs every save: a white pill ("GUARD ON DUTY · name · Change") in the page's title row — `GuardOnDuty` (Gate), `InspectorOnDuty` (Loading & Inspection). The guard is **mandatory and daily**: stored as `{ name, day }`, cleared on a new day; while unset the Gate shows `GuardStart` ("Who's on duty at the gate?", recent guards as one-tap buttons from `recentGuards(entries)`, or type, **Start shift**) in place of the form, which stays mounted but `hidden` so typed answers survive | `GuardOnDuty.jsx`, `App.jsx` |
| Remembered values | Offer, never auto-fill: "Seen before · Use these details" / "Not this one"; recent carriers and customers as chips (`visitMemory.js`) | Check In → Vehicle details |
| Guard on duty | Required before the Gate form shows, set once a day (see Person on duty); forms log it on save and refuse to save without it | `App.jsx` |

Live data: boards refresh on a timer (30–60 s) via `setInterval` in `useEffect`; show "● Live" or the
moment shown when it isn't live.

## 5. Wording

- **Dock**, never "Door" (code fields like `dockDoor` stay; on-screen text says Dock). The trailer
  checklist item "Doors and seals close properly" is about trailer doors and stays.
- One gate for in and out (`GATE` in `formConfig.js`): **Gate · In** and **Gate · Out**, slate pills with the
  check-in / check-out icon (no gate colours; the forms record the gate without asking). **Order No**, **Carrier**, **Customer**,
  **Trailer #**, **Check In / Check Out**, **Live / Drop**, **Est. detention**.
- Sentence-style labels, short. Buttons are verbs ("Assign dock", "Inspect · Dock 3").
- Times like `1h 49m` (`duration()` in `src/time.js`); clock times via `clockTime()`; dates short ("Oct 28").
- Say what's missing instead of showing blanks: `—` for no value, "No appointment", "No dock".

## 6. Charts

Load the **`dataviz`** skill before writing any chart. In this app:
- Overview charts use the kit's d3 helpers (`TT` from `src/turnaround/charts.js`) through the `Chart` wrapper in
  `Overview.jsx`; numbers come from `src/turnaround/metrics.js`, targets from `src/turnaround/targets.js` only.
  Shipping desk live charts are plain SVG in `ShippingBoard.jsx`.
- Run the palette validator for any new color set against the white card surface. Current sets:
  - live / drop = `chart-live` (saturated navy-blue `#3468C0`) / `chart-drop` (magenta-purple, near the
    app's Drop purple). The palette's own slates read as gray to color-blind readers next to the drop
    purple (ΔE 0.6–4), so charts don't use them for categories; `#3468C0` passes at ΔE 8.3. Drops stay
    **striped**: use the `DROP` fill from `charts.jsx`, never the plain token, for drop marks and swatches.
  - Visit stages (dock wait → inspection → release → check-out) are ordered, so they use one hue from
    grey-blue to slate (`stage-1`…`stage-4`) with labels under the bar, not distinct hues.
  - Single-measure charts (e.g. detention $ per day) use `chart-live`; the busiest-hours grid shades
    `chart-live` from 25% to 100%.
  - Keep chart hues away from status meanings: no green/red/accent for categories.
- Live yard stages (waiting for a dock → loading → inspection → ready to leave) use `yard-wait` / `yard-load` / `yard-insp` /
  `yard-ready` (blue, gold, purple, teal; validated light and dark). Light gold is under 3:1 on white, so counts are
  always shown as numbers beside the label and the chart has a table view. Stage logic lives in `src/liveYard.js`.
- Overview metric deep dives (`src/turnaround/deepDives.js`) use a different chart mix per metric in the
  `--dive-*` colors (index.css): six stages orange → blue → pink → gold → purple → teal, categories blue / gold /
  purple / teal (Delivery / Pickup / Drop trailer = blue / gold / purple). Red only for over target, late and
  detention dollars. The main Overview page keeps the kit colors.
- Impact deep dives (`src/turnaround/impactDives.js`, opened from the "Impact of going digital" tiles) compare
  **manual week = orange `--dive-s1`** with **digital week = teal `--dive-teal`** everywhere (validated pair; grey
  failed for color-blind readers). A saving inside the digital week is a lighter teal; red only where it got
  worse. Each has a one-line finding, four headline figures, then the charts. Estimates (staff time, yearly
  detention, extra trucks) are labelled "estimate"; staff minutes per call / handoff are editable and kept on
  the device (`impact-staff-minutes`).
- One y-axis per chart; two measures → two charts. Hover/focus tooltip on every mark, a legend for ≥ 2
  series, and **Show as table**.

## 7. Accessibility

- Visible focus: the global slate (`signal`) `:focus-visible` outline, grey-blue on navy surfaces — never
  remove it without a replacement.
- Targets ≥ 44px (`min-h-11`); gate-form controls 52–56px.
- Every input has a `<label>`; icon-only or symbolic controls get `aria-label`; charts get `role="img"`
  or per-mark `aria-label`s and a table view.
- Tabs use `role="tablist"`/`tab`/`tabpanel` with `aria-selected`; toggles use `aria-pressed`; sortable
  headers set `aria-sort`; the current sidebar item uses `aria-current`.
- Never rely on color alone (add words, icons, ▲/▼, or position). Text contrast ≥ 4.5:1 (checked: muted on
  tint 4.8, ok on ok-soft 5.0, delivery on its tint 4.9); non-text marks and focus rings ≥ 3:1; don't put
  white text on mid-tone chart colors.
- Destructive actions confirm first (`window.confirm` is the current pattern).

## 8. Responsive layout

- Page width caps at 1400px (`max-w-[1400px]`), side padding `px-4 sm:px-5`. Must work from phone width.
- Grids collapse: tiles `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`; side-by-side cards `xl:grid-cols-2`;
  sidebars `lg:grid-cols-[210px_minmax(0,1fr)]`. Always `minmax(0, …)` / `min-w-0` so content can shrink.
- Wide tables scroll inside their card (`overflow-x-auto` + a `min-w-[…]` table), never the page.
- The header and tabs are sticky; sticky sidebars sit below them (`lg:top-[136px]`).
- Mark controls that shouldn't print with `no-print`.

## 9. How to work on UI in this project

- **Explain the planned change and ask before editing** — this user's standing rule. Offer choices
  (with a recommended one) when there's a real design decision, e.g. a naming clash or layout split.
- Keep edits in the file's existing style (single quotes, no semicolons, Tailwind classes inline,
  short "why" comments). **Do not run Prettier or other formatters** — there is no config and it
  rewrites whole files.
- Verify with `npx vite build`; for logic, render with Vite SSR + `react-dom/server` in a temp script.
  The dev server is usually running at http://localhost:5173.
- Say plainly when something wasn't checked in a real browser (hover position, chart look, print).
- Don't commit or push unless asked.
