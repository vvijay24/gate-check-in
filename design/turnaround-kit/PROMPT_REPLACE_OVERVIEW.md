Paste this into Claude Code from your project folder, after copying this kit into the project (for example into `design/turnaround-kit/`):

---

Replace my current overview page with the new truck turnaround overview described in `design/turnaround-kit/`.

Read these first:
- `METRICS.md`: what the page shows and the data it needs
- `metrics.js`: the exact calculations; reuse them rather than rewriting
- `DESIGN.md`, `theme.css`, `charts.js` and `demo.html`: the look
- `reference/dashboard-overview-page.html`: the original page, for layout and wording

Then:
1. Show me where my overview lives and which old metrics it shows. Tell me which of them you will remove. Don't delete any shared code other pages use.
2. Check what my data actually stores for each truck visit against the fields `METRICS.md` needs. List what's missing, and propose how to capture it (for example a "dock assigned" button for shipping, "load start/end" for the dock, "inspection done" for the inspector). Wait for my OK before changing data models or forms.
3. Build the new overview in this order: hero with takeaway, six KPI cards with sparklines, the "Impact of going digital" section, "Where the time goes", "Arrivals and volume". Each card opens its detail view.
4. Use `metrics.js` for all numbers, fed from my real visits. Keep the targets exactly as listed in `METRICS.md`, in one constants file.
5. Where data for a section isn't available yet (for example no manual-week data), show the section with a clear "Not enough data yet" message, or use the sample JSON clearly labeled as sample. Ask me which I prefer.
6. Match the styling with `theme.css` and `charts.js`, including dark mode.
7. When done, list what's live, what's on sample data, and what still needs data.
