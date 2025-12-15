import { Graph } from './graphLayout';

export async function loadGraph(): Promise<Graph> {
  try {
    const res = await fetch('/graph.json');
    if (!res.ok) throw new Error('fallback');
    return res.json();
  } catch {
    const res = await fetch('/sample-graph.json');
    return res.json();
  }
}
