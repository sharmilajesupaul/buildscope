# BuildScope

BuildScope is a local-first Bazel build graph explorer. It ingests `query`/`aquery` graphs plus timing data from a `bazel build --profile`/BEP run, then renders a high-performance 2D WebGL view to spot bottlenecks, fan-in hotspots, and critical paths.

## Tech choices
- CLI/server: Go (fast to ship, simple static binary, solid proto tooling). Consider Rust+WASM later for heavy layout/stats in-browser.
- UI: Vite + TypeScript, WebGL2 via `regl`, React overlay.

## Current state
- Repo scaffold only; no code yet.
- Validated commands on `bazel-examples`:
  - Target graph: `bazel query 'deps(<target>)' --output=proto`
  - Action graph: `bazel aquery 'deps(<target>)' --output=jsonproto`
  - Timings: `bazel build <target> --profile=/tmp/profile.gz --build_event_binary_file=/tmp/bep.pb`

## Proposed workflow
1) Extract: `buildscope extract //path:target --profile /tmp/profile.gz --bep /tmp/bep.pb --out graph.json`
   - Runs/reads query + aquery, joins profile/BEP timings, emits normalized graph JSON.
2) View: `buildscope view graph.json` (serves the UI bundle and opens `http://localhost:4400`).
3) CLI helpers (later): `buildscope hotspots graph.json`, `buildscope diff old.json new.json`.

## Planned components
- `cli/`: Go or Rust extractor and server binary.
- `ui/`: Vite/TypeScript + WebGL2 (`regl`) renderer with React overlay.
- `docs/`: schema, command docs, and UX notes.

## Milestones
1) Schema + command spec
   - Define normalized JSON: nodes (targets/actions), edges (deps/IO), metrics (duration/critical path/cache), meta (workspace/config/version).
   - Specify `buildscope extract` flags and required Bazel commands.
2) Extractor MVP (Go)
   - Generate/load Bazel protos for query/aquery/BEP/profile.
   - Implement `buildscope extract` to run/parse query+aquery+profile/BEP and emit `graph.json`.
   - Include validation and schema versioning.
3) Viewer MVP
   - Bundle UI assets; `buildscope view graph.json` serves canvas + controls.
   - Render nodes/edges from JSON, pan/zoom, hover/select, search.
4) Insights
   - Critical-path highlight, heatmap by duration/size, top fan-in/out, package collapse, minimap.
5) Polish
   - Diff mode, hotspots CLI, screenshots/export, bookmarks, LOD/bundling improvements.

## Immediate next actions
- Add schema draft in `docs/` and lock CLI flags.
- Scaffold Go module and `cmd/buildscope` with stub commands.
- Create UI skeleton that loads a sample `graph.json`.

## Tooling
- Node version pinned via `.node-version` (v24.11.1). Use `fnm`/`nvm` to match.
