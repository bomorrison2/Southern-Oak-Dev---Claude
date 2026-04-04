/* =============================================================
   ArchForm — projects.js
   Saved projects dashboard: render grid, filter, modal,
   delete, re-run in designer, load in editor.
   Depends on: shared.js
   ============================================================= */

'use strict';

let projects     = [];
let activeFilter = 'all';

/* ── INIT ─────────────────────────────────────────────────── */
function init() {
  projects = loadProjects();
  renderGrid();
}

/* ── FILTER ───────────────────────────────────────────────── */
function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach((b, i) => {
    b.classList.toggle('active', ['all', 'brief', 'editor'][i] === f);
  });
  renderGrid();
}

/* ── GRID ─────────────────────────────────────────────────── */
function renderGrid() {
  const grid     = document.getElementById('projectsGrid');
  const empty    = document.getElementById('emptyState');
  const filtered = projects.filter(p => activeFilter === 'all' || p.type === activeFilter);

  document.getElementById('projectCount').textContent =
    `${projects.length} Project${projects.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');

  grid.innerHTML = filtered.map(p => `
    <div class="project-card" onclick="openProject('${p.id}')">
      <div class="card-type">
        <div class="type-dot ${p.type}"></div>
        ${p.type === 'brief' ? 'AI Design Brief' : 'Site Layout'}
      </div>
      <div class="card-name">${escHtml(p.name)}</div>
      <div class="card-stats">
        <div>
          <div class="card-stat-val">${p.stats.gfa ? p.stats.gfa.toLocaleString() : '—'}</div>
          <div class="card-stat-label">GFA m²</div>
        </div>
        <div>
          <div class="card-stat-val">${p.type === 'brief' ? (p.stats.units || '—') : (p.stats.buildings || '—')}</div>
          <div class="card-stat-label">${p.type === 'brief' ? 'Units' : 'Buildings'}</div>
        </div>
        <div>
          <div class="card-stat-val">${p.type === 'brief' ? (p.stats.cost || '—') : (p.stats.floors || '—')}</div>
          <div class="card-stat-label">${p.type === 'brief' ? 'Est. Cost' : 'Max Floors'}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="card-date">${formatDate(p.created)}</div>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          ${p.type === 'editor' ? `<button class="card-btn" onclick="loadInEditor('${p.id}')">Open in Editor</button>` : ''}
          ${p.type === 'brief'  ? `<button class="card-btn" onclick="openProject('${p.id}')">View Brief</button>`   : ''}
          <button class="card-btn danger" onclick="deleteProject('${p.id}')">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

/* ── MODAL ────────────────────────────────────────────────── */
function openProject(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return;

  document.getElementById('modalTitle').textContent = p.name;

  const ms = document.getElementById('modalStats');

  if (p.type === 'brief') {
    ms.innerHTML = `
      <div class="modal-stat"><div class="modal-stat-val">${p.stats.gfa?.toLocaleString() || '—'}</div><div class="modal-stat-label">GFA m²</div></div>
      <div class="modal-stat"><div class="modal-stat-val">${p.stats.units  || '—'}</div><div class="modal-stat-label">Units</div></div>
      <div class="modal-stat"><div class="modal-stat-val">${p.stats.floors || '—'}</div><div class="modal-stat-label">Floors</div></div>
      <div class="modal-stat"><div class="modal-stat-val" style="font-size:18px">${p.stats.cost || '—'}</div><div class="modal-stat-label">Est. Cost</div></div>
    `;
    document.getElementById('modalBriefSection').style.display  = 'block';
    document.getElementById('modalEditorSection').style.display = 'none';
    document.getElementById('modalBrief').innerHTML = p.result?.designBrief || '—';
    document.getElementById('modalActions').innerHTML = `
      <button class="modal-btn primary" onclick="rerunBrief('${id}')">Re-run in Designer</button>
      <button class="modal-btn" onclick="copyBrief('${id}')">Copy Brief</button>
      <button class="modal-btn" style="margin-left:auto;border-color:rgba(255,80,80,0.2);color:rgba(255,100,100,0.5)" onclick="deleteProject('${id}');closeModal()">Delete</button>
    `;
  } else {
    const s = p.stats;
    ms.innerHTML = `
      <div class="modal-stat"><div class="modal-stat-val">${s.siteArea?.toLocaleString() || '—'}</div><div class="modal-stat-label">Site m²</div></div>
      <div class="modal-stat"><div class="modal-stat-val">${s.gfa?.toLocaleString()      || '—'}</div><div class="modal-stat-label">GFA m²</div></div>
      <div class="modal-stat"><div class="modal-stat-val">${s.buildings || '—'}</div><div class="modal-stat-label">Buildings</div></div>
      <div class="modal-stat"><div class="modal-stat-val">${s.floors    || '—'}</div><div class="modal-stat-label">Max Floors</div></div>
    `;
    document.getElementById('modalBriefSection').style.display  = 'none';
    document.getElementById('modalEditorSection').style.display = 'block';
    document.getElementById('modalEditorInfo').innerHTML = `
      <p>Site boundary: <strong>${p.editorState?.sitePts?.length || 0} points</strong> ${p.editorState?.siteClosed ? '(closed)' : '(open)'}</p>
      <p style="margin-top:8px">Buildings: <strong>${p.editorState?.buildings?.length || 0}</strong></p>
    `;
    document.getElementById('modalActions').innerHTML = `
      <button class="modal-btn primary" onclick="loadInEditor('${id}')">Open in Editor</button>
      <button class="modal-btn" style="margin-left:auto;border-color:rgba(255,80,80,0.2);color:rgba(255,100,100,0.5)" onclick="deleteProject('${id}');closeModal()">Delete</button>
    `;
  }

  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('show');
}

/* ── ACTIONS ──────────────────────────────────────────────── */
function deleteProject(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  projects = projects.filter(p => p.id !== id);
  saveProjects(projects);
  renderGrid();
  showToast('Project deleted');
}

function loadInEditor(id) {
  const p = projects.find(p => p.id === id);
  if (!p || !p.editorState) return;
  setEditorLoadState(p.editorState);
  window.location.href = 'editor.html?load=1';
}

function rerunBrief(id) {
  const p = projects.find(p => p.id === id);
  if (!p || !p.inputs) return;
  const inp    = p.inputs;
  const params = new URLSearchParams({
    siteArea: inp.siteArea || 2500,
    far:      inp.far      || 2.5,
    floors:   inp.floors   || 6,
    studio:   inp.counts?.studio || 4,
    two:      inp.counts?.two    || 8,
    three:    inp.counts?.three  || 4,
    pent:     inp.counts?.pent   || 2
  });
  window.location.href = 'designer.html?' + params.toString();
}

function copyBrief(id) {
  const p = projects.find(p => p.id === id);
  if (!p?.result?.designBrief) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = p.result.designBrief;
  navigator.clipboard.writeText(tmp.innerText).then(() => showToast('Brief copied!'));
}

/* ── START ────────────────────────────────────────────────── */
init();
