import { sanitizeGraph, layeredLayout, type Graph } from './graphLayout';

// Runs the full layout pipeline (sanitize → layout → SCC → hotspots) in a worker
// so the main thread never freezes during computation.
self.onmessage = (e: MessageEvent<Graph>) => {
  try {
    const clean = sanitizeGraph(e.data);
    const pg = layeredLayout(clean);
    // postMessage only serializable fields — Maps are reconstructed on the main thread
    self.postMessage({
      nodes: pg.nodes,
      edges: pg.edges,
      hotspotCount: pg.hotspotCount,
      largestHotspotSize: pg.largestHotspotSize,
    });
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
