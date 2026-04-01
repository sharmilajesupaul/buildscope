// Rendering thresholds
export const LARGE_GRAPH_THRESHOLD = 1000;
export const VIEWPORT_PADDING = 200;

// Zoom settings
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 3;
export const ZOOM_FACTOR = 1.1;

// Visual settings
export const EDGE_VISIBILITY_THRESHOLD = 0.2;

export type ThemeName = 'dark' | 'light' | 'colorblind';

export type GraphPalette = {
  edgeBase: number;
  edgeFocus: number;
  edgeSelected: number;
  nodeDefault: number;
  nodeDefaultHalo: number;
  nodeImpact: number;
  nodeImpactHalo: number;
  nodeSelected: number;
  nodeSelectedRing: number;
  nodeHoverRing: number;
};

export const DEFAULT_THEME: ThemeName = 'dark';
export const THEME_STORAGE_KEY = 'buildscope.theme';

const FALLBACK_GRAPH_PALETTE: Record<keyof GraphPalette, string> = {
  edgeBase: '#53698d',
  edgeFocus: '#f0b14a',
  edgeSelected: '#78c7ff',
  nodeDefault: '#93a6c3',
  nodeDefaultHalo: '#637a9a',
  nodeImpact: '#ff8d6a',
  nodeImpactHalo: '#ffb195',
  nodeSelected: '#f7fbff',
  nodeSelectedRing: '#4fd1ff',
  nodeHoverRing: '#ffd480',
};

function normalizeHex(rawValue: string, fallback: string): string {
  const value = rawValue.trim() || fallback;
  if (!value.startsWith('#')) return fallback;
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  if (value.length === 7) return value;
  return fallback;
}

function hexToNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function readCssHex(variableName: string, fallback: string): number {
  const computedValue = typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue(variableName)
    : '';
  return hexToNumber(normalizeHex(computedValue, fallback));
}

export function getGraphPalette(): GraphPalette {
  return {
    edgeBase: readCssHex('--graph-edge-base', FALLBACK_GRAPH_PALETTE.edgeBase),
    edgeFocus: readCssHex('--graph-edge-focus', FALLBACK_GRAPH_PALETTE.edgeFocus),
    edgeSelected: readCssHex('--graph-edge-selected', FALLBACK_GRAPH_PALETTE.edgeSelected),
    nodeDefault: readCssHex('--graph-node-default', FALLBACK_GRAPH_PALETTE.nodeDefault),
    nodeDefaultHalo: readCssHex('--graph-node-default-halo', FALLBACK_GRAPH_PALETTE.nodeDefaultHalo),
    nodeImpact: readCssHex('--graph-node-impact', FALLBACK_GRAPH_PALETTE.nodeImpact),
    nodeImpactHalo: readCssHex('--graph-node-impact-halo', FALLBACK_GRAPH_PALETTE.nodeImpactHalo),
    nodeSelected: readCssHex('--graph-node-selected', FALLBACK_GRAPH_PALETTE.nodeSelected),
    nodeSelectedRing: readCssHex('--graph-node-selected-ring', FALLBACK_GRAPH_PALETTE.nodeSelectedRing),
    nodeHoverRing: readCssHex('--graph-node-hover-ring', FALLBACK_GRAPH_PALETTE.nodeHoverRing),
  };
}

export function isThemeName(value: string): value is ThemeName {
  return value === 'dark' || value === 'light' || value === 'colorblind';
}

export function loadThemePreference(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored && isThemeName(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeName, persist = true): void {
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.theme = theme;

  if (!persist || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}
