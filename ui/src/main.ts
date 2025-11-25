import { Application, Container, Graphics } from "pixi.js";
import {
  fitToView,
  sanitizeGraph,
  Graph,
  PositionedGraph,
  PositionedNode,
} from "./graphLayout";

function gridLayout(graph: Graph): PositionedGraph {
  const cols = Math.ceil(Math.sqrt(graph.nodes.length));
  const gap = 40;
  const nodes: PositionedNode[] = graph.nodes.map((n, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    return {
      ...n,
      x: col * gap,
      y: row * gap,
    };
  });
  // recenter around origin
  const avgX = nodes.reduce((a, n) => a + n.x, 0) / nodes.length;
  const avgY = nodes.reduce((a, n) => a + n.y, 0) / nodes.length;
  nodes.forEach((n) => {
    n.x -= avgX;
    n.y -= avgY;
  });
  const idToNode = new Map<string, PositionedNode>();
  nodes.forEach((n) => idToNode.set(n.id, n));
  const neighbors = new Map<string, Graph["edges"]>();
  nodes.forEach((n) => neighbors.set(n.id, []));
  graph.edges.forEach((e) => {
    neighbors.get(e.source)?.push(e);
    neighbors.get(e.target)?.push(e);
  });
  return { nodes, edges: graph.edges, idToNode, neighbors };
}

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
  document.body.style.margin = "0";
  document.body.style.background =
    "radial-gradient(circle at 30% 30%, rgba(120, 160, 255, 0.06), transparent 35%), radial-gradient(circle at 70% 70%, rgba(255, 190, 140, 0.05), transparent 32%), #090d14";
  root.innerHTML = "";

  const status = document.createElement("div");
  status.style.position = "fixed";
  status.style.top = "12px";
  status.style.left = "12px";
  status.style.color = "#d4e5ff";
  status.style.fontFamily = "system-ui, sans-serif";
  status.style.fontSize = "14px";
  status.style.background = "rgba(12, 18, 26, 0.7)";
  status.style.padding = "8px 10px";
  status.style.borderRadius = "8px";
  status.style.border = "1px solid rgba(255,255,255,0.08)";
  status.innerText = "Loading graph…";
  root.appendChild(status);

  const controls = document.createElement("div");
  controls.style.position = "fixed";
  controls.style.top = "12px";
  controls.style.right = "12px";
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.alignItems = "center";
  controls.style.background = "rgba(12, 18, 26, 0.7)";
  controls.style.border = "1px solid rgba(255,255,255,0.08)";
  controls.style.borderRadius = "8px";
  controls.style.padding = "8px 10px";
  controls.style.color = "#d4e5ff";
  controls.style.fontFamily = "system-ui, sans-serif";
  controls.style.fontSize = "13px";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search node label…";
  searchInput.style.background = "rgba(255,255,255,0.06)";
  searchInput.style.border = "1px solid rgba(255,255,255,0.12)";
  searchInput.style.borderRadius = "6px";
  searchInput.style.padding = "6px 8px";
  searchInput.style.color = "#d4e5ff";
  searchInput.style.outline = "none";
  searchInput.style.width = "220px";

  const fitBtn = document.createElement("button");
  fitBtn.textContent = "Fit";
  fitBtn.style.background = "linear-gradient(135deg, #4f7cff, #79a8ff)";
  fitBtn.style.border = "none";
  fitBtn.style.color = "#0b0f14";
  fitBtn.style.fontWeight = "600";
  fitBtn.style.padding = "8px 10px";
  fitBtn.style.borderRadius = "6px";
  fitBtn.style.cursor = "pointer";

  controls.appendChild(searchInput);
  controls.appendChild(fitBtn);
  root.appendChild(controls);

  const app = new Application({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.max(1, window.devicePixelRatio || 1),
  });
  root.appendChild(app.view as HTMLCanvasElement);

  const graphContainer = new Container();
  app.stage.addChild(graphContainer);

  let positioned: PositionedGraph | null = null;
  let currentScale = 1;
  let isPanning = false;
  let lastPan = { x: 0, y: 0 };
  let hoveredId: string | null = null;
  let selectedId: string | null = null;

  const COLORS = {
    edge: 0x4f6da8,
    node: 0xf3c16f,
  };

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
      graphContainer.position.set(viewW / 2, viewH / 2);
    } else if (centerOnSelection && selectedId) {
      const node = pg.idToNode.get(selectedId);
      if (node) {
        graphContainer.position.x = viewW / 2 - node.x * currentScale;
        graphContainer.position.y = viewH / 2 - node.y * currentScale;
      }
    }

    const showAllEdges = currentScale > 0.2;
    const highlightSet = new Set<string>();
    if (hoveredId) highlightSet.add(hoveredId);
    if (selectedId) highlightSet.add(selectedId);
    const neighborEdges = new Set(pg.edges.filter((e) => highlightSet.has(e.source) || highlightSet.has(e.target)));

    if (showAllEdges) {
      edgesGfx.lineStyle(1, COLORS.edge, 0.28);
      for (const e of pg.edges) {
        const s = pg.idToNode.get(e.source);
        const t = pg.idToNode.get(e.target);
        if (!s || !t) continue;
        edgesGfx.moveTo(s.x, s.y);
        edgesGfx.lineTo(t.x, t.y);
      }
    } else if (neighborEdges.size > 0) {
      edgesGfx.lineStyle(1.5, COLORS.edge, 0.5);
      neighborEdges.forEach((e) => {
        const s = pg.idToNode.get(e.source);
        const t = pg.idToNode.get(e.target);
        if (!s || !t) return;
        edgesGfx.moveTo(s.x, s.y);
        edgesGfx.lineTo(t.x, t.y);
      });
    }

    pg.nodes.forEach((n) => {
      const isHighlight = highlightSet.has(n.id);
      const core = isHighlight ? 9 : 7;
      const halo = core * 1.8;
      const g = new Graphics();
      g.beginFill(COLORS.node, 0.22);
      g.drawCircle(0, 0, halo);
      g.endFill();
      g.beginFill(COLORS.node, 1);
      g.drawCircle(0, 0, core);
      g.endFill();
      g.x = n.x;
      g.y = n.y;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => {
        hoveredId = n.id;
        status.innerText = n.label;
        draw(pg, false, false);
      });
      g.on("pointerout", () => {
        hoveredId = null;
        if (!selectedId) {
          status.innerText = `Loaded ${pg.nodes.length} nodes, ${pg.edges.length} edges`;
        }
        draw(pg, false, false);
      });
      g.on("pointertap", () => {
        selectedId = n.id;
        status.innerText = n.label;
        draw(pg, false, true);
      });
      nodesLayer.addChild(g);
    });

    status.innerText = `Loaded ${pg.nodes.length} nodes, ${pg.edges.length} edges`;
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

  fitBtn.addEventListener("click", () => {
    if (positioned) {
      selectedId = null;
      hoveredId = null;
      draw(positioned, true, false);
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
      status.innerText = `Not found: ${term}`;
      return;
    }
    selectedId = node.id;
    draw(positioned, true, true);
    status.innerText = node.label;
  });

  loadGraph()
    .then((g) => {
      const clean = sanitizeGraph(g);
      positioned = gridLayout(clean);
      draw(positioned, true, false);
    })
    .catch((err) => {
      console.error(err);
      status.innerText = "Failed to load graph";
    });
}

main();
