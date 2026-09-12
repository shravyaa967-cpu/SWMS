# Habitat Cycle — Solid Waste Management Planning Simulator

A browser-based decision-support tool that lets a planner describe *any* habitat
— village, ward, town or city — across seven real-world parameter categories,
then simulates 20 years of waste generation, collection, treatment and disposal
under normal conditions **and** under stress (floods, landslides, population
surges, industrial accidents). It recommends where to site treatment
facilities, how to size the collection fleet, which assumptions the plan is
most sensitive to, and it answers free-form questions about all of this
through a conversational assistant.

No build step, no server, no account. Open `index.html` in a browser.

## Why this design

Most waste-planning tools stop at "here is a forecast chart." Three decisions
shaped this one instead:

1. **Ground it in a real place, at two resolutions.** A live map (Leaflet /
   OpenStreetMap) fixes the habitat in the real world; a schematic zone grid
   captures the internal structure — roads, settlements, water bodies,
   industrial land, terrain — at the resolution the simulation and the
   facility-siting optimizer actually need. Neither view alone is enough.

2. **Make the plan answer back.** A static forecast can't be interrogated. The
   assistant panel is wired directly into the simulation state: asking
   "simulate a flood in year 6" doesn't just print an answer, it mutates the
   scenario list and re-runs the 20-year model, and every chart updates.
   Rule-based intent parsing handles the questions a planner actually asks
   (volumes, costs, landfill life, facility siting) instantly and offline; an
   optional AI fallback (bring your own Anthropic API key) handles anything
   more open-ended, grounded in a live summary of that habitat's numbers so it
   never answers from generic knowledge alone.

3. **Show what happens when things go wrong, not just when they go right.**
   Stress-testing is a first-class tab, not an edge case: floods, landslides,
   population surges and industrial accidents can be injected into any year
   and compared against a baseline that's always kept in memory, so the
   "what changed" is visible on every chart, not just the new number.

## Feature map

| Requirement | Where it lives |
|---|---|
| Habitat definition across demography, infrastructure, industry, natural resources, terrain, economics, culture | Tabs ① and ② |
| GIS-style representation of roads, settlements, water bodies, terrain | Zone grid editor, Tab ① |
| 20-year forecasting of waste generation, collection, treatment, disposal | Tab ③, `js/simulation.js` |
| Extreme-condition and unexpected-event simulation | Tab ④ |
| Sensitivity testing of key assumptions | Tab ⑤, tornado chart |
| Facility siting and fleet-size optimization | Tab ⑥ |
| Budgeting (capex/opex, deficit flags) | Tab ⑦ |
| Graphical/visual reporting | Charts throughout, `js/charts.js` |
| Conversational interface, integrated with the simulation (not bolted on) | Floating assistant panel, `js/chatbot.js` |
| Exportable summary for decision-makers | Tab ⑧, print-to-PDF |

## Distinguishing features

- **Live KPI dock** (resilience score, circular-economy index, landfill life,
  annual cost) pinned to the header at all times, not buried in a report.
- **Resilience score** — a single 0–100 figure combining collection
  efficiency, landfill runway, budget headroom and diversion rate, so two very
  different plans can be compared at a glance.
- **Circular-economy index** — tracks the share of waste diverted from
  landfill via composting, recycling and waste-to-energy, and is treated as a
  primary output, not an afterthought.
- **Time-travel slider** — scrub through all 20 years and watch the landfill
  fill gauge and year snapshot update, rather than reading a static table.
- **Baseline overlay** — once any scenario is injected, the forecast chart
  keeps showing the unshocked baseline as a dashed reference line.
- **Methane / carbon estimate with a tree-equivalent offset figure**, because
  landfill emissions are usually left out of waste-planning tools entirely.
- **Voice input** for the assistant (Web Speech API) where the browser
  supports it, with a silent, automatic fallback where it doesn't.
- **Runs fully offline.** Every mandatory feature works with zero network
  access once the page's static assets are cached; only the optional AI
  fallback needs connectivity.

## Model assumptions

All coefficients (per-capita generation rates, treatment costs, capacity
expansion rules, methane factors, vehicle capacity) are declared in
`js/data.js` under `ASSUMPTIONS`, not scattered through the code, so every
number in the simulator can be traced back to a single documented source and
adjusted for a different geography or costing basis.

## File structure

```
index.html          Page shell, all tabs and forms
css/style.css        Visual design system
js/data.js           Parameter schema, defaults, zone types, cost assumptions
js/simulation.js     20-year engine: generation, treatment routing, budgeting,
                     calamity injection, sensitivity analysis, optimization
js/mapZones.js       Leaflet map + schematic zone-grid editor
js/charts.js         Chart.js rendering wrappers
js/chatbot.js        Hybrid rule-based / AI-fallback conversational layer
js/report.js         Executive report generation
js/main.js           Application state and UI wiring
```

## Possible extensions

- Multi-language UI (the assistant already supports free-form phrasing, so a
  translated label set is the main remaining piece).
- Household-level segregation tracking via a companion mobile form, feeding
  the `cultural.segregationAdherencePct` input from real field data instead
  of a manual estimate.
- Real GIS import (shapefile/GeoJSON) as an alternative to the schematic
  zone grid for habitats that already have survey data.
