import { state, resetVisInitialised } from './state.js';
import {
  getAllBooks, getBook, saveBook, deleteBook, genId,
  buildColorMap, parseLettersCSV, triggerDownload, escXML,
} from './storage.js';

// ── Injected cross-module dependencies ───────────────
let _updateNavState = null;
let _openColorModal = null;
let _navigate       = null;

export function setUpdateNavState(fn) { _updateNavState = fn; }
export function setOpenColorModal(fn) { _openColorModal = fn; }
export function setNavigate(fn)       { _navigate       = fn; }

// ── Library rendering ─────────────────────────────────
export function renderLibrary() {
  const books = getAllBooks();
  document.getElementById('lib-count').textContent = books.length + (books.length === 1 ? ' Book' : ' Books');
  const grid = document.getElementById('book-grid');
  grid.innerHTML = '';

  const addCard = document.createElement('div');
  addCard.className = 'book-card add-card';
  addCard.innerHTML = `<div class="add-icon">+</div><div class="add-label">Add a Book</div><div class="add-sub">Upload a CSV to get started</div>`;
  addCard.onclick = openUploadModal;
  grid.appendChild(addCard);

  books.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    const allChars  = Object.keys(book.colorMap);
    const visChips  = allChars.slice(0, 14).map(c =>
      `<div class="color-chip" style="background:${book.colorMap[c]}"></div>`
    ).join('');
    const more = allChars.length > 14
      ? `<span class="color-strip-more">+${allChars.length - 14}</span>` : '';
    card.innerHTML = `
      <div class="color-strip">${visChips}${more}</div>
      <span class="book-title-edit" contenteditable="true" spellcheck="false" data-id="${book.id}">${escXML(book.title)}</span>
      <span class="book-author-edit" contenteditable="true" spellcheck="false" data-id="${book.id}">${escXML(book.author)}</span>
      <div class="book-stats">
        <div><div class="bs-num">${book.letterCount}</div><div class="bs-label">Letters</div></div>
        <div><div class="bs-num">${book.characterCount}</div><div class="bs-label">Characters</div></div>
      </div>
      <div class="book-actions">
        <button class="btn btn-primary" style="flex:1" onclick="visualiseBook('${book.id}')">Visualise</button>
        <button class="btn btn-ghost" onclick="openColorModal('${book.id}')">Edit Colours</button>
        <button class="btn btn-ghost" onclick="confirmRemoveBook('${book.id}')">Remove</button>
      </div>`;

    card.querySelector('.book-title-edit').addEventListener('blur', function() {
      const b = getBook(book.id); if (!b) return;
      b.title = this.textContent.trim() || 'Untitled';
      saveBook(b);
    });
    card.querySelector('.book-author-edit').addEventListener('blur', function() {
      const b = getBook(book.id); if (!b) return;
      b.author = this.textContent.trim();
      saveBook(b);
    });
    grid.appendChild(card);
  });
}

export function confirmRemoveBook(id) {
  const book = getBook(id);
  if (!book) return;
  if (!confirm(`Remove "${book.title}" from your library? This cannot be undone.`)) return;
  if (state.activeBookId === id) { state.activeBookId = null; state.activeVis = null; }
  deleteBook(id);
  _updateNavState();
  renderLibrary();
}

export function visualiseBook(id) {
  state.activeBookId = id;
  state.activeVis    = null;
  resetVisInitialised();
  _navigate('visualise');
}

// ── Library export / import ───────────────────────────
export function exportLibrary() {
  const books = getAllBooks();
  if (!books.length) { alert('No books to export.'); return; }
  triggerDownload(
    new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' }),
    'yours_and_c_library.json'
  );
}

export function importLibraryTrigger() {
  document.getElementById('lib-import-input').click();
}

export function importLibrary(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const books = JSON.parse(e.target.result);
      if (!Array.isArray(books)) throw new Error('Invalid library file.');
      books.forEach(book => {
        if (!book.id || !book.letters) return;
        const existing = getAllBooks().find(b =>
          b.title.toLowerCase()  === book.title.toLowerCase() &&
          b.author.toLowerCase() === (book.author || '').toLowerCase()
        );
        if (existing) {
          if (!confirm(`"${book.title}" already exists in your library. Replace it?`)) return;
          deleteBook(existing.id);
        }
        saveBook(book);
      });
      _updateNavState();
      renderLibrary();
    } catch (err) { alert('Could not import library: ' + err.message); }
  };
  reader.readAsText(file);
  input.value = '';
}

// ── Upload modal ──────────────────────────────────────
export function openUploadModal() {
  state.uploadParsedData = null;
  document.getElementById('upload-filename').style.display  = 'none';
  document.getElementById('upload-error').style.display     = 'none';
  document.getElementById('upload-zone').className          = 'upload-zone';
  document.getElementById('upload-title').value             = '';
  document.getElementById('upload-author').value            = '';
  document.getElementById('upload-year').value              = '';
  document.getElementById('upload-submit').disabled         = true;
  document.getElementById('csv-file-input').value           = '';
  document.getElementById('upload-modal').classList.add('open');
}

export function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('open');
}

export function handleUploadFile(input) {
  if (input.files[0]) processUploadFile(input.files[0]);
}

export function processUploadFile(file) {
  const errEl = document.getElementById('upload-error');
  const fnEl  = document.getElementById('upload-filename');
  errEl.style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      state.uploadParsedData = parseLettersCSV(e.target.result);
      fnEl.textContent = '✓  ' + file.name;
      fnEl.style.display = 'block';
      document.getElementById('upload-zone').classList.add('has-file');
      if (!document.getElementById('upload-title').value) {
        document.getElementById('upload-title').value = file.name
          .replace(/\.csv$/i, '').replace(/[_-]/g, ' ');
      }
      document.getElementById('upload-submit').disabled = false;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      state.uploadParsedData = null;
      document.getElementById('upload-submit').disabled = true;
    }
  };
  reader.readAsText(file);
}

export function submitUpload() {
  if (!state.uploadParsedData) return;
  const title  = document.getElementById('upload-title').value.trim()  || 'Untitled';
  const author = document.getElementById('upload-author').value.trim() || '';
  const year   = document.getElementById('upload-year').value.trim()   || '';
  const colorMap = buildColorMap(state.uploadParsedData, {});
  const chars = [...new Set(state.uploadParsedData.flatMap(l => [l.from, l.to]))];
  const book = {
    id: genId(), suiteId: 'correspondence', title, author, year,
    addedAt:        new Date().toISOString(),
    letterCount:    state.uploadParsedData.length,
    characterCount: chars.length,
    letters:        state.uploadParsedData,
    colorMap,
    defaultColorMap: { ...colorMap },
    nameMap: {},
  };
  saveBook(book);
  state.uploadParsedData = null;
  closeUploadModal();
  _updateNavState();
  renderLibrary();
}

// ── DOM initialisation (called once from main.js) ─────
export function initLibrary() {
  // Upload zone drag-and-drop
  const uploadZone = document.getElementById('upload-zone');
  uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processUploadFile(file);
  });

  // Upload modal backdrop click to close
  document.getElementById('upload-modal').addEventListener('click', function(e) {
    if (e.target === this) closeUploadModal();
  });
}
