import { Application } from 'pixi.js';
import { rehydratePositionedGraph, type Graph, type PositionedGraph, type WeightMode } from './graphLayout';
import { loadAnalysis, loadGraph, loadTargetDecomposition } from './graphLoader';
import { GraphVisualization } from './GraphVisualization';
import { applyTheme, isThemeName, loadThemePreference } from './constants';
import { getVisibleAnalysisEntries } from './analysisFilter';
import {
  type BuildScopeDecompositionResponse,
  getTopBreakupCandidates,
  getTopBreakupCandidatesFromAnalysis,
  getTopImpactTargets,
  getTopImpactTargetsFromAnalysis,
  getTopInputHeavyTargets,
  getTopOutputHeavyTargets,
  getTopOutputHeavyTargetsFromAnalysis,
  getTopSourceHeavyTargets,
  getTopSourceHeavyTargetsFromAnalysis,
  type AnalysisEntry,
  type BuildScopeAnalysisResponse,
} from './graphAnalysis';
import { type GraphLayoutMode, type GraphOrientation } from './graphView';
import { createHeader, createSelectionInspector, createSidePanel } from './ui';

type PrimaryWeightMode =
  | 'transitive-total'
  | 'pressure'
  | 'transitive-inputs'
  | 'transitive-outputs'
  | 'total';

type AdvancedWeightMode =
  | 'follow-focus'
  | 'hotspots'
  | 'source-file-count'
  | 'source-bytes'
  | 'input-file-count'
  | 'input-bytes'
  | 'output-file-count'
  | 'output-bytes'
  | 'action-count'
  | 'uniform';

type MetricAvailability = {
  source: boolean;
  input: boolean;
  output: boolean;
  action: boolean;
};

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

function getMetricAvailability(graph: Graph): MetricAvailability {
  return graph.nodes.reduce<MetricAvailability>(
    (availability, node) => ({
      source: availability.source || (node.sourceFileCount ?? 0) > 0 || (node.sourceBytes ?? 0) > 0,
      input: availability.input || (node.inputFileCount ?? 0) > 0 || (node.inputBytes ?? 0) > 0,
      output: availability.output || (node.outputFileCount ?? 0) > 0 || (node.outputBytes ?? 0) > 0,
      action: availability.action || (node.actionCount ?? 0) > 0,
    }),
    { source: false, input: false, output: false, action: false }
  );
}

function formatDecompositionScore(score: number | undefined): string {
  if (score === undefined || Number.isNaN(score)) return '—';
  return score.toFixed(1);
}

function formatRatio(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function formatPercentile(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value);
  const tens = rounded % 100;
  const ones = rounded % 10;
  let suffix = 'th';
  if (tens < 11 || tens > 13) {
    if (ones === 1) suffix = 'st';
    else if (ones === 2) suffix = 'nd';
    else if (ones === 3) suffix = 'rd';
  }
  return `${rounded}${suffix} pct`;
}

function isRuleSelection(nodeType: string | undefined): boolean {
  return !nodeType || nodeType === 'rule';
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
  const graphOrientationSelect = sidePanel.querySelector('#graph-orientation-select') as HTMLSelectElement;
  const graphLayoutSelect = sidePanel.querySelector('#selection-layout-select') as HTMLSelectElement;
  const chokePointPresetBtn = sidePanel.querySelector('#choke-point-preset-btn') as HTMLButtonElement;
  const focusModeCopyEl = sidePanel.querySelector('#focus-mode-copy') as HTMLElement;
  const shortcutButtons = Array.from(
    sidePanel.querySelectorAll('[data-weight-mode]')
  ) as HTMLButtonElement[];

  const statusBadge = sidePanel.querySelector('#status-badge') as HTMLElement;
  const nodeCountEl = sidePanel.querySelector('#node-count') as HTMLElement;
  const edgeCountEl = sidePanel.querySelector('#edge-count') as HTMLElement;
  const ruleCountEl = sidePanel.querySelector('#rule-count') as HTMLElement;
  const hotspotCountEl = sidePanel.querySelector('#hotspot-count') as HTMLElement;
  const largestSccEl = sidePanel.querySelector('#largest-scc') as HTMLElement;
  const impactAnalysisListEl = sidePanel.querySelector('#impact-analysis-list') as HTMLElement;
  const pressureAnalysisListEl = sidePanel.querySelector('#pressure-analysis-list') as HTMLElement;
  const fileAnalysisGroupEl = sidePanel.querySelector('#file-analysis-group') as HTMLElement;
  const inputAnalysisGroupEl = sidePanel.querySelector('#input-analysis-group') as HTMLElement;
  const outputAnalysisGroupEl = sidePanel.querySelector('#output-analysis-group') as HTMLElement;
  const fileAnalysisListEl = sidePanel.querySelector('#file-analysis-list') as HTMLElement;
  const inputAnalysisListEl = sidePanel.querySelector('#input-analysis-list') as HTMLElement;
  const outputAnalysisListEl = sidePanel.querySelector('#output-analysis-list') as HTMLElement;
  const impactAnalysisCountEl = sidePanel.querySelector('#impact-analysis-count') as HTMLElement;
  const pressureAnalysisCountEl = sidePanel.querySelector('#pressure-analysis-count') as HTMLElement;
  const fileAnalysisCountEl = sidePanel.querySelector('#file-analysis-count') as HTMLElement;
  const inputAnalysisCountEl = sidePanel.querySelector('#input-analysis-count') as HTMLElement;
  const outputAnalysisCountEl = sidePanel.querySelector('#output-analysis-count') as HTMLElement;
  const focusSurfaceGroupEl = selectionInspector.querySelector('#focus-surface-group') as HTMLElement;
  const focusDecompositionGroupEl = selectionInspector.querySelector('#focus-decomposition-group') as HTMLElement;
  const focusInputsGroupEl = selectionInspector.querySelector('#focus-inputs-group') as HTMLElement;
  const focusOutputsGroupEl = selectionInspector.querySelector('#focus-outputs-group') as HTMLElement;
  const focusActionsGroupEl = selectionInspector.querySelector('#focus-actions-group') as HTMLElement;
  const currentNodeEl = selectionInspector.querySelector('#current-node') as HTMLElement;
  const currentNodeStatus = selectionInspector.querySelector('#current-node-status') as HTMLElement;
  const currentNodeSubtitleEl = selectionInspector.querySelector('#current-node-subtitle') as HTMLElement;
  const currentNodeEmptyEl = selectionInspector.querySelector('#current-node-empty') as HTMLElement;
  const selectionNoteEl = selectionInspector.querySelector('#selection-note') as HTMLElement;
  const nodeTypeEl = selectionInspector.querySelector('#node-type') as HTMLElement;
  const ruleKindEl = selectionInspector.querySelector('#rule-kind') as HTMLElement;
  const directInputsEl = selectionInspector.querySelector('#direct-inputs') as HTMLElement;
  const directOutputsEl = selectionInspector.querySelector('#direct-outputs') as HTMLElement;
  const transitiveInputsEl = selectionInspector.querySelector('#transitive-inputs') as HTMLElement;
  const transitiveOutputsEl = selectionInspector.querySelector('#transitive-outputs') as HTMLElement;
  const sourceFileCountEl = selectionInspector.querySelector('#source-file-count') as HTMLElement;
  const sourceBytesEl = selectionInspector.querySelector('#source-bytes') as HTMLElement;
  const inputFileCountEl = selectionInspector.querySelector('#input-file-count') as HTMLElement;
  const inputBytesEl = selectionInspector.querySelector('#input-bytes') as HTMLElement;
  const outputFileCountEl = selectionInspector.querySelector('#output-file-count') as HTMLElement;
  const outputBytesEl = selectionInspector.querySelector('#output-bytes') as HTMLElement;
  const actionCountEl = selectionInspector.querySelector('#action-count') as HTMLElement;
  const sccSizeEl = selectionInspector.querySelector('#scc-size') as HTMLElement;
  const hotspotRankEl = selectionInspector.querySelector('#hotspot-rank') as HTMLElement;
  const decompositionMetaEl = selectionInspector.querySelector('#focus-decomposition-meta') as HTMLElement;
  const decompositionVerdictEl = selectionInspector.querySelector('#decomposition-verdict') as HTMLElement;
  const decompositionImpactScoreEl = selectionInspector.querySelector('#decomposition-impact-score') as HTMLElement;
  const decompositionImpactMetaEl = selectionInspector.querySelector('#decomposition-impact-meta') as HTMLElement;
  const decompositionMassScoreEl = selectionInspector.querySelector('#decomposition-mass-score') as HTMLElement;
  const decompositionMassMetaEl = selectionInspector.querySelector('#decomposition-mass-meta') as HTMLElement;
  const decompositionShardabilityScoreEl = selectionInspector.querySelector('#decomposition-shardability-score') as HTMLElement;
  const decompositionShardabilityMetaEl = selectionInspector.querySelector('#decomposition-shardability-meta') as HTMLElement;
  const decompositionCommunityCountEl = selectionInspector.querySelector('#decomposition-community-count') as HTMLElement;
  const decompositionCommunityMetaEl = selectionInspector.querySelector('#decomposition-community-meta') as HTMLElement;
  const decompositionLargestCommunityShareEl = selectionInspector.querySelector('#decomposition-largest-community-share') as HTMLElement;
  const decompositionCrossEdgeRatioEl = selectionInspector.querySelector('#decomposition-cross-edge-ratio') as HTMLElement;
  const decompositionNoteEl = selectionInspector.querySelector('#decomposition-note') as HTMLElement;
  const decompositionCommunityListEl = selectionInspector.querySelector('#decomposition-community-list') as HTMLElement;
  const topFilesListEl = selectionInspector.querySelector('#top-files-list') as HTMLElement;
  const topOutputsListEl = selectionInspector.querySelector('#top-outputs-list') as HTMLElement;
  const mnemonicListEl = selectionInspector.querySelector('#mnemonic-list') as HTMLElement;
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
    selectionInspectorEl: selectionInspector,
    zoomLevelEl,
    statusBadge,
    nodeCountEl,
    edgeCountEl,
    ruleCountEl,
    hotspotCountEl,
    largestSccEl,
    currentNodeEl,
    currentNodeStatus,
    currentNodeSubtitleEl,
    currentNodeEmptyEl,
    selectionNoteEl,
    nodeTypeEl,
    ruleKindEl,
    directInputsEl,
    directOutputsEl,
    transitiveInputsEl,
    transitiveOutputsEl,
    sourceFileCountEl,
    sourceBytesEl,
    inputFileCountEl,
    inputBytesEl,
    outputFileCountEl,
    outputBytesEl,
    actionCountEl,
    sccSizeEl,
    hotspotRankEl,
    topFilesListEl,
    topOutputsListEl,
    mnemonicListEl,
    weightModeLabelEl,
  });

  let primaryMode: PrimaryWeightMode = 'transitive-total';
  let advancedMode: AdvancedWeightMode = 'follow-focus';
  let graphOrientation: GraphOrientation = 'top-down';
  let graphLayoutMode: GraphLayoutMode = 'preserve';
  let analysisQuery = '';
  let impactEntries: ReturnType<typeof getTopImpactTargets> = [];
  let pressureEntries: ReturnType<typeof getTopBreakupCandidates> = [];
  let fileEntries: ReturnType<typeof getTopSourceHeavyTargets> = [];
  let inputEntries: ReturnType<typeof getTopInputHeavyTargets> = [];
  let outputEntries: ReturnType<typeof getTopOutputHeavyTargets> = [];
  let positionedGraph: PositionedGraph | null = null;
  let backendAnalysis: BuildScopeAnalysisResponse | null = null;
  let decompositionCache = new Map<string, BuildScopeDecompositionResponse | null>();
  let decompositionRequestToken = 0;

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

  const syncDisplayControls = () => {
    graphOrientationSelect.value = graphOrientation;
    graphLayoutSelect.value = graphLayoutMode;
  };

  const applyDisplayOptions = () => {
    viz.setDisplayOptions({
      graphOrientation,
      graphLayoutMode,
    });
    syncDisplayControls();
  };

  themeSelect.value = loadThemePreference();
  syncWeightModeControls();
  syncDisplayControls();

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

  const renderAnalysisList = (
    listEl: HTMLElement,
    countEl: HTMLElement,
    entries: AnalysisEntry[],
    mode: 'transitive-total' | 'pressure' | 'source-bytes' | 'input-bytes' | 'output-bytes'
  ) => {
    listEl.replaceChildren();
    const { visible, filteredCount, totalCount, isFiltered } = getVisibleAnalysisEntries(
      entries,
      analysisQuery
    );
    countEl.innerText = isFiltered
      ? `${filteredCount} match${filteredCount === 1 ? '' : 'es'}`
      : totalCount > visible.length
        ? `${visible.length} of ${totalCount} ranked`
        : `${totalCount} ranked`;

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'analysis-empty';
      empty.innerText = isFiltered
        ? 'No ranking entries match that filter.'
        : 'No ranked targets for this graph.';
      listEl.appendChild(empty);
      return;
    }

    visible.forEach(({ entry, rank }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'analysis-item';
      button.title = entry.label;
      button.addEventListener('click', () => {
        if (mode === 'transitive-total' || mode === 'pressure') {
          focusFromAnalysis(entry.id, mode);
          return;
        }
        advancedMode = mode;
        applyWeightMode();
        viz.focusNode(entry.id);
      });

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
    renderAnalysisList(fileAnalysisListEl, fileAnalysisCountEl, fileEntries, 'source-bytes');
    renderAnalysisList(inputAnalysisListEl, inputAnalysisCountEl, inputEntries, 'input-bytes');
    renderAnalysisList(outputAnalysisListEl, outputAnalysisCountEl, outputEntries, 'output-bytes');
  };

  const applyClientAnalysisEntries = (graph: PositionedGraph) => {
    impactEntries = getTopImpactTargets(graph.nodes);
    pressureEntries = getTopBreakupCandidates(graph.nodes);
    fileEntries = getTopSourceHeavyTargets(graph.nodes);
    inputEntries = getTopInputHeavyTargets(graph.nodes);
    outputEntries = getTopOutputHeavyTargets(graph.nodes);
  };

  const applyBackendAnalysisEntries = (analysis: BuildScopeAnalysisResponse) => {
    impactEntries = getTopImpactTargetsFromAnalysis(analysis);
    pressureEntries = getTopBreakupCandidatesFromAnalysis(analysis);
    fileEntries = getTopSourceHeavyTargetsFromAnalysis(analysis);
    outputEntries = getTopOutputHeavyTargetsFromAnalysis(analysis);
  };

  const refreshAnalysisEntries = () => {
    if (!positionedGraph) return;
    applyClientAnalysisEntries(positionedGraph);
    if (backendAnalysis) {
      applyBackendAnalysisEntries(backendAnalysis);
    }
    renderAnalysisLists();
  };

  const renderDecompositionEmpty = (message: string, note?: string) => {
    decompositionMetaEl.innerText = 'Readable split guidance';
    decompositionVerdictEl.classList.add('hidden');
    decompositionVerdictEl.innerText = '';
    decompositionImpactScoreEl.innerText = '—';
    decompositionImpactMetaEl.innerText = '—';
    decompositionMassScoreEl.innerText = '—';
    decompositionMassMetaEl.innerText = '—';
    decompositionShardabilityScoreEl.innerText = '—';
    decompositionShardabilityMetaEl.innerText = '—';
    decompositionCommunityCountEl.innerText = '—';
    decompositionCommunityMetaEl.innerText = '—';
    decompositionLargestCommunityShareEl.innerText = '—';
    decompositionCrossEdgeRatioEl.innerText = '—';
    decompositionCommunityListEl.replaceChildren();

    const empty = document.createElement('div');
    empty.className = 'analysis-empty';
    empty.innerText = message;
    decompositionCommunityListEl.appendChild(empty);

    if (note) {
      decompositionNoteEl.classList.remove('hidden');
      decompositionNoteEl.innerText = note;
    } else {
      decompositionNoteEl.classList.add('hidden');
      decompositionNoteEl.innerText = '';
    }
  };

  const renderDecomposition = (decomposition: BuildScopeDecompositionResponse | null) => {
    if (!decomposition) {
      renderDecompositionEmpty('Focused decomposition is unavailable for this graph.');
      return;
    }

    decompositionMetaEl.innerText = 'Graph-relative fit and seam strength';
    if (decomposition.verdict) {
      decompositionVerdictEl.classList.remove('hidden');
      decompositionVerdictEl.innerText = decomposition.verdict;
    } else {
      decompositionVerdictEl.classList.add('hidden');
      decompositionVerdictEl.innerText = '';
    }
    decompositionImpactScoreEl.innerText = decomposition.impact?.band || '—';
    decompositionImpactMetaEl.innerText =
      decomposition.impact
        ? `${formatPercentile(decomposition.impact.percentile)} · ${decomposition.impact.reason || `score ${formatDecompositionScore(decomposition.impact.score)}`}`
        : '—';
    decompositionMassScoreEl.innerText = decomposition.mass?.band || '—';
    decompositionMassMetaEl.innerText =
      decomposition.mass
        ? `${formatPercentile(decomposition.mass.percentile)} · ${decomposition.mass.reason || `score ${formatDecompositionScore(decomposition.mass.score)}`}`
        : '—';
    decompositionShardabilityScoreEl.innerText = decomposition.splitFit?.band || '—';
    decompositionShardabilityMetaEl.innerText =
      decomposition.splitFit
        ? `${formatPercentile(decomposition.splitFit.percentile)} structural breadth · ${decomposition.splitFit.reason || `score ${formatDecompositionScore(decomposition.splitFit.score)}`}`
        : '—';
    decompositionCommunityCountEl.innerText = decomposition.communityCount === 1 ? '1 group' : `${decomposition.communityCount ?? 0} groups`;
    decompositionCommunityMetaEl.innerText =
      `${decomposition.directRuleDependencyCount} direct rule deps · ${formatRatio(decomposition.largestCommunityShare)} largest share`;
    decompositionLargestCommunityShareEl.innerText = formatRatio(decomposition.largestCommunityShare);
    decompositionCrossEdgeRatioEl.innerText =
      decomposition.crossCommunityEdgeRatio === undefined
        ? '—'
        : decomposition.crossCommunityEdgeRatio === 0
          ? 'No cross edges'
          : formatRatio(decomposition.crossCommunityEdgeRatio);

    const note =
      decomposition.recommendations?.find(Boolean) ||
      decomposition.reason ||
      '';
    if (note) {
      decompositionNoteEl.classList.remove('hidden');
      decompositionNoteEl.innerText = note;
    } else {
      decompositionNoteEl.classList.add('hidden');
      decompositionNoteEl.innerText = '';
    }

    decompositionCommunityListEl.replaceChildren();
    if (!decomposition.eligible || !(decomposition.communities?.length)) {
      const empty = document.createElement('div');
      empty.className = 'analysis-empty';
      empty.innerText = decomposition.reason || 'No clear dependency groups found for this target.';
      decompositionCommunityListEl.appendChild(empty);
      return;
    }

    decomposition.communities.forEach((community) => {
      const item = document.createElement('div');
      item.className = 'analysis-item analysis-item-plain';

      const body = document.createElement('span');
      body.className = 'analysis-item-body';

      const title = document.createElement('span');
      title.className = 'analysis-item-title';
      title.innerText = community.title;

      const meta = document.createElement('span');
      meta.className = 'analysis-item-meta';
      const sample = community.sampleLabels?.length
        ? ` · ${community.sampleLabels.map((label) => splitTargetLabel(label).primary).join(', ')}`
        : '';
      meta.innerText =
        `${community.nodeCount} deps · ${formatRatio(community.share)} share · ` +
        `${community.crossCommunityEdgeCount} cross edges${sample}`;

      body.appendChild(title);
      body.appendChild(meta);
      item.appendChild(body);
      decompositionCommunityListEl.appendChild(item);
    });
  };

  const refreshSelectionDecomposition = (selectedNodeId: string | null) => {
    decompositionRequestToken++;
    const requestToken = decompositionRequestToken;

    if (!selectedNodeId || !positionedGraph) {
      focusDecompositionGroupEl.classList.add('hidden');
      renderDecompositionEmpty('Select a rule target to inspect split seams.');
      return;
    }

    const selectedNode = positionedGraph.idToNode.get(selectedNodeId);
    if (!selectedNode || !isRuleSelection(selectedNode.nodeType)) {
      focusDecompositionGroupEl.classList.add('hidden');
      renderDecompositionEmpty('Decomposition is only available for rule targets.');
      return;
    }

    focusDecompositionGroupEl.classList.remove('hidden');
    const cached = decompositionCache.get(selectedNodeId);
    if (cached !== undefined) {
      renderDecomposition(cached);
      return;
    }

    renderDecompositionEmpty('Loading focused decomposition…');
    void loadTargetDecomposition(selectedNodeId).then((decomposition) => {
      decompositionCache.set(selectedNodeId, decomposition);
      if (requestToken !== decompositionRequestToken) return;
      renderDecomposition(decomposition);
    });
  };

  renderDecompositionEmpty('Select a rule target to inspect split seams.');
  focusDecompositionGroupEl.classList.add('hidden');
  viz.setSelectionChangeHandler((selectedNodeId) => {
    refreshSelectionDecomposition(selectedNodeId);
  });

  const toggleAdvancedOption = (value: AdvancedWeightMode, visible: boolean) => {
    const option = advancedModeSelect.querySelector(`option[value="${value}"]`) as HTMLOptionElement | null;
    if (!option) return;
    option.hidden = !visible;
    option.disabled = !visible;
  };

  const configureMetricUI = (graph: Graph) => {
    const availability = getMetricAvailability(graph);
    const hasInputArtifacts = availability.input || availability.source;
    const hasOutputArtifacts = availability.output;
    const hasActionMetadata = availability.action;

    fileAnalysisGroupEl.classList.toggle('hidden', !availability.source);
    inputAnalysisGroupEl.classList.toggle('hidden', !availability.input);
    outputAnalysisGroupEl.classList.toggle('hidden', !(availability.output || availability.action));

    focusSurfaceGroupEl.classList.toggle(
      'hidden',
      !(availability.source || availability.input || availability.output || availability.action)
    );
    focusInputsGroupEl.classList.toggle('hidden', !hasInputArtifacts);
    focusOutputsGroupEl.classList.toggle('hidden', !hasOutputArtifacts);
    focusActionsGroupEl.classList.toggle('hidden', !hasActionMetadata);

    toggleAdvancedOption('source-file-count', availability.source);
    toggleAdvancedOption('source-bytes', availability.source);
    toggleAdvancedOption('input-file-count', availability.input);
    toggleAdvancedOption('input-bytes', availability.input);
    toggleAdvancedOption('output-file-count', availability.output);
    toggleAdvancedOption('output-bytes', availability.output);
    toggleAdvancedOption('action-count', availability.action);

    const advancedModeAvailable =
      advancedMode === 'follow-focus' ||
      advancedMode === 'hotspots' ||
      advancedMode === 'uniform' ||
      ((advancedMode === 'source-file-count' || advancedMode === 'source-bytes') && availability.source) ||
      ((advancedMode === 'input-file-count' || advancedMode === 'input-bytes') && availability.input) ||
      ((advancedMode === 'output-file-count' || advancedMode === 'output-bytes') && availability.output) ||
      (advancedMode === 'action-count' && availability.action);

    if (!advancedModeAvailable) {
      advancedMode = 'follow-focus';
    }
    viz.setSurfaceMetadataAvailable(
      availability.source || availability.input || availability.output || availability.action
    );
    syncWeightModeControls();
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

  graphOrientationSelect.addEventListener('change', () => {
    graphOrientation = graphOrientationSelect.value as GraphOrientation;
    applyDisplayOptions();
  });

  graphLayoutSelect.addEventListener('change', () => {
    graphLayoutMode = graphLayoutSelect.value as GraphLayoutMode;
    applyDisplayOptions();
  });

  chokePointPresetBtn.addEventListener('click', () => {
    primaryMode = 'pressure';
    advancedMode = 'follow-focus';
    graphOrientation = 'left-right';
    graphLayoutMode = 'directional';
    applyWeightMode();
    applyDisplayOptions();
    if (pressureEntries.length > 0) {
      viz.focusNode(pressureEntries[0].id);
    }
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
  void loadAnalysis().then((analysis) => {
    if (!analysis) return;
    backendAnalysis = analysis;
    refreshAnalysisEntries();
  });

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
    decompositionCache = new Map();
    viz.setPositionedGraph(pg);
    positionedGraph = pg;
    refreshAnalysisEntries();
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
      configureMetricUI(g);
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
