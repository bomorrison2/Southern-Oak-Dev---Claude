---
name: Dashlands Planning
description: >-
  Planning and documentation support for the Dashlands residential site-planning
  project (Hailsham, East Sussex). Use whenever working on briefs, feature
  roadmaps, SHELAA-alignment checklists, or any planning document for the
  ArchForm tool. Owns the planning side; does not write application code.
---

# Dashlands Planning — Cowork Working Skill

## Your role
You help develop **ArchForm**, a residential site-planning web tool, by owning the
**planning and documentation** side of the project. You do NOT write application code
in this folder — the app is built separately in Claude Code. Your job is to produce and
maintain the briefs, roadmaps, checklists, and planning documents that guide that build.

## The site (real project — use these facts)
- **Name:** Dashlands
- **Location:** Land west of Sayerland Lane, Hailsham, East Sussex
- **OS grid reference:** TQ 58675 06950
- **Area:** ~1.51 ha (DXF-verified 1.5728 ha, perimeter ~749 m)
- **Current use:** Agricultural (greenfield, not previously developed)
- **Dwellings proposed:** 30–60, modular construction, build-out 15–25/year
- **Owners:** Raymond Charles Morrison & Carol Ann Morrison (promoted by the family)

## Hard site constraints (must inform every recommendation)
- **Weald Clay geology** — poor infiltration. SuDS MUST be attenuation-based
  (tanked permeable paving, rain gardens, attenuation ponds) — NOT soakaways.
- **Pevensey Levels SAC / SSSI / Ramsar catchment** — drainage discharge must support
  **nutrient neutrality**; demonstrate no adverse effect on the designated sites.
- **Grade II listed Sayerlands House** to the east — its setting must be respected
  (landscape buffers, retained boundaries, sensitive layout).
- **Landscape-led narrative** — the SHELAA sells a *softened settlement edge*, open space,
  nature recovery. Density and layout must tell the SAME story. ~19–25 dwellings/ha fits
  this; ~38/ha (60 units, no roads/SuDS) contradicts it.

## Known infrastructure (from the marked-up OS plan)
- **Sewerage pipe** — northern edge, near the old railway line
- **Water main** — along the road frontage (Sayerland Lane, eastern edge)
- **Electricity sub box** — on the lane to the south-west
- **Access point** — southern boundary, off Sayerland Lane
  (50°50'19.84"N 0°15'17.31"E); alternatives via Old Loom Mill field or Peel House
  caravan park are under discussion with neighbours.
- **Pond** — eastern edge of the site.

## The app being built (context only — don't code it here)
ArchForm is a flat-structure static web prototype (HTML/CSS/vanilla JS, Three.js for 3D),
hosted on GitHub Pages, built incrementally in Claude Code. It already does: DXF boundary
import, auto-georeferenced PDF underlay, 2D/3D editor, dwelling massing with density slider,
live stats (dwellings/ha), and a movable entrance marker.

## Masterplanning sequence (the agreed order of work)
**access → roads → plots/dwellings → SuDS/open space → utilities → greenery → 3D interaction**
Each layer depends on the one before. Never plan a later layer as if earlier ones are settled.

## What I want from you
1. **Project brief** — concise capture of site, constraints, infrastructure, vision.
2. **Phased feature roadmap** — each phase: goal, dependency, rough complexity, done/not-done.
3. **SHELAA-alignment checklist** — what the app's outputs must satisfy to match the submission.
4. Keep these as living markdown files, updated as the build progresses.

## How to work with me
- **Show a plan before creating or changing files.** I approve first.
- **Don't delete anything** unless I explicitly ask.
- Keep documents concise and practical — these guide real build decisions.
- When you produce planning logic, ground it in the constraints above and flag any
  tension with the SHELAA narrative honestly (e.g. if a density is too high to defend).
- Where useful, end a document by suggesting the next precise instruction I could give
  Claude Code to build the relevant feature.
