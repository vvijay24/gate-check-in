Paste this into Claude Code from your project folder, after copying this kit into the project (for example into `design/turnaround-kit/`):

---

I want my app to look exactly like the design in `design/turnaround-kit/`. Read `DESIGN.md` first, then `theme.css`, `charts.js` and `demo.html`, which is a working reference page.

Please:
1. Look at how my app is built (framework, styling, chart library) and tell me your plan before changing anything.
2. Bring in the theme: the color tokens, fonts, spacing and component styles from `theme.css`. Use it directly if my app uses plain CSS. If it uses Tailwind, CSS modules or styled-components, translate the tokens into that system.
3. Restyle my existing screens to match the layout in `DESIGN.md`: hero banner, KPI cards with icon chips, status pills and sparklines, sectioned panels, and the detail view with pill tabs.
4. Replace or restyle my charts to match `charts.js`. Use the helpers as they are if my app can use d3. Otherwise copy their look (colors, rounded bars, target bands, red dashed max line, tooltips) into my chart library.
5. Keep the meaning of the colors: navy for gate and yard time, yolk/gold for time at the door, teal for good results, and red only for over target or money at risk.
6. Support dark mode the way the theme does.
7. Don't change my data, calculations or business logic: only the look.
8. Show me the result and list anything that couldn't be matched.
