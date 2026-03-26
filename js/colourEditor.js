import { state } from './state.js';
import { getBook, saveBook, parseCSVRow, triggerDownload, escXML } from './storage.js';

// ── Injected cross-module dependencies ───────────────
let _redrawActiveVis   = null;
let _buildSidebarColors = null;

export function setRedrawActiveVis(fn)    { _redrawActiveVis    = fn; }
export function setBuildSidebarColors(fn) { _buildSidebarColors = fn; }

// ── Colour editor modal ───────────────────────────────
export function openColorModal(id) {
  state.colorModalBookId = id;
  const book = getBook(id); if (!book) return;
  document.getElementById('color-modal-title').textContent = 'Edit Character Colours — ' + book.title;
  buildCEGrid(book);
  buildNCRows(book);
  document.getElementById('color-modal').classList.add('open');
}

export function openColorModalForActive() {
  if (state.activeBookId) openColorModal(state.activeBookId);
}

export function closeColorModal() {
  document.getElementById('color-modal').classList.remove('open');
  state.colorModalBookId = null;
}

export function buildCEGrid(book) {
  const grid = document.getElementById('ce-grid');
  grid.innerHTML = '';
  const chars = Object.keys(book.colorMap).sort();
  chars.forEach(char => {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const hex = book.colorMap[char] || '#888888';

    const swatch = document.createElement('div');
    swatch.className = 'ce-swatch';
    swatch.style.background = hex;
    const picker = document.createElement('input');
    picker.type = 'color'; picker.value = hex;
    picker.addEventListener('focus', () => { swatch.classList.add('active-swatch'); row.classList.add('active-row'); });
    picker.addEventListener('blur',  () => { swatch.classList.remove('active-swatch'); row.classList.remove('active-row'); });
    picker.addEventListener('input', () => {
      swatch.style.background = picker.value;
      hexInput.value = picker.value;
      hexInput.classList.remove('invalid');
      updateBookColor(state.colorModalBookId, char, picker.value);
    });
    swatch.appendChild(picker);

    const hexInput = document.createElement('input');
    hexInput.type = 'text'; hexInput.className = 'ce-hex';
    hexInput.value = hex; hexInput.maxLength = 7; hexInput.spellcheck = false;
    hexInput.addEventListener('input', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        hexInput.classList.remove('invalid');
        swatch.style.background = val;
        picker.value = val;
        updateBookColor(state.colorModalBookId, char, val);
      } else hexInput.classList.add('invalid');
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'ce-name'; nameEl.textContent = char;

    row.appendChild(swatch); row.appendChild(hexInput); row.appendChild(nameEl);
    grid.appendChild(row);
  });
}

// ── Name corrections ──────────────────────────────────
export function buildNCRows(book) {
  const container = document.getElementById('nc-rows');
  container.innerHTML = '';
  const nm = book.nameMap || {};
  Object.entries(nm).forEach(([raw, corrected]) => addNCRowWithValues(raw, corrected));
  updateNCCount(Object.keys(nm).length);
}

export function addNCRow() { addNCRowWithValues('', ''); }

function addNCRowWithValues(raw, corrected) {
  const container = document.getElementById('nc-rows');
  const row = document.createElement('div');
  row.className = 'nc-row';

  const rawInput = document.createElement('input');
  rawInput.className = 'field-input'; rawInput.value = raw;
  rawInput.placeholder = 'Raw CSV name…'; rawInput.style.fontSize = '0.72rem';

  const arrow = document.createElement('div');
  arrow.className = 'nc-arrow'; arrow.textContent = '→';

  const corrInput = document.createElement('input');
  corrInput.className = 'field-input'; corrInput.value = corrected;
  corrInput.placeholder = 'Corrected name…'; corrInput.style.fontSize = '0.72rem';

  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-ghost btn-sm'; delBtn.textContent = '✕';
  delBtn.onclick = () => { row.remove(); saveNCRows(); };

  rawInput.addEventListener('blur', saveNCRows);
  corrInput.addEventListener('blur', saveNCRows);

  row.appendChild(rawInput); row.appendChild(arrow); row.appendChild(corrInput); row.appendChild(delBtn);
  container.appendChild(row);
}

export function saveNCRows() {
  if (!state.colorModalBookId) return;
  const book = getBook(state.colorModalBookId); if (!book) return;
  const rows = document.querySelectorAll('#nc-rows .nc-row');
  const nm = {};
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const raw  = inputs[0].value.trim();
    const corr = inputs[1].value.trim();
    if (raw && corr) nm[raw] = corr;
  });
  book.nameMap = nm;
  saveBook(book);
  updateNCCount(Object.keys(nm).length);
  if (state.activeBookId === state.colorModalBookId && state.activeVis) {
    import('./visualise.js').then(m => {
      Object.keys(state.visInitialised).forEach(k => state.visInitialised[k] = false);
      m.setActiveVis(state.activeVis);
    });
  }
}

function updateNCCount(n) {
  document.getElementById('nc-count').textContent =
    n ? `(${n} correction${n === 1 ? '' : 's'} defined)` : '';
}

export function toggleNCDisclosure() {
  document.getElementById('nc-body').classList.toggle('open');
}

// ── Colour update ─────────────────────────────────────
export function updateBookColor(bookId, char, hex) {
  const book = getBook(bookId); if (!book) return;
  book.colorMap[char] = hex;
  saveBook(book);
  if (bookId === state.activeBookId) {
    syncSidebarColorRow(char, hex);
    _redrawActiveVis();
  }
}

export function resetColorsToDefault() {
  if (!state.colorModalBookId) return;
  const book = getBook(state.colorModalBookId); if (!book) return;
  book.colorMap = { ...(book.defaultColorMap || book.colorMap) };
  saveBook(book);
  buildCEGrid(book);
  if (state.colorModalBookId === state.activeBookId) {
    _buildSidebarColors(book);
    _redrawActiveVis();
  }
}

// ── Palette import / export ───────────────────────────
export function importPaletteTrigger() {
  document.getElementById('palette-import-input').click();
}

export function importPalette(input) {
  if (!state.colorModalBookId) return;
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.trim().split(/\r?\n/);
    if (lines.length < 2) return;
    const header = parseCSVRow(lines[0]).map(h => h.trim().toLowerCase());
    const ci = header.indexOf('character'), hi = header.indexOf('hex_colour');
    if (ci === -1 || hi === -1) { alert('Palette CSV must have: character, hex_colour'); return; }
    const book = getBook(state.colorModalBookId); if (!book) return;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVRow(lines[i].trim());
      const ch = (cols[ci] || '').trim(), hx = (cols[hi] || '').trim();
      if (ch && /^#[0-9a-fA-F]{6}$/.test(hx)) book.colorMap[ch] = hx;
    }
    saveBook(book);
    buildCEGrid(book);
    if (state.colorModalBookId === state.activeBookId) {
      _buildSidebarColors(book);
      _redrawActiveVis();
    }
  };
  reader.readAsText(file);
  input.value = '';
}

export function exportPalette() {
  if (!state.colorModalBookId) return;
  const book = getBook(state.colorModalBookId); if (!book) return;
  const rows = [['character', 'hex_colour']];
  Object.entries(book.colorMap).forEach(([c, h]) => rows.push([`"${c}"`, h]));
  triggerDownload(
    new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }),
    'yours-etc-colours' + (book ? '-' + book.title : '') + '.csv'
  );
}

export function exportPaletteFromActive() {
  if (!state.activeBookId) return;
  const prev = state.colorModalBookId;
  state.colorModalBookId = state.activeBookId;
  exportPalette();
  state.colorModalBookId = prev;
}

// ── Sidebar colour panel ──────────────────────────────
export function buildSidebarColors(book) {
  const body = document.getElementById('sb-colors-body');
  body.innerHTML = '';
  const chars = Object.keys(book.colorMap).sort();
  chars.forEach(char => {
    const row = document.createElement('div');
    row.className = 'sb-color-row';
    row.dataset.char = char;
    const hex = book.colorMap[char] || '#888';

    const swatch = document.createElement('div');
    swatch.className = 'sb-swatch';
    swatch.style.background = hex;
    const picker = document.createElement('input');
    picker.type = 'color'; picker.value = hex;
    picker.addEventListener('input', () => {
      swatch.style.background = picker.value;
      hexInp.value = picker.value;
      hexInp.classList.remove('invalid');
      updateBookColor(state.activeBookId, char, picker.value);
    });
    swatch.appendChild(picker);

    const hexInp = document.createElement('input');
    hexInp.className = 'sb-hex'; hexInp.value = hex; hexInp.maxLength = 7;
    hexInp.addEventListener('input', () => {
      let v = hexInp.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        hexInp.classList.remove('invalid');
        swatch.style.background = v; picker.value = v;
        updateBookColor(state.activeBookId, char, v);
      } else hexInp.classList.add('invalid');
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'sb-char'; nameEl.textContent = char;

    row.appendChild(swatch); row.appendChild(hexInp); row.appendChild(nameEl);
    body.appendChild(row);
  });
}

export function syncSidebarColorRow(char, hex) {
  const row = document.querySelector(`#sb-colors-body .sb-color-row[data-char="${CSS.escape(char)}"]`);
  if (!row) return;
  row.querySelector('.sb-swatch').style.background = hex;
  const picker = row.querySelector('input[type=color]');
  if (picker) picker.value = hex;
  const hexInp = row.querySelector('.sb-hex');
  if (hexInp) hexInp.value = hex;
}

export function toggleColorDisclosure() {
  document.getElementById('sb-colors-header').classList.toggle('open');
  document.getElementById('sb-colors-body').classList.toggle('open');
}

// ── DOM initialisation (called once from main.js) ─────
export function initColourEditor() {
  document.getElementById('color-modal').addEventListener('click', function(e) {
    if (e.target === this) closeColorModal();
  });
}
