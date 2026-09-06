# ArchForm — Phased Feature Roadmap

*Living document. Last updated: 9 August 2026 (Increments 1–4 built: generative layout engine, attenuation SuDS, eco homes + Hailsham vernacular, utilities/services — verified in-browser on the real DXF, each committed).*
*Phased to the agreed masterplanning sequence. Each layer depends on the one before — never plan a later layer as if earlier ones are settled.*

**Sequence:** access → roads → plots/dwellings → SuDS/open space → utilities → greenery → 3D interaction

**Status key:** ✓ Built · ◐ Partial · ☐ Not started
*Status is assessed from the app screenshots dated 18 June 2026, not assumption.*

---

## Next actions (running log)

**Set 18 June 2026 — next two instructions for Claude Code, in order.**

**1. Foundation fix (do first — low effort, high payoff).** Stops the tool reporting flattering density while later layers are built on top of it.

> In editor.html, make the live stats panel read the real imported DXF boundary (1.5728 ha) instead of the 0.35 ha demo rectangle. Add a "net developable area" figure that subtracts a user-adjustable percentage for roads, SuDS and open space, and base the dwellings/ha readout on the net figure, not the gross site area. Show gross and net side by side so both are visible.

> **✓ Done 19 June 2026.** Stats already read the live boundary polygon (1.57 ha gross once the DXF is imported; the 0.35 ha rectangle is only the pre-import demo). Added a "Roads / SuDS / open space %" slider (default 35%) and a Net ha figure; headline density is now dwellings/ha **net**, with dw/ha gross shown alongside. Persisted in `editorState`.

**2. Phase 1 — Access (next masterplanning layer).** Everything downstream (roads, plot frontages) hangs off this.

> In editor.html, upgrade the entrance from a single point marker into a proper access element. Let me: (1) snap the entrance to the southern boundary off Sayerland Lane at the confirmed access point (50°50'19.84"N, 0°15'17.31"E); (2) draw a short access stub/visibility splay from it into the site; and (3) save two alternative access options I can toggle on/off (one via the Old Loom Mill field, one via Peel House caravan park) without losing the primary. Keep the entrance constrained to the boundary line so it can't be placed off-site.

> **◐ Mostly done 19 June 2026.** (1) Entrance snaps to the confirmed Sayerland Lane access. The surveyed pin converts to OSGB **558859.18 E / 106790.66 N** (BGS OSTN15, cross-checked by independent computation to 0.5 m) but lies **~120 m beyond this title boundary**, so it projects onto the nearest boundary point — the **south tip of the frontage** (verified to the cm against the real DXF). A corrected boundary that reaches the lane will use the exact surveyed point automatically. (2) Adjustable access stub / visibility splay drawn in 2D **and** 3D. (3) Alternative options **deferred by decision** — to be added later as toggleable markers. Constrained to the boundary throughout. Live-preview verified, no console errors.

*Caveat:* the southern access is confirmed in principle; the Old Loom Mill / Peel House alternatives are still under discussion with neighbours — build them as toggleable options, not commitments.

**Set 19 June 2026 — next instruction for Claude Code.**

**3. Phase 2 — Roads (next masterplanning layer).** The access point is now fixed, so the road spine can hang off it. Roads consume developable area, so this also feeds the net-density figure honestly.

> In editor.html, add a road-drawing layer. Let me draw an internal estate road as a polyline starting from the access stub at the south frontage, with an adjustable carriageway width, rendered in both 2D and 3D. Calculate the total road area and feed it into the existing "Roads / SuDS / open space %" deduction so the net developable area and net dwelling density update automatically from the drawn roads rather than a flat percentage guess. Keep roads inside the boundary and snapped to the access stub.

*Planning note before building:* see the **access-pin / boundary gap** flagged in the Project Brief (open questions) — the surveyed access point currently falls ~120 m beyond the title boundary. The road spine should start from the projected boundary point for now, and will re-anchor automatically once the boundary is corrected to reach the lane.

**Set 9 August 2026 — Increments 1–4 built (generative engine → SuDS → eco homes → utilities/services).**

Built in one session, verified in-browser against the real `dashlands_boundary_osgb_joined.dxf` (1.573 ha), each committed separately in the `Southern-Oak-Dev---Claude` repo:

> 1. **Generative layout engine** (`generateScheme()`). Places homes fronting **both sides of the drawn road** at a front-garden setback (never on the carriageway), clear of an **eastern heritage buffer** and **western Cuckoo Trail buffer**, thinned to a target count with an indicative **majority 1–3-bed** mix (bungalow/terrace/semi/detached). Buffer-aware **grid fallback** when no road is drawn; homes **re-front automatically** when the road changes. Net density **flags amber above 25 dw/ha**. Renders 2D + 3D; persisted in `editorState`.
> 2. **Attenuation SuDS layer.** Draw ponds / rain gardens / permeable-paving as polygons; combined area **measured into net developable** (the % slider is now "open space / landscape" so nothing double-counts); the generator **keeps homes off SuDS**. **No soakaway option** (Weald Clay). 2D fills + 3D water/ground planes.
> 3. **Eco homes + Hailsham vernacular.** Per-type 3D houses with the HDG palette (**red brick, pastel render, weatherboarding, hung clay tiles; red-clay / dark-slate roofs**), pitched roofs, doors/windows, chimneys, and **south-facing roof PV** with a measured **PV-roof-m²** stat + toggle.
> 4. **Utilities / services.** Defaults moved to the **documented OS-plan positions** (sewer N, water E frontage, elec SW — labelled *indicative, verify vs OS plan*), toggleable **service runs** from each marker to the scheme (2D + 3D), and a one-click **eastern attenuation-pond** seed.

*Caveats carried forward:* mix/materials/marker positions are **indicative, not policy/spec**; carriageway can still overhang the boundary by ≤ width/2 at the edge; access-pin/boundary gap unresolved (projected to nearest boundary point); real **plot subdivision** (vs footprints) and **road hierarchy/junctions** still outstanding.

---

## Phase 0 — Foundation (site setup) — ✓ largely built

The groundwork that every later layer sits on: getting the real site into the tool, to scale, georeferenced.

| Feature | Status | Notes |
|---|---|---|
| DXF boundary import | ✓ | Real Dashlands L-shaped boundary loads (`dashlands_boundary_osgb_joined.dxf`). |
| Auto-georeferenced PDF underlay (OSGB grid) | ✓ | Marked-up OS plan loads aligned to the OSGB grid; opacity control present. |
| Calibrate scale | ✓ | Manual scale calibration available. |
| 2D plan + 3D massing views | ✓ | Both views working; toggle in header. |
| Live stats panel | ✓ | dwellings/ha, site m²/ha, dwellings, footprint, GFA, FAR, buildings, max floors. |
| Save project / export JSON / My Projects | ✓ | Persistence and export present. |

**Open issue — ✓ resolved 19 June 2026:** the live stats read the real boundary polygon (1.5728 ha once the DXF is imported); the 0.35 ha rectangle only appears as the pre-import demo (which now self-clears and never overwrites a loaded boundary). Net developable area + net density added — see Phase 3.

---

## Phase 1 — Access — ◐ partial (primary access + splay built 19 Jun 2026; alternatives outstanding)

*Goal:* establish where and how the site connects to Sayerland Lane. Everything downstream (road spine, plot frontages) hangs off this.
*Dependency:* Phase 0 (boundary + georeferenced underlay).
*Complexity:* medium.

| Item | Status | Notes |
|---|---|---|
| Movable entrance marker | ✓ | Marker exists and can be repositioned in 2D. |
| Entrance at confirmed access point | ✓ | Snaps to the confirmed Sayerland Lane access (WGS84→OSGB **558859.18 E / 106790.66 N**, BGS OSTN15). Pin sits ~120 m beyond this title boundary, so it projects onto the nearest boundary point — the south tip of the frontage (verified to the cm). A boundary that reaches the lane will use the exact point. |
| Visibility splay / access geometry | ✓ | Access stub / splay drawn from the entrance into the site (inward normal of the boundary edge), 2D + 3D, with adjustable depth & mouth-width sliders; persisted. |
| Record alternative access options | ☐ | **Deferred by decision (19 Jun)** — primary confirmed first. Old Loom Mill field / Peel House caravan park to be added as toggleable markers; still under neighbour discussion. |

---

## Phase 2 — Roads — ◐ partial (carriageway draw + measure built 28 Jun 2026)

*Goal:* internal estate road / spine layout from the access point.
*Dependency:* Phase 1 (access fixed).
*Complexity:* high (geometry + area accounting).

| Item | Status | Notes |
|---|---|---|
| Draw internal road (polyline from access stub) | ✓ | Centreline drawn in 2D from the access stub (auto-snapped to it); clicks clamp inside the boundary; dbl-click / Esc to finish. |
| Adjustable carriageway width | ✓ | Slider 3–8 m (default 5). |
| Road rendered 2D + 3D | ✓ | Grey carriageway + dashed centre line in 2D; flat ground ribbon mesh in 3D. |
| Road area feeds net developable area | ✓ | Measured road area (length × width) subtracted from gross; the deduction slider is now **SuDS / open space** only (35→25% default). Net ha + net density update live from the drawn geometry, not a flat guess. |
| Dwellings respond to road (no overlap) | ☐ | Deferred — dwellings still place independently of the carriageway. Next phase. |
| Carriageway clipped to boundary | ◐ | Centreline is clamped inside; the carriageway can overhang by up to width/2 at the edge. True edge-clipping deferred. |
| Road hierarchy / junctions / turning heads | ☐ | Single polyline only; no spine/loop hierarchy or geometry standards yet. |

Roads now consume measured developable area, so the net dwellings/ha figure reflects the drawn layout rather than overstating density (addresses Project Brief §5).

---

## Phase 3 — Plots / dwellings — ◐ mostly built (generative engine 9 Aug 2026)

*Goal:* real subdivided plots and dwellings, not free-floating massing blocks.
*Dependency:* Phase 2 (roads define frontages).
*Complexity:* high.

| Item | Status | Notes |
|---|---|---|
| Dwelling massing blocks | ✓ | Blocks place within the boundary in 2D/3D. |
| **Generative layout (`generateScheme`)** | ✓ | **9 Aug 2026.** Homes placed by an engine, not hand-drawn — fronting the road at a setback, buffer-aware, thinned to a target count. |
| Density / target-count slider | ✓ | Target count drives the generator; caps at what fits. |
| Building presets | ✓ | Tower / Slab / Terrace / Courtyard (for the separate manual `buildings` layer). |
| Compliance panel | ✓ | Coverage %, FAR, Build %. |
| **Dwellings respond to road (no overlap)** | ✓ | **9 Aug 2026.** Homes front both road sides, none on the carriageway; re-front when the road changes. |
| Real plot subdivision | ☐ | Homes are oriented footprints, not yet plots with gardens/boundaries tied to each frontage. |
| Net vs gross density readout | ✓ | Dwellings/ha **net** (headline) + gross; net = gross − measured road − measured SuDS − open-space%. Net density flags amber above ~25 dw/ha. |
| **Modular-appropriate house types** | ✓ | **9 Aug 2026.** Bungalow / terrace / semi / detached with Hailsham vernacular materials + roof PV (Increment 3). Mix indicative, not policy. |

> **Density caveat:** keep the slider honest. 60 units on 1.51 ha is ~38–40 dw/ha gross and contradicts the landscape-led SHELAA narrative; ~19–25 dw/ha (≈30–38 units net) is the defensible range.

---

## Phase 4 — SuDS / open space — ◐ built (attenuation layer 9 Aug 2026)

*Goal:* attenuation-based drainage and open space as first-class layers.
*Dependency:* Phases 2–3 (roads and plots define impermeable area and leftover space).
*Complexity:* high.

| Item | Status | Notes |
|---|---|---|
| Draw attenuation SuDS (ponds / rain gardens / permeable) | ✓ | **9 Aug 2026.** Polygons drawn per type; **no soakaway option** (Weald Clay). |
| SuDS area feeds net developable | ✓ | Combined SuDS m² measured and subtracted from net; the % slider is now "open space / landscape" so nothing double-counts. |
| Homes kept off SuDS | ✓ | Generator rejects footprints inside any SuDS polygon. |
| One-click eastern pond seed | ✓ | Matches the OS-plan pond; doubles as the heritage-edge water feature. |
| Nutrient-neutrality / discharge-rate logic | ☐ | Pevensey Levels catchment — no-adverse-effect / discharge-rate accounting not yet modelled. |
| SuDS-as-habitat / open-space accounting | ◐ | Areas measurable; not yet credited toward BNG / open-space targets. |

Still outstanding: the **Pevensey Levels nutrient-neutrality** demonstration and discharge-rate logic — the drainage *geometry* is now drawable and measurable, but the *compliance case* (rates, nutrient budget) is not yet computed.

---

## Phase 5 — Utilities — ◐ partial (positions unverified)

*Goal:* show service connections and routes from known infrastructure.
*Dependency:* Phases 2–4 (routes follow roads/open space).
*Complexity:* medium.

| Item | Status | Notes |
|---|---|---|
| Movable markers: sewer, water, elec | ✓ | Three markers exist and can be moved (entrance covered in Phase 1). |
| Defaults at documented OS-plan positions | ◐ | **9 Aug 2026.** Defaults now compute to sewer = north edge, water = **eastern** Sayerland Lane frontage, elec = south-west (off-site). Labelled *indicative — verify vs the marked-up OS plan*; the blocking check to confirm against the actual plan **still stands**. |
| Pond (eastern edge) | ✓ | **9 Aug 2026.** One-click eastern attenuation-pond seed (also a Phase 4 SuDS area). |
| Routed connections (not just points) | ◐ | **9 Aug 2026.** Toggleable indicative service runs from each marker to the road/scheme (2D + 3D). Not a designed utility layout. |

> This phase carries the marker-position verification flag from the Project Brief. Treat it as a blocking check, not a cosmetic tidy-up.

---

## Phase 6 — Greenery / landscape — ◐ partial (buffer bands 9 Aug 2026)

*Goal:* retained and reinforced landscape framework.
*Dependency:* Phases 3–5 (plots, open space, utilities placed).
*Complexity:* medium.

**9 Aug 2026:** the generator now draws and enforces an **eastern heritage buffer** (Sayerlands House) and **western Cuckoo Trail buffer** as no-build bands (adjustable, visible on plan). Still to represent as first-class layers: retained hedgerows and tree belts, the Cuckoo Trail corridor as active-travel connection, and **measurable biodiversity net-gain areas** — the buffers are enforced keep-outs, not yet accounted habitat.

---

## Phase 7 — 3D interaction — ◐ partial

*Goal:* a presentable, navigable 3D model for officers/investors.
*Dependency:* all prior layers (3D is only as honest as the layers feeding it).
*Complexity:* medium–high.

| Item | Status | Notes |
|---|---|---|
| 3D massing view | ✓ | Orbit/pan/zoom; dwellings render within the boundary. |
| Editable properties in 3D | ◐ | Properties panel present ("select a building to edit"); depth of editing unconfirmed. |
| Terrain / context massing | ☐ | Flat site (helpful), but surrounding context and landscape not yet modelled. |
| Visual representation of SuDS/greenery | ☐ | Depends on Phases 4 & 6. |

---

## Adjacent tool — AI design brief generator (`designer.html`) — ◐ beta

A separate page ("AI DESIGN TOOL — BETA") generates an AI-optimised design brief from parameters (site area, FAR, floors, unit mix, room specs, programme). Currently requires an API key ("No API key — click to set") and shows "Awaiting parameters". Useful for the *building* brief but **not** part of the masterplanning sequence above. Keep its outputs consistent with the constraints here (modular, 30–60 units, landscape-led).

---

## Next instruction for Claude Code

See the **Next actions (running log)** near the top of this file — it holds the current ordered instructions and is updated as work progresses.

---
*Sources: SKILL.md, ArchForm screenshots (18 June 2026), Shelaa Submission.pdf, dashlands_boundary_osgb_joined.dxf.*
