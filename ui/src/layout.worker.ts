import { sanitizeGraph, layeredLayout, Graph } from './graphLayout';

self.onmessage = (e: MessageEvent<Graph>) => {
  const g = e.data;
  
  // 1. Sanitize
  const clean = sanitizeGraph(g);
  
  // 2. Compute Layout
  // We can send progress updates if we want, but for now just do the work
  // Post message to indicate large graph processing if needed?
  // For now, let's just do the calculation.
  
  const start = performance.now();
  const positioned = layeredLayout(clean);
  const end = performance.now();
  
  console.log(`Worker: Layout computed in ${(end - start).toFixed(0)}ms`);
  
  self.postMessage({
    type: 'layout-complete',
    positioned,
    stats: {
      nodes: clean.nodes.length,
      edges: clean.edges.length,
      time: end - start
    }
  });
};
