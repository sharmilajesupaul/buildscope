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

export function createControlsPanel(): HTMLElement {
  const controlsPanel = document.createElement('aside');
  controlsPanel.className = 'controls-panel';
  controlsPanel.innerHTML = `
    <div class="panel-group">
      <div class="toolbar-row">
        <div class="controls-label">Search</div>
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
    </div>

    <div class="panel-group">
      <div class="summary-header">
        <div class="controls-label">Focus Mode</div>
        <span class="mode-pill" id="focus-mode-copy">Impact</span>
      </div>
      <div class="shortcut-grid">
        <button class="shortcut-btn is-active" type="button" data-weight-mode="transitive-total">
          <span class="shortcut-title">Impact</span>
          <span class="shortcut-copy">Broad reach</span>
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

    <div class="panel-group">
      <div class="controls-label">Node Emphasis</div>
      <select class="weight-mode-select" id="weight-mode-select">
        <option value="transitive-total">Transitive total</option>
        <option value="transitive-inputs">Transitive inputs</option>
        <option value="transitive-outputs">Transitive outputs</option>
        <option value="total">Direct total connections</option>
        <option value="inputs">Direct inputs only</option>
        <option value="outputs">Direct outputs only</option>
        <option value="pressure">Break-up candidates</option>
        <option value="hotspots">High impact ranking</option>
        <option value="uniform">Uniform size</option>
      </select>
    </div>

    <div class="panel-group">
      <div class="controls-label">Canvas</div>
      <div class="button-group">
        <button class="btn btn-primary" id="fit-btn">Fit</button>
        <button class="btn btn-secondary" id="reset-btn">Reset</button>
      </div>
    </div>
  `;
  return controlsPanel;
}

export function createStatusPanel(): HTMLElement {
  const statusPanel = document.createElement('aside');
  statusPanel.className = 'status-panel';
  statusPanel.innerHTML = `
    <div class="panel-group">
      <div class="summary-header">
        <div class="controls-label">Graph</div>
        <span class="status-badge loading" id="status-badge">Loading</span>
      </div>
      <div class="summary-grid">
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
      </div>
      <div class="compact-meta-row">
        <span class="compact-meta-label">Largest cluster</span>
        <span class="compact-meta-value" id="largest-scc">None</span>
      </div>
    </div>

    <div class="panel-group">
      <div class="summary-header">
        <div class="controls-label">Selection</div>
        <span class="mode-pill" id="weight-mode-label">Impact</span>
      </div>
      <div class="selection-slot">
        <div class="focus-empty" id="current-node-empty">Search, hover, or click a target to inspect its neighborhood.</div>
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
    </div>

    <div class="panel-group">
      <div class="controls-label">Analysis</div>
      <div class="analysis-group">
        <div class="analysis-heading">Top impact</div>
        <div class="analysis-list" id="impact-analysis-list"></div>
      </div>
      <div class="analysis-group">
        <div class="analysis-heading">Break-up candidates</div>
        <div class="analysis-list" id="pressure-analysis-list"></div>
      </div>
    </div>
  `;
  return statusPanel;
}

export function createZoomControls(): HTMLElement {
  const zoomControls = document.createElement('div');
  zoomControls.className = 'zoom-controls';
  zoomControls.innerHTML = `
    <button class="zoom-btn" id="zoom-out" title="Zoom Out">-</button>
    <input type="text" class="zoom-level" id="zoom-level" value="100%" />
    <button class="zoom-btn" id="zoom-in" title="Zoom In">+</button>
  `;
  return zoomControls;
}
