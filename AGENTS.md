# AGENTS.md

This file is a working guide for coding agents in this repo. Use it to find the right code quickly, choose the right validation path, and avoid wandering through the wrong layer.

## What This Is

BuildScope is a local-first Bazel dependency explorer. It extracts dependency graphs with `bazel query`, serves them from a small Go binary, and renders them in an interactive WebGL UI.

## Docs Map

- `README.md` - user-facing install and CLI usage
- `docs/bazel-graph-flow.md` - canonical Mermaid architecture and extraction flow
- `fixtures/README.md` - sample graphs and fixture workflow

## Read This First

- If the task is about CLI behavior, start in `cli/cmd/buildscope/main.go`.
- If the task is about graph parsing, extraction, or workspace validation, stay in `cli/cmd/buildscope/`.
- If the task is about layout, hotspots, or graph-derived node metrics in the browser, start in `ui/src/graphLayout.ts` and `ui/src/graphWorker.ts`.
- If the task is about ranking lists or side-panel summaries, inspect both `ui/src/graphAnalysis.ts` and `ui/src/main.ts`.
- If the task is about rendering, interaction, zoom, selection, or node visuals, start in `ui/src/GraphVisualization.ts`.
- If the task is about repeatable repro cases, check `fixtures/README.md` and use a fixture graph before debugging with an ad hoc Bazel target.

## Common Commands

```bash
# One-time local setup
./setup.sh

# Development stack: Go server on :4422 + Vite on :4400
./dev.sh
./dev.sh path/to/graph.json

# Repo checkout helper for extracting a live Bazel target and serving the viewer
./buildscope.sh //your/package:target

# Frontend
npm --prefix ui run dev
npm --prefix ui run build
npm --prefix ui run typecheck
cd ui && npm test
cd ui && npm test -- --run <file>

# Backend
cd cli && go test ./...
```

Ports can be overridden with `GO_PORT`, `VITE_PORT`, and `SERVER_PORT`.

## CLI Shortcuts

```bash
buildscope demo
buildscope view /path/to/graph.json
buildscope open //your/package:target --workdir /path/to/workspace
buildscope extract --target //your/package:target --workdir /path/to/workspace --out /tmp/graph.json
buildscope version
```

## Architecture

The canonical extraction and analysis diagram lives in [docs/bazel-graph-flow.md](docs/bazel-graph-flow.md).

Use that doc when you need the end-to-end Mermaid flow for:

- `buildscope open` vs `buildscope extract`
- workspace validation and `bazel query`
- JSON graph emission and `/graph.json`
- frontend worker analysis and hotspot or breakup ranking

Short version:

- The Go CLI extracts or serves graphs.
- The browser fetches `/graph.json`.
- Expensive graph work runs in a worker.
- Pixi renders the positioned graph.
- Ranked summaries currently have both browser-side helpers and a backend analysis surface, so check both before assuming there is only one source of truth.

## File Map

- [`cli/cmd/buildscope/main.go`](cli/cmd/buildscope/main.go) - CLI commands, workspace validation, graph serving, streaming parse, `/graph.json`, `/analysis.json`
- [`cli/cmd/buildscope/analysis.go`](cli/cmd/buildscope/analysis.go) - backend graph sanitization, SCC analysis, hotspot ranking, breakup recommendations, analysis response shaping
- [`ui/src/graphLoader.ts`](ui/src/graphLoader.ts) - client graph fetch path
- [`ui/src/graphWorker.ts`](ui/src/graphWorker.ts) - worker boundary for expensive graph work
- [`ui/src/graphLayout.ts`](ui/src/graphLayout.ts) - graph types, sanitization, layout, SCCs, weighting
- [`ui/src/graphAnalysis.ts`](ui/src/graphAnalysis.ts) - browser-side ranking helpers for impact and breakup candidates
- [`ui/src/GraphVisualization.ts`](ui/src/GraphVisualization.ts) - Pixi scene graph, zoom/pan, selection, rendering
- [`ui/src/ui.ts`](ui/src/ui.ts) - DOM controls and side panels
- [`ui/src/main.ts`](ui/src/main.ts) - app wiring, event flow, and ranking panel updates

## Data Flow Notes

1. `open` runs extraction into a temp graph file and then serves it. `view` skips extraction and serves an existing graph JSON file. `demo` serves the bundled sample graph.
2. Graph extraction is streaming. `parseQueryGraphStreaming` reads `bazel query ... --output=graph` incrementally so large graphs do not need to be buffered first.
3. The Go server serves static UI assets plus `/graph.json`. It also exposes `/analysis.json`, so do not assume all ranking logic is frontend-only.
4. The browser fetches the graph through [`ui/src/graphLoader.ts`](ui/src/graphLoader.ts).
5. The heavy graph pipeline runs in [`ui/src/graphWorker.ts`](ui/src/graphWorker.ts), which calls into [`ui/src/graphLayout.ts`](ui/src/graphLayout.ts).
6. Rendering is handled by [`ui/src/GraphVisualization.ts`](ui/src/GraphVisualization.ts). UI controls and app wiring live in [`ui/src/ui.ts`](ui/src/ui.ts) and [`ui/src/main.ts`](ui/src/main.ts).

## Validation Guide

- UI-only changes: `npm --prefix ui run typecheck`, `cd ui && npm test`
- Go-only changes: `cd cli && go test ./...`
- Cross-stack changes: run both suites, then smoke test with `./dev.sh` or `./buildscope.sh //your/package:target`
- Docs-only changes: no code tests needed, but keep command examples aligned with the actual CLI help
- Fixture-related changes: verify the fixture workflow in `fixtures/README.md`

## Working Notes For Agents

- `buildscope.sh`, `dev.sh`, `setup.sh`, and `install.sh` are thin wrappers around `scripts/*`. If behavior changes, inspect the script implementation before editing the wrapper.
- Prefer fixture graphs when you want repeatable UI checks.
- If you change shipped frontend assets, refresh the embedded bundle with `./scripts/refresh-embedded-ui.sh`.
- For extraction bugs, inspect both workspace validation and the streaming parser before touching the frontend.
- For ranking bugs, check whether the behavior comes from `ui/src/graphAnalysis.ts`, `ui/src/graphLayout.ts`, or `cli/cmd/buildscope/analysis.go`.
- For rendering bugs, separate layout issues from Pixi rendering issues before patching.
