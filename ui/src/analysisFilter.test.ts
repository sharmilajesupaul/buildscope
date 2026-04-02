import { describe, expect, it } from 'vitest';
import { getVisibleAnalysisEntries, matchesAnalysisQuery } from './analysisFilter';
import type { AnalysisEntry } from './graphAnalysis';

const entries: AnalysisEntry[] = [
  {
    id: '@aspect_rules_js//npm/private/lifecycle:lifecycle-hooks',
    label: '@aspect_rules_js//npm/private/lifecycle:lifecycle-hooks',
    score: 172,
    summary: '658 dependents · 13 inputs · score 172',
  },
  {
    id: '//angular:angular',
    label: '//angular:angular',
    score: 60,
    summary: '16 dependents · 4 direct deps · score 60',
  },
  {
    id: '//angular/projects/my-lib:_my-lib.ng_binary',
    label: '//angular/projects/my-lib:_my-lib.ng_binary',
    score: 57,
    summary: '11 dependents · 3 direct deps · score 57',
  },
];

describe('analysisFilter', () => {
  it('matches exact rank tokens', () => {
    expect(matchesAnalysisQuery(entries[1], 2, '#2')).toBe(true);
    expect(matchesAnalysisQuery(entries[1], 2, 'rank:2')).toBe(true);
    expect(matchesAnalysisQuery(entries[1], 2, '#3')).toBe(false);
  });

  it('matches normalized term searches across punctuation', () => {
    expect(matchesAnalysisQuery(entries[0], 1, 'lifecycle hooks')).toBe(true);
    expect(matchesAnalysisQuery(entries[2], 3, 'my lib ng binary')).toBe(true);
    expect(matchesAnalysisQuery(entries[1], 2, 'react router')).toBe(false);
  });

  it('returns all filtered matches and only top entries when unfiltered', () => {
    const unfiltered = getVisibleAnalysisEntries(entries, '', 2);
    expect(unfiltered.visible).toHaveLength(2);
    expect(unfiltered.filteredCount).toBe(3);
    expect(unfiltered.totalCount).toBe(3);

    const filtered = getVisibleAnalysisEntries(entries, 'angular', 2);
    expect(filtered.visible.map(({ rank }) => rank)).toEqual([2, 3]);
    expect(filtered.filteredCount).toBe(2);
    expect(filtered.isFiltered).toBe(true);
  });
});
