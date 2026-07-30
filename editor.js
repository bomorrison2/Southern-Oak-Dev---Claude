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
}

function clearRoad() {
  road = { pts: [], width: road.width };
  drawingRoad = false;
  updateStats(); refreshRoadUI(); render();
  if (view === '3d') build3d();
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

// 3D carriageway: a flat grey ribbon at ground level, one quad per segment.
function addRoad3d(scene, cx, cz) {
  const c = roadCenterline();
  if (c.length < 2) return;
  const hw = road.width / 2;
  const pos = [];
  const toScene = p => [p.x - cx, 0.12, -(p.y - cz)]; // flat, just above the site slab
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * hw, ny = dx / len * hw; // perpendicular offset (editor space)
    const aL = toScene({ x: a.x + nx, y: a.y + ny }), aR = toScene({ x: a.x - nx, y: a.y - ny });
    const bL = toScene({ x: b.x + nx, y: b.y + ny }), bR = toScene({ x: b.x - nx, y: b.y - ny });
    pos.push(...aL, ...aR, ...bR,  ...aL, ...bR, ...bL); // two triangles
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6b6b6b, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  scene.add(mesh);
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

  // WATER — boundary point on the frontage near the entrance (offset SE so it
  // doesn't sit exactly on the entrance marker)
  const water = accessPt
    ? nearestPointOnBoundary(accessPt.x + 10, accessPt.y - 6)
    : sewer;

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

  // ── Dwelling capacity (3D massing) — reuses the site area sA above ──
  // Net developable = gross − measured road area − (SuDS/open-space % of gross).
  // Headline density is dwellings per NET hectare, gross shown alongside.
  const roadM2    = roadAreaM2();
  const netM2     = Math.max(0, sA * (1 - deductPct / 100) - roadM2);
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

  refreshEntranceUI();
  refreshUtilityUI();
  refreshRoadUI();
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
  if (tool === 'site' && sitePts.length >= 3 && !siteClosed) {
    siteClosed = true;
    setDefaultAccessPoint();
    setDefaultUtilities();
    road = { pts: [], width: road.width }; drawingRoad = false; // new boundary → clear road
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

  // Internal estate road (drawn over the boundary fill, under the access markers)
  drawRoad2d();

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

/* ── DWELLING SLIDER ──────────────────────────────────────── */
function onDwellingSlider() {
  dwellingCount = +document.getElementById('dwellingSlider').value;
  document.getElementById('dwellingCountLabel').textContent = dwellingCount;
  if (view === '3d') build3d();
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

// Lays out simple dwelling massing inside the site boundary.
// Houses are 8×10m footprint, 6m to eaves, pitched roof (+2m ridge).
// Rows mix terraced (joined on the short side) and detached (gaps).
// Every footprint is fully contained in the boundary (all four corners tested),
// candidates are gathered across the whole site, then evenly thinned to the
// target count so they spread across the entire developable area.
// sitePts are centroid-relative world coords; cx/cz are the Three.js centroid offsets.
function buildDwellingMassing(scene, sitePts, cx, cz, count) {
  placedDwellings = 0; // reset; stays 0 on any early return (no/invalid boundary)
  if (!sitePts || sitePts.length < 3 || !siteClosed) return;

  // ── Fixed domestic proportions ──
  const DW = 8, DD = 10, EAVE = 6, RISE = 2; // 8×10m footprint, 6m to eaves
  const GAP = 3;        // side gap between detached units
  const INSET = 8;      // keep all geometry clear of the boundary line
  const ROW_STEP = 20;  // row centre-to-centre (house depth + front/back gardens)

  const xs = sitePts.map(p => p.x);
  const ys = sitePts.map(p => p.y);
  const xMin = Math.min(...xs) + INSET, xMax = Math.max(...xs) - INSET;
  const yMin = Math.min(...ys) + INSET, yMax = Math.max(...ys) - INSET;
  if (xMax - xMin < DW || yMax - yMin < DD) return;

  // Ray-casting point-in-polygon in world (site) coords
  function inSite(px, py) {
    let inside = false;
    for (let i = 0, j = sitePts.length - 1; i < sitePts.length; j = i++) {
      const xi = sitePts[i].x, yi = sitePts[i].y;
      const xj = sitePts[j].x, yj = sitePts[j].y;
      if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  // A footprint is valid only if all four corners sit inside the boundary
  function footprintInside(px, py) {
    const hw = DW / 2, hd = DD / 2;
    return inSite(px - hw, py - hd) && inSite(px + hw, py - hd) &&
           inSite(px + hw, py + hd) && inSite(px - hw, py + hd);
  }

  // ── Gather candidate slots across the ENTIRE boundary extent ──
  const candidates = [];
  let rowIdx = 0;
  for (let sy = yMin + DD / 2; sy <= yMax - DD / 2; sy += ROW_STEP) {
    // Pattern: terrace, terrace, detached — repeating
    const isTerrace = (rowIdx % 3 !== 2);
    const unitStep  = isTerrace ? DW : DW + GAP;
    for (let sx = xMin + DW / 2; sx <= xMax - DW / 2; sx += unitStep) {
      if (footprintInside(sx, sy)) candidates.push({ sx, sy, rowIdx });
    }
    rowIdx++;
  }

  // ── Choose up to `count`, spread evenly across the whole site ──
  const target = Math.min(count, candidates.length);
  let chosen;
  if (candidates.length <= target) {
    chosen = candidates;
  } else {
    chosen = [];
    const stride = candidates.length / target;
    for (let i = 0; i < target; i++) chosen.push(candidates[Math.floor(i * stride)]);
  }

  // ── Shared geometry / materials ──
  const WALL_COLS = [0xc4a882, 0xb89474, 0xcfb99a, 0xbcaa8c];
  const ROOF_COL  = 0x6e6458;
  const roofGeo  = makePitchedRoof(DW, DD, EAVE, RISE);
  const roofMat  = new THREE.MeshLambertMaterial({ color: ROOF_COL, side: THREE.DoubleSide });
  const bodyGeo  = new THREE.BoxGeometry(DW, EAVE, DD);
  const wallMats = WALL_COLS.map(c => new THREE.MeshLambertMaterial({ color: c }));

  chosen.forEach(c => {
    // Convert site world coords → Three.js scene coords
    const tx = c.sx - cx;
    const tz = -(c.sy - cz);
    const wallMat = wallMats[c.rowIdx % wallMats.length];

    const body = new THREE.Mesh(bodyGeo, wallMat);
    body.position.set(tx, EAVE / 2, tz);
    body.castShadow    = true;
    body.receiveShadow = true;
    scene.add(body);

    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(tx, 0, tz);
    roof.castShadow    = true;
    roof.receiveShadow = true;
    scene.add(roof);
  });

  // Live count reflects what was actually placed inside the boundary
  placedDwellings = chosen.length;
  const lbl = document.getElementById('dwellingCountLabel');
  if (lbl) lbl.textContent = chosen.length;
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

function build3d() {
  const wrap = document.getElementById('c3d');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;

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

  s3 = new THREE.Scene();
  s3.fog = new THREE.Fog(0x3d3d3d, 400, 900);
  s3.add(new THREE.GridHelper(500, 50, 0x4a4a4a, 0x3d3d3d));
  s3.add(new THREE.AmbientLight(0xffffff, 0.45));
  const sun = new THREE.DirectionalLight(0x6699ff, 0.85);
  sun.position.set(100, 200, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.width  = 2048;
  sun.shadow.mapSize.height = 2048;
  s3.add(sun);
  const fill = new THREE.PointLight(0x00d4ff, 0.25, 600);
  fill.position.set(-80, 60, -80);
  s3.add(fill);

  const cx = sitePts.length ? sitePts.reduce((s, p) => s + p.x, 0) / sitePts.length : 0;
  const cz = sitePts.length ? sitePts.reduce((s, p) => s + p.y, 0) / sitePts.length : 0;

  if (siteClosed && sitePts.length >= 3) {
    const shape = new THREE.Shape();
    shape.moveTo(sitePts[0].x - cx, sitePts[0].y - cz);
    for (let i = 1; i < sitePts.length; i++) shape.lineTo(sitePts[i].x - cx, sitePts[i].y - cz);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshLambertMaterial({ color: 0x424242, side: THREE.DoubleSide });
    const m   = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.1;
    s3.add(m);
    const pts3 = sitePts.map(p => new THREE.Vector3(p.x - cx, 0.2, -(p.y - cz)));
    pts3.push(pts3[0].clone());
    s3.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), new THREE.LineBasicMaterial({ color: 0x1a6cff })));
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

  buildDwellingMassing(s3, sitePts, cx, cz, dwellingCount);
  addRoad3d(s3, cx, cz);
  addEntrance3d(s3, cx, cz);
  addAccessStub3d(s3, cx, cz);
  addUtilities3d(s3, cx, cz);
  updateStats(); // reflect placed dwelling count + density in the stats panel

  if (anim3) cancelAnimationFrame(anim3);
  function loop() { anim3 = requestAnimationFrame(loop); r3.render(s3, cam3); }
  loop();
}

/* ── CLEAR ALL ────────────────────────────────────────────── */
function clearAll() {
  if (!confirm('Clear everything?')) return;
  sitePts = []; siteClosed = false; buildings = []; selected = null;
  placedDwellings = 0;
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
    editorState: { sitePts, siteClosed, buildings, defW, defD, defF, accessPt, accessSplay, road, utilities, deductPct }
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
      fitViewToBoundary(sitePts);
      updateStats();
      render();
      if (view === '3d') build3d(); // refresh 3D so it tracks the imported boundary
      alignPdfToDxf();              // snap an already-georeferenced PDF under the boundary
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
  placedDwellings = 0;
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
    document.getElementById('dW').value = defW;
    document.getElementById('dD').value = defD;
    document.getElementById('dF').value = defF;
    ud(); updateStats(); render();
    showToast('Project loaded from saved state');
  }
} else {
  // Load a demo site on first open
  setTimeout(() => {
    if (siteClosed || sitePts.length) return; // don't overwrite a boundary loaded before this fires
    sitePts    = [{ x: -35, y: -25 }, { x: 35, y: -25 }, { x: 35, y: 25 }, { x: -35, y: 25 }];
    siteClosed = true;
    setDefaultAccessPoint();
    setDefaultUtilities();
    document.getElementById('hintBar').textContent = 'Demo site loaded — use Building tool to place blocks';
    updateStats(); render();
    showToast('Demo site loaded — try placing some buildings!');
  }, 300);
}
