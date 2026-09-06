# Dashlands — Project Brief

*Living document. Last updated: 19 June 2026. Owner: Ray (landowner/promoter).*
*Purpose: the single reference for what Dashlands is, what constrains it, and what the ArchForm tool exists to demonstrate. Facts are separated from assumptions throughout.*

---

## 1. Site identity (confirmed facts)

| Item | Detail | Source |
|---|---|---|
| Name | Dashlands | SHELAA submission |
| Location | Land west of Sayerland Lane, Hailsham, East Sussex | SHELAA submission |
| OS grid reference (centre) | TQ 58675 06950 | SHELAA submission |
| Site area (stated) | 1.51 ha | SHELAA submission |
| Site area (DXF-verified) | 1.5728 ha, perimeter ~749 m | `dashlands_boundary_osgb_joined.dxf` |
| Current use | Agricultural (greenfield, **not** previously developed) | SHELAA submission |
| Brownfield register? | No | SHELAA submission |
| Owners | Raymond Charles Morrison & Carol Ann Morrison | SHELAA submission |
| Promoter status | Landowner-promoted; no developer agreement in place | SHELAA submission |
| Planning history | None | SHELAA submission |
| Pre-application discussion | None held | SHELAA submission |

**Note on area:** the SHELAA states 1.51 ha; the DXF measures 1.5728 ha. The ~4% difference is normal between a rounded submission figure and a CAD-derived boundary. Use **1.51 ha** for planning correspondence and **1.5728 ha** for app/area calculations, and keep both visible rather than silently picking one.

## 2. The proposal (confirmed facts)

- **Dwellings:** 30–60 net (market + affordable).
- **Construction:** factory-built modular.
- **Build-out:** ~15–25 dwellings/year; whole site delivered in ~2–3 years once commenced.
- **Phasing:** single comprehensive phase or a small number of logical phases, driven by market absorption rather than infrastructure constraints.
- **Availability:** within the first five years of the plan period; commencement window given as FY 2025/26.
- **Viability:** stated as viable with no abnormal costs identified.

## 3. Hard site constraints (must inform every recommendation)

These are the constraints that should shape layout, density and every app feature. They are drawn from the project brief (SKILL.md) and corroborated by the SHELAA where noted.

1. **Weald Clay geology — poor infiltration.** SuDS **must** be attenuation-based (tanked permeable paving, rain gardens, attenuation ponds). **Soakaways will not work.** *(Project constraint; the SHELAA references sustainable drainage generally but does not specify the attenuation requirement — treat the attenuation point as the design rule.)*
2. **Pevensey Levels SAC / SSSI / Ramsar catchment.** The site is physically outside the designations but within their catchment and impact risk zones. Drainage discharge must support **nutrient neutrality**, and any application must demonstrate **no adverse effect on the integrity** of the designated sites, alone or in combination. *(Confirmed in SHELAA, p.6.)*
3. **Grade II listed Sayerlands House to the east.** Its setting must be respected through landscape buffers, retention of existing boundaries, and a sensitive layout. The SHELAA argues the site makes no critical contribution to the asset's significance, but commits to a heritage-led approach — the layout must honour that commitment. *(Confirmed in SHELAA, p.4.)*
4. **Landscape-led narrative.** The SHELAA sells a *softened settlement edge*, open space and nature recovery, with retained hedgerows, tree belts and the Cuckoo Trail corridor providing containment. **Density and layout must tell the same story.** ~19–25 dwellings/ha fits this narrative; ~38/ha (60 units with no allowance for roads/SuDS/open space) contradicts it. *(See §5 for the density tension.)*

## 4. Known infrastructure (marked-up OS plan is the source of truth)

The marked-up OS plan governs marker positions, **not** the app's current defaults. Confirmed positions:

- **Sewerage pipe** — northern edge of the site, near the old railway line.
- **Water main** — along the eastern road frontage (Sayerland Lane).
- **Electricity sub box** — on the lane to the south-west.
- **Access point** — off Sayerland Lane (50°50'19.84"N 0°15'17.31"E, ≈ OSGB 558859 E / 106790 N). **Note:** this surveyed point sits ~120 m *beyond* the current DXF title boundary, so it does not yet fall on the site as drawn — see open questions §7. Alternatives via the Old Loom Mill field or Peel House caravan park are under discussion with neighbours.
- **Pond** — eastern edge of the site.

The SHELAA confirms mains water and public sewer along the road frontage and an electricity sub-station serving the local area, and confirms direct frontage access to Sayerland Lane (connecting via Ersham Road) with pedestrian/cycle links to the Cuckoo Trail.

> **⚠ Verification flag.** ArchForm currently shows four movable markers (entrance, sewer, water, elec) at **default demo positions**. These must be checked and corrected against the positions above before any output is treated as representative. This is carried as an open action in the roadmap (Phase 5).

## 5. The density tension (flag, honestly)

The proposal range is 30–60 dwellings on ~1.51 ha. That spans roughly **19–40 dwellings/ha**:

- **Lower/mid range (30–38 units, ~19–25 dw/ha):** consistent with the landscape-led SHELAA narrative once roads, SuDS and open space are deducted from the gross area. Defensible.
- **Top of range (60 units, ~38–40 dw/ha gross):** only reachable by treating the whole site as developable with no allowance for internal roads, attenuation SuDS, landscape buffers or open space. This **contradicts** the "softened settlement edge / nature recovery" case the SHELAA makes and would be hard to defend to a planning officer.

**Implication for the app:** ArchForm should make this trade-off visible — net developable area after roads/SuDS/buffers, and the resulting honest dwellings/ha — rather than reporting a flattering gross density.

## 6. What ArchForm is for (context — not coded here)

ArchForm is a flat-structure static web prototype (HTML/CSS/vanilla JS, Three.js for 3D) on GitHub Pages, built incrementally in Claude Code. It exists to **test and communicate** a landscape-led layout for Dashlands that holds up against the SHELAA narrative and the constraints above. This planning folder owns the briefs, roadmap and checklists; it does **not** write the app code.

Current capability (verified from screenshots, 18 June 2026): DXF boundary import, auto-georeferenced PDF underlay on the OSGB grid, 2D plan + 3D massing views, dwelling massing with a density/target-count slider, a live stats panel (dwellings/ha, area, footprint, GFA, FAR, buildings, max floors), a compliance panel, four movable infrastructure markers, building presets, and project save/export. A separate AI design-brief generator (`designer.html`) is in beta. See the roadmap for full status.

## 7. Open questions / to verify

- **Marker positions** vs the marked-up OS plan (carried in roadmap Phase 5).
- **⚠ Access point vs boundary gap — PRIORITY, verified 19 Jun 2026.** A live-preview diagnostic against the real DXF confirms the surveyed access coordinate (OSGB 558859.18 E / 106790.66 N, OSTN15) sits **entirely outside** the current title boundary: **92.5 m east and 60.3 m south** of its extent, **~120.3 m** from the nearest corner (the south tip of the frontage, V2 at 558755.10 / 106850.92). Three possible explanations, unresolved: (a) the title boundary genuinely stops short and reaches the lane via an access strip/easement; (b) the pin is an imprecise Google-Earth coordinate; (c) a provenance mismatch between pin and DXF. **Until this is resolved against the official title plan, the SHELAA claim of *direct frontage to Sayerland Lane* is unproven** — see §5-access below. The app projects the entrance onto the nearest boundary point as an interim only.
- **Access strategy — downgraded to *to verify*.** Primary southern access was assumed confirmed; the boundary-gap finding above means it is **not yet evidenced**. Old Loom Mill / Peel House alternatives remain under neighbour discussion and may matter more if the frontage claim fails. Next step: order the official title plan + register (HM Land Registry, ~£3) and compare its red-line extent to the DXF.
- **Net vs gross density** — agree the developable-area deductions the app should assume.
- **Affordable housing split** — not yet specified; policy requirement to confirm at application stage.

---
*Sources: SKILL.md (project brief), Shelaa Submission.pdf, dashlands_boundary_osgb_joined.dxf, ArchForm screenshots (18 June 2026).*
