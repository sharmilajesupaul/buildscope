import type { PositionedNode } from './graphLayout';

export type AnalysisEntry = {
  id: string;
  label: string;
  score: number;
  summary: string;
};

export function getBreakupCandidateScore(
  node: Pick<PositionedNode, 'transitiveInDegree' | 'outDegree'>
): number {
  return Math.log2(node.transitiveInDegree + 1) * Math.max(1, node.outDegree);
}

export function formatAnalysisScore(score: number): string {
  return score >= 10 ? score.toFixed(0) : score.toFixed(1);
}

export function getTopImpactTargets(nodes: PositionedNode[], limit = 8): AnalysisEntry[] {
  return [...nodes]
    .filter((node) => node.transitiveInDegree > 0)
    .sort((a, b) =>
      b.transitiveInDegree - a.transitiveInDegree ||
      b.outDegree - a.outDegree ||
      a.label.localeCompare(b.label)
    )
    .slice(0, limit)
    .map((node) => ({
      id: node.id,
      label: node.label,
      score: node.transitiveInDegree,
      summary: `${node.transitiveInDegree} dependents · ${node.outDegree} direct deps · ${node.transitiveOutDegree} transitive deps`,
    }));
}

export function getTopBreakupCandidates(nodes: PositionedNode[], limit = 8): AnalysisEntry[] {
  return [...nodes]
    .filter((node) => node.transitiveInDegree > 0 && node.outDegree > 0)
    .sort((a, b) =>
      getBreakupCandidateScore(b) - getBreakupCandidateScore(a) ||
      b.transitiveInDegree - a.transitiveInDegree ||
      b.outDegree - a.outDegree ||
      a.label.localeCompare(b.label)
    )
    .slice(0, limit)
    .map((node) => ({
      id: node.id,
      label: node.label,
      score: getBreakupCandidateScore(node),
      summary: `${node.transitiveInDegree} dependents · ${node.outDegree} direct deps · score ${formatAnalysisScore(getBreakupCandidateScore(node))}`,
    }));
}
