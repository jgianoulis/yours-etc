import { state } from '../state.js';
import { getBook, escXML, triggerDownload } from '../storage.js';

// ── Module state ─────────────────────────────────────
const DPR = window.devicePixelRatio || 1;
let flowFlows = [], flowCOLORS = {}, flowDefColors = {}, flowLocked = null;
let flowLayout = null;
let flowMARGIN = { top: 10, right: 140, bottom: 20, left: 140 };
let flowLEFT = [], flowRIGHT = [];

// Stale-listener fix
let _resizeListener = null;

// Guard: attach canvas listeners only once
let _listenersAttached = false;

function getFlowCanvas() { return document.getElementById('flow-canvas'); }
function getFlowWrap()   { return document.getElementById('flow-wrap'); }
function getFlowTT()     { return document.getElementById('flow-tooltip'); }

// ── Init ─────────────────────────────────────────────
export function initFlow(letters, colorMap, title) {
  const counts = {};
  letters.forEach(l => {
    const k = `${l.from}|||${l.to}`;
    counts[k] = (counts[k] || 0) + 1;
  });
  flowFlows     = Object.entries(counts).map(([k, v]) => { const [s, t] = k.split('|||'); return { s, t, v }; });
  flowCOLORS    = { ...colorMap };
  flowDefColors = { ...colorMap };
  flowLocked    = null;
  deriveFlowOrders();

  document.getElementById('flow-title-input').value       = title || '';
  document.getElementById('flow-title-display').textContent = title || '';

  flowInit();

  if (_resizeListener) window.removeEventListener('resize', _resizeListener);
  _resizeListener = flowInit;
  window.addEventListener('resize', _resizeListener);

  attachCanvasListeners();
}

function attachCanvasListeners() {
  if (_listenersAttached) return;
  const flowCanvas = getFlowCanvas();
  flowCanvas.addEventListener('mousemove', e => {
    if (flowLocked) return;
    const hit = flowGetHit(e);
    const flowTT = getFlowTT();
    if (!hit) { flowTT.classList.remove('visible'); flowDraw(); flowCanvas.style.cursor = 'default'; return; }
    if (hit.type === 'sender') {
      const sent = flowFlows.filter(f => f.s === hit.node.name).reduce((a, f) => a + f.v, 0);
      showFlowTip(e, `<strong>${escXML(hit.node.name)}</strong><span class="tt-route">Sent: ${sent}</span>`);
      flowDraw(null, hit.node.name, null);
    } else if (hit.type === 'recipient') {
      const recv = flowFlows.filter(f => f.t === hit.node.name).reduce((a, f) => a + f.v, 0);
      showFlowTip(e, `<strong>${escXML(hit.node.name)}</strong><span class="tt-route">Received: ${recv}</span>`);
      flowDraw(null, null, hit.node.name);
    } else {
      showFlowTip(e, `<strong>${escXML(hit.ld.s)}</strong><span class="tt-route">→ ${escXML(hit.ld.t)}: ${hit.ld.value}</span>`);
      flowDraw(hit.ld, null, null);
    }
    flowCanvas.style.cursor = 'pointer';
  });
  flowCanvas.addEventListener('mouseleave', () => {
    if (!flowLocked) { getFlowTT().classList.remove('visible'); flowDraw(); }
  });
  flowCanvas.addEventListener('click', e => {
    const hit = flowGetHit(e);
    const flowTT = getFlowTT();
    if (!hit || hit.type === 'link') {
      flowLocked = null; flowTT.classList.remove('visible'); flowDraw();
      getFlowCanvas().style.cursor = 'default'; return;
    }
    const name = hit.node.name;
    if (flowLocked && flowLocked.type === hit.type && flowLocked.name === name) {
      flowLocked = null; flowTT.classList.remove('visible'); flowDraw();
      getFlowCanvas().style.cursor = 'default';
    } else {
      flowLocked = { type: hit.type, name };
      if (hit.type === 'sender') {
        showFlowTip(e, `<strong>${escXML(name)}</strong><span class="tt-route">Sent: ${flowFlows.filter(f => f.s === name).reduce((a, f) => a + f.v, 0)}</span>`);
        flowDraw(null, name, null);
      } else {
        showFlowTip(e, `<strong>${escXML(name)}</strong><span class="tt-route">Received: ${flowFlows.filter(f => f.t === name).reduce((a, f) => a + f.v, 0)}</span>`);
        flowDraw(null, null, name);
      }
    }
  });
  _listenersAttached = true;
}

// ── Orders ───────────────────────────────────────────
function deriveFlowOrders() {
  const lv = {}, rv = {};
  flowFlows.forEach(f => { lv[f.s] = (lv[f.s] || 0) + f.v; rv[f.t] = (rv[f.t] || 0) + f.v; });
  flowLEFT  = Object.entries(lv).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  flowRIGHT = Object.entries(rv).sort((a, b) => b[1] - a[1]).map(e => e[0]);
}

// ── Colour helpers ───────────────────────────────────
function flowHex2rgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
function flowAlpha(hex, a) { const {r,g,b} = flowHex2rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function flowDarken(hex, a) { const {r,g,b} = flowHex2rgb(hex); return `rgb(${Math.max(0,r-a)},${Math.max(0,g-a)},${Math.max(0,b-a)})`; }

// ── Dimensions ───────────────────────────────────────
function flowCalcDims() {
  const flowCanvas = getFlowCanvas();
  const maxN = Math.max(flowLEFT.length, flowRIGHT.length);
  const H    = Math.max(280, Math.min(1100, maxN * 52));
  const tmp  = flowCanvas.getContext('2d');
  tmp.font   = '13px "Barlow",sans-serif';
  const allN = [...flowLEFT, ...flowRIGHT];
  const maxW = allN.reduce((mx, n) => Math.max(mx, tmp.measureText(n).width), 0);
  const margin = Math.max(130, Math.ceil(maxW) + 16);
  return { H, margin };
}

// ── Layout ───────────────────────────────────────────
function flowBuildLayout(W, H, nodeW, nodePad) {
  const lv = {}, rv = {};
  flowLEFT.forEach(n  => lv[n] = 0);
  flowRIGHT.forEach(n => rv[n] = 0);
  flowFlows.forEach(f => { lv[f.s] = (lv[f.s] || 0) + f.v; rv[f.t] = (rv[f.t] || 0) + f.v; });
  const lp    = nodePad * (flowLEFT.length  - 1);
  const rp    = nodePad * (flowRIGHT.length - 1);
  const ls    = (H - lp) / flowLEFT.reduce((a,  n) => a + (lv[n] || 0), 0);
  const rs    = (H - rp) / flowRIGHT.reduce((a, n) => a + (rv[n] || 0), 0);
  const scale = Math.min(ls, rs);
  const lNodes = {}, rNodes = {};
  let y = (H - flowLEFT.reduce((a,  n) => a + Math.max(2, (lv[n]||0)*scale), 0) - (flowLEFT.length -1)*nodePad) / 2;
  flowLEFT.forEach(n  => { const h = Math.max(2, (lv[n]||0)*scale); lNodes[n] = {name:n, x:0, y, h}; y += h + nodePad; });
  y = (H - flowRIGHT.reduce((a, n) => a + Math.max(2, (rv[n]||0)*scale), 0) - (flowRIGHT.length-1)*nodePad) / 2;
  flowRIGHT.forEach(n => { const h = Math.max(2, (rv[n]||0)*scale); rNodes[n] = {name:n, x:W, y, h}; y += h + nodePad; });
  const lc = {}, rc = {};
  flowLEFT.forEach(n  => lc[n] = lNodes[n].y);
  flowRIGHT.forEach(n => rc[n] = rNodes[n].y);
  const sorted = [...flowFlows].sort((a, b) => {
    const ri = flowRIGHT.indexOf(a.t) - flowRIGHT.indexOf(b.t);
    return ri !== 0 ? ri : flowLEFT.indexOf(a.s) - flowLEFT.indexOf(b.s);
  });
  const linkData = sorted.map(f => {
    const w = Math.max(0.5, f.v * scale), sy = lc[f.s] || 0, ty = rc[f.t] || 0;
    lc[f.s] = (lc[f.s] || 0) + w;
    rc[f.t] = (rc[f.t] || 0) + w;
    return { s: f.s, t: f.t, value: f.v, width: w, sy, ty };
  });
  return { lNodes, rNodes, linkData, nodeW, scale, W, H };
}

// ── Canvas init ──────────────────────────────────────
function flowInit() {
  if (!flowFlows.length) return;
  const flowCanvas = getFlowCanvas();
  const flowWrap   = getFlowWrap();
  const wrapW = flowWrap.clientWidth;
  const { H, margin } = flowCalcDims();
  flowMARGIN = { top: 10, right: margin, bottom: 20, left: margin };
  const W = Math.max(80, wrapW - flowMARGIN.left - flowMARGIN.right);
  flowCanvas.width  = (W + flowMARGIN.left + flowMARGIN.right) * DPR;
  flowCanvas.height = (H + flowMARGIN.top  + flowMARGIN.bottom) * DPR;
  flowCanvas.style.width  = (W + flowMARGIN.left + flowMARGIN.right) + 'px';
  flowCanvas.style.height = (H + flowMARGIN.top  + flowMARGIN.bottom) + 'px';
  flowLayout = flowBuildLayout(W, H, 18, 9);
  flowRedrawWithLock();
}

// ── Draw ─────────────────────────────────────────────
export function flowDraw(hLink = null, hSender = null, hRecip = null) {
  if (!flowLayout) return;
  const flowCanvas = getFlowCanvas();
  const ctx = flowCanvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, flowCanvas.width / DPR, flowCanvas.height / DPR);
  ctx.save();
  ctx.translate(flowMARGIN.left, flowMARGIN.top);
  const { lNodes, rNodes, linkData, nodeW, W } = flowLayout;

  linkData.forEach(ld => {
    const isH = ld === hLink, sM = hSender && ld.s === hSender, rM = hRecip && ld.t === hRecip;
    let alpha;
    if      (hLink)   alpha = isH ? 0.75 : 0.06;
    else if (hSender) alpha = sM  ? 0.65 : 0.06;
    else if (hRecip)  alpha = rM  ? 0.65 : 0.06;
    else              alpha = 0.45;
    const x0 = nodeW, x1 = W, cx = (x0 + x1) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, ld.sy);
    ctx.bezierCurveTo(cx, ld.sy, cx, ld.ty, x1, ld.ty);
    ctx.lineTo(x1, ld.ty + ld.width);
    ctx.bezierCurveTo(cx, ld.ty + ld.width, cx, ld.sy + ld.width, x0, ld.sy + ld.width);
    ctx.closePath();
    ctx.fillStyle = flowAlpha(flowCOLORS[ld.s] || '#bbb', alpha);
    ctx.fill();
  });

  Object.values(lNodes).forEach(node => {
    const col = flowCOLORS[node.name] || '#bbb';
    const dim = (hRecip || hSender) && node.name !== hSender;
    ctx.fillStyle = node.name === hSender ? flowDarken(col, 20) : dim ? flowAlpha(col, 0.3) : col;
    ctx.fillRect(node.x, node.y, nodeW, node.h);
  });
  Object.values(rNodes).forEach(node => {
    const col = flowCOLORS[node.name] || '#e0e0e0';
    const dim = (hRecip || hSender) && node.name !== hRecip;
    ctx.fillStyle = node.name === hRecip ? flowDarken(col, 20) : dim ? flowAlpha(col, 0.3) : col;
    ctx.fillRect(W, node.y, nodeW, node.h);
  });

  ctx.textBaseline = 'middle';
  ctx.font = '12px "Barlow",sans-serif';
  Object.values(lNodes).forEach(node => { ctx.textAlign = 'right'; ctx.fillStyle = '#3a3a3a'; ctx.fillText(node.name, -8, node.y + node.h / 2); });
  Object.values(rNodes).forEach(node => { ctx.textAlign = 'left';  ctx.fillStyle = '#3a3a3a'; ctx.fillText(node.name, W + nodeW + 8, node.y + node.h / 2); });
  ctx.restore();
}

function flowRedrawWithLock() {
  if (!flowLocked)                    flowDraw();
  else if (flowLocked.type==='sender') flowDraw(null, flowLocked.name, null);
  else                                 flowDraw(null, null, flowLocked.name);
}

// ── Hit detection ────────────────────────────────────
function flowGetHit(e) {
  if (!flowLayout) return null;
  const flowCanvas = getFlowCanvas();
  const rect = flowCanvas.getBoundingClientRect();
  const sx   = (flowCanvas.width  / DPR) / rect.width;
  const sy   = (flowCanvas.height / DPR) / rect.height;
  const mx   = (e.clientX - rect.left) * sx - flowMARGIN.left;
  const my   = (e.clientY - rect.top)  * sy - flowMARGIN.top;
  const { lNodes, rNodes, linkData, nodeW, W } = flowLayout;
  for (const node of Object.values(lNodes))
    if (mx >= node.x && mx <= node.x + nodeW && my >= node.y && my <= node.y + node.h)
      return { type: 'sender', node };
  for (const node of Object.values(rNodes))
    if (mx >= W && mx <= W + nodeW && my >= node.y && my <= node.y + node.h)
      return { type: 'recipient', node };
  for (const ld of linkData) {
    const x0 = nodeW, x1 = W;
    if (mx < x0 || mx > x1) continue;
    const t  = (mx - x0) / (x1 - x0);
    const tY = (1-t)*(1-t)*ld.sy + 2*(1-t)*t*ld.sy + t*t*ld.ty;
    const bY = (1-t)*(1-t)*(ld.sy+ld.width) + 2*(1-t)*t*(ld.sy+ld.width) + t*t*(ld.ty+ld.width);
    if (my >= tY && my <= bY) return { type: 'link', ld };
  }
  return null;
}

// ── Tooltip ──────────────────────────────────────────
function showFlowTip(e, html) {
  const flowTT = getFlowTT();
  flowTT.innerHTML = html;
  flowTT.classList.add('visible');
  flowTT.style.left = Math.min(e.clientX + 14, window.innerWidth - 200) + 'px';
  flowTT.style.top  = (e.clientY - 40) + 'px';
}

// ── Controls ─────────────────────────────────────────
export function updateFlowTitle(v) {
  document.getElementById('flow-title-display').textContent = v || '';
}

export function resetFlowColors() {
  flowCOLORS = { ...(flowDefColors || flowCOLORS) };
}

// ── Download ─────────────────────────────────────────
export function downloadFlowSVG() {
  if (!flowLayout) return;
  const { lNodes, rNodes, linkData, nodeW, W, H } = flowLayout;
  const totalW = W + flowMARGIN.left + flowMARGIN.right;
  const totalH = H + flowMARGIN.top  + flowMARGIN.bottom;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" font-family="'Barlow',sans-serif">`;
  svg += `<rect width="${totalW}" height="${totalH}" fill="#fff"/>`;
  svg += `<g transform="translate(${flowMARGIN.left},${flowMARGIN.top})">`;
  linkData.forEach(ld => {
    const { r, g, b } = flowHex2rgb(flowCOLORS[ld.s] || '#bbb');
    const x0 = nodeW, x1 = W, cx = (x0 + x1) / 2;
    const d = `M${x0},${ld.sy} C${cx},${ld.sy} ${cx},${ld.ty} ${x1},${ld.ty} L${x1},${ld.ty+ld.width} C${cx},${ld.ty+ld.width} ${cx},${ld.sy+ld.width} ${x0},${ld.sy+ld.width} Z`;
    svg += `<path d="${d}" fill="rgba(${r},${g},${b},0.45)"/>`;
  });
  Object.values(lNodes).forEach(n => svg += `<rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" fill="${flowCOLORS[n.name]||'#bbb'}"/>`);
  Object.values(rNodes).forEach(n => svg += `<rect x="${W}" y="${n.y}" width="${nodeW}" height="${n.h}" fill="${flowCOLORS[n.name]||'#e0e0e0'}"/>`);
  Object.values(lNodes).forEach(n => svg += `<text x="-8" y="${n.y+n.h/2}" text-anchor="end" dominant-baseline="middle" font-size="12" fill="#3a3a3a">${escXML(n.name)}</text>`);
  Object.values(rNodes).forEach(n => svg += `<text x="${W+nodeW+8}" y="${n.y+n.h/2}" text-anchor="start" dominant-baseline="middle" font-size="12" fill="#3a3a3a">${escXML(n.name)}</text>`);
  svg += `</g></svg>`;
  const book = getBook(state.activeBookId);
  triggerDownload(new Blob([svg], { type: 'image/svg+xml' }), 'yours-etc-flow' + (book ? '-' + book.title : '') + '.svg');
}
