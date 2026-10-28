# UI change checklist

Go through this before saying a UI change is done. Report anything you couldn't check.

## Fit
- [ ] Reuses an existing pattern / component / `ui.js` class where one fits; nothing restyled from scratch.
- [ ] Colors are tokens; any new token is defined in all three theme blocks of `index.css`.
- [ ] Wording matches the app: Dock (not Door), Gate 1 · In / Gate 2 · Out, Order No, Carrier, Customer.
- [ ] One primary (yellow) action per area; destructive actions confirm.

## States
- [ ] Empty state says why and what to do next.
- [ ] Long lists are capped (5–7 rows) with Show all / Show more.
- [ ] Missing values show `—` or a word, never a blank cell or "NaN" / "undefined".
- [ ] Works with sample data and with no data.

## Access
- [ ] Keyboard: every control reachable, visible yellow focus ring, Esc closes pop-ups.
- [ ] Targets ≥ 44px; labels on inputs; `aria-label` on symbolic controls and chart marks.
- [ ] Nothing depends on color alone; text readable in light and dark.
- [ ] Charts: validated palette, one y-axis, tooltip, legend for ≥ 2 series, "Show as table".

## Layout
- [ ] No horizontal page scroll at phone width; wide tables scroll inside their card.
- [ ] Grids stack on small screens; `min-w-0` / `minmax(0, …)` where content must shrink.
- [ ] Print: `no-print` on controls; printable sections still make sense.

## Verify
- [ ] `npx vite build` passes (no formatter run).
- [ ] Rendered once via Vite SSR if logic changed.
- [ ] Told the user what was not checked in a browser.
