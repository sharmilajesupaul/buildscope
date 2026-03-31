# BuildScope Backend Endpoints

This app exposes a small JSON API surface. The most useful endpoint for choke-point analysis is `/analysis.json`, with `/graph.json` remaining the raw graph payload.

## Primary Endpoints

- `GET /analysis.json`
  - Served by the Go HTTP server in `serveGraph`.
  - Returns precomputed rankings and graph-analysis summaries.
  - Query params:
    - `top`: optional positive integer; defaults to `10`, capped at `100`
    - `focus`: optional Bazel label for node-level drill-down

- `GET /graph.json`
  - Served by the Go HTTP server in `serveGraph`.
  - Returns the raw graph JSON used by the frontend.

Example `/analysis.json` shape:

```json
{
  "nodeCount": 593,
  "edgeCount": 1675,
  "hotspotCount": 54,
  "largestHotspotSize": 3,
  "topImpactTargets": [
    {
      "id": "//pkg:lib",
      "transitiveInDegree": 184,
      "outDegree": 2
    }
  ],
  "topBreakupCandidates": [
    {
      "id": "//pkg:hub",
      "pressure": 91.4,
      "transitiveInDegree": 77,
      "outDegree": 11,
      "recommendations": [
        "Reduce direct dependency fan-out."
      ]
    }
  ],
  "focus": {
    "id": "//pkg:hub",
    "directDependencies": ["//dep:a", "//dep:b"]
  }
}
```

Example `/graph.json` shape:

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

## How To Start The Endpoint

### 1. Analyze a live Bazel target

```bash
buildscope open //your/package:target --workdir /path/to/workspace --addr :4422
```

What happens:

- validates the Bazel workspace
- runs `bazel query 'deps(target)' --output=graph --keep_going`
- streams the result into a temp `graph.json`
- serves the UI, `/graph.json`, and `/analysis.json`

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

In dev mode, Vite proxies `/graph.json` to the Go server. `/analysis.json` is available directly from the Go server.

- `http://localhost:4422/graph.json`
- `http://localhost:4400/graph.json`
- `http://localhost:4422/analysis.json`

Prefer the Go server when you want the direct backend endpoint and no frontend proxy in the middle.

## Useful Fetch Commands

Read the precomputed analysis:

```bash
curl -fsS "http://localhost:4422/analysis.json?top=15" | jq
```

Focus one target:

```bash
curl -fsS "http://localhost:4422/analysis.json?top=15&focus=//pkg:target" | jq
```

Count nodes and edges from the raw graph:

```bash
curl -fsS http://localhost:4422/graph.json | jq '{nodes: (.nodes | length), edges: (.edges | length)}'
```

Save the graph locally:

```bash
curl -fsS http://localhost:4422/graph.json -o /tmp/buildscope-graph.json
```

Run the file-based analyzer fallback:

```bash
python3 .codex/skills/buildscope-choke-points/scripts/analyze_graph.py \
  --file /tmp/buildscope-graph.json \
  --top 15
```

## Port Overrides

The repo uses these environment variables:

- `GO_PORT` for the Go server in dev mode
- `VITE_PORT` for the Vite dev server
- `SERVER_PORT` for the production wrapper scripts

When those are overridden, derive the correct URL before fetching `/graph.json`.
