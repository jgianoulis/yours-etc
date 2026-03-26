import { state } from '../state.js';
import { getBook, escXML, triggerDownload } from '../storage.js';

// ── Module state ─────────────────────────────────────
let tlLetters = [], tlColorMap = {}, tlDotR = 5, tlRowH = 40;
let tlSelectedPair = null, tlLegendFilter = null;
let tlSenders = [], tlRecipients = [];
const MARGIN_TL = { top: 20, right: 20, bottom: 50, left: 220 };

// Stale-listener fix: keep a reference to remove before re-adding
let _resizeListener = null;

function getTlSvg()     { return document.getElementById('tl-svg'); }
function getTlTooltip() { return document.getElementById('tl-tooltip'); }

// ── Init ─────────────────────────────────────────────
export function initTimeline(letters, colorMap) {
  tlLetters = letters;
  tlColorMap = colorMap;
  tlSelectedPair = null;
  tlLegendFilter = null;
  const senderSet = new Set(letters.map(l => l.from));
  tlSenders = [...senderSet].sort((a, b) => {
    const ca = letters.filter(l => l.from === a).length;
    const cb = letters.filter(l => l.from === b).length;
    return cb - ca;
  });
  tlRecipients = [...new Set(letters.map(l => l.to))].sort();
  buildTLLegend();
  renderTimeline();

  // Remove old listener before adding new one
  if (_resizeListener) window.removeEventListener('resize', _resizeListener);
  _resizeListener = renderTimeline;
  window.addEventListener('resize', _resizeListener);
}

function createSVGEl(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

// ── Render ───────────────────────────────────────────
export function renderTimeline() {
  if (!tlLetters.length) return;
  const tlSvg   = getTlSvg();
  const tlTooltip = getTlTooltip();
  const minId = Math.min(...tlLetters.map(l => l.letter_num));
  const maxId = Math.max(...tlLetters.map(l => l.letter_num));
  const container = document.getElementById('vis-timeline');
  const availW    = container.clientWidth - 32;
  const innerW    = Math.max(600, availW - MARGIN_TL.left - MARGIN_TL.right);
  const svgW = innerW + MARGIN_TL.left + MARGIN_TL.right;
  const svgH = tlSenders.length * tlRowH + MARGIN_TL.top + MARGIN_TL.bottom;
  tlSvg.setAttribute('width',  svgW);
  tlSvg.setAttribute('height', svgH);
  tlSvg.innerHTML = '';

  const g = createSVGEl('g');
  g.setAttribute('transform', `translate(${MARGIN_TL.left},${MARGIN_TL.top})`);
  tlSvg.appendChild(g);

  const xS = id => ((id - minId) / (maxId - minId || 1)) * innerW;
  const yS = s  => tlSenders.indexOf(s) * tlRowH + tlRowH / 2;

  const spans = {};
  tlSenders.forEach(s => {
    const ids = tlLetters.filter(l => l.from === s).map(l => l.letter_num);
    spans[s] = { min: Math.min(...ids), max: Math.max(...ids) };
  });

  // Grid lines
  [minId, ...[25, 50, 75, 100, 125, 150, 175].filter(t => t > minId && t < maxId), maxId].forEach(t => {
    const x  = xS(t);
    const gl = createSVGEl('line');
    gl.setAttribute('x1', x); gl.setAttribute('x2', x);
    gl.setAttribute('y1', 0); gl.setAttribute('y2', tlSenders.length * tlRowH);
    gl.setAttribute('stroke', '#d8d6d0'); gl.setAttribute('stroke-width', '1');
    g.appendChild(gl);
    const tick = createSVGEl('text');
    tick.setAttribute('x', x); tick.setAttribute('y', tlSenders.length * tlRowH + 20);
    tick.setAttribute('text-anchor', 'middle'); tick.setAttribute('fill', '#999990');
    tick.setAttribute('font-size', '11'); tick.setAttribute('font-family', 'Barlow,sans-serif');
    tick.textContent = t;
    g.appendChild(tick);
  });

  // Axis label
  const axL = createSVGEl('text');
  axL.setAttribute('x', innerW / 2); axL.setAttribute('y', tlSenders.length * tlRowH + 42);
  axL.setAttribute('text-anchor', 'middle'); axL.setAttribute('fill', '#999990');
  axL.setAttribute('font-size', '11'); axL.setAttribute('font-family', 'Barlow Condensed,sans-serif');
  axL.setAttribute('letter-spacing', '1');
  axL.textContent = 'Letter number (chronological order)';
  g.appendChild(axL);

  // Rows
  tlSenders.forEach(sender => {
    const y        = yS(sender);
    const sp       = spans[sender];
    const isSender = tlSelectedPair && tlSelectedPair.from === sender;
    const isRecip  = tlSelectedPair && tlSelectedPair.to   === sender;

    const sl = createSVGEl('line');
    sl.setAttribute('x1', xS(sp.min)); sl.setAttribute('x2', xS(sp.max));
    sl.setAttribute('y1', y); sl.setAttribute('y2', y);
    sl.setAttribute('stroke', '#d8d6d0'); sl.setAttribute('stroke-width', '2');
    g.appendChild(sl);

    const sdot = createSVGEl('circle');
    sdot.setAttribute('cx', -16); sdot.setAttribute('cy', y); sdot.setAttribute('r', 5);
    sdot.setAttribute('fill', tlColorMap[sender] || '#888');
    if (tlSelectedPair && !isSender && !isRecip) sdot.setAttribute('opacity', '0.2');
    g.appendChild(sdot);

    const lbl = createSVGEl('text');
    lbl.setAttribute('x', -28); lbl.setAttribute('y', y + 4);
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('font-family', 'Barlow,sans-serif'); lbl.setAttribute('font-size', '12');
    if      (isSender)      { lbl.setAttribute('fill', '#0f0f0f'); lbl.setAttribute('font-weight', '700'); }
    else if (isRecip)       { lbl.setAttribute('fill', tlColorMap[tlSelectedPair.to] || '#555'); lbl.setAttribute('font-weight', '600'); }
    else if (tlSelectedPair){ lbl.setAttribute('fill', '#cccccc'); }
    else                    { lbl.setAttribute('fill', '#555550'); }
    lbl.textContent = sender;
    g.appendChild(lbl);
  });

  // Dots
  tlLetters.forEach(letter => {
    const x        = xS(letter.letter_num);
    const y        = yS(letter.from);
    const isActive = tlSelectedPair && (
      (tlSelectedPair.from === letter.from && tlSelectedPair.to === letter.to) ||
      (tlSelectedPair.from === letter.to   && tlSelectedPair.to === letter.from)
    );
    const isLegend = tlLegendFilter && letter.to === tlLegendFilter;
    const hasSel   = tlSelectedPair || tlLegendFilter;
    let r = tlDotR, opacity = 1, stroke = 'none', sw = 0;
    if (hasSel) {
      if (isActive || isLegend) { r = tlDotR + 1.5; stroke = '#fff'; sw = 1.5; }
      else opacity = 0.07;
    }
    const c = createSVGEl('circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r);
    c.setAttribute('fill', tlColorMap[letter.to] || '#888');
    c.setAttribute('opacity', opacity); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', sw);
    c.setAttribute('cursor', 'pointer');
    c.addEventListener('mouseenter', e => showTLTip(e, letter, tlTooltip));
    c.addEventListener('mouseleave', () => tlTooltip.classList.remove('visible'));
    c.addEventListener('click', e => { e.stopPropagation(); onTLDotClick(letter); });
    g.appendChild(c);
  });

  tlSvg.addEventListener('click', clearTLSelection);
}

function showTLTip(e, l, tooltip) {
  tooltip.innerHTML = `<strong>Letter ${l.letter_num}</strong><span class="tt-route">${escXML(l.from)} → ${escXML(l.to)}</span>${l.date ? `<em style="color:rgba(255,255,255,0.55);font-size:0.75rem">${escXML(l.date)}</em>` : ''}`;
  tooltip.classList.add('visible');
  tooltip.style.left = Math.min(e.clientX + 14, window.innerWidth - 290) + 'px';
  tooltip.style.top  = (e.clientY - 10) + 'px';
}

function onTLDotClick(letter) {
  if (tlSelectedPair && tlSelectedPair.from === letter.from && tlSelectedPair.to === letter.to) {
    tlSelectedPair = null;
  } else {
    tlSelectedPair = { from: letter.from, to: letter.to };
    tlLegendFilter = null;
  }
  updateTLLegend();
  renderTimeline();
}

// ── Legend ───────────────────────────────────────────
export function buildTLLegend() {
  const container = document.getElementById('tl-legend-rows');
  container.innerHTML = '';
  tlRecipients.forEach(r => {
    const item = document.createElement('div');
    item.className = 'tl-leg-item';
    item.dataset.recip = r;
    const dot  = document.createElement('div'); dot.className = 'tl-leg-dot'; dot.style.background = tlColorMap[r] || '#888';
    const name = document.createElement('span'); name.className = 'tl-leg-name'; name.textContent = r;
    item.appendChild(dot); item.appendChild(name);
    item.addEventListener('click', e => { e.stopPropagation(); onTLLegendClick(r); });
    container.appendChild(item);
  });
}

function onTLLegendClick(r) {
  tlLegendFilter = tlLegendFilter === r ? null : r;
  if (tlLegendFilter) tlSelectedPair = null;
  updateTLLegend();
  renderTimeline();
}

export function updateTLLegend() {
  document.querySelectorAll('.tl-leg-item').forEach(item => {
    item.classList.remove('active', 'dimmed');
    if (tlLegendFilter) {
      if (item.dataset.recip === tlLegendFilter) item.classList.add('active');
      else item.classList.add('dimmed');
    }
  });
}

export function clearTLSelection() {
  tlSelectedPair = null;
  tlLegendFilter = null;
  updateTLLegend();
  renderTimeline();
}

// ── Controls ─────────────────────────────────────────
export function updateDotR(inp) {
  tlDotR = parseInt(inp.value);
  document.getElementById('dotr-val').textContent = tlDotR + 'px';
  document.getElementById('dotr-fill').style.width = ((tlDotR - 3) / 7 * 100) + '%';
  renderTimeline();
}

export function updateRowH(inp) {
  tlRowH = parseInt(inp.value);
  document.getElementById('rowh-val').textContent = tlRowH + 'px';
  document.getElementById('rowh-fill').style.width = ((tlRowH - 24) / 40 * 100) + '%';
  renderTimeline();
}

// ── Download ─────────────────────────────────────────
export function downloadTimelineSVG() {
  const tlSvg = getTlSvg();
  const book  = getBook(state.activeBookId);
  triggerDownload(
    new Blob([new XMLSerializer().serializeToString(tlSvg)], { type: 'image/svg+xml' }),
    'yours-etc-sequence' + (book ? '-' + book.title : '') + '.svg'
  );
}
