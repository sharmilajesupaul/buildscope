import type { PositionedNode } from './graphLayout';

export type AnalysisEntry = {
  id: string;
  label: string;
  score: number;
  summary: string;
};

type BackendTargetSurface = {
  id: string;
  label?: string;
  sourceFileCount?: number;
  sourceBytes?: number;
  inputFileCount?: number;
  inputBytes?: number;
  outputFileCount?: number;
  outputBytes?: number;
  actionCount?: number;
};

type BackendImpactTarget = BackendTargetSurface & {
  transitiveInDegree?: number;
  outDegree?: number;
  transitiveOutDegree?: number;
  hotspotRank?: number;
};

type BackendBreakupCandidate = BackendTargetSurface & {
  pressure?: number;
  transitiveInDegree?: number;
  outDegree?: number;
  transitiveOutDegree?: number;
  recommendations?: string[];
  directDependencySample?: string[];
};

export type BuildScopeAnalysisResponse = {
  topImpactTargets?: BackendImpactTarget[];
  topBreakupCandidates?: BackendBreakupCandidate[];
  topSourceHeavyTargets?: BackendTargetSurface[];
  topOutputHeavyTargets?: BackendTargetSurface[];
};

function isRuleNode(node: Pick<PositionedNode, 'nodeType'>): boolean {
  return !node.nodeType || node.nodeType === 'rule';
}

function formatBytes(bytes: number | undefined): string {
  const value = bytes ?? 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

export function getBreakupCandidateScore(
  node: Pick<
    PositionedNode,
    'transitiveInDegree' | 'outDegree' | 'inputFileCount' | 'outputFileCount' | 'actionCount'
  >
): number {
  const pressure = Math.log2(node.transitiveInDegree + 1) * Math.max(1, node.outDegree);
  const surfaceBoost =
    Math.log2((node.inputFileCount ?? 0) + 1) +
    Math.log2((node.outputFileCount ?? 0) + 1) +
    Math.log2((node.actionCount ?? 0) + 1);
  return pressure + surfaceBoost;
}

export function formatAnalysisScore(score: number): string {
  return score >= 10 ? score.toFixed(0) : score.toFixed(1);
}

function joinSummaryParts(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

function analysisLabel(entry: Pick<BackendTargetSurface, 'id' | 'label'>): string {
  return entry.label?.trim() || entry.id;
}

export function getTopImpactTargets(nodes: PositionedNode[], limit = 8): AnalysisEntry[] {
  return [...nodes]
    .filter((node) => isRuleNode(node) && node.transitiveInDegree > 0)
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
    .filter((node) => isRuleNode(node) && node.transitiveInDegree > 0 && node.outDegree > 0)
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
      summary: `${node.transitiveInDegree} dependents · ${node.inputFileCount ?? 0} inputs · ${node.outputFileCount ?? 0} outputs · score ${formatAnalysisScore(getBreakupCandidateScore(node))}`,
    }));
}

export function getTopSourceHeavyTargets(nodes: PositionedNode[], limit = 8): AnalysisEntry[] {
  return [...nodes]
    .filter((node) => isRuleNode(node) && (node.sourceBytes ?? 0) > 0)
    .sort((a, b) =>
      (b.sourceBytes ?? 0) - (a.sourceBytes ?? 0) ||
      (b.sourceFileCount ?? 0) - (a.sourceFileCount ?? 0) ||
      a.label.localeCompare(b.label)
    )
    .slice(0, limit)
    .map((node) => ({
      id: node.id,
      label: node.label,
      score: node.sourceBytes ?? 0,
      summary: `${node.sourceFileCount ?? 0} source files · ${formatBytes(node.sourceBytes)} sources`,
    }));
}

export function getTopInputHeavyTargets(nodes: PositionedNode[], limit = 8): AnalysisEntry[] {
  return [...nodes]
    .filter((node) => isRuleNode(node) && ((node.inputBytes ?? 0) > 0 || (node.inputFileCount ?? 0) > 0))
    .sort((a, b) =>
      (b.inputBytes ?? 0) - (a.inputBytes ?? 0) ||
      (b.inputFileCount ?? 0) - (a.inputFileCount ?? 0) ||
      (b.sourceBytes ?? 0) - (a.sourceBytes ?? 0) ||
      a.label.localeCompare(b.label)
    )
    .slice(0, limit)
    .map((node) => ({
      id: node.id,
      label: node.label,
      score: node.inputBytes ?? node.inputFileCount ?? 0,
      summary: `${node.inputFileCount ?? 0} inputs · ${formatBytes(node.inputBytes)} inputs · ${node.sourceFileCount ?? 0} source files`,
    }));
}

export function getTopOutputHeavyTargets(nodes: PositionedNode[], limit = 8): AnalysisEntry[] {
  return [...nodes]
    .filter((node) => isRuleNode(node) && ((node.outputBytes ?? 0) > 0 || (node.outputFileCount ?? 0) > 0))
    .sort((a, b) =>
      (b.outputBytes ?? 0) - (a.outputBytes ?? 0) ||
      (b.outputFileCount ?? 0) - (a.outputFileCount ?? 0) ||
      (b.actionCount ?? 0) - (a.actionCount ?? 0) ||
      a.label.localeCompare(b.label)
    )
    .slice(0, limit)
    .map((node) => ({
      id: node.id,
      label: node.label,
      score: node.outputBytes ?? node.outputFileCount ?? 0,
      summary: `${node.outputFileCount ?? 0} outputs · ${formatBytes(node.outputBytes)} outputs · ${node.actionCount ?? 0} actions`,
    }));
}

export function getTopImpactTargetsFromAnalysis(
  analysis: BuildScopeAnalysisResponse,
  limit = 8
): AnalysisEntry[] {
  return (analysis.topImpactTargets ?? []).slice(0, limit).map((entry) => ({
    id: entry.id,
    label: analysisLabel(entry),
    score: entry.transitiveInDegree ?? 0,
    summary: joinSummaryParts([
      `${entry.transitiveInDegree ?? 0} dependents`,
      `${entry.outDegree ?? 0} direct deps`,
      `${entry.transitiveOutDegree ?? 0} transitive deps`,
    ]),
  }));
}

export function getTopBreakupCandidatesFromAnalysis(
  analysis: BuildScopeAnalysisResponse,
  limit = 8
): AnalysisEntry[] {
  return (analysis.topBreakupCandidates ?? []).slice(0, limit).map((entry) => ({
    id: entry.id,
    label: analysisLabel(entry),
    score: entry.pressure ?? 0,
    summary: joinSummaryParts([
      `${entry.transitiveInDegree ?? 0} dependents`,
      `${entry.outDegree ?? 0} direct deps`,
      entry.recommendations?.find(Boolean) ??
        (entry.pressure !== undefined ? `score ${formatAnalysisScore(entry.pressure)}` : undefined),
    ]),
  }));
}

export function getTopSourceHeavyTargetsFromAnalysis(
  analysis: BuildScopeAnalysisResponse,
  limit = 8
): AnalysisEntry[] {
  return (analysis.topSourceHeavyTargets ?? []).slice(0, limit).map((entry) => ({
    id: entry.id,
    label: analysisLabel(entry),
    score: entry.sourceBytes ?? entry.sourceFileCount ?? 0,
    summary: `${entry.sourceFileCount ?? 0} source files · ${formatBytes(entry.sourceBytes)} sources`,
  }));
}

export function getTopOutputHeavyTargetsFromAnalysis(
  analysis: BuildScopeAnalysisResponse,
  limit = 8
): AnalysisEntry[] {
  return (analysis.topOutputHeavyTargets ?? []).slice(0, limit).map((entry) => ({
    id: entry.id,
    label: analysisLabel(entry),
    score: entry.outputBytes ?? entry.outputFileCount ?? 0,
    summary: `${entry.outputFileCount ?? 0} outputs · ${formatBytes(entry.outputBytes)} outputs · ${entry.actionCount ?? 0} actions`,
  }));
}
