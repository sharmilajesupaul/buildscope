# BuildScope

BuildScope is a local-first Bazel build graph explorer. It ingests `query`/`aquery` graphs plus timing data from a `bazel build --profile`/BEP run, then renders a high-performance 2D view to spot bottlenecks, fan-in hotspots, and critical paths.

## Tech choices
- CLI/server: Go (fast to ship, simple static binary, solid proto tooling)
- UI: Vite + TypeScript with Pixi.js for high-performance 2D rendering
- Layout: Layered graph layout with topological sorting for dependency visualization

## Current state
- ✅ Go CLI with `extract` and `serve` commands
- ✅ Modern UI with Pixi.js renderer, pan/zoom, search, and interactive controls
- ✅ Graph layout engine with fit-to-view and layered positioning
- ✅ Sample graph visualization with hover/selection highlighting
- 🚧 BEP/profile integration for timing data (planned)
- 🚧 Advanced insights: critical path, heatmaps, metrics (planned)

## Quick Start

### Development
Run the UI with live reload:
```bash
cd ui
npm install
npm run dev
```
Then open http://localhost:4400

### Production
Build and serve the UI with the Go server:
```bash
# Build the UI
npm --prefix ui run build

# Serve with your graph data
cd cli
go run ./cmd/buildscope serve -dir ../ui/dist -graph /path/to/your/graph.json -addr :4422
```
Then open http://localhost:4422

### Extract a graph from Bazel
```bash
cd cli
go run ./cmd/buildscope extract \
  -target //your/package:target \
  -workdir ~/path/to/bazel/workspace \
  -out /tmp/graph.json
```

## Workflow
1) **Extract**: `buildscope extract -target //path:target -workdir <workspace> -out graph.json`
   - Runs `bazel query 'deps(target)' --output=graph`
   - Parses the graph output and emits normalized JSON
2) **View**: `buildscope serve -dir ui/dist -graph graph.json -addr :4422`
   - Serves the UI bundle and graph data
   - Opens at http://localhost:4422
3) **Interact**: Pan, zoom, search nodes, click to select and highlight dependencies

## Repository Structure
- `cli/`: Go CLI with extract and serve commands
  - `cmd/buildscope/main.go`: Main CLI entry point
  - Parses Bazel query output and serves UI
- `ui/`: Modern TypeScript UI with Pixi.js
  - `src/main.ts`: UI application with Pixi.js renderer
  - `src/graphLayout.ts`: Graph layout algorithms (layered layout, fit-to-view)
  - `src/styles.css`: Modern design system with CSS variables
  - Production build outputs to `ui/dist/`

## Features

### Current
- ✅ **Graph Extraction**: Parse Bazel query output into JSON
- ✅ **Interactive Visualization**: Pan, zoom, hover, and click to explore
- ✅ **Search**: Find nodes by label (press Enter in search box)
- ✅ **Modern UI**: Professional design with status panels, zoom controls, and legend
- ✅ **Layered Layout**: Automatic topological layout for dependency graphs
- ✅ **Highlighting**: Hover or click nodes to see connected edges
- ✅ **Responsive**: Works on desktop and mobile

### Roadmap
1) **Performance data integration** (in progress)
   - Parse BEP (Build Event Protocol) and profile.gz for timing data
   - Show build duration, critical path, cache hits
2) **Advanced visualizations**
   - Heatmap by duration/size
   - Critical path highlighting
   - Top fan-in/fan-out analysis
   - Package/target grouping and collapse
3) **Analysis features**
   - Diff mode to compare graphs
   - Hotspot detection
   - Export to PNG/SVG
   - Bookmarks and saved views

## Development

### Prerequisites
- Node.js v24.11.1 (use `fnm` or `nvm` to match `.node-version`)
- Go 1.22.0+
- Bazel workspace (optional, for extracting real graphs)

### Running Tests
```bash
cd ui
npm test
```

### UI Architecture
- **Pixi.js**: Hardware-accelerated 2D rendering for smooth 60fps interactions
- **TypeScript**: Type-safe graph manipulation and layout
- **CSS Variables**: Consistent design system with dark theme
- **Modular Design**: Separate concerns for rendering, layout, and interaction

### Next Steps
- Add comprehensive UI tests for graph sanitization and layout algorithms
- Implement BEP/profile parsing for build timing integration
- Add performance benchmarks for large graphs (1000+ nodes)
- Create docs for graph schema and CLI flags

## Tooling
- Node version pinned via `.node-version` (v24.11.1). Use `fnm`/`nvm` to match.
