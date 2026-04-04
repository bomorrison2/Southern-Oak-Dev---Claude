/* =============================================================
   ArchForm — designer.js
   AI brief generator: form handling, Claude API call,
   output rendering, save, and import from editor.
   Depends on: shared.js

   NOTE: The Claude API call has no key in the source.
   This prototype is intended to run inside Claude.ai, which
   injects authentication automatically. Running this file
   outside Claude.ai will result in a 401 Unauthorized error.
   ============================================================= */

'use strict';

/* ── UNIT COUNTS ──────────────────────────────────────────── */
const counts = { studio: 4, two: 8, three: 4, pent: 2 };

function changeCount(type, delta) {
  counts[type] = Math.max(0, counts[type] + delta);
  document.getElementById('count-' + type).textContent = counts[type];
}

// Wire up +/− buttons without relying on inline onclick attributes
// (avoids conflict with the 'two' type name which caused a bug in the original).
document.querySelectorAll('.unit-type-row').forEach((row, i) => {
  const types = ['studio', 'two', 'three', 'pent'];
  const t = types[i];
  row.querySelector('.unit-count-btn:first-child').addEventListener('click', () => changeCount(t, -1));
  row.querySelector('.unit-count-btn:last-child').addEventListener('click',  () => changeCount(t,  1));
});

/* ── LOADING STEP ANIMATION ───────────────────────────────── */
let stepInterval;

function animateSteps() {
  let step = 1;
  [1, 2, 3, 4, 5].forEach(i => document.getElementById('step' + i).classList.remove('active'));
  document.getElementById('step1').classList.add('active');
  stepInterval = setInterval(() => {
    step++;
    if (step <= 5) document.getElementById('step' + step).classList.add('active');
  }, 700);
}

function stopSteps() {
  clearInterval(stepInterval);
}

/* ── UI STATE ─────────────────────────────────────────────── */
function setState(state) {
  document.getElementById('emptyState').style.display    = state === 'empty'   ? 'flex' : 'none';
  const ls = document.getElementById('loadingState');
  ls.style.display = 'none'; ls.classList.remove('active');
  if (state === 'loading') { ls.style.display = 'flex'; ls.classList.add('active'); }
  const oc = document.getElementById('outputContent');
  oc.style.display = 'none'; oc.classList.remove('active');
  if (state === 'output') { oc.style.display = 'flex'; oc.classList.add('active'); }
}

function resetOutput() {
  setState('empty');
  [1, 2, 3, 4, 5].forEach(i => document.getElementById('step' + i).classList.remove('active'));
}

function copyOutput() {
  const brief = document.getElementById('designBrief').innerText;
  navigator.clipboard.writeText(brief).then(() => alert('Brief copied to clipboard.'));
}

/* ── GENERATE ─────────────────────────────────────────────── */
async function generate() {
  const btn = document.getElementById('generateBtn');
  const err = document.getElementById('errorMsg');
  err.classList.remove('active');

  const siteArea   = document.getElementById('siteArea').value;
  const far        = document.getElementById('far').value;
  const floors     = document.getElementById('floors').value;
  const siteShape  = document.getElementById('siteShape').value;
  const location   = document.getElementById('location').value || 'Urban location';
  const minBed     = document.getElementById('minBed').value;
  const minLiving  = document.getElementById('minLiving').value;
  const minKitchen = document.getElementById('minKitchen').value;
  const floorHeight = document.getElementById('floorHeight').value;
  const parking    = document.getElementById('parking').value;
  const groundFloor = document.getElementById('groundFloor').value;
  const additional = document.getElementById('additional').value;

  const totalUnits = counts.studio + counts.two + counts.three + counts.pent;
  if (totalUnits === 0) {
    err.textContent = 'Error: Please add at least one unit type.';
    err.classList.add('active');
    return;
  }

  btn.disabled = true;
  btn.classList.add('loading');
  setState('loading');
  animateSteps();

  const prompt = `You are an expert residential architect and building feasibility analyst. Generate a detailed building design brief based on these parameters:

SITE:
- Site area: ${siteArea} m²
- Plot ratio (FAR): ${far}
- Max floors: ${floors}
- Site shape: ${siteShape}
- Location: ${location}

UNIT MIX:
- Studios/1-bed: ${counts.studio} units
- 2-bedroom: ${counts.two} units
- 3-bedroom: ${counts.three} units
- Penthouse: ${counts.pent} units
- Total: ${totalUnits} units

ROOM MINIMUMS:
- Bedroom: ${minBed} m² min
- Living room: ${minLiving} m² min
- Kitchen: ${minKitchen} m² min
- Floor-to-floor height: ${floorHeight}m

PROGRAMME:
- Parking: ${parking}
- Ground floor: ${groundFloor}
- Additional: ${additional || 'None specified'}

Return ONLY valid JSON (no markdown, no backticks) with this exact structure:
{
  "projectTitle": "string — creative project name",
  "gfa": number — total gross floor area in m²,
  "avgUnitSize": number — average net unit size m²,
  "estimatedBuildCost": "string — e.g. €8.2M",
  "units": [
    { "type": "Studio", "qty": number, "netArea": number, "totalArea": number },
    { "type": "2-Bedroom", "qty": number, "netArea": number, "totalArea": number },
    { "type": "3-Bedroom", "qty": number, "netArea": number, "totalArea": number },
    { "type": "Penthouse", "qty": number, "netArea": number, "totalArea": number }
  ],
  "compliance": [
    { "name": "string", "value": "string — e.g. Compliant", "pct": number 0-100 },
    { "name": "string", "value": "string", "pct": number },
    { "name": "string", "value": "string", "pct": number },
    { "name": "string", "value": "string", "pct": number }
  ],
  "designBrief": "string — 3-4 paragraphs using HTML with <h3> and <p> tags",
  "costs": [
    { "line": "string", "amount": "string" },
    { "line": "string", "amount": "string" },
    { "line": "string", "amount": "string" },
    { "line": "string", "amount": "string" },
    { "line": "TOTAL", "amount": "string", "isTotal": true }
  ],
  "recommendations": "string — 4-5 bullet points as HTML <ul><li> list"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data   = await response.json();
    const raw    = data.content.map(b => b.text || '').join('');
    const clean  = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    stopSteps();
    renderOutput(result, { siteArea, far, floors });

  } catch (e) {
    stopSteps();
    setState('empty');
    err.textContent = 'Error generating design: ' + e.message;
    err.classList.add('active');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

/* ── RENDER OUTPUT ────────────────────────────────────────── */
function renderOutput(d, params) {
  document.getElementById('outTitle').textContent  = d.projectTitle || 'Design Brief';
  document.getElementById('outGFA').textContent    = (d.gfa || '—') + ' m²';
  document.getElementById('outUnits').textContent  = counts.studio + counts.two + counts.three + counts.pent;
  document.getElementById('outFloors').textContent = params.floors;

  document.getElementById('mGFA').textContent   = d.gfa ? d.gfa.toLocaleString() : '—';
  document.getElementById('mUnits').textContent  = counts.studio + counts.two + counts.three + counts.pent;
  document.getElementById('mEff').textContent    = d.avgUnitSize || '—';
  document.getElementById('mCost').textContent   = d.estimatedBuildCost || '—';

  // Unit table
  const tbody = document.getElementById('unitTableBody');
  tbody.innerHTML = '';
  (d.units || []).filter(u => u.qty > 0).forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.type}</td><td>${u.qty}</td><td>${u.netArea} m²</td><td>${u.totalArea} m²</td>`;
    tbody.appendChild(tr);
  });

  // Compliance bars
  const compList = document.getElementById('complianceList');
  compList.innerHTML = '';
  (d.compliance || []).forEach(c => {
    compList.innerHTML += `
      <div class="compliance-item">
        <div class="compliance-header">
          <span class="compliance-name">${c.name}</span>
          <span class="compliance-val">${c.value}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${c.pct}%"></div></div>
      </div>`;
  });

  document.getElementById('designBrief').innerHTML = d.designBrief || '—';

  // Cost table
  const costTable = document.getElementById('costTable');
  costTable.innerHTML = '';
  (d.costs || []).forEach(c => {
    const tr = document.createElement('tr');
    if (c.isTotal) tr.classList.add('total');
    tr.innerHTML = `<td>${c.line}</td><td>${c.amount}</td>`;
    costTable.appendChild(tr);
  });

  document.getElementById('recommendations').innerHTML = d.recommendations || '—';

  setState('output');

  // Store for saving
  window._lastResult = d;
  window._lastParams = { siteArea: params.siteArea, far: params.far, floors: params.floors };

  // Animate compliance bars
  setTimeout(() => {
    document.querySelectorAll('.bar-fill').forEach(b => {
      const w = b.style.width;
      b.style.width = '0%';
      setTimeout(() => { b.style.width = w; }, 50);
    });
  }, 200);
}

/* ── SAVE PROJECT ─────────────────────────────────────────── */
function saveProject() {
  const d = window._lastResult;
  if (!d) return;
  const name = prompt('Project name:', d.projectTitle || 'Untitled Project');
  if (!name) return;

  addProject({
    id:      Date.now().toString(),
    name,
    created: new Date().toISOString(),
    type:    'brief',
    stats: {
      gfa:    d.gfa,
      units:  counts.studio + counts.two + counts.three + counts.pent,
      cost:   d.estimatedBuildCost,
      floors: window._lastParams?.floors || '—'
    },
    inputs: {
      siteArea:   document.getElementById('siteArea').value,
      far:        document.getElementById('far').value,
      floors:     document.getElementById('floors').value,
      location:   document.getElementById('location').value,
      counts:     { ...counts }
    },
    result: d
  });

  const btn = document.getElementById('saveBtn');
  btn.textContent         = '✓ Saved!';
  btn.style.borderColor   = 'var(--green)';
  btn.style.color         = 'var(--green)';
  setTimeout(() => {
    btn.textContent       = 'Save Project';
    btn.style.borderColor = 'var(--blue)';
    btn.style.color       = 'var(--blue-light)';
  }, 2000);
}

/* ── IMPORT FROM EDITOR ───────────────────────────────────── */
(function importFromEditor() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('fromEditor') !== '1') return;

  document.getElementById('editorBanner').classList.add('show');

  // Prefer the richer sessionStorage payload; fall back to URL params
  const d   = getEditorSession() || {};
  const get = (key, fallback) => d[key] !== undefined ? d[key] : (p.get(key) !== null ? +p.get(key) : fallback);

  const siteArea = get('siteArea', 2500);
  const far      = get('far',      2.5);
  const floors   = get('floors',   6);
  const studio   = get('studio',   4);
  const two      = get('two',      8);
  const three    = get('three',    4);
  const pent     = get('pent',     2);
  const shape    = d.siteShape || p.get('siteShape') || 'Rectangular';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('siteArea',  siteArea);
  set('far',       far);
  set('floors',    floors);
  set('siteShape', shape);

  counts.studio = Math.max(0, studio);
  counts.two    = Math.max(0, two);
  counts.three  = Math.max(0, three);
  counts.pent   = Math.max(0, pent);
  document.getElementById('count-studio').textContent = counts.studio;
  document.getElementById('count-two').textContent    = counts.two;
  document.getElementById('count-three').textContent  = counts.three;
  document.getElementById('count-pent').textContent   = counts.pent;

  const addEl = document.getElementById('additional');
  if (addEl && !addEl.value) {
    addEl.value = `Site area ${siteArea}m² · FAR ${far} · ${floors} floors max — imported from Site Editor`;
  }
})();
