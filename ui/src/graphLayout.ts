export type GraphNode = {
  id: string;
  label: string;
  x?: number;
  y?: number;
  inDegree?: number;
  outDegree?: number;
  transitiveInDegree?: number;
  transitiveOutDegree?: number;
  weight?: number;
};
export type GraphEdge = { source: string; target: string };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };
export type PositionedNode = GraphNode & {
  x: number;
  y: number;
  inDegree: number;
  outDegree: number;
  transitiveInDegree: number;
  transitiveOutDegree: number;
  weight: number;
};
export type PositionedGraph = {
  nodes: PositionedNode[];
  edges: GraphEdge[];
  idToNode: Map<string, PositionedNode>;
  neighbors: Map<string, GraphEdge[]>;
};

export type WeightMode =
  | 'total'
  | 'inputs'
  | 'outputs'
  | 'transitive-total'
  | 'transitive-inputs'
  | 'transitive-outputs'
  | 'uniform';

export function recalculateWeights(pg: PositionedGraph, mode: WeightMode): void {
  pg.nodes.forEach((node) => {
    switch (mode) {
      case 'total':
        node.weight = node.inDegree + node.outDegree;
        break;
      case 'inputs':
        node.weight = node.inDegree;
        break;
      case 'outputs':
        node.weight = node.outDegree;
        break;
      case 'transitive-total':
        node.weight = node.transitiveInDegree + node.transitiveOutDegree;
        break;
      case 'transitive-inputs':
        node.weight = node.transitiveInDegree;
        break;
      case 'transitive-outputs':
        node.weight = node.transitiveOutDegree;
        break;
      case 'uniform':
        node.weight = 1;
        break;
    }
  });
}

// Calculate transitive closure using BFS
function calculateTransitiveClosure(
  nodes: PositionedNode[],
  edges: GraphEdge[]
): void {
  const idIndex = new Map<string, number>();
  nodes.forEach((n, i) => idIndex.set(n.id, i));

  // Build adjacency lists
  const outgoing: number[][] = nodes.map(() => []);
  const incoming: number[][] = nodes.map(() => []);

  edges.forEach((e) => {
    const s = idIndex.get(e.source);
    const t = idIndex.get(e.target);
    if (s !== undefined && t !== undefined) {
      outgoing[s].push(t);
      incoming[t].push(s);
    }
  });

  // Calculate transitive dependencies for each node
  nodes.forEach((node, nodeIdx) => {
    // Transitive inputs (all ancestors via BFS on incoming edges)
    const visitedIn = new Set<number>();
    const queueIn = [...incoming[nodeIdx]];
    while (queueIn.length > 0) {
      const curr = queueIn.shift()!;
      if (!visitedIn.has(curr)) {
        visitedIn.add(curr);
        queueIn.push(...incoming[curr]);
      }
    }
    node.transitiveInDegree = visitedIn.size;

    // Transitive outputs (all descendants via BFS on outgoing edges)
    const visitedOut = new Set<number>();
    const queueOut = [...outgoing[nodeIdx]];
    while (queueOut.length > 0) {
      const curr = queueOut.shift()!;
      if (!visitedOut.has(curr)) {
        visitedOut.add(curr);
        queueOut.push(...outgoing[curr]);
      }
    }
    node.transitiveOutDegree = visitedOut.size;
  });
}

export function sanitizeGraph(raw: Graph): Graph {
  const isValidId = (s: string) =>
    s &&
    !s.includes(" ") &&
    !s.includes("[") &&
    !s.includes("]") &&
    (s.startsWith("//") || s.startsWith("@"));
  const nodeMap = new Map<string, GraphNode>();
  for (const n of raw.nodes) {
    if (isValidId(n.id)) {
      nodeMap.set(n.id, { id: n.id, label: n.label || n.id });
    }
  }
  const edges: GraphEdge[] = [];
  for (const e of raw.edges) {
    if (!isValidId(e.source) || !isValidId(e.target)) continue;
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      edges.push({ source: e.source, target: e.target });
    }
  }
  return { nodes: Array.from(nodeMap.values()), edges };
}

// Fast grid layout for very large graphs (50k+ nodes)
// Arranges nodes in a compact grid, much faster than layered layout
function compactGridLayout(graph: Graph): PositionedGraph {
  const nodes = graph.nodes.map((n) => ({
    ...n,
    x: 0,
    y: 0,
    inDegree: 0,
    outDegree: 0,
    transitiveInDegree: 0,
    transitiveOutDegree: 0,
    weight: 0,
  }));

  // Calculate degrees
  const idIndex = new Map<string, number>();
  nodes.forEach((n, i) => idIndex.set(n.id, i));

  graph.edges.forEach((e) => {
    const sourceIdx = idIndex.get(e.source);
    const targetIdx = idIndex.get(e.target);
    if (sourceIdx !== undefined && targetIdx !== undefined) {
      nodes[sourceIdx].outDegree++;
      nodes[targetIdx].inDegree++;
    }
  });

  // Calculate transitive closure
  calculateTransitiveClosure(nodes as PositionedNode[], graph.edges);

  // Calculate default weight (total degree)
  nodes.forEach((n) => {
    n.weight = n.inDegree + n.outDegree;
  });

  // Arrange in a square grid
  const gridSize = Math.ceil(Math.sqrt(nodes.length));
  const spacing = 60; // Spacing between nodes

  nodes.forEach((n, i) => {
    const col = i % gridSize;
    const row = Math.floor(i / gridSize);
    n.x = col * spacing;
    n.y = row * spacing;
  });

  // Center around origin
  const avgX = nodes.reduce((acc, n) => acc + n.x, 0) / nodes.length;
  const avgY = nodes.reduce((acc, n) => acc + n.y, 0) / nodes.length;
  nodes.forEach((n) => {
    n.x -= avgX;
    n.y -= avgY;
  });

  const idToNode = new Map<string, PositionedNode>();
  nodes.forEach((n) => idToNode.set(n.id, n));
  const neighbors = new Map<string, GraphEdge[]>();
  nodes.forEach((n) => neighbors.set(n.id, []));
  graph.edges.forEach((e) => {
    neighbors.get(e.source)?.push(e);
    neighbors.get(e.target)?.push(e);
  });

  return { nodes: nodes as PositionedNode[], edges: graph.edges, idToNode, neighbors };
}

export function layeredLayout(graph: Graph): PositionedGraph {
  // For very large graphs (>10k nodes), use fast grid layout instead
  // The layered layout becomes impractical due to massive layer widths
  if (graph.nodes.length > 10000) {
    console.log(`Large graph detected (${graph.nodes.length} nodes), using fast grid layout`);
    return compactGridLayout(graph);
  }

  const nodes = graph.nodes.map((n) => ({
    ...n,
    x: 0,
    y: 0,
    inDegree: 0,
    outDegree: 0,
    transitiveInDegree: 0,
    transitiveOutDegree: 0,
    weight: 0,
  }));
  const idIndex = new Map<string, number>();
  nodes.forEach((n, i) => idIndex.set(n.id, i));

  const outgoing = nodes.map(() => [] as number[]);
  const indegree = nodes.map(() => 0);
  for (const e of graph.edges) {
    const s = idIndex.get(e.source);
    const t = idIndex.get(e.target);
    if (s === undefined || t === undefined) continue;
    outgoing[s].push(t);
    indegree[t]++;
    // Track degrees in nodes
    nodes[s].outDegree++;
    nodes[t].inDegree++;
  }

  // Calculate transitive closure
  calculateTransitiveClosure(nodes as PositionedNode[], graph.edges);

  // Calculate default weight (total degree)
  nodes.forEach((n) => {
    n.weight = n.inDegree + n.outDegree;
  });

  const layer: number[] = new Array(nodes.length).fill(0);
  const queue: number[] = [];
  indegree.forEach((d, i) => d === 0 && queue.push(i));
  while (queue.length) {
    const i = queue.shift()!;
    for (const t of outgoing[i]) {
      layer[t] = Math.max(layer[t], layer[i] + 1);
      indegree[t]--;
      if (indegree[t] === 0) queue.push(t);
    }
  }

  const layers: number[][] = [];
  layer.forEach((lv, i) => {
    if (!layers[lv]) layers[lv] = [];
    layers[lv].push(i);
  });

  const layerHeight = 140;
  const horizontalGap = 40;
  layers.forEach((idxs, lv) => {
    const count = idxs.length;
    const width = Math.max(1, (count - 1) * horizontalGap);
    idxs.forEach((nodeIdx, j) => {
      const x = j * horizontalGap - width / 2;
      const y = lv * layerHeight;
      nodes[nodeIdx].x = x;
      nodes[nodeIdx].y = y;
    });
  });

  // Recenter around origin (use mean to avoid odd distributions)
  const avgX = nodes.reduce((acc, n) => acc + n.x, 0) / nodes.length;
  const avgY = nodes.reduce((acc, n) => acc + n.y, 0) / nodes.length;
  nodes.forEach((n) => {
    n.x -= avgX;
    n.y -= avgY;
  });

  const idToNode = new Map<string, PositionedNode>();
  nodes.forEach((n) => idToNode.set(n.id, n));
  const neighbors = new Map<string, GraphEdge[]>();
  nodes.forEach((n) => neighbors.set(n.id, []));
  graph.edges.forEach((e) => {
    neighbors.get(e.source)?.push(e);
    neighbors.get(e.target)?.push(e);
  });

  return { nodes: nodes as PositionedNode[], edges: graph.edges, idToNode, neighbors };
}

export function fitToView(
  nodes: PositionedNode[],
  viewW: number,
  viewH: number
): { scale: number; offsetX: number; offsetY: number } {
  if (!nodes.length) return { scale: 1, offsetX: 0, offsetY: 0 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const padding = 120;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const scale = Math.min((viewW - padding * 2) / w, (viewH - padding * 2) / h);
  const clamped = Math.min(Math.max(scale, 0.05), 3);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const offsetX = viewW / 2 - cx * clamped;
  const offsetY = viewH / 2 - cy * clamped;
  return { scale: clamped, offsetX, offsetY };
}
