import type { AnalysisEntry } from './graphAnalysis';

export type RankedAnalysisEntry = {
  entry: AnalysisEntry;
  rank: number;
};

type VisibleAnalysisEntries = {
  visible: RankedAnalysisEntry[];
  filteredCount: number;
  totalCount: number;
  isFiltered: boolean;
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@#/:._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesQueryToken(entry: AnalysisEntry, rank: number, token: string): boolean {
  const rankMatch = token.match(/^(?:#|rank:)?(\d+)$/);
  if (rankMatch) {
    return String(rank) === rankMatch[1];
  }

  const rawNeedle = token.toLowerCase();
  const normalizedNeedle = normalizeSearchText(token);
  const rawHaystack = `${entry.id} ${entry.label} ${entry.summary}`.toLowerCase();
  const normalizedHaystack = normalizeSearchText(rawHaystack);

  return rawHaystack.includes(rawNeedle) || normalizedHaystack.includes(normalizedNeedle);
}

export function matchesAnalysisQuery(entry: AnalysisEntry, rank: number, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((token) => matchesQueryToken(entry, rank, token));
}

export function getVisibleAnalysisEntries(
  entries: AnalysisEntry[],
  query: string,
  unfilteredLimit = 6
): VisibleAnalysisEntries {
  const rankedEntries = entries.map((entry, index) => ({ entry, rank: index + 1 }));
  const isFiltered = Boolean(query.trim());
  const filtered = rankedEntries.filter(({ entry, rank }) => matchesAnalysisQuery(entry, rank, query));

  return {
    visible: isFiltered ? filtered : filtered.slice(0, unfilteredLimit),
    filteredCount: filtered.length,
    totalCount: rankedEntries.length,
    isFiltered,
  };
}
