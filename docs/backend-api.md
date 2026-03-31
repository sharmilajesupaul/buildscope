# Backend API

BuildScope serves a small local JSON API from the Go server. The frontend still renders from the raw graph at `/graph.json`. The newer analysis endpoint at `/analysis.json` is additive and exists for tooling, automation, and Codex-style graph inspection.

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
  "nodeCount": 593,
  "edgeCount": 1675,
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
      "isHotspot": true
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
      "recommendations": [
        "Reduce direct dependency fan-out."
      ]
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
    "directDependencies": ["//dep:a", "//dep:b"],
    "directDependents": ["//app:bin"]
  }
}
```

## What The Analysis Means

- `topImpactTargets` ranks nodes with broad downstream blast radius, primarily by `transitiveInDegree`.
- `topBreakupCandidates` ranks shared hubs that are both widely depended on and structurally broad enough to be worth splitting.
- `cyclicHotspots` surfaces SCCs so cyclic clusters can be broken before finer cleanup.
- `focus` returns one target's immediate neighborhood and metrics without forcing the caller to reconstruct that slice from the raw graph.

The breakup ranking uses the same pressure score described in the graph-flow doc:

```text
log2(transitiveInDegree + 1) * max(1, outDegree)
```

## How To Expose The API

### Analyze a live Bazel target

```bash
buildscope open //your/package:target --workdir /path/to/workspace --addr :4422
```

That path:

- validates the Bazel workspace
- runs `bazel query 'deps(//your/package:target)' --output=graph --keep_going`
- streams the result into a temp graph file
- serves the UI, `/graph.json`, and `/analysis.json`

### Serve an existing graph file

```bash
buildscope view /path/to/graph.json --addr :4422
```

### Use the low-level serve command

```bash
buildscope serve --graph /path/to/graph.json --addr :4422
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

## Notes

- The UI contract remains `/graph.json`; adding `/analysis.json` does not change the frontend data path.
- `/analysis.json` is present only in versions that include the Go-side analysis endpoint.
- If `GO_PORT`, `VITE_PORT`, or `SERVER_PORT` are overridden, derive the correct URL from those values before fetching the API.
