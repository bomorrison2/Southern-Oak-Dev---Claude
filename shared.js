/* =============================================================
   ArchForm — shared.js
   Utility functions used across editor, designer, and projects.
   Load this before any page-specific script.
   ============================================================= */

'use strict';

/* ── TOAST ────────────────────────────────────────────────── */

/**
 * Show a brief notification toast.
 * Expects a <div class="toast" id="toast"> element in the page.
 * @param {string} msg
 * @param {number} [duration=2600]
 */
function showToast(msg, duration) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration || 2600);
}

/* ── PROJECT STORAGE ──────────────────────────────────────── */

const PROJECTS_KEY = 'archformProjects';

/**
 * Load all saved projects from localStorage.
 * Returns an empty array if storage is missing or corrupt.
 * @returns {Array}
 */
function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
  } catch (e) {
    console.warn('ArchForm: failed to load projects from localStorage', e);
    return [];
  }
}

/**
 * Persist the projects array to localStorage.
 * @param {Array} projects
 */
function saveProjects(projects) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    alert('Storage full — delete some older projects to free space.');
  }
}

/**
 * Prepend a single project object to the saved list.
 * Handles load/save internally.
 * @param {Object} project
 */
function addProject(project) {
  const projects = loadProjects();
  projects.unshift(project);
  saveProjects(projects);
}

/* ── SESSION HANDOFF ──────────────────────────────────────── */

const SESSION_EDITOR_KEY  = 'archformEditorData';
const SESSION_LOAD_KEY    = 'archformEditorLoad';

/**
 * Write editor payload to sessionStorage for designer to read.
 * @param {Object} payload
 */
function setEditorSession(payload) {
  try {
    sessionStorage.setItem(SESSION_EDITOR_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('ArchForm: could not write editor session', e);
  }
}

/**
 * Read editor payload from sessionStorage.
 * @returns {Object|null}
 */
function getEditorSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_EDITOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Write an editor state for re-loading via the projects page.
 * @param {Object} state
 */
function setEditorLoadState(state) {
  try {
    sessionStorage.setItem(SESSION_LOAD_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('ArchForm: could not write editor load state', e);
  }
}

/**
 * Read the editor load state written by the projects page.
 * @returns {Object|null}
 */
function getEditorLoadState() {
  try {
    const raw = sessionStorage.getItem(SESSION_LOAD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/* ── DATE FORMATTING ──────────────────────────────────────── */

/**
 * Format an ISO date string for display.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/* ── ESCAPE HTML ──────────────────────────────────────────── */

/**
 * Escape a string for safe HTML insertion.
 * @param {string} s
 * @returns {string}
 */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
