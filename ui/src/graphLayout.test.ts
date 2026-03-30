import { describe, expect, it } from 'vitest';
import { fitToView, layeredLayout, sanitizeGraph, Graph, recalculateWeights } from './graphLayout';

describe('sanitizeGraph', () => {
  it('drops invalid ids and edges', () => {
    const raw: Graph = {
      nodes: [
        { id: '//ok:one', label: '' },
        { id: '[label="bad"]', label: 'bad' },
      ],
      edges: [
        { source: '//ok:one', target: '[label="bad"]' },
        { source: '//ok:one', target: '//ok:one' },
      ],
    };
    const clean = sanitizeGraph(raw);
    expect(clean.nodes.length).toBe(1);
    expect(clean.edges.length).toBe(1);
    expect(clean.edges[0].target).toBe('//ok:one');
  });
});

describe('layeredLayout + fitToView', () => {
  const graph: Graph = {
    nodes: Array.from({ length: 6 }, (_, i) => ({
      id: `//n${i}`,
      label: `//n${i}`,
    })),
    edges: [
      { source: '//n0', target: '//n1' },
      { source: '//n1', target: '//n2' },
      { source: '//n0', target: '//n3' },
      { source: '//n3', target: '//n4' },
      { source: '//n2', target: '//n5' },
    ],
  };

  it('centers nodes within view with padding', () => {
    const laid = layeredLayout(graph);
    const fit = fitToView(laid.nodes, 1200, 800);
    const xs = laid.nodes.map((n) => n.x * fit.scale + fit.offsetX);
    const ys = laid.nodes.map((n) => n.y * fit.scale + fit.offsetY);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    expect(minX).toBeGreaterThan(50);
    expect(minY).toBeGreaterThan(50);
    expect(maxX).toBeLessThan(1200 - 50);
    expect(maxY).toBeLessThan(800 - 50);
  });

  it('re-centers layout around origin', () => {
    const laid = layeredLayout(graph);
    const avgX = laid.nodes.reduce((acc, n) => acc + n.x, 0) / laid.nodes.length;
    const avgY = laid.nodes.reduce((acc, n) => acc + n.y, 0) / laid.nodes.length;
    expect(Math.abs(avgX)).toBeLessThan(1e-6);
    expect(Math.abs(avgY)).toBeLessThan(1e-6);
  });
});

describe('strongly connected hotspots', () => {
  const graph: Graph = {
    nodes: [
      { id: '//cycle:a', label: 'A' },
      { id: '//cycle:b', label: 'B' },
      { id: '//cycle:c', label: 'C' },
      { id: '//chain:d', label: 'D' },
    ],
    edges: [
      { source: '//cycle:a', target: '//cycle:b' },
      { source: '//cycle:b', target: '//cycle:c' },
      { source: '//cycle:c', target: '//cycle:a' },
      { source: '//cycle:c', target: '//chain:d' },
    ],
  };

  it('marks cyclic SCCs as hotspots and clusters them in the same component', () => {
    const laid = layeredLayout(graph);
    const cycleNodes = ['//cycle:a', '//cycle:b', '//cycle:c'].map((id) => laid.idToNode.get(id)!);

    // All cycle members should be hotspots; hotspotCount counts nodes
    expect(cycleNodes.every((n) => n.isHotspot)).toBe(true);
    expect(laid.hotspotCount).toBe(3);
    expect(laid.largestHotspotSize).toBe(3);
    // All cycle members share the same SCC
    expect(new Set(cycleNodes.map((n) => n.sccId)).size).toBe(1);
    expect(new Set(cycleNodes.map((n) => n.sccSize))).toEqual(new Set([3]));
  });

  it('uses hotspot scores when hotspot sizing mode is enabled', () => {
    const laid = layeredLayout(graph);
    recalculateWeights(laid, 'hotspots');

    const hotspotNode = laid.idToNode.get('//cycle:a');
    const nonHotspotNode = laid.idToNode.get('//chain:d');

    // Cycle members get an SCC bonus on top of transitiveInDegree, so they outweigh chain:d
    expect(hotspotNode?.weight).toBeGreaterThan(nonHotspotNode?.weight ?? 0);
    expect(nonHotspotNode?.isHotspot).toBe(false);
  });
});
