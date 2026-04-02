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
      <details class="panel-group menu-section" open>
        <summary class="menu-summary">
          <span class="menu-summary-title">Search</span>
          <span class="menu-summary-copy">Find targets</span>
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
            <span class="status-badge loading" id="status-badge">Loading</span>
          </div>
          <div class="section-copy">Search for a target, then click it in the graph or from the rankings.</div>
          <div class="search-container">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
            <input type="text" class="search-input" id="search-input" placeholder="Find a target..." />
          </div>
          <div class="summary-grid summary-grid-compact">
            <div class="summary-card">
              <div class="summary-label">Nodes</div>
              <div class="summary-value" id="node-count">0</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Edges</div>
              <div class="summary-value" id="edge-count">0</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Rule targets</div>
              <div class="summary-value" id="rule-count">0</div>
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

      <details class="panel-group menu-section">
        <summary class="menu-summary">
          <span class="menu-summary-title">Rankings</span>
          <span class="menu-summary-copy">Top candidates</span>
        </summary>
        <div class="menu-body">
          <div class="section-copy">Filter by target or rank like <code>#3</code>, then inspect decomposition on the right for the selected target.</div>
          <div class="search-container analysis-search">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
            <input type="text" class="search-input" id="analysis-filter-input" placeholder="Filter targets or #rank..." />
          </div>
          <details class="analysis-group">
            <summary class="analysis-summary">
              <span class="analysis-heading">Top impact</span>
              <span class="analysis-summary-meta" id="impact-analysis-count">Top shared targets</span>
            </summary>
            <div class="analysis-list" id="impact-analysis-list"></div>
          </details>
          <details class="analysis-group">
            <summary class="analysis-summary">
              <span class="analysis-heading">Break-up candidates</span>
              <span class="analysis-summary-meta" id="pressure-analysis-count">Impact · mass · shardability</span>
            </summary>
            <div class="analysis-list" id="pressure-analysis-list"></div>
          </details>
          <details class="analysis-group" id="file-analysis-group">
            <summary class="analysis-summary">
              <span class="analysis-heading">File-heavy targets</span>
              <span class="analysis-summary-meta" id="file-analysis-count">Largest source surfaces</span>
            </summary>
            <div class="analysis-list" id="file-analysis-list"></div>
          </details>
          <details class="analysis-group" id="input-analysis-group">
            <summary class="analysis-summary">
              <span class="analysis-heading">Input-heavy targets</span>
              <span class="analysis-summary-meta" id="input-analysis-count">Largest direct input surfaces</span>
            </summary>
            <div class="analysis-list" id="input-analysis-list"></div>
          </details>
          <details class="analysis-group" id="output-analysis-group">
            <summary class="analysis-summary">
              <span class="analysis-heading">Output-heavy targets</span>
              <span class="analysis-summary-meta" id="output-analysis-count">Big generated surfaces</span>
            </summary>
            <div class="analysis-list" id="output-analysis-list"></div>
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
          <span class="menu-summary-copy">Fit and zoom</span>
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

      <details class="panel-group menu-section">
        <summary class="menu-summary">
          <span class="menu-summary-title">View</span>
          <span class="menu-summary-copy">Orientation and focus</span>
        </summary>
        <div class="menu-body advanced-body">
          <div class="section-copy">Use the preset to inspect broad shared hubs, or switch the whole graph between preserve, directional, and radial layouts.</div>
          <div class="button-group">
            <button class="btn btn-primary" id="choke-point-preset-btn">Choke Point View</button>
          </div>
          <label class="theme-picker-label" for="graph-orientation-select">Graph Orientation</label>
          <select class="weight-mode-select" id="graph-orientation-select">
            <option value="top-down">Top-down</option>
            <option value="left-right">Left-right</option>
            <option value="bottom-up">Bottom-up</option>
            <option value="right-left">Right-left</option>
          </select>
          <label class="theme-picker-label" for="selection-layout-select">Graph Layout</label>
          <select class="weight-mode-select" id="selection-layout-select">
            <option value="preserve">Preserve</option>
            <option value="directional">Directional</option>
            <option value="radial">Radial</option>
          </select>
        </div>
      </details>

      <details class="panel-group menu-section advanced-group">
        <summary class="menu-summary advanced-summary">
          <span class="menu-summary-title">Advanced</span>
          <span class="menu-summary-copy">Extra modes</span>
        </summary>
        <div class="menu-body advanced-body">
          <label class="theme-picker-label" for="advanced-mode-select">Node Emphasis</label>
          <select class="weight-mode-select" id="advanced-mode-select">
            <option value="follow-focus">Follow focus mode</option>
            <option value="hotspots">High impact ranking</option>
            <option value="source-file-count">Source file count</option>
            <option value="source-bytes">Source bytes</option>
            <option value="input-file-count">Input file count</option>
            <option value="input-bytes">Input bytes</option>
            <option value="output-file-count">Output file count</option>
            <option value="output-bytes">Output bytes</option>
            <option value="action-count">Action count</option>
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
  inspector.className = 'selection-inspector is-idle';
  inspector.innerHTML = `
    <div class="summary-header">
      <div class="controls-label">Selection</div>
      <span class="mode-pill" id="weight-mode-label">Impact</span>
    </div>
    <div class="selection-slot">
      <div class="focus-empty" id="current-node-empty">Select a node to inspect what it is, why it matters, and how it could split.</div>
      <div class="focus-card hidden" id="current-node-status">
        <div class="focus-title" id="current-node"></div>
        <div class="focus-subtitle" id="current-node-subtitle"></div>
        <div class="compact-meta-row compact-meta-row-rich">
          <span class="compact-meta-label">Type</span>
          <span class="compact-meta-value" id="node-type">—</span>
          <span class="compact-meta-label">Rule</span>
          <span class="compact-meta-value" id="rule-kind">—</span>
        </div>
        <div class="selection-note hidden" id="selection-note"></div>
        <details class="analysis-group focus-analysis-group" id="focus-connectivity-group" open>
          <summary class="analysis-summary">
            <span class="analysis-heading">Connectivity</span>
            <span class="analysis-summary-meta">Blast radius and graph shape</span>
          </summary>
          <div class="focus-analysis-content">
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
              <span class="hidden" id="hotspot-rank">—</span>
            </div>
          </div>
        </details>
        <details class="analysis-group focus-analysis-group" id="focus-surface-group" open>
          <summary class="analysis-summary">
            <span class="analysis-heading">Build surface</span>
            <span class="analysis-summary-meta">Files, bytes, and actions</span>
          </summary>
          <div class="focus-analysis-content">
            <div class="focus-metric-grid">
              <div class="focus-metric">
                <span class="focus-metric-label">Source files</span>
                <span class="focus-metric-value" id="source-file-count">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Source bytes</span>
                <span class="focus-metric-value" id="source-bytes">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Input files</span>
                <span class="focus-metric-value" id="input-file-count">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Input bytes</span>
                <span class="focus-metric-value" id="input-bytes">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Outputs</span>
                <span class="focus-metric-value" id="output-file-count">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Output bytes</span>
                <span class="focus-metric-value" id="output-bytes">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Actions</span>
                <span class="focus-metric-value" id="action-count">—</span>
              </div>
            </div>
          </div>
        </details>
        <details class="analysis-group focus-analysis-group" id="focus-decomposition-group" open>
          <summary class="analysis-summary">
            <span class="analysis-heading">Decomposition</span>
            <span class="analysis-summary-meta" id="focus-decomposition-meta">Readable split guidance</span>
          </summary>
          <div class="focus-analysis-content">
            <div class="focus-verdict hidden" id="decomposition-verdict"></div>
            <div class="focus-metric-grid">
              <div class="focus-metric">
                <span class="focus-metric-label">Blast radius</span>
                <span class="focus-metric-value" id="decomposition-impact-score">—</span>
                <span class="focus-metric-meta" id="decomposition-impact-meta">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Build mass</span>
                <span class="focus-metric-value" id="decomposition-mass-score">—</span>
                <span class="focus-metric-meta" id="decomposition-mass-meta">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Split fit</span>
                <span class="focus-metric-value" id="decomposition-shardability-score">—</span>
                <span class="focus-metric-meta" id="decomposition-shardability-meta">—</span>
              </div>
              <div class="focus-metric">
                <span class="focus-metric-label">Dependency groups</span>
                <span class="focus-metric-value" id="decomposition-community-count">—</span>
                <span class="focus-metric-meta" id="decomposition-community-meta">—</span>
              </div>
            </div>
            <div class="compact-meta-row">
              <span class="compact-meta-label">Largest group</span>
              <span class="compact-meta-value" id="decomposition-largest-community-share">—</span>
              <span class="compact-meta-label">Coupling</span>
              <span class="compact-meta-value" id="decomposition-cross-edge-ratio">—</span>
            </div>
            <div class="selection-note hidden" id="decomposition-note"></div>
            <div class="analysis-list" id="decomposition-community-list"></div>
          </div>
        </details>
        <details class="analysis-group focus-analysis-group" id="focus-inputs-group" open>
          <summary class="analysis-summary">
            <span class="analysis-heading">Largest inputs</span>
            <span class="analysis-summary-meta">Direct source or generated files</span>
          </summary>
          <div class="analysis-list" id="top-files-list"></div>
        </details>
        <details class="analysis-group focus-analysis-group" id="focus-outputs-group" open>
          <summary class="analysis-summary">
            <span class="analysis-heading">Largest outputs</span>
            <span class="analysis-summary-meta">Default outputs for this target</span>
          </summary>
          <div class="analysis-list" id="top-outputs-list"></div>
        </details>
        <details class="analysis-group focus-analysis-group" id="focus-actions-group" open>
          <summary class="analysis-summary">
            <span class="analysis-heading">Action mix</span>
            <span class="analysis-summary-meta">Registered action mnemonics</span>
          </summary>
          <div class="analysis-list" id="mnemonic-list"></div>
        </details>
      </div>
    </div>
  `;
  return inspector;
}
