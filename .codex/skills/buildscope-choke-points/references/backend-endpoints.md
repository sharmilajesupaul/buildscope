# BuildScope Backend Endpoints

This app does not expose a large JSON API surface. The meaningful backend contract for graph analysis is the graph payload served at `/graph.json`.

## Primary Endpoint

- `GET /graph.json`
  - Served by the Go HTTP server in `serveGraph`.
  - Returns the raw graph JSON used by the frontend.
  - Shape:

```json
{
  "nodes": [
    { "id": "//app:bin", "label": "//app:bin" }
  ],
  "edges": [
    { "source": "//app:bin", "target": "//lib:core" }
  ]
}
```

There is no backend endpoint for:

- hotspot rankings
- breakup candidates
- SCC metadata
- transitive reachability

Codex must fetch `/graph.json` and compute those metrics locally.

## How To Start The Endpoint

### 1. Analyze a live Bazel target

```bash
buildscope open //your/package:target --workdir /path/to/workspace --addr :4422
```

What happens:

- validates the Bazel workspace
- runs `bazel query 'deps(target)' --output=graph --keep_going`
- streams the result into a temp `graph.json`
- serves the UI and `/graph.json`

### 2. Serve an existing graph file

```bash
buildscope view /path/to/graph.json --addr :4422
```

### 3. Serve a graph through the low-level command

```bash
buildscope serve --graph /path/to/graph.json --addr :4422
```

### 4. Dev mode with Vite proxy

```bash
./dev.sh fixtures/buildscope_large_angular_app.json
```

Default ports:

- Go server: `http://localhost:4422`
- Vite dev server: `http://localhost:4400`

In dev mode, Vite proxies `/graph.json` to the Go server. That means both of these work:

- `http://localhost:4422/graph.json`
- `http://localhost:4400/graph.json`

Prefer the Go server when you want the direct backend endpoint and no frontend proxy in the middle.

## Useful Fetch Commands

Count nodes and edges:

```bash
curl -fsS http://localhost:4422/graph.json | jq '{nodes: (.nodes | length), edges: (.edges | length)}'
```

Save the graph locally:

```bash
curl -fsS http://localhost:4422/graph.json -o /tmp/buildscope-graph.json
```

Run the analyzer directly against the endpoint:

```bash
python3 .codex/skills/buildscope-choke-points/scripts/analyze_graph.py \
  --url http://localhost:4422/graph.json \
  --top 15
```

## Port Overrides

The repo uses these environment variables:

- `GO_PORT` for the Go server in dev mode
- `VITE_PORT` for the Vite dev server
- `SERVER_PORT` for the production wrapper scripts

When those are overridden, derive the correct URL before fetching `/graph.json`.
