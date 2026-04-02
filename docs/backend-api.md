# Backend API

BuildScope serves a small local JSON API from the Go server. The frontend still renders from the raw graph at `/graph.json`. The newer analysis endpoint at `/analysis.json` is additive and exists for tooling, automation, and Codex-style graph inspection. Focused split guidance lives at `/decomposition.json` so the heavier per-target seam analysis stays out of the global shortlist. When extraction runs with enrichment enabled, BuildScope can also serve `/graph.details.json` as a sidecar with larger direct input/output lists per target.

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
      "opportunityScore": 246.8,
      "impactScore": 6.3,
      "massScore": 5.5,
      "shardabilityScore": 7.1,
      "transitiveInDegree": 77,
      "outDegree": 11,
      "transitiveOutDegree": 38,
      "sccSize": 1,
      "dependencyPackageCount": 4,
      "dependencyPackageEntropy": 1.8,
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
    "opportunityScore": 246.8,
    "massScore": 5.5,
    "shardabilityScore": 7.1,
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

### `GET /decomposition.json`

- Returns focused split guidance for one target.
- Query params:
  - `target`: required Bazel target label

Example:

```bash
curl -fsS "http://localhost:4422/decomposition.json?target=//pkg:hub" | jq
```

Representative response:

```json
{
  "target": "//pkg:hub",
  "label": "//pkg:hub",
  "eligible": true,
  "method": "package-domain partition over direct rule dependencies",
  "impactScore": 6.3,
  "massScore": 5.5,
  "shardabilityScore": 7.1,
  "directDependencyCount": 11,
  "directRuleDependencyCount": 8,
  "communityCount": 3,
  "largestCommunityShare": 0.5,
  "crossCommunityEdgeRatio": 0.18,
  "communities": [
    {
      "id": "//pkg/auth",
      "title": "//pkg/auth",
      "nodeCount": 4,
      "share": 0.5,
      "internalEdgeCount": 3,
      "crossCommunityEdgeCount": 1,
      "sampleLabels": ["//pkg/auth:api", "//pkg/auth:session"]
    }
  ],
  "recommendations": [
    "Direct rule deps already separate into low-coupling dependency domains. Those domains are the cleanest shard candidates."
  ]
}
```

### `GET /file-focus.json`

- Returns a file-centric drill-down for one file label already present in the current graph.
- Query params:
  - `label`: required exact Bazel file label, for example `//pkg:file.go`
- Response shape:

```json
{
  "label": "//pkg:file.go",
  "nodeType": "source-file",
  "rootTarget": "//app:bin",
  "currentGraphDirectConsumerCount": 2,
  "currentGraphDirectConsumers": ["//app:bin", "//pkg:lib"],
  "currentGraphTransitiveConsumerCount": 2,
  "topCurrentGraphConsumers": [
    {
      "id": "//pkg:lib",
      "direct": true,
      "opportunityScore": 98.4,
      "massScore": 4.8
    }
  ],
  "liveQueryAvailable": true,
  "workspaceReverseDependencyCount": 14,
  "workspaceReverseDependencySample": ["//app:bin", "//tools:lint"]
}
```

## What The Analysis Means

- `topImpactTargets` ranks nodes with broad downstream blast radius, primarily by `transitiveInDegree`.
- `topBreakupCandidates` ranks shared hubs by a heavier-weight opportunity model that combines impact, build mass, and shardability.
- `decomposition.json` answers the second-stage question: how one selected target could split, using direct rule dependency domains and cross-group coupling.
- `topSourceHeavyTargets` ranks rules with large direct source or input surfaces.
- `topOutputHeavyTargets` ranks rules with large generated output surfaces or action footprints.
- `cyclicHotspots` is kept for completeness, but Bazel target graphs are usually acyclic, so DAG signals are the primary breakup guidance.
- `focus` returns one target's immediate neighborhood and enriched summary metrics without forcing the caller to reconstruct that slice from the raw graph.
- `decomposition.json` stays focused so the UI and MCP can inspect one target's split seams without recomputing the whole shortlist.
- `file-focus.json` answers a different question: which targets in the current graph consume one file, and, when the server came from `buildscope open`, which workspace targets reverse-depend on that file according to live Bazel query output.

The legacy pressure score is still returned for compatibility:

```text
log2(transitiveInDegree + 1) * max(1, outDegree)
+ log2(inputFileCount + 1)
+ log2(outputFileCount + 1)
+ log2(actionCount + 1)
```

The breakup ranking itself is now driven by `opportunityScore`, which combines:

- `impactScore`: downstream blast radius
- `massScore`: build-heavy surface such as actions, input bytes, output bytes, and source bytes
- `shardabilityScore`: structural breadth plus dependency-package diversity

Tiny shared leaves are explicitly demoted when they are central but still light and structurally narrow.

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
- serves the UI, `/graph.json`, `/analysis.json`, `/decomposition.json`, and `/graph.details.json` when the sidecar exists

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

In dev mode, Vite proxies only `/graph.json`. Fetch `/analysis.json` and `/decomposition.json` from the Go server directly.

- `http://localhost:4400/graph.json`
- `http://localhost:4422/graph.json`
- `http://localhost:4422/analysis.json`
- `http://localhost:4422/decomposition.json?target=//pkg:target`
- `http://localhost:4422/graph.details.json`
- `http://localhost:4422/file-focus.json?label=//pkg:file.go`

## Notes

- The UI contract remains `/graph.json`; adding `/analysis.json`, `/decomposition.json`, and `/graph.details.json` does not change the frontend data path.
- `/analysis.json` is present only in versions that include the Go-side analysis endpoint.
- `/decomposition.json` is present only in versions that include the focused decomposition endpoint.
- `/graph.details.json` is served only when the graph payload has a details sidecar.
- `/file-focus.json` works for any served graph snapshot, and adds live workspace reverse-dependency data only when the server was started from `buildscope open` with access to the Bazel workspace.
- If `GO_PORT`, `VITE_PORT`, or `SERVER_PORT` are overridden, derive the correct URL from those values before fetching the API.
