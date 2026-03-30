import { Application, Container, Graphics } from 'pixi.js';
import {
  GraphEdge,
  PositionedGraph,
  PositionedNode,
  WeightMode,
  recalculateWeights,
} from './graphLayout';
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
  zoomLevelEl: HTMLElement;
  statusBadge: HTMLElement;
  nodeCountEl: HTMLElement;
  edgeCountEl: HTMLElement;
  hotspotCountEl: HTMLElement;
  largestSccEl: HTMLElement;
  currentNodeEl: HTMLElement;
  currentNodeStatus: HTMLElement;
  currentNodeSubtitleEl: HTMLElement;
  currentNodeEmptyEl: HTMLElement;
  directInputsEl: HTMLElement;
  directOutputsEl: HTMLElement;
  transitiveInputsEl: HTMLElement;
  transitiveOutputsEl: HTMLElement;
  sccSizeEl: HTMLElement;
  hotspotRankEl: HTMLElement;
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
  private currentWeightMode: WeightMode = 'transitive-total';

  // UI Elements
  private zoomLevelEl: HTMLElement;
  private statusBadge: HTMLElement;
  private nodeCountEl: HTMLElement;
  private edgeCountEl: HTMLElement;
  private hotspotCountEl: HTMLElement;
  private largestSccEl: HTMLElement;
  private currentNodeEl: HTMLElement;
  private currentNodeStatus: HTMLElement;
  private currentNodeSubtitleEl: HTMLElement;
  private currentNodeEmptyEl: HTMLElement;
  private directInputsEl: HTMLElement;
  private directOutputsEl: HTMLElement;
  private transitiveInputsEl: HTMLElement;
  private transitiveOutputsEl: HTMLElement;
  private sccSizeEl: HTMLElement;
  private hotspotRankEl: HTMLElement;
  private weightModeLabelEl: HTMLElement;
  private navigationSettleTimeout: number | null = null;
  private nodesInteractive = true;
  private pickableNodeIds: string[] = [];
  private palette: GraphPalette = getGraphPalette();

  constructor(app: Application, uiElements: UIElements) {
    this.app = app;
    this.graphContainer = new Container();
    this.edgesGfx = new Graphics();
    this.navigationNodesGfx = new Graphics();
    this.nodesLayer = new Container();
    this.nodeGraphics = new Map();

    this.app.stage.addChild(this.graphContainer);
    // Fixed layer order: edges behind nodes — set up once, never changed
    this.graphContainer.addChild(this.edgesGfx);
    this.graphContainer.addChild(this.navigationNodesGfx);
    this.graphContainer.addChild(this.nodesLayer);
    this.navigationNodesGfx.visible = false;

    // Assign UI elements
    this.zoomLevelEl = uiElements.zoomLevelEl;
    this.statusBadge = uiElements.statusBadge;
    this.nodeCountEl = uiElements.nodeCountEl;
    this.edgeCountEl = uiElements.edgeCountEl;
    this.hotspotCountEl = uiElements.hotspotCountEl;
    this.largestSccEl = uiElements.largestSccEl;
    this.currentNodeEl = uiElements.currentNodeEl;
    this.currentNodeStatus = uiElements.currentNodeStatus;
    this.currentNodeSubtitleEl = uiElements.currentNodeSubtitleEl;
    this.currentNodeEmptyEl = uiElements.currentNodeEmptyEl;
    this.directInputsEl = uiElements.directInputsEl;
    this.directOutputsEl = uiElements.directOutputsEl;
    this.transitiveInputsEl = uiElements.transitiveInputsEl;
    this.transitiveOutputsEl = uiElements.transitiveOutputsEl;
    this.sccSizeEl = uiElements.sccSizeEl;
    this.hotspotRankEl = uiElements.hotspotRankEl;
    this.weightModeLabelEl = uiElements.weightModeLabelEl;
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
    return (
      node.x >= bounds.minX &&
      node.x <= bounds.maxX &&
      node.y >= bounds.minY &&
      node.y <= bounds.maxY
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
      const radius = Math.min(this.calculateNodeSize(node, isHighlight), focusedNodes ? 12 : 10);
      const color = isSelected
        ? palette.nodeSelected
        : node.isHotspot
          ? palette.nodeImpact
          : palette.nodeDefault;
      const alpha = isSelected ? 1 : isHovered ? 0.94 : node.isHotspot ? 0.8 : 0.64;

      if (isSelected || isHovered) {
        this.navigationNodesGfx.lineStyle(
          isSelected ? 2.8 : 2,
          isSelected ? palette.nodeSelectedRing : palette.nodeHoverRing,
          isSelected ? 0.95 : 0.8
        );
        this.navigationNodesGfx.drawCircle(node.x, node.y, radius + (isSelected ? 4 : 3));
        this.navigationNodesGfx.lineStyle(0, 0, 0);
      }

      this.navigationNodesGfx.beginFill(color, alpha);
      this.navigationNodesGfx.drawCircle(node.x, node.y, radius);
      this.navigationNodesGfx.endFill();
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

      const dx = (node.x - point.x) * this.currentScale;
      const dy = (node.y - point.y) * this.currentScale;
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

    if (header) {
      const rect = header.getBoundingClientRect();
      if (rect.top < viewH * 0.25) {
        top = Math.max(top, rect.bottom + 16);
      }
    }

    if (sidePanel) {
      const rect = sidePanel.getBoundingClientRect();
      if (rect.right > viewW * 0.75 && rect.height < viewH * 0.92) {
        right = Math.min(right, rect.left - 18);
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

  private fitNodesInView(nodes: PositionedNode[], minScale = MIN_SCALE, padding = 120) {
    if (!nodes.length) return;

    const frame = this.getSafeViewportFrame();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
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
    if (nodeCount <= 8) return 0.55;
    if (nodeCount <= 24) return 0.34;
    if (nodeCount <= 80) return 0.2;
    if (nodeCount <= 200) return 0.12;
    return 0.08;
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
      case 'uniform':
        return 'Uniform';
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
    this.currentNodeStatus.classList.add('hidden');
    this.currentNodeEmptyEl.classList.remove('hidden');
    this.currentNodeEmptyEl.innerText = message;
    this.currentNodeEl.innerText = '';
    this.currentNodeEl.removeAttribute('title');
    this.currentNodeSubtitleEl.innerText = '';
    this.directInputsEl.innerText = '0';
    this.directOutputsEl.innerText = '0';
    this.transitiveInputsEl.innerText = '0';
    this.transitiveOutputsEl.innerText = '0';
    this.sccSizeEl.innerText = '1';
    this.hotspotRankEl.innerText = 'Not ranked';
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
    this.hotspotCountEl.innerText = String(this.positioned.hotspotCount);
    this.largestSccEl.innerText = this.positioned.largestHotspotSize > 1
      ? String(this.positioned.largestHotspotSize)
      : 'None';
    this.nodeCountEl.innerText = String(totalNodes);
    this.edgeCountEl.innerText = String(totalEdges);
    this.weightModeLabelEl.innerText = this.getWeightModeLabel(this.currentWeightMode);

    if (this.selectedId) {
      const node = this.positioned.idToNode.get(this.selectedId);
      if (node) {
        const focusType = node.isHotspot
          ? 'Selected high-impact target'
          : 'Selected target';
        const { primary, secondary } = this.splitTargetLabel(node.label);
        this.currentNodeEl.innerText = primary;
        this.currentNodeEl.title = node.label;
        this.currentNodeSubtitleEl.innerText = secondary
          ? `${focusType} · ${secondary}`
          : focusType;
        this.currentNodeStatus.classList.remove('hidden');
        this.currentNodeEmptyEl.classList.add('hidden');
        this.directInputsEl.innerText = String(node.inDegree);
        this.directOutputsEl.innerText = String(node.outDegree);
        this.transitiveInputsEl.innerText = String(node.transitiveInDegree);
        this.transitiveOutputsEl.innerText = String(node.transitiveOutDegree);
        this.sccSizeEl.innerText = String(node.sccSize);
        this.hotspotRankEl.innerText = node.isHotspot ? `#${node.hotspotRank}` : 'Not ranked';
        this.currentNodeStatus.classList.remove('hidden');
      }
    } else {
      if (this.hoveredId) {
        const node = this.positioned.idToNode.get(this.hoveredId);
        if (node) {
          const focusType = node.isHotspot
            ? 'Hovered high-impact target'
            : 'Hovered target';
          const { primary, secondary } = this.splitTargetLabel(node.label);
          this.currentNodeEl.innerText = primary;
          this.currentNodeEl.title = node.label;
          this.currentNodeSubtitleEl.innerText = secondary
            ? `${focusType} · ${secondary}`
            : focusType;
          this.directInputsEl.innerText = String(node.inDegree);
          this.directOutputsEl.innerText = String(node.outDegree);
          this.transitiveInputsEl.innerText = String(node.transitiveInDegree);
          this.transitiveOutputsEl.innerText = String(node.transitiveOutDegree);
          this.sccSizeEl.innerText = String(node.sccSize);
          this.hotspotRankEl.innerText = node.isHotspot ? `#${node.hotspotRank}` : 'Not ranked';
          this.currentNodeEmptyEl.classList.add('hidden');
          this.currentNodeStatus.classList.remove('hidden');
        }
      } else {
        this.setInspectorEmptyState('Search, hover, or click a target to inspect its neighborhood.');
      }
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

    const ringColor = state === 'selected'
      ? this.palette.nodeSelectedRing
      : state === 'hovered'
        ? this.palette.nodeHoverRing
        : null;

    return {
      haloColor: node.isHotspot ? this.palette.nodeImpactHalo : this.palette.nodeDefaultHalo,
      haloAlpha: state === 'selected' ? Math.max(haloAlpha, 0.2) : haloAlpha,
      coreColor: state === 'selected'
        ? this.palette.nodeSelected
        : node.isHotspot
          ? this.palette.nodeImpact
          : this.palette.nodeDefault,
      ringColor,
      ringAlpha: state === 'selected' ? 0.96 : state === 'hovered' ? 0.74 : 0,
      ringWidth: state === 'selected' ? 3 : state === 'hovered' ? 2 : 0,
      ringRadius: state === 'selected' ? 5 : 3,
    };
  }

  // Node creation and management
  private createOrUpdateNode(node: PositionedNode, state: 'default' | 'hovered' | 'selected') {
    let g = this.nodeGraphics.get(node.id);

    const isHighlight = state !== 'default';
    const core = this.calculateNodeSize(node, isHighlight);
    const halo = node.isHotspot ? core * 2.4 : core * 1.8;
    const { haloColor, haloAlpha, coreColor, ringColor, ringAlpha, ringWidth, ringRadius } =
      this.getNodeStyle(node, state);

    if (!g) {
      // Create new node
      g = new Graphics();
      if (ringColor !== null) {
        g.lineStyle(ringWidth, ringColor, ringAlpha);
        g.drawCircle(0, 0, core + ringRadius);
        g.lineStyle(0, 0, 0);
      }
      g.beginFill(haloColor, haloAlpha);
      g.drawCircle(0, 0, halo);
      g.endFill();
      g.beginFill(coreColor, 1);
      g.drawCircle(0, 0, core);
      g.endFill();
      g.x = node.x;
      g.y = node.y;
      g.eventMode = 'none';
      g.cursor = 'default';

      this.nodeGraphics.set(node.id, g);
      this.nodesLayer.addChild(g);
    } else {
      // Update existing node
      g.clear();
      if (ringColor !== null) {
        g.lineStyle(ringWidth, ringColor, ringAlpha);
        g.drawCircle(0, 0, core + ringRadius);
        g.lineStyle(0, 0, 0);
      }
      g.beginFill(haloColor, haloAlpha);
      g.drawCircle(0, 0, halo);
      g.endFill();
      g.beginFill(coreColor, 1);
      g.drawCircle(0, 0, core);
      g.endFill();

      g.x = node.x;
      g.y = node.y;
      g.eventMode = 'none';
      g.cursor = 'default';
    }

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

        this.edgesGfx.moveTo(s.x, s.y);
        this.edgesGfx.lineTo(t.x, t.y);
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

        this.edgesGfx.moveTo(s.x, s.y);
        this.edgesGfx.lineTo(t.x, t.y);
      }
    }

    // Draw highlighted edges
    if (neighborEdges.size > 0) {
      this.edgesGfx.lineStyle(2.2, palette.edgeSelected, 0.88);
      neighborEdges.forEach((e) => {
        const s = pg.idToNode.get(e.source);
        const t = pg.idToNode.get(e.target);
        if (!s || !t) return;

        this.edgesGfx.moveTo(s.x, s.y);
        this.edgesGfx.lineTo(t.x, t.y);
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

    // Apply fit or center on selection
    if (applyFit) {
      this.fitNodesInView(pg.nodes);
    } else if (centerOnSelection && this.selectedId) {
      if (selectionScopeNodes.length > 1) {
        this.fitNodesInView(
          selectionScopeNodes,
          this.getFocusMinScale(selectionScopeNodes.length),
          96
        );
      } else {
        const node = pg.idToNode.get(this.selectedId);
        if (node) {
          const frame = this.getSafeViewportFrame();
          this.graphContainer.position.x = frame.left + frame.width / 2 - node.x * this.currentScale;
          this.graphContainer.position.y = frame.top + frame.height / 2 - node.y * this.currentScale;
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
        const isVisible = selectionScope ? true : !useCulling || visibleNodes.has(n.id);
        const g = this.createOrUpdateNode(n, state);
        g.visible = isVisible;
        g.alpha = selectionScope
          ? visibleNodes.has(n.id) ? 1 : 0.04
          : 1;
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

    // Clear old node graphics when loading a new graph
    this.nodesLayer.removeChildren();
    this.nodeGraphics.clear();
    this.traversalCache.clear();

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
    this.draw(pg, true, false);
  }

  fitView() {
    if (this.positioned) {
      this.selectedId = null;
      this.hoveredId = null;
      this.lastStatusSignature = '';
      this.draw(this.positioned, true, false);
    }
  }

  reset() {
    if (this.positioned) {
      this.selectedId = null;
      this.hoveredId = null;
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
      this.currentNodeEl.innerText = 'No matching target';
      this.currentNodeEl.removeAttribute('title');
      this.currentNodeSubtitleEl.innerText = `Search term: ${term}`;
      this.currentNodeEmptyEl.classList.add('hidden');
      this.currentNodeStatus.classList.remove('hidden');
      this.directInputsEl.innerText = '0';
      this.directOutputsEl.innerText = '0';
      this.transitiveInputsEl.innerText = '0';
      this.transitiveOutputsEl.innerText = '0';
      this.sccSizeEl.innerText = '1';
      this.hotspotRankEl.innerText = 'Not ranked';
      return;
    }

    this.selectedId = node.id;
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, true);
  }

  focusNode(nodeId: string) {
    if (!this.positioned) return;

    const node = this.positioned.idToNode.get(nodeId);
    if (!node) return;

    this.selectedId = node.id;
    this.hoveredId = node.id;
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
        this.lastStatusSignature = '';
        this.draw(this.positioned, false, false);
      }
      return;
    }

    this.selectedId = pickedId;
    this.hoveredId = pickedId;
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, true);
  }

  clearSelection() {
    if (!this.positioned || (!this.selectedId && !this.hoveredId)) return;
    this.selectedId = null;
    this.hoveredId = null;
    this.lastStatusSignature = '';
    this.draw(this.positioned, false, false);
  }

  setWeightMode(mode: WeightMode) {
    if (!this.positioned) return;

    this.currentWeightMode = mode;
    recalculateWeights(this.positioned, mode);
    this.lastStatusSignature = '';
    this.traversalCache.clear();
    this.clearNavigationPreview();
    this.draw(this.positioned, false, Boolean(this.selectedId));
  }

  getWeightMode(): WeightMode {
    return this.currentWeightMode;
  }
}
