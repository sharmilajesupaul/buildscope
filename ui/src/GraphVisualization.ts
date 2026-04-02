import { Application, Container, Graphics } from 'pixi.js';
import {
  ArtifactSummary,
  GraphEdge,
  MnemonicCount,
  PositionedGraph,
  PositionedNode,
  WeightMode,
  recalculateWeights,
} from './graphLayout';
import {
  GraphLayoutMode,
  GraphOrientation,
  positionAlongOrientation,
  transformGraphPoint,
} from './graphView';
import {
  LARGE_GRAPH_THRESHOLD,
  VIEWPORT_PADDING,
  MIN_SCALE,
  MAX_SCALE,
  ZOOM_FACTOR,
  EDGE_VISIBILITY_THRESHOLD,
  getGraphPalette,
  type GraphPalette,
} from './constants';

export interface UIElements {
  selectionInspectorEl: HTMLElement;
  zoomLevelEl: HTMLElement;
  statusBadge: HTMLElement;
  nodeCountEl: HTMLElement;
  edgeCountEl: HTMLElement;
  ruleCountEl: HTMLElement;
  hotspotCountEl: HTMLElement;
  largestSccEl: HTMLElement;
  currentNodeEl: HTMLElement;
  currentNodeStatus: HTMLElement;
  currentNodeSubtitleEl: HTMLElement;
  currentNodeEmptyEl: HTMLElement;
  selectionNoteEl: HTMLElement;
  nodeTypeEl: HTMLElement;
  ruleKindEl: HTMLElement;
  directInputsEl: HTMLElement;
  directOutputsEl: HTMLElement;
  transitiveInputsEl: HTMLElement;
  transitiveOutputsEl: HTMLElement;
  sourceFileCountEl: HTMLElement;
  sourceBytesEl: HTMLElement;
  inputFileCountEl: HTMLElement;
  inputBytesEl: HTMLElement;
  outputFileCountEl: HTMLElement;
  outputBytesEl: HTMLElement;
  actionCountEl: HTMLElement;
  sccSizeEl: HTMLElement;
  hotspotRankEl: HTMLElement;
  topFilesListEl: HTMLElement;
  topOutputsListEl: HTMLElement;
  mnemonicListEl: HTMLElement;
  weightModeLabelEl: HTMLElement;
}

export class GraphVisualization {
  private app: Application;
  private graphContainer: Container;
  private edgesGfx: Graphics;       // persistent — cleared and redrawn, never recreated
  private navigationNodesGfx: Graphics;
  private nodesLayer: Container;
  private nodeGraphics: Map<string, Graphics>;
  private positioned: PositionedGraph | null = null;

  // Precomputed index: sccId → Set<nodeId> for O(1) cycle expansion on hover/click
  private sccMembers = new Map<number, Set<string>>();

  // State
  private currentScale = 1;
  private isPanning = false;
  private panMoved = false;
  private panStart = { x: 0, y: 0 };
  private lastPan = { x: 0, y: 0 };
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private drawScheduled = false;
  private hoverSuppressed = false;
  private hoverResumeTimeout: number | null = null;
  private navigationActive = false;
  private lastShowAllEdges = false;
  private lastEdgeHighlightSignature = '';
  private lastStatusSignature = '';
  private traversalCache = new Map<
    string,
    { transitiveNodes: Set<string>; transitiveEdges: Set<string> }
  >();
  private currentRenderPositions: Map<string, { x: number; y: number }> | null = null;
  private currentWeightMode: WeightMode = 'transitive-total';
  private graphOrientation: GraphOrientation = 'top-down';
  private graphLayoutMode: GraphLayoutMode = 'preserve';

  // UI Elements
  private zoomLevelEl: HTMLElement;
  private selectionInspectorEl: HTMLElement;
  private statusBadge: HTMLElement;
  private nodeCountEl: HTMLElement;
  private edgeCountEl: HTMLElement;
  private ruleCountEl: HTMLElement;
  private hotspotCountEl: HTMLElement;
  private largestSccEl: HTMLElement;
  private currentNodeEl: HTMLElement;
  private currentNodeStatus: HTMLElement;
  private currentNodeSubtitleEl: HTMLElement;
  private currentNodeEmptyEl: HTMLElement;
  private selectionNoteEl: HTMLElement;
  private nodeTypeEl: HTMLElement;
  private ruleKindEl: HTMLElement;
  private directInputsEl: HTMLElement;
  private directOutputsEl: HTMLElement;
  private transitiveInputsEl: HTMLElement;
  private transitiveOutputsEl: HTMLElement;
  private sourceFileCountEl: HTMLElement;
  private sourceBytesEl: HTMLElement;
  private inputFileCountEl: HTMLElement;
  private inputBytesEl: HTMLElement;
  private outputFileCountEl: HTMLElement;
  private outputBytesEl: HTMLElement;
  private actionCountEl: HTMLElement;
  private sccSizeEl: HTMLElement;
  private hotspotRankEl: HTMLElement;
  private topFilesListEl: HTMLElement;
  private topOutputsListEl: HTMLElement;
  private mnemonicListEl: HTMLElement;
  private weightModeLabelEl: HTMLElement;
  private navigationSettleTimeout: number | null = null;
  private nodesInteractive = true;
  private pickableNodeIds: string[] = [];
  private palette: GraphPalette = getGraphPalette();
  private surfaceMetadataAvailable = false;
  private selectionChangeHandler: ((nodeId: string | null) => void) | null = null;

  constructor(app: Application, uiElements: UIElements) {
    this.app = app;
    this.graphContainer = new Container();
    this.edgesGfx = new Graphics();
    this.navigationNodesGfx = new Graphics();
    this.nodesLayer = new Container();
    this.nodesLayer.sortableChildren = true;
    this.nodeGraphics = new Map();

    this.app.stage.addChild(this.graphContainer);
    // Fixed layer order: edges behind nodes — set up once, never changed
    this.graphContainer.addChild(this.edgesGfx);
    this.graphContainer.addChild(this.navigationNodesGfx);
    this.graphContainer.addChild(this.nodesLayer);
    this.navigationNodesGfx.visible = false;

    // Assign UI elements
    this.selectionInspectorEl = uiElements.selectionInspectorEl;
    this.zoomLevelEl = uiElements.zoomLevelEl;
    this.statusBadge = uiElements.statusBadge;
    this.nodeCountEl = uiElements.nodeCountEl;
    this.edgeCountEl = uiElements.edgeCountEl;
    this.ruleCountEl = uiElements.ruleCountEl;
    this.hotspotCountEl = uiElements.hotspotCountEl;
    this.largestSccEl = uiElements.largestSccEl;
    this.currentNodeEl = uiElements.currentNodeEl;
    this.currentNodeStatus = uiElements.currentNodeStatus;
    this.currentNodeSubtitleEl = uiElements.currentNodeSubtitleEl;
    this.currentNodeEmptyEl = uiElements.currentNodeEmptyEl;
    this.selectionNoteEl = uiElements.selectionNoteEl;
    this.nodeTypeEl = uiElements.nodeTypeEl;
    this.ruleKindEl = uiElements.ruleKindEl;
    this.directInputsEl = uiElements.directInputsEl;
    this.directOutputsEl = uiElements.directOutputsEl;
    this.transitiveInputsEl = uiElements.transitiveInputsEl;
    this.transitiveOutputsEl = uiElements.transitiveOutputsEl;
    this.sourceFileCountEl = uiElements.sourceFileCountEl;
    this.sourceBytesEl = uiElements.sourceBytesEl;
    this.inputFileCountEl = uiElements.inputFileCountEl;
    this.inputBytesEl = uiElements.inputBytesEl;
    this.outputFileCountEl = uiElements.outputFileCountEl;
    this.outputBytesEl = uiElements.outputBytesEl;
    this.actionCountEl = uiElements.actionCountEl;
    this.sccSizeEl = uiElements.sccSizeEl;
    this.hotspotRankEl = uiElements.hotspotRankEl;
    this.topFilesListEl = uiElements.topFilesListEl;
    this.topOutputsListEl = uiElements.topOutputsListEl;
    this.mnemonicListEl = uiElements.mnemonicListEl;
    this.weightModeLabelEl = uiElements.weightModeLabelEl;
  }

  setSelectionChangeHandler(handler: ((nodeId: string | null) => void) | null) {
    this.selectionChangeHandler = handler;
  }

  private notifySelectionChanged() {
    this.selectionChangeHandler?.(this.selectedId);
  }

  // Viewport calculations
  private getViewportBounds() {
    const viewW = this.app.renderer.screen.width;
    const viewH = this.app.renderer.screen.height;

    const minX = (-this.graphContainer.position.x - VIEWPORT_PADDING) / this.currentScale;
    const minY = (-this.graphContainer.position.y - VIEWPORT_PADDING) / this.currentScale;
    const maxX = (viewW - this.graphContainer.position.x + VIEWPORT_PADDING) / this.currentScale;
    const maxY = (viewH - this.graphContainer.position.y + VIEWPORT_PADDING) / this.currentScale;

    return { minX, minY, maxX, maxY };
  }

  private isNodeVisible(
    node: PositionedNode,
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
  ) {
    const { x, y } = this.getNodePosition(node);
    return (
      x >= bounds.minX &&
      x <= bounds.maxX &&
      y >= bounds.minY &&
      y <= bounds.maxY
    );
  }

  // Zoom management
  updateZoomLevel() {
    const input = this.zoomLevelEl as HTMLInputElement;
    input.value = `${Math.round(this.currentScale * 100)}%`;
  }

  zoom(delta: number, cx: number, cy: number) {
    if (!this.positioned) return;

    const factor = delta < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newScale = Math.min(Math.max(this.currentScale * factor, MIN_SCALE), MAX_SCALE);

    const before = {
      x: (cx - this.graphContainer.position.x) / this.currentScale,
      y: (cy - this.graphContainer.position.y) / this.currentScale,
    };

    this.currentScale = newScale;
    this.graphContainer.scale.set(newScale);

    const after = {
      x: (cx - this.graphContainer.position.x) / this.currentScale,
      y: (cy - this.graphContainer.position.y) / this.currentScale,
    };

    this.graphContainer.position.x += (after.x - before.x) * this.currentScale;
    this.graphContainer.position.y += (after.y - before.y) * this.currentScale;

    this.updateZoomLevel();
    this.suppressHoverForNavigation();
    if (this.positioned.nodes.length <= LARGE_GRAPH_THRESHOLD) {
      this.scheduleDraw();
    }
  }

  // Schedules a single draw on the next animation frame — deduplicated so rapid zoom/pan
  // events coalesce into one redraw instead of hammering the draw path.
  private scheduleDraw(skipEdgeRedraw = false) {
    if (this.drawScheduled) return;
    this.drawScheduled = true;
    requestAnimationFrame(() => {
      this.drawScheduled = false;
      if (this.positioned) this.draw(this.positioned, false, false, true, skipEdgeRedraw);
    });
  }

  private setNodeInteractivity(enabled: boolean) {
    if (this.nodesInteractive === enabled) return;
    this.nodesInteractive = enabled;
  }

  private clearNavigationPreview() {
    this.navigationNodesGfx.clear();
    this.navigationNodesGfx.visible = false;
    this.nodesLayer.visible = true;
    this.edgesGfx.visible = true;
  }

  private drawNavigationPreview(pg: PositionedGraph) {
    const scope = this.getSelectionScope(pg);
    const focusedNodes = scope?.transitiveNodes ?? null;
    const palette = this.palette;

    this.navigationNodesGfx.clear();
    for (const node of pg.nodes) {
      if (focusedNodes && !focusedNodes.has(node.id) && node.id !== this.selectedId) {
        continue;
      }

      const isSelected = node.id === this.selectedId;
      const isHovered = node.id === this.hoveredId;
      const isHighlight = isSelected || isHovered;
      const { x, y } = this.getNodePosition(node);
      const baseRadius = Math.min(this.calculateNodeSize(node, isHighlight), focusedNodes ? 12 : 10);
      const radius = isSelected ? Math.min(baseRadius * 1.45, focusedNodes ? 18 : 16) : baseRadius;
      const color = isSelected
        ? palette.nodeSelected
        : node.isHotspot
          ? palette.nodeImpact
          : palette.nodeDefault;
      const alpha = isSelected ? 1 : isHovered ? 0.94 : node.isHotspot ? 0.8 : 0.64;

      if (isSelected) {
        this.navigationNodesGfx.lineStyle(1.6, palette.nodeSelectedRing, 0.34);
        this.navigationNodesGfx.drawCircle(x, y, radius + 8);
        this.navigationNodesGfx.lineStyle(3.4, palette.nodeSelectedRing, 0.98);
        this.navigationNodesGfx.drawCircle(x, y, radius + 4);
        this.navigationNodesGfx.lineStyle(0, 0, 0);
      } else if (isHovered) {
        this.navigationNodesGfx.lineStyle(
          2,
          palette.nodeHoverRing,
          0.8
        );
        this.navigationNodesGfx.drawCircle(x, y, radius + 3);
        this.navigationNodesGfx.lineStyle(0, 0, 0);
      }

      this.navigationNodesGfx.beginFill(color, alpha);
      this.navigationNodesGfx.drawCircle(x, y, radius);
      this.navigationNodesGfx.endFill();

      if (isSelected) {
        this.navigationNodesGfx.beginFill(palette.nodeSelectedRing, 0.94);
        this.navigationNodesGfx.drawCircle(x, y, Math.max(3, radius * 0.28));
        this.navigationNodesGfx.endFill();
      }
    }

    this.nodesLayer.visible = false;
    this.edgesGfx.visible = false;
    this.navigationNodesGfx.visible = true;
  }

  private startNavigationPreview() {
    if (!this.positioned || this.positioned.nodes.length <= LARGE_GRAPH_THRESHOLD) return;
    if (!this.navigationNodesGfx.visible) {
      this.drawNavigationPreview(this.positioned);
    }
    this.setNodeInteractivity(false);
  }

  private screenToGraph(x: number, y: number) {
    return {
      x: (x - this.graphContainer.position.x) / this.currentScale,
      y: (y - this.graphContainer.position.y) / this.currentScale,
    };
  }

  private pickNodeAt(clientX: number, clientY: number): string | null {
    if (!this.positioned || this.navigationActive) return null;

    const point = this.screenToGraph(clientX, clientY);
    let bestId: string | null = null;
    let bestDistanceSq = Infinity;

    for (const nodeId of this.pickableNodeIds) {
      const node = this.positioned.idToNode.get(nodeId);
      if (!node) continue;
      const { x, y } = this.getNodePosition(node);
      const dx = (x - point.x) * this.currentScale;
      const dy = (y - point.y) * this.currentScale;
      const distanceSq = dx * dx + dy * dy;
      const screenRadius = Math.max(
        9,
        Math.min(this.calculateNodeSize(node, node.id === this.selectedId) * this.currentScale + 4, 18)
      );

      if (distanceSq <= screenRadius * screenRadius && distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestId = nodeId;
      }
    }

    return bestId;
  }

  private settleNavigation(force = false) {
    if (this.navigationSettleTimeout !== null) {
      window.clearTimeout(this.navigationSettleTimeout);
      this.navigationSettleTimeout = null;
    }

    if (!this.navigationActive && !force) return;

    this.navigationActive = false;
    this.clearNavigationPreview();
    this.setNodeInteractivity(true);

    if (this.positioned) {
      this.draw(this.positioned, false, false, true);
    }
  }

  // Suppress hover updates while the viewport is moving so pointerover/out does not
  // trigger full redraws as nodes slide under the cursor during pan/zoom.
  private suppressHoverForNavigation() {
    this.hoverSuppressed = true;
    this.navigationActive = true;
    if (this.hoveredId) {
      this.hoveredId = null;
    }
    if (this.positioned && this.positioned.nodes.length > LARGE_GRAPH_THRESHOLD) {
      this.startNavigationPreview();
    }
    if (this.hoverResumeTimeout !== null) {
      window.clearTimeout(this.hoverResumeTimeout);
    }
    this.hoverResumeTimeout = window.setTimeout(() => {
      this.hoverSuppressed = false;
      this.hoverResumeTimeout = null;
    }, 120);
    if (this.navigationSettleTimeout !== null) {
      window.clearTimeout(this.navigationSettleTimeout);
    }
    this.navigationSettleTimeout = window.setTimeout(() => this.settleNavigation(), 96);
  }

  setZoomToPercentage(percentage: number) {
    if (!this.positioned) return;

    const newScale = Math.min(Math.max(percentage / 100, MIN_SCALE), MAX_SCALE);
    this.currentScale = newScale;
    this.graphContainer.scale.set(newScale);
    this.updateZoomLevel();
    this.draw(this.positioned, false, false);
  }

  getCurrentScale(): number {
    return this.currentScale;
  }

  // Calculate transitive dependencies for a specific node
  private getTraversal(
    nodeId: string,
    pg: PositionedGraph,
    direction: 'incoming' | 'outgoing' | 'both'
  ): {
    transitiveNodes: Set<string>;
    transitiveEdges: Set<string>;
  } {
    const cacheKey = `${direction}:${nodeId}`;
    const cached = this.traversalCache.get(cacheKey);
    if (cached) return cached;

    if (direction === 'both') {
      const incoming = this.getTraversal(nodeId, pg, 'incoming');
      const outgoing = this.getTraversal(nodeId, pg, 'outgoing');
      const result = {
        transitiveNodes: new Set([...incoming.transitiveNodes, ...outgoing.transitiveNodes]),
        transitiveEdges: new Set([...incoming.transitiveEdges, ...outgoing.transitiveEdges]),
      };
      this.traversalCache.set(cacheKey, result);
      return result;
    }

    const transitiveNodes = new Set<string>();
    const transitiveEdges = new Set<string>();
    const visited = new Set<string>([nodeId]);
    const queue: string[] = [nodeId];
    let head = 0;

    while (head < queue.length) {
      const currentId = queue[head++];
      const incidentEdges = direction === 'incoming'
        ? (pg.incoming.get(currentId) ?? [])
        : (pg.outgoing.get(currentId) ?? []);
      for (const e of incidentEdges) {
        const edgeKey = `${e.source}->${e.target}`;
        transitiveEdges.add(edgeKey);

        const connectedId = direction === 'incoming' ? e.source : e.target;
        if (!visited.has(connectedId)) {
          visited.add(connectedId);
          transitiveNodes.add(connectedId);
          queue.push(connectedId);
        }
      }
    }

    const result = { transitiveNodes, transitiveEdges };
    this.traversalCache.set(cacheKey, result);
    return result;
  }

  private getSelectionScope(pg: PositionedGraph): {
    transitiveNodes: Set<string>;
    transitiveEdges: Set<string>;
  } | null {
    if (!this.selectedId) return null;

    const transitiveNodes = new Set<string>([this.selectedId]);
    const transitiveEdges = new Set<string>();
    const addEdges = (edges: GraphEdge[]) => {
      for (const edge of edges) {
        transitiveEdges.add(`${edge.source}->${edge.target}`);
        transitiveNodes.add(edge.source);
        transitiveNodes.add(edge.target);
      }
    };

    switch (this.currentWeightMode) {
      case 'inputs':
        addEdges(pg.incoming.get(this.selectedId) ?? []);
        break;
      case 'outputs':
        addEdges(pg.outgoing.get(this.selectedId) ?? []);
        break;
      case 'transitive-inputs': {
        const incoming = this.getTraversal(this.selectedId, pg, 'incoming');
        incoming.transitiveNodes.forEach((id) => transitiveNodes.add(id));
        incoming.transitiveEdges.forEach((key) => transitiveEdges.add(key));
        break;
      }
      case 'transitive-outputs': {
        const outgoing = this.getTraversal(this.selectedId, pg, 'outgoing');
        outgoing.transitiveNodes.forEach((id) => transitiveNodes.add(id));
        outgoing.transitiveEdges.forEach((key) => transitiveEdges.add(key));
        break;
      }
      case 'transitive-total': {
        const both = this.getTraversal(this.selectedId, pg, 'both');
        both.transitiveNodes.forEach((id) => transitiveNodes.add(id));
        both.transitiveEdges.forEach((key) => transitiveEdges.add(key));
        break;
      }
      case 'pressure':
      case 'hotspots': {
        const node = pg.idToNode.get(this.selectedId);
        if (node?.sccSize && node.sccSize > 1) {
          this.sccMembers.get(node.sccId)?.forEach((id) => transitiveNodes.add(id));
        }
        addEdges(pg.neighbors.get(this.selectedId) ?? []);
        for (const nodeId of transitiveNodes) {
          const edges = pg.neighbors.get(nodeId) ?? [];
          for (const edge of edges) {
            if (transitiveNodes.has(edge.source) && transitiveNodes.has(edge.target)) {
              transitiveEdges.add(`${edge.source}->${edge.target}`);
            }
          }
        }
        break;
      }
      case 'uniform':
      case 'total':
      default:
        addEdges(pg.neighbors.get(this.selectedId) ?? []);
        break;
    }

    return { transitiveNodes, transitiveEdges };
  }

  private getScopeNodes(
    pg: PositionedGraph,
    scope: { transitiveNodes: Set<string>; transitiveEdges: Set<string> } | null
  ): PositionedNode[] {
    if (!scope) return [];
    return Array.from(scope.transitiveNodes)
      .map((id) => pg.idToNode.get(id))
      .filter((node): node is PositionedNode => Boolean(node));
  }

  private getSafeViewportFrame() {
    const viewW = this.app.renderer.screen.width;
    const viewH = this.app.renderer.screen.height;
    let left = 20;
    let right = viewW - 20;
    let top = 20;
    let bottom = viewH - 20;

    const header = document.querySelector('.app-header') as HTMLElement | null;
    const sidePanel = document.querySelector('.side-panel') as HTMLElement | null;
    const selectionInspector = document.querySelector('.selection-inspector') as HTMLElement | null;

    if (header) {
      const rect = header.getBoundingClientRect();
      if (rect.top < viewH * 0.25) {
        top = Math.max(top, rect.bottom + 16);
      }
    }

    if (sidePanel) {
      const rect = sidePanel.getBoundingClientRect();
      const isCollapsed = sidePanel.classList.contains('is-collapsed');
      if (!isCollapsed) {
        if (rect.left < viewW * 0.35 && rect.height < viewH * 0.92) {
          left = Math.max(left, rect.right + 18);
        } else if (rect.right > viewW * 0.65 && rect.height < viewH * 0.92) {
          right = Math.min(right, rect.left - 18);
        }
      }
    }

    if (selectionInspector) {
      const rect = selectionInspector.getBoundingClientRect();
      if (rect.width < viewW * 0.42) {
        if (rect.left > viewW * 0.52) {
          right = Math.min(right, rect.left - 18);
        }
        if (rect.top > viewH * 0.48) {
          bottom = Math.min(bottom, rect.top - 18);
        }
      }
    }

    if (right - left < 260) {
      left = 20;
      right = viewW - 20;
    }

    if (bottom - top < 220) {
      top = 20;
      bottom = viewH - 20;
    }

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  private getNodePosition(node: PositionedNode) {
    return this.currentRenderPositions?.get(node.id) ?? this.getOrientedNodePosition(node);
  }

  private getOrientedNodePosition(node: PositionedNode) {
    return transformGraphPoint(node, this.graphOrientation);
  }

  private getFocusCompactionFactor(nodeCount: number) {
    if (nodeCount <= 4) return 0.4;
    if (nodeCount <= 8) return 0.46;
    if (nodeCount <= 16) return 0.56;
    if (nodeCount <= 24) return 0.64;
    return 0.74;
  }

  private getDirectionalFocusDistances(
    pg: PositionedGraph,
    selectedId: string,
    allowedNodes: Set<string>,
    direction: 'incoming' | 'outgoing'
  ) {
    const distances = new Map<string, number>();
    const queue: string[] = [selectedId];
    distances.set(selectedId, 0);
    let head = 0;

    while (head < queue.length) {
      const currentId = queue[head++];
      const currentDistance = distances.get(currentId) ?? 0;
      const edges = direction === 'incoming'
        ? (pg.incoming.get(currentId) ?? [])
        : (pg.outgoing.get(currentId) ?? []);

      for (const edge of edges) {
        const nextId = direction === 'incoming' ? edge.source : edge.target;
        if (!allowedNodes.has(nextId) || distances.has(nextId)) continue;
        distances.set(nextId, currentDistance + 1);
        queue.push(nextId);
      }
    }

    distances.delete(selectedId);
    return distances;
  }

  private getLocalFocusSpacing(nodeCount: number) {
    if (nodeCount <= 4) return { horizontal: 132, vertical: 88 };
    if (nodeCount <= 8) return { horizontal: 144, vertical: 84 };
    if (nodeCount <= 12) return { horizontal: 156, vertical: 76 };
    return { horizontal: 168, vertical: 68 };
  }

  private getDirectionalFocusPositions(
    pg: PositionedGraph,
    selected: PositionedNode,
    scopeNodes: PositionedNode[]
  ) {
    const allowedNodes = new Set(scopeNodes.map((node) => node.id));
    const incomingDistances = this.getDirectionalFocusDistances(pg, selected.id, allowedNodes, 'incoming');
    const outgoingDistances = this.getDirectionalFocusDistances(pg, selected.id, allowedNodes, 'outgoing');
    const buckets = new Map<number, PositionedNode[]>();

    for (const node of scopeNodes) {
      if (node.id === selected.id) continue;

      const incomingDistance = incomingDistances.get(node.id);
      const outgoingDistance = outgoingDistances.get(node.id);
      let depth = 1;

      if (incomingDistance !== undefined && outgoingDistance !== undefined) {
        depth = outgoingDistance <= incomingDistance ? outgoingDistance : -incomingDistance;
      } else if (outgoingDistance !== undefined) {
        depth = outgoingDistance;
      } else if (incomingDistance !== undefined) {
        depth = -incomingDistance;
      }

      const bucket = buckets.get(depth) ?? [];
      bucket.push(node);
      buckets.set(depth, bucket);
    }

    const positions = new Map<string, { x: number; y: number }>();
    const anchorPosition = this.getOrientedNodePosition(selected);
    positions.set(selected.id, anchorPosition);

    const { horizontal, vertical } = this.getLocalFocusSpacing(scopeNodes.length);
    for (const depth of [...buckets.keys()].sort((a, b) => a - b)) {
      const nodesAtDepth = (buckets.get(depth) ?? []).sort((a, b) =>
        b.transitiveInDegree + b.transitiveOutDegree - (a.transitiveInDegree + a.transitiveOutDegree) ||
        a.label.localeCompare(b.label)
      );

      const bandHeight = (nodesAtDepth.length - 1) * vertical;
      nodesAtDepth.forEach((node, index) => {
        positions.set(
          node.id,
          positionAlongOrientation(
            anchorPosition,
            depth * horizontal,
            index * vertical - bandHeight / 2,
            this.graphOrientation
          )
        );
      });
    }

    return positions;
  }

  private getRadialFocusPositions(selected: PositionedNode, scopeNodes: PositionedNode[]) {
    const positions = new Map<string, { x: number; y: number }>();
    const anchorPosition = this.getOrientedNodePosition(selected);
    positions.set(selected.id, anchorPosition);

    const others = scopeNodes
      .filter((node) => node.id !== selected.id)
      .sort((a, b) =>
        b.inDegree + b.outDegree - (a.inDegree + a.outDegree) ||
        a.label.localeCompare(b.label)
      );

    if (others.length === 0) return positions;

    if (others.length <= 4) {
      const slots = [
        { x: 0, y: -112 },
        { x: 138, y: 0 },
        { x: 0, y: 112 },
        { x: -138, y: 0 },
      ];
      others.forEach((node, index) => {
        const slot = slots[index] ?? slots[slots.length - 1];
        positions.set(node.id, {
          x: anchorPosition.x + slot.x,
          y: anchorPosition.y + slot.y,
        });
      });
      return positions;
    }

    const radiusX = 138 + Math.min(42, others.length * 6);
    const radiusY = 104 + Math.min(32, others.length * 5);
    others.forEach((node, index) => {
      const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / others.length;
      positions.set(node.id, {
        x: anchorPosition.x + Math.cos(angle) * radiusX,
        y: anchorPosition.y + Math.sin(angle) * radiusY,
      });
    });

    return positions;
  }
  private getDirectionalGraphPositions(pg: PositionedGraph) {
    const laneBase = pg.nodes.length > 10000 ? 120 : 180;
    const laneSpacing = laneBase * 1.08;
    const crossCompression = pg.nodes.length > 5000 ? 0.82 : 0.9;
    const positions = new Map<string, { x: number; y: number }>();

    for (const node of pg.nodes) {
      const depth = Math.round(node.y / laneBase) * laneSpacing;
      const cross = node.x * crossCompression;
      positions.set(
        node.id,
        positionAlongOrientation(
          { x: 0, y: 0 },
          depth,
          cross,
          this.graphOrientation
        )
      );
    }

    return positions;
  }

  private getRadialGraphPositions(pg: PositionedGraph) {
    if (pg.nodes.length === 0) return null;

    let minDepth = Infinity;
    let maxDepth = -Infinity;
    let minCross = Infinity;
    let maxCross = -Infinity;

    for (const node of pg.nodes) {
      if (node.y < minDepth) minDepth = node.y;
      if (node.y > maxDepth) maxDepth = node.y;
      if (node.x < minCross) minCross = node.x;
      if (node.x > maxCross) maxCross = node.x;
    }

    const depthRange = Math.max(1, maxDepth - minDepth);
    const crossRange = Math.max(1, maxCross - minCross);
    const outerRadius = Math.max(240, Math.max(depthRange, crossRange) * 0.58);
    const innerRadius = Math.max(56, outerRadius * 0.18);
    const positions = new Map<string, { x: number; y: number }>();

    for (const node of pg.nodes) {
      const depth01 = (node.y - minDepth) / depthRange;
      const cross01 = (node.x - minCross) / crossRange;
      const angle = (-Math.PI / 2) + cross01 * Math.PI * 2;
      const radius = innerRadius + depth01 * (outerRadius - innerRadius);
      positions.set(
        node.id,
        transformGraphPoint(
          {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
          },
          this.graphOrientation
        )
      );
    }

    return positions;
  }

  private getGraphRenderPositions(pg: PositionedGraph): Map<string, { x: number; y: number }> | null {
    switch (this.graphLayoutMode) {
      case 'directional':
        return this.getDirectionalGraphPositions(pg);
      case 'radial':
        return this.getRadialGraphPositions(pg);
      case 'preserve':
      default:
        return null;
    }
  }

  private fitNodesInView(nodes: PositionedNode[], minScale = MIN_SCALE, padding = 120) {
    if (!nodes.length) return;

    const frame = this.getSafeViewportFrame();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const { x, y } = this.getNodePosition(node);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const scale = Math.min(
      (frame.width - padding * 2) / width,
      (frame.height - padding * 2) / height
    );
    const clampedScale = Math.min(Math.max(scale, minScale), MAX_SCALE);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.currentScale = clampedScale;
    this.graphContainer.scale.set(clampedScale);
    this.graphContainer.position.set(
      frame.left + frame.width / 2 - centerX * clampedScale,
      frame.top + frame.height / 2 - centerY * clampedScale
    );
    this.updateZoomLevel();
  }

  private getFocusMinScale(nodeCount: number) {
    if (nodeCount <= 8) return 0.72;
    if (nodeCount <= 24) return 0.5;
    if (nodeCount <= 80) return 0.32;
    if (nodeCount <= 200) return 0.22;
    return 0.16;
  }

  private getFocusPadding(nodeCount: number) {
    if (nodeCount <= 8) return 112;
    if (nodeCount <= 24) return 96;
    if (nodeCount <= 80) return 80;
    if (nodeCount <= 200) return 68;
    return 56;
  }

  // Status updates
  getWeightModeLabel(mode: WeightMode) {
    switch (mode) {
      case 'total':
        return 'Direct';
      case 'inputs':
        return 'Inputs';
      case 'outputs':
        return 'Outputs';
      case 'transitive-total':
        return 'Impact';
      case 'transitive-inputs':
        return 'Upstream';
      case 'transitive-outputs':
        return 'Downstream';
      case 'pressure':
        return 'Pressure';
      case 'hotspots':
        return 'High impact';
      case 'source-file-count':
        return 'Source files';
      case 'source-bytes':
        return 'Source bytes';
      case 'input-file-count':
        return 'Input files';
      case 'input-bytes':
        return 'Input bytes';
      case 'output-file-count':
        return 'Outputs';
      case 'output-bytes':
        return 'Output bytes';
      case 'action-count':
        return 'Actions';
      case 'uniform':
        return 'Uniform';
    }
  }

  private formatBytes(bytes: number | undefined) {
    const value = bytes ?? 0;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }

  private formatOptionalCount(value: number | undefined) {
    return value === undefined ? '—' : String(value);
  }

  private formatOptionalBytes(value: number | undefined) {
    return value === undefined ? '—' : this.formatBytes(value);
  }

  private isFileNode(node: PositionedNode) {
    return node.nodeType === 'source-file' || node.nodeType === 'generated-file';
  }

  private hasRecordedSurfaceMetadata(node: PositionedNode) {
    return (
      node.sourceFileCount !== undefined ||
      node.sourceBytes !== undefined ||
      node.inputFileCount !== undefined ||
      node.inputBytes !== undefined ||
      node.outputFileCount !== undefined ||
      node.outputBytes !== undefined ||
      node.actionCount !== undefined ||
      Boolean(node.topFiles?.length) ||
      Boolean(node.topOutputs?.length) ||
      Boolean(node.mnemonicSummary?.length) ||
      Boolean(node.details?.directInputs?.length) ||
      Boolean(node.details?.directOutputs?.length) ||
      Boolean(node.details?.mnemonics?.length)
    );
  }

  private formatNodeType(node: PositionedNode) {
    switch (node.nodeType) {
      case 'rule':
        return 'Rule';
      case 'source-file':
        return 'Source file';
      case 'generated-file':
        return 'Generated file';
      case 'other':
        return 'Other';
      default:
        return 'Unknown';
    }
  }

  private getModeInsight(node: PositionedNode) {
    if (this.isFileNode(node)) {
      return `${this.formatNodeType(node)} · ${node.transitiveInDegree} targets depend on it in view`;
    }
    switch (this.currentWeightMode) {
      case 'pressure':
        return `Potential break-up target · ${node.transitiveInDegree} dependents and ${node.outDegree} direct outputs`;
      case 'transitive-total':
        return `Broad blast radius · ${node.transitiveInDegree} dependents and ${node.transitiveOutDegree} reachable targets`;
      case 'transitive-inputs':
        return `Shared dependency · ${node.transitiveInDegree} targets depend on it`;
      case 'transitive-outputs':
        return `Downstream reach · ${node.transitiveOutDegree} targets sit behind it`;
      case 'total':
        return `Dense local hub · ${node.inDegree + node.outDegree} immediate links`;
      case 'hotspots':
        return `High-impact ranking · ${node.transitiveInDegree} dependents`;
      case 'source-file-count':
        return `${node.sourceFileCount ?? 0} direct source files`;
      case 'source-bytes':
        return `${this.formatBytes(node.sourceBytes)} direct source surface`;
      case 'input-file-count':
        return `${node.inputFileCount ?? 0} direct file inputs`;
      case 'input-bytes':
        return `${this.formatBytes(node.inputBytes)} direct input surface`;
      case 'output-file-count':
        return `${node.outputFileCount ?? 0} default outputs`;
      case 'output-bytes':
        return `${this.formatBytes(node.outputBytes)} default output surface`;
      case 'action-count':
        return `${node.actionCount ?? 0} registered actions`;
      case 'uniform':
        return 'Uniform sizing · compare position without weight bias';
      default:
        return this.getWeightModeLabel(this.currentWeightMode);
    }
  }

  private splitTargetLabel(label: string) {
    const separatorIndex = label.lastIndexOf(':');
    if (separatorIndex <= 0 || separatorIndex === label.length - 1) {
      return { primary: label, secondary: '' };
    }

    return {
      primary: label.slice(separatorIndex + 1),
      secondary: label.slice(0, separatorIndex),
    };
  }

  private setInspectorEmptyState(message: string) {
    this.selectionInspectorEl.classList.add('is-idle');
    this.currentNodeStatus.classList.add('hidden');
    this.currentNodeEmptyEl.classList.remove('hidden');
    this.currentNodeEmptyEl.innerText = message;
    this.currentNodeEl.innerText = '';
    this.currentNodeEl.removeAttribute('title');
    this.currentNodeSubtitleEl.innerText = '';
    this.selectionNoteEl.classList.add('hidden');
    this.selectionNoteEl.innerText = '';
    this.nodeTypeEl.innerText = '—';
    this.ruleKindEl.innerText = '—';
    this.directInputsEl.innerText = '—';
    this.directOutputsEl.innerText = '—';
    this.transitiveInputsEl.innerText = '—';
    this.transitiveOutputsEl.innerText = '—';
    this.sourceFileCountEl.innerText = '—';
    this.sourceBytesEl.innerText = '—';
    this.inputFileCountEl.innerText = '—';
    this.inputBytesEl.innerText = '—';
    this.outputFileCountEl.innerText = '—';
    this.outputBytesEl.innerText = '—';
    this.actionCountEl.innerText = '—';
    this.sccSizeEl.innerText = '—';
    this.hotspotRankEl.innerText = '—';
    this.topFilesListEl.replaceChildren();
    this.topOutputsListEl.replaceChildren();
    this.mnemonicListEl.replaceChildren();
  }

  setSurfaceMetadataAvailable(available: boolean) {
    if (this.surfaceMetadataAvailable === available) return;
    this.surfaceMetadataAvailable = available;
    this.lastStatusSignature = '';
    this.updateStatus();
  }

  private renderArtifactList(listEl: HTMLElement, artifacts: ArtifactSummary[] | undefined, emptyLabel: string) {
    listEl.replaceChildren();
    if (!artifacts?.length) {
      const empty = document.createElement('div');
      empty.className = 'analysis-empty';
      empty.innerText = emptyLabel;
      listEl.appendChild(empty);
      return;
    }

    artifacts.slice(0, 5).forEach((artifact) => {
      const item = document.createElement('div');
      item.className = 'analysis-item analysis-item-plain';

      const body = document.createElement('span');
      body.className = 'analysis-item-body';

      const title = document.createElement('span');
      title.className = 'analysis-item-title';
      title.innerText = artifact.label || artifact.path || 'Artifact';

      const meta = document.createElement('span');
      meta.className = 'analysis-item-meta';
      const path = artifact.path ? ` · ${artifact.path}` : '';
      meta.innerText = `${this.formatBytes(artifact.sizeBytes)}${path}`;

      body.appendChild(title);
      body.appendChild(meta);
      item.appendChild(body);
      listEl.appendChild(item);
    });
  }

  private renderMnemonicList(listEl: HTMLElement, mnemonics: MnemonicCount[] | undefined) {
    listEl.replaceChildren();
    if (!mnemonics?.length) {
      const empty = document.createElement('div');
      empty.className = 'analysis-empty';
      empty.innerText = 'No action metadata available for this node.';
      listEl.appendChild(empty);
      return;
    }

    mnemonics.slice(0, 6).forEach((mnemonic) => {
      const item = document.createElement('div');
      item.className = 'analysis-item analysis-item-plain';

      const body = document.createElement('span');
      body.className = 'analysis-item-body';

      const title = document.createElement('span');
      title.className = 'analysis-item-title';
      title.innerText = mnemonic.mnemonic;

      const meta = document.createElement('span');
      meta.className = 'analysis-item-meta';
      meta.innerText = `${mnemonic.count} action${mnemonic.count === 1 ? '' : 's'}`;

      body.appendChild(title);
      body.appendChild(meta);
      item.appendChild(body);
      listEl.appendChild(item);
    });
  }

  updateStatus() {
    if (!this.positioned) return;

    const statusSignature = [
      this.selectedId ?? '',
      this.hoveredId ?? '',
      this.currentWeightMode,
      this.positioned.hotspotCount,
      this.positioned.largestHotspotSize,
      this.positioned.nodes.length,
      this.positioned.edges.length,
    ].join('|');
    if (statusSignature === this.lastStatusSignature) return;
    this.lastStatusSignature = statusSignature;

    const totalNodes = this.positioned.nodes.length;
    const totalEdges = this.positioned.edges.length;
    const totalRules = this.positioned.nodes.filter((node) => !node.nodeType || node.nodeType === 'rule').length;
    this.hotspotCountEl.innerText = String(this.positioned.hotspotCount);
    this.largestSccEl.innerText = this.positioned.largestHotspotSize > 1
      ? String(this.positioned.largestHotspotSize)
      : 'None';
    this.nodeCountEl.innerText = String(totalNodes);
    this.edgeCountEl.innerText = String(totalEdges);
    this.ruleCountEl.innerText = String(totalRules);
    this.weightModeLabelEl.innerText = this.getWeightModeLabel(this.currentWeightMode);

    if (this.selectedId) {
      const node = this.positioned.idToNode.get(this.selectedId);
      if (node) {
        this.selectionInspectorEl.classList.remove('is-idle');
        const isFileNode = this.isFileNode(node);
        const hasRecordedSurfaceMetadata = this.hasRecordedSurfaceMetadata(node);
        const focusType = isFileNode
          ? `Selected ${this.formatNodeType(node).toLowerCase()}`
          : node.isHotspot
            ? 'Selected high-impact target'
            : 'Selected target';
        const { primary, secondary } = this.splitTargetLabel(node.label);
        this.currentNodeEl.innerText = primary;
        this.currentNodeEl.title = node.label;
        const insight = this.getModeInsight(node);
        this.currentNodeSubtitleEl.innerText = secondary
          ? `${secondary} · ${insight}`
          : `${focusType} · ${insight}`;
        this.currentNodeStatus.classList.remove('hidden');
        this.currentNodeEmptyEl.classList.add('hidden');
        this.nodeTypeEl.innerText = this.formatNodeType(node);
        this.ruleKindEl.innerText = node.ruleKind ?? '—';
        if (!this.surfaceMetadataAvailable) {
          this.selectionNoteEl.classList.remove('hidden');
          this.selectionNoteEl.innerText =
            'This graph only includes dependency topology. File counts, input/output bytes, and action stats are unavailable. Re-extract with -enrich analyze or -enrich build to see build-surface metrics.';
        } else if (isFileNode) {
          this.selectionNoteEl.classList.remove('hidden');
          this.selectionNoteEl.innerText =
            'File nodes do not carry aggregated rule build-surface metrics. Select a rule target to inspect source counts, bytes, outputs, and actions.';
        } else if (!hasRecordedSurfaceMetadata) {
          this.selectionNoteEl.classList.remove('hidden');
          this.selectionNoteEl.innerText =
            'No build-surface metadata was recorded for this target. This often means Bazel did not expose direct sources, inputs, outputs, or actions for it in this graph.';
        } else {
          this.selectionNoteEl.classList.add('hidden');
          this.selectionNoteEl.innerText = '';
        }
        this.directInputsEl.innerText = String(node.inDegree);
        this.directOutputsEl.innerText = String(node.outDegree);
        this.transitiveInputsEl.innerText = String(node.transitiveInDegree);
        this.transitiveOutputsEl.innerText = String(node.transitiveOutDegree);
        this.sourceFileCountEl.innerText = isFileNode ? '—' : this.formatOptionalCount(node.sourceFileCount);
        this.sourceBytesEl.innerText = isFileNode ? '—' : this.formatOptionalBytes(node.sourceBytes);
        this.inputFileCountEl.innerText = isFileNode ? '—' : this.formatOptionalCount(node.inputFileCount);
        this.inputBytesEl.innerText = isFileNode ? '—' : this.formatOptionalBytes(node.inputBytes);
        this.outputFileCountEl.innerText = isFileNode ? '—' : this.formatOptionalCount(node.outputFileCount);
        this.outputBytesEl.innerText = isFileNode ? '—' : this.formatOptionalBytes(node.outputBytes);
        this.actionCountEl.innerText = isFileNode ? '—' : this.formatOptionalCount(node.actionCount);
        this.sccSizeEl.innerText = String(node.sccSize);
        this.hotspotRankEl.innerText = node.isHotspot ? `#${node.hotspotRank}` : 'Not ranked';
        this.renderArtifactList(
          this.topFilesListEl,
          node.details?.directInputs?.length ? node.details.directInputs : node.topFiles,
          isFileNode
            ? 'File nodes do not aggregate direct file inputs.'
            : 'No direct file inputs recorded for this node.',
        );
        this.renderArtifactList(
          this.topOutputsListEl,
          node.details?.directOutputs?.length ? node.details.directOutputs : node.topOutputs,
          isFileNode
            ? 'File nodes do not record default outputs.'
            : 'No default outputs recorded for this node.',
        );
        this.renderMnemonicList(
          this.mnemonicListEl,
          node.details?.mnemonics?.length ? node.details.mnemonics : node.mnemonicSummary,
        );
        this.currentNodeStatus.classList.remove('hidden');
      }
    } else {
      this.setInspectorEmptyState('Click a target to inspect its neighborhood.');
    }
  }

  // Calculate node size based on weight
  private calculateNodeSize(node: PositionedNode, isHighlight: boolean): number {
    const baseSize = 5;
    const highlightBonus = isHighlight ? 2 : 0;

    // For uniform mode, use base size
    if (this.currentWeightMode === 'uniform') {
      return baseSize + highlightBonus;
    }

    // Use square root scaling for better visual differentiation
    // Square root provides more spread than log but less extreme than linear
    const scaleFactor = Math.sqrt(node.weight + 1);
    const scaledSize = baseSize + scaleFactor * 2.5;

    // Clamp between min and max sizes
    const minSize = 4;
    const maxSize = 30;
    return Math.min(Math.max(scaledSize, minSize), maxSize) + highlightBonus;
  }

  private getNodeStyle(node: PositionedNode, state: 'default' | 'hovered' | 'selected') {
    const haloAlpha = node.isHotspot
      ? Math.min(0.32, 0.12 + node.sccSize * 0.03)
      : 0.14;
    const isSelected = state === 'selected';
    const isHovered = state === 'hovered';

    const ringColor = isSelected
      ? this.palette.nodeSelectedRing
      : isHovered
        ? this.palette.nodeHoverRing
        : null;

    return {
      haloColor: node.isHotspot ? this.palette.nodeImpactHalo : this.palette.nodeDefaultHalo,
      haloAlpha: isSelected ? Math.max(haloAlpha, 0.28) : isHovered ? haloAlpha + 0.03 : haloAlpha,
      haloScale: isSelected ? 1.65 : isHovered ? 1.08 : 1,
      coreColor: isSelected
        ? this.palette.nodeSelected
        : node.isHotspot
          ? this.palette.nodeImpact
          : this.palette.nodeDefault,
      coreScale: isSelected ? 1.3 : isHovered ? 1.08 : 1,
      ringColor,
      ringAlpha: isSelected ? 1 : isHovered ? 0.74 : 0,
      ringWidth: isSelected ? 4 : isHovered ? 2 : 0,
      ringRadius: isSelected ? 7 : 3,
      outerRingColor: isSelected ? this.palette.nodeSelectedRing : null,
      outerRingAlpha: isSelected ? 0.34 : 0,
      outerRingWidth: isSelected ? 1.8 : 0,
      outerRingRadius: isSelected ? 12 : 0,
      centerDotColor: isSelected ? this.palette.nodeSelectedRing : null,
      centerDotAlpha: isSelected ? 0.94 : 0,
      centerDotRadiusFactor: isSelected ? 0.28 : 0,
    };
  }

  // Node creation and management
  private createOrUpdateNode(node: PositionedNode, state: 'default' | 'hovered' | 'selected') {
    let g = this.nodeGraphics.get(node.id);

    const isHighlight = state !== 'default';
    const baseCore = this.calculateNodeSize(node, isHighlight);
    const {
      haloColor,
      haloAlpha,
      haloScale,
      coreColor,
      coreScale,
      ringColor,
      ringAlpha,
      ringWidth,
      ringRadius,
      outerRingColor,
      outerRingAlpha,
      outerRingWidth,
      outerRingRadius,
      centerDotColor,
      centerDotAlpha,
      centerDotRadiusFactor,
    } = this.getNodeStyle(node, state);
    const core = baseCore * coreScale;
    const halo = Math.max(
      core + 6,
      (node.isHotspot ? baseCore * 2.4 : baseCore * 1.8) * haloScale
    );

    const drawNode = () => {
      if (outerRingColor !== null) {
        g!.lineStyle(outerRingWidth, outerRingColor, outerRingAlpha);
        g!.drawCircle(0, 0, core + outerRingRadius);
        g!.lineStyle(0, 0, 0);
      }
      g!.beginFill(haloColor, haloAlpha);
      g!.drawCircle(0, 0, halo);
      g!.endFill();
      if (ringColor !== null) {
        g!.lineStyle(ringWidth, ringColor, ringAlpha);
        g!.drawCircle(0, 0, core + ringRadius);
        g!.lineStyle(0, 0, 0);
      }
      g!.beginFill(coreColor, 1);
      g!.drawCircle(0, 0, core);
      g!.endFill();
      if (centerDotColor !== null) {
        g!.beginFill(centerDotColor, centerDotAlpha);
        g!.drawCircle(0, 0, Math.max(2.4, core * centerDotRadiusFactor));
        g!.endFill();
      }
    };

    if (!g) {
      // Create new node
      g = new Graphics();
      drawNode();
      const { x, y } = this.getNodePosition(node);
      g.x = x;
      g.y = y;
      g.eventMode = 'none';
      g.cursor = 'default';

      this.nodeGraphics.set(node.id, g);
      this.nodesLayer.addChild(g);
    } else {
      // Update existing node
      g.clear();
      drawNode();

      const { x, y } = this.getNodePosition(node);
      g.x = x;
      g.y = y;
      g.eventMode = 'none';
      g.cursor = 'default';
    }

    g.zIndex = state === 'selected' ? 2 : state === 'hovered' ? 1 : 0;

    const hitRadius = Math.max(6, Math.min(core + 3, 14));
    (g as Graphics & {
      hitArea?: { contains: (x: number, y: number) => boolean };
    }).hitArea = {
      contains: (x: number, y: number) => x * x + y * y <= hitRadius * hitRadius,
    };

    return g;
  }

  // Edge drawing
  private getNeighborEdges(pg: PositionedGraph, highlightSet: Set<string>) {
    const neighborEdges = new Set<GraphEdge>();
    highlightSet.forEach((nodeId) => {
      (pg.neighbors.get(nodeId) ?? []).forEach((edge) => neighborEdges.add(edge));
    });
    return neighborEdges;
  }

  private drawEdges(
    pg: PositionedGraph,
    neighborEdges: Set<GraphEdge>,
    focusEdges: Set<string> | null,
    visibleNodes: Set<string>,
    useCulling: boolean,
    showAllEdges: boolean
  ) {
    const palette = this.palette;
    if (focusEdges && focusEdges.size > 0) {
      this.edgesGfx.lineStyle(1.5, palette.edgeFocus, 0.72);
      for (const e of pg.edges) {
        const edgeKey = `${e.source}->${e.target}`;
        if (!focusEdges.has(edgeKey) || neighborEdges.has(e)) continue;

        const s = pg.idToNode.get(e.source);
        const t = pg.idToNode.get(e.target);
        if (!s || !t) continue;
        const sourcePos = this.getNodePosition(s);
        const targetPos = this.getNodePosition(t);
        this.edgesGfx.moveTo(sourcePos.x, sourcePos.y);
        this.edgesGfx.lineTo(targetPos.x, targetPos.y);
      }
    }

    // Draw normal edges
    if (!focusEdges && showAllEdges) {
      this.edgesGfx.lineStyle(1, palette.edgeBase, 0.28);
      for (const e of pg.edges) {
        if (neighborEdges.has(e)) continue;

        if (useCulling && !visibleNodes.has(e.source) && !visibleNodes.has(e.target)) {
          continue;
        }

        const s = pg.idToNode.get(e.source);
        const t = pg.idToNode.get(e.target);
        if (!s || !t) continue;
        const sourcePos = this.getNodePosition(s);
        const targetPos = this.getNodePosition(t);
        this.edgesGfx.moveTo(sourcePos.x, sourcePos.y);
        this.edgesGfx.lineTo(targetPos.x, targetPos.y);
      }
    }

    // Draw highlighted edges
    if (neighborEdges.size > 0) {
      this.edgesGfx.lineStyle(2.2, palette.edgeSelected, 0.88);
      neighborEdges.forEach((e) => {
        const s = pg.idToNode.get(e.source);
        const t = pg.idToNode.get(e.target);
        if (!s || !t) return;
        const sourcePos = this.getNodePosition(s);
        const targetPos = this.getNodePosition(t);
        this.edgesGfx.moveTo(sourcePos.x, sourcePos.y);
        this.edgesGfx.lineTo(targetPos.x, targetPos.y);
      });
    }
  }

  // Main drawing function.
  // lightUpdate=true (zoom/pan): skip per-node Graphics redraws — only update visibility and edges.
  // Pixi re-renders the scaled/translated container natively; we only need culling updates.
  draw(
    pg: PositionedGraph,
    applyFit = true,
    centerOnSelection = false,
    lightUpdate = false,
    skipEdgeRedraw = false
  ) {
    const selectionScope = this.getSelectionScope(pg);
    const selectionScopeNodes = this.getScopeNodes(pg, selectionScope);
    if (this.graphLayoutMode === 'preserve') {
      this.currentRenderPositions = null;
    } else if (!this.currentRenderPositions) {
      this.currentRenderPositions = this.getGraphRenderPositions(pg);
    }
    const fitTargetNodes = selectionScopeNodes.length > 0 ? selectionScopeNodes : pg.nodes;

    // Apply fit or center on selection
    if (applyFit) {
      const focusPadding = this.getFocusPadding(selectionScopeNodes.length);
      this.fitNodesInView(
        fitTargetNodes,
        selectionScopeNodes.length > 0
          ? this.getFocusMinScale(selectionScopeNodes.length)
          : MIN_SCALE,
        selectionScopeNodes.length > 0 ? focusPadding : 120
      );
    } else if (centerOnSelection && this.selectedId) {
      if (selectionScopeNodes.length > 1) {
        const focusPadding = this.getFocusPadding(selectionScopeNodes.length);
        this.fitNodesInView(
          selectionScopeNodes,
          this.getFocusMinScale(selectionScopeNodes.length),
          focusPadding
        );
      } else {
        const node = pg.idToNode.get(this.selectedId);
        if (node) {
          const frame = this.getSafeViewportFrame();
          const { x, y } = this.getNodePosition(node);
          this.graphContainer.position.x = frame.left + frame.width / 2 - x * this.currentScale;
          this.graphContainer.position.y = frame.top + frame.height / 2 - y * this.currentScale;
          this.updateZoomLevel();
        }
      }
    }

    // Viewport culling for large graphs
    const useCulling = pg.nodes.length > LARGE_GRAPH_THRESHOLD;
    const viewportBounds = useCulling ? this.getViewportBounds() : null;

    // Build highlight set
    const highlightSet = new Set<string>();
    if (this.hoveredId) highlightSet.add(this.hoveredId);
    if (this.selectedId) highlightSet.add(this.selectedId);

    // Expand hovered/selected hotspot to its full SCC using precomputed index — O(members), not O(V)
    const expandHotspot = (nodeId: string | null) => {
      if (!nodeId) return;
      const node = pg.idToNode.get(nodeId);
      if (!node?.isHotspot || node.sccSize <= 1) return;
      this.sccMembers.get(node.sccId)?.forEach((id) => highlightSet.add(id));
    };
    expandHotspot(this.hoveredId);
    expandHotspot(this.selectedId);

    const visibleNodes = new Set<string>();
    if (selectionScope) {
      selectionScope.transitiveNodes.forEach((id) => visibleNodes.add(id));
    } else if (useCulling && viewportBounds) {
      pg.nodes.forEach((n) => {
        if (this.isNodeVisible(n, viewportBounds) || highlightSet.has(n.id)) {
          visibleNodes.add(n.id);
        }
      });
    }

    const showAllEdges = this.currentScale > EDGE_VISIBILITY_THRESHOLD;
    const edgeHighlightSignature = `${this.hoveredId ?? ''}|${this.selectedId ?? ''}`;
    const shouldRedrawEdges =
      !skipEdgeRedraw && (
        !lightUpdate ||
        showAllEdges !== this.lastShowAllEdges ||
        edgeHighlightSignature !== this.lastEdgeHighlightSignature
      );

    if (shouldRedrawEdges) {
      this.edgesGfx.visible = true;
      this.edgesGfx.clear();
      const neighborEdges = this.getNeighborEdges(pg, highlightSet);
      this.drawEdges(
        pg,
        neighborEdges,
        selectionScope?.transitiveEdges ?? null,
        visibleNodes,
        useCulling && !selectionScope,
        showAllEdges && !selectionScope
      );
      this.lastShowAllEdges = showAllEdges;
      this.lastEdgeHighlightSignature = edgeHighlightSignature;
    }

    if (lightUpdate) {
      if (useCulling) {
        pg.nodes.forEach((n) => {
          const g = this.nodeGraphics.get(n.id);
          if (g) g.visible = selectionScope ? visibleNodes.has(n.id) : visibleNodes.has(n.id);
        });
      }
    } else {
      pg.nodes.forEach((n) => {
        const state = this.selectedId === n.id
          ? 'selected'
          : this.hoveredId === n.id
            ? 'hovered'
            : 'default';
        const isVisible = selectionScope ? visibleNodes.has(n.id) : !useCulling || visibleNodes.has(n.id);
        const g = this.createOrUpdateNode(n, state);
        g.visible = isVisible;
        g.alpha = 1;
      });
    }

    this.pickableNodeIds = selectionScope
      ? Array.from(visibleNodes)
      : (useCulling ? Array.from(visibleNodes) : pg.nodes.map((n) => n.id));

    if (!skipEdgeRedraw) {
      this.updateStatus();
    }
  }

  // Public methods for external control
  setPositionedGraph(pg: PositionedGraph) {
    this.positioned = pg;
    recalculateWeights(pg, this.currentWeightMode);
    this.selectedId = null;
    this.hoveredId = null;

    // Clear old node graphics when loading a new graph
    this.nodesLayer.removeChildren();
    this.nodeGraphics.clear();
    this.traversalCache.clear();
    this.currentRenderPositions = null;

    // Precompute sccId → Set<nodeId> for O(1) SCC expansion on hover/click
    this.sccMembers.clear();
    for (const n of pg.nodes) {
      if (n.sccSize > 1) {
        let members = this.sccMembers.get(n.sccId);
        if (!members) { members = new Set(); this.sccMembers.set(n.sccId, members); }
        members.add(n.id);
      }
    }

    this.lastShowAllEdges = false;
    this.lastEdgeHighlightSignature = '';
    this.lastStatusSignature = '';
    this.clearNavigationPreview();
    this.navigationActive = false;
    this.setNodeInteractivity(true);
    this.notifySelectionChanged();
    this.draw(pg, true, false);
  }

  fitView() {
    if (this.positioned) {
      this.hoveredId = null;
      this.lastStatusSignature = '';
      this.draw(this.positioned, true, false);
    }
  }

  reset() {
    if (this.positioned) {
      this.selectedId = null;
      this.hoveredId = null;
      this.notifySelectionChanged();
      this.lastStatusSignature = '';
      this.currentScale = 1;
      this.graphContainer.scale.set(1);
      this.graphContainer.position.set(
        this.app.renderer.screen.width / 2,
        this.app.renderer.screen.height / 2
      );
      this.updateZoomLevel();
      this.draw(this.positioned, false, false);
    }
  }

  search(term: string) {
    if (!this.positioned) return;

    const node = this.positioned.nodes.find((n) =>
      n.label.toLowerCase().includes(term.toLowerCase())
    );

    if (!node) {
      this.lastStatusSignature = '';
      this.setInspectorEmptyState(`No matching target for "${term}".`);
      return;
    }

    this.selectedId = node.id;
    this.notifySelectionChanged();
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, true);
  }

  focusNode(nodeId: string) {
    if (!this.positioned) return;

    const node = this.positioned.idToNode.get(nodeId);
    if (!node) return;

    this.selectedId = node.id;
    this.hoveredId = node.id;
    this.notifySelectionChanged();
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, true);
  }

  handleResize() {
    if (this.positioned) {
      this.draw(this.positioned, true, false);
    }
  }

  // Pan management
  startPan(x: number, y: number) {
    this.isPanning = true;
    this.panMoved = false;
    this.panStart = { x, y };
    this.lastPan = { x, y };
  }

  updatePan(x: number, y: number) {
    if (!this.isPanning) return;

    if (!this.panMoved) {
      const movedX = x - this.panStart.x;
      const movedY = y - this.panStart.y;
      if (movedX * movedX + movedY * movedY < 16) {
        return;
      }
      this.panMoved = true;
      this.suppressHoverForNavigation();
    }

    this.graphContainer.position.x += x - this.lastPan.x;
    this.graphContainer.position.y += y - this.lastPan.y;
    this.lastPan = { x, y };
    this.suppressHoverForNavigation();
    if (this.positioned && this.positioned.nodes.length <= LARGE_GRAPH_THRESHOLD) {
      this.scheduleDraw();
    }
  }

  endPan() {
    const shouldSelect = this.isPanning && !this.panMoved;
    this.isPanning = false;
    if (this.panMoved) {
      this.settleNavigation(true);
    }
    return shouldSelect;
  }

  setStatus(text: string, className: string) {
    this.statusBadge.innerText = text;
    this.statusBadge.className = `status-badge ${className}`;
  }

  refreshTheme() {
    this.palette = getGraphPalette();
    this.lastShowAllEdges = false;
    this.lastEdgeHighlightSignature = '';
    this.lastStatusSignature = '';
    this.clearNavigationPreview();

    if (this.positioned) {
      this.draw(this.positioned, false, false);
    }
  }

  setNodeCount(text: string) {
    this.nodeCountEl.innerText = text;
  }

  handlePointerMove(x: number, y: number) {
    if (!this.positioned || this.hoverSuppressed || this.isPanning || this.navigationActive) return;

    const nextHoveredId = this.pickNodeAt(x, y);
    if (nextHoveredId === this.hoveredId) return;

    this.hoveredId = nextHoveredId;
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, false);
  }

  clearHover() {
    if (!this.positioned || this.hoveredId === null || this.selectedId) return;
    this.hoveredId = null;
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, false);
  }

  selectAt(x: number, y: number) {
    if (!this.positioned) return;

    const pickedId = this.pickNodeAt(x, y) ?? this.hoveredId;
    if (!pickedId) {
      if (this.selectedId || this.hoveredId) {
        this.selectedId = null;
        this.hoveredId = null;
        this.notifySelectionChanged();
        this.lastStatusSignature = '';
        this.draw(this.positioned, false, false);
      }
      return;
    }

    this.selectedId = pickedId;
    this.hoveredId = pickedId;
    this.notifySelectionChanged();
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, true);
  }

  clearSelection() {
    if (!this.positioned || (!this.selectedId && !this.hoveredId)) return;
    this.selectedId = null;
    this.hoveredId = null;
    this.notifySelectionChanged();
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, false);
  }

  setWeightMode(mode: WeightMode) {
    this.currentWeightMode = mode;
    if (!this.positioned) return;

    recalculateWeights(this.positioned, mode);
    this.lastStatusSignature = '';
    this.traversalCache.clear();
    this.clearNavigationPreview();
    this.draw(this.positioned, false, Boolean(this.selectedId));
  }

  getWeightMode(): WeightMode {
    return this.currentWeightMode;
  }

  setDisplayOptions(options: {
    graphOrientation?: GraphOrientation;
    graphLayoutMode?: GraphLayoutMode;
  }) {
    let changed = false;

    if (options.graphOrientation && options.graphOrientation !== this.graphOrientation) {
      this.graphOrientation = options.graphOrientation;
      changed = true;
    }

    if (options.graphLayoutMode && options.graphLayoutMode !== this.graphLayoutMode) {
      this.graphLayoutMode = options.graphLayoutMode;
      changed = true;
    }

    if (!changed || !this.positioned) return;

    this.lastShowAllEdges = false;
    this.lastEdgeHighlightSignature = '';
    this.lastStatusSignature = '';
    this.currentRenderPositions = null;
    this.clearNavigationPreview();
    this.draw(this.positioned, !this.selectedId, Boolean(this.selectedId));
  }

  setGraphOrientation(orientation: GraphOrientation) {
    this.setDisplayOptions({ graphOrientation: orientation });
  }

  getGraphOrientation() {
    return this.graphOrientation;
  }

  setGraphLayoutMode(mode: GraphLayoutMode) {
    this.setDisplayOptions({ graphLayoutMode: mode });
  }

  getGraphLayoutMode() {
    return this.graphLayoutMode;
  }
}
