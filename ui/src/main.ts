import { Application } from 'pixi.js';
import { rehydratePositionedGraph } from './graphLayout';
import { loadGraph } from './graphLoader';
import { GraphVisualization } from './GraphVisualization';
import { getTopBreakupCandidates, getTopImpactTargets } from './graphAnalysis';
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

  // Create UI elements
  const header = createHeader();
  const controlsPanel = createControlsPanel();
  const statusPanel = createStatusPanel();
  const zoomControls = createZoomControls();

  root.appendChild(header);
  root.appendChild(controlsPanel);
  root.appendChild(statusPanel);
  root.appendChild(zoomControls);

  // Get DOM references
  const searchInput = controlsPanel.querySelector('#search-input') as HTMLInputElement;
  const fitBtn = controlsPanel.querySelector('#fit-btn') as HTMLButtonElement;
  const resetBtn = controlsPanel.querySelector('#reset-btn') as HTMLButtonElement;
  const weightModeSelect = controlsPanel.querySelector('#weight-mode-select') as HTMLSelectElement;

  const statusBadge = statusPanel.querySelector('#status-badge') as HTMLElement;
  const nodeCountEl = statusPanel.querySelector('#node-count') as HTMLElement;
  const edgeCountEl = statusPanel.querySelector('#edge-count') as HTMLElement;
  const currentNodeEl = statusPanel.querySelector('#current-node') as HTMLElement;
  const currentNodeDetailsEl = statusPanel.querySelector('#current-node-details') as HTMLElement;
  const currentNodeStatus = statusPanel.querySelector('#current-node-status') as HTMLElement;
  const impactAnalysisListEl = statusPanel.querySelector('#impact-analysis-list') as HTMLElement;
  const pressureAnalysisListEl = statusPanel.querySelector('#pressure-analysis-list') as HTMLElement;

  const zoomInBtn = zoomControls.querySelector('#zoom-in') as HTMLButtonElement;
  const zoomOutBtn = zoomControls.querySelector('#zoom-out') as HTMLButtonElement;
  const zoomLevelEl = zoomControls.querySelector('#zoom-level') as HTMLElement;

  // Create PixiJS application
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

  // Create graph visualization
  const viz = new GraphVisualization(app, {
    zoomLevelEl,
    statusBadge,
    nodeCountEl,
    edgeCountEl,
    currentNodeEl,
    currentNodeDetailsEl,
    currentNodeStatus,
  });

  weightModeSelect.value = viz.getWeightMode();

  const focusFromAnalysis = (nodeId: string, mode: 'transitive-total' | 'pressure') => {
    weightModeSelect.value = mode;
    viz.setWeightMode(mode);
    viz.focusNode(nodeId);
  };

  const renderAnalysisList = (
    listEl: HTMLElement,
    entries: ReturnType<typeof getTopImpactTargets>,
    mode: 'transitive-total' | 'pressure'
  ) => {
    listEl.replaceChildren();

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'analysis-empty';
      empty.innerText = 'No ranked targets for this graph.';
      listEl.appendChild(empty);
      return;
    }

    entries.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'analysis-item';
      button.addEventListener('click', () => focusFromAnalysis(entry.id, mode));

      const rank = document.createElement('span');
      rank.className = 'analysis-item-rank';
      rank.innerText = `#${index + 1}`;

      const body = document.createElement('span');
      body.className = 'analysis-item-body';

      const title = document.createElement('span');
      title.className = 'analysis-item-title';
      title.innerText = entry.label;

      const meta = document.createElement('span');
      meta.className = 'analysis-item-meta';
      meta.innerText = entry.summary;

      body.appendChild(title);
      body.appendChild(meta);
      button.appendChild(rank);
      button.appendChild(body);
      listEl.appendChild(button);
    });
  };

  // Event listeners - Zoom controls
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

  // Event listeners - Zoom level input
  const handleZoomInput = () => {
    const input = zoomLevelEl as HTMLInputElement;
    const value = input.value.replace('%', '').trim();
    const percentage = parseFloat(value);

    if (!isNaN(percentage) && percentage > 0) {
      viz.setZoomToPercentage(percentage);
    } else {
      // Restore current zoom if invalid input
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

  // Event listeners - View controls
  fitBtn.addEventListener('click', () => viz.fitView());
  resetBtn.addEventListener('click', () => viz.reset());

  // Event listeners - Search
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const term = searchInput.value.trim();
    if (!term) return;
    viz.search(term);
  });

  // Event listeners - Weight mode
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
  });

  // Event listeners - Canvas interactions
  if (app.view instanceof HTMLCanvasElement) {
    app.view.addEventListener('wheel', (e) => {
      e.preventDefault();
      viz.zoom(e.deltaY, e.clientX, e.clientY);
    });

    app.view.addEventListener('pointerdown', (e) => {
      viz.startPan(e.clientX, e.clientY);
    });
  }

  window.addEventListener('pointerup', () => viz.endPan());
  window.addEventListener('pointermove', (e) => viz.updatePan(e.clientX, e.clientY));
  window.addEventListener('resize', () => viz.handleResize());

  // Load and process graph via Web Worker so the main thread stays responsive
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
    renderAnalysisList(impactAnalysisListEl, getTopImpactTargets(pg.nodes), 'transitive-total');
    renderAnalysisList(pressureAnalysisListEl, getTopBreakupCandidates(pg.nodes), 'pressure');
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
