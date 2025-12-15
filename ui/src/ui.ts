// UI Creation Functions

export function createHeader(): HTMLElement {
  const header = document.createElement('div');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="app-title">
      <div class="app-logo">B</div>
      <div>
        <div class="app-name">BuildScope</div>
      </div>
      <div class="app-subtitle">Bazel Build Graph Explorer</div>
    </div>
  `;
  return header;
}

export function createControlsPanel(): HTMLElement {
  const controlsPanel = document.createElement('div');
  controlsPanel.className = 'controls-panel';
  controlsPanel.innerHTML = `
    <div class="controls-section">
      <div class="controls-label">Search</div>
      <div class="search-container">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
        <input type="text" class="search-input" id="search-input" placeholder="Search nodes..." />
      </div>
    </div>
    <div class="controls-section">
      <div class="controls-label">View Controls</div>
      <div class="button-group">
        <button class="btn btn-primary" id="fit-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-1 0v-3zm13 0A1.5 1.5 0 0 0 12.5 1h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 0 1 0v-3zM.5 10.5A.5.5 0 0 1 1 10v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 1 13v-3a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 0 0 1h3a1.5 1.5 0 0 0 1.5-1.5v-3a.5.5 0 0 0-.5-.5z"/>
          </svg>
          Fit View
        </button>
        <button class="btn btn-secondary" id="reset-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
          Reset
        </button>
      </div>
    </div>
  `;
  return controlsPanel;
}

export function createStatusPanel(): HTMLElement {
  const statusPanel = document.createElement('div');
  statusPanel.className = 'status-panel';
  statusPanel.innerHTML = `
    <div class="status-item">
      <span class="status-label">Status:</span>
      <span class="status-badge loading" id="status-badge">Loading</span>
    </div>
    <div class="status-item">
      <span class="status-label">Nodes:</span>
      <span class="status-value" id="node-count">0</span>
    </div>
    <div class="status-item">
      <span class="status-label">Edges:</span>
      <span class="status-value" id="edge-count">0</span>
    </div>
    <div class="status-item hidden" id="current-node-status">
      <span class="status-label">Selected:</span>
      <span class="status-value font-size-sm" id="current-node"></span>
    </div>
    <div class="legend">
      <div class="legend-items">
        <div class="legend-item">
          <div class="legend-color node"></div>
          <span>Nodes</span>
        </div>
        <div class="legend-item">
          <div class="legend-color edge"></div>
          <span>Dependencies</span>
        </div>
        <div class="legend-item">
          <div class="legend-color highlight"></div>
          <span>Highlighted</span>
        </div>
      </div>
    </div>
  `;
  return statusPanel;
}

export function createZoomControls(): HTMLElement {
  const zoomControls = document.createElement('div');
  zoomControls.className = 'zoom-controls';
  zoomControls.innerHTML = `
    <button class="zoom-btn" id="zoom-in" title="Zoom In">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
      </svg>
    </button>
    <div class="zoom-level" id="zoom-level">100%</div>
    <button class="zoom-btn" id="zoom-out" title="Zoom Out">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
      </svg>
    </button>
  `;
  return zoomControls;
}
