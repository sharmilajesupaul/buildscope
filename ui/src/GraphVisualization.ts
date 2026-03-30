import { Application, Container, Graphics } from 'pixi.js';
import {
  fitToView,
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
  COLORS,
} from './constants';

export interface UIElements {
  zoomLevelEl: HTMLElement;
  statusBadge: HTMLElement;
  nodeCountEl: HTMLElement;
  edgeCountEl: HTMLElement;
  currentNodeEl: HTMLElement;
  currentNodeStatus: HTMLElement;
}

export class GraphVisualization {
  private app: Application;
  private graphContainer: Container;
  private edgesGfx: Graphics;       // persistent — cleared and redrawn, never recreated
  private nodesLayer: Container;
  private nodeGraphics: Map<string, Graphics>;
  private positioned: PositionedGraph | null = null;

  // Precomputed index: sccId → Set<nodeId> for O(1) cycle expansion on hover/click
  private sccMembers = new Map<number, Set<string>>();

  // State
  private currentScale = 1;
  private isPanning = false;
  private lastPan = { x: 0, y: 0 };
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private drawScheduled = false;
  private hoverSuppressed = false;
  private hoverResumeTimeout: number | null = null;
  private lastShowAllEdges = false;
  private lastEdgeHighlightSignature = '';
  private lastStatusSignature = '';
  private transitiveDepsCache = new Map<
    string,
    { transitiveNodes: Set<string>; transitiveEdges: Set<string> }
  >();
  private currentWeightMode: WeightMode = 'total';

  // UI Elements
  private zoomLevelEl: HTMLElement;
  private statusBadge: HTMLElement;
  private nodeCountEl: HTMLElement;
  private edgeCountEl: HTMLElement;
  private currentNodeEl: HTMLElement;
  private currentNodeStatus: HTMLElement;

  constructor(app: Application, uiElements: UIElements) {
    this.app = app;
    this.graphContainer = new Container();
    this.edgesGfx = new Graphics();
    this.nodesLayer = new Container();
    this.nodeGraphics = new Map();

    this.app.stage.addChild(this.graphContainer);
    // Fixed layer order: edges behind nodes — set up once, never changed
    this.graphContainer.addChild(this.edgesGfx);
    this.graphContainer.addChild(this.nodesLayer);

    // Assign UI elements
    this.zoomLevelEl = uiElements.zoomLevelEl;
    this.statusBadge = uiElements.statusBadge;
    this.nodeCountEl = uiElements.nodeCountEl;
    this.edgeCountEl = uiElements.edgeCountEl;
    this.currentNodeEl = uiElements.currentNodeEl;
    this.currentNodeStatus = uiElements.currentNodeStatus;
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
    // Pixi re-renders the scaled container immediately; schedule one culling pass per frame
    this.scheduleDraw();
  }

  // Schedules a single draw on the next animation frame — deduplicated so rapid zoom/pan
  // events coalesce into one redraw instead of hammering the draw path.
  private scheduleDraw() {
    if (this.drawScheduled) return;
    this.drawScheduled = true;
    requestAnimationFrame(() => {
      this.drawScheduled = false;
      if (this.positioned) this.draw(this.positioned, false, false, true);
    });
  }

  // Suppress hover updates while the viewport is moving so pointerover/out does not
  // trigger full redraws as nodes slide under the cursor during pan/zoom.
  private suppressHoverForNavigation() {
    this.hoverSuppressed = true;
    if (this.hoveredId) {
      this.hoveredId = null;
    }
    if (this.hoverResumeTimeout !== null) {
      window.clearTimeout(this.hoverResumeTimeout);
    }
    this.hoverResumeTimeout = window.setTimeout(() => {
      this.hoverSuppressed = false;
      this.hoverResumeTimeout = null;
    }, 120);
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
  private getTransitiveDeps(nodeId: string, pg: PositionedGraph): {
    transitiveNodes: Set<string>;
    transitiveEdges: Set<string>;
  } {
    const cached = this.transitiveDepsCache.get(nodeId);
    if (cached) return cached;

    const transitiveNodes = new Set<string>();
    const transitiveEdges = new Set<string>();
    const visited = new Set<string>([nodeId]);
    const queue: string[] = [nodeId];
    let head = 0;

    while (head < queue.length) {
      const currentId = queue[head++];
      const incidentEdges = pg.neighbors.get(currentId) ?? [];
      for (const e of incidentEdges) {
        const edgeKey = `${e.source}->${e.target}`;
        transitiveEdges.add(edgeKey);

        const connectedId = e.source === currentId ? e.target : e.source;
        if (!visited.has(connectedId)) {
          visited.add(connectedId);
          transitiveNodes.add(connectedId);
          queue.push(connectedId);
        }
      }
    }

    const result = { transitiveNodes, transitiveEdges };
    this.transitiveDepsCache.set(nodeId, result);
    return result;
  }

  // Status updates
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

    if (this.selectedId) {
      // Direct connections
      const selectedEdges = this.positioned.neighbors.get(this.selectedId) ?? [];

      const connectedNodeIds = new Set<string>();
      selectedEdges.forEach((e) => {
        if (e.source === this.selectedId) connectedNodeIds.add(e.target);
        if (e.target === this.selectedId) connectedNodeIds.add(e.source);
      });

      // Only calculate transitive counts when in transitive mode (to avoid BFS overhead)
      const isTransitiveMode =
        this.currentWeightMode === 'transitive-total' ||
        this.currentWeightMode === 'transitive-inputs' ||
        this.currentWeightMode === 'transitive-outputs';

      if (isTransitiveMode) {
        const { transitiveNodes, transitiveEdges } = this.getTransitiveDeps(
          this.selectedId,
          this.positioned
        );

        this.nodeCountEl.innerText =
          `${connectedNodeIds.size} direct, ${transitiveNodes.size} transitive / ${totalNodes}`;
        this.edgeCountEl.innerText =
          `${selectedEdges.length} direct, ${transitiveEdges.size} transitive / ${totalEdges}`;
      } else {
        this.nodeCountEl.innerText = `${connectedNodeIds.size} / ${totalNodes}`;
        this.edgeCountEl.innerText = `${selectedEdges.length} / ${totalEdges}`;
      }

      const node = this.positioned.idToNode.get(this.selectedId);
      if (node) {
        const hotspotSuffix = node.isHotspot
          ? ` · hotspot #${node.hotspotRank} (${node.sccSize > 1 ? `cycle of ${node.sccSize}` : `${node.transitiveInDegree} dependents`})`
          : '';
        this.currentNodeEl.innerText = `${node.label}${hotspotSuffix}`;
        this.currentNodeStatus.classList.remove('hidden');
      }
    } else {
      const hotspotText = this.positioned.hotspotCount
        ? ` (${this.positioned.hotspotCount} hotspots)`
        : '';
      const largestHotspotText = this.positioned.largestHotspotSize > 1
        ? ` · largest SCC ${this.positioned.largestHotspotSize}`
        : '';
      this.nodeCountEl.innerText = `${totalNodes}${hotspotText}`;
      this.edgeCountEl.innerText = `${totalEdges}${largestHotspotText}`;

      if (this.hoveredId) {
        const node = this.positioned.idToNode.get(this.hoveredId);
        if (node) {
          const hotspotSuffix = node.isHotspot
            ? ` · hotspot #${node.hotspotRank} (${node.sccSize > 1 ? `cycle of ${node.sccSize}` : `${node.transitiveInDegree} dependents`})`
            : '';
          this.currentNodeEl.innerText = `${node.label}${hotspotSuffix}`;
          this.currentNodeStatus.classList.remove('hidden');
        }
      } else {
        this.currentNodeStatus.classList.add('hidden');
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

  private getNodeColors(node: PositionedNode, isHighlight: boolean) {
    if (node.isHotspot) {
      const glowAlpha = Math.min(0.42, 0.2 + node.sccSize * 0.04);
      return {
        haloColor: COLORS.hotspotGlow,
        haloAlpha: glowAlpha,
        coreColor: isHighlight ? COLORS.nodeHighlight : COLORS.hotspot,
      };
    }

    return {
      haloColor: COLORS.node,
      haloAlpha: 0.22,
      coreColor: isHighlight ? COLORS.nodeHighlight : COLORS.node,
    };
  }

  // Node creation and management
  private createOrUpdateNode(node: PositionedNode, isHighlight: boolean, pg: PositionedGraph) {
    let g = this.nodeGraphics.get(node.id);

    const core = this.calculateNodeSize(node, isHighlight);
    const halo = node.isHotspot ? core * 2.4 : core * 1.8;
    const { haloColor, haloAlpha, coreColor } = this.getNodeColors(node, isHighlight);

    if (!g) {
      // Create new node
      g = new Graphics();
      g.beginFill(haloColor, haloAlpha);
      g.drawCircle(0, 0, halo);
      g.endFill();
      g.beginFill(coreColor, 1);
      g.drawCircle(0, 0, core);
      g.endFill();
      g.x = node.x;
      g.y = node.y;
      g.eventMode = 'static';
      g.cursor = 'pointer';

      // Event handlers
      g.on('pointerover', () => {
        if (this.hoverSuppressed) return;
        if (this.hoveredId === node.id) return;
        this.hoveredId = node.id;
        this.updateStatus();
        this.draw(pg, false, false);
      });
      g.on('pointerout', () => {
        if (this.hoverSuppressed) return;
        if (this.hoveredId !== node.id) return;
        this.hoveredId = null;
        this.updateStatus();
        this.draw(pg, false, false);
      });
      g.on('pointertap', () => {
        this.selectedId = node.id;
        this.updateStatus();
        this.draw(pg, false, true);
      });

      this.nodeGraphics.set(node.id, g);
      this.nodesLayer.addChild(g);
    } else {
      // Update existing node
      g.clear();
      g.beginFill(haloColor, haloAlpha);
      g.drawCircle(0, 0, halo);
      g.endFill();
      g.beginFill(coreColor, 1);
      g.drawCircle(0, 0, core);
      g.endFill();

      g.x = node.x;
      g.y = node.y;
    }

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
    visibleNodes: Set<string>,
    useCulling: boolean,
    showAllEdges: boolean
  ) {
    // Draw normal edges
    if (showAllEdges) {
      this.edgesGfx.lineStyle(1, COLORS.edge, 0.35);
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
      this.edgesGfx.lineStyle(2, COLORS.edgeHighlight, 0.85);
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
  draw(pg: PositionedGraph, applyFit = true, centerOnSelection = false, lightUpdate = false) {
    const viewW = this.app.renderer.screen.width;
    const viewH = this.app.renderer.screen.height;

    // Apply fit or center on selection
    if (applyFit) {
      const fit = fitToView(pg.nodes, viewW, viewH);
      this.currentScale = fit.scale;
      this.graphContainer.scale.set(fit.scale);
      this.graphContainer.position.set(fit.offsetX, fit.offsetY);
      this.updateZoomLevel();
    } else if (centerOnSelection && this.selectedId) {
      const node = pg.idToNode.get(this.selectedId);
      if (node) {
        this.graphContainer.position.x = viewW / 2 - node.x * this.currentScale;
        this.graphContainer.position.y = viewH / 2 - node.y * this.currentScale;
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
    if (useCulling && viewportBounds) {
      pg.nodes.forEach((n) => {
        if (this.isNodeVisible(n, viewportBounds) || highlightSet.has(n.id)) {
          visibleNodes.add(n.id);
        }
      });
    }

    const showAllEdges = this.currentScale > EDGE_VISIBILITY_THRESHOLD;
    const edgeHighlightSignature = `${this.hoveredId ?? ''}|${this.selectedId ?? ''}`;
    const shouldRedrawEdges =
      !lightUpdate ||
      useCulling ||
      showAllEdges !== this.lastShowAllEdges ||
      edgeHighlightSignature !== this.lastEdgeHighlightSignature;

    if (shouldRedrawEdges) {
      this.edgesGfx.clear();
      const neighborEdges = this.getNeighborEdges(pg, highlightSet);
      this.drawEdges(pg, neighborEdges, visibleNodes, useCulling, showAllEdges);
      this.lastShowAllEdges = showAllEdges;
      this.lastEdgeHighlightSignature = edgeHighlightSignature;
    }

    if (lightUpdate) {
      if (useCulling) {
        pg.nodes.forEach((n) => {
          const g = this.nodeGraphics.get(n.id);
          if (g) g.visible = visibleNodes.has(n.id);
        });
      }
    } else {
      pg.nodes.forEach((n) => {
        const isHighlight = highlightSet.has(n.id);
        const isVisible = !useCulling || visibleNodes.has(n.id);
        const g = this.createOrUpdateNode(n, isHighlight, pg);
        g.visible = isVisible;
      });
    }

    this.updateStatus();
  }

  // Public methods for external control
  setPositionedGraph(pg: PositionedGraph) {
    this.positioned = pg;

    // Clear old node graphics when loading a new graph
    this.nodesLayer.removeChildren();
    this.nodeGraphics.clear();
    this.transitiveDepsCache.clear();

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
    this.draw(pg, true, false);
  }

  fitView() {
    if (this.positioned) {
      this.selectedId = null;
      this.hoveredId = null;
      this.draw(this.positioned, true, false);
    }
  }

  reset() {
    if (this.positioned) {
      this.selectedId = null;
      this.hoveredId = null;
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
      this.currentNodeEl.innerText = `Not found: ${term}`;
      this.currentNodeStatus.classList.remove('hidden');
      return;
    }

    this.selectedId = node.id;
    this.draw(this.positioned, true, true);
  }

  handleResize() {
    if (this.positioned) {
      this.draw(this.positioned, true, false);
    }
  }

  // Pan management
  startPan(x: number, y: number) {
    this.isPanning = true;
    this.lastPan = { x, y };
    this.suppressHoverForNavigation();
  }

  updatePan(x: number, y: number) {
    if (!this.isPanning) return;

    this.graphContainer.position.x += x - this.lastPan.x;
    this.graphContainer.position.y += y - this.lastPan.y;
    this.lastPan = { x, y };
    this.suppressHoverForNavigation();
    // Pixi re-renders the translated container immediately; schedule one culling pass per frame
    this.scheduleDraw();
  }

  endPan() {
    this.isPanning = false;
    // Ensure culling is updated after pan settles
    if (this.positioned) this.draw(this.positioned, false, false, true);
  }

  setStatus(text: string, className: string) {
    this.statusBadge.innerText = text;
    this.statusBadge.className = `status-badge ${className}`;
  }

  setNodeCount(text: string) {
    this.nodeCountEl.innerText = text;
  }

  setWeightMode(mode: WeightMode) {
    if (!this.positioned) return;

    this.currentWeightMode = mode;
    recalculateWeights(this.positioned, mode);
    this.draw(this.positioned, false, false);
  }

  getWeightMode(): WeightMode {
    return this.currentWeightMode;
  }
}
