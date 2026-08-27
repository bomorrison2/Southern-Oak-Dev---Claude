# ArchForm Studio

A site-design tool for residential plots. Define or upload a plot, record the
constraints that limit it, describe what you want to build, then generate,
edit, compare and export constraint-aware layout concepts.

> **ArchForm Studio produces conceptual studies only.** It is not a survey and
> not design advice. Nothing it produces confirms compliance with planning
> policy, building regulations, structural requirements, drainage capacity,
> highways standards, easements or covenants. Always take professional advice
> before making decisions.

---

## Quick start

```bash
cd studio
npm install
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 by default).

First run: click **Open sample project** on the Projects screen. That loads a
worked example - a fictitious corner plot with a road, an access point, a
protected oak, a drainage easement and a neighbouring house - so you can see the
whole workflow immediately.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint (zero warnings allowed) |

## The workflow

1. **Projects** - create a project or open the bundled sample.
2. **New project** - name, address, units, north bearing, and optionally a
   starting plot rectangle.
3. **Studio** - project navigation on the left, plan or 3D stage in the centre,
   contextual inspector on the right.
   - **Site**: upload a plan, set its real-world width, trace and edit the plot
     boundary, set setbacks and orientation.
   - **Constraints**: draw roads, access points, trees, easements, utilities,
     no-build zones, neighbours and slope notes.
   - **Brief**: building type, floor area, bedrooms, storeys, parking, style,
     budget band, outdoor space, orientation priority, required rooms.
   - **Concepts**: generate three ranked options, then edit the selected one -
     move it on the plan, resize, rotate, change materials, mark a preferred.
4. **Compare** - two concepts side by side with metric differences.
5. **Export pack** - a print-ready summary (Save as PDF from the browser print
   dialogue), plus JSON export and PNG export of the current view.

## Supported file formats

| Format | Support |
| --- | --- |
| `.dxf` (ASCII) | Boundary import. Reads `LWPOLYLINE` and legacy `POLYLINE`/`VERTEX`. Coordinates are recentred on their centroid, so national-grid files work. |
| `.pdf` | Underlay. Page 1 is rasterised with pdf.js and placed behind the plan for tracing. |
| `.png`, `.jpg`, `.webp` | Underlay. Placed behind the plan for tracing. |

Maximum upload size is 20 MB.

**Not supported:** binary DXF, DWG, RVT, SKP, DGN, IFC, STEP. The app detects
these and says what to export instead, rather than failing silently.

Uploaded plans are placed at an assumed 40 m width until calibrated. Set **Plan
width on site** in the Site panel to the real overall width before trusting any
traced dimension - an uncalibrated plan is flagged as an assumption in the pack.

## Visualisation providers

The 3D view is a **real-time render produced in your browser with Three.js**.
It is labelled as a render, never as a photograph, and needs no external
service.

For photorealistic imagery there is a provider interface with a remote adapter
(`src/visualisation/provider.ts`). Configure it with a `.env` file in `studio/`:

```bash
VITE_VIZ_PROVIDER=remote
VITE_VIZ_ENDPOINT=https://your-service.example.com/render
```

**No API key is ever read in the browser.** `VITE_*` variables are baked into
the client bundle, so the endpoint must be a service you host that holds the
credentials server-side and calls the image provider on your behalf.

The endpoint receives a POST with `view` (`aerial` / `street` / `garden`),
plus `concept`, `site` and `brief`, and must reply with
`{ "imageUrl": "https://..." }`. Any non-2xx response, or a reply without
`imageUrl`, surfaces an actionable error and the app falls back to the local
render.

## How generation works

`src/generation/` is deliberately explainable rather than a black box:

- `buildable.ts` reduces the plot by the setbacks and by every exclusion you
  record - no-build zones, easement and utility corridors, tree root protection
  areas.
- `generator.ts` searches placements inside that envelope using four strategies
  (balanced, street-facing, garden-led, corner-tucked) so the options are
  genuinely different arrangements. It is deterministic for a given seed, so
  reopening a project reproduces the same layouts.
- `access.ts` finds the access point (yours if marked, otherwise the plot edge
  nearest a road, otherwise an assumed southern boundary) and lays a driveway
  and parking bays.
- `rooms.ts` packs the brief into the footprint, putting living space toward the
  sunny aspect and service rooms to the rear.
- `scoring.ts` rates each concept 0-100 on fit, daylight, access, amenity and
  efficiency.

**Scores are design heuristics for comparing options against each other.** They
carry no regulatory meaning.

Every concept carries provenance labels - **Your input**, **Suggestion** or
**Assumption** - and the assumptions are repeated in the export pack.

## Architecture

```
studio/src/
  domain/         Types, units, validation, defaults, disclaimers, sample project
  geometry/       Polygon maths, bounding boxes, transforms, inward offset
  ingest/         DXF parser, PDF and image readers, upload validation
  generation/     Buildable envelope, concept generator, rooms, access, scoring
  visualisation/  Provider interface, local renderer, remote adapter
  persistence/    localStorage repository, autosave store, versions, exporters
  ui/             Primitives, inspector panels, 2D canvas, 3D viewer
  routes/         Projects, New project, Studio, Compare, Export
  styles/         Design tokens, base styles, print styles
```

UI, domain logic, geometry, adapters and persistence are separated so the
generation engine can be tested and reused without a browser.

## Data and privacy

Projects are stored in your browser's `localStorage` under
`archform.studio.projects.v1`. Nothing is uploaded anywhere. Clearing site data
deletes your projects, so use **Export JSON** for anything you want to keep.

Autosave is debounced and the save state is shown in the header. If storage is
unavailable (private browsing) or full, the app says so rather than losing work
silently. Corrupt records are skipped and reported instead of crashing.

Each project keeps up to 12 restorable versions. One is taken automatically
before a regenerate, and you can save one manually at any time.

## Testing

```bash
npm test
```

The suite covers the parts where correctness matters:

- geometry (area, centroid, point-in-polygon, distances, transforms, offsets)
- unit conversion round-trips
- the DXF parser, including CRLF, legacy `POLYLINE` and malformed input
- upload validation and its error messages
- generator invariants - a building is never placed outside the developable
  envelope, parking never overlaps a constraint, generation is deterministic,
  and an impossible brief explains itself rather than throwing
- room scheduling, access and parking layout, scoring bounds
- persistence round-trips, corrupt-data recovery, version restore
- form validation and the onboarding screens

## Known limitations

- Room layouts are **diagrammatic** - a test of whether the brief plausibly
  fits, not an architectural plan. No room is checked against building
  regulations.
- The buildable envelope uses a conservative single setback for its outline and
  samples exclusions on a grid, so areas are close estimates, not exact.
- Levels and slope are recorded as annotations only; there is no cut-and-fill or
  terrain modelling.
- One building per concept. Multi-plot and multi-unit schemes are out of scope.
- No cost estimating. The budget band is recorded for the pack, nothing more.
- Export is print-to-PDF via the browser rather than a generated PDF file.
