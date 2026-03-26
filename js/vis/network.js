import { state } from '../state.js';
import { getBook, escXML, triggerDownload } from '../storage.js';

// D3 is loaded as a CDN global — accessed via the global `d3`

// ── Module state ─────────────────────────────────────
let netLetters = [], netColorMap = {}, netLayout = 'force', netFilter = 'all';
let netSim = null, netHighlighted = null;

// Stale-listener fix
let _resizeListener = null;

// Injected callback — set by visualise.js so setNetLayout/setNetFilter can trigger a re-init
let _setActiveVis = null;
export function setSetActiveVis(fn) { _setActiveVis = fn; }

function getNetSvgEl() { return document.getElementById('net-svg'); }
function getNetD3()    { return d3.select('#net-svg'); }
function getNetTT()    { return document.getElementById('net-tooltip'); }

// ── Colour helpers ───────────────────────────────────
function netLighten(hex, ratio) {
  const h  = hex.replace('#', '');
  const r  = parseInt(h.slice(0, 2), 16);
  const g  = parseInt(h.slice(2, 4), 16);
  const b  = parseInt(h.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * ratio);
  const lg = Math.round(g + (255 - g) * ratio);
  const lb = Math.round(b + (255 - b) * ratio);
  return `#${lr.toString(16).padStart(2,'0')}${lg.toString(16).padStart(2,'0')}${lb.toString(16).padStart(2,'0')}`;
}

function netNodeFill(id)   { const hex = netColorMap[id]; return hex ? netLighten(hex, 0.55) : '#f0b8b0'; }
function netNodeStroke(id) { return netColorMap[id] || '#d88878'; }
function netNodeR(c)  { return c>=80?28:c>=60?22:c>=35?18:c>=20?14:c>=10?10:c>=3?7:5; }
function netLinkW(v)  { return Math.max(0.8, Math.min(7, v * 0.14)); }
function netLinkOp(v) { return v>=20?0.6:v>=10?0.4:v>=5?0.3:0.18; }

// ── Init ─────────────────────────────────────────────
export function initNetwork(letters, colorMap) {
  netLetters  = letters;
  netColorMap = colorMap || {};
  netHighlighted = null;
  if (netSim) { netSim.stop(); netSim = null; }
  buildNetSizeLegend();
  renderNetwork();

  if (_resizeListener) window.removeEventListener('resize', _resizeListener);
  _resizeListener = () => {
    if (state.activeVis === 'network' && netSim) {
      netSim.stop(); netSim = null;
      state.visInitialised.network = false;
      if (_setActiveVis) _setActiveVis('network');
    }
  };
  window.addEventListener('resize', _resizeListener);
}

// ── Size legend ──────────────────────────────────────
export function buildNetSizeLegend() {
  const leg = document.getElementById('net-size-legend');
  if (!leg) return;
  const tiers = [
    { size: 20, label: 'Major — 50+ appearances' },
    { size: 15, label: 'Secondary — 20–49' },
    { size: 10, label: 'Minor — 5–19' },
    { size:  6, label: 'Peripheral — 1–4' },
  ];
  leg.innerHTML = tiers.map(t =>
    `<div class="net-legend-row">
      <div class="net-dot" style="width:${t.size*2}px;height:${t.size*2}px;background:#d8d6d0;border-color:#b0aeaa;border-width:1.5px"></div>
      ${escXML(t.label)}
    </div>`
  ).join('') +
  `<div class="net-legend-row"><div style="width:24px;height:2px;background:#b0aeaa;opacity:0.8;flex-shrink:0"></div>Line weight = letter volume</div>`;
}

// ── Data derivation ──────────────────────────────────
function deriveNetData() {
  const counts = {};
  netLetters.forEach(l => {
    counts[l.from] = (counts[l.from] || 0) + 1;
    counts[l.to]   = (counts[l.to]   || 0) + 1;
  });
  const threshold = netFilter === 'major' ? 20 : 0;
  const nodes = Object.entries(counts)
    .filter(([, c]) => c >= threshold)
    .map(([id, count]) => ({ id, count }));
  const ids   = new Set(nodes.map(n => n.id));
  const pairs = {};
  netLetters.forEach(l => {
    if (!ids.has(l.from) || !ids.has(l.to)) return;
    const k = [l.from, l.to].sort().join('|||');
    pairs[k] = (pairs[k] || 0) + 1;
  });
  const links = Object.entries(pairs).map(([k, v]) => {
    const [s, t] = k.split('|||');
    return { source: s, target: t, value: v };
  });
  return { nodes, links };
}

// ── Render ───────────────────────────────────────────
export function renderNetwork() {
  const netSvgEl = getNetSvgEl();
  const netD3    = getNetD3();
  const netTT    = getNetTT();

  netD3.selectAll('*').remove();
  const W = netSvgEl.clientWidth, H = netSvgEl.clientHeight || 560;
  netD3.attr('viewBox', `0 0 ${W} ${H}`);
  netD3.append('rect').attr('width', W).attr('height', H).attr('fill', '#fefefe');
  const { nodes, links } = deriveNetData();
  if (!nodes.length) return;

  const gLinks = netD3.append('g');
  const gNodes = netD3.append('g');

  const linkSel = gLinks.selectAll('line').data(links).join('line')
    .attr('stroke', '#b0aeaa')
    .attr('stroke-width', d => netLinkW(d.value))
    .attr('stroke-opacity', d => netLinkOp(d.value));

  const nodeSel = gNodes.selectAll('g.node').data(nodes, d => d.id).join(enter => {
    const g = enter.append('g').attr('class', 'node').attr('cursor', 'pointer')
      .call(d3.drag().on('start', ds).on('drag', dd).on('end', de));
    g.append('circle')
      .attr('r',      d => netNodeR(d.count))
      .attr('fill',   d => netNodeFill(d.id))
      .attr('stroke', d => netNodeStroke(d.id))
      .attr('stroke-width', 2);
    g.append('text')
      .attr('dy', d => -netNodeR(d.count) - 5)
      .attr('text-anchor', 'middle')
      .attr('font-family', "'Barlow',sans-serif")
      .attr('font-size',   d => d.count >= 35 ? '10px' : '9px')
      .attr('font-weight', d => d.count >= 35 ? '700'  : '600')
      .attr('fill',        d => d.count >= 35 ? '#0f0f0f' : '#555550')
      .attr('pointer-events', 'none')
      .text(d => d.id);
    return g;
  });

  nodeSel
    .on('mouseover', (e, d) => showNetTip(e, d, netTT))
    .on('mousemove', e => moveNetTip(e, netTT))
    .on('mouseout',  () => netTT.classList.remove('visible'))
    .on('click',     (e, d) => highlightNetNode(d, netD3));

  if (netLayout === 'force') {
    netSim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(links).id(d => d.id).distance(d => 110 - d.value * 0.5).strength(0.5))
      .force('charge',    d3.forceManyBody().strength(-380))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(d => netNodeR(d.count) + 18));
    netSim.alphaDecay(0.025);
    netSim.on('tick', () => {
      linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
             .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });
    netSim.on('end', () => {
      const pad = 70;
      const nd  = gNodes.selectAll('g.node').data();
      if (!nd.length) return;
      const xs = nd.map(d => d.x), ys = nd.map(d => d.y);
      netD3.transition().duration(600).attr('viewBox',
        `${Math.min(...xs)-pad} ${Math.min(...ys)-pad} ${Math.max(...xs)-Math.min(...xs)+pad*2} ${Math.max(...ys)-Math.min(...ys)+pad*2}`
      );
    });
  } else {
    const sorted = [...nodes].sort((a, b) => b.count - a.count);
    const cx = W / 2, cy = H / 2;
    sorted.forEach((node, i) => {
      if (!i) { node.x = cx; node.y = cy; }
      else {
        const ring = i <= 3 ? 1 : i <= 7 ? 2 : 3;
        const inR  = ring === 1 ? i-1 : ring === 2 ? i-4 : i-8;
        const tot  = ring === 1 ? 3   : ring === 2 ? 4   : sorted.length - 8;
        const ang  = (inR / Math.max(tot, 1)) * 2 * Math.PI - Math.PI / 2;
        const r    = ring * (Math.min(W, H) * 0.28 / 3);
        node.x = cx + r * Math.cos(ang);
        node.y = cy + r * Math.sin(ang);
      }
      node.fx = node.x; node.fy = node.y;
    });
    const nbm = new Map(sorted.map(n => [n.id, n]));
    links.forEach(l => {
      l.source = nbm.get(l.source.id || l.source) || l.source;
      l.target = nbm.get(l.target.id || l.target) || l.target;
    });
    linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
           .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
  }

  function ds(e, d) { if (netSim && !e.active) netSim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
  function dd(e, d) { d.fx = e.x; d.fy = e.y; }
  function de(e, d) { if (netSim && !e.active) netSim.alphaTarget(0); if (netLayout === 'force') { d.fx = null; d.fy = null; } }
}

// ── Tooltip ──────────────────────────────────────────
function showNetTip(e, d, tt) {
  const tier = d.count >= 50 ? 'Major' : d.count >= 20 ? 'Secondary' : d.count >= 5 ? 'Minor' : 'Peripheral';
  document.getElementById('tt-name').textContent   = d.id;
  document.getElementById('tt-detail').textContent = `${d.count} letter appearances · ${tier}`;
  tt.classList.add('visible');
  moveNetTip(e, tt);
}
function moveNetTip(e, tt) {
  tt.style.left = (e.clientX + 14) + 'px';
  tt.style.top  = (e.clientY - 10) + 'px';
}

// ── Highlight ────────────────────────────────────────
function highlightNetNode(d, netD3) {
  if (netHighlighted === d.id) {
    netHighlighted = null;
    netD3.selectAll('g.node').attr('opacity', 1);
    netD3.selectAll('line').attr('stroke-opacity', l => netLinkOp(l.value));
    return;
  }
  netHighlighted = d.id;
  const conn = new Set([d.id]);
  netD3.selectAll('line').each(function(l) {
    const s = l.source.id || l.source, t = l.target.id || l.target;
    if (s === d.id || t === d.id) { conn.add(s); conn.add(t); }
  });
  netD3.selectAll('line').attr('stroke-opacity', l => {
    const s = l.source.id || l.source, t = l.target.id || l.target;
    return (s === d.id || t === d.id) ? netLinkOp(l.value) * 1.5 : 0.04;
  });
  netD3.selectAll('g.node').attr('opacity', n => conn.has(n.id) ? 1 : 0.2);
}

// ── Controls ─────────────────────────────────────────
export function setNetLayout(v) {
  netLayout = v;
  document.getElementById('btn-force').classList.toggle('active',  v === 'force');
  document.getElementById('btn-radial').classList.toggle('active', v === 'radial');
  if (netSim) { netSim.stop(); netSim = null; }
  state.visInitialised.network = false;
  if (_setActiveVis) _setActiveVis('network');
}

export function setNetFilter(v) {
  netFilter = v;
  document.getElementById('btn-net-all').classList.toggle('active',   v === 'all');
  document.getElementById('btn-net-major').classList.toggle('active', v === 'major');
  if (netSim) { netSim.stop(); netSim = null; }
  state.visInitialised.network = false;
  if (_setActiveVis) _setActiveVis('network');
}

// ── Download ─────────────────────────────────────────
export function downloadNetworkSVG() {
  const netSvgEl = getNetSvgEl();
  const book = getBook(state.activeBookId);
  triggerDownload(
    new Blob([new XMLSerializer().serializeToString(netSvgEl)], { type: 'image/svg+xml' }),
    'yours-etc-network' + (book ? '-' + book.title : '') + '.svg'
  );
}
