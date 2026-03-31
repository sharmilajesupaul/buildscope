(function() {
  "use strict";
  function calculateTransitiveClosure(nodes, edges) {
    const idIndex = /* @__PURE__ */ new Map();
    nodes.forEach((n, i) => idIndex.set(n.id, i));
    const outgoing = nodes.map(() => []);
    const incoming = nodes.map(() => []);
    edges.forEach((e) => {
      const s = idIndex.get(e.source);
      const t = idIndex.get(e.target);
      if (s !== void 0 && t !== void 0) {
        outgoing[s].push(t);
        incoming[t].push(s);
      }
    });
    nodes.forEach((node, nodeIdx) => {
      const visitedIn = /* @__PURE__ */ new Set();
      const queueIn = [];
      let headIn = 0;
      for (const n of incoming[nodeIdx]) {
        if (!visitedIn.has(n)) {
          visitedIn.add(n);
          queueIn.push(n);
        }
      }
      while (headIn < queueIn.length) {
        const curr = queueIn[headIn++];
        for (const next of incoming[curr]) {
          if (!visitedIn.has(next)) {
            visitedIn.add(next);
            queueIn.push(next);
          }
        }
      }
      node.transitiveInDegree = visitedIn.size;
      const visitedOut = /* @__PURE__ */ new Set();
      const queueOut = [];
      let headOut = 0;
      for (const n of outgoing[nodeIdx]) {
        if (!visitedOut.has(n)) {
          visitedOut.add(n);
          queueOut.push(n);
        }
      }
      while (headOut < queueOut.length) {
        const curr = queueOut[headOut++];
        for (const next of outgoing[curr]) {
          if (!visitedOut.has(next)) {
            visitedOut.add(next);
            queueOut.push(next);
          }
        }
      }
      node.transitiveOutDegree = visitedOut.size;
    });
  }
  function calculateStronglyConnectedComponents(nodes, edges) {
    const idIndex = /* @__PURE__ */ new Map();
    nodes.forEach((n, i) => idIndex.set(n.id, i));
    const outgoing = nodes.map(() => []);
    const selfLoop = /* @__PURE__ */ new Set();
    edges.forEach((e) => {
      const s = idIndex.get(e.source);
      const t = idIndex.get(e.target);
      if (s === void 0 || t === void 0) return;
      outgoing[s].push(t);
      if (s === t) selfLoop.add(s);
    });
    const indexByNode = new Array(nodes.length).fill(-1);
    const lowLink = new Array(nodes.length).fill(0);
    const onStack = new Array(nodes.length).fill(false);
    const stack = [];
    const componentByNode = new Array(nodes.length).fill(-1);
    const components = [];
    let index = 0;
    const strongConnect = (startIdx) => {
      const callStack = [];
      const enter = (nodeIdx) => {
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
            const members = [];
            let member = -1;
            while (member !== nodeIdx) {
              member = stack.pop();
              onStack[member] = false;
              componentByNode[member] = components.length;
              members.push(member);
            }
            components.push({
              id: components.length,
              members,
              size: members.length,
              selfLoop: members.some((idx) => selfLoop.has(idx)),
              incoming: /* @__PURE__ */ new Set(),
              outgoing: /* @__PURE__ */ new Set(),
              hotspotScore: 0,
              hotspotRank: 0,
              isHotspot: false
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
      if (s === void 0 || t === void 0) return;
      const sourceComponent = componentByNode[s];
      const targetComponent = componentByNode[t];
      if (sourceComponent === targetComponent) return;
      components[sourceComponent].outgoing.add(targetComponent);
      components[targetComponent].incoming.add(sourceComponent);
    });
    const ranked = [...components].map((component) => {
      const degreeImpact = component.incoming.size + component.outgoing.size;
      const cyclicityBonus = component.selfLoop || component.size > 1 ? component.size * 4 : 0;
      component.hotspotScore = degreeImpact + cyclicityBonus;
      component.isHotspot = component.hotspotScore > 0 && (component.size > 1 || component.selfLoop);
      return component;
    }).sort((a, b) => b.hotspotScore - a.hotspotScore || b.size - a.size || a.id - b.id);
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
  function markHighImpactHotspots(nodes) {
    const sorted = nodes.map((n) => n.transitiveInDegree).sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
    const minimumScore = threshold === 0 ? 1 : threshold + 1;
    nodes.forEach((n) => {
      if (!n.isHotspot && n.transitiveInDegree >= minimumScore) {
        n.isHotspot = true;
        n.hotspotScore = n.transitiveInDegree;
      }
    });
    let nextRank = nodes.reduce((maxRank, node) => Math.max(maxRank, node.hotspotRank), 0) + 1;
    const dagHotspots = nodes.filter((node) => node.isHotspot && node.hotspotRank === 0).sort(
      (a, b) => b.hotspotScore - a.hotspotScore || b.transitiveInDegree - a.transitiveInDegree || a.label.localeCompare(b.label)
    );
    dagHotspots.forEach((node) => {
      node.hotspotRank = nextRank++;
    });
  }
  function sanitizeGraph(raw) {
    const isValidId = (s) => s && !s.includes(" ") && !s.includes("[") && !s.includes("]") && (s.startsWith("//") || s.startsWith("@"));
    const nodeMap = /* @__PURE__ */ new Map();
    for (const n of raw.nodes) {
      if (isValidId(n.id)) {
        nodeMap.set(n.id, { id: n.id, label: n.label || n.id });
      }
    }
    const edges = [];
    for (const e of raw.edges) {
      if (!isValidId(e.source) || !isValidId(e.target)) continue;
      if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
        edges.push({ source: e.source, target: e.target });
      }
    }
    return { nodes: Array.from(nodeMap.values()), edges };
  }
  function buildPositionedGraph(nodes, edges, components) {
    const idToNode = /* @__PURE__ */ new Map();
    nodes.forEach((n) => idToNode.set(n.id, n));
    const neighbors = /* @__PURE__ */ new Map();
    const incoming = /* @__PURE__ */ new Map();
    const outgoing = /* @__PURE__ */ new Map();
    nodes.forEach((n) => neighbors.set(n.id, []));
    nodes.forEach((n) => incoming.set(n.id, []));
    nodes.forEach((n) => outgoing.set(n.id, []));
    edges.forEach((e) => {
      var _a, _b, _c, _d;
      (_a = neighbors.get(e.source)) == null ? void 0 : _a.push(e);
      (_b = neighbors.get(e.target)) == null ? void 0 : _b.push(e);
      (_c = outgoing.get(e.source)) == null ? void 0 : _c.push(e);
      (_d = incoming.get(e.target)) == null ? void 0 : _d.push(e);
    });
    const hotspotNodeCount = nodes.filter((n) => n.isHotspot).length;
    const largestHotspotSize = components.filter((c) => c.isHotspot).reduce((max, c) => Math.max(max, c.size), 0);
    return {
      nodes,
      edges,
      idToNode,
      neighbors,
      incoming,
      outgoing,
      hotspotCount: hotspotNodeCount,
      largestHotspotSize
    };
  }
  function compactGridLayout(graph) {
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
      isHotspot: false
    }));
    const idIndex = /* @__PURE__ */ new Map();
    nodes.forEach((n, i) => idIndex.set(n.id, i));
    graph.edges.forEach((e) => {
      const sourceIdx = idIndex.get(e.source);
      const targetIdx = idIndex.get(e.target);
      if (sourceIdx !== void 0 && targetIdx !== void 0) {
        nodes[sourceIdx].outDegree++;
        nodes[targetIdx].inDegree++;
      }
    });
    calculateTransitiveClosure(nodes, graph.edges);
    const components = calculateStronglyConnectedComponents(nodes, graph.edges);
    markHighImpactHotspots(nodes);
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
    return buildPositionedGraph(nodes, graph.edges, components);
  }
  function layeredLayout(graph) {
    if (graph.nodes.length > 1e4) {
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
      isHotspot: false
    }));
    const idIndex = /* @__PURE__ */ new Map();
    nodes.forEach((n, i) => idIndex.set(n.id, i));
    for (const e of graph.edges) {
      const s = idIndex.get(e.source);
      const t = idIndex.get(e.target);
      if (s === void 0 || t === void 0) continue;
      nodes[s].outDegree++;
      nodes[t].inDegree++;
    }
    calculateTransitiveClosure(nodes, graph.edges);
    const components = calculateStronglyConnectedComponents(nodes, graph.edges);
    markHighImpactHotspots(nodes);
    nodes.forEach((n) => {
      n.weight = n.inDegree + n.outDegree;
    });
    const componentLayers = new Array(components.length).fill(0);
    const componentIndegree = components.map((component) => component.incoming.size);
    const queue = [];
    componentIndegree.forEach((degree, index) => {
      if (degree === 0) queue.push(index);
    });
    while (queue.length) {
      const componentId = queue.shift();
      for (const next of components[componentId].outgoing) {
        componentLayers[next] = Math.max(componentLayers[next], componentLayers[componentId] + 1);
        componentIndegree[next] -= 1;
        if (componentIndegree[next] === 0) queue.push(next);
      }
    }
    const groupedLayers = /* @__PURE__ */ new Map();
    components.forEach((component) => {
      const layer = componentLayers[component.id];
      const existing = groupedLayers.get(layer) ?? [];
      existing.push(component);
      groupedLayers.set(layer, existing);
    });
    const layerOrder = [...groupedLayers.keys()].sort((a, b) => a - b);
    const componentPositions = /* @__PURE__ */ new Map();
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
          y: layerNumber * layerHeight
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
        const angle = Math.PI * 2 * memberIndex / memberIds.length;
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
    return buildPositionedGraph(nodes, graph.edges, components);
  }
  self.onmessage = (e) => {
    try {
      const clean = sanitizeGraph(e.data);
      const pg = layeredLayout(clean);
      self.postMessage({
        nodes: pg.nodes,
        edges: pg.edges,
        hotspotCount: pg.hotspotCount,
        largestHotspotSize: pg.largestHotspotSize
      });
    } catch (err) {
      self.postMessage({ error: String(err) });
    }
  };
})();
