import { describe, expect, it } from 'vitest';
import {
  formatAnalysisScore,
  getBreakupCandidateScore,
  getTopBreakupCandidates,
  getTopBreakupCandidatesFromAnalysis,
  getTopImpactTargets,
  getTopImpactTargetsFromAnalysis,
  getTopInputHeavyTargets,
  getTopOutputHeavyTargets,
  getTopOutputHeavyTargetsFromAnalysis,
  getTopSourceHeavyTargets,
  getTopSourceHeavyTargetsFromAnalysis,
} from './graphAnalysis';
import type { PositionedNode } from './graphLayout';

function makeNode(partial: Partial<PositionedNode> & Pick<PositionedNode, 'id' | 'label'>): PositionedNode {
  return {
    id: partial.id,
    label: partial.label,
    nodeType: partial.nodeType,
    ruleKind: partial.ruleKind,
    packageName: partial.packageName,
    sourceFileCount: partial.sourceFileCount ?? 0,
    sourceBytes: partial.sourceBytes ?? 0,
    inputFileCount: partial.inputFileCount ?? 0,
    inputBytes: partial.inputBytes ?? 0,
    outputFileCount: partial.outputFileCount ?? 0,
    outputBytes: partial.outputBytes ?? 0,
    actionCount: partial.actionCount ?? 0,
    mnemonicSummary: partial.mnemonicSummary ?? [],
    topFiles: partial.topFiles ?? [],
    topOutputs: partial.topOutputs ?? [],
    details: partial.details,
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
    const hub = makeNode({
      id: '//hub',
      label: 'Hub',
      transitiveInDegree: 12,
      outDegree: 4,
      inputFileCount: 8,
      outputFileCount: 2,
      actionCount: 6,
    });
    const leaf = makeNode({ id: '//leaf', label: 'Leaf', transitiveInDegree: 12, outDegree: 0 });
    const bridge = makeNode({
      id: '//bridge',
      label: 'Bridge',
      transitiveInDegree: 7,
      outDegree: 2,
      inputFileCount: 2,
      outputFileCount: 1,
      actionCount: 2,
    });

    const entries = getTopBreakupCandidates([leaf, bridge, hub]);

    expect(getBreakupCandidateScore(hub)).toBeGreaterThan(getBreakupCandidateScore(bridge));
    expect(entries.map((entry) => entry.id)).toEqual(['//hub', '//bridge']);
    expect(entries[0].summary).toContain('score');
  });

  it('ignores file nodes in rankings and exposes source-heavy targets', () => {
    const sourceTarget = makeNode({
      id: '//app:lib',
      label: 'Lib',
      nodeType: 'rule',
      sourceFileCount: 12,
      sourceBytes: 4096,
    });
    const fileNode = makeNode({
      id: '//app:main.ts',
      label: 'main.ts',
      nodeType: 'source-file',
      sourceFileCount: 999,
      sourceBytes: 999999,
    });

    const entries = getTopSourceHeavyTargets([fileNode, sourceTarget]);
    expect(entries.map((entry) => entry.id)).toEqual(['//app:lib']);
    expect(entries[0].summary).toContain('source files');
  });

  it('ranks output-heavy targets by bytes then file count', () => {
    const entries = getTopOutputHeavyTargets([
      makeNode({ id: '//a', label: 'A', outputBytes: 512, outputFileCount: 1, actionCount: 1 }),
      makeNode({ id: '//b', label: 'B', outputBytes: 4096, outputFileCount: 2, actionCount: 4 }),
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(['//b', '//a']);
    expect(entries[0].summary).toContain('outputs');
  });

  it('ranks input-heavy targets by bytes then file count', () => {
    const entries = getTopInputHeavyTargets([
      makeNode({ id: '//a', label: 'A', inputBytes: 512, inputFileCount: 6, sourceFileCount: 2 }),
      makeNode({ id: '//b', label: 'B', inputBytes: 4096, inputFileCount: 2, sourceFileCount: 5 }),
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(['//b', '//a']);
    expect(entries[0].summary).toContain('inputs');
  });

  it('formats analysis scores compactly', () => {
    expect(formatAnalysisScore(2.345)).toBe('2.3');
    expect(formatAnalysisScore(12.345)).toBe('12');
  });

  it('maps backend impact and breakup rankings into analysis entries', () => {
    const analysis = {
      topImpactTargets: [
        {
          id: '//pkg:impact',
          label: '//pkg:impact',
          transitiveInDegree: 14,
          outDegree: 3,
          transitiveOutDegree: 8,
        },
      ],
      topBreakupCandidates: [
        {
          id: '//pkg:hub',
          label: '//pkg:hub',
          pressure: 21.2,
          transitiveInDegree: 11,
          outDegree: 6,
          recommendations: ['Reduce direct dependency fan-out.'],
        },
      ],
    };

    const impactEntries = getTopImpactTargetsFromAnalysis(analysis);
    const breakupEntries = getTopBreakupCandidatesFromAnalysis(analysis);

    expect(impactEntries[0]).toMatchObject({
      id: '//pkg:impact',
      score: 14,
    });
    expect(impactEntries[0].summary).toContain('14 dependents');
    expect(breakupEntries[0].summary).toContain('Reduce direct dependency fan-out.');
  });

  it('maps backend source and output rankings into analysis entries', () => {
    const analysis = {
      topSourceHeavyTargets: [
        {
          id: '//pkg:srcs',
          label: '//pkg:srcs',
          sourceFileCount: 12,
          sourceBytes: 8192,
        },
      ],
      topOutputHeavyTargets: [
        {
          id: '//pkg:gen',
          label: '//pkg:gen',
          outputFileCount: 4,
          outputBytes: 16384,
          actionCount: 9,
        },
      ],
    };

    const sourceEntries = getTopSourceHeavyTargetsFromAnalysis(analysis);
    const outputEntries = getTopOutputHeavyTargetsFromAnalysis(analysis);

    expect(sourceEntries[0].summary).toContain('source files');
    expect(outputEntries[0].summary).toContain('actions');
  });
});
