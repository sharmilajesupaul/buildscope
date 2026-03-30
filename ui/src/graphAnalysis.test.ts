import { describe, expect, it } from 'vitest';
import {
  formatAnalysisScore,
  getBreakupCandidateScore,
  getTopBreakupCandidates,
  getTopImpactTargets,
} from './graphAnalysis';
import type { PositionedNode } from './graphLayout';

function makeNode(partial: Partial<PositionedNode> & Pick<PositionedNode, 'id' | 'label'>): PositionedNode {
  return {
    id: partial.id,
    label: partial.label,
    x: 0,
    y: 0,
    inDegree: partial.inDegree ?? 0,
    outDegree: partial.outDegree ?? 0,
    transitiveInDegree: partial.transitiveInDegree ?? 0,
    transitiveOutDegree: partial.transitiveOutDegree ?? 0,
    weight: partial.weight ?? 0,
    sccId: partial.sccId ?? -1,
    sccSize: partial.sccSize ?? 1,
    hotspotScore: partial.hotspotScore ?? 0,
    hotspotRank: partial.hotspotRank ?? 0,
    isHotspot: partial.isHotspot ?? false,
  };
}

describe('graphAnalysis', () => {
  it('prefers highest dependent count for impact targets', () => {
    const entries = getTopImpactTargets([
      makeNode({ id: '//a', label: 'A', transitiveInDegree: 8, outDegree: 1, transitiveOutDegree: 4 }),
      makeNode({ id: '//b', label: 'B', transitiveInDegree: 3, outDegree: 9, transitiveOutDegree: 11 }),
      makeNode({ id: '//c', label: 'C', transitiveInDegree: 0, outDegree: 4, transitiveOutDegree: 6 }),
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(['//a', '//b']);
    expect(entries[0].summary).toContain('8 dependents');
  });

  it('ranks broad hubs above narrow shared leaves for breakup candidates', () => {
    const hub = makeNode({ id: '//hub', label: 'Hub', transitiveInDegree: 12, outDegree: 4 });
    const leaf = makeNode({ id: '//leaf', label: 'Leaf', transitiveInDegree: 12, outDegree: 0 });
    const bridge = makeNode({ id: '//bridge', label: 'Bridge', transitiveInDegree: 7, outDegree: 2 });

    const entries = getTopBreakupCandidates([leaf, bridge, hub]);

    expect(getBreakupCandidateScore(hub)).toBeGreaterThan(getBreakupCandidateScore(bridge));
    expect(entries.map((entry) => entry.id)).toEqual(['//hub', '//bridge']);
    expect(entries[0].summary).toContain('score');
  });

  it('formats analysis scores compactly', () => {
    expect(formatAnalysisScore(2.345)).toBe('2.3');
    expect(formatAnalysisScore(12.345)).toBe('12');
  });
});
