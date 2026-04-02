import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAnalysis, loadGraph, loadTargetDecomposition } from './graphLoader';
import type { Graph } from './graphLayout';

describe('loadGraph', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns /graph.json when the primary graph is available', async () => {
    const graph: Graph = {
      nodes: [{ id: '//app:bin', label: '//app:bin' }],
      edges: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => graph,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadGraph()).resolves.toEqual(graph);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/graph.json');
  });

  it('returns graph metadata untouched when the graph carries detailsPath', async () => {
    const graph: Graph = {
      detailsPath: 'graph.details.json',
      nodes: [{ id: '//app:bin', label: '//app:bin' }],
      edges: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => graph,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadGraph()).resolves.toEqual(graph);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to /sample-graph.json when /graph.json throws', async () => {
    const fallback: Graph = {
      nodes: [{ id: '//demo:sample', label: '//demo:sample' }],
      edges: [],
    };

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('missing graph'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fallback,
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadGraph()).resolves.toEqual(fallback);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/graph.json');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/sample-graph.json');
  });

  it('falls back to /sample-graph.json when /graph.json returns a non-ok response', async () => {
    const fallback: Graph = {
      nodes: [{ id: '//demo:fallback', label: '//demo:fallback' }],
      edges: [{ source: '//demo:fallback', target: '//demo:fallback' }],
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fallback,
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadGraph()).resolves.toEqual(fallback);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/graph.json');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/sample-graph.json');
  });
});

describe('loadAnalysis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns backend analysis when /analysis.json is available', async () => {
    const analysis = {
      topImpactTargets: [{ id: '//pkg:lib', label: '//pkg:lib', transitiveInDegree: 7 }],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => analysis,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadAnalysis(12)).resolves.toEqual(analysis);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/analysis.json?top=12');
  });

  it('returns null when /analysis.json is unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadAnalysis()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/analysis.json?top=15');
  });
});

describe('loadTargetDecomposition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns focused decomposition when /decomposition.json is available', async () => {
    const decomposition = {
      target: '//pkg:hub',
      label: '//pkg:hub',
      eligible: true,
      communityCount: 2,
      directDependencyCount: 4,
      directRuleDependencyCount: 4,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => decomposition,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadTargetDecomposition('//pkg:hub')).resolves.toEqual(decomposition);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/decomposition.json?target=%2F%2Fpkg%3Ahub'
    );
  });

  it('returns null when /decomposition.json is unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadTargetDecomposition('//pkg:hub')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
