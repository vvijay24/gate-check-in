# UI change checklist

Go through this before saying a UI change is done. Report anything you couldn't check.

## Fit
- [ ] Reuses an existing pattern / component / `ui.js` class where one fits; nothing restyled from scratch.
- [ ] Colors are tokens in `index.css` `@theme` (light only; there is no dark theme to update).
- [ ] Wording matches the app: Dock (not Door), Gate · In / Gate · Out (one gate), Order No, Carrier, Customer.
- [ ] One primary (slate) action per area; secondary actions use `btn`/`btnSmall`, minor ones `btnGhost`;
      destructive actions confirm.
- [ ] `signal` is used only for actions, selection and focus — never to mean a status (use `warn` / `warn-edge`).

## Look
- [ ] Cards use the calm-modern surface (`rounded-2xl border-hair shadow-card`) and `CardHead` / `Card`
      with a tinted strip; no heavy 2px borders outside form fields.
- [ ] Radius, spacing and shadow come from the scale in SKILL.md §2 (`gap-6` between cards, `p-4`/`p-5` bodies).
- [ ] Icons come from the `ICONS` map in `src/icons.jsx`, sit beside a word, and are `aria-hidden`;
      icon-only buttons have an `aria-label`; no emoji status marks.
- [ ] Motion is short (150–200ms) and calm; nothing animates on a live refresh; reduced motion is
      covered by the global rule in `index.css`.
- [ ] Any new navy surface has `on-chrome` so the focus ring stays visible.

## States
- [ ] Empty state says why and what to do next.
- [ ] Long lists are capped (5–7 rows) with Show all / Show more.
- [ ] Missing values show `—` or a word, never a blank cell or "NaN" / "undefined".
- [ ] Works with sample data and with no data.

## Access
- [ ] Keyboard: every control reachable, visible focus ring (slate, grey-blue on navy), Esc closes pop-ups.
- [ ] Targets ≥ 44px; labels on inputs; `aria-label` on symbolic controls and chart marks.
- [ ] Nothing depends on color alone; text ≥ 4.5:1, marks and focus rings ≥ 3:1.
- [ ] Charts: validated palette, one y-axis, tooltip, legend for ≥ 2 series, "Show as table".

## Layout
- [ ] No horizontal page scroll at phone width; wide tables scroll inside their card.
- [ ] Grids stack on small screens; `min-w-0` / `minmax(0, …)` where content must shrink.
- [ ] Print: `no-print` on controls; printable sections still make sense (shadows drop out in print).

## Verify
- [ ] `npx vite build` passes (no formatter run).
- [ ] Rendered once via Vite SSR if logic changed.
- [ ] Told the user what was not checked in a browser (hover, motion, dialogs, print).
