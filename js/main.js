import { state } from './state.js';

import {
  navigate, updateNavState, landingVisualise, landingVisualiseWith,
  setRenderLibrary, setEnsureVisualise, setOpenUploadModal,
} from './router.js';

import {
  renderLibrary, openUploadModal, closeUploadModal, handleUploadFile,
  submitUpload, exportLibrary, importLibraryTrigger, importLibrary,
  confirmRemoveBook, visualiseBook, initLibrary,
  setNavigate, setUpdateNavState,
} from './library.js';

import {
  openColorModal, openColorModalForActive, closeColorModal,
  buildCEGrid, addNCRow, saveNCRows, toggleNCDisclosure,
  importPaletteTrigger, importPalette, exportPalette, resetColorsToDefault,
  toggleColorDisclosure, buildSidebarColors,
  setRedrawActiveVis, setBuildSidebarColors, initColourEditor,
} from './colourEditor.js';

import {
  ensureVisualise, setActiveVis, redrawActiveVis, switchBook,
  buildAllThumbs, buildDownloadButtons, resetFlowColors,
  setRenderLibraryRef, initVisualise,
} from './visualise.js';

import { updateFlowTitle } from './vis/flow.js';

import {
  setShape, setBgColor, updateColsSlider, updateGapSlider,
  setIncludeLegend, setPDFDPI, clearActiveTopics,
} from './vis/mosaic.js';

import { updateDotR, updateRowH, clearTLSelection } from './vis/sequence.js';
import { setNetLayout, setNetFilter }               from './vis/network.js';

// ── 1. Inject cross-module dependencies ──────────────
setRenderLibrary(renderLibrary);       // router needs this
setEnsureVisualise(ensureVisualise);   // router needs this
setOpenUploadModal(openUploadModal);   // router needs this

setNavigate(navigate);                 // library needs this
setUpdateNavState(updateNavState);     // library needs this

setRedrawActiveVis(redrawActiveVis);   // colourEditor needs this
setBuildSidebarColors(buildSidebarColors); // colourEditor needs this

setRenderLibraryRef(renderLibrary);    // visualise needs this (title blur)

// ── 2. Expose functions for inline HTML handlers ─────
window.navigate              = navigate;
window.landingVisualise      = landingVisualise;
window.landingVisualiseWith  = landingVisualiseWith;
window.setActiveVis          = setActiveVis;
window.switchBook            = switchBook;

window.exportLibrary         = exportLibrary;
window.importLibraryTrigger  = importLibraryTrigger;
window.importLibrary         = importLibrary;
window.visualiseBook         = visualiseBook;
window.confirmRemoveBook     = confirmRemoveBook;

window.openColorModal        = openColorModal;
window.openColorModalForActive = openColorModalForActive;
window.closeColorModal       = closeColorModal;
window.handleUploadFile      = handleUploadFile;
window.submitUpload          = submitUpload;
window.closeUploadModal      = closeUploadModal;

window.toggleNCDisclosure    = toggleNCDisclosure;
window.addNCRow              = addNCRow;
window.importPaletteTrigger  = importPaletteTrigger;
window.importPalette         = importPalette;
window.exportPalette         = exportPalette;
window.resetColorsToDefault  = resetColorsToDefault;
window.toggleColorDisclosure = toggleColorDisclosure;

window.updateColsSlider      = updateColsSlider;
window.updateGapSlider       = updateGapSlider;
window.setShape              = setShape;
window.setBgColor            = setBgColor;
window.setIncludeLegend      = setIncludeLegend;
window.setPDFDPI             = setPDFDPI;
window.clearActiveTopics     = clearActiveTopics;

window.updateDotR            = updateDotR;
window.updateRowH            = updateRowH;
window.clearTLSelection      = clearTLSelection;

window.setNetLayout          = setNetLayout;
window.setNetFilter          = setNetFilter;

window.resetFlowColors       = resetFlowColors;
window.updateFlowTitle       = updateFlowTitle;

// ── 3. Initialise DOM-dependent modules ──────────────
initLibrary();
initColourEditor();
initVisualise();

// ── 4. Boot ───────────────────────────────────────────
updateNavState();
buildAllThumbs();
navigate('landing');
