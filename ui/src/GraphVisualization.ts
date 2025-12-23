import { Application, Container, Graphics } from 'pixi.js';
import {
  fitToView,
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
  private nodesLayer: Container;
  private nodeGraphics: Map<string, Graphics>;
  private positioned: PositionedGraph | null = null;

  // State
  private currentScale = 1;
  private isPanning = false;
  private lastPan = { x: 0, y: 0 };
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private panRedrawPending = false;
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
    this.nodesLayer = new Container();
    this.nodeGraphics = new Map();

    this.app.stage.addChild(this.graphContainer);

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
    this.draw(this.positioned, false, false);
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
  private calculateTransitiveDeps(nodeId: string, pg: PositionedGraph): {
    transitiveNodes: Set<string>;
    transitiveEdges: Set<string>;
  } {
    const transitiveNodes = new Set<string>();
    const transitiveEdges = new Set<string>();
    const visited = new Set<string>();
    const queue: string[] = [nodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      // Find all edges connected to this node
      pg.edges.forEach((e) => {
        const edgeKey = `${e.source}->${e.target}`;
        if (e.source === currentId || e.target === currentId) {
          transitiveEdges.add(edgeKey);

          // Add connected nodes to queue
          const connectedId = e.source === currentId ? e.target : e.source;
          if (!visited.has(connectedId)) {
            transitiveNodes.add(connectedId);
            queue.push(connectedId);
          }
        }
      });
    }

    return { transitiveNodes, transitiveEdges };
  }

  // Status updates
  updateStatus() {
    if (!this.positioned) return;

    const totalNodes = this.positioned.nodes.length;
    const totalEdges = this.positioned.edges.length;

    if (this.selectedId) {
      // Direct connections
      const selectedEdges = this.positioned.edges.filter(
        (e) => e.source === this.selectedId || e.target === this.selectedId
      );

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
        const { transitiveNodes, transitiveEdges } = this.calculateTransitiveDeps(
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
        this.currentNodeEl.innerText = node.label;
        this.currentNodeStatus.classList.remove('hidden');
      }
    } else {
      this.nodeCountEl.innerText = totalNodes.toString();
      this.edgeCountEl.innerText = totalEdges.toString();

      if (this.hoveredId) {
        const node = this.positioned.idToNode.get(this.hoveredId);
        if (node) {
          this.currentNodeEl.innerText = node.label;
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

  // Node creation and management
  private createOrUpdateNode(node: PositionedNode, isHighlight: boolean, pg: PositionedGraph) {
    let g = this.nodeGraphics.get(node.id);

    const core = this.calculateNodeSize(node, isHighlight);
    const halo = core * 1.8;

    if (!g) {
      // Create new node
      g = new Graphics();
      g.beginFill(COLORS.node, 0.22);
      g.drawCircle(0, 0, halo);
      g.endFill();
      g.beginFill(isHighlight ? COLORS.nodeHighlight : COLORS.node, 1);
      g.drawCircle(0, 0, core);
      g.endFill();
      g.x = node.x;
      g.y = node.y;
      g.eventMode = 'static';
      g.cursor = 'pointer';

      // Event handlers
      g.on('pointerover', () => {
        this.hoveredId = node.id;
        this.updateStatus();
        this.draw(pg, false, false);
      });
      g.on('pointerout', () => {
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
      g.beginFill(COLORS.node, 0.22);
      g.drawCircle(0, 0, halo);
      g.endFill();
      g.beginFill(isHighlight ? COLORS.nodeHighlight : COLORS.node, 1);
      g.drawCircle(0, 0, core);
      g.endFill();

      g.x = node.x;
      g.y = node.y;
    }

    return g;
  }

  // Edge drawing
  private drawEdges(
    pg: PositionedGraph,
    edgesGfx: Graphics,
    highlightSet: Set<string>,
    visibleNodes: Set<string>,
    useCulling: boolean
  ) {
    const showAllEdges = this.currentScale > EDGE_VISIBILITY_THRESHOLD;
    const neighborEdges = new Set(
      pg.edges.filter(
        (e) => highlightSet.has(e.source) || highlightSet.has(e.target)
      )
    );

    // Draw normal edges
    if (showAllEdges) {
      edgesGfx.lineStyle(1, COLORS.edge, 0.35);
      for (const e of pg.edges) {
        if (neighborEdges.has(e)) continue;

        if (useCulling && !visibleNodes.has(e.source) && !visibleNodes.has(e.target)) {
          continue;
        }

        const s = pg.idToNode.get(e.source);
        const t = pg.idToNode.get(e.target);
        if (!s || !t) continue;

        edgesGfx.moveTo(s.x, s.y);
        edgesGfx.lineTo(t.x, t.y);
      }
    }

    // Draw highlighted edges
    if (neighborEdges.size > 0) {
      edgesGfx.lineStyle(2, COLORS.edgeHighlight, 0.85);
      neighborEdges.forEach((e) => {
        const s = pg.idToNode.get(e.source);
        const t = pg.idToNode.get(e.target);
        if (!s || !t) return;

        edgesGfx.moveTo(s.x, s.y);
        edgesGfx.lineTo(t.x, t.y);
      });
    }
  }

  // Main drawing function
  draw(pg: PositionedGraph, applyFit = true, centerOnSelection = false) {
    // Remove old edges graphics
    const oldEdgesGfx = this.graphContainer.children.find(c => c instanceof Graphics);
    if (oldEdgesGfx) {
      this.graphContainer.removeChild(oldEdgesGfx);
    }

    const edgesGfx = new Graphics();
    this.graphContainer.addChildAt(edgesGfx, 0);

    // Add nodes layer if needed
    if (!this.graphContainer.children.includes(this.nodesLayer)) {
      this.graphContainer.addChild(this.nodesLayer);
    }

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

    // Build highlight and visible node sets
    const highlightSet = new Set<string>();
    if (this.hoveredId) highlightSet.add(this.hoveredId);
    if (this.selectedId) highlightSet.add(this.selectedId);

    const visibleNodes = new Set<string>();
    if (useCulling && viewportBounds) {
      pg.nodes.forEach((n) => {
        if (this.isNodeVisible(n, viewportBounds) || highlightSet.has(n.id)) {
          visibleNodes.add(n.id);
        }
      });
    }

    // Draw edges
    this.drawEdges(pg, edgesGfx, highlightSet, visibleNodes, useCulling);

    // Draw nodes
    let renderedNodes = 0;
    pg.nodes.forEach((n) => {
      const isHighlight = highlightSet.has(n.id);
      const isVisible = !useCulling || visibleNodes.has(n.id);

      const g = this.createOrUpdateNode(n, isHighlight, pg);
      g.visible = isVisible;

      if (isVisible) renderedNodes++;
    });

    if (useCulling) {
      console.log(
        `Rendered ${renderedNodes} / ${pg.nodes.length} nodes (viewport culling enabled)`
      );
    }

    this.updateStatus();
  }

  // Public methods for external control
  setPositionedGraph(pg: PositionedGraph) {
    this.positioned = pg;
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
  }

  updatePan(x: number, y: number) {
    if (!this.isPanning) return;

    this.graphContainer.position.x += x - this.lastPan.x;
    this.graphContainer.position.y += y - this.lastPan.y;
    this.lastPan = { x, y };

    // Throttled redraw for large graphs
    if (
      this.positioned &&
      this.positioned.nodes.length > LARGE_GRAPH_THRESHOLD &&
      !this.panRedrawPending
    ) {
      this.panRedrawPending = true;
      requestAnimationFrame(() => {
        if (this.positioned) {
          this.draw(this.positioned, false, false);
        }
        this.panRedrawPending = false;
      });
    }
  }

  endPan() {
    this.isPanning = false;

    // Final redraw after pan ends for large graphs
    if (this.positioned && this.positioned.nodes.length > LARGE_GRAPH_THRESHOLD) {
      this.draw(this.positioned, false, false);
    }
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
