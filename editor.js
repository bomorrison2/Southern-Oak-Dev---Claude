/* =============================================================
   ArchForm — editor.js
   Interactive 2D/3D site editor logic.
   Depends on: shared.js, Three.js (CDN)
   ============================================================= */

'use strict';

/* ── CONSTANTS ────────────────────────────────────────────── */
const SCALE = 5; // pixels per metre at zoom = 1
const COLS  = ['#1a6cff', '#00d4ff', '#00e87a', '#ff8c00', '#a855f7', '#f43f5e'];

/* ── STATE ────────────────────────────────────────────────── */
let zoom = 1, panX = 0, panY = 0;
let tool = 'site';
let view = '2d';
let renderStyle = 'rendered'; // 3D presentation style: 'pencil' | 'hybrid' | 'rendered'
let sitePts    = [];
let siteClosed = false;
let buildings  = [];
let selected   = null;
let dragging   = false;
let dragOff    = null;
let isPan      = false;
let panSt      = null;
let mw         = { x: 0, y: 0 }; // mouse world coords
let nid        = 1;               // next building id
let defW = 20, defD = 14, defF = 6;
let defCol = COLS[0];
let dwellingCount = 45;
let placedDwellings = 0; // actual dwellings placed inside the boundary (3D massing)
let deductPct = 25;      // SuDS / open-space % of gross (roads measured separately from geometry)

/* ── GENERATIVE LAYOUT ────────────────────────────────────── */
// `dwellings` are the homes produced by generateScheme() — plots that front the
// road, respect the buffers, and carry a house type. Distinct from the free-form
// `buildings` array (manual massing blocks), which is left untouched.
// Each dwelling: { id, cx, cy, w, d, rot, type, beds, storeys, color }
//   cx,cy  = plot/footprint centre in site world coords (same space as sitePts)
//   w      = frontage width (along the road tangent), d = depth (toward the road)
//   rot    = footprint rotation, radians, measured like atan2(dy,dx) of the tangent
let dwellings = [];

// Modular-appropriate house types for a 30–60 unit Hailsham scheme. Sizes are
// indicative footprints (metres) for massing/estimation — NOT a fixed schedule.
// beds/mix are the app's generation DEFAULTS, adjustable; not a policy commitment.
const HOUSE_TYPES = {
  bungalow2: { label: '2-bed bungalow', beds: 2, w: 11, d: 8,  storeys: 1, color: '#5aa9e6' },
  terrace2:  { label: '2-bed terrace',  beds: 2, w: 6,  d: 9,  storeys: 2, color: '#00d4ff' },
  semi3:     { label: '3-bed semi',     beds: 3, w: 8,  d: 9,  storeys: 2, color: '#00e87a' },
  detached4: { label: '4-bed detached', beds: 4, w: 10, d: 10, storeys: 2, color: '#ff8c00' },
};
// Weighted mix — majority 1–3 bed with a small larger-family share, per Ray's
// 08/07/2026 working position (no 5–6 bed; bungalows/accessible included).
const HOUSE_MIX = [
  ['terrace2',  0.32],
  ['semi3',     0.36],
  ['bungalow2', 0.17],
  ['detached4', 0.15],
];
// Hailsham Design Guidelines (Mar 2026) local vernacular palette — red brick,
// pastel render, weatherboarding, hung clay tiles; red-clay or dark-slate roofs.
// (HNDP_DGC.pdf Table 1 / vernacular section.) Colours are representative for
// massing, not a materials specification.
const WALL_MATERIALS = {
  brick:        { label: 'Red brick',    color: 0xa8503c },
  render:       { label: 'Pastel render',color: 0xe7e2d0 },
  weatherboard: { label: 'Weatherboard', color: 0xcfc9b6 },
  tilehung:     { label: 'Hung tiles',   color: 0x9c5646 },
};
const ROOF_MATERIALS = {
  clay:  { label: 'Red clay',   color: 0xb5583a },
  slate: { label: 'Dark slate', color: 0x565d66 },
};
// Which wall/roof materials suit each house type (first is the default lead).
const TYPE_MATERIALS = {
  bungalow2: { walls: ['render', 'weatherboard'], roofs: ['slate', 'clay'] },
  terrace2:  { walls: ['brick', 'tilehung'],      roofs: ['clay', 'slate'] },
  semi3:     { walls: ['brick', 'render'],        roofs: ['clay', 'slate'] },
  detached4: { walls: ['weatherboard', 'render'], roofs: ['slate', 'clay'] },
};
/* ── ATTENUATION SuDS ─────────────────────────────────────── */
// Drawable sustainable-drainage areas. Weald Clay rules out soakaways, so every
// type here is ATTENUATION-based (stores water, releases at a controlled rate).
// Each: { id, type, pts: [{x,y}, ...] } as a closed polygon in site world coords.
let suds        = [];
let drawingSuds = false;
let sudsDraft   = [];       // in-progress polygon vertices
let sudsType    = 'pond';   // current type being drawn
let sudsId      = 1;
const SUDS_TYPES = {
  pond:       { label: 'Attenuation pond',  color: '#2196f3' },
  raingarden: { label: 'Rain garden',       color: '#26a69a' },
  permeable:  { label: 'Permeable paving',  color: '#7e9bb0' },
};

// Generation parameters (adjustable in the sidebar).
let genParams = {
  frontSetback: 6,   // m from carriageway edge to the house front (front garden)
  sideGap:      2.5, // m between adjacent detached/semi units
  bufferE:      15,  // m no-build heritage buffer on the EAST (Sayerlands House)
  bufferW:      12,  // m no-build landscape buffer on the WEST (Cuckoo Trail)
  boundaryInset: 6,  // m general no-build inset from the boundary line
  targetCount:  24,  // desired dwelling count — default targets the defensible ~19–25 dw/ha band
  solar:        true,// roof-integrated PV on the south-facing slopes
  autoRoad:     true,// auto-lay an estate road spine when none is drawn
};

/* ── SITE ACCESS POINT ────────────────────────────────────── */
// accessPt: {x,y} in centroid-relative world coords (same space as sitePts), or null.
// First step toward a road layout — entrance marker only, no road generation yet.
let accessPt        = null;
let movingEntrance  = false; // true while waiting for a click to reposition the entrance
const ENTRANCE_COL  = '#ff8c00'; // amber — reads clearly against the blue boundary
// Confirmed Sayerland Lane access, absolute OSGB36 (WGS84 50°50'19.84"N
// 0°15'17.31"E → BGS OSTN15). Projected onto the boundary at runtime once a DXF
// gives us the OSGB frame (dxfOrigin); without that frame we use the south tip.
const ACCESS_OSGB   = { e: 558859.18, n: 106790.66 };
// Visibility splay / access stub run into the site from the entrance (metres).
let accessSplay     = { length: 20, halfWidth: 8 };

/* ── INTERNAL ESTATE ROAD ─────────────────────────────────── */
// Centreline polyline drawn from the access stub into the site. `pts` holds the
// user-placed vertices AFTER the stub start (the stub end is always prepended,
// so the road stays snapped to the access). width = carriageway width (metres).
let road        = { pts: [], width: 5 };
let drawingRoad = false; // true while laying out the polyline (click to add, dbl-click/Esc to finish)
const ROAD_COL  = '#6b6b6b'; // carriageway grey

/* ── TEMP: ACCESS DIAGNOSTIC (one-off, read-only — safe to delete this block,
   the render-overlay hook, and the two runAccessDiagnostic() calls) ───────── */
const DIAG_ACCESS = false;  // flip to true to re-enable the one-off console diagnostic
let diagPin     = null;     // surveyed ACCESS_OSGB in editor coords (overlay marker)
let diagNearest = null;     // nearest boundary point to the pin (connector line)

/* ── SITE UTILITY MARKERS ─────────────────────────────────── */
// Surveyed service positions in centroid-relative world coords (same space as
// sitePts), or null. Reuses the entrance marker's snapping + persistence.
let utilities     = { sewer: null, water: null, elec: null };
let movingUtility = null; // null | 'sewer' | 'water' | 'elec'
const UTIL_COLS   = { sewer: '#8a5a2b', water: '#2196f3', elec: '#ffd400' };
const UTIL_LABELS = { sewer: 'SEWER',   water: 'WATER',   elec: 'ELEC' };

/* ── PDF UNDERLAY STATE ───────────────────────────────────── */
// null when no plan is loaded.
// When loaded: { img, wx, wy, ww, wh, opacity }
//   wx,wy = world coords of top-left corner (world Y increases upward)
//   ww,wh = width/height in world metres
let pdfState    = null;
let calibPts    = [];    // accumulates up to 2 {wx,wy} world points
let calibrating = false;
// OSGB centroid {e,n} subtracted from the DXF boundary at import. Kept so a
// georeferenced PDF underlay can be aligned to the boundary's OSGB frame.
let dxfOrigin   = null;

// The real Dashlands site, embedded so it always loads by default (the plot to
// design around). Exact 8 vertices from dashlands_boundary_osgb_joined.dxf,
// centroid-relative; origin is the OSGB centroid used as dxfOrigin so the
// entrance, utilities and any georeferenced underlay align to the OSGB frame.
const DASHLANDS_SITE = {
  origin: { e: 558686.61, n: 106982.453 },
  pts: [
    { x: -78.20, y:  83.38 }, { x: -99.22, y: -22.18 }, { x:  68.49, y: -131.53 },
    { x:  80.02, y: -75.98 }, { x: -37.53, y:   6.66 }, { x:  -6.49, y:   52.95 },
    { x:  32.06, y:  34.59 }, { x:  40.87, y:   52.12 }
  ]
};

/* ── CANVAS SETUP ─────────────────────────────────────────── */
const canvas = document.getElementById('c2d');
const ctx    = canvas.getContext('2d');

function resize() {
  const wrap = document.getElementById('cwrap');
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  if (panX === 0 && panY === 0) {
    panX = canvas.width  / 2;
    panY = canvas.height / 2;
  }
  render();
}
window.addEventListener('resize', resize);

/* ── COORDINATE TRANSFORMS ────────────────────────────────── */
function w2s(x, y) {
  return { x: x * SCALE * zoom + panX, y: -y * SCALE * zoom + panY };
}
function s2w(x, y) {
  return { x: (x - panX) / (SCALE * zoom), y: -(y - panY) / (SCALE * zoom) };
}

/* ── TOOLS ────────────────────────────────────────────────── */
function setTool(t) {
  tool = t;
  document.getElementById('toolSite').classList.toggle('active',     t === 'site');
  document.getElementById('toolBuild').classList.toggle('active',    t === 'building');
  document.getElementById('toolSelect').classList.toggle('active',   t === 'select');
  document.getElementById('lySite').classList.toggle('active',       t === 'site');
  document.getElementById('lyBuild').classList.toggle('active',      t === 'building');
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';

  // Calibration mode bookkeeping
  if (t === 'calibrate') {
    calibPts = [];
  } else if (calibrating) {
    calibrating = false;
    calibPts    = [];
  }

  const hints = {
    site:      siteClosed ? 'Site closed — switch to Building tool' : 'Click to draw site boundary — Double-click to close',
    building:  'Click to place a building',
    select:    'Click to select — Drag to move',
    calibrate: 'Click point 1 on the plan — then click point 2'
  };
  document.getElementById('hintBar').textContent = hints[t] || '';
}

/* ── DEFAULT BUILDING SLIDERS ─────────────────────────────── */
function ud() {
  defW = +document.getElementById('dW').value;
  defD = +document.getElementById('dD').value;
  defF = +document.getElementById('dF').value;
  document.getElementById('dWL').textContent = defW;
  document.getElementById('dDL').textContent = defD;
  document.getElementById('dFL').textContent = defF;
}

/* ── PRESETS ──────────────────────────────────────────────── */
function applyPreset(w, d, f) {
  document.getElementById('dW').value = w;
  document.getElementById('dD').value = d;
  document.getElementById('dF').value = f;
  defW = w; defD = d; defF = f;
  document.getElementById('dWL').textContent = w;
  document.getElementById('dDL').textContent = d;
  document.getElementById('dFL').textContent = f;
  setTool('building');
  showToast('Preset loaded — click to place');
}

/* ── GEOMETRY ─────────────────────────────────────────────── */
function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(a / 2);
}

/* ── SITE ACCESS POINT HELPERS ────────────────────────────── */

// Default the entrance to the confirmed Sayerland Lane access.
// With an OSGB frame (DXF imported → dxfOrigin set) we convert the surveyed
// ACCESS_OSGB pin into editor coords and project it onto the nearest boundary
// point — so it always lands on the line even though the pin itself lies just
// off this title boundary. Without a frame (demo / hand-drawn site) we fall
// back to the southernmost vertex.
function setDefaultAccessPoint() {
  if (!siteClosed || sitePts.length < 3) { accessPt = null; return; }
  if (dxfOrigin) {
    accessPt = nearestPointOnBoundary(ACCESS_OSGB.e - dxfOrigin.e, ACCESS_OSGB.n - dxfOrigin.n);
  } else {
    const south = sitePts.reduce((m, p) => (p.y < m.y ? p : m), sitePts[0]);
    accessPt = { x: south.x, y: south.y };
  }
}

// Project (wx,wy) onto the nearest point of the closed boundary's edges so the
// entrance always sits ON the boundary line, never floating inside or outside.
function nearestPointOnBoundary(wx, wy) {
  if (sitePts.length < 2) return { x: wx, y: wy };
  let best = null, bestD = Infinity;
  for (let i = 0; i < sitePts.length; i++) {
    const a = sitePts[i], b = sitePts[(i + 1) % sitePts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((wx - a.x) * dx + (wy - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));            // clamp to the segment
    const px = a.x + t * dx, py = a.y + t * dy;
    const d  = (wx - px) ** 2 + (wy - py) ** 2;
    if (d < bestD) { bestD = d; best = { x: px, y: py }; }
  }
  return best;
}

// Enter "move entrance" mode. Placement happens in 2D, so drop to 2D view first.
function toggleMoveEntrance() {
  if (!siteClosed || sitePts.length < 3) return;
  if (view === '3d') setView('2d');
  movingEntrance = true;
  canvas.style.cursor = 'crosshair';
  document.getElementById('hintBar').textContent = 'Click on the boundary to place the entrance';
  refreshEntranceUI();
}

// Show the Move-entrance control only when a boundary exists; reflect active state.
function refreshEntranceUI() {
  const ctrls = document.getElementById('entranceControls');
  const btn   = document.getElementById('entranceMoveBtn');
  if (!ctrls || !btn) return;
  const hasBoundary = siteClosed && sitePts.length >= 3;
  ctrls.style.display = hasBoundary ? 'flex' : 'none';
  btn.classList.toggle('active', movingEntrance);
}

// For a point lying on the boundary, find the edge it sits on and return the
// UNIT INWARD normal (nx,ny) plus the unit tangent (dhx,dhy) of that edge.
// Inward is resolved against the polygon centroid, so winding order is irrelevant.
function boundaryEdgeAt(pt) {
  if (sitePts.length < 2) return null;
  let best = null, bestD = Infinity;
  for (let i = 0; i < sitePts.length; i++) {
    const a = sitePts[i], b = sitePts[(i + 1) % sitePts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = (pt.x - px) ** 2 + (pt.y - py) ** 2;
    if (d < bestD) { bestD = d; best = { dx, dy, len2 }; }
  }
  if (!best || best.len2 === 0) return null;            // degenerate edge — skip
  const len = Math.sqrt(best.len2);
  let nx = -best.dy / len, ny = best.dx / len;
  const cx = sitePts.reduce((s, p) => s + p.x, 0) / sitePts.length;
  const cy = sitePts.reduce((s, p) => s + p.y, 0) / sitePts.length;
  if (nx * (cx - pt.x) + ny * (cy - pt.y) < 0) { nx = -nx; ny = -ny; } // face inward
  return { nx, ny, dhx: best.dx / len, dhy: best.dy / len };
}

// 2D access stub / visibility splay: a translucent amber triangle opening from
// the entrance mouth on the boundary and tapering inward, plus a centre line.
function drawAccessStub() {
  if (!accessPt || !siteClosed) return;
  const e = boundaryEdgeAt(accessPt);
  if (!e) return;
  const L = accessSplay.length, HW = accessSplay.halfWidth;
  const mL  = w2s(accessPt.x - e.dhx * HW, accessPt.y - e.dhy * HW);
  const mR  = w2s(accessPt.x + e.dhx * HW, accessPt.y + e.dhy * HW);
  const end = w2s(accessPt.x + e.nx * L,   accessPt.y + e.ny * L);
  const mid = w2s(accessPt.x, accessPt.y);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(mL.x, mL.y);
  ctx.lineTo(mR.x, mR.y);
  ctx.lineTo(end.x, end.y);
  ctx.closePath();
  ctx.fillStyle   = 'rgba(255,140,0,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,140,0,0.55)';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mid.x, mid.y);
  ctx.lineTo(end.x, end.y);
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Access stub sliders — live-update the splay in 2D and 3D.
function onAccessSplayLength(v) {
  accessSplay.length = +v;
  document.getElementById('splayLenLabel').textContent = v + 'm';
  render();
  if (view === '3d') build3d();
}
function onAccessSplayWidth(v) {
  accessSplay.halfWidth = +v / 2; // slider is the full mouth width
  document.getElementById('splayWidLabel').textContent = v + 'm';
  render();
  if (view === '3d') build3d();
}

/* ── INTERNAL ESTATE ROAD HELPERS ─────────────────────────── */

// Ray-cast point-in-polygon test against the closed boundary.
function pointInBoundary(x, y) {
  let inside = false;
  for (let i = 0, j = sitePts.length - 1; i < sitePts.length; j = i++) {
    const xi = sitePts[i].x, yi = sitePts[i].y, xj = sitePts[j].x, yj = sitePts[j].y;
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Start of the road = the inward end of the access stub (keeps the road snapped
// to the access even if the entrance moves). null when there is no entrance.
function roadStubPoint() {
  if (!accessPt || !siteClosed) return null;
  const e = boundaryEdgeAt(accessPt);
  if (!e) return null;
  return { x: accessPt.x + e.nx * accessSplay.length, y: accessPt.y + e.ny * accessSplay.length };
}

// Full centreline = [stub, ...user points]. Empty until the stub + ≥1 point exist.
function roadCenterline() {
  const stub = roadStubPoint();
  if (!stub || road.pts.length === 0) return [];
  return [stub, ...road.pts];
}

function roadLengthM() {
  const c = roadCenterline();
  let L = 0;
  for (let i = 1; i < c.length; i++) L += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y);
  return L;
}

// Carriageway area ≈ centreline length × width (corner overlaps ignored — a
// planning estimate). Feeds the net developable area in updateStats().
function roadAreaM2() { return roadLengthM() * road.width; }

// Enter road-draw mode. Drawing happens in 2D, so drop to 2D first.
function toggleDrawRoad() {
  if (!siteClosed || sitePts.length < 3 || !accessPt) return;
  if (view === '3d') setView('2d');
  movingEntrance = false; movingUtility = null; // road draw is mutually exclusive with marker moves
  drawingRoad = true;
  canvas.style.cursor = 'crosshair';
  document.getElementById('hintBar').textContent = 'Click to extend the road from the access stub — double-click or Esc to finish';
  refreshRoadUI();
}

function finishRoad() {
  drawingRoad = false;
  // drop a stray duplicate final point left by a double-click
  const n = road.pts.length;
  if (n >= 2) {
    const a = road.pts[n - 1], b = road.pts[n - 2];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.5) road.pts.pop();
  }
  canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  document.getElementById('hintBar').textContent = road.pts.length ? 'Road drawn' : 'Road cleared';
  updateStats(); refreshRoadUI(); render();
  if (view === '3d') build3d();
  if (dwellings.length) generateScheme(); // homes re-front the updated road
}

function clearRoad() {
  road = { pts: [], width: road.width };
  drawingRoad = false;
  updateStats(); refreshRoadUI(); render();
  if (view === '3d') build3d();
  if (dwellings.length) generateScheme(); // fall back to the buffer-aware grid
}

function onRoadWidth(v) {
  road.width = +v;
  document.getElementById('roadWidthLabel').textContent = v + 'm';
  updateStats(); render();
  if (view === '3d') build3d();
}

// Show road controls only when a boundary + entrance exist; reflect draw state.
function refreshRoadUI() {
  const ctrls = document.getElementById('roadControls');
  if (!ctrls) return;
  const ready = siteClosed && sitePts.length >= 3 && !!accessPt;
  ctrls.style.display = ready ? 'flex' : 'none';
  const hint = document.getElementById('roadHint');
  if (hint) hint.style.display = ready ? 'none' : 'block';
  const btn = document.getElementById('roadDrawBtn');
  if (btn) {
    btn.classList.toggle('active', drawingRoad);
    btn.textContent = drawingRoad ? '■ Finish road' : '✐ Draw road';
  }
}

// 2D carriageway: grey stroke along the centreline + dashed centre line, plus
// a live preview segment and vertex handles while drawing.
function drawRoad2d() {
  const c = roadCenterline();
  const stub = roadStubPoint();
  if (!stub) return;
  const path = drawingRoad ? [stub, ...road.pts, { x: mw.x, y: mw.y }] : c;
  if (path.length < 2) {
    if (!drawingRoad) return;
  }
  ctx.save();
  if (path.length >= 2) {
    ctx.beginPath();
    const s0 = w2s(path[0].x, path[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < path.length; i++) { const s = w2s(path[i].x, path[i].y); ctx.lineTo(s.x, s.y); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = ROAD_COL;
    ctx.lineWidth = Math.max(2, road.width * SCALE * zoom);
    ctx.stroke();
    // dashed centre line
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // vertex handles while editing
  if (drawingRoad) {
    [stub, ...road.pts].forEach((p, i) => {
      const s = w2s(p.x, p.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, i === 0 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#ffae4d' : '#cfcfcf';
      ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    });
  }
  ctx.restore();
}

// Build a flat ribbon along a centreline between two lateral offsets (o0..o1
// metres from centre), at height h. Returns a flat position array (scene coords).
function ribbonPos(c, o0, o1, h, cx, cz) {
  const pos = [];
  const P = (px, py) => [px - cx, h, -(py - cz)];
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const ux = -dy / len, uy = dx / len;
    const aO = P(a.x + ux * o1, a.y + uy * o1), aI = P(a.x + ux * o0, a.y + uy * o0);
    const bO = P(b.x + ux * o1, b.y + uy * o1), bI = P(b.x + ux * o0, b.y + uy * o0);
    pos.push(...aO, ...aI, ...bI, ...aO, ...bI, ...bO);
  }
  return pos;
}
function ribbonMesh(pos, mat, recv) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  if (recv) m.receiveShadow = true;
  return m;
}

// 3D estate street: kerbs + footways + carriageway (+ dashed centre line).
function addRoad3d(scene, cx, cz) {
  const c = roadCenterline();
  if (c.length < 2) return;
  const hw = road.width / 2;
  const detailed = renderStyle !== 'pencil';
  if (detailed) {
    // kerb strips + footways flank the carriageway
    const kerb = styleSurface(0xbfc1bb, { rough: 0.85, side: THREE.DoubleSide });
    const foot = styleSurface(0x9a9c96, { rough: 0.95, side: THREE.DoubleSide, pencil: 0xe8e6de });
    scene.add(ribbonMesh(ribbonPos(c,  hw,        hw + 0.15,  0.20, cx, cz), kerb));
    scene.add(ribbonMesh(ribbonPos(c, -hw,       -hw - 0.15,  0.20, cx, cz), kerb));
    scene.add(ribbonMesh(ribbonPos(c,  hw + 0.15, hw + 2.0,   0.17, cx, cz), foot, true));
    scene.add(ribbonMesh(ribbonPos(c, -hw - 0.15,-hw - 2.0,   0.17, cx, cz), foot, true));
  }
  // carriageway
  const tar = styleSurface(0x36393e, { rough: 0.85, side: THREE.DoubleSide, pencil: 0xd6d3ca });
  scene.add(ribbonMesh(ribbonPos(c, -hw, hw, 0.12, cx, cz), tar, true));
  // dashed white centre line (rendered/hybrid)
  if (detailed) {
    const line = new THREE.MeshBasicMaterial({ color: 0xdedede });
    for (let i = 1; i < c.length; i++) {
      const a = c[i - 1], b = c[i];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const steps = Math.floor(len / 4);
      for (let s = 0; s < steps; s += 2) {
        const t0 = s / steps, t1 = Math.min(1, (s + 1) / steps);
        const seg = [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
        scene.add(ribbonMesh(ribbonPos(seg, -0.12, 0.12, 0.135, cx, cz), line));
      }
    }
  }
}

// Short driveway from each home's frontage to the carriageway edge.
function addDriveways3d(scene, cx, cz) {
  if (!dwellings.length || roadCenterline().length < 2) return;
  const mat = styleSurface(0x8f9088, { rough: 0.95, side: THREE.DoubleSide, pencil: 0xe8e6de });
  const hw = road.width / 2;
  dwellings.forEach(dw => {
    const fx = dw.frontX || 0, fy = dw.frontY || -1;
    const front = { x: dw.cx + fx * (dw.d / 2), y: dw.cy + fy * (dw.d / 2) };
    const tgt = nearestRoadPoint(front.x, front.y);
    let dx = tgt.x - front.x, dy = tgt.y - front.y;
    const dist = Math.hypot(dx, dy); if (dist < 1) return;
    dx /= dist; dy /= dist;
    const end = { x: front.x + dx * Math.max(0, dist - hw), y: front.y + dy * Math.max(0, dist - hw) };
    const ux = -dy, uy = dx, w = 1.3;
    const P = (px, py) => [px - cx, 0.15, -(py - cz)];
    const pos = [
      ...P(front.x + ux * w, front.y + uy * w), ...P(front.x - ux * w, front.y - uy * w), ...P(end.x - ux * w, end.y - uy * w),
      ...P(front.x + ux * w, front.y + uy * w), ...P(end.x - ux * w, end.y - uy * w), ...P(end.x + ux * w, end.y + uy * w),
    ];
    scene.add(ribbonMesh(pos, mat, true));
  });
}

/* ── TEMP: ACCESS DIAGNOSTIC (one-off, read-only) ─────────────
   Measures the imported DXF boundary against the surveyed Sayerland Lane
   access pin and (if present) the georeferenced OS underlay. Console only.
   Call runAccessDiagnostic() from the console, or it auto-runs on DXF/PDF
   import while DIAG_ACCESS is true. Draws the raw pin so the gap is visible.
   Does NOT modify the boundary. Delete this block to remove. */

// OSGB bearing in degrees from grid north, clockwise (dE = easting delta, dN = northing delta).
function diagBearing(dE, dN) { return (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360; }

// Fit the 2D view to the boundary AND the access pin so the gap is on screen.
function fitViewToAccessDiag() {
  if (!diagPin) return;
  const xs = sitePts.map(p => p.x).concat(diagPin.x);
  const ys = sitePts.map(p => p.y).concat(diagPin.y);
  const bbW = Math.max(...xs) - Math.min(...xs), bbH = Math.max(...ys) - Math.min(...ys);
  const zX = (canvas.width * 0.78) / ((bbW || 1) * SCALE);
  const zY = (canvas.height * 0.78) / ((bbH || 1) * SCALE);
  zoom = Math.max(0.05, Math.min(8, Math.min(zX, zY)));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  panX = canvas.width  / 2 - cx * SCALE * zoom;
  panY = canvas.height / 2 + cy * SCALE * zoom;
}

function runAccessDiagnostic() {
  if (!siteClosed || sitePts.length < 3 || !dxfOrigin) {
    console.warn('[access-diag] Import the Dashlands DXF (with OSGB frame) first.');
    return null;
  }
  const O = dxfOrigin, n = sitePts.length;
  const toOSGB = p => ({ e: +(p.x + O.e).toFixed(3), n: +(p.y + O.n).toFixed(3) });
  const pinEd  = { x: ACCESS_OSGB.e - O.e, y: ACCESS_OSGB.n - O.n };

  // Project a point onto an edge, returning foot, clamp t, and distance.
  const proj = (a, b, P) => {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? ((P.x - a.x) * dx + (P.y - a.y) * dy) / len2 : 0;
    const tc = Math.max(0, Math.min(1, t));
    const fx = a.x + tc * dx, fy = a.y + tc * dy;
    return { t, foot: { x: fx, y: fy }, dist: Math.hypot(P.x - fx, P.y - fy), len: Math.sqrt(len2), dx, dy };
  };

  console.group('%c[access-diag] Dashlands boundary vs surveyed Sayerland Lane access', 'font-weight:bold');
  console.log('DXF centroid (dxfOrigin), OSGB:', O, '| access pin OSGB:', ACCESS_OSGB);

  // (1) Vertices + edges in OSGB
  console.log('Boundary vertices (OSGB):');
  console.table(sitePts.map((p, i) => ({ vertex: 'V' + i, ...toOSGB(p) })));

  const edges = sitePts.map((a, i) => {
    const b = sitePts[(i + 1) % n], pr = proj(a, b, pinEd);
    const mid = toOSGB({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return {
      edge: `V${i}→V${(i + 1) % n}`,
      length_m: +pr.len.toFixed(1),
      bearing_deg: +diagBearing(pr.dx, pr.dy).toFixed(1),
      midE: mid.e, midN: mid.n,
      distToPin_m: +pr.dist.toFixed(1),
      _i: i
    };
  });
  console.log('Edges (length, bearing °from grid-N, edge midpoint OSGB, distance to access pin):');
  console.table(edges.map(({ _i, ...e }) => e));

  const southEdge = edges.reduce((m, e) => e.midN < m.midN ? e : m, edges[0]);
  const eastEdge  = edges.reduce((m, e) => e.midE > m.midE ? e : m, edges[0]);
  console.log(`Southern frontage (lowest mid-northing): ${southEdge.edge}  |  Eastern frontage (highest mid-easting): ${eastEdge.edge}`);
  console.log(`→ Frontage nearest Sayerland Lane (closest edge to the access pin): ${edges.reduce((m, e) => e.distToPin_m < m.distToPin_m ? e : m, edges[0]).edge}`);

  // (2) Nearest edge (perpendicular distance + bearing) and nearest vertex
  let near = null;
  edges.forEach(e => { const pr = proj(sitePts[e._i], sitePts[(e._i + 1) % n], pinEd); if (!near || pr.dist < near.dist) near = { ...pr, edge: e.edge }; });
  diagNearest = { x: near.foot.x, y: near.foot.y };
  const onSeg = near.t > 0 && near.t < 1;
  const bPinFoot = diagBearing(near.foot.x - pinEd.x, near.foot.y - pinEd.y);
  console.log(`Nearest boundary edge: ${near.edge} — ${near.dist.toFixed(1)} m from pin ` +
              `(${onSeg ? 'true perpendicular foot' : 'clamped to a vertex'}); foot OSGB ${toOSGB(near.foot).e}, ${toOSGB(near.foot).n}; bearing pin→boundary ${bPinFoot.toFixed(1)}°.`);

  let nv = null;
  sitePts.forEach((p, i) => { const d = Math.hypot(p.x - pinEd.x, p.y - pinEd.y); if (!nv || d < nv.d) nv = { i, d, p }; });
  console.log(`Nearest boundary vertex: V${nv.i} OSGB ${toOSGB(nv.p).e}, ${toOSGB(nv.p).n} — ${nv.d.toFixed(1)} m from pin, bearing pin→vertex ${diagBearing(nv.p.x - pinEd.x, nv.p.y - pinEd.y).toFixed(1)}°.`);

  const es = sitePts.map(p => p.x + O.e), ns = sitePts.map(p => p.y + O.n);
  const eMax = Math.max(...es), nMin = Math.min(...ns);
  console.log(`Pin vs boundary extent: ${(ACCESS_OSGB.e - eMax).toFixed(1)} m east of the eastern edge, ${(nMin - ACCESS_OSGB.n).toFixed(1)} m south of the southern edge.`);

  // (3) Underlay / lane coincidence
  if (pdfState && pdfState.georef) {
    const u = pdfState, inU = P => P.x >= u.wx && P.x <= u.wx + u.ww && P.y <= u.wy && P.y >= u.wy - u.wh;
    console.log('OS underlay (georeferenced) extent wx,wy(top),ww,wh:', { wx: +u.wx.toFixed(1), wy: +u.wy.toFixed(1), ww: +u.ww.toFixed(1), wh: +u.wh.toFixed(1) });
    console.log(`  pin inside underlay: ${inU(pinEd)} | nearest boundary point inside underlay: ${inU(near.foot)}`);
    console.log('%c  The lane carriageway is raster-only in the underlay — coincidence is a VISUAL check (see screenshot). Measured: the boundary stops ' + near.dist.toFixed(0) + ' m short of the surveyed lane access.', 'color:#c80');
  } else if (pdfState) {
    console.log('OS underlay loaded but NOT georeferenced — calibrate/auto-georeference it, then re-run runAccessDiagnostic().');
  } else {
    console.log('No PDF underlay in this session. Lane is only visible via the georeferenced OS plan — load it and re-run. Proxy: the boundary stops ' + near.dist.toFixed(1) + ' m short of the surveyed access pin (which lies on the lane).');
  }
  console.groupEnd();

  // Overlay the raw pin and fit the view so the gap is visible.
  diagPin = pinEd;
  if (view === '2d') { fitViewToAccessDiag(); render(); }

  return {
    centroidOSGB: O, pinOSGB: ACCESS_OSGB,
    nearestEdge: { edge: near.edge, dist_m: +near.dist.toFixed(1), perpendicular: onSeg, bearing_pin_to_boundary: +bPinFoot.toFixed(1) },
    nearestVertex: { v: nv.i, osgb: toOSGB(nv.p), dist_m: +nv.d.toFixed(1) },
    southEdge: southEdge.edge, eastEdge: eastEdge.edge,
    pinEastOfBoundary_m: +(ACCESS_OSGB.e - eMax).toFixed(1),
    pinSouthOfBoundary_m: +(nMin - ACCESS_OSGB.n).toFixed(1)
  };
}

/* ── SITE UTILITY HELPERS ─────────────────────────────────── */

// Derive the three surveyed default positions from the current boundary.
// SEWER → midpoint of the northernmost edge; WATER → boundary near the
// entrance (road frontage); ELEC → just outside the south-west corner.
function setDefaultUtilities() {
  if (!siteClosed || sitePts.length < 3) {
    utilities = { sewer: null, water: null, elec: null };
    return;
  }

  // SEWER — midpoint of the edge whose midpoint sits furthest north
  let sewer = null, bestY = -Infinity;
  for (let i = 0; i < sitePts.length; i++) {
    const a = sitePts[i], b = sitePts[(i + 1) % sitePts.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (mid.y > bestY) { bestY = mid.y; sewer = mid; }
  }

  // WATER — mains water along the EASTERN road frontage (Sayerland Lane): midpoint
  // of the easternmost edge. Indicative default — verify against the OS plan.
  let water = sewer, bestX = -Infinity;
  for (let i = 0; i < sitePts.length; i++) {
    const a = sitePts[i], b = sitePts[(i + 1) % sitePts.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (mid.x > bestX) { bestX = mid.x; water = mid; }
  }

  // ELEC — south-west vertex (lowest x+y), pushed outward from the centroid
  const cx = sitePts.reduce((s, p) => s + p.x, 0) / sitePts.length;
  const cy = sitePts.reduce((s, p) => s + p.y, 0) / sitePts.length;
  let sw = sitePts[0];
  sitePts.forEach(p => { if ((p.x + p.y) < (sw.x + sw.y)) sw = p; });
  const dx = sw.x - cx, dy = sw.y - cy, len = Math.hypot(dx, dy) || 1;
  const elec = { x: sw.x + (dx / len) * 8, y: sw.y + (dy / len) * 8 };

  utilities = { sewer, water, elec };
}

// Enter "move utility" mode for a chosen marker. Placement happens in 2D.
function toggleMoveUtility(which) {
  if (!siteClosed || sitePts.length < 3) return;
  if (view === '3d') setView('2d');
  movingEntrance = false; // utility move and entrance move are mutually exclusive
  movingUtility  = which;
  canvas.style.cursor = 'crosshair';
  const snaps = which !== 'elec';
  document.getElementById('hintBar').textContent =
    `Click to place ${UTIL_LABELS[which]}` + (snaps ? ' — snaps to boundary' : ' — off-site, free placement');
  refreshUtilityUI();
}

// Show the utility controls only when a boundary exists; reflect active button.
function refreshUtilityUI() {
  const ctrls = document.getElementById('utilityControls');
  if (!ctrls) return;
  ctrls.style.display = (siteClosed && sitePts.length >= 3) ? 'flex' : 'none';
  ['sewer', 'water', 'elec'].forEach(k => {
    const b = document.getElementById('utilBtn_' + k);
    if (b) b.classList.toggle('active', movingUtility === k);
  });
  const sBtn = document.getElementById('servicesBtn');
  if (sBtn) {
    sBtn.classList.toggle('active', showServices);
    sBtn.textContent = showServices ? '⌁ Service runs: On' : '⌁ Service runs: Off';
  }
}

/* ── SERVICE ROUTING ──────────────────────────────────────── */
// Indicative service runs from each utility marker to the road/scheme, so the
// site reads as serviceable without major off-site works (SHELAA §F4). Routes
// are derived on the fly — not a designed drainage/utility layout.
let showServices = true;

// Nearest point on the road centreline to (x,y); falls back to the site centroid.
function nearestRoadPoint(x, y) {
  const c = roadCenterline();
  if (c.length < 2) {
    return {
      x: sitePts.reduce((s, p) => s + p.x, 0) / sitePts.length,
      y: sitePts.reduce((s, p) => s + p.y, 0) / sitePts.length,
    };
  }
  let best = null, bestD = Infinity;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const fx = a.x + t * dx, fy = a.y + t * dy, d = Math.hypot(x - fx, y - fy);
    if (d < bestD) { bestD = d; best = { x: fx, y: fy }; }
  }
  return best;
}

// One route per present utility marker.
function serviceRoutes() {
  const routes = [];
  if (!siteClosed) return routes;
  Object.keys(utilities).forEach(k => {
    const u = utilities[k];
    if (u) routes.push({ from: u, to: nearestRoadPoint(u.x, u.y), col: UTIL_COLS[k], key: k });
  });
  return routes;
}

function onToggleServices() {
  showServices = !showServices;
  refreshUtilityUI();
  render();
  if (view === '3d') build3d();
}

// 2D: dashed service runs from markers to the road, in each utility's colour.
function drawServices2d() {
  if (!showServices || !siteClosed) return;
  ctx.save();
  ctx.setLineDash([3, 3]);
  serviceRoutes().forEach(r => {
    const a = w2s(r.from.x, r.from.y), b = w2s(r.to.x, r.to.y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = r.col; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.75; ctx.stroke();
  });
  ctx.restore();
}

// 3D: service runs as coloured ground lines.
function addServices3d(scene, cx, cz) {
  if (!showServices) return;
  serviceRoutes().forEach(r => {
    const pts = [
      new THREE.Vector3(r.from.x - cx, 0.25, -(r.from.y - cz)),
      new THREE.Vector3(r.to.x - cx,   0.25, -(r.to.y - cz)),
    ];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: new THREE.Color(r.col) })));
  });
}

// Seed a default attenuation pond near the eastern edge — the OS plan shows a
// pond there, and it doubles as the heritage-edge landscape/water feature.
function seedEasternPond() {
  if (!siteClosed || sitePts.length < 3) { showToast('Load a boundary first'); return; }
  const b = boundaryBounds();
  const pts = [];
  for (let x = b.xMin; x <= b.xMax; x += 4)
    for (let y = b.yMin; y <= b.yMax; y += 4)
      if (x > b.xMax - 45 && pointInBoundary(x, y) && distToBoundary(x, y) > 8) pts.push({ x, y });
  if (pts.length < 4) { showToast('No room for an eastern pond'); return; }
  const cxp = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cyp = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const R = 14;
  const poly = [];
  for (let a = 0; a < 8; a++) {
    const th = a / 8 * Math.PI * 2;
    const p = { x: cxp + Math.cos(th) * R, y: cyp + Math.sin(th) * R * 0.8 };
    if (pointInBoundary(p.x, p.y)) poly.push(p);
  }
  if (poly.length < 3) { showToast('No room for an eastern pond'); return; }
  suds.push({ id: sudsId++, type: 'pond', pts: poly });
  if (dwellings.length) generateScheme();
  updateStats(); refreshSudsUI(); render();
  if (view === '3d') build3d();
  showToast('Eastern attenuation pond added — ' + Math.round(polyArea(poly)) + ' m²');
}

/* ── GENERATIVE LAYOUT ENGINE ─────────────────────────────── */
// Turns the boundary + access + drawn road into a coherent scheme of homes that
// front the carriageway, sit behind proper setbacks, keep clear of the eastern
// heritage buffer (Sayerlands House) and western Cuckoo Trail buffer, and land
// at a defensible density. Homes are massing at this stage — Increment 3 gives
// them real modular house types, roofs and materials.

// Axis-aligned bounds of the boundary (site world coords). East is +x, north +y.
function boundaryBounds() {
  const xs = sitePts.map(p => p.x), ys = sitePts.map(p => p.y);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

// Shortest distance from (px,py) to the boundary polygon edges.
function distToBoundary(px, py) {
  let best = Infinity;
  for (let i = 0; i < sitePts.length; i++) {
    const a = sitePts[i], b = sitePts[(i + 1) % sitePts.length];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const fx = a.x + t * dx, fy = a.y + t * dy;
    const d = Math.hypot(px - fx, py - fy);
    if (d < best) best = d;
  }
  return best;
}

// Shortest distance from (px,py) to the road centreline (Infinity if no road).
function distToRoadCentre(px, py) {
  const c = roadCenterline();
  if (c.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const fx = a.x + t * dx, fy = a.y + t * dy;
    const d = Math.hypot(px - fx, py - fy);
    if (d < best) best = d;
  }
  return best;
}

// The four corners of an oriented footprint centred at (cx,cy).
// t = unit tangent (frontage axis), n = unit normal (depth axis).
function footprintCorners(cx, cy, hw, hd, t, n) {
  return [
    { x: cx + t.x * hw + n.x * hd, y: cy + t.y * hw + n.y * hd },
    { x: cx + t.x * hw - n.x * hd, y: cy + t.y * hw - n.y * hd },
    { x: cx - t.x * hw + n.x * hd, y: cy - t.y * hw + n.y * hd },
    { x: cx - t.x * hw - n.x * hd, y: cy - t.y * hw - n.y * hd },
  ];
}

// A candidate footprint is valid if every corner is inside the boundary, clear
// of the boundary line by boundaryInset, outside both buffers, and off the
// carriageway. Buffers are x-bands (east = +x, west = -x).
function footprintValid(cx, cy, hw, hd, t, n) {
  const b = boundaryBounds();
  const roadClear = road.width / 2 + 0.5; // keep the whole footprint off the carriageway
  if (inAnySuds(cx, cy)) return false;    // don't build on attenuation SuDS areas
  for (const c of footprintCorners(cx, cy, hw, hd, t, n)) {
    if (!pointInBoundary(c.x, c.y)) return false;
    if (distToBoundary(c.x, c.y) < genParams.boundaryInset) return false;
    if (c.x > b.xMax - genParams.bufferE) return false; // eastern heritage buffer
    if (c.x < b.xMin + genParams.bufferW) return false; // western Cuckoo Trail buffer
  }
  if (distToRoadCentre(cx, cy) < roadClear) return false;
  return true;
}

// Reject a new plot that collides with an already-placed one (bounding circles).
function overlapsPlaced(cx, cy, w, d) {
  const r = 0.5 * Math.hypot(w, d);
  for (const dw of dwellings) {
    const rr = 0.5 * Math.hypot(dw.w, dw.d);
    if (Math.hypot(cx - dw.cx, cy - dw.cy) < (r + rr) * 0.82) return true;
  }
  return false;
}

// Expand the weighted HOUSE_MIX into a repeating type pattern (length ~24) so
// attempts sample the mix in proportion.
function buildMixPattern() {
  const pat = [];
  HOUSE_MIX.forEach(([key, wt]) => { for (let i = 0; i < Math.round(wt * 24); i++) pat.push(key); });
  return pat.length ? pat : ['semi3'];
}

// Place homes fronting BOTH sides of every road segment, packed along the
// frontage at each type's width. Returns candidate dwellings (unthinned).
function placeAlongRoad(pattern) {
  const path = roadCenterline();
  const out = [];
  let attempt = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 6) continue;
    const t = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen }; // tangent
    const n = { x: -t.y, y: t.x };                                   // left normal
    for (const side of [1, -1]) {
      let dist = 4;             // lead-in from the segment start
      let prevKey = null;
      let guard = 0;
      while (dist < segLen - 4 && guard++ < 400) {
        const key = pattern[attempt++ % pattern.length];
        const ty = HOUSE_TYPES[key];
        const hw = ty.w / 2, hd = ty.d / 2;
        const along = dist + hw;
        const bx = a.x + t.x * along, by = a.y + t.y * along;
        const off = road.width / 2 + genParams.frontSetback + hd;
        const cx = bx + n.x * side * off, cy = by + n.y * side * off;
        if (footprintValid(cx, cy, hw, hd, t, n) && !overlapsPlaced(cx, cy, ty.w, ty.d) &&
            !out.some(o => Math.hypot(cx - o.cx, cy - o.cy) < (hw + o.w / 2) * 0.82)) {
          out.push({ cx, cy, w: ty.w, d: ty.d, rot: Math.atan2(t.y, t.x),
                     type: key, beds: ty.beds, storeys: ty.storeys, color: ty.color,
                     frontX: -n.x * side, frontY: -n.y * side });
          const abut = (key === 'terrace2' && prevKey === 'terrace2');
          dist += ty.w + (abut ? 0 : genParams.sideGap);
          prevKey = key;
        } else {
          dist += 3; prevKey = null; // nudge forward and retry
        }
      }
    }
  }
  return out;
}

// Fallback when no road is drawn: a buffer-aware grid so the tool still produces
// a scheme. Rows run east–west; homes face south.
function placeGrid(pattern) {
  const b = boundaryBounds();
  const out = [];
  const t = { x: 1, y: 0 }, n = { x: 0, y: 1 };
  const ROW_STEP = 20;
  let attempt = 0, rowIdx = 0;
  for (let sy = b.yMin + 8; sy <= b.yMax - 8; sy += ROW_STEP) {
    let sx = b.xMin + 8, guard = 0;
    while (sx <= b.xMax - 8 && guard++ < 200) {
      const key = pattern[attempt++ % pattern.length];
      const ty = HOUSE_TYPES[key];
      const hw = ty.w / 2, hd = ty.d / 2;
      const cx = sx + hw, cy = sy + hd;
      if (footprintValid(cx, cy, hw, hd, t, n) && !overlapsPlaced(cx, cy, ty.w, ty.d) &&
          !out.some(o => Math.hypot(cx - o.cx, cy - o.cy) < (hw + o.w / 2) * 0.82)) {
        out.push({ cx, cy, w: ty.w, d: ty.d, rot: 0,
                   type: key, beds: ty.beds, storeys: ty.storeys, color: ty.color,
                   frontX: 0, frontY: -1 });
        sx += ty.w + genParams.sideGap;
      } else {
        sx += 3;
      }
    }
    rowIdx++;
  }
  return out;
}

// Give each home a vernacular wall + roof material (deterministic by type/index
// so a scheme looks the same each time it is regenerated). Stored on the
// dwelling so 3D materials and any legend agree and persist.
function assignAppearance(list) {
  list.forEach((dw, i) => {
    const tm = TYPE_MATERIALS[dw.type] || TYPE_MATERIALS.semi3;
    dw.walls = tm.walls[i % tm.walls.length];
    dw.roof  = tm.roofs[(i >> 1) % tm.roofs.length];
  });
}

// Evenly thin a candidate list down to `target` so survivors spread across the
// whole frontage rather than clustering at the start.
function thinToTarget(list, target) {
  if (list.length <= target) return list;
  const kept = [], stride = list.length / target;
  for (let i = 0; i < target; i++) kept.push(list[Math.floor(i * stride)]);
  return kept;
}

// Auto-lay a sensible estate road: a spine from the access stub to the deepest
// interior point, with one gentle bend, so a generated scheme always reads as a
// street rather than a grid. Only runs when no road has been drawn.
function autoRoad() {
  if (!siteClosed || sitePts.length < 3 || !accessPt) return;
  const stub = roadStubPoint();
  if (!stub) return;
  const b = boundaryBounds();
  const clear = Math.max(12, road.width);
  const cand = [];
  for (let x = b.xMin; x <= b.xMax; x += 5)
    for (let y = b.yMin; y <= b.yMax; y += 5)
      if (pointInBoundary(x, y) && distToBoundary(x, y) > clear && !inAnySuds(x, y)) cand.push({ x, y });
  if (!cand.length) { road.pts = []; return; }
  // spine end = deepest-interior point farthest from the stub
  let end = cand[0], best = -1;
  for (const p of cand) { const d = Math.hypot(p.x - stub.x, p.y - stub.y); if (d > best) { best = d; end = p; } }
  // bend point = interior point nearest the stub→end midpoint
  const mid = { x: (stub.x + end.x) / 2, y: (stub.y + end.y) / 2 };
  let m = end, md = Infinity;
  for (const p of cand) { const d = Math.hypot(p.x - mid.x, p.y - mid.y); if (d < md) { md = d; m = p; } }
  road.pts = (Math.hypot(m.x - stub.x, m.y - stub.y) > 15 && Math.hypot(end.x - m.x, end.y - m.y) > 15)
    ? [{ x: m.x, y: m.y }, { x: end.x, y: end.y }]
    : [{ x: end.x, y: end.y }];
}

// MAIN ENTRY — build the scheme from the current boundary/access/road.
function generateScheme() {
  if (!siteClosed || sitePts.length < 3) { showToast('Close a site boundary first'); return; }
  const pattern = buildMixPattern();
  if (genParams.autoRoad && roadCenterline().length < 2) autoRoad(); // ensure a street exists
  dwellings = []; // placeAlongRoad checks against `dwellings` via overlapsPlaced
  const candidates = roadCenterline().length >= 2 ? placeAlongRoad(pattern) : placeGrid(pattern);
  dwellings = thinToTarget(candidates, genParams.targetCount);
  assignAppearance(dwellings);
  placedDwellings = dwellings.length;

  const lbl = document.getElementById('dwellingCountLabel');
  if (lbl) lbl.textContent = genParams.targetCount;
  updateStats();
  render();
  if (view === '3d') build3d();
  const hasRoad = roadCenterline().length >= 2;
  showToast(`Generated ${dwellings.length} homes` + (hasRoad ? ' fronting the road' : ' (draw a road for frontages)'));
}

function clearScheme() {
  dwellings = [];
  placedDwellings = 0;
  updateStats(); render();
  if (view === '3d') build3d();
  showToast('Scheme cleared');
}

// Sidebar: target-count slider drives the generator.
function onTargetCount(v) {
  genParams.targetCount = +v;
  document.getElementById('dwellingCountLabel').textContent = v;
  if (siteClosed && sitePts.length >= 3) generateScheme();
}

// Sidebar: toggle roof-integrated PV. Affects the 3D model + solar-area stat.
function onToggleSolar() {
  genParams.solar = !genParams.solar;
  const btn = document.getElementById('solarBtn');
  if (btn) {
    btn.classList.toggle('active', genParams.solar);
    btn.textContent = genParams.solar ? '☀ Roof solar: On' : '☀ Roof solar: Off';
  }
  updateStats();
  if (view === '3d') build3d();
}

// Sidebar: setback / buffer sliders — regenerate live so the effect is visible.
function onGenParam(which, v) {
  genParams[which] = +v;
  const labels = { frontSetback: 'setbackLabel', bufferE: 'bufferELabel', bufferW: 'bufferWLabel' };
  const el = document.getElementById(labels[which]);
  if (el) el.textContent = v + 'm';
  if (siteClosed && sitePts.length >= 3 && dwellings.length) generateScheme();
}

// Show the Generate controls only when a boundary exists.
function refreshGenUI() {
  const ctrls = document.getElementById('genControls');
  const hint  = document.getElementById('genHint');
  if (!ctrls) return;
  const ready = siteClosed && sitePts.length >= 3;
  ctrls.style.display = ready ? 'flex' : 'none';
  if (hint) hint.style.display = ready ? 'none' : 'block';
}

// Push genParams into the sidebar controls (used after loading a saved project).
function syncGenUI() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const txt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('dwellingSlider', genParams.targetCount); txt('dwellingCountLabel', genParams.targetCount);
  set('setbackSlider', genParams.frontSetback); txt('setbackLabel', genParams.frontSetback + 'm');
  set('bufferESlider', genParams.bufferE);      txt('bufferELabel', genParams.bufferE + 'm');
  set('bufferWSlider', genParams.bufferW);      txt('bufferWLabel', genParams.bufferW + 'm');
  const solarBtn = document.getElementById('solarBtn');
  if (solarBtn) {
    solarBtn.classList.toggle('active', genParams.solar);
    solarBtn.textContent = genParams.solar ? '☀ Roof solar: On' : '☀ Roof solar: Off';
  }
}

// 2D: translucent buffer bands so the heritage/landscape edges read on plan.
function drawBuffers2d() {
  if (!siteClosed || sitePts.length < 3) return;
  const b = boundaryBounds();
  const bands = [
    { x0: b.xMax - genParams.bufferE, x1: b.xMax, col: 'rgba(168,85,247,0.10)', label: 'Heritage buffer (E)' },
    { x0: b.xMin, x1: b.xMin + genParams.bufferW, col: 'rgba(0,232,122,0.10)', label: 'Cuckoo Trail buffer (W)' },
  ];
  ctx.save();
  // Clip to the boundary so bands don't bleed outside the site
  ctx.beginPath();
  const s0 = w2s(sitePts[0].x, sitePts[0].y);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < sitePts.length; i++) { const s = w2s(sitePts[i].x, sitePts[i].y); ctx.lineTo(s.x, s.y); }
  ctx.closePath();
  ctx.clip();
  bands.forEach(bd => {
    if (bd.x1 <= bd.x0) return;
    const tl = w2s(bd.x0, b.yMax), br = w2s(bd.x1, b.yMin);
    ctx.fillStyle = bd.col;
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  });
  ctx.restore();
}

// 2D: each generated home as an oriented footprint in its type colour.
function drawDwellings2d() {
  if (!dwellings.length) return;
  ctx.save();
  dwellings.forEach(dw => {
    const t = { x: Math.cos(dw.rot), y: Math.sin(dw.rot) };
    const n = { x: -Math.sin(dw.rot), y: Math.cos(dw.rot) };
    const cs = footprintCorners(dw.cx, dw.cy, dw.w / 2, dw.d / 2, t, n).map(c => w2s(c.x, c.y));
    // corners order: [+t+n, +t-n, -t+n, -t-n] → draw as quad +t+n, +t-n, -t-n, -t+n
    ctx.beginPath();
    ctx.moveTo(cs[0].x, cs[0].y);
    ctx.lineTo(cs[1].x, cs[1].y);
    ctx.lineTo(cs[3].x, cs[3].y);
    ctx.lineTo(cs[2].x, cs[2].y);
    ctx.closePath();
    ctx.fillStyle   = dw.color + '30';
    ctx.strokeStyle = dw.color;
    ctx.lineWidth   = 1.2;
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

/* ── PHOTOREAL HELPERS (procedural textures, sky, IBL) ─────── */
// All self-contained (canvas-drawn) so nothing loads over the network.
const _texCache = {};
function _canvasTex(key, w, h, draw, repeat) {
  if (_texCache[key]) return _texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if ('encoding' in t) t.encoding = THREE.sRGBEncoding;
  _texCache[key] = t;
  return t;
}
// deterministic pseudo-noise so textures are stable between builds
function _rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function texGrass() {
  return _canvasTex('grass', 256, 256, (g, w, h) => {
    g.fillStyle = '#5f7f45'; g.fillRect(0, 0, w, h);
    const r = _rng(7);
    for (let i = 0; i < 4200; i++) {
      const x = r() * w, y = r() * h, l = 1 + r() * 3;
      const shade = 60 + Math.floor(r() * 70);
      g.strokeStyle = `rgba(${shade - 20},${shade + 40},${shade - 10},0.5)`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y - l); g.stroke();
    }
  }, [80, 80]);
}
function texBrick() {
  return _canvasTex('brick', 128, 128, (g, w, h) => {
    g.fillStyle = '#8f4436'; g.fillRect(0, 0, w, h);
    const bh = 16, bw = 32, r = _rng(11);
    for (let row = 0, y = 0; y < h; y += bh, row++) {
      const off = (row % 2) * (bw / 2);
      for (let x = -bw; x < w; x += bw) {
        const v = 150 + Math.floor(r() * 45);
        g.fillStyle = `rgb(${v},${Math.floor(v * 0.5)},${Math.floor(v * 0.42)})`;
        g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
  }, [3, 2.2]);
}
function texRender() { // pastel render, subtle mottle
  return _canvasTex('render', 128, 128, (g, w, h) => {
    g.fillStyle = '#e7e2d0'; g.fillRect(0, 0, w, h);
    const r = _rng(3);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(200,195,175,${r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  }, [2, 2]);
}
function texBoard() { // horizontal weatherboarding
  return _canvasTex('board', 128, 128, (g, w, h) => {
    for (let y = 0; y < h; y += 10) {
      const v = 195 + ((y / 10) % 2) * 14;
      g.fillStyle = `rgb(${v},${v - 6},${v - 22})`; g.fillRect(0, y, w, 9);
      g.fillStyle = 'rgba(90,80,60,0.35)'; g.fillRect(0, y + 9, w, 1);
    }
  }, [2, 3]);
}
function texTile() { // clay/slate rows of tiles (colourised via material tint)
  return _canvasTex('tile', 128, 128, (g, w, h) => {
    g.fillStyle = '#e2e2e2'; g.fillRect(0, 0, w, h);
    const th = 12, tw = 16, r = _rng(5);
    for (let row = 0, y = 0; y < h; y += th, row++) {
      const off = (row % 2) * (tw / 2);
      for (let x = -tw; x < w; x += tw) {
        const v = 205 + Math.floor(r() * 50);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath();
        g.moveTo(x + off, y + th); g.lineTo(x + off, y + 3);
        g.arc(x + off + tw / 2, y + 3, tw / 2, Math.PI, 0);
        g.lineTo(x + off + tw, y + th); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke();
      }
    }
  }, [4, 3]);
}
function texTarmac() {
  return _canvasTex('tarmac', 128, 128, (g, w, h) => {
    g.fillStyle = '#3f4247'; g.fillRect(0, 0, w, h);
    const r = _rng(9);
    for (let i = 0; i < 2600; i++) {
      const v = 40 + Math.floor(r() * 70);
      g.fillStyle = `rgba(${v},${v},${v + 4},0.6)`;
      g.fillRect(r() * w, r() * h, 1.4, 1.4);
    }
  }, [10, 10]);
}
// canopy sprite (soft blobby foliage with alpha) for billboard trees
function texCanopy() {
  return _canvasTex('canopy', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = _rng(13), cx = w / 2, cy = h * 0.55;
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, rad = r() * 52;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.9;
      const s = 8 + r() * 16, gr = 90 + Math.floor(r() * 70);
      g.fillStyle = `rgba(${Math.floor(gr * 0.5)},${gr},${Math.floor(gr * 0.45)},0.5)`;
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
  });
}

// Equirectangular sky canvas → used for both the sky dome and IBL env map.
let _skyTex = null;
function skyEquirect() {
  if (_skyTex) return _skyTex;
  const w = 1024, h = 512, c = document.createElement('canvas');
  c.width = w; c.height = h; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0.0, '#3f74c4');   // zenith
  grd.addColorStop(0.5, '#9cc3e8');   // mid
  grd.addColorStop(0.62, '#dce9f4');  // horizon haze
  grd.addColorStop(1.0, '#c8d3c0');   // ground haze
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  // warm sun glow
  const sx = w * 0.72, sy = h * 0.30, sun = g.createRadialGradient(sx, sy, 0, sx, sy, 150);
  sun.addColorStop(0, 'rgba(255,247,225,1)');
  sun.addColorStop(0.15, 'rgba(255,241,205,0.9)');
  sun.addColorStop(1, 'rgba(255,241,205,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  _skyTex = new THREE.CanvasTexture(c);
  _skyTex.mapping = THREE.EquirectangularReflectionMapping;
  if ('encoding' in _skyTex) _skyTex.encoding = THREE.sRGBEncoding;
  return _skyTex;
}
// IBL environment (PMREM) built once from the sky — realistic PBR reflections + ambient.
let _envMap = null;
function envMap(renderer) {
  if (_envMap) return _envMap;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    _envMap = pmrem.fromEquirectangular(skyEquirect()).texture;
  } catch (e) { _envMap = null; }
  return _envMap;
}

/* ── RENDER STYLES (pencil / hybrid / rendered) ───────────── */
// One 3D scene, three presentation looks:
//   rendered — photoreal: PBR materials, sky, soft shadows, grass ground
//   hybrid   — muted colours + edge outlines (drawing with colour)
//   pencil   — paper-white massing + black outlines (line drawing)
const RENDER_STYLES = { pencil: 'Pencil', hybrid: 'Hybrid', rendered: 'Rendered' };

function setRenderStyle(s) {
  if (!RENDER_STYLES[s]) return;
  renderStyle = s;
  Object.keys(RENDER_STYLES).forEach(k => {
    const b = document.getElementById('rs_' + k);
    if (b) b.classList.toggle('active', k === renderStyle);
  });
  if (view === '3d') build3d(); else setView('3d');
}

// Desaturate + lighten a colour toward paper for the hybrid look.
function mutedColor(hex, amt = 0.45) {
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * (1 - amt), Math.min(0.9, hsl.l + amt * 0.22));
  return c;
}

// Style-aware surface material. opts: { rough, metal, opacity, glass, side, pencil, tex, bump }.
function styleSurface(hex, opts = {}) {
  const { rough = 0.85, metal = 0.0, opacity = 1, glass = false, side, pencil, tex, bump = 0.03 } = opts;
  const t = opacity < 1;
  if (renderStyle === 'pencil') {
    return new THREE.MeshBasicMaterial({ color: pencil != null ? pencil : 0xf7f5ef, transparent: t, opacity, side });
  }
  if (renderStyle === 'rendered') {
    const m = new THREE.MeshStandardMaterial({
      color: tex ? 0xffffff : hex, roughness: glass ? 0.08 : rough, metalness: glass ? 0.15 : metal,
      transparent: t, opacity, side,
    });
    if (tex) { m.map = tex; m.bumpMap = tex; m.bumpScale = bump; }
    return m;
  }
  return new THREE.MeshLambertMaterial({ color: mutedColor(hex), transparent: t, opacity, side });
}

// Textured Hailsham wall material (rendered mode); falls back to styleSurface.
function wallMaterial(key, hex) {
  if (renderStyle !== 'rendered') return styleSurface(hex, { rough: 0.92 });
  let map, color = 0xffffff, rough = 0.9;
  if (key === 'brick') map = texBrick();
  else if (key === 'render') map = texRender();
  else if (key === 'weatherboard') { map = texBoard(); color = hex; }
  else if (key === 'tilehung') { map = texTile(); color = hex; rough = 0.85; }
  else map = texRender();
  const m = new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: 0 });
  m.bumpMap = map; m.bumpScale = 0.04;
  return m;
}

// Textured roof material (rendered mode) tinted to clay/slate; else styleSurface.
function roofMaterial(hex) {
  if (renderStyle !== 'rendered') return styleSurface(hex, { rough: 0.8, side: THREE.DoubleSide });
  const tile = texTile();
  const m = new THREE.MeshStandardMaterial({ map: tile, color: hex, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  m.bumpMap = tile; m.bumpScale = 0.06;
  return m;
}

// Add black/grey edge outlines matching a mesh (pencil + hybrid only).
function styleEdges(group, mesh) {
  if (renderStyle === 'rendered') return;
  const col = renderStyle === 'pencil' ? 0x2b2b2b : 0x3a3f46;
  const op  = renderStyle === 'pencil' ? 0.9 : 0.4;
  const eg = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25),
    new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op }));
  eg.position.copy(mesh.position);
  eg.rotation.copy(mesh.rotation);
  eg.scale.copy(mesh.scale);
  group.add(eg);
}

// Pitch rise for a house of the given footprint (≈35–40° roof).
function houseRise(w, d) { return Math.min(w, d) * 0.32; }

// Slope length (eave→ridge) and PV panel area for one home's south-facing roof.
function houseSolarM2(dw) {
  const rise = houseRise(dw.w, dw.d);
  const slopeLen = Math.hypot(dw.d / 2, rise);
  return dw.w * 0.8 * slopeLen * 0.68; // usable panel area on one slope
}

// Total roof-PV area across the scheme (0 when solar is off).
function solarRoofM2() {
  if (!genParams.solar) return 0;
  return dwellings.reduce((s, dw) => s + houseSolarM2(dw), 0);
}

// 3D: one vernacular house — body, pitched roof, fenestration, chimney and
// (optionally) roof-integrated PV on the south-facing slope. Oriented to the road.
function addHouse3d(scene, dw, cx, cz) {
  const eave = dw.storeys * 3;             // 3 m per storey to the eaves
  const rise = houseRise(dw.w, dw.d);
  const wallCol = (WALL_MATERIALS[dw.walls] || WALL_MATERIALS.brick).color;
  const roofCol = (ROOF_MATERIALS[dw.roof] || ROOF_MATERIALS.clay).color;

  const grp = new THREE.Group();
  grp.position.set(dw.cx - cx, 0, -(dw.cy - cz));
  grp.rotation.y = dw.rot;

  const body = new THREE.Mesh(new THREE.BoxGeometry(dw.w, eave, dw.d),
    wallMaterial(dw.walls, wallCol));
  body.position.y = eave / 2;
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);
  styleEdges(grp, body);

  // Pitched roof with a small eaves overhang for realism
  const oh = renderStyle === 'rendered' ? 0.6 : 0;
  const roof = new THREE.Mesh(makePitchedRoof(dw.w + oh, dw.d + oh, eave, rise),
    roofMaterial(roofCol));
  roof.castShadow = true;
  grp.add(roof);
  styleEdges(grp, roof);

  // Local +Z maps to the world direction (t.y, -t.x); pick the sign that faces the road.
  const t = { x: Math.cos(dw.rot), y: Math.sin(dw.rot) };
  const localZ = { x: t.y, y: -t.x };
  const frontSign = ((dw.frontX || 0) * localZ.x + (dw.frontY || 0) * localZ.y) >= 0 ? 1 : -1;
  const zFace = frontSign * (dw.d / 2 + 0.06);

  const glassMat = styleSurface(0x243244, { glass: true, rough: 0.05, metal: 0.1, pencil: 0xdfe6ea });
  const doorMat  = styleSurface(0x4a3524, { rough: 0.7, pencil: 0xe0d8cc });
  const win = (px, py, ww, hh) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.1), glassMat);
    m.position.set(px, py, zFace); grp.add(m);
  };
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.12), doorMat);
  door.position.set(-dw.w * 0.28, 1.05, zFace); grp.add(door);
  win(dw.w * 0.05, 1.3, 1.4, 1.3);
  win(dw.w * 0.30, 1.3, 1.4, 1.3);
  if (dw.storeys >= 2) {
    win(-dw.w * 0.28, eave - 1.4, 1.2, 1.2);
    win(dw.w * 0.05,  eave - 1.4, 1.2, 1.2);
    win(dw.w * 0.30,  eave - 1.4, 1.2, 1.2);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.8, rise + 1.2, 0.8),
      styleSurface(wallCol, { rough: 0.92 }));
    chim.position.set(dw.w * 0.32, eave + (rise + 1.2) / 2 - 0.2, dw.d * 0.15);
    chim.castShadow = true; grp.add(chim);
    styleEdges(grp, chim);
  }

  // Roof PV on whichever slope faces south (world -y). Panel lies on the pitch.
  if (genParams.solar) {
    const pvSign = localZ.y < 0 ? 1 : -1; // +Z slope faces south when localZ.y < 0
    const pitch  = Math.atan2(rise, dw.d / 2);
    const slopeLen = Math.hypot(dw.d / 2, rise);
    const pv = new THREE.Mesh(new THREE.BoxGeometry(dw.w * 0.55, 0.08, slopeLen * 0.5),
      styleSurface(0x1b2733, { glass: true, metal: 0.15, rough: 0.28, pencil: 0xccced2 }));
    pv.position.set(0, eave + rise * 0.5 + 0.08, pvSign * (dw.d / 4));
    pv.rotation.x = pvSign * -pitch;
    grp.add(pv);
  }

  scene.add(grp);
}

function addDwellings3d(scene, cx, cz) {
  dwellings.forEach(dw => addHouse3d(scene, dw, cx, cz));
}

// A compact housing-mix tally { 'label': count, ... } for the stats panel.
function schemeMix() {
  const tally = {};
  dwellings.forEach(dw => {
    const label = HOUSE_TYPES[dw.type] ? HOUSE_TYPES[dw.type].label : dw.type;
    tally[label] = (tally[label] || 0) + 1;
  });
  return tally;
}

/* ── ATTENUATION SuDS HELPERS ─────────────────────────────── */

// Ray-cast point-in-polygon for an arbitrary vertex list.
function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Combined area of all drawn SuDS polygons (m²). Feeds net developable area.
function sudsAreaM2() {
  return suds.reduce((s, f) => s + (f.pts.length >= 3 ? polyArea(f.pts) : 0), 0);
}

// True if (x,y) falls inside any drawn SuDS polygon — used to keep homes off them.
function inAnySuds(x, y) {
  return suds.some(f => f.pts.length >= 3 && pointInPoly(f.pts, x, y));
}

// Enter SuDS-draw mode (2D). Mutually exclusive with the other draw/move modes.
function toggleDrawSuds() {
  if (!siteClosed || sitePts.length < 3) return;
  if (view === '3d') setView('2d');
  drawingRoad = false; movingEntrance = false; movingUtility = null;
  drawingSuds = true; sudsDraft = [];
  canvas.style.cursor = 'crosshair';
  document.getElementById('hintBar').textContent =
    `Click to outline the ${SUDS_TYPES[sudsType].label} — double-click or Esc to close`;
  refreshSudsUI();
}

function setSudsType(t) {
  sudsType = t;
  refreshSudsUI();
  if (drawingSuds) document.getElementById('hintBar').textContent =
    `Click to outline the ${SUDS_TYPES[sudsType].label} — double-click or Esc to close`;
}

// Close the in-progress polygon into the suds list (needs ≥3 vertices).
function finishSuds() {
  if (sudsDraft.length >= 3) {
    suds.push({ id: sudsId++, type: sudsType, pts: sudsDraft.slice() });
    if (dwellings.length) generateScheme(); // homes keep clear of the new SuDS area
    showToast(`${SUDS_TYPES[sudsType].label} added — ${Math.round(polyArea(sudsDraft))} m²`);
  }
  sudsDraft = [];
  drawingSuds = false;
  canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  document.getElementById('hintBar').textContent = suds.length ? 'SuDS area drawn' : 'SuDS cleared';
  updateStats(); refreshSudsUI(); render();
  if (view === '3d') build3d();
}

function clearSuds() {
  suds = []; sudsDraft = []; drawingSuds = false;
  updateStats(); refreshSudsUI(); render();
  if (view === '3d') build3d();
  if (dwellings.length) generateScheme();
  showToast('SuDS cleared');
}

// Undo the last completed SuDS polygon.
function undoSuds() {
  if (drawingSuds && sudsDraft.length) { sudsDraft.pop(); render(); return; }
  if (suds.length) { suds.pop(); updateStats(); render(); if (view === '3d') build3d(); if (dwellings.length) generateScheme(); }
}

// Show SuDS controls only when a boundary exists; reflect active type + draw state.
function refreshSudsUI() {
  const ctrls = document.getElementById('sudsControls');
  const hint  = document.getElementById('sudsHint');
  if (!ctrls) return;
  const ready = siteClosed && sitePts.length >= 3;
  ctrls.style.display = ready ? 'flex' : 'none';
  if (hint) hint.style.display = ready ? 'none' : 'block';
  Object.keys(SUDS_TYPES).forEach(k => {
    const b = document.getElementById('sudsType_' + k);
    if (b) b.classList.toggle('active', sudsType === k);
  });
  const btn = document.getElementById('sudsDrawBtn');
  if (btn) {
    btn.classList.toggle('active', drawingSuds);
    btn.textContent = drawingSuds ? '■ Finish area' : '✐ Draw SuDS area';
  }
  const areaEl = document.getElementById('sudsAreaLabel');
  if (areaEl) areaEl.textContent = Math.round(sudsAreaM2()) + ' m²';
}

// 2D: filled translucent SuDS polygons + the in-progress outline while drawing.
function drawSuds2d() {
  if (!siteClosed) return;
  ctx.save();
  suds.forEach(f => {
    if (f.pts.length < 2) return;
    const col = (SUDS_TYPES[f.type] || SUDS_TYPES.pond).color;
    ctx.beginPath();
    const s0 = w2s(f.pts[0].x, f.pts[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < f.pts.length; i++) { const s = w2s(f.pts[i].x, f.pts[i].y); ctx.lineTo(s.x, s.y); }
    ctx.closePath();
    ctx.fillStyle = col + '33';
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    ctx.fill(); ctx.stroke();
    // label at centroid
    if (zoom > 0.3) {
      const cxp = f.pts.reduce((s, p) => s + p.x, 0) / f.pts.length;
      const cyp = f.pts.reduce((s, p) => s + p.y, 0) / f.pts.length;
      const sp = w2s(cxp, cyp);
      ctx.font = '9px DM Mono'; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((SUDS_TYPES[f.type] || {}).label || 'SuDS', sp.x, sp.y);
    }
  });
  // In-progress draft
  if (drawingSuds && sudsDraft.length) {
    const col = SUDS_TYPES[sudsType].color;
    ctx.beginPath();
    const s0 = w2s(sudsDraft[0].x, sudsDraft[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < sudsDraft.length; i++) { const s = w2s(sudsDraft[i].x, sudsDraft[i].y); ctx.lineTo(s.x, s.y); }
    const sm = w2s(mw.x, mw.y);
    ctx.lineTo(sm.x, sm.y);
    ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
    ctx.stroke(); ctx.setLineDash([]);
    sudsDraft.forEach(p => {
      const s = w2s(p.x, p.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    });
  }
  ctx.restore();
}

// 3D: ponds as a recessed water plane; rain gardens / permeable as flat ground planes.
function addSuds3d(scene, cx, cz) {
  suds.forEach(f => {
    if (f.pts.length < 3) return;
    const shape = new THREE.Shape();
    shape.moveTo(f.pts[0].x - cx, f.pts[0].y - cz);
    for (let i = 1; i < f.pts.length; i++) shape.lineTo(f.pts[i].x - cx, f.pts[i].y - cz);
    shape.closePath();
    const col = (SUDS_TYPES[f.type] || SUDS_TYPES.pond).color;
    const isPond = f.type === 'pond';
    const mat = styleSurface(col, {
      opacity: isPond ? 0.8 : 0.6, side: THREE.DoubleSide,
      glass: isPond, rough: isPond ? 0.05 : 0.7,
      pencil: isPond ? 0xcdd8de : 0xe4e0d4,
    });
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = isPond ? -0.4 : 0.14; // pond sits below grade; others hug the slab
    m.receiveShadow = true;
    scene.add(m);
  });
}

// SuDS mix tally for the stats panel.
function sudsSummary() {
  const tally = {};
  suds.forEach(f => {
    const label = (SUDS_TYPES[f.type] || {}).label || f.type;
    tally[label] = (tally[label] || 0) + polyArea(f.pts);
  });
  return tally;
}

/* ── STATS ────────────────────────────────────────────────── */
function updateStats() {
  const sA  = siteClosed && sitePts.length >= 3 ? polyArea(sitePts) : 0;
  const bA  = buildings.reduce((s, b) => s + b.w * b.h, 0);
  const gfa = buildings.reduce((s, b) => s + b.w * b.h * b.floors, 0);
  const far = sA > 0 ? (gfa / sA).toFixed(2) : '0.0';
  const mxF = buildings.length ? Math.max(...buildings.map(b => b.floors)) : '—';

  document.getElementById('sSite').textContent     = Math.round(sA);
  document.getElementById('sBuild').textContent    = Math.round(bA);
  document.getElementById('sGFA').textContent      = Math.round(gfa);
  document.getElementById('sFAR').textContent      = far;
  document.getElementById('sBuildings').textContent = buildings.length;
  document.getElementById('sFloors').textContent   = mxF;
  document.getElementById('lySitePts').textContent = sitePts.length + ' pts';
  document.getElementById('lyBuildN').textContent  = buildings.length;
  document.getElementById('cCov').textContent      = sA > 0 ? ((bA / sA) * 100).toFixed(1) + '%' : '—';
  document.getElementById('cFAR').textContent      = far;
  document.getElementById('cPct').textContent      = sA > 0 ? ((bA / sA) * 100).toFixed(0) + '%' : '—';

  // ── Dwelling capacity — reuses the site area sA above ──
  // Net developable = gross − measured road − measured SuDS − (open-space % of gross).
  // Road and SuDS come from drawn geometry; the % is a landscape/open-space allowance.
  // Headline density is dwellings per NET hectare, gross shown alongside.
  const roadM2    = roadAreaM2();
  const sudsM2    = sudsAreaM2();
  const netM2     = Math.max(0, sA * (1 - deductPct / 100) - roadM2 - sudsM2);
  const ha        = sA > 0 ? sA / 10000 : 0;
  const netHa     = netM2 / 10000;
  const densNet   = (netHa > 0 && placedDwellings > 0) ? placedDwellings / netHa : 0;
  const densGross = (ha    > 0 && placedDwellings > 0) ? placedDwellings / ha    : 0;
  document.getElementById('sSiteHa').textContent      = ha > 0 ? ha.toFixed(2) : '0.00';
  document.getElementById('sNetHa').textContent       = netHa > 0 ? netHa.toFixed(2) : '0.00';
  document.getElementById('sDwellings').textContent   = placedDwellings;
  document.getElementById('sDensity').textContent     = densNet > 0 ? densNet.toFixed(1) : '0';
  document.getElementById('sDensityGross').textContent = densGross > 0 ? densGross.toFixed(1) : '0';
  document.getElementById('sRoad').textContent        = roadM2 > 0 ? Math.round(roadM2) : 0;
  const sudsEl = document.getElementById('sSuds');
  if (sudsEl) sudsEl.textContent = sudsM2 > 0 ? Math.round(sudsM2) : 0;
  const solarEl = document.getElementById('sSolar');
  if (solarEl) solarEl.textContent = Math.round(solarRoofM2());

  // ── Density honesty: flag when net density leaves the defensible band ──
  // ~19–25 dw/ha net fits the landscape-led SHELAA narrative; >25 contradicts it.
  const densEl = document.getElementById('sDensity');
  if (densEl) {
    densEl.classList.remove('warn');
    if (densNet > 25) densEl.classList.add('warn');
  }

  // ── Housing-mix tally for the generated scheme ──
  const mixEl = document.getElementById('schemeMix');
  if (mixEl) {
    if (!dwellings.length) {
      mixEl.textContent = 'No scheme generated yet.';
    } else {
      const tally = schemeMix();
      mixEl.innerHTML = Object.keys(tally)
        .map(k => `<div class="mix-row"><span>${k}</span><span>${tally[k]}</span></div>`)
        .join('');
    }
  }

  // ── SuDS summary (area per type) ──
  const sudsSumEl = document.getElementById('sudsSummary');
  if (sudsSumEl) {
    if (!suds.length) {
      sudsSumEl.textContent = 'No SuDS drawn yet.';
    } else {
      const tally = sudsSummary();
      sudsSumEl.innerHTML = Object.keys(tally)
        .map(k => `<div class="mix-row"><span>${k}</span><span>${Math.round(tally[k])} m²</span></div>`)
        .join('');
    }
  }

  refreshEntranceUI();
  refreshUtilityUI();
  refreshRoadUI();
  refreshGenUI();
  refreshSudsUI();
}

/* ── PROPERTIES PANEL ─────────────────────────────────────── */
function updateProps() {
  const panel = document.getElementById('propPanel');
  const b = buildings.find(b => b.id === selected);
  if (!b) {
    panel.innerHTML = '<div class="no-sel">Select a building to edit its properties.</div>';
    return;
  }
  panel.innerHTML = `
    <div class="prop-row"><span class="prop-l">Width</span><span class="prop-v acc">${b.w}m</span></div>
    <div class="prop-row"><span class="prop-l">Depth</span><span class="prop-v acc">${b.h}m</span></div>
    <div class="prop-row"><span class="prop-l">Floors</span><span class="prop-v acc">${b.floors}</span></div>
    <div class="prop-row"><span class="prop-l">Footprint</span><span class="prop-v">${Math.round(b.w * b.h)} m²</span></div>
    <div class="prop-row"><span class="prop-l">GFA</span><span class="prop-v">${Math.round(b.w * b.h * b.floors)} m²</span></div>
    <div class="prop-row"><span class="prop-l">Height</span><span class="prop-v">${b.floors * 3}m</span></div>
    <div style="margin:10px 0 5px;font-family:var(--mono);font-size:8px;letter-spacing:1px;color:var(--text-dimmer);text-transform:uppercase">Floors</div>
    <input type="range" class="slider" min="1" max="30" value="${b.floors}" oninput="setBF(${b.id}, this.value)"/>
    <div style="margin:10px 0 5px;font-family:var(--mono);font-size:8px;letter-spacing:1px;color:var(--text-dimmer);text-transform:uppercase">Colour</div>
    <div class="color-row">${COLS.map(c => `<div class="chip ${c === b.color ? 'on' : ''}" style="background:${c}" onclick="setBC(${b.id},'${c}')"></div>`).join('')}</div>
    <button class="del-btn" onclick="delSel()">Delete Building</button>
  `;
}

function setBF(id, val) {
  const b = buildings.find(b => b.id === id);
  if (b) { b.floors = +val; updateStats(); render(); updateProps(); }
}

function setBC(id, col) {
  const b = buildings.find(b => b.id === id);
  if (b) { b.color = col; defCol = col; render(); updateProps(); }
}

function delSel() {
  buildings = buildings.filter(b => b.id !== selected);
  selected  = null;
  updateStats(); render(); updateProps();
}

/* ── CANVAS EVENTS ────────────────────────────────────────── */
function cp(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('mousemove', e => {
  const p = cp(e);
  mw = s2w(p.x, p.y);
  document.getElementById('hud').textContent = `X: ${mw.x.toFixed(1)}m   Y: ${mw.y.toFixed(1)}m`;

  if (isPan && panSt) {
    panX += p.x - panSt.x;
    panY += p.y - panSt.y;
    panSt = p;
    render();
    return;
  }

  if (dragging && selected && dragOff) {
    const b = buildings.find(b => b.id === selected);
    if (b) { b.x = mw.x - dragOff.x; b.y = mw.y - dragOff.y; render(); updateStats(); updateProps(); }
  } else {
    render();
  }
});

canvas.addEventListener('mousedown', e => {
  if (e.button === 1) { isPan = true; panSt = cp(e); e.preventDefault(); return; }
  const w2 = s2w(cp(e).x, cp(e).y);
  if (tool === 'select') {
    selected = null;
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (w2.x >= b.x && w2.x <= b.x + b.w && w2.y >= b.y && w2.y <= b.y + b.h) {
        selected = b.id; dragging = true; dragOff = { x: w2.x - b.x, y: w2.y - b.y }; break;
      }
    }
    updateProps(); render();
  }
});

canvas.addEventListener('mouseup', e => {
  if (e.button === 1) { isPan = false; panSt = null; return; }
  dragging = false;
});

canvas.addEventListener('click', e => {
  if (dragging) return;
  const w2 = s2w(cp(e).x, cp(e).y);

  // Draw road: append a centreline point, clamped to stay inside the boundary
  if (drawingRoad) {
    const p = pointInBoundary(w2.x, w2.y) ? { x: w2.x, y: w2.y } : nearestPointOnBoundary(w2.x, w2.y);
    road.pts.push(p);
    updateStats(); render();
    return;
  }

  // Draw SuDS: append a polygon vertex, clamped to stay inside the boundary
  if (drawingSuds) {
    const p = pointInBoundary(w2.x, w2.y) ? { x: w2.x, y: w2.y } : nearestPointOnBoundary(w2.x, w2.y);
    sudsDraft.push(p);
    render();
    return;
  }

  // Move utility: SEWER/WATER snap to the boundary; ELEC places freely (off-site)
  if (movingUtility) {
    const which = movingUtility;
    utilities[which] = which === 'elec'
      ? { x: w2.x, y: w2.y }
      : nearestPointOnBoundary(w2.x, w2.y);
    movingUtility = null;
    canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    document.getElementById('hintBar').textContent = UTIL_LABELS[which] + ' placed';
    refreshUtilityUI();
    render();
    showToast(UTIL_LABELS[which] + ' moved');
    return;
  }

  // Move entrance: snap to the nearest point on the boundary edge, then exit mode
  if (movingEntrance) {
    accessPt       = nearestPointOnBoundary(w2.x, w2.y);
    movingEntrance = false;
    canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    document.getElementById('hintBar').textContent = 'Entrance placed on boundary';
    refreshEntranceUI();
    render();
    showToast('Entrance moved');
    return;
  }

  // Calibration: capture two world points then compute scale
  if (tool === 'calibrate') {
    calibPts.push({ wx: w2.x, wy: w2.y });
    render();
    if (calibPts.length === 1) {
      showToast('Point 1 set — click point 2');
    } else {
      finishCalibration();
    }
    return;
  }

  if (tool === 'site' && !siteClosed) {
    sitePts.push({ x: w2.x, y: w2.y });
    updateStats(); render();
  } else if (tool === 'building') {
    const b = { id: nid++, x: w2.x - defW / 2, y: w2.y - defD / 2, w: defW, h: defD, floors: defF, color: defCol };
    buildings.push(b);
    selected = b.id;
    setTool('select');
    updateStats(); render(); updateProps();
    showToast('Building placed — drag to reposition');
  }
});

canvas.addEventListener('dblclick', e => {
  if (drawingRoad) { finishRoad(); return; }
  if (drawingSuds) { finishSuds(); return; }
  if (tool === 'site' && sitePts.length >= 3 && !siteClosed) {
    siteClosed = true;
    setDefaultAccessPoint();
    setDefaultUtilities();
    road = { pts: [], width: road.width }; drawingRoad = false; // new boundary → clear road
    dwellings = []; placedDwellings = 0;                        // new boundary → clear scheme
    suds = []; sudsDraft = []; drawingSuds = false;             // new boundary → clear SuDS
    setTool('site');
    document.getElementById('hintBar').textContent = 'Site boundary closed — switch to Building tool';
    updateStats(); render();
    showToast('Site boundary closed!');
  }
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const p = cp(e);
  const f = e.deltaY < 0 ? 1.1 : 0.9;
  const wx = (p.x - panX) / zoom;
  const wy = (p.y - panY) / zoom;
  zoom  = Math.max(0.15, Math.min(10, zoom * f));
  panX  = p.x - wx * zoom;
  panY  = p.y - wy * zoom;
  render(); updateStats();
}, { passive: false });

document.addEventListener('keydown', e => {
  // Nudge the PDF underlay with arrow keys (1m, Shift = 5m). 2D only, and only
  // when nothing has focus so the sliders keep their native arrow behaviour.
  if (pdfState && view === '2d' && document.activeElement === document.body &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft')  pdfState.wx -= step;
    if (e.key === 'ArrowRight') pdfState.wx += step;
    if (e.key === 'ArrowUp')    pdfState.wy += step; // world Y increases upward
    if (e.key === 'ArrowDown')  pdfState.wy -= step;
    pdfState.georef = null; // manual fine-tune wins — a later DXF import won't snap back
    e.preventDefault();
    render();
    return;
  }

  if (e.key === 'Escape' && drawingRoad) { finishRoad(); return; }
  if (e.key === 'Escape' && drawingSuds) { finishSuds(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected && document.activeElement === document.body) delSel();
  if (e.key === 'Escape') { selected = null; updateProps(); render(); }
  if (e.key === 'b') setTool('building');
  if (e.key === 's') setTool('site');
  if (e.key === 'v') setTool('select');
});

/* ── 2D RENDER ────────────────────────────────────────────── */
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── PDF underlay — drawn first so all geometry sits on top ──
  if (pdfState) {
    const s  = w2s(pdfState.wx, pdfState.wy);  // top-left in screen coords
    const sw = pdfState.ww * SCALE * zoom;
    const sh = pdfState.wh * SCALE * zoom;
    ctx.save();
    ctx.globalAlpha = pdfState.opacity;
    ctx.drawImage(pdfState.img, s.x, s.y, sw, sh);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Calibration point markers
    calibPts.forEach((p, i) => {
      const sp = w2s(p.wx, p.wy);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,212,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle   = 'rgba(0,212,255,0.25)'; ctx.fill();
      ctx.font = '10px DM Mono'; ctx.fillStyle = 'rgba(0,212,255,0.9)';
      ctx.textAlign = 'center'; ctx.fillText('P' + (i + 1), sp.x, sp.y - 10);
    });

    // Line between the two calibration points
    if (calibPts.length === 2) {
      const sp1 = w2s(calibPts[0].wx, calibPts[0].wy);
      const sp2 = w2s(calibPts[1].wx, calibPts[1].wy);
      ctx.beginPath(); ctx.moveTo(sp1.x, sp1.y); ctx.lineTo(sp2.x, sp2.y);
      ctx.strokeStyle = 'rgba(0,212,255,0.5)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // Site boundary
  if (sitePts.length > 0) {
    ctx.save();
    ctx.beginPath();
    const s0 = w2s(sitePts[0].x, sitePts[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < sitePts.length; i++) {
      const s = w2s(sitePts[i].x, sitePts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    if (!siteClosed) {
      const sm = w2s(mw.x, mw.y);
      ctx.lineTo(sm.x, sm.y);
    } else {
      ctx.closePath();
    }
    ctx.strokeStyle = siteClosed ? 'rgba(26,108,255,0.9)' : 'rgba(26,108,255,0.6)';
    ctx.lineWidth   = 2;
    ctx.setLineDash(siteClosed ? [] : [8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (siteClosed) { ctx.fillStyle = 'rgba(26,108,255,0.055)'; ctx.fill(); }
    ctx.restore();

    // Vertex points
    sitePts.forEach((p, i) => {
      const s = w2s(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, i === 0 && sitePts.length >= 3 && !siteClosed ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle   = i === 0 && sitePts.length >= 3 && !siteClosed ? 'rgba(0,212,255,0.9)' : 'rgba(26,108,255,0.9)';
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    });

    // Dimension labels
    if (siteClosed && zoom > 0.4) {
      ctx.font      = `${Math.max(8, 9 * zoom)}px DM Mono`;
      ctx.fillStyle = 'rgba(26,108,255,0.65)';
      ctx.textAlign = 'center';
      for (let i = 0; i < sitePts.length; i++) {
        const a = sitePts[i], b = sitePts[(i + 1) % sitePts.length];
        const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2).toFixed(1);
        const ms   = w2s((a.x + b.x) / 2, (a.y + b.y) / 2);
        const ang  = Math.atan2(-(b.y - a.y), b.x - a.x);
        ctx.save();
        ctx.translate(ms.x, ms.y);
        ctx.rotate(ang);
        ctx.fillText(dist + 'm', 0, -8);
        ctx.restore();
      }
    }
  }

  // Heritage / Cuckoo Trail buffer bands (drawn over the boundary fill, under everything else)
  drawBuffers2d();

  // Attenuation SuDS areas (drawn over the buffers, under the road + homes)
  drawSuds2d();

  // Internal estate road (drawn over the boundary fill, under the access markers)
  drawRoad2d();

  // Generated homes — drawn over the road so frontages read clearly
  drawDwellings2d();

  // Access stub / visibility splay (drawn under the entrance marker)
  drawAccessStub();

  // Site access point (entrance) marker — sits on the boundary line
  if (accessPt && siteClosed) {
    const sp = w2s(accessPt.x, accessPt.y);
    ctx.save();
    // Amber filled triangle (gateway marker)
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(sp.x,         sp.y - r);
    ctx.lineTo(sp.x - r * 0.9, sp.y + r * 0.7);
    ctx.lineTo(sp.x + r * 0.9, sp.y + r * 0.7);
    ctx.closePath();
    ctx.fillStyle   = ENTRANCE_COL;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    // Label
    ctx.font         = '11px DM Mono';
    ctx.fillStyle    = ENTRANCE_COL;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Entrance', sp.x + r + 4, sp.y);
    ctx.restore();
  }

  // Service runs from utility markers to the road/scheme (under the markers)
  drawServices2d();

  // Site utility markers (sewer / water / elec) — coloured squares + labels
  if (siteClosed) {
    Object.keys(utilities).forEach(k => {
      const u = utilities[k];
      if (!u) return;
      const sp = w2s(u.x, u.y), col = UTIL_COLS[k], s = 6;
      ctx.save();
      ctx.fillStyle   = col;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.5;
      ctx.fillRect(sp.x - s, sp.y - s, s * 2, s * 2);
      ctx.strokeRect(sp.x - s, sp.y - s, s * 2, s * 2);
      ctx.font         = '10px DM Mono';
      ctx.fillStyle    = col;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(UTIL_LABELS[k], sp.x + s + 3, sp.y);
      ctx.restore();
    });
  }

  // TEMP access diagnostic overlay (one-off): raw surveyed pin + connector to boundary
  if (diagPin && siteClosed) {
    const sp = w2s(diagPin.x, diagPin.y);
    if (diagNearest) {
      const sn = w2s(diagNearest.x, diagNearest.y);
      const dm = Math.hypot(diagPin.x - diagNearest.x, diagPin.y - diagNearest.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sn.x, sn.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '11px DM Mono'; ctx.fillStyle = 'rgba(255,90,90,0.95)'; ctx.textAlign = 'center';
      ctx.fillText(dm.toFixed(0) + ' m gap', (sp.x + sn.x) / 2, (sp.y + sn.y) / 2 - 6);
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = '#ff3c3c'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sp.x - 7, sp.y); ctx.lineTo(sp.x + 7, sp.y);
    ctx.moveTo(sp.x, sp.y - 7); ctx.lineTo(sp.x, sp.y + 7);
    ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 10px DM Mono'; ctx.fillStyle = '#ff5a5a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('ACCESS PIN (surveyed)', sp.x + 11, sp.y);
    ctx.restore();
  }

  // Ghost building preview when in building mode
  if (tool === 'building') {
    const gs = w2s(mw.x - defW / 2, mw.y + defD / 2);
    const gw = defW * SCALE * zoom;
    const gh = defD * SCALE * zoom;
    ctx.save();
    ctx.fillStyle   = 'rgba(26,108,255,0.1)';
    ctx.strokeStyle = 'rgba(26,108,255,0.45)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(gs.x, gs.y - gh, gw, gh);
    ctx.strokeRect(gs.x, gs.y - gh, gw, gh);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Buildings
  buildings.forEach(b => {
    const bs    = w2s(b.x, b.y + b.h);
    const bw    = b.w * SCALE * zoom;
    const bh    = b.h * SCALE * zoom;
    const isSel = b.id === selected;

    // Glow shadow
    ctx.save();
    ctx.shadowColor = b.color;
    ctx.shadowBlur  = isSel ? 14 : 5;
    ctx.fillStyle   = b.color + '1a';
    ctx.fillRect(bs.x, bs.y, bw, bh);
    ctx.restore();

    ctx.fillStyle   = b.color + '15';
    ctx.fillRect(bs.x, bs.y, bw, bh);
    ctx.strokeStyle = isSel ? '#fff' : b.color;
    ctx.lineWidth   = isSel ? 2 : 1.5;
    ctx.strokeRect(bs.x, bs.y, bw, bh);

    // Floor lines
    const rows = Math.min(b.floors, 10);
    ctx.strokeStyle = b.color + '2a';
    ctx.lineWidth   = 0.5;
    for (let r = 1; r < rows; r++) {
      const ly = bs.y + (bh / rows) * r;
      ctx.beginPath(); ctx.moveTo(bs.x, ly); ctx.lineTo(bs.x + bw, ly); ctx.stroke();
    }

    // Labels
    if (zoom > 0.45) {
      ctx.font          = `bold ${Math.max(8, 10 * zoom)}px DM Mono`;
      ctx.fillStyle     = b.color;
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.fillText(`${b.floors}F`, bs.x + bw / 2, bs.y + bh / 2);
      if (zoom > 0.75) {
        ctx.font      = `${Math.max(7, 8 * zoom)}px DM Mono`;
        ctx.fillStyle = 'rgba(232,237,245,0.28)';
        ctx.fillText(`${b.w}×${b.h}m`, bs.x + bw / 2, bs.y + bh / 2 + 12 * zoom);
      }
    }

    // Selection handles
    if (isSel) {
      const hs = 7;
      [[bs.x, bs.y], [bs.x + bw, bs.y], [bs.x, bs.y + bh], [bs.x + bw, bs.y + bh]].forEach(([cx, cy]) => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
      });
    }
  });
}

/* ── NET DEVELOPABLE AREA SLIDER ──────────────────────────── */
function onDeductSlider() {
  deductPct = +document.getElementById('deductSlider').value;
  document.getElementById('deductPctLabel').textContent = deductPct + '%';
  updateStats();
}

/* ── 3D VIEW ──────────────────────────────────────────────── */
/* ── DWELLING MASSING HELPERS ─────────────────────────────── */

// Returns a BufferGeometry triangular prism for a pitched roof.
// Origin is at ground level (0,0,0); eave at y=eave, ridge at y=eave+rise.
// Width runs along X, depth along Z.
function makePitchedRoof(w, d, eave, rise) {
  const hw = w / 2, hd = d / 2, ry = eave + rise;
  // 10 triangles: left slope (2), right slope (2), front gable (1), back gable (1)
  const pos = new Float32Array([
    // Left slope
    -hw, eave, -hd,   0, ry, -hd,    0, ry,  hd,
    -hw, eave, -hd,   0, ry,  hd,  -hw, eave,  hd,
    // Right slope
     hw, eave, -hd,   hw, eave,  hd,   0, ry,  hd,
     hw, eave, -hd,    0, ry,  hd,    0, ry, -hd,
    // Front gable (z = -hd)
    -hw, eave, -hd,   hw, eave, -hd,   0, ry, -hd,
    // Back gable (z = +hd)
    -hw, eave,  hd,    0, ry,  hd,   hw, eave,  hd,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// Adds the entrance marker to the 3D scene: a vertical amber post + flag, with
// a canvas-texture "Entrance" sprite label (self-contained — no font loader).
function addEntrance3d(scene, cx, cz) {
  if (!accessPt || !siteClosed) return;
  const tx = accessPt.x - cx;
  const tz = -(accessPt.y - cz);
  const POST_H = 6;

  const mat  = new THREE.MeshLambertMaterial({ color: 0xff8c00 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, POST_H, 8), mat);
  post.position.set(tx, POST_H / 2, tz);
  post.castShadow = true;
  scene.add(post);

  const flag = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 0.2), mat);
  flag.position.set(tx + 1.5, POST_H - 1, tz);
  flag.castShadow = true;
  scene.add(flag);

  // "Entrance" label as a sprite (billboards toward the camera)
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 34px DM Mono, monospace';
  g.fillStyle = '#ff8c00';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Entrance', 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(12, 3, 1);
  spr.position.set(tx, POST_H + 3, tz);
  scene.add(spr);
}

// Adds the access stub / visibility splay to the 3D scene as a flat amber
// triangle lying on the ground, matching the site-mesh coordinate convention.
function addAccessStub3d(scene, cx, cz) {
  if (!accessPt || !siteClosed) return;
  const e = boundaryEdgeAt(accessPt);
  if (!e) return;
  const L = accessSplay.length, HW = accessSplay.halfWidth;
  const pts = [
    { x: accessPt.x - e.dhx * HW, y: accessPt.y - e.dhy * HW }, // mouth left
    { x: accessPt.x + e.dhx * HW, y: accessPt.y + e.dhy * HW }, // mouth right
    { x: accessPt.x + e.nx * L,   y: accessPt.y + e.ny * L },   // stub end (inward)
  ];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x - cx, pts[0].y - cz);
  shape.lineTo(pts[1].x - cx, pts[1].y - cz);
  shape.lineTo(pts[2].x - cx, pts[2].y - cz);
  shape.closePath();
  const m = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshLambertMaterial({ color: 0xff8c00, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2; // shape XY → ground XZ, same as the site slab
  m.position.y = 0.15;         // just above the 0.1 site mesh
  scene.add(m);
}

// Adds all present utility markers to the 3D scene (entrance-style posts).
function addUtilities3d(scene, cx, cz) {
  Object.keys(utilities).forEach(k => {
    if (utilities[k]) addUtilityMarker3d(scene, cx, cz, utilities[k], UTIL_COLS[k], UTIL_LABELS[k]);
  });
}

// A coloured post + cap + canvas-sprite label for one utility marker.
function addUtilityMarker3d(scene, cx, cz, pt, colorHex, label) {
  const tx = pt.x - cx, tz = -(pt.y - cz), POST_H = 5;
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colorHex) });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, POST_H, 8), mat);
  post.position.set(tx, POST_H / 2, tz);
  post.castShadow = true;
  scene.add(post);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat);
  cap.position.set(tx, POST_H + 0.8, tz);
  cap.castShadow = true;
  scene.add(cap);

  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 30px DM Mono, monospace';
  g.fillStyle = colorHex;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(10, 2.5, 1);
  spr.position.set(tx, POST_H + 3, tz);
  scene.add(spr);
}

let r3, s3, cam3, anim3;
let theta = 45, phi = 40, radius = 200;
let target3 = { x: 0, y: 0, z: 0 }; // camera look-at target — moved by panning

function setView(v) {
  view = v;
  document.getElementById('btn2d').classList.toggle('active', v === '2d');
  document.getElementById('btn3d').classList.toggle('active', v === '3d');
  canvas.style.display = v === '2d' ? 'block' : 'none';
  const c3 = document.getElementById('c3d');
  c3.style.display = v === '3d' ? 'block' : 'none';
  const h3 = document.getElementById('hint3d');
  if (h3) h3.style.display = v === '3d' ? 'block' : 'none';
  if (v === '3d') build3d();
  else if (anim3) { cancelAnimationFrame(anim3); anim3 = null; }
}

/* ── VEGETATION (rendered) — hedgerows + billboard trees ──── */
function makeTree3d(tx, tz, scale) {
  const g = new THREE.Group();
  const th = 3 * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.38 * scale, th, 6),
    new THREE.MeshStandardMaterial({ color: 0x5b4327, roughness: 0.9 }));
  trunk.position.set(tx, th / 2, tz); trunk.castShadow = true; g.add(trunk);
  const mat = new THREE.MeshLambertMaterial({ map: texCanopy(), transparent: true,
    alphaTest: 0.35, side: THREE.DoubleSide });
  const cw = 6 * scale, ch = 5.5 * scale;
  for (const ry of [0, Math.PI / 2]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), mat);
    p.position.set(tx, th + ch / 2 - 0.6, tz); p.rotation.y = ry; p.castShadow = true;
    g.add(p);
  }
  return g;
}

// Retained hedgerow along every boundary edge, offset just inside the line.
function addHedgerow3d(scene, cx, cz) {
  const cxp = sitePts.reduce((s, p) => s + p.x, 0) / sitePts.length;
  const cyp = sitePts.reduce((s, p) => s + p.y, 0) / sitePts.length;
  const mat = new THREE.MeshStandardMaterial({ color: 0x3c5a2e, roughness: 1.0 });
  for (let i = 0; i < sitePts.length; i++) {
    const a = sitePts[i], b = sitePts[(i + 1) % sitePts.length];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 3) continue;
    let nx = -dy / len, ny = dx / len;
    const mxp = (a.x + b.x) / 2, myp = (a.y + b.y) / 2;
    if (nx * (cxp - mxp) + ny * (cyp - myp) < 0) { nx = -nx; ny = -ny; }
    const off = 1.8;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len - 1, 1.7, 1.3), mat);
    m.position.set(mxp + nx * off - cx, 0.85, -(myp + ny * off - cz));
    m.rotation.y = Math.atan2(dy, dx);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
}

// Trees scattered through the heritage/Cuckoo buffers + a few outside the site.
function addTrees3d(scene, cx, cz) {
  const b = boundaryBounds();
  const r = _rng(101);
  let placed = 0;
  // buffer-band trees (inside boundary, in the E/W no-build bands)
  for (let y = b.yMin + 6; y <= b.yMax - 6 && placed < 60; y += 9) {
    for (const band of [maxBandX(b, 'E'), maxBandX(b, 'W')]) {
      const x = band + (r() - 0.5) * 6;
      if (pointInBoundary(x, y) && distToBoundary(x, y) > 1 && !inAnySuds(x, y)) {
        scene.add(makeTree3d(x - cx, -(y - cz), 0.9 + r() * 0.6)); placed++;
      }
    }
  }
  // a light scatter of context trees just outside the boundary
  for (let i = 0; i < 40; i++) {
    const x = b.xMin - 20 + r() * (b.xMax - b.xMin + 40);
    const y = b.yMin - 20 + r() * (b.yMax - b.yMin + 40);
    if (!pointInBoundary(x, y) && Math.abs(x) < 260 && Math.abs(y) < 260) {
      scene.add(makeTree3d(x - cx, -(y - cz), 1.0 + r() * 0.8));
    }
  }
}
function maxBandX(b, side) {
  return side === 'E' ? b.xMax - genParams.bufferE * 0.5 : b.xMin + genParams.bufferW * 0.5;
}

function addVegetation3d(scene, cx, cz) {
  if (renderStyle !== 'rendered' || !siteClosed || sitePts.length < 3) return;
  addHedgerow3d(scene, cx, cz);
  addTrees3d(scene, cx, cz);
}

/* ── BLENDER LANDSCAPE (.glb) ─────────────────────────────── */
// A high-quality landscape built in Blender from the exported scheme
// (blender/build_landscape.py → blender/landscape.glb). When shown it replaces
// the procedural ground/slab/road/homes/SuDS; app markers stay overlaid.
let blenderModel = null;
let showBlender  = false;

function toggleBlenderLandscape() {
  if (blenderModel) { // already loaded → just toggle visibility
    showBlender = !showBlender;
    updateBlenderBtn();
    if (view !== '3d') setView('3d'); else build3d();
    return;
  }
  if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
    showToast('GLTFLoader not available'); return;
  }
  const status = document.getElementById('blenderStatus');
  if (status) { status.textContent = 'Loading…'; status.className = 'pdf-status'; }
  new THREE.GLTFLoader().load('/blender/landscape.glb', gltf => {
    blenderModel = gltf.scene;
    blenderModel.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    showBlender = true;
    if (status) { status.textContent = 'Loaded ✓'; status.className = 'pdf-status calibrated'; }
    updateBlenderBtn();
    if (view !== '3d') setView('3d'); else build3d();
    showToast('Blender landscape loaded');
  }, undefined, () => {
    if (status) { status.textContent = 'Load failed — build it first'; status.className = 'pdf-status'; }
    showToast('Could not load landscape.glb — run blender/build_landscape.py');
  });
}

function updateBlenderBtn() {
  const b = document.getElementById('blenderBtn');
  if (!b) return;
  b.classList.toggle('active', showBlender);
  b.textContent = showBlender ? '▼ Hide Blender landscape'
    : (blenderModel ? '▲ Show Blender landscape' : '▲ Load Blender landscape');
}

// Export the current scheme as blender/scene.json input (centroid-relative site
// coords). Save it into the repo's blender/ folder, then run build_landscape.py.
function exportSceneJSON() {
  if (!siteClosed || sitePts.length < 3) { showToast('Close a boundary first'); return; }
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const wallHex = {}, roofHex = {}, sudsHex = {};
  Object.keys(WALL_MATERIALS).forEach(k => wallHex[k] = hex(WALL_MATERIALS[k].color));
  Object.keys(ROOF_MATERIALS).forEach(k => roofHex[k] = hex(ROOF_MATERIALS[k].color));
  Object.keys(SUDS_TYPES).forEach(k => sudsHex[k] = SUDS_TYPES[k].color);
  const scene = {
    boundary: sitePts.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]),
    road: { centre: roadCenterline().map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]), width: road.width },
    dwellings: dwellings.map(d => ({ cx: +d.cx.toFixed(2), cy: +d.cy.toFixed(2), rot: +d.rot.toFixed(4),
      w: d.w, d: d.d, storeys: d.storeys, walls: d.walls, roof: d.roof })),
    suds: suds.map(f => ({ type: f.type, pts: f.pts.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]) })),
    buffers: { bufferE: genParams.bufferE, bufferW: genParams.bufferW },
    materials: { walls: wallHex, roofs: roofHex, suds: sudsHex },
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' }));
  a.download = 'scene.json';
  a.click();
  showToast('scene.json exported — move to /blender, run build_landscape.py, then Load');
}

function build3d() {
  const wrap = document.getElementById('c3d');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  const useBlender = showBlender && !!blenderModel;

  if (!r3) {
    r3 = new THREE.WebGLRenderer({ antialias: true });
    r3.setPixelRatio(devicePixelRatio);
    r3.setClearColor(0x3d3d3d, 1);
    r3.shadowMap.enabled = true;
    wrap.appendChild(r3.domElement);
    cam3 = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);

    // Camera = look-at target + spherical offset; orbit rotates around target3.
    function updCam() {
      const tr = theta * Math.PI / 180, pr = phi * Math.PI / 180;
      cam3.position.set(
        target3.x + Math.sin(tr) * Math.cos(pr) * radius,
        target3.y + Math.sin(pr) * radius,
        target3.z + Math.cos(tr) * Math.cos(pr) * radius
      );
      cam3.lookAt(target3.x, target3.y, target3.z);
    }
    updCam();

    // Drag: right-button or Shift+left pans the target; plain left orbits.
    let od = false, mode = 'orbit', os = { x: 0, y: 0 };
    r3.domElement.addEventListener('mousedown', e => {
      od = true;
      mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
      os = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => od = false);
    window.addEventListener('mousemove', e => {
      if (!od) return;
      const dx = e.clientX - os.x, dy = e.clientY - os.y;
      if (mode === 'pan') {
        // Grab-pan across the ground plane; 1:1 with the cursor at this zoom.
        const tr  = theta * Math.PI / 180;
        const hPx = r3.domElement.clientHeight || 1;
        const wpp = 2 * radius * Math.tan((cam3.fov * Math.PI / 180) / 2) / hPx;
        const rX = Math.cos(tr),  rZ = -Math.sin(tr); // screen-right on the ground
        const fX = -Math.sin(tr), fZ = -Math.cos(tr); // ground-forward (into screen)
        // Grab-consistent on both axes (matches the 2D plan pan): dragging moves
        // the scene with the cursor.
        target3.x += (-rX * dx + fX * dy) * wpp;
        target3.z += (-rZ * dx + fZ * dy) * wpp;
      } else {
        theta -= dx * 0.4;
        phi = Math.max(5, Math.min(85, phi - dy * 0.4));
      }
      os = { x: e.clientX, y: e.clientY };
      updCam();
    });
    // Suppress the browser context menu so right-drag can pan.
    r3.domElement.addEventListener('contextmenu', e => e.preventDefault());
    // Plain scroll and Ctrl+scroll both zoom; preventDefault stops page zoom/scroll.
    r3.domElement.addEventListener('wheel', e => {
      e.preventDefault();
      radius = Math.max(20, Math.min(700, radius + e.deltaY * 0.5));
      updCam();
    }, { passive: false });
  }

  r3.setSize(w, h);
  cam3.aspect = w / h;
  cam3.updateProjectionMatrix();

  // Per-style renderer settings
  r3.shadowMap.enabled = (renderStyle === 'rendered');
  r3.shadowMap.type    = THREE.PCFSoftShadowMap;
  r3.toneMapping       = (renderStyle === 'rendered') ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  r3.toneMappingExposure = 0.98;
  if ('outputEncoding' in r3) r3.outputEncoding = THREE.sRGBEncoding; // three r128

  s3 = new THREE.Scene();
  if (renderStyle === 'rendered') {
    s3.background = skyEquirect();          // gradient sky with sun glow
    s3.environment = envMap(r3);            // IBL: realistic PBR reflections + ambient
    s3.fog = new THREE.Fog(0xcdddf0, 620, 1700);
    s3.add(new THREE.HemisphereLight(0xdff0ff, 0x4a3b28, 0.45)); // sky + earth bounce
    const sun = new THREE.DirectionalLight(0xffedc4, 1.7);       // warm sun, low for long shadows
    sun.position.set(190, 125, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 800;
    sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
    sun.shadow.bias = -0.0003; sun.shadow.radius = 3;
    s3.add(sun);
  } else if (renderStyle === 'hybrid') {
    s3.background = new THREE.Color(0xe7ebef);
    s3.fog = null;
    s3.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a6, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(120, 210, 90);
    s3.add(sun);
    s3.add(new THREE.AmbientLight(0xffffff, 0.4));
  } else { // pencil — flat, shadeless paper look
    s3.background = new THREE.Color(0xf7f5ef);
    s3.fog = null;
    s3.add(new THREE.AmbientLight(0xffffff, 1.0));
  }

  // Ground plane (grass / paper) under everything — skipped when the Blender
  // landscape supplies its own terrain.
  if (!useBlender) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600),
      styleSurface(0x6f8a52, { rough: 1.0, pencil: 0xf7f5ef, tex: renderStyle === 'rendered' ? texGrass() : null }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = (renderStyle === 'rendered');
    s3.add(ground);
  }

  const cx = sitePts.length ? sitePts.reduce((s, p) => s + p.x, 0) / sitePts.length : 0;
  const cz = sitePts.length ? sitePts.reduce((s, p) => s + p.y, 0) / sitePts.length : 0;

  if (siteClosed && sitePts.length >= 3) {
    const shape = new THREE.Shape();
    shape.moveTo(sitePts[0].x - cx, sitePts[0].y - cz);
    for (let i = 1; i < sitePts.length; i++) shape.lineTo(sitePts[i].x - cx, sitePts[i].y - cz);
    shape.closePath();
    if (!useBlender) {
      const geo = new THREE.ShapeGeometry(shape);
      const m   = new THREE.Mesh(geo, styleSurface(0x86a05e, { rough: 1.0, side: THREE.DoubleSide, pencil: 0xefede4, tex: renderStyle === 'rendered' ? texGrass() : null }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.1;
      m.receiveShadow = (renderStyle === 'rendered');
      s3.add(m);
    }
    const pts3 = sitePts.map(p => new THREE.Vector3(p.x - cx, 0.2, -(p.y - cz)));
    pts3.push(pts3[0].clone());
    const bCol = renderStyle === 'pencil' ? 0x2b2b2b : 0x1a6cff;
    s3.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3),
      new THREE.LineBasicMaterial({ color: bCol })));
  }

  buildings.forEach(b => {
    const bx  = b.x + b.w / 2 - cx;
    const bz2 = -(b.y + b.h / 2 - cz);
    const bh3 = b.floors * 3;
    const geo  = new THREE.BoxGeometry(b.w, bh3, b.h);
    const col  = new THREE.Color(b.color);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
    mesh.position.set(bx, bh3 / 2, bz2);
    s3.add(mesh);
    const el = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.35 }));
    el.position.copy(mesh.position);
    s3.add(el);
    for (let f = 1; f < b.floors; f++) {
      const y   = f * 3;
      const pts = [
        new THREE.Vector3(bx - b.w / 2, y, bz2 - b.h / 2),
        new THREE.Vector3(bx + b.w / 2, y, bz2 - b.h / 2),
        new THREE.Vector3(bx + b.w / 2, y, bz2 + b.h / 2),
        new THREE.Vector3(bx - b.w / 2, y, bz2 + b.h / 2),
        new THREE.Vector3(bx - b.w / 2, y, bz2 - b.h / 2)
      ];
      s3.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: b.color, transparent: true, opacity: 0.12 })));
    }
  });

  if (useBlender) {
    blenderModel.position.set(0, 0, 0);
    s3.add(blenderModel); // Blender terrain/road/homes/SuDS in place of the procedural set
  } else {
    addSuds3d(s3, cx, cz);
    addDwellings3d(s3, cx, cz);
    addRoad3d(s3, cx, cz);
    addDriveways3d(s3, cx, cz);
    addVegetation3d(s3, cx, cz);
  }
  addEntrance3d(s3, cx, cz);
  addAccessStub3d(s3, cx, cz);
  addUtilities3d(s3, cx, cz);
  addServices3d(s3, cx, cz);
  updateStats(); // reflect placed dwelling count + density in the stats panel

  if (anim3) cancelAnimationFrame(anim3);
  function loop() { anim3 = requestAnimationFrame(loop); r3.render(s3, cam3); }
  loop();
}

/* ── CLEAR ALL ────────────────────────────────────────────── */
function clearAll() {
  if (!confirm('Clear everything?')) return;
  sitePts = []; siteClosed = false; buildings = []; selected = null;
  placedDwellings = 0; dwellings = [];
  suds = []; sudsDraft = []; drawingSuds = false;
  accessPt = null; movingEntrance = false;
  utilities = { sewer: null, water: null, elec: null }; movingUtility = null;
  road = { pts: [], width: road.width }; drawingRoad = false;
  updateStats(); render(); updateProps(); setTool('site');
}

/* ── JSON EXPORT ──────────────────────────────────────────── */
function exportData() {
  const sA   = siteClosed && sitePts.length >= 3 ? Math.round(polyArea(sitePts)) : 0;
  const data = {
    project:   'ArchForm',
    date:      new Date().toISOString(),
    site:      { points: sitePts, area: sA },
    buildings: buildings.map(b => ({ ...b, gfa: Math.round(b.w * b.h * b.floors) })),
    stats:     { gfa: buildings.reduce((s, b) => s + Math.round(b.w * b.h * b.floors), 0), buildings: buildings.length }
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'archform.json';
  a.click();
  showToast('Exported as JSON');
}

/* ── SAVE PROJECT ─────────────────────────────────────────── */
function saveEditorProject() {
  if (sitePts.length === 0 && buildings.length === 0) { showToast('Nothing to save yet'); return; }
  const name = prompt('Project name:', 'Site Layout ' + new Date().toLocaleDateString());
  if (!name) return;
  const sA  = siteClosed && sitePts.length >= 3 ? Math.round(polyArea(sitePts)) : 0;
  const gfa = buildings.reduce((s, b) => s + Math.round(b.w * b.h * b.floors), 0);
  addProject({
    id:          Date.now().toString(),
    name,
    created:     new Date().toISOString(),
    type:        'editor',
    stats:       { gfa, buildings: buildings.length, siteArea: sA, floors: buildings.length ? Math.max(...buildings.map(b => b.floors)) : 0 },
    editorState: { sitePts, siteClosed, buildings, defW, defD, defF, accessPt, accessSplay, road, utilities, deductPct, dwellings, genParams, suds, renderStyle }
  });
  showToast('Project saved!');
}

/* ── SEND TO DESIGNER ─────────────────────────────────────── */
function sendToDesigner() {
  if (!siteClosed && sitePts.length < 3 && buildings.length === 0) {
    showToast('Draw a site or place buildings first');
    return;
  }
  const sA  = siteClosed && sitePts.length >= 3 ? Math.round(polyArea(sitePts)) : 0;
  const gfa = buildings.reduce((s, b) => s + Math.round(b.w * b.h * b.floors), 0);
  const maxF = buildings.length ? Math.max(...buildings.map(b => b.floors)) : defF;
  const far  = sA > 0 ? (gfa / sA).toFixed(2) : '2.5';

  // Rough unit-mix heuristic based on building height
  let studio = 0, two = 0, three = 0, pent = 0;
  buildings.forEach(b => {
    const total = Math.max(1, Math.round(b.w * b.h / 35)) * b.floors;
    if      (b.floors >= 15) { pent += 2; three += Math.round(total * 0.3); two += Math.round(total * 0.5); studio += Math.round(total * 0.2); }
    else if (b.floors >= 8)  { three += Math.round(total * 0.25); two += Math.round(total * 0.5); studio += Math.round(total * 0.25); }
    else                     { two += Math.round(total * 0.5); three += Math.round(total * 0.3); studio += Math.round(total * 0.2); }
  });

  const payload = {
    siteArea: sA || Math.round(defW * defD * 4),
    far:      parseFloat(far),
    floors:   maxF,
    gfa,
    studio:   Math.max(0, studio),
    two:      Math.max(1, two),
    three:    Math.max(0, three),
    pent,
    buildingCount: buildings.length,
    siteShape: sitePts.length === 4 ? 'Rectangular' : sitePts.length > 4 ? 'Irregular' : 'Rectangular',
    fromEditor: true
  };

  setEditorSession(payload);
  const p = new URLSearchParams({
    siteArea: payload.siteArea, far: payload.far, floors: payload.floors,
    studio:   payload.studio,   two: payload.two, three: payload.three, pent: payload.pent,
    siteShape: payload.siteShape, fromEditor: '1'
  });
  window.location.href = 'designer.html?' + p.toString();
}

/* ── PDF AUTO-GEOREFERENCING (OSGB grid labels) ───────────── */

// Scans page-1 vector text for OSGB grid coordinate labels (e.g. "558500.000")
// and derives the page's real-world frame: metres per rendered-canvas pixel in
// x/y plus the OSGB easting/northing at the canvas's left/top edges.
// Returns { E0, N0, mppX, mppY } or null if no usable grid is found.
async function extractOsgbGeoref(page, viewport) {
  const tc = await page.getTextContent();
  const eastings = [], northings = []; // {p: canvas px, v: OSGB value}

  tc.items.forEach(it => {
    const str = (it.str || '').trim();
    if (!/^\d{6}\.\d{3}$/.test(str)) return;
    const v = parseFloat(str);
    // Use the label's CENTRE, not its anchor — anchors sit offset from the
    // gridline they mark, which biased the fit by a constant few metres.
    // Half-width along the text run direction, half-height perpendicular;
    // for unrotated labels this is exactly (x + width/2, y + height/2).
    const [a, b, c, d, e, f] = it.transform;
    const lx  = Math.hypot(a, b) || 1;
    const ly  = Math.hypot(c, d) || 1;
    const cxU = e + (a / lx) * (it.width / 2) + (c / ly) * (it.height / 2);
    const cyU = f + (b / lx) * (it.width / 2) + (d / ly) * (it.height / 2);
    // convertToViewportPoint applies the 2.0 render scale and the PDF y-flip,
    // giving offscreen-canvas pixel coords (origin top-left, y down).
    const [vx, vy] = viewport.convertToViewportPoint(cxU, cyU);
    if      (v >= 400000 && v < 700000) eastings.push({ p: vx, v });  // ~558xxx → E
    else if (v >= 1      && v < 200000) northings.push({ p: vy, v }); // ~106xxx → N
  });

  // Least-squares fit v = m·p + c along one axis; null without spread.
  function fit(pts) {
    if (pts.length < 2) return null;
    const n  = pts.length;
    const pm = pts.reduce((s, q) => s + q.p, 0) / n;
    const vm = pts.reduce((s, q) => s + q.v, 0) / n;
    let num = 0, den = 0;
    pts.forEach(q => { num += (q.p - pm) * (q.v - vm); den += (q.p - pm) ** 2; });
    if (den < 1) return null; // labels all at (nearly) the same position
    const m = num / den;
    return { m, c: vm - m * pm };
  }

  const fx = fit(eastings);
  const fy = fit(northings);
  if (!fx || !fy) return null;

  const mppX = fx.m, mppY = fy.m;
  // Sanity: north-up plan (E grows right, N shrinks down the canvas),
  // plausible survey scale, roughly square pixels.
  if (!isFinite(mppX) || !isFinite(mppY)) return null;
  if (mppX <= 0 || mppY >= 0) return null;
  if (mppX < 0.001 || mppX > 10) return null;
  if (Math.abs(mppY) < 0.001 || Math.abs(mppY) > 10) return null;
  if (Math.abs(mppX / Math.abs(mppY) - 1) > 0.1) return null;

  return { E0: fx.c, N0: fy.c, mppX, mppY };
}

// Re-position a georeferenced PDF underlay so its OSGB frame coincides with
// the DXF boundary's (editor world coords = OSGB minus dxfOrigin).
function alignPdfToDxf() {
  if (!pdfState || !pdfState.georef || !dxfOrigin) return;
  const g = pdfState.georef;
  pdfState.ww = pdfState.img.width  * g.mppX;
  pdfState.wh = pdfState.img.height * Math.abs(g.mppY);
  pdfState.wx = g.E0 - dxfOrigin.e; // world x of the canvas's left edge
  pdfState.wy = g.N0 - dxfOrigin.n; // world y of the top edge (canvas y = 0)
  render();
}

/* ── PDF IMPORT ───────────────────────────────────────────── */
function loadPDF(input) {
  const file = input.files[0];
  if (!file) return;

  // Graceful fallback if pdf.js CDN failed to load
  if (typeof pdfjsLib === 'undefined') {
    showToast('pdf.js not available — check network connection');
    return;
  }

  const status = document.getElementById('pdfStatus');
  status.textContent = 'Loading…';
  status.className   = 'pdf-status';

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const pdfDoc = await pdfjsLib.getDocument({ data: ev.target.result }).promise;
      const page   = await pdfDoc.getPage(1);

      // Render page at 2× scale for clarity
      const viewport  = page.getViewport({ scale: 2.0 });
      const offCanvas = document.createElement('canvas');
      offCanvas.width  = viewport.width;
      offCanvas.height = viewport.height;
      await page.render({ canvasContext: offCanvas.getContext('2d'), viewport }).promise;

      // Try automatic georeferencing from printed OSGB grid labels
      let georef = null;
      try { georef = await extractOsgbGeoref(page, viewport); } catch (e) { georef = null; }

      const viewCX = (canvas.width  / 2 - panX) / (SCALE * zoom);
      const viewCY = -((canvas.height / 2 - panY) / (SCALE * zoom));

      if (georef) {
        // True size from the grid scale; align to DXF frame if one is loaded,
        // otherwise centre on viewport (re-aligned later by alignPdfToDxf).
        const ww = offCanvas.width  * georef.mppX;
        const wh = offCanvas.height * Math.abs(georef.mppY);
        const wx = dxfOrigin ? georef.E0 - dxfOrigin.e : viewCX - ww / 2;
        const wy = dxfOrigin ? georef.N0 - dxfOrigin.n : viewCY + wh / 2;
        pdfState = { img: offCanvas, wx, wy, ww, wh, opacity: 0.35, georef };
        status.textContent = 'Auto-georeferenced ✓ (OSGB grid)';
        status.className   = 'pdf-status calibrated';
        showToast(dxfOrigin ? 'Plan georeferenced and aligned to DXF boundary'
                            : 'Plan auto-georeferenced from OSGB grid');
      } else {
        // No grid text — place centred at ~80% viewport width, manual Calibrate available
        const viewWM = canvas.width / (SCALE * zoom);
        const aspect = offCanvas.width / offCanvas.height;
        const ww     = viewWM * 0.8;
        const wh     = ww / aspect;
        pdfState = {
          img:     offCanvas,
          wx:      viewCX - ww / 2,
          wy:      viewCY + wh / 2,  // world Y of top-left (Y increases upward)
          ww,
          wh,
          opacity: 0.35
        };
        status.textContent = 'No grid found — use Calibrate Scale';
        status.className   = 'pdf-status loaded';
        showToast('Plan imported — use Calibrate to set scale');
      }

      calibPts = [];
      document.getElementById('pdfControls').style.display = 'flex';
      document.getElementById('pdfOpacity').value          = '35';
      document.getElementById('pdfOpacityVal').textContent = '35%';
      render();
      // TEMP one-off: re-run the access diagnostic now the underlay is present
      if (DIAG_ACCESS && pdfState && pdfState.georef && dxfOrigin) runAccessDiagnostic();
    } catch (err) {
      status.textContent = 'Failed to load PDF';
      status.className   = 'pdf-status';
      showToast('Could not read PDF: ' + err.message);
    }
  };
  reader.onerror = () => showToast('File read error');
  reader.readAsArrayBuffer(file);

  // Reset so the same file can be re-selected if needed
  input.value = '';
}

function clearPDF() {
  pdfState    = null;
  calibPts    = [];
  calibrating = false;
  if (tool === 'calibrate') setTool('site');
  document.getElementById('pdfStatus').textContent  = 'No plan loaded';
  document.getElementById('pdfStatus').className    = 'pdf-status';
  document.getElementById('pdfControls').style.display = 'none';
  render();
  showToast('Plan removed');
}

function setPdfOpacity(val) {
  if (!pdfState) return;
  pdfState.opacity = +val / 100;
  document.getElementById('pdfOpacityVal').textContent = val + '%';
  render();
}

/* ── CALIBRATION ──────────────────────────────────────────── */
function startCalibration() {
  if (!pdfState) return;
  calibPts    = [];
  calibrating = true;
  setTool('calibrate');
}

function finishCalibration() {
  const [p1, p2] = calibPts;
  const dCurr = Math.sqrt((p2.wx - p1.wx) ** 2 + (p2.wy - p1.wy) ** 2);

  if (dCurr < 0.001) {
    showToast('Points too close — try again');
    calibPts = [];
    return;
  }

  const input = prompt(
    'Real-world distance between these two points (metres):\n' +
    '(Current display distance: ' + dCurr.toFixed(2) + 'm)'
  );
  const dReal = parseFloat(input);

  if (!input || isNaN(dReal) || dReal <= 0) {
    showToast('Calibration cancelled');
    calibPts    = [];
    calibrating = false;
    setTool('site');
    return;
  }

  const k = dReal / dCurr;

  // Position of point 1 relative to PDF top-left (0–1 range)
  const relX = (p1.wx - pdfState.wx) / pdfState.ww;
  const relY = (pdfState.wy - p1.wy) / pdfState.wh;

  // Rescale PDF
  pdfState.ww *= k;
  pdfState.wh *= k;

  // Reposition so point 1 stays fixed at its world location
  pdfState.wx = p1.wx - relX * pdfState.ww;
  pdfState.wy = p1.wy + relY * pdfState.wh;

  // Manual calibration overrides auto-georeferencing for good — drop the
  // georef so a later DXF import can't snap the plan back.
  pdfState.georef = null;

  calibPts    = [];
  calibrating = false;

  const status = document.getElementById('pdfStatus');
  status.textContent = 'Calibrated — ' + dReal + 'm ref';
  status.className   = 'pdf-status calibrated';

  setTool('site');
  render();
  showToast('Scale set: ' + dReal + 'm reference applied');
}

/* ── DXF IMPORT ───────────────────────────────────────────── */

/**
 * Minimal ASCII DXF parser — supports LWPOLYLINE and legacy POLYLINE/VERTEX.
 * Returns { vertices: [[x, y], ...], closed: bool } or null if nothing found.
 * No external library required.
 */
function parseDXFPolyline(text) {
  // Build code-value pairs from the flat line stream
  // Normalise line endings — strip \r so Windows CRLF never misaligns pairs
  const lines = text.replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push([lines[i].trim(), lines[i + 1].trim()]);
  }

  // ── LWPOLYLINE (preferred, modern format) ───────────────────
  for (let i = 0; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (code !== '0' || val !== 'LWPOLYLINE') continue;

    let vertices = [], closed = false, cx = null;
    for (let j = i + 1; j < pairs.length; j++) {
      const [c, v] = pairs[j];
      if (c === '0') break;                          // next entity — stop
      if (c === '70') closed = (parseInt(v) & 1) === 1;
      if (c === '10') cx = parseFloat(v);
      if (c === '20' && cx !== null) { vertices.push([cx, parseFloat(v)]); cx = null; }
    }
    if (vertices.length >= 3) return { vertices, closed };
  }

  // ── Legacy POLYLINE / VERTEX ─────────────────────────────────
  for (let i = 0; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (code !== '0' || val !== 'POLYLINE') continue;

    // Read closed flag from POLYLINE header
    let closed = false;
    for (let j = i + 1; j < pairs.length; j++) {
      const [c, v] = pairs[j];
      if (c === '0') break;
      if (c === '70') { closed = (parseInt(v) & 1) === 1; break; }
    }

    // Collect VERTEX entities until SEQEND
    const vertices = [];
    for (let j = i + 1; j < pairs.length; j++) {
      const [c, v] = pairs[j];
      if (c === '0' && v === 'SEQEND') break;
      if (c === '0' && v === 'VERTEX') {
        let vx = null, vy = null;
        for (let k = j + 1; k < pairs.length; k++) {
          const [vc, vv] = pairs[k];
          if (vc === '0') break;
          if (vc === '10') vx = parseFloat(vv);
          if (vc === '20') vy = parseFloat(vv);
        }
        if (vx !== null && vy !== null) vertices.push([vx, vy]);
      }
    }
    if (vertices.length >= 3) return { vertices, closed };
  }

  return null; // no usable polyline found
}

/**
 * Check if the last vertex physically coincides with the first (tolerance 0.01m).
 * Used to detect implicit closure when the DXF closed flag is 0.
 */
function isImplicitlyClosed(vertices) {
  if (vertices.length < 3) return false;
  const [x1, y1] = vertices[0];
  const [xN, yN] = vertices[vertices.length - 1];
  return Math.sqrt((xN - x1) ** 2 + (yN - y1) ** 2) < 0.01;
}

/**
 * Zoom and pan so the imported boundary fills ~75% of the canvas.
 * @param {Array<{x,y}>} pts  sitePts array (centroid-relative world metres)
 */
function fitViewToBoundary(pts) {
  if (!pts.length) return;
  const xs  = pts.map(p => p.x);
  const ys  = pts.map(p => p.y);
  const bbW = Math.max(...xs) - Math.min(...xs);
  const bbH = Math.max(...ys) - Math.min(...ys);

  // Choose zoom to fit bounding box at 75% of canvas dimension
  const zX = (canvas.width  * 0.75) / ((bbW || 1) * SCALE);
  const zY = (canvas.height * 0.75) / ((bbH || 1) * SCALE);
  zoom = Math.max(0.15, Math.min(8, Math.min(zX, zY)));

  // Centre pan on bounding box centroid
  // (since coords are centroid-relative, the centroid ≈ 0,0 — pan to canvas centre)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  panX = canvas.width  / 2 - cx * SCALE * zoom;
  panY = canvas.height / 2 + cy * SCALE * zoom;
}

function loadDXF(input) {
  const file = input.files[0];
  if (!file) return;

  const status = document.getElementById('dxfStatus');
  status.textContent = 'Reading…';
  status.className   = 'pdf-status';

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const result = parseDXFPolyline(ev.target.result);

      if (!result || result.vertices.length < 3) {
        status.textContent = 'No valid polyline found';
        status.className   = 'pdf-status';
        showToast('DXF: no LWPOLYLINE or POLYLINE with 3+ vertices found');
        return;
      }

      const { vertices, closed } = result;

      // Subtract centroid so OSGB-scale coords map safely into editor world space.
      // Area and edge lengths are translation-invariant — stats remain accurate.
      const cx = vertices.reduce((s, v) => s + v[0], 0) / vertices.length;
      const cy = vertices.reduce((s, v) => s + v[1], 0) / vertices.length;

      sitePts    = vertices.map(([x, y]) => ({ x: x - cx, y: y - cy }));
      siteClosed = closed || isImplicitlyClosed(vertices);
      dxfOrigin  = { e: cx, n: cy }; // OSGB centroid — lets a georeferenced PDF align to this frame

      setDefaultAccessPoint(); // entrance defaults to the new southern tip
      setDefaultUtilities();   // utilities reset to surveyed defaults on re-import
      road = { pts: [], width: road.width }; drawingRoad = false; // new boundary → clear road
      dwellings = []; placedDwellings = 0;                        // new boundary → clear scheme
      suds = []; sudsDraft = []; drawingSuds = false;             // new boundary → clear SuDS
      fitViewToBoundary(sitePts);
      updateStats();
      render();
      if (view === '3d') build3d(); // refresh 3D so it tracks the imported boundary
      alignPdfToDxf();              // snap an already-georeferenced PDF under the boundary
      generateScheme();             // seed a buffer-aware scheme (grid until a road is drawn)
      if (DIAG_ACCESS) runAccessDiagnostic(); // TEMP one-off measurement (console)

      const areaHa = (polyArea(sitePts) / 10000).toFixed(2);
      const ptCount = vertices.length;
      status.textContent = `${file.name}  ·  ${ptCount} pts  ·  ${areaHa} ha`;
      status.className   = 'pdf-status calibrated'; // green
      document.getElementById('dxfControls').style.display = 'flex';

      if (!siteClosed) {
        showToast(`DXF imported — boundary not closed, check geometry`);
      } else {
        showToast(`DXF loaded — ${ptCount} vertices, ${areaHa} ha`);
      }
    } catch (err) {
      status.textContent = 'Failed to parse DXF';
      status.className   = 'pdf-status';
      showToast('DXF parse error: ' + err.message);
    }
  };

  reader.onerror = () => showToast('File read error');
  reader.readAsText(file);
  input.value = ''; // allow re-selecting the same file
}

function clearDXFBoundary() {
  sitePts    = [];
  siteClosed = false;
  placedDwellings = 0; dwellings = [];
  suds = []; sudsDraft = []; drawingSuds = false;
  accessPt = null; movingEntrance = false;
  utilities = { sewer: null, water: null, elec: null }; movingUtility = null;
  road = { pts: [], width: road.width }; drawingRoad = false;
  dxfOrigin = null;
  document.getElementById('dxfStatus').textContent  = 'No boundary loaded';
  document.getElementById('dxfStatus').className    = 'pdf-status';
  document.getElementById('dxfControls').style.display = 'none';
  updateStats();
  render();
  if (view === '3d') build3d(); // refresh 3D so the cleared boundary is reflected
  showToast('Boundary cleared');
}

/* ── INIT ─────────────────────────────────────────────────── */
resize();
ud();
updateStats();
updateProps();

// If arriving from the projects page with a saved state, load it.
if (new URLSearchParams(window.location.search).get('load')) {
  const saved = getEditorLoadState();
  if (saved) {
    sitePts    = saved.sitePts    || [];
    siteClosed = saved.siteClosed || false;
    buildings  = saved.buildings  || [];
    defW = saved.defW || 20;
    defD = saved.defD || 14;
    defF = saved.defF || 6;
    nid  = buildings.length ? Math.max(...buildings.map(b => b.id)) + 1 : 1;
    accessPt = saved.accessPt || null;
    if (!accessPt && siteClosed && sitePts.length >= 3) setDefaultAccessPoint();
    accessSplay = saved.accessSplay || { length: 20, halfWidth: 8 };
    document.getElementById('splayLenSlider').value      = accessSplay.length;
    document.getElementById('splayLenLabel').textContent = accessSplay.length + 'm';
    document.getElementById('splayWidSlider').value      = accessSplay.halfWidth * 2;
    document.getElementById('splayWidLabel').textContent = (accessSplay.halfWidth * 2) + 'm';
    utilities = saved.utilities || { sewer: null, water: null, elec: null };
    if (!saved.utilities && siteClosed && sitePts.length >= 3) setDefaultUtilities();
    road = saved.road || { pts: [], width: 5 };
    document.getElementById('roadWidthSlider').value      = road.width;
    document.getElementById('roadWidthLabel').textContent = road.width + 'm';
    deductPct = (typeof saved.deductPct === 'number') ? saved.deductPct : 25;
    document.getElementById('deductSlider').value      = deductPct;
    document.getElementById('deductPctLabel').textContent = deductPct + '%';
    // Generated scheme + parameters
    dwellings = saved.dwellings || [];
    placedDwellings = dwellings.length;
    if (saved.genParams) genParams = Object.assign(genParams, saved.genParams);
    syncGenUI();
    // Attenuation SuDS
    suds = saved.suds || [];
    sudsId = suds.reduce((m, f) => Math.max(m, f.id || 0), 0) + 1;
    // 3D presentation style
    if (saved.renderStyle && RENDER_STYLES[saved.renderStyle]) {
      renderStyle = saved.renderStyle;
      Object.keys(RENDER_STYLES).forEach(k => {
        const b = document.getElementById('rs_' + k);
        if (b) b.classList.toggle('active', k === renderStyle);
      });
    }
    document.getElementById('dW').value = defW;
    document.getElementById('dD').value = defD;
    document.getElementById('dF').value = defF;
    ud(); updateStats(); render();
    showToast('Project loaded from saved state');
  }
} else {
  // Load the real Dashlands plot on first open (the site to design around)
  setTimeout(() => {
    if (siteClosed || sitePts.length) return; // don't overwrite a boundary loaded before this fires
    sitePts    = DASHLANDS_SITE.pts.map(p => ({ x: p.x, y: p.y }));
    siteClosed = true;
    dxfOrigin  = { e: DASHLANDS_SITE.origin.e, n: DASHLANDS_SITE.origin.n };
    fitViewToBoundary(sitePts); // the plot is ~179×215 m — frame it to the canvas
    setDefaultAccessPoint();    // entrance snaps to the confirmed Sayerland Lane access
    setDefaultUtilities();      // utilities land at their documented positions
    document.getElementById('hintBar').textContent = 'Dashlands site loaded — Generate a scheme, or draw a road first';
    updateStats(); render();
    generateScheme(); // show a generated scheme immediately on first open
    showToast('Dashlands site loaded — scheme generated; draw a road, then Generate again');
  }, 300);
}
