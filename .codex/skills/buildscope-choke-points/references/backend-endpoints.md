# BuildScope Backend Endpoints

This app exposes a small JSON API surface. The most useful endpoint for choke-point analysis is `/analysis.json`, with `/decomposition.json` handling focused split seams for one target, `/graph.json` remaining the raw graph payload, `/graph.details.json` carrying the larger direct input/output lists when enrichment is enabled, and `/file-focus.json` handling file-centric drill-downs.

## Primary Endpoints

- `GET /analysis.json`
  - Served by the Go HTTP server in `serveGraph`.
  - Returns precomputed rankings and graph-analysis summaries.
  - Query params:
    - `top`: optional positive integer; defaults to `10`, capped at `100`
    - `focus`: optional Bazel label for node-level drill-down

- `GET /decomposition.json`
  - Returns one target's focused split guidance.
  - Query params:
    - `target`: required exact Bazel target label

- `GET /graph.json`
  - Served by the Go HTTP server in `serveGraph`.
  - Returns the raw graph JSON used by the frontend.

- `GET /graph.details.json`
  - Served when the graph payload has an adjacent details sidecar.
  - Returns per-target direct input lists, direct output lists, and mnemonic summaries for deeper inspection.

- `GET /file-focus.json`
  - Returns one file label's direct and transitive consumers in the current graph snapshot.
  - When the server came from `buildscope open`, it also adds live workspace reverse dependencies from Bazel query.
  - Query params:
    - `label`: required exact Bazel file label, for example `//pkg:file.go`

Example `/analysis.json` shape:

```json
{
  "nodeCount": 593,
  "edgeCount": 1675,
  "ruleTargetCount": 411,
  "hotspotCount": 54,
  "largestHotspotSize": 3,
  "topImpactTargets": [
    {
      "id": "//pkg:lib",
      "transitiveInDegree": 184,
      "outDegree": 2,
      "sourceFileCount": 12,
      "sourceBytes": 28104
    }
  ],
  "topBreakupCandidates": [
    {
      "id": "//pkg:hub",
      "pressure": 91.4,
      "opportunityScore": 246.8,
      "massScore": 5.5,
      "shardabilityScore": 7.1,
      "transitiveInDegree": 77,
      "outDegree": 11,
      "inputFileCount": 34,
      "outputFileCount": 7,
      "actionCount": 15,
      "recommendations": [
        "Reduce direct dependency fan-out."
      ]
    }
  ],
  "topSourceHeavyTargets": [
    {
      "id": "//pkg:heavy_srcs",
      "sourceFileCount": 44,
      "sourceBytes": 131072
    }
  ],
  "topOutputHeavyTargets": [
    {
      "id": "//pkg:generator",
      "outputFileCount": 8,
      "outputBytes": 5242880,
      "actionCount": 17
    }
  ],
  "focus": {
    "id": "//pkg:hub",
    "outputBytes": 5242880,
    "topOutputs": [
      { "path": "bazel-out/k8-fastbuild/bin/pkg/out.pb", "sizeBytes": 1048576 }
    ],
    "directDependencies": ["//dep:a", "//dep:b"]
  }
}
```

Example `/file-focus.json` shape:

```json
{
  "label": "//pkg:file.go",
  "currentGraphDirectConsumerCount": 2,
  "currentGraphDirectConsumers": ["//app:bin", "//pkg:hub"],
  "currentGraphTransitiveConsumerCount": 5,
  "topCurrentGraphConsumers": [
    {
      "id": "//pkg:hub",
      "direct": true,
      "opportunityScore": 91.4
    }
  ],
  "liveQueryAvailable": true,
  "workspaceReverseDependencyCount": 14
}
```

Example `/decomposition.json` shape:

```json
{
  "target": "//pkg:hub",
  "eligible": true,
  "impactScore": 6.3,
  "massScore": 5.5,
  "shardabilityScore": 7.1,
  "communityCount": 3,
  "largestCommunityShare": 0.5,
  "crossCommunityEdgeRatio": 0.18,
  "communities": [
    {
      "title": "//pkg/auth",
      "nodeCount": 4,
      "sampleLabels": ["//pkg/auth:api", "//pkg/auth:session"]
    }
  ]
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
- optionally enriches the graph with `label_kind`, `cquery`, and build-backed output stats
- streams the result into a temp `graph.json`
- serves the UI, `/graph.json`, `/analysis.json`, `/decomposition.json`, and `/graph.details.json` when present

### 2. Serve an existing graph file

```bash
buildscope view /path/to/graph.json --addr :4422
```

`buildscope view` auto-loads a sibling `graph.details.json` when it exists next to the graph file.

### 3. Serve a graph through the low-level command

```bash
buildscope serve --graph /path/to/graph.json --addr :4422
```

Use the low-level command when you need to point at a non-adjacent details sidecar:

```bash
buildscope serve --graph /path/to/graph.json --details /path/to/graph.details.json --addr :4422
```

### 4. Dev mode with Vite proxy

```bash
./dev.sh fixtures/buildscope_large_angular_app.json
```

Default ports:

- Go server: `http://localhost:4422`
- Vite dev server: `http://localhost:4400`

In dev mode, Vite proxies `/graph.json` to the Go server. `/analysis.json` and `/decomposition.json` are available directly from the Go server.

- `http://localhost:4422/graph.json`
- `http://localhost:4400/graph.json`
- `http://localhost:4422/analysis.json`
- `http://localhost:4422/decomposition.json?target=//pkg:target`
- `http://localhost:4422/graph.details.json`

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

Focus one file:

```bash
curl -fsS "http://localhost:4422/file-focus.json?label=//pkg:file.go" | jq
```

Focus one target's split seams:

```bash
curl -fsS "http://localhost:4422/decomposition.json?target=//pkg:target" | jq
```

Count nodes and edges from the raw graph:

```bash
curl -fsS http://localhost:4422/graph.json | jq '{nodes: (.nodes | length), edges: (.edges | length)}'
```

Save the graph locally:

```bash
curl -fsS http://localhost:4422/graph.json -o /tmp/buildscope-graph.json
```

Save the details sidecar too:

```bash
curl -fsS http://localhost:4422/graph.details.json -o /tmp/buildscope-graph.details.json
```

Reuse the backend analysis for a saved graph file:

```bash
buildscope view /tmp/buildscope-graph.json --addr :4422
curl -fsS "http://localhost:4422/analysis.json?top=15" | jq
```

If the details sidecar is not adjacent to the graph, serve both explicitly:

```bash
buildscope serve --graph /tmp/buildscope-graph.json --details /tmp/buildscope-graph.details.json --addr :4422
curl -fsS "http://localhost:4422/analysis.json?top=15&focus=//pkg:target" | jq
```

## Port Overrides

The repo uses these environment variables:

- `GO_PORT` for the Go server in dev mode
- `VITE_PORT` for the Vite dev server
- `SERVER_PORT` for the production wrapper scripts

When those are overridden, derive the correct URL before fetching `/graph.json`.
