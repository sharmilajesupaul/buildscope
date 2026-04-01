# Backend API

BuildScope serves a small local JSON API from the Go server. The frontend still renders from the raw graph at `/graph.json`. The newer analysis endpoint at `/analysis.json` is additive and exists for tooling, automation, and Codex-style graph inspection. When extraction runs with enrichment enabled, BuildScope can also serve `/graph.details.json` as a sidecar with larger direct input/output lists per target.

## Endpoints

### `GET /graph.json`

- Returns the raw dependency graph consumed by the UI.
- Response shape:

```json
{
  "nodes": [
    { "id": "//app:bin", "label": "//app:bin" },
    { "id": "//lib:core", "label": "//lib:core" }
  ],
  "edges": [
    { "source": "//app:bin", "target": "//lib:core" }
  ]
}
```

When enrichment is enabled, `graph.json` also carries node summaries such as:

- `nodeType`
- `ruleKind`
- `packageName`
- `sourceFileCount` / `sourceBytes`
- `inputFileCount` / `inputBytes`
- `outputFileCount` / `outputBytes`
- `actionCount`
- `mnemonicSummary`
- `topFiles`
- `topOutputs`

### `GET /graph.details.json`

- Optional sidecar endpoint served when a details payload is available.
- Response shape:

```json
{
  "nodes": {
    "//pkg:target": {
      "directInputs": [
        { "label": "//pkg:file.go", "kind": "source-file", "sizeBytes": 2048 }
      ],
      "directOutputs": [
        { "path": "bazel-out/k8-fastbuild/bin/pkg/out.pb", "kind": "output", "sizeBytes": 65536 }
      ],
      "mnemonics": [
        { "mnemonic": "GoCompilePkg", "count": 4 }
      ]
    }
  }
}
```

### `GET /analysis.json`

- Returns a precomputed analysis of the same graph served at `/graph.json`.
- Query params:
  - `top`: optional positive integer; defaults to `10`, capped at `100`
  - `focus`: optional Bazel label for target-level drill-down

Example:

```bash
curl -fsS "http://localhost:4422/analysis.json?top=15&focus=//pkg:target" | jq
```

Representative response:

```json
{
  "schemaVersion": 2,
  "analysisMode": "analyze",
  "detailsPath": "graph.details.json",
  "nodeCount": 593,
  "edgeCount": 1675,
  "ruleTargetCount": 411,
  "hotspotCount": 54,
  "largestHotspotSize": 3,
  "topImpactTargets": [
    {
      "id": "//pkg:lib",
      "label": "//pkg:lib",
      "transitiveInDegree": 184,
      "outDegree": 2,
      "transitiveOutDegree": 9,
      "sccSize": 1,
      "hotspotRank": 190,
      "isHotspot": true,
      "sourceFileCount": 12,
      "sourceBytes": 28104
    }
  ],
  "topBreakupCandidates": [
    {
      "id": "//pkg:hub",
      "label": "//pkg:hub",
      "pressure": 91.4,
      "transitiveInDegree": 77,
      "outDegree": 11,
      "transitiveOutDegree": 38,
      "sccSize": 1,
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
      "label": "//pkg:heavy_srcs",
      "sourceFileCount": 44,
      "sourceBytes": 131072
    }
  ],
  "topOutputHeavyTargets": [
    {
      "id": "//pkg:generator",
      "label": "//pkg:generator",
      "outputFileCount": 8,
      "outputBytes": 5242880,
      "actionCount": 17
    }
  ],
  "cyclicHotspots": [
    {
      "members": ["//pkg:a", "//pkg:b"],
      "size": 2
    }
  ],
  "focus": {
    "id": "//pkg:hub",
    "label": "//pkg:hub",
    "sourceFileCount": 12,
    "outputBytes": 5242880,
    "topOutputs": [
      { "path": "bazel-out/k8-fastbuild/bin/pkg/out.pb", "sizeBytes": 1048576 }
    ],
    "directDependencies": ["//dep:a", "//dep:b"],
    "directDependents": ["//app:bin"]
  }
}
```

## What The Analysis Means

- `topImpactTargets` ranks nodes with broad downstream blast radius, primarily by `transitiveInDegree`.
- `topBreakupCandidates` ranks shared hubs that are both widely depended on and structurally broad enough to be worth splitting.
- `topSourceHeavyTargets` ranks rules with large direct source or input surfaces.
- `topOutputHeavyTargets` ranks rules with large generated output surfaces or action footprints.
- `cyclicHotspots` surfaces SCCs so cyclic clusters can be broken before finer cleanup.
- `focus` returns one target's immediate neighborhood and enriched summary metrics without forcing the caller to reconstruct that slice from the raw graph.

The breakup ranking uses the same pressure score described in the graph-flow doc:

```text
log2(transitiveInDegree + 1) * max(1, outDegree)
+ log2(inputFileCount + 1)
+ log2(outputFileCount + 1)
+ log2(actionCount + 1)
```

## How To Expose The API

### Analyze a live Bazel target

```bash
buildscope open //your/package:target --workdir /path/to/workspace --addr 127.0.0.1:4422
```

That path:

- validates the Bazel workspace
- runs `bazel query 'deps(//your/package:target)' --output=graph --keep_going`
- enriches the graph in `analyze` mode by default
- streams the result into a temp graph file
- serves the UI, `/graph.json`, `/analysis.json`, and `/graph.details.json` when the sidecar exists

To write an enriched graph explicitly:

```bash
buildscope extract -target //your/package:target -workdir /path/to/workspace -out /tmp/graph.json -enrich analyze
```

### Serve an existing graph file

```bash
buildscope view /path/to/graph.json --addr 127.0.0.1:4422
```

### Use the low-level serve command

```bash
buildscope serve --graph /path/to/graph.json --addr 127.0.0.1:4422
```

### Run the development stack

```bash
./dev.sh fixtures/buildscope_large_angular_app.json
```

Default ports:

- Go API server: `http://localhost:4422`
- Vite dev server: `http://localhost:4400`

In dev mode, Vite proxies only `/graph.json`. Fetch `/analysis.json` from the Go server directly.

- `http://localhost:4400/graph.json`
- `http://localhost:4422/graph.json`
- `http://localhost:4422/analysis.json`
- `http://localhost:4422/graph.details.json`

## Notes

- The UI contract remains `/graph.json`; adding `/analysis.json` and `/graph.details.json` does not change the frontend data path.
- `/analysis.json` is present only in versions that include the Go-side analysis endpoint.
- `/graph.details.json` is served only when the graph payload has a details sidecar.
- If `GO_PORT`, `VITE_PORT`, or `SERVER_PORT` are overridden, derive the correct URL from those values before fetching the API.
