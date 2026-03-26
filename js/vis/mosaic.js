import { state } from '../state.js';
import { getBook, escXML, triggerDownload } from '../storage.js';

// ── Module state ─────────────────────────────────────
let gridLetters = [], gridColorMap = {}, gridShape = 'square', gridBgColor = '#ffffff';
let gridCols = 10, gridGap = 40, gridIncludeLegend = false, gridPDFDPI = 150;
let gridActiveChar = null, gridActiveLetter = null, gridActiveTopics = new Set();

function getTooltip() { return document.getElementById('grid-tooltip'); }

// ── Init ─────────────────────────────────────────────
export function initGrid(letters, colorMap) {
  gridLetters = letters;
  gridColorMap = colorMap;
  renderGrid();
  const hasTopic = letters.some(l => l.topic);
  document.getElementById('topic-section').style.display = hasTopic ? 'block' : 'none';
  if (hasTopic) buildTopicCloud();

  // Click outside grid to clear filters — attach once on first init
  if (!initGrid._listenerAttached) {
    document.addEventListener('click', e => {
      if (!e.target.closest('#letter-grid') && !e.target.closest('#topic-cloud')) {
        if (gridActiveChar)   { gridActiveChar   = null; gridApplyHighlight(); }
        if (gridActiveLetter) { gridActiveLetter = null; gridApplyHighlight(); }
      }
    });
    initGrid._listenerAttached = true;
  }
}
initGrid._listenerAttached = false;

// ── Render ───────────────────────────────────────────
export function renderGrid() {
  const g = document.getElementById('letter-grid');
  g.style.gridTemplateColumns = `repeat(${gridCols},1fr)`;
  g.style.gap = gridGap + 'px';
  g.innerHTML = '';
  gridLetters.forEach(letter => {
    const sq = document.createElement('div');
    sq.className = 'letter-square';
    sq.dataset.from   = letter.from;
    sq.dataset.to     = letter.to;
    sq.dataset.num    = letter.letter_num;
    sq.dataset.topics = letter.topic
      ? letter.topic.split(',').map(t => t.trim()).filter(Boolean).join('|')
      : '';
    sq.style.borderRadius = gridShape === 'circle' ? '50%' : '1px';

    const left  = document.createElement('div');
    left.className = 'half';
    left.style.backgroundColor = gridColorMap[letter.from] || '#888';
    const right = document.createElement('div');
    right.className = 'half';
    right.style.backgroundColor = gridColorMap[letter.to] || '#888';
    sq.appendChild(left);
    sq.appendChild(right);

    const tooltip = getTooltip();
    sq.addEventListener('mouseenter', () => {
      const pills = letter.topic
        ? letter.topic.split(',').map(t => t.trim()).filter(Boolean)
            .map(t => `<span class="tt-pill">${escXML(t)}</span>`).join('')
        : '';
      tooltip.innerHTML = `<strong>Letter ${letter.letter_num}</strong><span class="tt-route">${escXML(letter.from)} → ${escXML(letter.to)}</span>${pills ? `<div class="tt-topics">${pills}</div>` : ''}`;
      tooltip.classList.add('visible');
    });
    sq.addEventListener('mousemove', e => {
      tooltip.style.left = Math.min(e.clientX + 14, window.innerWidth - 290) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
    });
    sq.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    sq.addEventListener('click', e => {
      e.stopPropagation();
      if (gridActiveLetter && gridActiveLetter.num === letter.letter_num) {
        gridActiveLetter = null;
      } else {
        gridActiveLetter = { from: letter.from, to: letter.to, num: letter.letter_num };
      }
      gridApplyHighlight();
    });
    g.appendChild(sq);
  });
  gridApplyHighlight();
}

export function gridApplyHighlight() {
  const anyFilter = gridActiveChar || gridActiveLetter || gridActiveTopics.size > 0;
  document.querySelectorAll('#letter-grid .letter-square').forEach(sq => {
    if (!anyFilter) { sq.style.opacity = '1'; return; }
    const charMatch  = !gridActiveChar   || sq.dataset.from === gridActiveChar || sq.dataset.to === gridActiveChar;
    const letMatch   = !gridActiveLetter || (sq.dataset.from === gridActiveLetter.from && sq.dataset.to === gridActiveLetter.to);
    const tops       = (sq.dataset.topics || '').split('|').filter(Boolean);
    const topicMatch = !gridActiveTopics.size || tops.some(t => gridActiveTopics.has(t));
    sq.style.opacity = (charMatch && letMatch && topicMatch) ? '1' : '0.12';
  });
}

// ── Controls ─────────────────────────────────────────
export function setShape(s) {
  gridShape = s;
  document.getElementById('btn-square').classList.toggle('active', s === 'square');
  document.getElementById('btn-circle').classList.toggle('active', s === 'circle');
  document.querySelectorAll('#letter-grid .letter-square').forEach(sq => {
    sq.style.borderRadius = s === 'circle' ? '50%' : '1px';
  });
}

export function setBgColor(v) {
  gridBgColor = v;
  document.getElementById('bg-hex').textContent = v;
  document.getElementById('bg-color').parentElement.style.background = v;
  document.documentElement.style.setProperty('--grid-bg', v);
}

export function updateColsSlider(inp) {
  gridCols = parseInt(inp.value);
  document.getElementById('cols-val').textContent = gridCols;
  document.getElementById('cols-fill').style.width = ((gridCols - 5) / 15 * 100) + '%';
  document.getElementById('letter-grid').style.gridTemplateColumns = `repeat(${gridCols},1fr)`;
}

export function updateGapSlider(inp) {
  gridGap = parseInt(inp.value);
  document.getElementById('gap-val').textContent = gridGap + 'px';
  document.getElementById('gap-fill').style.width = (gridGap / 80 * 100) + '%';
  document.getElementById('letter-grid').style.gap = gridGap + 'px';
}

export function setIncludeLegend(v) {
  gridIncludeLegend = v;
  document.getElementById('btn-leg-yes').classList.toggle('active', v);
  document.getElementById('btn-leg-no').classList.toggle('active', !v);
}

export function setPDFDPI(dpi) {
  gridPDFDPI = dpi;
  [72, 150, 300].forEach(d =>
    document.getElementById('btn-dpi-' + d).classList.toggle('active', d === dpi)
  );
}

// ── Topic cloud ──────────────────────────────────────
export function buildTopicCloud() {
  const cloud = document.getElementById('topic-cloud');
  cloud.innerHTML = '';
  const freq = new Map();
  gridLetters.forEach(l => {
    if (!l.topic) return;
    l.topic.split(',').map(t => t.trim()).filter(Boolean).forEach(t =>
      freq.set(t, (freq.get(t) || 0) + 1)
    );
  });
  if (!freq.size) return;
  const all  = [...freq.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxF = Math.max(...freq.values());
  const minF = Math.min(...freq.values());
  all.forEach(([topic, count]) => {
    const scale = maxF === minF ? 0.5 : (count - minF) / (maxF - minF);
    const bw = Math.round(2 + scale * 3);
    const l  = Math.round(192 - scale * 177);
    const bc = `rgb(${l},${l},${Math.round(l * 0.95)})`;
    const tag = document.createElement('span');
    tag.className = 'topic-tag';
    tag.textContent = topic;
    tag.style.borderBottomWidth = bw + 'px';
    tag.style.borderBottomColor = bc;
    tag.dataset.topic = topic;
    tag.dataset.bw    = bw;
    tag.addEventListener('click', e => {
      e.stopPropagation();
      if (gridActiveTopics.has(topic)) {
        gridActiveTopics.delete(topic);
        tag.classList.remove('active');
        tag.style.borderBottomColor = bc;
      } else {
        gridActiveTopics.add(topic);
        tag.classList.add('active');
        tag.style.borderBottomColor = '';
      }
      gridApplyHighlight();
    });
    cloud.appendChild(tag);
  });
}

export function clearActiveTopics() {
  gridActiveTopics.clear();
  document.querySelectorAll('.topic-tag').forEach(t => {
    t.classList.remove('active');
    const s = (parseInt(t.dataset.bw) - 2) / 3;
    const l = Math.round(192 - s * 177);
    t.style.borderBottomColor = `rgb(${l},${l},${Math.round(l * 0.95)})`;
  });
  gridApplyHighlight();
}

// ── Export helpers ───────────────────────────────────
function buildGridExportSVG(forRepeat) {
  const cols = gridCols, gap = gridGap, cellSize = 60, isCircle = gridShape === 'circle';
  const rows    = Math.ceil(gridLetters.length / cols);
  const margin  = forRepeat ? gap / 2 : gap * 2;
  const totalW  = cols * cellSize + (cols - 1) * gap + margin * 2;
  const gridH   = rows * cellSize + (rows - 1) * gap + margin * 2;
  const book    = getBook(state.activeBookId);
  const titleStr = book ? book.title : 'Correspondence';
  const titleBlockH = forRepeat ? 0 : gap * 2 + 28 + (gap * 2 / 3);
  const legendCols = 3, swatchSize = 26, labelFontSize = 13, innerPad = margin;
  const legendColW = (totalW - innerPad * 2) / legendCols;
  const sortedChars = [...new Set(gridLetters.flatMap(l => [l.from, l.to]))].sort();
  const legendRows  = Math.ceil(sortedChars.length / legendCols);
  const legendRowH  = swatchSize + 12;
  const legendH = (!forRepeat && gridIncludeLegend) ? gap * 2 + legendRows * legendRowH + innerPad : 0;
  const totalH  = titleBlockH + gridH + legendH;
  const parts   = [`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`];
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="${gridBgColor}"/>`);
  if (!forRepeat) parts.push(`<text x="${totalW / 2}" y="${gap * 2 + 28}" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#2a1f14" letter-spacing="1">${escXML(titleStr)}</text>`);
  gridLetters.forEach((letter, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = margin + col * (cellSize + gap), y = titleBlockH + margin + row * (cellSize + gap);
    const fc = gridColorMap[letter.from] || '#888', tc = gridColorMap[letter.to] || '#888';
    const r  = cellSize / 2;
    if (isCircle) {
      const cx = x + r, cy = y + r;
      parts.push(`<path d="M${cx},${cy-r} A${r},${r} 0 0,0 ${cx},${cy+r} Z" fill="${fc}"/>`);
      parts.push(`<path d="M${cx},${cy-r} A${r},${r} 0 0,1 ${cx},${cy+r} Z" fill="${tc}"/>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(42,31,20,0.3)" stroke-width="1.5"/>`);
    } else {
      parts.push(`<rect x="${x}" y="${y}" width="${r}" height="${cellSize}" fill="${fc}"/>`);
      parts.push(`<rect x="${x+r}" y="${y}" width="${r}" height="${cellSize}" fill="${tc}"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="none" stroke="rgba(42,31,20,0.3)" stroke-width="1.5"/>`);
    }
  });
  if (!forRepeat && gridIncludeLegend) {
    const bx = margin, by = titleBlockH + gridH + gap * 2;
    const bw = totalW - margin * 2, bh = legendRows * legendRowH + innerPad;
    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="rgba(255,255,255,0.45)" stroke="rgba(42,31,20,0.15)" stroke-width="1"/>`);
    sortedChars.forEach((char, i) => {
      const lc = i % legendCols, lr = Math.floor(i / legendCols);
      const ex = bx + innerPad * 0.5 + lc * legendColW, ey = by + innerPad * 0.5 + lr * legendRowH;
      const hex = gridColorMap[char] || '#888';
      parts.push(`<rect x="${ex}" y="${ey+(legendRowH-swatchSize)/2}" width="${swatchSize}" height="${swatchSize}" rx="2" fill="${hex}" stroke="rgba(42,31,20,0.3)" stroke-width="1"/>`);
      parts.push(`<text x="${ex+swatchSize+8}" y="${ey+legendRowH/2+labelFontSize*0.35}" font-family="sans-serif" font-size="${labelFontSize}" fill="#2a1f14">${escXML(char)}</text>`);
    });
  }
  parts.push('</svg>');
  return { svgString: parts.join('\n'), totalW, totalH };
}

export function downloadGridSVG() {
  if (!gridLetters.length) return;
  const { svgString } = buildGridExportSVG(false);
  const book   = getBook(state.activeBookId);
  const suffix = `_${gridCols}col_${gridGap}gap_${gridShape}`;
  triggerDownload(
    new Blob([svgString], { type: 'image/svg+xml' }),
    'yours-etc-mosaic' + (book ? '-' + book.title : '') + suffix + '.svg'
  );
}

export function downloadGridRepeat() {
  if (!gridLetters.length) return;
  if (gridGap % 2 !== 0) {
    gridGap += 1;
    document.getElementById('gap-slider').value = gridGap;
    document.getElementById('gap-val').textContent = gridGap + 'px';
  }
  const { svgString } = buildGridExportSVG(true);
  const book = getBook(state.activeBookId);
  triggerDownload(
    new Blob([svgString], { type: 'image/svg+xml' }),
    'yours-etc-mosaic-repeat' + (book ? '-' + book.title : '') + `_${gridCols}col_${gridGap}gap_${gridShape}` + '.svg'
  );
}

export function downloadGridPDF() {
  if (!gridLetters.length) return;
  const { svgString, totalW, totalH } = buildGridExportSVG(false);
  const scale  = gridPDFDPI / 96;
  const canvas = document.createElement('canvas');
  canvas.width  = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const img  = new Image();
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  img.onload = () => {
    ctx.drawImage(img, 0, 0, totalW, totalH);
    URL.revokeObjectURL(url);
    const { jsPDF } = window.jspdf;
    const mm  = 25.4 / gridPDFDPI;
    const pdf = new jsPDF({
      orientation: totalW > totalH ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [totalW * mm, totalH * mm],
    });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, totalW * mm, totalH * mm);
    const book = getBook(state.activeBookId);
    pdf.save(
      'yours-etc-mosaic' + (book ? '-' + book.title : '') +
      `_${gridCols}col_${gridGap}gap_${gridShape}_${gridPDFDPI}dpi` + '.pdf'
    );
  };
  img.src = url;
}
