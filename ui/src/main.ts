import { Application } from 'pixi.js';
import { rehydratePositionedGraph, type WeightMode } from './graphLayout';
import { loadGraph } from './graphLoader';
import { GraphVisualization } from './GraphVisualization';
import { applyTheme, isThemeName, loadThemePreference, type ThemeName } from './constants';
import {
  createHeader,
  createControlsPanel,
  createStatusPanel,
  createZoomControls,
} from './ui';

function main() {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = '';
  applyTheme(loadThemePreference(), false);

  const header = createHeader();
  const controlsPanel = createControlsPanel();
  const statusPanel = createStatusPanel();
  const zoomControls = createZoomControls();

  root.appendChild(header);
  root.appendChild(controlsPanel);
  root.appendChild(statusPanel);
  root.appendChild(zoomControls);

  const searchInput = controlsPanel.querySelector('#search-input') as HTMLInputElement;
  const themeSelect = controlsPanel.querySelector('#theme-select') as HTMLSelectElement;
  const fitBtn = controlsPanel.querySelector('#fit-btn') as HTMLButtonElement;
  const resetBtn = controlsPanel.querySelector('#reset-btn') as HTMLButtonElement;
  const weightModeSelect = controlsPanel.querySelector('#weight-mode-select') as HTMLSelectElement;
  const focusModeCopyEl = controlsPanel.querySelector('#focus-mode-copy') as HTMLElement;
  const shortcutButtons = Array.from(
    controlsPanel.querySelectorAll('[data-weight-mode]')
  ) as HTMLButtonElement[];

  const statusBadge = statusPanel.querySelector('#status-badge') as HTMLElement;
  const nodeCountEl = statusPanel.querySelector('#node-count') as HTMLElement;
  const edgeCountEl = statusPanel.querySelector('#edge-count') as HTMLElement;
  const hotspotCountEl = statusPanel.querySelector('#hotspot-count') as HTMLElement;
  const largestSccEl = statusPanel.querySelector('#largest-scc') as HTMLElement;
  const currentNodeEl = statusPanel.querySelector('#current-node') as HTMLElement;
  const currentNodeStatus = statusPanel.querySelector('#current-node-status') as HTMLElement;
  const currentNodeSubtitleEl = statusPanel.querySelector('#current-node-subtitle') as HTMLElement;
  const currentNodeEmptyEl = statusPanel.querySelector('#current-node-empty') as HTMLElement;
  const directInputsEl = statusPanel.querySelector('#direct-inputs') as HTMLElement;
  const directOutputsEl = statusPanel.querySelector('#direct-outputs') as HTMLElement;
  const transitiveInputsEl = statusPanel.querySelector('#transitive-inputs') as HTMLElement;
  const transitiveOutputsEl = statusPanel.querySelector('#transitive-outputs') as HTMLElement;
  const sccSizeEl = statusPanel.querySelector('#scc-size') as HTMLElement;
  const hotspotRankEl = statusPanel.querySelector('#hotspot-rank') as HTMLElement;
  const weightModeLabelEl = statusPanel.querySelector('#weight-mode-label') as HTMLElement;

  const zoomInBtn = zoomControls.querySelector('#zoom-in') as HTMLButtonElement;
  const zoomOutBtn = zoomControls.querySelector('#zoom-out') as HTMLButtonElement;
  const zoomLevelEl = zoomControls.querySelector('#zoom-level') as HTMLElement;

  const app = new Application({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.max(1, window.devicePixelRatio || 1),
  });

  const canvas = app.view as HTMLCanvasElement;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '0';
  root.appendChild(canvas);

  const viz = new GraphVisualization(app, {
    zoomLevelEl,
    statusBadge,
    nodeCountEl,
    edgeCountEl,
    hotspotCountEl,
    largestSccEl,
    currentNodeEl,
    currentNodeStatus,
    currentNodeSubtitleEl,
    currentNodeEmptyEl,
    directInputsEl,
    directOutputsEl,
    transitiveInputsEl,
    transitiveOutputsEl,
    sccSizeEl,
    hotspotRankEl,
    weightModeLabelEl,
  });

  const syncWeightModeControls = (mode: WeightMode) => {
    weightModeSelect.value = mode;
    focusModeCopyEl.innerText = viz.getWeightModeLabel(mode);
    shortcutButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.weightMode === mode);
    });
  };

  themeSelect.value = loadThemePreference();
  syncWeightModeControls(viz.getWeightMode());

  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    if (!isThemeName(theme)) return;
    applyTheme(theme as ThemeName);
    viz.refreshTheme();
  });

  zoomInBtn.addEventListener('click', () => {
    const centerX = app.renderer.screen.width / 2;
    const centerY = app.renderer.screen.height / 2;
    viz.zoom(-1, centerX, centerY);
  });

  zoomOutBtn.addEventListener('click', () => {
    const centerX = app.renderer.screen.width / 2;
    const centerY = app.renderer.screen.height / 2;
    viz.zoom(1, centerX, centerY);
  });

  const handleZoomInput = () => {
    const input = zoomLevelEl as HTMLInputElement;
    const value = input.value.replace('%', '').trim();
    const percentage = parseFloat(value);

    if (!isNaN(percentage) && percentage > 0) {
      viz.setZoomToPercentage(percentage);
    } else {
      viz.setZoomToPercentage(viz.getCurrentScale() * 100);
    }
  };

  (zoomLevelEl as HTMLInputElement).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleZoomInput();
      (zoomLevelEl as HTMLInputElement).blur();
    }
  });

  (zoomLevelEl as HTMLInputElement).addEventListener('blur', handleZoomInput);

  fitBtn.addEventListener('click', () => viz.fitView());
  resetBtn.addEventListener('click', () => viz.reset());

  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const term = searchInput.value.trim();
    if (!term) return;
    viz.search(term);
  });

  weightModeSelect.addEventListener('change', () => {
    const mode = weightModeSelect.value as
      | 'total'
      | 'inputs'
      | 'outputs'
      | 'transitive-total'
      | 'transitive-inputs'
      | 'transitive-outputs'
      | 'pressure'
      | 'hotspots'
      | 'uniform';
    viz.setWeightMode(mode);
    syncWeightModeControls(mode);
  });

  shortcutButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.weightMode as
        | 'total'
        | 'inputs'
        | 'outputs'
        | 'transitive-total'
        | 'transitive-inputs'
        | 'transitive-outputs'
        | 'pressure'
        | 'hotspots'
        | 'uniform'
        | undefined;
      if (!mode) return;
      viz.setWeightMode(mode);
      syncWeightModeControls(mode);
    });
  });

  if (app.view instanceof HTMLCanvasElement) {
    app.view.addEventListener('wheel', (e) => {
      e.preventDefault();
      viz.zoom(e.deltaY, e.clientX, e.clientY);
    });

    app.view.addEventListener('pointerdown', (e) => {
      viz.startPan(e.clientX, e.clientY);
    });

    app.view.addEventListener('pointermove', (e) => {
      viz.handlePointerMove(e.clientX, e.clientY);
    });

    app.view.addEventListener('pointerleave', () => {
      viz.clearHover();
    });
  }

  window.addEventListener('pointerup', (e) => {
    const shouldSelect = viz.endPan();
    if (shouldSelect && e.target === app.view) {
      viz.selectAt(e.clientX, e.clientY);
    }
  });
  window.addEventListener('pointermove', (e) => viz.updatePan(e.clientX, e.clientY));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      viz.clearSelection();
    }
  });
  window.addEventListener('resize', () => viz.handleResize());

  const worker = new Worker(new URL('./graphWorker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (e) => {
    const data = e.data;
    if (data.error) {
      console.error('Worker error:', data.error);
      viz.setStatus('Error', 'error');
      viz.setNodeCount('Failed to process graph');
      worker.terminate();
      return;
    }

    const layoutTime = performance.now() - layoutStart;
    console.log(`Layout computed in ${layoutTime.toFixed(0)}ms`);

    const pg = rehydratePositionedGraph(data.nodes, data.edges, data.hotspotCount, data.largestHotspotSize);
    const impactSummary = pg.hotspotCount ? `Ready · ${pg.hotspotCount} high-impact targets` : 'Ready';
    viz.setStatus(impactSummary, 'success');
    viz.setPositionedGraph(pg);
    worker.terminate();
  };

  worker.onerror = (err) => {
    console.error('Worker crashed:', err);
    viz.setStatus('Error', 'error');
    viz.setNodeCount('Failed to process graph');
    worker.terminate();
  };

  let layoutStart = 0;

  loadGraph()
    .then((g) => {
      console.log(`Loaded graph with ${g.nodes.length} nodes, ${g.edges.length} edges`);
      viz.setStatus('Computing layout…', 'loading');
      layoutStart = performance.now();
      worker.postMessage(g);
    })
    .catch((err) => {
      console.error(err);
      viz.setStatus('Error', 'error');
      viz.setNodeCount('Failed to load graph');
      worker.terminate();
    });
}

main();
