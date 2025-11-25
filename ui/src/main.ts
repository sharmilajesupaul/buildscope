import { Application, Container, Graphics } from "pixi.js";
import {
  fitToView,
  sanitizeGraph,
  layeredLayout,
  Graph,
  PositionedGraph,
  PositionedNode,
} from "./graphLayout";

async function loadGraph(): Promise<Graph> {
  try {
    const res = await fetch("/graph.json");
    if (!res.ok) throw new Error("fallback");
    return res.json();
  } catch {
    const res = await fetch("/sample-graph.json");
    return res.json();
  }
}

function main() {
  const root = document.getElementById("app");
  if (!root) return;

  root.innerHTML = "";

  // Create header
  const header = document.createElement("div");
  header.className = "app-header";
  header.innerHTML = `
    <div class="app-title">
      <div class="app-logo">B</div>
      <div>
        <div class="app-name">BuildScope</div>
      </div>
      <div class="app-subtitle">Bazel Build Graph Explorer</div>
    </div>
  `;
  root.appendChild(header);

  // Create controls panel
  const controlsPanel = document.createElement("div");
  controlsPanel.className = "controls-panel";
  controlsPanel.innerHTML = `
    <div class="controls-section">
      <div class="controls-label">Search</div>
      <div class="search-container">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
        <input type="text" class="search-input" id="search-input" placeholder="Search nodes..." />
      </div>
    </div>
    <div class="controls-section">
      <div class="controls-label">View Controls</div>
      <div class="button-group">
        <button class="btn btn-primary" id="fit-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-1 0v-3zm13 0A1.5 1.5 0 0 0 12.5 1h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 0 1 0v-3zM.5 10.5A.5.5 0 0 1 1 10v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 1 13v-3a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 0 0 1h3a1.5 1.5 0 0 0 1.5-1.5v-3a.5.5 0 0 0-.5-.5z"/>
          </svg>
          Fit View
        </button>
        <button class="btn btn-secondary" id="reset-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
          Reset
        </button>
      </div>
    </div>
  `;
  root.appendChild(controlsPanel);

  const searchInput = controlsPanel.querySelector("#search-input") as HTMLInputElement;
  const fitBtn = controlsPanel.querySelector("#fit-btn") as HTMLButtonElement;
  const resetBtn = controlsPanel.querySelector("#reset-btn") as HTMLButtonElement;

  // Create status panel
  const statusPanel = document.createElement("div");
  statusPanel.className = "status-panel";
  statusPanel.innerHTML = `
    <div class="status-item">
      <span class="status-label">Status:</span>
      <span class="status-badge loading" id="status-badge">Loading</span>
    </div>
    <div class="status-item">
      <span class="status-label">Nodes:</span>
      <span class="status-value" id="node-count">0</span>
    </div>
    <div class="status-item">
      <span class="status-label">Edges:</span>
      <span class="status-value" id="edge-count">0</span>
    </div>
    <div class="status-item hidden" id="current-node-status">
      <span class="status-label">Selected:</span>
      <span class="status-value font-size-sm" id="current-node"></span>
    </div>
    <div class="legend">
      <div class="legend-items">
        <div class="legend-item">
          <div class="legend-color node"></div>
          <span>Nodes</span>
        </div>
        <div class="legend-item">
          <div class="legend-color edge"></div>
          <span>Dependencies</span>
        </div>
        <div class="legend-item">
          <div class="legend-color highlight"></div>
          <span>Highlighted</span>
        </div>
      </div>
    </div>
  `;
  root.appendChild(statusPanel);

  const statusBadge = statusPanel.querySelector("#status-badge") as HTMLElement;
  const nodeCountEl = statusPanel.querySelector("#node-count") as HTMLElement;
  const edgeCountEl = statusPanel.querySelector("#edge-count") as HTMLElement;
  const currentNodeEl = statusPanel.querySelector("#current-node") as HTMLElement;
  const currentNodeStatus = statusPanel.querySelector("#current-node-status") as HTMLElement;

  // Create zoom controls
  const zoomControls = document.createElement("div");
  zoomControls.className = "zoom-controls";
  zoomControls.innerHTML = `
    <button class="zoom-btn" id="zoom-in" title="Zoom In">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
      </svg>
    </button>
    <div class="zoom-level" id="zoom-level">100%</div>
    <button class="zoom-btn" id="zoom-out" title="Zoom Out">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
      </svg>
    </button>
  `;
  root.appendChild(zoomControls);

  const zoomInBtn = zoomControls.querySelector("#zoom-in") as HTMLButtonElement;
  const zoomOutBtn = zoomControls.querySelector("#zoom-out") as HTMLButtonElement;
  const zoomLevelEl = zoomControls.querySelector("#zoom-level") as HTMLElement;

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

  const graphContainer = new Container();
  app.stage.addChild(graphContainer);

  let positioned: PositionedGraph | null = null;
  let currentScale = 1;
  let isPanning = false;
  let lastPan = { x: 0, y: 0 };
  let hoveredId: string | null = null;
  let selectedId: string | null = null;

  const COLORS = {
    edge: 0x5b9eff,
    edgeHighlight: 0xffc857,
    node: 0xffc857,
    nodeHighlight: 0xffd98e,
  };

  function updateZoomLevel() {
    zoomLevelEl.innerText = `${Math.round(currentScale * 100)}%`;
  }

  function updateStatus() {
    if (!positioned) return;
    nodeCountEl.innerText = positioned.nodes.length.toString();
    edgeCountEl.innerText = positioned.edges.length.toString();
    if (selectedId || hoveredId) {
      const activeId = selectedId || hoveredId;
      const node = positioned.idToNode.get(activeId!);
      if (node) {
        currentNodeEl.innerText = node.label;
        currentNodeStatus.classList.remove('hidden');
      }
    } else {
      currentNodeStatus.classList.add('hidden');
    }
  }

  // Calculate viewport bounds in graph coordinates
  function getViewportBounds() {
    const viewW = app.renderer.screen.width;
    const viewH = app.renderer.screen.height;
    const padding = 200; // Extra padding to render slightly off-screen nodes

    // Convert screen coordinates to graph coordinates
    const minX = (-graphContainer.position.x - padding) / currentScale;
    const minY = (-graphContainer.position.y - padding) / currentScale;
    const maxX = (viewW - graphContainer.position.x + padding) / currentScale;
    const maxY = (viewH - graphContainer.position.y + padding) / currentScale;

    return { minX, minY, maxX, maxY };
  }

  // Check if node is in viewport
  function isNodeVisible(node: PositionedNode, bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
    return node.x >= bounds.minX && node.x <= bounds.maxX &&
           node.y >= bounds.minY && node.y <= bounds.maxY;
  }

  function draw(pg: PositionedGraph, applyFit = true, centerOnSelection = false) {
    graphContainer.removeChildren();
    const edgesGfx = new Graphics();
    const nodesLayer = new Container();
    graphContainer.addChild(edgesGfx);
    graphContainer.addChild(nodesLayer);

    const viewW = app.renderer.screen.width;
    const viewH = app.renderer.screen.height;

    if (applyFit) {
      const fit = fitToView(pg.nodes, viewW, viewH);
      currentScale = fit.scale;
      graphContainer.scale.set(fit.scale);
      graphContainer.position.set(fit.offsetX, fit.offsetY);
      updateZoomLevel();
    } else if (centerOnSelection && selectedId) {
      const node = pg.idToNode.get(selectedId);
      if (node) {
        graphContainer.position.x = viewW / 2 - node.x * currentScale;
        graphContainer.position.y = viewH / 2 - node.y * currentScale;
      }
    }

    // For large graphs (>5000 nodes), use viewport culling
    const useCulling = pg.nodes.length > 5000;
    const viewportBounds = useCulling ? getViewportBounds() : null;

    const showAllEdges = currentScale > 0.2;
    const highlightSet = new Set<string>();
    if (hoveredId) highlightSet.add(hoveredId);
    if (selectedId) highlightSet.add(selectedId);
    const neighborEdges = new Set(pg.edges.filter((e) => highlightSet.has(e.source) || highlightSet.has(e.target)));

    // Build set of visible nodes for culling
    const visibleNodes = new Set<string>();
    if (useCulling && viewportBounds) {
      pg.nodes.forEach((n) => {
        if (isNodeVisible(n, viewportBounds) || highlightSet.has(n.id)) {
          visibleNodes.add(n.id);
        }
      });
    }

    // Draw normal edges (with culling for large graphs)
    if (showAllEdges) {
      edgesGfx.lineStyle(1, COLORS.edge, 0.35);
      for (const e of pg.edges) {
        if (neighborEdges.has(e)) continue; // Skip neighbor edges, draw them later

        // Skip edges where both nodes are outside viewport (for large graphs)
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

    // Draw highlighted edges (always visible)
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

    // Draw nodes (with viewport culling for large graphs)
    let renderedNodes = 0;
    pg.nodes.forEach((n) => {
      // Skip nodes outside viewport for large graphs (unless highlighted)
      if (useCulling && !visibleNodes.has(n.id)) {
        return;
      }

      renderedNodes++;
      const isHighlight = highlightSet.has(n.id);
      const core = isHighlight ? 9 : 7;
      const halo = core * 1.8;
      const g = new Graphics();
      g.beginFill(COLORS.node, 0.22);
      g.drawCircle(0, 0, halo);
      g.endFill();
      g.beginFill(isHighlight ? COLORS.nodeHighlight : COLORS.node, 1);
      g.drawCircle(0, 0, core);
      g.endFill();
      g.x = n.x;
      g.y = n.y;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => {
        hoveredId = n.id;
        updateStatus();
        draw(pg, false, false);
      });
      g.on("pointerout", () => {
        hoveredId = null;
        updateStatus();
        draw(pg, false, false);
      });
      g.on("pointertap", () => {
        selectedId = n.id;
        updateStatus();
        draw(pg, false, true);
      });
      nodesLayer.addChild(g);
    });

    if (useCulling) {
      console.log(`Rendered ${renderedNodes} / ${pg.nodes.length} nodes (viewport culling enabled)`);
    }

    updateStatus();
  }

  function zoom(delta: number, cx: number, cy: number) {
    if (!positioned) return;
    const factor = delta < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(currentScale * factor, 0.05), 3);
    const before = {
      x: (cx - graphContainer.position.x) / currentScale,
      y: (cy - graphContainer.position.y) / currentScale,
    };
    currentScale = newScale;
    graphContainer.scale.set(newScale);
    const after = {
      x: (cx - graphContainer.position.x) / currentScale,
      y: (cy - graphContainer.position.y) / currentScale,
    };
    graphContainer.position.x += (after.x - before.x) * currentScale;
    graphContainer.position.y += (after.y - before.y) * currentScale;
    updateZoomLevel();
    draw(positioned, false, false);
  }

  app.view.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoom(e.deltaY, e.clientX, e.clientY);
  });

  app.view.addEventListener("pointerdown", (e) => {
    isPanning = true;
    lastPan = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => {
    isPanning = false;
  });
  window.addEventListener("pointermove", (e) => {
    if (!isPanning) return;
    graphContainer.position.x += e.clientX - lastPan.x;
    graphContainer.position.y += e.clientY - lastPan.y;
    lastPan = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("resize", () => {
    if (positioned) draw(positioned, true, false);
  });

  zoomInBtn.addEventListener("click", () => {
    if (!positioned) return;
    const centerX = app.renderer.screen.width / 2;
    const centerY = app.renderer.screen.height / 2;
    zoom(-1, centerX, centerY);
  });

  zoomOutBtn.addEventListener("click", () => {
    if (!positioned) return;
    const centerX = app.renderer.screen.width / 2;
    const centerY = app.renderer.screen.height / 2;
    zoom(1, centerX, centerY);
  });

  fitBtn.addEventListener("click", () => {
    if (positioned) {
      selectedId = null;
      hoveredId = null;
      draw(positioned, true, false);
    }
  });

  resetBtn.addEventListener("click", () => {
    if (positioned) {
      selectedId = null;
      hoveredId = null;
      currentScale = 1;
      graphContainer.scale.set(1);
      graphContainer.position.set(
        app.renderer.screen.width / 2,
        app.renderer.screen.height / 2
      );
      updateZoomLevel();
      draw(positioned, false, false);
    }
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !positioned) return;
    const term = searchInput.value.trim().toLowerCase();
    if (!term) return;
    const node = positioned.nodes.find((n) =>
      n.label.toLowerCase().includes(term)
    );
    if (!node) {
      currentNodeEl.innerText = `Not found: ${term}`;
      currentNodeStatus.classList.remove('hidden');
      return;
    }
    selectedId = node.id;
    draw(positioned, true, true);
  });

  loadGraph()
    .then((g) => {
      console.log(`Loaded graph with ${g.nodes.length} nodes, ${g.edges.length} edges`);

      statusBadge.innerText = "Processing...";
      statusBadge.className = "status-badge loading";

      // Use setTimeout to allow UI to update before heavy computation
      setTimeout(() => {
        const clean = sanitizeGraph(g);
        console.log(`Sanitized to ${clean.nodes.length} nodes, ${clean.edges.length} edges`);

        if (clean.nodes.length > 10000) {
          statusBadge.innerText = "Large graph - Computing layout...";
        }

        // Another setTimeout for layout computation
        setTimeout(() => {
          const layoutStart = performance.now();
          positioned = layeredLayout(clean);
          const layoutTime = performance.now() - layoutStart;
          console.log(`Layout computed in ${layoutTime.toFixed(0)}ms`);

          statusBadge.innerText = "Ready";
          statusBadge.className = "status-badge success";
          draw(positioned, true, false);
        }, 10);
      }, 10);
    })
    .catch((err) => {
      console.error(err);
      statusBadge.innerText = "Error";
      statusBadge.className = "status-badge error";
      nodeCountEl.innerText = "Failed to load graph";
    });
}

main();
