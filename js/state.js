// ── Constants ────────────────────────────────────────
export const AUTO_PALETTE = [
  '#8bdfe0','#c195ed','#f294db','#edc24c','#839de6',
  '#9aafca','#b3cb6d','#87c38e','#f2e6bb','#ebc2b8',
  '#c0b8d4','#c8a8b0','#b0c8d4','#f4a261','#e76f51',
  '#2a9d8f','#e9c46a','#a8dadc','#457b9d','#264653',
];

export const THUMB_PALETTE = [
  '#8bdfe0','#c195ed','#f294db','#edc24c',
  '#839de6','#9aafca','#c4e087','#a8c4a0',
];

// ── Shared mutable app state ─────────────────────────
export const state = {
  currentView:      'landing',
  activeBookId:     null,
  activeVis:        null,        // null = home state
  colorModalBookId: null,        // which book the colour modal is editing
  uploadParsedData: null,        // temp storage during upload flow
  visInitialised: { grid: false, timeline: false, network: false, flow: false },
};

export function resetVisInitialised() {
  Object.keys(state.visInitialised).forEach(k => state.visInitialised[k] = false);
}
