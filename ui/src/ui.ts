// UI Creation Functions

export function createHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="brand-lockup">
      <img class="app-logo" src="/brand/buildscope-mark.svg" alt="" />
      <div class="brand-copy">
        <div class="app-name">BuildScope</div>
        <div class="app-tagline">Bazel dependency explorer</div>
      </div>
    </div>
  `;
  return header;
}

export function createSidePanel(): HTMLElement {
  const sidePanel = document.createElement('aside');
  sidePanel.className = 'side-panel';
  sidePanel.innerHTML = `
    <button
      class="panel-toggle"
      id="panel-toggle"
      type="button"
      aria-expanded="true"
      aria-label="Collapse panel"
      title="Collapse panel"
    >
      <span class="panel-toggle-icon" aria-hidden="true">
        <svg class="panel-toggle-glyph" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 4H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <path d="M3 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <path d="M3 12H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <span class="panel-toggle-label-text">Menu</span>
    </button>
    <div class="side-panel-scroll" id="side-panel-scroll">
      <div class="panel-group side-panel-top">
        <div class="summary-header">
          <div>
            <div class="controls-label">Graph Explorer</div>
            <div class="side-panel-title">Use the sections below to browse rankings, change focus, and control the canvas.</div>
          </div>
        </div>
      </div>

      <details class="panel-group menu-section" open>
        <summary class="menu-summary">
          <span class="menu-summary-title">Search</span>
          <span class="menu-summary-copy">Find targets and repo status</span>
        </summary>
        <div class="menu-body">
          <div class="summary-header section-toolbar">
            <label class="inline-theme-picker" for="theme-select">
              <span class="theme-picker-label">Theme</span>
              <select class="theme-select" id="theme-select">
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="colorblind">Colorblind</option>
              </select>
            </label>
          </div>
          <div class="search-container">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
            <input type="text" class="search-input" id="search-input" placeholder="Find a target..." />
          </div>
          <div class="panel-status-row">
            <span class="status-badge loading" id="status-badge">Loading</span>
          </div>
          <div class="summary-grid summary-grid-compact">
            <div class="summary-card">
              <div class="summary-label">Targets</div>
              <div class="summary-value" id="node-count">0</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Edges</div>
              <div class="summary-value" id="edge-count">0</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">High impact</div>
              <div class="summary-value" id="hotspot-count">0</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Largest cluster</div>
              <div class="summary-value" id="largest-scc">None</div>
            </div>
          </div>
        </div>
      </details>

      <details class="panel-group menu-section" open>
        <summary class="menu-summary">
          <span class="menu-summary-title">Rankings</span>
          <span class="menu-summary-copy">Impact and break-up candidates</span>
        </summary>
        <div class="menu-body">
          <div class="section-copy">Filter by target text or rank like <code>#3</code>, then focus the graph from the list.</div>
          <div class="search-container analysis-search">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
            <input type="text" class="search-input" id="analysis-filter-input" placeholder="Filter targets or #rank..." />
          </div>
          <details class="analysis-group" open>
            <summary class="analysis-summary">
              <span class="analysis-heading">Top impact</span>
              <span class="analysis-summary-meta" id="impact-analysis-count">Top shared targets</span>
            </summary>
            <div class="analysis-list" id="impact-analysis-list"></div>
          </details>
          <details class="analysis-group" open>
            <summary class="analysis-summary">
              <span class="analysis-heading">Break-up candidates</span>
              <span class="analysis-summary-meta" id="pressure-analysis-count">Broad shared hubs</span>
            </summary>
            <div class="analysis-list" id="pressure-analysis-list"></div>
          </details>
        </div>
      </details>

      <details class="panel-group menu-section">
        <summary class="menu-summary">
          <span class="menu-summary-title">Focus Mode</span>
          <span class="menu-summary-copy" id="focus-mode-copy">Impact</span>
        </summary>
        <div class="menu-body">
          <div class="shortcut-grid shortcut-grid-primary">
            <button class="shortcut-btn is-active" type="button" data-weight-mode="transitive-total">
              <span class="shortcut-title">Impact</span>
              <span class="shortcut-copy">Broad reach</span>
            </button>
            <button class="shortcut-btn" type="button" data-weight-mode="pressure">
              <span class="shortcut-title">Break-up</span>
              <span class="shortcut-copy">Shared hubs</span>
            </button>
            <button class="shortcut-btn" type="button" data-weight-mode="transitive-inputs">
              <span class="shortcut-title">Upstream</span>
              <span class="shortcut-copy">Who depends on it</span>
            </button>
            <button class="shortcut-btn" type="button" data-weight-mode="transitive-outputs">
              <span class="shortcut-title">Downstream</span>
              <span class="shortcut-copy">What it reaches</span>
            </button>
            <button class="shortcut-btn" type="button" data-weight-mode="total">
              <span class="shortcut-title">Direct</span>
              <span class="shortcut-copy">Immediate links</span>
            </button>
          </div>
        </div>
      </details>

      <details class="panel-group menu-section">
        <summary class="menu-summary">
          <span class="menu-summary-title">Canvas</span>
          <span class="menu-summary-copy">Fit, reset, and zoom</span>
        </summary>
        <div class="menu-body">
          <div class="button-group">
            <button class="btn btn-primary" id="fit-btn">Fit View</button>
            <button class="btn btn-secondary" id="reset-btn">Reset</button>
          </div>
          <div class="zoom-inline">
            <button class="zoom-btn" id="zoom-out" title="Zoom Out">-</button>
            <input type="text" class="zoom-level" id="zoom-level" value="100%" />
            <button class="zoom-btn" id="zoom-in" title="Zoom In">+</button>
          </div>
        </div>
      </details>

      <details class="panel-group menu-section advanced-group">
        <summary class="menu-summary advanced-summary">
          <span class="menu-summary-title">Advanced</span>
          <span class="menu-summary-copy">Extra emphasis modes</span>
        </summary>
        <div class="menu-body advanced-body">
          <label class="theme-picker-label" for="advanced-mode-select">Node Emphasis</label>
          <select class="weight-mode-select" id="advanced-mode-select">
            <option value="follow-focus">Follow focus mode</option>
            <option value="hotspots">High impact ranking</option>
            <option value="uniform">Uniform size</option>
          </select>
        </div>
      </details>
    </div>
  `;
  return sidePanel;
}

export function createSelectionInspector(): HTMLElement {
  const inspector = document.createElement('aside');
  inspector.className = 'selection-inspector';
  inspector.innerHTML = `
    <div class="summary-header">
      <div class="controls-label">Selection</div>
      <span class="mode-pill" id="weight-mode-label">Impact</span>
    </div>
    <div class="selection-slot">
      <div class="focus-empty" id="current-node-empty">Select a node to inspect what it is, why it matters, and how connected it is.</div>
      <div class="focus-card hidden" id="current-node-status">
        <div class="focus-title" id="current-node"></div>
        <div class="focus-subtitle" id="current-node-subtitle"></div>
        <div class="focus-metric-grid">
          <div class="focus-metric">
            <span class="focus-metric-label">Direct in</span>
            <span class="focus-metric-value" id="direct-inputs">0</span>
          </div>
          <div class="focus-metric">
            <span class="focus-metric-label">Direct out</span>
            <span class="focus-metric-value" id="direct-outputs">0</span>
          </div>
          <div class="focus-metric">
            <span class="focus-metric-label">Transitive in</span>
            <span class="focus-metric-value" id="transitive-inputs">0</span>
          </div>
          <div class="focus-metric">
            <span class="focus-metric-label">Transitive out</span>
            <span class="focus-metric-value" id="transitive-outputs">0</span>
          </div>
        </div>
        <div class="compact-meta-row">
          <span class="compact-meta-label">Cluster</span>
          <span class="compact-meta-value" id="scc-size">1</span>
          <span class="hidden" id="hotspot-rank">Not ranked</span>
        </div>
      </div>
    </div>
  `;
  return inspector;
}
