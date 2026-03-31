import { Application } from 'pixi.js';
import { rehydratePositionedGraph, type WeightMode } from './graphLayout';
import { loadGraph } from './graphLoader';
import { GraphVisualization } from './GraphVisualization';
import { applyTheme, isThemeName, loadThemePreference } from './constants';
import { getTopBreakupCandidates, getTopImpactTargets } from './graphAnalysis';
import { createHeader, createSelectionInspector, createSidePanel } from './ui';

type PrimaryWeightMode =
  | 'transitive-total'
  | 'pressure'
  | 'transitive-inputs'
  | 'transitive-outputs'
  | 'total';

type AdvancedWeightMode = 'follow-focus' | 'hotspots' | 'uniform';

function splitTargetLabel(label: string) {
  const separatorIndex = label.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex === label.length - 1) {
    return { primary: label, secondary: '' };
  }

  return {
    primary: label.slice(separatorIndex + 1),
    secondary: label.slice(0, separatorIndex),
  };
}

function main() {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = '';
  applyTheme(loadThemePreference(), false);

  const header = createHeader();
  const sidePanel = createSidePanel();
  const selectionInspector = createSelectionInspector();

  root.appendChild(header);
  root.appendChild(sidePanel);
  root.appendChild(selectionInspector);

  const panelToggle = sidePanel.querySelector('#panel-toggle') as HTMLButtonElement;
  const searchInput = sidePanel.querySelector('#search-input') as HTMLInputElement;
  const analysisFilterInput = sidePanel.querySelector('#analysis-filter-input') as HTMLInputElement;
  const themeSelect = sidePanel.querySelector('#theme-select') as HTMLSelectElement;
  const fitBtn = sidePanel.querySelector('#fit-btn') as HTMLButtonElement;
  const resetBtn = sidePanel.querySelector('#reset-btn') as HTMLButtonElement;
  const advancedModeSelect = sidePanel.querySelector('#advanced-mode-select') as HTMLSelectElement;
  const focusModeCopyEl = sidePanel.querySelector('#focus-mode-copy') as HTMLElement;
  const shortcutButtons = Array.from(
    sidePanel.querySelectorAll('[data-weight-mode]')
  ) as HTMLButtonElement[];

  const statusBadge = sidePanel.querySelector('#status-badge') as HTMLElement;
  const nodeCountEl = sidePanel.querySelector('#node-count') as HTMLElement;
  const edgeCountEl = sidePanel.querySelector('#edge-count') as HTMLElement;
  const hotspotCountEl = sidePanel.querySelector('#hotspot-count') as HTMLElement;
  const largestSccEl = sidePanel.querySelector('#largest-scc') as HTMLElement;
  const impactAnalysisListEl = sidePanel.querySelector('#impact-analysis-list') as HTMLElement;
  const pressureAnalysisListEl = sidePanel.querySelector('#pressure-analysis-list') as HTMLElement;
  const impactAnalysisCountEl = sidePanel.querySelector('#impact-analysis-count') as HTMLElement;
  const pressureAnalysisCountEl = sidePanel.querySelector('#pressure-analysis-count') as HTMLElement;
  const currentNodeEl = selectionInspector.querySelector('#current-node') as HTMLElement;
  const currentNodeStatus = selectionInspector.querySelector('#current-node-status') as HTMLElement;
  const currentNodeSubtitleEl = selectionInspector.querySelector('#current-node-subtitle') as HTMLElement;
  const currentNodeEmptyEl = selectionInspector.querySelector('#current-node-empty') as HTMLElement;
  const directInputsEl = selectionInspector.querySelector('#direct-inputs') as HTMLElement;
  const directOutputsEl = selectionInspector.querySelector('#direct-outputs') as HTMLElement;
  const transitiveInputsEl = selectionInspector.querySelector('#transitive-inputs') as HTMLElement;
  const transitiveOutputsEl = selectionInspector.querySelector('#transitive-outputs') as HTMLElement;
  const sccSizeEl = selectionInspector.querySelector('#scc-size') as HTMLElement;
  const hotspotRankEl = selectionInspector.querySelector('#hotspot-rank') as HTMLElement;
  const weightModeLabelEl = selectionInspector.querySelector('#weight-mode-label') as HTMLElement;

  const zoomInBtn = sidePanel.querySelector('#zoom-in') as HTMLButtonElement;
  const zoomOutBtn = sidePanel.querySelector('#zoom-out') as HTMLButtonElement;
  const zoomLevelEl = sidePanel.querySelector('#zoom-level') as HTMLElement;

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

  let primaryMode: PrimaryWeightMode = 'transitive-total';
  let advancedMode: AdvancedWeightMode = 'follow-focus';
  let analysisQuery = '';
  let impactEntries: ReturnType<typeof getTopImpactTargets> = [];
  let pressureEntries: ReturnType<typeof getTopBreakupCandidates> = [];

  const getEffectiveWeightMode = (): WeightMode => {
    if (advancedMode === 'follow-focus') return primaryMode;
    return advancedMode;
  };

  const syncWeightModeControls = () => {
    focusModeCopyEl.innerText = viz.getWeightModeLabel(primaryMode);
    advancedModeSelect.value = advancedMode;
    shortcutButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.weightMode === primaryMode);
    });
  };

  const applyWeightMode = () => {
    viz.setWeightMode(getEffectiveWeightMode());
    syncWeightModeControls();
  };

  themeSelect.value = loadThemePreference();
  syncWeightModeControls();

  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    if (!isThemeName(theme)) return;
    applyTheme(theme);
    viz.refreshTheme();
  });

  const focusFromAnalysis = (nodeId: string, mode: 'transitive-total' | 'pressure') => {
    primaryMode = mode;
    advancedMode = 'follow-focus';
    applyWeightMode();
    viz.focusNode(nodeId);
  };

  const matchesAnalysisQuery = (
    entry: ReturnType<typeof getTopImpactTargets>[number],
    rank: number,
    query: string
  ) => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return true;

    if (trimmed === String(rank) || trimmed === `#${rank}`) return true;
    return (
      entry.label.toLowerCase().includes(trimmed) ||
      entry.summary.toLowerCase().includes(trimmed)
    );
  };

  const renderAnalysisList = (
    listEl: HTMLElement,
    countEl: HTMLElement,
    entries: ReturnType<typeof getTopImpactTargets>,
    mode: 'transitive-total' | 'pressure'
  ) => {
    listEl.replaceChildren();
    const filtered = entries.filter((entry, index) =>
      matchesAnalysisQuery(entry, index + 1, analysisQuery)
    );
    countEl.innerText = analysisQuery
      ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`
      : `${entries.length} ranked`;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'analysis-empty';
      empty.innerText = analysisQuery
        ? 'No ranking entries match that filter.'
        : 'No ranked targets for this graph.';
      listEl.appendChild(empty);
      return;
    }

    filtered.slice(0, 6).forEach((entry, index) => {
      const rank = entries.indexOf(entry) + 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'analysis-item';
      button.title = entry.label;
      button.addEventListener('click', () => focusFromAnalysis(entry.id, mode));

      const rankEl = document.createElement('span');
      rankEl.className = 'analysis-item-rank';
      rankEl.innerText = `#${rank}`;

      const body = document.createElement('span');
      body.className = 'analysis-item-body';

      const { primary, secondary } = splitTargetLabel(entry.label);
      const title = document.createElement('span');
      title.className = 'analysis-item-title';
      title.innerText = primary;

      const meta = document.createElement('span');
      meta.className = 'analysis-item-meta';
      meta.innerText = secondary ? `${secondary} · ${entry.summary}` : entry.summary;

      body.appendChild(title);
      body.appendChild(meta);
      button.appendChild(rankEl);
      button.appendChild(body);
      listEl.appendChild(button);
    });
  };

  const renderAnalysisLists = () => {
    renderAnalysisList(impactAnalysisListEl, impactAnalysisCountEl, impactEntries, 'transitive-total');
    renderAnalysisList(pressureAnalysisListEl, pressureAnalysisCountEl, pressureEntries, 'pressure');
  };

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
  resetBtn.addEventListener('click', () => viz.clearSelection());
  advancedModeSelect.addEventListener('change', () => {
    advancedMode = advancedModeSelect.value as AdvancedWeightMode;
    applyWeightMode();
  });

  panelToggle.addEventListener('click', () => {
    const first = sidePanel.getBoundingClientRect();
    sidePanel.getAnimations().forEach((animation) => animation.cancel());
    const collapsed = sidePanel.classList.toggle('is-collapsed');
    const label = collapsed ? 'Expand panel' : 'Collapse panel';
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    panelToggle.setAttribute('aria-label', label);
    panelToggle.setAttribute('title', label);
    const last = sidePanel.getBoundingClientRect();
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;

    sidePanel.animate(
      [
        {
          transform: `translate(${deltaX}px, ${deltaY}px)`,
          opacity: 0.96,
        },
        {
          transform: 'translate(0, 0)',
          opacity: 1,
        },
      ],
      {
        duration: 180,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }
    );
    viz.handleResize();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const term = searchInput.value.trim();
    if (!term) return;
    viz.search(term);
  });

  analysisFilterInput.addEventListener('input', () => {
    analysisQuery = analysisFilterInput.value;
    renderAnalysisLists();
  });

  shortcutButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.weightMode as PrimaryWeightMode | undefined;
      if (!mode) return;
      primaryMode = mode;
      advancedMode = 'follow-focus';
      applyWeightMode();
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

    const pg = rehydratePositionedGraph(data.nodes, data.edges, data.hotspotCount, data.largestHotspotSize);
    const impactSummary = pg.hotspotCount ? `Ready · ${pg.hotspotCount} impact` : 'Ready';
    viz.setStatus(impactSummary, 'success');
    viz.setPositionedGraph(pg);
    impactEntries = getTopImpactTargets(pg.nodes);
    pressureEntries = getTopBreakupCandidates(pg.nodes);
    renderAnalysisLists();
    worker.terminate();
  };

  worker.onerror = (err) => {
    console.error('Worker crashed:', err);
    viz.setStatus('Error', 'error');
    viz.setNodeCount('Failed to process graph');
    worker.terminate();
  };

  loadGraph()
    .then((g) => {
      viz.setStatus('Computing layout…', 'loading');
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
