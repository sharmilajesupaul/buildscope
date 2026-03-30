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

The viewer then loads `/graph.json`, sanitizes the graph, computes layout in a worker, and renders the result with Pixi.js.

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
