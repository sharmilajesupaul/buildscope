export interface ThemeColors {
  // UI Colors (mapped to CSS variables)
  bgPrimary: string;
  bgSecondary: string;
  bgElevated: string;
  bgOverlay: string;

  surfacePrimary: string;
  surfaceSecondary: string;
  surfaceHover: string;

  borderSubtle: string;
  borderMedium: string;
  borderStrong: string;

  accentPrimary: string;
  accentSecondary: string;
  accentBright: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Graph Colors (Hex numbers for PixiJS)
  graphNode: number;
  graphNodeHighlight: number;
  graphEdge: number;
  graphEdgeHighlight: number;

  // Graph Colors (CSS strings for Legend)
  graphNodeCss: string;
  graphEdgeCss: string;
  graphEdgeHighlightCss: string;
}

export interface Theme {
  id: string;
  label: string;
  type: 'light' | 'dark';
  colors: ThemeColors;
}

const commonColors = {
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
};

export const THEMES: Theme[] = [
  // --- DARK THEMES ---
  {
    id: 'midnight-calm',
    label: 'Midnight Calm',
    type: 'dark',
    colors: {
      bgPrimary: '#0a0e14',
      bgSecondary: '#0f1419',
      bgElevated: '#141a21',
      bgOverlay: 'rgba(15, 20, 25, 0.92)',
      surfacePrimary: '#1a2332',
      surfaceSecondary: '#232d3f',
      surfaceHover: '#2a3648',
      borderSubtle: 'rgba(99, 142, 205, 0.12)',
      borderMedium: 'rgba(99, 142, 205, 0.24)',
      borderStrong: 'rgba(99, 142, 205, 0.36)',
      accentPrimary: '#5b9eff',
      accentSecondary: '#7eb4ff',
      accentBright: '#a0c9ff',
      textPrimary: '#e6edf5',
      textSecondary: '#9fb5d0',
      textMuted: '#6a829e',

      graphNode: 0xffc857,
      graphNodeHighlight: 0xffd98e,
      graphEdge: 0x5b9eff,
      graphEdgeHighlight: 0xffc857,

      graphNodeCss: '#ffc857',
      graphEdgeCss: 'rgba(91, 158, 255, 0.35)',
      graphEdgeHighlightCss: '#ffc857',
    },
  },
  {
    id: 'deep-ocean',
    label: 'Deep Ocean',
    type: 'dark',
    colors: {
      bgPrimary: '#001219',
      bgSecondary: '#001824',
      bgElevated: '#002838',
      bgOverlay: 'rgba(0, 18, 25, 0.95)',
      surfacePrimary: '#003049',
      surfaceSecondary: '#004e66',
      surfaceHover: '#006d77',
      borderSubtle: 'rgba(102, 155, 188, 0.15)',
      borderMedium: 'rgba(102, 155, 188, 0.3)',
      borderStrong: 'rgba(102, 155, 188, 0.45)',
      accentPrimary: '#94d2bd',
      accentSecondary: '#ee9b00',
      accentBright: '#e9d8a6',
      textPrimary: '#edf6f9',
      textSecondary: '#83c5be',
      textMuted: '#006d77',

      graphNode: 0xe9d8a6,
      graphNodeHighlight: 0xee9b00,
      graphEdge: 0x94d2bd,
      graphEdgeHighlight: 0xca6702,

      graphNodeCss: '#e9d8a6',
      graphEdgeCss: 'rgba(148, 210, 189, 0.4)',
      graphEdgeHighlightCss: '#ca6702',
    },
  },
  {
    id: 'forest-night',
    label: 'Forest Night',
    type: 'dark',
    colors: {
      bgPrimary: '#1b261a', // really dark green
      bgSecondary: '#253324',
      bgElevated: '#2f402d',
      bgOverlay: 'rgba(27, 38, 26, 0.95)',
      surfacePrimary: '#3a4f38',
      surfaceSecondary: '#4a6347',
      surfaceHover: '#5c7a59',
      borderSubtle: 'rgba(149, 172, 144, 0.15)',
      borderMedium: 'rgba(149, 172, 144, 0.3)',
      borderStrong: 'rgba(149, 172, 144, 0.45)',
      accentPrimary: '#95ac90', // sage
      accentSecondary: '#b7c4b4',
      accentBright: '#d8e0d6',
      textPrimary: '#eaece9',
      textSecondary: '#b0b8af',
      textMuted: '#788277',

      graphNode: 0xd9ae84, // wood-ish
      graphNodeHighlight: 0xe8cba8,
      graphEdge: 0x95ac90,
      graphEdgeHighlight: 0xd9ae84,

      graphNodeCss: '#d9ae84',
      graphEdgeCss: 'rgba(149, 172, 144, 0.4)',
      graphEdgeHighlightCss: '#d9ae84',
    },
  },

  // --- LIGHT THEMES ---
  {
    id: 'soft-day',
    label: 'Soft Day',
    type: 'light',
    colors: {
      bgPrimary: '#f8f9fa',
      bgSecondary: '#ffffff',
      bgElevated: '#ffffff',
      bgOverlay: 'rgba(255, 255, 255, 0.9)',
      surfacePrimary: '#e9ecef',
      surfaceSecondary: '#dee2e6',
      surfaceHover: '#ced4da',
      borderSubtle: 'rgba(0, 0, 0, 0.08)',
      borderMedium: 'rgba(0, 0, 0, 0.16)',
      borderStrong: 'rgba(0, 0, 0, 0.24)',
      accentPrimary: '#0d6efd',
      accentSecondary: '#3d8bfd',
      accentBright: '#6ea8fe',
      textPrimary: '#212529',
      textSecondary: '#495057',
      textMuted: '#6c757d',

      graphNode: 0xffb703, // bright yellow/orange
      graphNodeHighlight: 0xfb8500,
      graphEdge: 0xadb5bd, // grey
      graphEdgeHighlight: 0x023047,

      graphNodeCss: '#ffb703',
      graphEdgeCss: 'rgba(173, 181, 189, 0.6)',
      graphEdgeHighlightCss: '#023047',
    },
  },
  {
    id: 'morning-mist',
    label: 'Morning Mist',
    type: 'light',
    colors: {
      bgPrimary: '#eff3f5',
      bgSecondary: '#ffffff',
      bgElevated: '#ffffff',
      bgOverlay: 'rgba(239, 243, 245, 0.92)',
      surfacePrimary: '#e2e7eb',
      surfaceSecondary: '#d0d8de',
      surfaceHover: '#c1cdd5',
      borderSubtle: 'rgba(92, 107, 127, 0.12)',
      borderMedium: 'rgba(92, 107, 127, 0.24)',
      borderStrong: 'rgba(92, 107, 127, 0.36)',
      accentPrimary: '#6c8eae', // muted blue
      accentSecondary: '#8ba6c1',
      accentBright: '#abc0d4',
      textPrimary: '#2c3e50',
      textSecondary: '#546b82',
      textMuted: '#879cb2',

      graphNode: 0xe76f51, // muted orange
      graphNodeHighlight: 0xf4a261,
      graphEdge: 0x6c8eae,
      graphEdgeHighlight: 0x264653,

      graphNodeCss: '#e76f51',
      graphEdgeCss: 'rgba(108, 142, 174, 0.5)',
      graphEdgeHighlightCss: '#264653',
    },
  },
  {
    id: 'warm-sand',
    label: 'Warm Sand',
    type: 'light',
    colors: {
      bgPrimary: '#fdfcf0', // cream
      bgSecondary: '#fffef7',
      bgElevated: '#fffef7',
      bgOverlay: 'rgba(253, 252, 240, 0.92)',
      surfacePrimary: '#f5f2e0',
      surfaceSecondary: '#ebe6d0',
      surfaceHover: '#e0dbc0',
      borderSubtle: 'rgba(141, 134, 114, 0.15)',
      borderMedium: 'rgba(141, 134, 114, 0.3)',
      borderStrong: 'rgba(141, 134, 114, 0.45)',
      accentPrimary: '#d4a373', // tan
      accentSecondary: '#e4c3a1',
      accentBright: '#f3e3ce',
      textPrimary: '#4a4036',
      textSecondary: '#75685a',
      textMuted: '#9e8f7e',

      graphNode: 0xbc6c25, // nature-ish brown/orange
      graphNodeHighlight: 0xdda15e,
      graphEdge: 0xb5bfa1, // sage green
      graphEdgeHighlight: 0x606c38,

      graphNodeCss: '#bc6c25',
      graphEdgeCss: 'rgba(181, 191, 161, 0.6)',
      graphEdgeHighlightCss: '#606c38',
    },
  },
];

export const DEFAULT_THEME_ID = 'midnight-calm';

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // Apply CSS Variables
  root.style.setProperty('--color-bg-primary', theme.colors.bgPrimary);
  root.style.setProperty('--color-bg-secondary', theme.colors.bgSecondary);
  root.style.setProperty('--color-bg-elevated', theme.colors.bgElevated);
  root.style.setProperty('--color-bg-overlay', theme.colors.bgOverlay);

  root.style.setProperty('--color-surface-primary', theme.colors.surfacePrimary);
  root.style.setProperty('--color-surface-secondary', theme.colors.surfaceSecondary);
  root.style.setProperty('--color-surface-hover', theme.colors.surfaceHover);

  root.style.setProperty('--color-border-subtle', theme.colors.borderSubtle);
  root.style.setProperty('--color-border-medium', theme.colors.borderMedium);
  root.style.setProperty('--color-border-strong', theme.colors.borderStrong);

  root.style.setProperty('--color-accent-primary', theme.colors.accentPrimary);
  root.style.setProperty('--color-accent-secondary', theme.colors.accentSecondary);
  root.style.setProperty('--color-accent-bright', theme.colors.accentBright);

  root.style.setProperty('--color-text-primary', theme.colors.textPrimary);
  root.style.setProperty('--color-text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--color-text-muted', theme.colors.textMuted);

  root.style.setProperty('--color-graph-node', theme.colors.graphNodeCss);
  root.style.setProperty('--color-graph-edge', theme.colors.graphEdgeCss);
  root.style.setProperty('--color-graph-edge-highlight', theme.colors.graphEdgeHighlightCss);

  // Fix native controls (scrollbars, dropdowns)
  root.style.colorScheme = theme.type;
}
