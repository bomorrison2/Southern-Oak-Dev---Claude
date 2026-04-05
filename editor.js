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

/* ── PDF UNDERLAY STATE ───────────────────────────────────── */
// null when no plan is loaded.
// When loaded: { img, wx, wy, ww, wh, opacity }
//   wx,wy = world coords of top-left corner (world Y increases upward)
//   ww,wh = width/height in world metres
let pdfState    = null;
let calibPts    = [];    // accumulates up to 2 {wx,wy} world points
let calibrating = false;

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
  if (tool === 'site' && sitePts.length >= 3 && !siteClosed) {
    siteClosed = true;
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

/* ── 3D VIEW ──────────────────────────────────────────────── */
let r3, s3, cam3, anim3;
let theta = 45, phi = 40, radius = 200;

function setView(v) {
  view = v;
  document.getElementById('btn2d').classList.toggle('active', v === '2d');
  document.getElementById('btn3d').classList.toggle('active', v === '3d');
  canvas.style.display = v === '2d' ? 'block' : 'none';
  const c3 = document.getElementById('c3d');
  c3.style.display = v === '3d' ? 'block' : 'none';
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
    r3.setClearColor(0x0a0d12, 1);
    wrap.appendChild(r3.domElement);
    cam3 = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);

    function updCam() {
      const tr = theta * Math.PI / 180, pr = phi * Math.PI / 180;
      cam3.position.set(Math.sin(tr) * Math.cos(pr) * radius, Math.sin(pr) * radius, Math.cos(tr) * Math.cos(pr) * radius);
      cam3.lookAt(0, 0, 0);
    }
    updCam();

    let od = false, os = { x: 0, y: 0 };
    r3.domElement.addEventListener('mousedown', e => { od = true; os = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', () => od = false);
    window.addEventListener('mousemove', e => {
      if (!od) return;
      theta -= (e.clientX - os.x) * 0.4;
      phi = Math.max(5, Math.min(85, phi - (e.clientY - os.y) * 0.4));
      os = { x: e.clientX, y: e.clientY };
      updCam();
    });
    r3.domElement.addEventListener('wheel', e => {
      radius = Math.max(20, Math.min(700, radius + e.deltaY * 0.5));
      updCam();
    });
  }

  r3.setSize(w, h);
  cam3.aspect = w / h;
  cam3.updateProjectionMatrix();

  s3 = new THREE.Scene();
  s3.fog = new THREE.Fog(0x0a0d12, 400, 900);
  s3.add(new THREE.GridHelper(500, 50, 0x1a2030, 0x111620));
  s3.add(new THREE.AmbientLight(0xffffff, 0.45));
  const sun = new THREE.DirectionalLight(0x6699ff, 0.85);
  sun.position.set(100, 200, 80);
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
    const mat = new THREE.MeshLambertMaterial({ color: 0x141c28, side: THREE.DoubleSide });
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

  if (anim3) cancelAnimationFrame(anim3);
  function loop() { anim3 = requestAnimationFrame(loop); r3.render(s3, cam3); }
  loop();
}

/* ── CLEAR ALL ────────────────────────────────────────────── */
function clearAll() {
  if (!confirm('Clear everything?')) return;
  sitePts = []; siteClosed = false; buildings = []; selected = null;
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
    editorState: { sitePts, siteClosed, buildings, defW, defD, defF }
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
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const pdfDoc = await pdfjsLib.getDocument({ data: ev.target.result }).promise;
      const page   = await pdfDoc.getPage(1);

      // Render page at 2× scale for clarity
      const viewport  = page.getViewport({ scale: 2.0 });
      const offCanvas = document.createElement('canvas');
      offCanvas.width  = viewport.width;
      offCanvas.height = viewport.height;
      await page.render({ canvasContext: offCanvas.getContext('2d'), viewport }).promise;

      // Place PDF centred on current viewport, ~80% of viewport width
      const viewWM = canvas.width  / (SCALE * zoom);
      const viewHM = canvas.height / (SCALE * zoom);
      const viewCX = (canvas.width  / 2 - panX) / (SCALE * zoom);
      const viewCY = -((canvas.height / 2 - panY) / (SCALE * zoom));
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

      calibPts = [];
      status.textContent = file.name;
      status.className   = 'pdf-status loaded';
      document.getElementById('pdfControls').style.display = 'flex';
      document.getElementById('pdfOpacity').value          = '35';
      document.getElementById('pdfOpacityVal').textContent = '35%';
      render();
      showToast('Plan imported — use Calibrate to set scale');
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

  calibPts    = [];
  calibrating = false;

  const status = document.getElementById('pdfStatus');
  status.textContent = 'Calibrated — ' + dReal + 'm ref';
  status.className   = 'pdf-status calibrated';

  setTool('site');
  render();
  showToast('Scale set: ' + dReal + 'm reference applied');
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
    document.getElementById('dW').value = defW;
    document.getElementById('dD').value = defD;
    document.getElementById('dF').value = defF;
    ud(); updateStats(); render();
    showToast('Project loaded from saved state');
  }
} else {
  // Load a demo site on first open
  setTimeout(() => {
    sitePts    = [{ x: -35, y: -25 }, { x: 35, y: -25 }, { x: 35, y: 25 }, { x: -35, y: 25 }];
    siteClosed = true;
    document.getElementById('hintBar').textContent = 'Demo site loaded — use Building tool to place blocks';
    updateStats(); render();
    showToast('Demo site loaded — try placing some buildings!');
  }, 300);
}
