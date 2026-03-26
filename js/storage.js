import { AUTO_PALETTE } from './state.js';

// ── localStorage helpers ─────────────────────────────
export function getIndex() {
  try { return JSON.parse(localStorage.getItem('cl_library_index') || '[]'); } catch { return []; }
}
export function saveIndex(idx) {
  localStorage.setItem('cl_library_index', JSON.stringify(idx));
}
export function getBook(id) {
  try { return JSON.parse(localStorage.getItem('cl_book_' + id)); } catch { return null; }
}
export function saveBook(book) {
  localStorage.setItem('cl_book_' + book.id, JSON.stringify(book));
  const idx = getIndex();
  if (!idx.includes(book.id)) { idx.push(book.id); saveIndex(idx); }
}
export function deleteBook(id) {
  localStorage.removeItem('cl_book_' + id);
  saveIndex(getIndex().filter(i => i !== id));
}
export function getAllBooks() {
  return getIndex().map(getBook).filter(Boolean);
}
export function genId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Colour map helpers ───────────────────────────────
export function buildColorMap(letters, existingMap) {
  const chars = [...new Set(letters.flatMap(l => [l.from, l.to]))].sort();
  let pi = 0;
  const map = {};
  chars.forEach(c => {
    map[c] = (existingMap && existingMap[c]) || AUTO_PALETTE[pi++ % AUTO_PALETTE.length];
  });
  return map;
}

export function applyNameMap(letters, nameMap) {
  if (!nameMap || !Object.keys(nameMap).length) return letters;
  return letters.map(l => ({
    ...l,
    to:   nameMap[l.to]   || l.to,
    from: nameMap[l.from] || l.from,
  }));
}

// ── CSV parsing ──────────────────────────────────────
export function parseCSVRow(line) {
  const res = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
    else if (ch===',' && !inQ) { res.push(cur); cur=''; }
    else cur += ch;
  }
  res.push(cur);
  return res;
}

export function parseLettersCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const numIdx   = header.indexOf('letter_num');
  const fromIdx  = header.indexOf('from');
  const toIdx    = header.indexOf('to');
  const topicIdx = header.indexOf('topic');
  const dateIdx  = header.indexOf('date');
  if (numIdx  === -1) throw new Error('Missing required column: letter_num');
  if (fromIdx === -1) throw new Error('Missing required column: from');
  if (toIdx   === -1) throw new Error('Missing required column: to');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVRow(lines[i]);
    const num = parseInt(cols[numIdx]);
    if (isNaN(num)) continue;
    const from = (cols[fromIdx] || '').trim();
    const to   = (cols[toIdx]   || '').trim();
    if (!from || !to) continue;
    rows.push({
      letter_num: num, from, to,
      topic: topicIdx !== -1 ? (cols[topicIdx] || '').trim() : '',
      date:  dateIdx  !== -1 ? (cols[dateIdx]  || '').trim() : '',
    });
  }
  if (!rows.length) throw new Error('No valid rows found in CSV.');
  rows.sort((a, b) => a.letter_num - b.letter_num);
  return rows;
}

// ── Utilities ────────────────────────────────────────
export function escXML(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
