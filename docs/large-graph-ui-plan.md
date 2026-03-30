# Large Graph UI Plan

BuildScope works well when the graph is small enough to inspect directly. On large, entangled graphs, the current "show everything at once" node-link view turns into a hairball: edges dominate the screen, selection context is weak, and even a smooth renderer would still be hard to read.

## Problems To Solve

- Too many raw edges are visible at once, so structure collapses into dense wedges and bands.
- The main canvas is doing too many jobs at once: overview, exploration, diagnosis, and path tracing.
- Selection improves context, but the selected node is still buried inside the full graph.
- SCC hotspots are visually marked, but still expanded into many raw nodes in the default view.
- Large graph navigation is expensive because the UI treats all graph detail as equally important at all zoom levels.

## Product Direction

The UI should move from a single raw graph view to a 3-level model:

1. Overview
   Show a condensed graph instead of every target. Use SCCs, packages, or directory groups as meta-nodes.
2. Focus
   When a node or cluster is selected, switch the main canvas to a scoped neighborhood view.
3. Detail
   Show metrics, members, paths, and filters in a side panel instead of forcing every question through the canvas.

## Proposed UX Changes

### 1. Condensed Large-Graph Mode

For sufficiently large graphs, the default view should be a condensed graph:

- Collapse SCCs into single meta-nodes by default.
- Group non-cyclic nodes by Bazel package or directory prefix.
- Size meta-nodes by node count, fan-in, fan-out, or hotspot score.
- Expand clusters only on demand.

This should become the default large-graph entry point, not an optional secondary mode.

### 2. Selection-Scoped Exploration

Selection should change the graph view, not just the side status text:

- Hide or strongly dim unrelated nodes and edges.
- Support scoped modes:
  - `Neighborhood (1 hop)`
  - `Neighborhood (2 hops)`
  - `Upstream dependents`
  - `Downstream dependencies`
  - `Paths to / from selection`
- Keep the selected node centered while exploring within that scope.

For diagnosis, users usually want a local explanation, not the full graph.

### 3. Edge Aggregation And LOD

Raw edges should not be drawn at every zoom level:

- At low zoom, render aggregated cluster-to-cluster edges instead of every raw dependency.
- At medium zoom, expand only the active cluster or selected neighborhood.
- At high zoom, render raw edges for the visible focus area.
- Use width, opacity, or counts to encode aggregated edge volume.

This reduces both visual noise and rendering cost.

### 4. Multiple Views For Multiple Tasks

The canvas should not be the only interface for understanding the graph. Add side views such as:

- Top hotspots
- Largest SCCs
- Highest fan-in / fan-out nodes
- Package or cluster table
- Path finder between two nodes
- Dependency tree for the selected node

This makes the product useful even when the graph drawing itself is too dense to inspect directly.

### 5. Stronger Visual Hierarchy

The current rendering gives too much visual weight to unrelated context. Improve emphasis:

- Make unrelated edges much fainter.
- Use separate colors for upstream vs downstream flows.
- Show labels only for selected, hovered, searched, or top-ranked nodes.
- Add visible cluster boundaries or hulls in overview mode.
- Use more deliberate highlight states for selected paths and expanded groups.

### 6. Task-First Controls

The current controls are renderer-oriented. Large-graph users think in terms of tasks:

- Find hotspots
- Find cycles
- Explain why A depends on B
- Show what depends on X
- Show what X depends on
- Expand package

The UI should lead with those workflows instead of raw rendering modes.

## Implementation Plan

### Phase 1: Make Large Graphs Legible

- Add a condensed graph model for SCC/package-level overview.
- Add selection-scoped neighborhood views.
- Add edge aggregation between collapsed clusters.

Success criteria:

- Large graphs open in an overview that is understandable without immediate zooming.
- Selecting a node gives a readable local view instead of leaving the full graph unchanged.

### Phase 2: Add Better Analysis Tools

- Add hotspot, SCC, and degree-ranked side panels.
- Add path-finding UI between two nodes.
- Add package/directory filters and graph slicing controls.

Success criteria:

- Users can answer common dependency questions without relying entirely on the canvas.

### Phase 3: Improve Rendering And Interaction

- Add stronger level-of-detail rules for nodes, labels, and edges.
- Normalize node sizing across modes so one mode does not become visually dominant.
- Continue reducing redraw churn during pan, zoom, and selection.

Success criteria:

- Navigation remains smooth while preserving useful context at each zoom level.

## Codebase Touchpoints

These changes mostly affect the frontend:

- `ui/src/graphLayout.ts`
  Add condensed graph construction, SCC/package grouping, and alternate layouts for overview vs focus mode.
- `ui/src/graphWorker.ts`
  Move condensed graph preprocessing and ranking work off the main thread.
- `ui/src/GraphVisualization.ts`
  Add level-of-detail rendering, focus scoping, cluster expansion, and aggregated edge drawing.
- `ui/src/ui.ts`
  Add task-first controls, scope mode controls, and side panels.
- `ui/src/main.ts`
  Coordinate worker output, UI state, and view-mode switching.

## Recommended Next Step

Implement condensed large-graph mode first. It changes the product the most with the least ambiguity:

- build SCC/package meta-nodes
- render the condensed graph by default for large inputs
- expand into raw nodes only when the user drills in

That is the highest-leverage improvement for both usability and performance.
