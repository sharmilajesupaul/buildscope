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
  sccId?: number;
  sccSize?: number;
  hotspotScore?: number;
  hotspotRank?: number;
  isHotspot?: boolean;
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
  sccId: number;
  sccSize: number;
  hotspotScore: number;
  hotspotRank: number;
  isHotspot: boolean;
};

export type PositionedGraph = {
  nodes: PositionedNode[];
  edges: GraphEdge[];
  idToNode: Map<string, PositionedNode>;
  neighbors: Map<string, GraphEdge[]>;
  hotspotCount: number;
  largestHotspotSize: number;
};

type ComponentInfo = {
  id: number;
  members: number[];
  size: number;
  selfLoop: boolean;
  incoming: Set<number>;
  outgoing: Set<number>;
  hotspotScore: number;
  hotspotRank: number;
  isHotspot: boolean;
};

export type WeightMode =
  | 'total'
  | 'inputs'
  | 'outputs'
  | 'transitive-total'
  | 'transitive-inputs'
  | 'transitive-outputs'
  | 'hotspots'
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
      case 'hotspots':
        // Size by downstream impact; cycle members get a bonus so they stand out
        node.weight = node.transitiveInDegree + (node.sccSize > 1 ? node.sccSize * 2 : 0);
        break;
      case 'uniform':
        node.weight = 1;
        break;
    }
  });
}

// Calculate transitive closure using BFS
function calculateTransitiveClosure(nodes: PositionedNode[], edges: GraphEdge[]): void {
  const idIndex = new Map<string, number>();
  nodes.forEach((n, i) => idIndex.set(n.id, i));

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

  nodes.forEach((node, nodeIdx) => {
    // Use an index pointer instead of shift() — shift() is O(n) and causes O(V²) total work
    const visitedIn = new Set<number>();
    const queueIn: number[] = [];
    let headIn = 0;
    for (const n of incoming[nodeIdx]) {
      if (!visitedIn.has(n)) { visitedIn.add(n); queueIn.push(n); }
    }
    while (headIn < queueIn.length) {
      const curr = queueIn[headIn++];
      for (const next of incoming[curr]) {
        if (!visitedIn.has(next)) { visitedIn.add(next); queueIn.push(next); }
      }
    }
    node.transitiveInDegree = visitedIn.size;

    const visitedOut = new Set<number>();
    const queueOut: number[] = [];
    let headOut = 0;
    for (const n of outgoing[nodeIdx]) {
      if (!visitedOut.has(n)) { visitedOut.add(n); queueOut.push(n); }
    }
    while (headOut < queueOut.length) {
      const curr = queueOut[headOut++];
      for (const next of outgoing[curr]) {
        if (!visitedOut.has(next)) { visitedOut.add(next); queueOut.push(next); }
      }
    }
    node.transitiveOutDegree = visitedOut.size;
  });
}

function calculateStronglyConnectedComponents(
  nodes: PositionedNode[],
  edges: GraphEdge[]
): ComponentInfo[] {
  const idIndex = new Map<string, number>();
  nodes.forEach((n, i) => idIndex.set(n.id, i));

  const outgoing: number[][] = nodes.map(() => []);
  const selfLoop = new Set<number>();

  edges.forEach((e) => {
    const s = idIndex.get(e.source);
    const t = idIndex.get(e.target);
    if (s === undefined || t === undefined) return;
    outgoing[s].push(t);
    if (s === t) selfLoop.add(s);
  });

  const indexByNode = new Array<number>(nodes.length).fill(-1);
  const lowLink = new Array<number>(nodes.length).fill(0);
  const onStack = new Array<boolean>(nodes.length).fill(false);
  const stack: number[] = [];
  const componentByNode = new Array<number>(nodes.length).fill(-1);
  const components: ComponentInfo[] = [];
  let index = 0;

  // Iterative Tarjan — avoids call stack overflow on deep linear chains (10k+ nodes)
  const strongConnect = (startIdx: number) => {
    type Frame = { nodeIdx: number; childIdx: number };
    const callStack: Frame[] = [];

    const enter = (nodeIdx: number) => {
      indexByNode[nodeIdx] = index;
      lowLink[nodeIdx] = index;
      index++;
      stack.push(nodeIdx);
      onStack[nodeIdx] = true;
      callStack.push({ nodeIdx, childIdx: 0 });
    };

    enter(startIdx);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      const { nodeIdx } = frame;
      let pushed = false;

      while (frame.childIdx < outgoing[nodeIdx].length) {
        const next = outgoing[nodeIdx][frame.childIdx];
        frame.childIdx++;
        if (indexByNode[next] === -1) {
          enter(next);
          pushed = true;
          break;
        } else if (onStack[next]) {
          lowLink[nodeIdx] = Math.min(lowLink[nodeIdx], indexByNode[next]);
        }
      }

      if (!pushed) {
        callStack.pop();
        if (callStack.length > 0) {
          const parent = callStack[callStack.length - 1].nodeIdx;
          lowLink[parent] = Math.min(lowLink[parent], lowLink[nodeIdx]);
        }
        if (lowLink[nodeIdx] === indexByNode[nodeIdx]) {
          const members: number[] = [];
          let member = -1;
          while (member !== nodeIdx) {
            member = stack.pop()!;
            onStack[member] = false;
            componentByNode[member] = components.length;
            members.push(member);
          }
          components.push({
            id: components.length,
            members,
            size: members.length,
            selfLoop: members.some((idx) => selfLoop.has(idx)),
            incoming: new Set(),
            outgoing: new Set(),
            hotspotScore: 0,
            hotspotRank: 0,
            isHotspot: false,
          });
        }
      }
    }
  };

  nodes.forEach((_, nodeIdx) => {
    if (indexByNode[nodeIdx] === -1) {
      strongConnect(nodeIdx);
    }
  });

  edges.forEach((e) => {
    const s = idIndex.get(e.source);
    const t = idIndex.get(e.target);
    if (s === undefined || t === undefined) return;
    const sourceComponent = componentByNode[s];
    const targetComponent = componentByNode[t];
    if (sourceComponent === targetComponent) return;
    components[sourceComponent].outgoing.add(targetComponent);
    components[targetComponent].incoming.add(sourceComponent);
  });

  const ranked = [...components]
    .map((component) => {
      const degreeImpact = component.incoming.size + component.outgoing.size;
      const cyclicityBonus = component.selfLoop || component.size > 1 ? component.size * 4 : 0;
      component.hotspotScore = degreeImpact + cyclicityBonus;
      component.isHotspot = component.hotspotScore > 0 && (component.size > 1 || component.selfLoop);
      return component;
    })
    .sort((a, b) => b.hotspotScore - a.hotspotScore || b.size - a.size || a.id - b.id);

  ranked.forEach((component, rank) => {
    component.hotspotRank = rank + 1;
  });

  nodes.forEach((node, nodeIdx) => {
    const component = components[componentByNode[nodeIdx]];
    node.sccId = component.id;
    node.sccSize = component.size;
    node.hotspotScore = component.hotspotScore;
    node.hotspotRank = component.hotspotRank;
    node.isHotspot = component.isHotspot;
  });

  return components;
}

// Mark nodes in the top 10% by transitiveInDegree as hotspots.
// This makes the hotspot feature meaningful for acyclic graphs (e.g. Bazel DAGs)
// where SCC-based detection finds nothing. Nodes already marked via SCC are left alone.
function markHighImpactHotspots(nodes: PositionedNode[]): void {
  const sorted = nodes.map((n) => n.transitiveInDegree).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  if (threshold === 0) return;
  nodes.forEach((n) => {
    if (!n.isHotspot && n.transitiveInDegree > threshold) {
      n.isHotspot = true;
      n.hotspotScore = n.transitiveInDegree;
    }
  });
}

export function sanitizeGraph(raw: Graph): Graph {
  const isValidId = (s: string) =>
    s &&
    !s.includes(' ') &&
    !s.includes('[') &&
    !s.includes(']') &&
    (s.startsWith('//') || s.startsWith('@'));
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

function buildPositionedGraph(
  nodes: PositionedNode[],
  edges: GraphEdge[],
  components: ComponentInfo[]
): PositionedGraph {
  const idToNode = new Map<string, PositionedNode>();
  nodes.forEach((n) => idToNode.set(n.id, n));
  const neighbors = new Map<string, GraphEdge[]>();
  nodes.forEach((n) => neighbors.set(n.id, []));
  edges.forEach((e) => {
    neighbors.get(e.source)?.push(e);
    neighbors.get(e.target)?.push(e);
  });

  const hotspotNodeCount = nodes.filter((n) => n.isHotspot).length;
  // largestHotspotSize tracks the biggest cycle cluster (SCC), not individual DAG hotspots
  const largestHotspotSize = components
    .filter((c) => c.isHotspot)
    .reduce((max, c) => Math.max(max, c.size), 0);

  return {
    nodes,
    edges,
    idToNode,
    neighbors,
    hotspotCount: hotspotNodeCount,
    largestHotspotSize,
  };
}

// Fast grid layout for very large graphs (50k+ nodes)
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
    sccId: -1,
    sccSize: 1,
    hotspotScore: 0,
    hotspotRank: 0,
    isHotspot: false,
  }));

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

  calculateTransitiveClosure(nodes as PositionedNode[], graph.edges);
  const components = calculateStronglyConnectedComponents(nodes as PositionedNode[], graph.edges);
  markHighImpactHotspots(nodes as PositionedNode[]);

  nodes.forEach((n) => {
    n.weight = n.inDegree + n.outDegree;
  });

  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.hotspotRank !== b.hotspotRank) return a.hotspotRank - b.hotspotRank;
    if (a.sccId !== b.sccId) return a.sccId - b.sccId;
    return a.label.localeCompare(b.label);
  });

  const gridSize = Math.ceil(Math.sqrt(sortedNodes.length));
  const spacing = 120;

  sortedNodes.forEach((n, i) => {
    const col = i % gridSize;
    const row = Math.floor(i / gridSize);
    n.x = col * spacing;
    n.y = row * spacing;
  });

  const avgX = nodes.reduce((acc, n) => acc + n.x, 0) / nodes.length;
  const avgY = nodes.reduce((acc, n) => acc + n.y, 0) / nodes.length;
  nodes.forEach((n) => {
    n.x -= avgX;
    n.y -= avgY;
  });

  return buildPositionedGraph(nodes as PositionedNode[], graph.edges, components);
}

export function layeredLayout(graph: Graph): PositionedGraph {
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
    sccId: -1,
    sccSize: 1,
    hotspotScore: 0,
    hotspotRank: 0,
    isHotspot: false,
  }));
  const idIndex = new Map<string, number>();
  nodes.forEach((n, i) => idIndex.set(n.id, i));

  for (const e of graph.edges) {
    const s = idIndex.get(e.source);
    const t = idIndex.get(e.target);
    if (s === undefined || t === undefined) continue;
    nodes[s].outDegree++;
    nodes[t].inDegree++;
  }

  calculateTransitiveClosure(nodes as PositionedNode[], graph.edges);
  const components = calculateStronglyConnectedComponents(nodes as PositionedNode[], graph.edges);
  markHighImpactHotspots(nodes as PositionedNode[]);

  nodes.forEach((n) => {
    n.weight = n.inDegree + n.outDegree;
  });

  const componentLayers = new Array<number>(components.length).fill(0);
  const componentIndegree = components.map((component) => component.incoming.size);
  const queue: number[] = [];
  componentIndegree.forEach((degree, index) => {
    if (degree === 0) queue.push(index);
  });

  while (queue.length) {
    const componentId = queue.shift()!;
    for (const next of components[componentId].outgoing) {
      componentLayers[next] = Math.max(componentLayers[next], componentLayers[componentId] + 1);
      componentIndegree[next] -= 1;
      if (componentIndegree[next] === 0) queue.push(next);
    }
  }

  const groupedLayers = new Map<number, ComponentInfo[]>();
  components.forEach((component) => {
    const layer = componentLayers[component.id];
    const existing = groupedLayers.get(layer) ?? [];
    existing.push(component);
    groupedLayers.set(layer, existing);
  });

  const layerOrder = [...groupedLayers.keys()].sort((a, b) => a - b);
  const componentPositions = new Map<number, { x: number; y: number }>();
  const layerHeight = 180;
  const horizontalGap = 80;

  layerOrder.forEach((layerNumber) => {
    const layerComponents = (groupedLayers.get(layerNumber) ?? []).sort((a, b) => {
      if (a.hotspotRank !== b.hotspotRank) return a.hotspotRank - b.hotspotRank;
      return a.id - b.id;
    });
    const width = Math.max(1, (layerComponents.length - 1) * horizontalGap);
    layerComponents.forEach((component, index) => {
      componentPositions.set(component.id, {
        x: index * horizontalGap - width / 2,
        y: layerNumber * layerHeight,
      });
    });
  });

  components.forEach((component) => {
    const center = componentPositions.get(component.id) ?? { x: 0, y: 0 };
    const memberIds = [...component.members].sort((a, b) => nodes[a].label.localeCompare(nodes[b].label));

    if (memberIds.length === 1) {
      const onlyNode = nodes[memberIds[0]];
      onlyNode.x = center.x;
      onlyNode.y = center.y;
      return;
    }

    const radius = 32 + Math.sqrt(memberIds.length) * 24;
    memberIds.forEach((nodeIdx, memberIndex) => {
      const angle = (Math.PI * 2 * memberIndex) / memberIds.length;
      nodes[nodeIdx].x = center.x + Math.cos(angle) * radius;
      nodes[nodeIdx].y = center.y + Math.sin(angle) * radius;
    });
  });

  const avgX = nodes.reduce((acc, n) => acc + n.x, 0) / nodes.length;
  const avgY = nodes.reduce((acc, n) => acc + n.y, 0) / nodes.length;
  nodes.forEach((n) => {
    n.x -= avgX;
    n.y -= avgY;
  });

  return buildPositionedGraph(nodes as PositionedNode[], graph.edges, components);
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

// Reconstructs the Map fields of a PositionedGraph from plain serializable arrays.
// Used to reassemble the result sent back from the layout Web Worker.
export function rehydratePositionedGraph(
  nodes: PositionedNode[],
  edges: GraphEdge[],
  hotspotCount: number,
  largestHotspotSize: number
): PositionedGraph {
  const idToNode = new Map<string, PositionedNode>();
  nodes.forEach((n) => idToNode.set(n.id, n));
  const neighbors = new Map<string, GraphEdge[]>();
  nodes.forEach((n) => neighbors.set(n.id, []));
  edges.forEach((e) => {
    neighbors.get(e.source)?.push(e);
    neighbors.get(e.target)?.push(e);
  });
  return { nodes, edges, idToNode, neighbors, hotspotCount, largestHotspotSize };
}
