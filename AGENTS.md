# AGENTS.md

This file provides guidance to coding agents working with this repository.

## What This Is

BuildScope is a local-first Bazel build graph explorer. It extracts dependency graphs via `bazel query` and renders them in an interactive 2D WebGL UI.

## Commands

```bash
# Development (Go server on :4422 + Vite on :4400)
./dev.sh [optional/graph/path.json]

# Production (extract graph, build UI, serve)
./buildscope.sh //your/package:target

# UI only
npm --prefix ui run dev       # dev server
npm --prefix ui run build     # production build
cd ui && npm test             # run tests (Vitest)
cd ui && npm test -- --run <file>  # run single test file
```

Ports can be overridden via env vars: `GO_PORT`, `VITE_PORT`, `SERVER_PORT`.

## Architecture

**Data flow:**
1. CLI (`cli/cmd/buildscope/main.go`) runs `bazel query deps(target) --output=graph` with a streaming parser (handles 50k+ nodes)
2. Graph JSON written to disk; Go HTTP server serves it at `/graph.json`
3. Vite dev server proxies to Go on port 4422
4. Frontend fetches graph → sanitizes → computes layout → renders with Pixi.js

**Key frontend modules (`ui/src/`):**
- `graphLayout.ts` — core algorithms: Tarjan SCC, hotspot scoring, layered layout, transitive closure, weight recalculation
- `GraphVisualization.ts` — Pixi.js rendering engine (nodes, edges, zoom/pan, selection)
- `graphLoader.ts` — fetches and sanitizes graph from `/graph.json`
- `main.ts` — entry point and event wiring
- `ui.ts` — UI controls (search, zoom, weight mode selector)

**Tech stack:**
- Frontend: TypeScript, Pixi.js 7 (WebGL), Vite, Vitest + happy-dom
- Backend: Go 1.22 (stdlib only), single binary

**Weight visualization modes:** uniform, total, inputs, outputs, transitive, hotspots — all computed in `graphLayout.ts`.
