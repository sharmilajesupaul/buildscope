import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGraph } from './graphLoader';
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
