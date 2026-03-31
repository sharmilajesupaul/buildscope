<p align="center">
  <img src="ui/public/brand/buildscope-badge.svg" alt="BuildScope" width="360" />
</p>

# BuildScope

BuildScope is a local-first Bazel dependency explorer. Point it at a Bazel target, stream the graph out of `bazel query`, and inspect the result in a fast WebGL UI.

## Why BuildScope

- Runs entirely on your machine. No hosted backend, database, or repo upload.
- Extracts real Bazel dependency graphs instead of relying on hand-built metadata.
- Keeps layout work off the main thread so large graphs stay navigable.
- Ships with a small fixture corpus for repeatable UI and performance checks.

## Quick Start

From the root of a Bazel workspace:

```bash
/path/to/buildscope/buildscope.sh //your/package:target
```

That command:

1. runs the graph extraction step against your current workspace
2. builds the UI if needed
3. starts the local viewer on `http://localhost:4422` by default

Override the port with `SERVER_PORT` if needed:

```bash
SERVER_PORT=4500 /path/to/buildscope/buildscope.sh //your/package:target
```

## How It Gets The Graph

The core extraction path is the `extract` command:

```bash
cd cli
go run ./cmd/buildscope extract \
  -target //your/package:target \
  -workdir /path/to/bazel/workspace \
  -out /tmp/graph.json
```

Under the hood, that command shells out to:

```bash
bazel query 'deps(//your/package:target)' --output=graph --keep_going
```

BuildScope streams Bazel's graph output, converts it into a plain JSON shape, and writes:

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

The detailed extraction and analysis path looks like this:

```mermaid
flowchart TD
  subgraph EntryPoints["CLI entrypoints"]
    A["./buildscope.sh //pkg:target"]
    B["buildscope open //pkg:target --workdir /repo --addr :4422"]
    C["buildscope extract -target //pkg:target -workdir /repo -out /tmp/graph.json"]
  end

  A --> B
  B --> D
  C --> D

  D["validateWorkspaceDir<br/>requires WORKSPACE, WORKSPACE.bazel, or MODULE.bazel"]
  D --> E

  E{"Which command path?"}
  E -->|open| F["openCommand creates temp file<br/>/tmp/buildscope-graph-*.json"]
  E -->|extract| G["extract writes to the explicit -out path"]

  F --> H
  G --> H

  H["extractGraph runs exactly this Bazel command<br/>bazel query 'deps(target)' --output=graph --keep_going"]
  H --> I
  I["parseQueryGraphStreaming reads stdout line by line<br/>ignores Graphviz styling lines<br/>splits multiline labels<br/>dedupes nodes and edges"]
  I --> J["emit JSON graph<br/>{ nodes, edges }"]

  J -->|extract| K["graph.json written to disk"]
  J -->|open| L["serveGraph serves UI files and /graph.json"]

  L --> M["browser fetches /graph.json"]
  K --> N["same JSON can later be opened with buildscope view"]
  N --> M

  subgraph Worker["Frontend worker analysis"]
    M --> O["sanitizeGraph removes malformed ids and dangling edges"]
    O --> P["compute direct inDegree and outDegree"]
    P --> Q["calculateTransitiveClosure<br/>BFS over incoming and outgoing edges<br/>produces transitiveInDegree and transitiveOutDegree"]
    Q --> R["calculateStronglyConnectedComponents<br/>iterative Tarjan SCC over the dependency graph"]
    R --> S["markHighImpactHotspots<br/>cyclic SCCs become hotspots first<br/>then high transitiveInDegree DAG nodes are ranked"]
    S --> T["pressure score for break-up targets<br/>log2(transitiveInDegree + 1) * max(1, outDegree)"]
    T --> U["layeredLayout for normal graphs<br/>compactGridLayout for very large graphs"]
  end

  U --> V["Pixi.js renders graph, Top impact, and Break-up candidates"]
```

More explicitly:

- Bazel is only responsible for raw dependency extraction. The concrete command BuildScope runs is `bazel query 'deps(<target>)' --output=graph --keep_going`.
- `buildscope open` and `buildscope extract` share the same extraction implementation. The only difference is the output destination: `open` writes to a temp file and immediately serves it, while `extract` writes to the user-provided `-out` path.
- The streaming parser is deliberate: it consumes Bazel's Graphviz output from stdout as it arrives, skips style directives like `node` and `edge`, splits multiline labels, and deduplicates node ids and edges before writing JSON.
- High-impact targets are not computed by Bazel. After the graph is loaded in the browser, the worker computes `transitiveInDegree` and `transitiveOutDegree`, runs Tarjan SCC detection, and then marks hotspots.
- Cycles are treated as immediate hotspots because they are tightly coupled clusters. For mostly acyclic Bazel graphs, the worker also promotes unusually shared nodes by ranking the upper slice of `transitiveInDegree` values.
- Break-up candidates are also not a Bazel feature. They come from the local `pressure` score `log2(transitiveInDegree + 1) * max(1, outDegree)`, which intentionally favors broad shared hubs that also fan out into many direct dependencies.

The result is that Bazel provides the exact dependency edges, while BuildScope adds the higher-level analysis needed to answer "what is most central?" and "what should be broken up first?"

## Development

Prerequisites:

- Node.js `24.11.1` or newer
- Go `1.22+`
- Bazel, if you want to extract graphs from a live workspace

Install UI dependencies:

```bash
npm --prefix ui install
```

Start the local development stack:

```bash
./dev.sh
```

Or point the UI at a specific graph JSON file:

```bash
./dev.sh path/to/graph.json
```

Direct commands:

```bash
npm --prefix ui run dev
npm --prefix ui run build
npm --prefix ui test
cd cli && go test ./...
```

Ports can be overridden with `GO_PORT`, `VITE_PORT`, and `SERVER_PORT`.

## Fixture Corpus

BuildScope keeps a small fixture corpus in-repo so UI changes and layout changes can be checked against repeatable graphs instead of ad hoc screenshots.

See [fixtures/README.md](fixtures/README.md) for the corpus and refresh workflow.

## Repository Layout

- `cli/` Go CLI for graph extraction and local serving
- `ui/` TypeScript frontend and Pixi.js renderer
- `fixtures/` checked-in sample graphs and fixture metadata
- `scripts/` helper scripts for local development and fixture maintenance

## Contributing

Keep changes focused, run the relevant checks, and include enough context in a PR for someone new to the project to understand the user-facing impact.
