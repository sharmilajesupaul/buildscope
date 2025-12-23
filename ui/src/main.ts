import { Application } from 'pixi.js';
import { sanitizeGraph, layeredLayout } from './graphLayout';
import { loadGraph } from './graphLoader';
import { GraphVisualization } from './GraphVisualization';
import {
  createHeader,
  createControlsPanel,
  createStatusPanel,
  createZoomControls,
} from './ui';
import { CustomDropdown } from './components/Dropdown';
import { THEMES, DEFAULT_THEME_ID, getTheme, applyTheme } from './themes';

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
  const statusBadge = statusPanel.querySelector('#status-badge') as HTMLElement;
  const nodeCountEl = statusPanel.querySelector('#node-count') as HTMLElement;
  const edgeCountEl = statusPanel.querySelector('#edge-count') as HTMLElement;
  const currentNodeEl = statusPanel.querySelector('#current-node') as HTMLElement;
  const currentNodeStatus = statusPanel.querySelector('#current-node-status') as HTMLElement;

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

  // Initialize Theme
  const defaultTheme = getTheme(DEFAULT_THEME_ID);
  applyTheme(defaultTheme);

  // Initialize Custom Dropdowns
  // 1. Theme Dropdown
  new CustomDropdown(
    'theme-select-container',
    THEMES.map(t => ({ value: t.id, label: t.label })),
    DEFAULT_THEME_ID,
    (value) => {
      const theme = getTheme(value);
      applyTheme(theme);
      viz.setTheme(theme.colors);
    }
  );

  // 2. Weight Mode Dropdown
  new CustomDropdown(
    'weight-mode-container',
    [
      { value: 'total', label: 'Direct: Total Connections' },
      { value: 'inputs', label: 'Direct: Inputs Only' },
      { value: 'outputs', label: 'Direct: Outputs Only' },
      { value: 'transitive-total', label: 'Transitive: Total' },
      { value: 'transitive-inputs', label: 'Transitive: Inputs' },
      { value: 'transitive-outputs', label: 'Transitive: Outputs' },
      { value: 'uniform', label: 'Uniform Size' },
    ],
    'total',
    (value) => {
      viz.setWeightMode(value as any);
    }
  );

  // Create graph visualization
  const viz = new GraphVisualization(app, {
    zoomLevelEl,
    statusBadge,
    nodeCountEl,
    edgeCountEl,
    currentNodeEl,
    currentNodeStatus,
    initialColors: defaultTheme.colors,
  });

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

  // Create Layout Worker
  const layoutWorker = new Worker(new URL('./layout.worker.ts', import.meta.url), {
    type: 'module',
  });

  layoutWorker.onmessage = (e) => {
    const { type, positioned, stats } = e.data;

    if (type === 'layout-complete') {
      console.log(`Main: Received layout for ${stats.nodes} nodes in ${stats.time.toFixed(0)}ms`);
      viz.setStatus('Ready', 'success');
      viz.setPositionedGraph(positioned);
    }
  };

  // Load and process graph
  loadGraph()
    .then((g) => {
      console.log(
        `Loaded graph with ${g.nodes.length} nodes, ${g.edges.length} edges`
      );

      viz.setStatus('Processing...', 'loading');

      // Send to worker
      layoutWorker.postMessage(g);

      // If it takes too long, show a "computing" message
       if (g.nodes.length > 5000) {
          viz.setStatus('Large graph - Computing layout...', 'loading');
       }

    })
    .catch((err) => {
      console.error(err);
      viz.setStatus('Error', 'error');
      viz.setNodeCount('Failed to load graph');
    });
}

main();
