import type { Graph } from './graphLayout';
import type { BuildScopeAnalysisResponse, BuildScopeDecompositionResponse } from './graphAnalysis';

async function fetchJSON<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`failed to load ${path}`);
  return (await response.json()) as T;
}

async function fetchGraph(graphPath: string): Promise<Graph> {
  return fetchJSON<Graph>(graphPath);
}

export async function loadGraph(): Promise<Graph> {
  try {
    return await fetchGraph('graph.json');
  } catch {
    return fetchGraph('sample-graph.json');
  }
}

export async function loadAnalysis(limit = 15): Promise<BuildScopeAnalysisResponse | null> {
  try {
    return await fetchJSON<BuildScopeAnalysisResponse>(`analysis.json?top=${limit}`);
  } catch {
    return null;
  }
}

export async function loadTargetDecomposition(target: string): Promise<BuildScopeDecompositionResponse | null> {
  try {
    return await fetchJSON<BuildScopeDecompositionResponse>(
      `decomposition.json?target=${encodeURIComponent(target)}`
    );
  } catch {
    return null;
  }
}
