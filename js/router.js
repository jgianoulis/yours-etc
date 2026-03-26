import { state, resetVisInitialised } from './state.js';
import { getAllBooks } from './storage.js';

// ── Injected cross-module dependencies ───────────────
let _renderLibrary  = null;
let _ensureVisualise = null;
let _openUploadModal = null;

export function setRenderLibrary(fn)   { _renderLibrary   = fn; }
export function setEnsureVisualise(fn) { _ensureVisualise = fn; }
export function setOpenUploadModal(fn) { _openUploadModal = fn; }

// ── Router ───────────────────────────────────────────
export function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.g-link').forEach(l => l.classList.remove('active'));
  const navEl = document.getElementById('nav-' + view);
  if (navEl) navEl.classList.add('active');
  state.currentView = view;
  if (view === 'library')   _renderLibrary();
  if (view === 'visualise') _ensureVisualise();
}

// ── Landing navigation helpers ───────────────────────
export function landingVisualise() {
  const books = getAllBooks();
  if (!books.length) { navigate('library'); _openUploadModal(); return; }
  state.activeBookId = books[0].id;
  state.activeVis    = null;
  resetVisInitialised();
  navigate('visualise');
}

export function landingVisualiseWith(vis) {
  const books = getAllBooks();
  if (!books.length) { navigate('library'); _openUploadModal(); return; }
  state.activeBookId = books[0].id;
  state.activeVis    = null;
  resetVisInitialised();
  navigate('visualise');
  setTimeout(() => {
    // Import setActiveVis lazily to avoid circular dependency at module load time
    import('./visualise.js').then(m => m.setActiveVis(vis));
  }, 0);
}

// ── Nav state ─────────────────────────────────────────
export function updateNavState() {
  const hasBooks = getAllBooks().length > 0;
  document.getElementById('nav-visualise').classList.toggle('disabled', !hasBooks);
}
