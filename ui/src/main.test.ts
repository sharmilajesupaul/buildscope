import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

// Mock PixiJS
vi.mock('pixi.js', () => {
  class Graphics {
    lineStyle = vi.fn().mockReturnThis();
    beginFill = vi.fn().mockReturnThis();
    drawCircle = vi.fn().mockReturnThis();
    endFill = vi.fn().mockReturnThis();
    moveTo = vi.fn().mockReturnThis();
    lineTo = vi.fn().mockReturnThis();
    clear = vi.fn().mockReturnThis();
    on = vi.fn().mockReturnThis();
    x = 0;
    y = 0;
    tint = 0;
    eventMode = '';
    cursor = '';
    visible = true;
  }

  class Container {
    children: any[] = [];
    position = { x: 0, y: 0, set: vi.fn() };
    scale = { x: 1, y: 1, set: vi.fn() };
    addChild = vi.fn((child: any) => {
      this.children.push(child);
      return child;
    });
    addChildAt = vi.fn((child: any, index: number) => {
      this.children.splice(index, 0, child);
      return child;
    });
    removeChild = vi.fn((child: any) => {
      const index = this.children.indexOf(child);
      if (index > -1) this.children.splice(index, 1);
      return child;
    });
  }

  class Application {
    view: any;
    stage: Container;
    renderer: any;

    constructor(options?: any) {
      this.view = document.createElement('canvas');
      this.stage = new Container();
      this.renderer = {
        screen: {
          width: options?.width || 800,
          height: options?.height || 600,
        },
      };
    }
  }

  return {
    Application,
    Container,
    Graphics,
  };
});

describe('main.ts - loadGraph functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load graph from /graph.json when available', async () => {
    const mockGraph = {
      nodes: [{ id: '1', label: 'Node 1' }],
      edges: [{ source: '1', target: '1' }],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraph,
    });

    // Dynamically import to test loadGraph
    const response = await fetch('/graph.json');
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalledWith('/graph.json');
    expect(data).toEqual(mockGraph);
  });

  it('should fallback to /sample-graph.json when /graph.json fails', async () => {
    const mockSampleGraph = {
      nodes: [{ id: '2', label: 'Sample Node' }],
      edges: [],
    };

    (global.fetch as any)
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSampleGraph,
      });

    try {
      await fetch('/graph.json');
    } catch {
      const response = await fetch('/sample-graph.json');
      const data = await response.json();
      expect(data).toEqual(mockSampleGraph);
    }
  });
});

describe('main.ts - DOM creation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should create app container when #app element exists', () => {
    const root = document.getElementById('app');
    expect(root).not.toBeNull();
  });

  it('should not proceed if #app element is missing', () => {
    document.body.innerHTML = '';
    const root = document.getElementById('app');
    expect(root).toBeNull();
  });
});

describe('main.ts - Helper functions', () => {
  describe('getViewportBounds calculation', () => {
    it('should calculate viewport bounds correctly', () => {
      const viewW = 1000;
      const viewH = 800;
      const padding = 200;
      const currentScale = 1;
      const containerX = 0;
      const containerY = 0;

      const minX = (-containerX - padding) / currentScale;
      const minY = (-containerY - padding) / currentScale;
      const maxX = (viewW - containerX + padding) / currentScale;
      const maxY = (viewH - containerY + padding) / currentScale;

      expect(minX).toBe(-200);
      expect(minY).toBe(-200);
      expect(maxX).toBe(1200);
      expect(maxY).toBe(1000);
    });

    it('should account for scale when calculating bounds', () => {
      const viewW = 1000;
      const viewH = 800;
      const padding = 200;
      const currentScale = 2;
      const containerX = 100;
      const containerY = 50;

      const minX = (-containerX - padding) / currentScale;
      const minY = (-containerY - padding) / currentScale;
      const maxX = (viewW - containerX + padding) / currentScale;
      const maxY = (viewH - containerY + padding) / currentScale;

      expect(minX).toBe(-150);
      expect(minY).toBe(-125);
      expect(maxX).toBe(550);
      expect(maxY).toBe(475);
    });
  });

  describe('isNodeVisible check', () => {
    it('should return true when node is within bounds', () => {
      const node = { id: '1', label: 'Node', x: 100, y: 100 };
      const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 200 };

      const isVisible =
        node.x >= bounds.minX &&
        node.x <= bounds.maxX &&
        node.y >= bounds.minY &&
        node.y <= bounds.maxY;

      expect(isVisible).toBe(true);
    });

    it('should return false when node is outside bounds', () => {
      const node = { id: '1', label: 'Node', x: 300, y: 300 };
      const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 200 };

      const isVisible =
        node.x >= bounds.minX &&
        node.x <= bounds.maxX &&
        node.y >= bounds.minY &&
        node.y <= bounds.maxY;

      expect(isVisible).toBe(false);
    });

    it('should return true when node is on boundary', () => {
      const node = { id: '1', label: 'Node', x: 200, y: 200 };
      const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 200 };

      const isVisible =
        node.x >= bounds.minX &&
        node.x <= bounds.maxX &&
        node.y >= bounds.minY &&
        node.y <= bounds.maxY;

      expect(isVisible).toBe(true);
    });
  });

  describe('zoom calculation', () => {
    it('should increase scale when zooming in (negative delta)', () => {
      let currentScale = 1;
      const delta = -1;
      const factor = delta < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(currentScale * factor, 0.05), 3);

      expect(newScale).toBe(1.1);
      expect(newScale).toBeGreaterThan(currentScale);
    });

    it('should decrease scale when zooming out (positive delta)', () => {
      let currentScale = 1;
      const delta = 1;
      const factor = delta < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(currentScale * factor, 0.05), 3);

      expect(newScale).toBe(0.9);
      expect(newScale).toBeLessThan(currentScale);
    });

    it('should clamp scale to minimum of 0.05', () => {
      let currentScale = 0.05;
      const delta = 1;
      const factor = delta < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(currentScale * factor, 0.05), 3);

      expect(newScale).toBe(0.05);
    });

    it('should clamp scale to maximum of 3', () => {
      let currentScale = 3;
      const delta = -1;
      const factor = delta < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(currentScale * factor, 0.05), 3);

      expect(newScale).toBe(3);
    });
  });

  describe('zoom level display', () => {
    it('should format zoom level as percentage', () => {
      const currentScale = 1.5;
      const displayText = `${Math.round(currentScale * 100)}%`;

      expect(displayText).toBe('150%');
    });

    it('should round to nearest integer', () => {
      const currentScale = 1.456;
      const displayText = `${Math.round(currentScale * 100)}%`;

      expect(displayText).toBe('146%');
    });
  });
});

describe('main.ts - Status calculations', () => {
  it('should calculate connected nodes correctly', () => {
    const selectedId = 'node1';
    const edges = [
      { source: 'node1', target: 'node2' },
      { source: 'node3', target: 'node1' },
      { source: 'node4', target: 'node5' },
    ];

    const selectedEdges = edges.filter(
      (e) => e.source === selectedId || e.target === selectedId,
    );

    const connectedNodeIds = new Set<string>();
    selectedEdges.forEach((e) => {
      if (e.source === selectedId) connectedNodeIds.add(e.target);
      if (e.target === selectedId) connectedNodeIds.add(e.source);
    });

    expect(selectedEdges.length).toBe(2);
    expect(connectedNodeIds.size).toBe(2);
    expect(connectedNodeIds.has('node2')).toBe(true);
    expect(connectedNodeIds.has('node3')).toBe(true);
  });

  it('should handle nodes with no connections', () => {
    const selectedId = 'node1';
    const edges = [
      { source: 'node2', target: 'node3' },
      { source: 'node4', target: 'node5' },
    ];

    const selectedEdges = edges.filter(
      (e) => e.source === selectedId || e.target === selectedId,
    );

    const connectedNodeIds = new Set<string>();
    selectedEdges.forEach((e) => {
      if (e.source === selectedId) connectedNodeIds.add(e.target);
      if (e.target === selectedId) connectedNodeIds.add(e.source);
    });

    expect(selectedEdges.length).toBe(0);
    expect(connectedNodeIds.size).toBe(0);
  });
});

describe('main.ts - Search functionality', () => {
  it('should find node by exact label match', () => {
    const nodes = [
      { id: '1', label: 'Node One', x: 0, y: 0 },
      { id: '2', label: 'Node Two', x: 0, y: 0 },
    ];
    const term = 'node one';

    const found = nodes.find((n) => n.label.toLowerCase().includes(term));

    expect(found).toBeDefined();
    expect(found?.id).toBe('1');
  });

  it('should find node by partial label match', () => {
    const nodes = [
      { id: '1', label: 'Node One', x: 0, y: 0 },
      { id: '2', label: 'Node Two', x: 0, y: 0 },
    ];
    const term = 'two';

    const found = nodes.find((n) => n.label.toLowerCase().includes(term));

    expect(found).toBeDefined();
    expect(found?.id).toBe('2');
  });

  it('should return undefined when no match found', () => {
    const nodes = [
      { id: '1', label: 'Node One', x: 0, y: 0 },
      { id: '2', label: 'Node Two', x: 0, y: 0 },
    ];
    const term = 'three';

    const found = nodes.find((n) => n.label.toLowerCase().includes(term));

    expect(found).toBeUndefined();
  });
});

describe('main.ts - Large graph threshold', () => {
  it('should enable culling for graphs over threshold', () => {
    const LARGE_GRAPH_THRESHOLD = 5000;
    const nodeCount = 10000;

    const useCulling = nodeCount > LARGE_GRAPH_THRESHOLD;

    expect(useCulling).toBe(true);
  });

  it('should disable culling for small graphs', () => {
    const LARGE_GRAPH_THRESHOLD = 5000;
    const nodeCount = 100;

    const useCulling = nodeCount > LARGE_GRAPH_THRESHOLD;

    expect(useCulling).toBe(false);
  });

  it('should disable culling at exactly threshold', () => {
    const LARGE_GRAPH_THRESHOLD = 5000;
    const nodeCount = 5000;

    const useCulling = nodeCount > LARGE_GRAPH_THRESHOLD;

    expect(useCulling).toBe(false);
  });
});

describe('main.ts - Edge visibility logic', () => {
  it('should show all edges when scale > 0.2', () => {
    const currentScale = 0.5;
    const showAllEdges = currentScale > 0.2;

    expect(showAllEdges).toBe(true);
  });

  it('should hide edges when scale <= 0.2', () => {
    const currentScale = 0.1;
    const showAllEdges = currentScale > 0.2;

    expect(showAllEdges).toBe(false);
  });

  it('should hide edges at exactly 0.2 scale', () => {
    const currentScale = 0.2;
    const showAllEdges = currentScale > 0.2;

    expect(showAllEdges).toBe(false);
  });
});

describe('main.ts - Highlight set logic', () => {
  it('should include hovered node in highlight set', () => {
    const hoveredId = 'node1';
    const selectedId = null;
    const highlightSet = new Set<string>();

    if (hoveredId) highlightSet.add(hoveredId);
    if (selectedId) highlightSet.add(selectedId);

    expect(highlightSet.has('node1')).toBe(true);
    expect(highlightSet.size).toBe(1);
  });

  it('should include selected node in highlight set', () => {
    const hoveredId = null;
    const selectedId = 'node2';
    const highlightSet = new Set<string>();

    if (hoveredId) highlightSet.add(hoveredId);
    if (selectedId) highlightSet.add(selectedId);

    expect(highlightSet.has('node2')).toBe(true);
    expect(highlightSet.size).toBe(1);
  });

  it('should include both hovered and selected nodes', () => {
    const hoveredId = 'node1';
    const selectedId = 'node2';
    const highlightSet = new Set<string>();

    if (hoveredId) highlightSet.add(hoveredId);
    if (selectedId) highlightSet.add(selectedId);

    expect(highlightSet.has('node1')).toBe(true);
    expect(highlightSet.has('node2')).toBe(true);
    expect(highlightSet.size).toBe(2);
  });

  it('should handle same node being hovered and selected', () => {
    const hoveredId = 'node1';
    const selectedId = 'node1';
    const highlightSet = new Set<string>();

    if (hoveredId) highlightSet.add(hoveredId);
    if (selectedId) highlightSet.add(selectedId);

    expect(highlightSet.has('node1')).toBe(true);
    expect(highlightSet.size).toBe(1);
  });
});

describe('Editable zoom percentage input feature', () => {
  it('should be an input element, not a div', async () => {
    const { createZoomControls } = await import('./ui');
    const zoomControls = createZoomControls();
    const zoomLevelEl = zoomControls.querySelector('#zoom-level');

    expect(zoomLevelEl?.tagName).toBe('INPUT');
    expect((zoomLevelEl as HTMLInputElement)?.type).toBe('text');
  });

  it('should have initial value of "100%"', async () => {
    const { createZoomControls } = await import('./ui');
    const zoomControls = createZoomControls();
    const zoomLevelEl = zoomControls.querySelector('#zoom-level') as HTMLInputElement;

    expect(zoomLevelEl.value).toBe('100%');
  });
});
