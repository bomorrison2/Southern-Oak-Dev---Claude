# SHELAA-Alignment Checklist

*Living document. Last updated: 18 June 2026.*
*Purpose: keep ArchForm's outputs consistent with the claims made in the SHELAA submission. If the app shows something the submission contradicts — or fails to show something the submission promises — that gap is a planning risk. Each row maps a submission claim to what the app must demonstrate, with current status.*

**Status key:** ✓ App supports it · ◐ Partial · ☐ Not yet · ⚠ Tension to manage

---

## A. Density & layout — the landscape-led narrative

| # | SHELAA claims | App must show | Status |
|---|---|---|---|
| A1 | A *softened settlement edge*, not an abrupt transition | Buffered, lower-density edges with open space at the boundary | ☐ |
| A2 | 30–60 dwellings on ~1.51 ha | Honest dwellings/ha **net** of roads/SuDS/open space (≈19–25 dw/ha defensible) | ◐ density slider exists; net-density readout ☐ |
| A3 | Open space and nature recovery integral to the scheme | Drawable, measurable open-space and habitat areas | ☐ |
| A4 | Layout informed by a landscape-led approach | Layers ordered so landscape constrains plots, not vice versa | ◐ sequence understood; greenery layer ☐ |

> **⚠ A2 tension:** 60 units ≈ 38–40 dw/ha gross with no road/SuDS/open-space allowance. That contradicts the narrative in A1/A3. The app should make the **net** figure prominent so the scheme is presented defensibly. Carried from Project Brief §5.

## B. Drainage & water (Weald Clay + Pevensey Levels)

| # | SHELAA claims | App must show | Status |
|---|---|---|---|
| B1 | Sustainable drainage incorporated | Attenuation-based SuDS layer — tanked permeable paving, rain gardens, attenuation ponds (**not** soakaways, given Weald Clay) | ☐ |
| B2 | No adverse effect on Pevensey Levels SAC/SSSI/Ramsar; nutrient neutrality | Drainage discharge logic / nutrient-neutrality area that supports a no-adverse-effect case | ☐ |
| B3 | Water management contributes positively to ecological objectives | SuDS doubling as habitat/open space, shown on plan | ☐ |

> Drainage is the single biggest compliance gap (Roadmap Phase 4). Weald Clay rules out soakaways — the app must not depict or imply infiltration-based drainage.

## C. Heritage — Grade II Sayerlands House

| # | SHELAA claims | App must show | Status |
|---|---|---|---|
| C1 | Setting of Sayerlands House (to the east) respected | Landscape buffer / lower density along the **eastern** edge | ☐ |
| C2 | Existing boundaries retained | Retained boundary vegetation on the eastern frontage | ☐ |
| C3 | Sensitive layout near the asset | Massing/heights stepped down toward the listed building | ◐ heights adjustable; deliberate stepping ☐ |

## D. Landscape & ecology framework

| # | SHELAA claims | App must show | Status |
|---|---|---|---|
| D1 | Hedgerows and tree belts retained and strengthened | Retained/reinforced hedgerow + tree-belt layer | ☐ |
| D2 | Cuckoo Trail corridor (west) respected; pedestrian/cycle links | Western corridor represented; active-travel connection to the trail | ☐ |
| D3 | Measurable biodiversity net gain | Designated BNG/habitat areas with area accounting | ☐ |
| D4 | Site well contained by existing features | Containment legible on the georeferenced underlay | ◐ underlay loads; layer annotation ☐ |

## E. Access & movement

| # | SHELAA claims | App must show | Status |
|---|---|---|---|
| E1 | Direct frontage access to Sayerland Lane (via Ersham Road) | Entrance on the **southern** boundary at the confirmed access point | ⚠ **Unproven (verified 19 Jun 2026).** Surveyed access pin sits ~120 m *outside* the DXF boundary (92.5 m E, 60.3 m S). The "direct frontage" claim cannot be evidenced until the official title plan is checked — see Project Brief §7 and §G. |
| E2 | No fundamental access constraint | Workable access geometry, not just a point | ☐ — and now partly contingent on E1 resolving. |
| E3 | Pedestrian/cycle links to the Cuckoo Trail | Active-travel connection shown | ☐ |

## F. Infrastructure & utilities

| # | SHELAA claims | App must show | Status |
|---|---|---|---|
| F1 | Mains water along the road frontage | Water marker on the **eastern** road frontage | ◐ marker exists; position unverified |
| F2 | Public sewer nearby | Sewer marker on the **northern** edge near the old railway line | ◐ marker exists; position unverified |
| F3 | Electricity supply / local sub-station | Elec marker on the **south-west** lane | ◐ marker exists; position unverified |
| F4 | Site serviceable without major off-site works | Connections routable from the markers to the scheme | ☐ |

## G. Marker-position verification (blocking check)

The marked-up OS plan — **not** the app's defaults — is the source of truth. Before any ArchForm output is shown to officers or investors, confirm:

- [ ] **Entrance** on the southern boundary off Sayerland Lane (50°50'19.84"N 0°15'17.31"E)
- [ ] **Sewer** on the northern edge, near the old railway line
- [ ] **Water main** along the eastern road frontage (Sayerland Lane)
- [ ] **Electricity sub box** on the south-west lane
- [ ] **Pond** on the eastern edge (currently not represented in the app)

## H. Delivery & viability (narrative consistency)

| # | SHELAA claims | App should reinforce | Status |
|---|---|---|---|
| H1 | Modular construction, 15–25 dwellings/year | Unit types/massing consistent with modular delivery | ◐ presets generic |
| H2 | Deliverable in ~2–3 years, early in plan period | A coherent, buildable single-phase layout | ◐ |
| H3 | No abnormal costs; standard greenfield | Layout avoids implying abnormal works (e.g. soakaways, heavy earthworks) | ◐ |

---

## Priority order to close gaps

1. **Verify markers** (§G) — fast, removes a credibility risk.
2. **Net density** (A2) — keeps every other claim honest.
3. **SuDS / open space layer** (B1–B3, A3) — the biggest compliance gap.
4. **Landscape + heritage layers** (C, D) — prove the narrative visually.
5. **Access geometry + active travel** (E).

## Suggested next instruction for Claude Code

> *"Add an attenuation SuDS layer to editor.html — let me draw rain gardens, permeable-paving zones and attenuation ponds as polygons, show their combined area, and exclude that area from the net developable figure. No soakaway option (Weald Clay)."*

---
*Sources: Shelaa Submission.pdf, SKILL.md, ArchForm screenshots (18 June 2026).*
