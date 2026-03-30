# BuildScope

BuildScope is a local-first Bazel build graph explorer. It extracts dependency graphs from Bazel and renders them in a fast 2D UI for inspection.

## Architecture

```mermaid
graph LR
  Workspace[Bazel workspace] --> Extract[Go CLI: extract]
  Extract --> GraphJson[Graph JSON]

  GraphJson --> Serve[Go CLI: serve]
  Dev[dev.sh / buildscope.sh] --> Serve
  Dev --> Vite[Vite dev/build pipeline]

  Serve -->|/graph.json| Browser[Browser UI]
  Vite --> Browser

  Browser --> Main[main.ts]
  Main --> Worker[graphWorker.ts]
  Worker --> Layout[graphLayout.ts]
  Main --> Viz[GraphVisualization.ts]
  Main --> Controls[ui.ts]
  Layout --> Viz
  Controls --> Viz
```

For large-graph UX direction, see [docs/large-graph-ui-plan.md](docs/large-graph-ui-plan.md).

## Prerequisites
- Node.js v24.11.1 (see `.node-version`)
- Go 1.22+
- Bazel workspace (only required for `extract`)

## Quick Start

### Visualize a Bazel target
```bash
# From your Bazel workspace root
/path/to/buildscope/buildscope.sh //your/package:target
```

This extracts the graph, builds the UI if needed, and starts the viewer.

### Development
```bash
# Install UI dependencies
cd ui && npm install && cd ..

# Start dev servers with sample graph
./dev.sh

# Or pass a custom graph
./dev.sh path/to/your/graph.json
```

Default URLs are printed on startup. Ports will fall back if defaults are busy.

## CLI Usage

### Extract a graph
```bash
cd cli
go run ./cmd/buildscope extract \
  -target //your/package:target \
  -workdir /path/to/bazel/workspace \
  -out /tmp/graph.json
```

### Serve a graph
```bash
cd cli
go run ./cmd/buildscope serve \
  -dir ../ui/dist \
  -graph /path/to/your/graph.json \
  -addr :4422
```

## Scripts

### `dev.sh`
Starts:
- Vite dev server (UI)
- Go server (graph API)
- Go file watcher for auto-restart

### `buildscope.sh`
Runs: extract → build UI (if needed) → serve.

### Port overrides
You can override default ports:
```bash
GO_PORT=4500 VITE_PORT=4501 ./dev.sh
SERVER_PORT=4500 ./buildscope.sh //your/package:target
```

## Build
```bash
npm --prefix ui run build
```

## Tests
```bash
cd ui
npm test
```

## Repository Structure
- `cli/`: Go CLI (extract/serve)
- `ui/`: TypeScript UI (Pixi.js renderer)
- `scripts/`: Shared script helpers and runners

## Contributing
1) Make a focused change.
2) Run relevant tests.
3) Open a PR with a clear description.
