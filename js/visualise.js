import { state, resetVisInitialised, THUMB_PALETTE } from './state.js';
import { getBook, saveBook, getAllBooks, applyNameMap } from './storage.js';
import { buildSidebarColors, syncSidebarColorRow, buildCEGrid, exportPaletteFromActive } from './colourEditor.js';
import { initGrid, downloadGridSVG, downloadGridRepeat, downloadGridPDF } from './vis/mosaic.js';
import { initTimeline, downloadTimelineSVG } from './vis/sequence.js';
import { initNetwork, buildNetSizeLegend, downloadNetworkSVG, setSetActiveVis } from './vis/network.js';
import { initFlow, downloadFlowSVG } from './vis/flow.js';

// Inject setActiveVis into network module so layout/filter toggles can trigger re-init
setSetActiveVis(setActiveVis);

// ── Injected cross-module dependencies ───────────────
let _renderLibrary = null;
export function setRenderLibraryRef(fn) { _renderLibrary = fn; }

// ── Visualise view orchestration ──────────────────────
export function ensureVisualise() {
  const books = getAllBooks();
  if (!books.length) {
    import('./router.js').then(m => m.navigate('library'));
    return;
  }
  if (!state.activeBookId || !getBook(state.activeBookId)) {
    state.activeBookId = books[0].id;
    state.activeVis    = null;
    resetVisInitialised();
  }
  loadVisualiseHeader();
  buildBookSelector();
  setActiveVis(state.activeVis);
}

export function loadVisualiseHeader() {
  const book = getBook(state.activeBookId); if (!book) return;
  const titleEl = document.getElementById('vis-book-title');
  titleEl.textContent       = book.title;
  titleEl.dataset.bookId    = state.activeBookId;
  document.getElementById('vis-book-subtitle').textContent =
    [book.author, book.year].filter(Boolean).join(' · ');
  document.getElementById('vis-stat-letters').textContent = book.letterCount;
  document.getElementById('vis-stat-chars').textContent   = book.characterCount;
}

export function buildBookSelector() {
  const sel = document.getElementById('sb-book-select');
  sel.innerHTML = '';
  getAllBooks().forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = b.title;
    if (b.id === state.activeBookId) opt.selected = true;
    sel.appendChild(opt);
  });
}

export function switchBook(id) {
  state.activeBookId = id;
  state.activeVis    = null;
  resetVisInitialised();
  loadVisualiseHeader();
  setActiveVis(null);
}

export function setActiveVis(name) {
  state.activeVis = name;

  // Sync both tab strips
  document.querySelectorAll('.vis-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.vis === name)
  );

  // Show/hide home vs vis containers
  document.getElementById('vis-home').classList.toggle('active', !name);
  ['network', 'flow', 'grid', 'timeline'].forEach(v => {
    document.getElementById('vis-' + v).style.display = (v === name) ? 'block' : 'none';
  });

  // Sidebar: home msg vs config
  document.getElementById('sb-home-msg').style.display = name ? 'none' : 'block';
  document.querySelectorAll('.sb-config').forEach(c => c.classList.remove('active'));
  if (name) document.getElementById('sb-config-' + name)?.classList.add('active');

  // Show/hide colours + downloads
  document.getElementById('sb-colors-disclosure').style.display = name ? 'block' : 'none';
  document.getElementById('sb-downloads').style.display         = name ? 'block' : 'none';

  if (name) {
    const book = getBook(state.activeBookId); if (!book) return;
    buildSidebarColors(book);
    buildDownloadButtons(name);

    if (!state.visInitialised[name]) {
      const letters = applyNameMap(book.letters, book.nameMap);
      if      (name === 'grid')     initGrid(letters, book.colorMap);
      else if (name === 'timeline') initTimeline(letters, book.colorMap);
      else if (name === 'network')  initNetwork(letters, book.colorMap);
      else if (name === 'flow')     initFlow(letters, book.colorMap, book.title);
      state.visInitialised[name] = true;
    }
  }
}

export function redrawActiveVis() {
  if (!state.activeVis || !state.activeBookId) return;
  const book = getBook(state.activeBookId); if (!book) return;
  const letters = applyNameMap(book.letters, book.nameMap);
  state.visInitialised[state.activeVis] = false;
  if      (state.activeVis === 'grid')     initGrid(letters, book.colorMap);
  else if (state.activeVis === 'timeline') initTimeline(letters, book.colorMap);
  else if (state.activeVis === 'network')  initNetwork(letters, book.colorMap);
  else if (state.activeVis === 'flow')     initFlow(letters, book.colorMap, book.title);
  state.visInitialised[state.activeVis] = true;
}

// ── Download buttons ──────────────────────────────────
export function buildDownloadButtons(vis) {
  const container = document.getElementById('sb-dl-buttons');
  container.innerHTML = '';
  const add = (label, fn, primary) => {
    const b = document.createElement('button');
    b.className = 'btn btn-wide ' + (primary ? 'btn-primary' : 'btn-ghost');
    b.textContent = label; b.onclick = fn;
    container.appendChild(b);
  };
  if (vis === 'grid') {
    add('Download SVG',          downloadGridSVG,          true);
    add('Download PDF',          downloadGridPDF,          true);
    add('Download SVG for Repeat', downloadGridRepeat,     false);
    add('Export Colour Palette', exportPaletteFromActive,  false);
  } else if (vis === 'timeline') {
    add('Download SVG',          downloadTimelineSVG,      true);
    add('Export Colour Palette', exportPaletteFromActive,  false);
  } else if (vis === 'network') {
    add('Download SVG',          downloadNetworkSVG,       true);
  } else if (vis === 'flow') {
    add('Download SVG',          downloadFlowSVG,          true);
    add('Export Colour Palette', exportPaletteFromActive,  false);
  }
}

// ── Thumbnails ────────────────────────────────────────
function buildGridThumb(el, size) {
  const cols = size === 'small' ? 8 : 10;
  el.innerHTML = '';
  const g = document.createElement('div');
  g.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:0.75rem;width:100%;box-sizing:border-box`;
  const pairs = [[0,1],[1,0],[2,0],[0,3],[3,4],[1,2],[0,1],[4,1],[2,3],[0,1],[1,4],[3,0],[2,1],[0,3],[4,2],[1,0],[3,1],[0,2],[2,4],[1,3]];
  for (let i = 0; i < cols * (size === 'small' ? 3 : 4); i++) {
    const p  = pairs[i % pairs.length];
    const sq = document.createElement('div');
    sq.style.cssText = `aspect-ratio:1;display:flex;overflow:hidden;border:1px solid rgba(0,0,0,0.1)`;
    sq.innerHTML = `<div style="width:50%;height:100%;background:${THUMB_PALETTE[p[0]]}"></div><div style="width:50%;height:100%;background:${THUMB_PALETTE[p[1]]}"></div>`;
    g.appendChild(sq);
  }
  el.appendChild(g);
}

function buildTimelineThumb(el) {
  el.innerHTML = '';
  const rows = [
    { label: 'Valmont',  dots: [0,0,3,0,4,0,0] },
    { label: 'Merteuil', dots: [1,1,2,1,1] },
    { label: 'Tourvel',  dots: [5,1,6,5] },
    { label: 'Cécile',   dots: [2,4,4,2,1] },
  ];
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:7px;padding:0.5rem 0.75rem;width:100%';
  rows.forEach(row => {
    const r   = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;gap:5px';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:0.52rem;color:#999;width:50px;text-align:right;flex-shrink:0;font-family:sans-serif';
    lbl.textContent = row.label;
    r.appendChild(lbl);
    const dotWrap = document.createElement('div');
    dotWrap.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap';
    row.dots.forEach(ci => {
      const d = document.createElement('div');
      d.style.cssText = `width:7px;height:7px;border-radius:50%;background:${THUMB_PALETTE[ci]};flex-shrink:0`;
      dotWrap.appendChild(d);
    });
    r.appendChild(dotWrap);
    wrap.appendChild(r);
  });
  el.appendChild(wrap);
}

function buildNetworkThumb(el) {
  const c  = ['#8bdfe0','#c195ed','#edc24c','#f294db','#839de6','#9aafca','#c4e087'];
  const lf = (hex, ratio) => {
    const h = hex.replace('#', '');
    const rv = parseInt(h.slice(0,2),16), gv = parseInt(h.slice(2,4),16), bv = parseInt(h.slice(4,6),16);
    return `#${Math.round(rv+(255-rv)*ratio).toString(16).padStart(2,'0')}${Math.round(gv+(255-gv)*ratio).toString(16).padStart(2,'0')}${Math.round(bv+(255-bv)*ratio).toString(16).padStart(2,'0')}`;
  };
  el.innerHTML = `<svg width="100%" viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" style="opacity:0.9">
    <line x1="100" y1="55" x2="40"  y2="95" stroke="#b0aeaa" stroke-width="3"   stroke-opacity="0.7"/>
    <line x1="100" y1="55" x2="160" y2="90" stroke="#b0aeaa" stroke-width="5"   stroke-opacity="0.7"/>
    <line x1="100" y1="55" x2="155" y2="28" stroke="#b0aeaa" stroke-width="2"   stroke-opacity="0.7"/>
    <line x1="100" y1="55" x2="48"  y2="24" stroke="#b0aeaa" stroke-width="2"   stroke-opacity="0.7"/>
    <line x1="40"  y1="95" x2="160" y2="90" stroke="#b0aeaa" stroke-width="1.5" stroke-opacity="0.6"/>
    <line x1="48"  y1="24" x2="155" y2="28" stroke="#b0aeaa" stroke-width="1"   stroke-opacity="0.6"/>
    <circle cx="100" cy="55" r="19" fill="${lf(c[0],0.55)}" stroke="${c[0]}" stroke-width="2"/>
    <circle cx="40"  cy="95" r="13" fill="${lf(c[1],0.55)}" stroke="${c[1]}" stroke-width="2"/>
    <circle cx="160" cy="90" r="13" fill="${lf(c[2],0.55)}" stroke="${c[2]}" stroke-width="2"/>
    <circle cx="155" cy="28" r="9"  fill="${lf(c[3],0.55)}" stroke="${c[3]}" stroke-width="2"/>
    <circle cx="48"  cy="24" r="9"  fill="${lf(c[4],0.55)}" stroke="${c[4]}" stroke-width="2"/>
    <circle cx="175" cy="54" r="6"  fill="${lf(c[5],0.55)}" stroke="${c[5]}" stroke-width="2"/>
    <circle cx="22"  cy="55" r="6"  fill="${lf(c[6],0.55)}" stroke="${c[6]}" stroke-width="2"/>
  </svg>`;
}

function buildFlowThumb(el) {
  el.innerHTML = `<svg width="100%" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" style="opacity:0.85">
    <rect x="8"  y="4"  width="8" height="26" fill="${THUMB_PALETTE[0]}"/>
    <rect x="8"  y="33" width="8" height="18" fill="${THUMB_PALETTE[1]}"/>
    <rect x="8"  y="54" width="8" height="13" fill="${THUMB_PALETTE[2]}"/>
    <rect x="8"  y="70" width="8" height="8"  fill="${THUMB_PALETTE[4]}"/>
    <path d="M16,4  C50,4  50,4  84,4  L84,30 C50,30 50,30 16,30Z" fill="${THUMB_PALETTE[0]}" opacity="0.32"/>
    <path d="M16,33 C50,33 50,8  84,10 L84,22 C50,22 50,33 16,51Z" fill="${THUMB_PALETTE[1]}" opacity="0.32"/>
    <path d="M16,54 C50,54 50,12 84,15 L84,25 C50,25 50,54 16,66Z" fill="${THUMB_PALETTE[2]}" opacity="0.32"/>
    <path d="M16,70 C50,70 50,42 84,46 L84,54 C50,54 50,70 16,77Z" fill="${THUMB_PALETTE[4]}" opacity="0.32"/>
    <rect x="84" y="4"  width="8" height="23" fill="${THUMB_PALETTE[0]}"/>
    <rect x="84" y="29" width="8" height="18" fill="${THUMB_PALETTE[1]}"/>
    <rect x="84" y="50" width="8" height="14" fill="${THUMB_PALETTE[2]}"/>
    <rect x="84" y="67" width="8" height="11" fill="${THUMB_PALETTE[4]}"/>
  </svg>`;
}

export function buildAllThumbs() {
  buildNetworkThumb(document.getElementById('thumb-network'));
  buildFlowThumb(document.getElementById('thumb-flow'));
  buildGridThumb(document.getElementById('thumb-grid'), 'small');
  buildTimelineThumb(document.getElementById('thumb-timeline'));
  buildNetworkThumb(document.getElementById('tile-thumb-network'));
  buildFlowThumb(document.getElementById('tile-thumb-flow'));
  buildGridThumb(document.getElementById('tile-thumb-grid'), 'large');
  buildTimelineThumb(document.getElementById('tile-thumb-timeline'));
}

// ── resetFlowColors (needs access to flow module) ─────
export function resetFlowColors() {
  if (!state.activeBookId) return;
  const book = getBook(state.activeBookId); if (!book) return;
  book.colorMap = { ...(book.defaultColorMap || book.colorMap) };
  saveBook(book);
  buildSidebarColors(book);
  if (state.colorModalBookId === state.activeBookId) buildCEGrid(book);
  if (state.activeVis === 'flow') {
    state.visInitialised.flow = false;
    setActiveVis('flow');
  }
}

// ── DOM initialisation (called once from main.js) ─────
export function initVisualise() {
  // vis-book-title blur — update library on title edit
  document.getElementById('vis-book-title').addEventListener('blur', function() {
    const id = this.dataset.bookId; if (!id) return;
    const book = getBook(id); if (!book) return;
    book.title = this.textContent.trim() || 'Untitled';
    saveBook(book);
    if (_renderLibrary) _renderLibrary();
  });
}
