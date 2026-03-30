# UI Vision Roadmap

For immediate implementation order, use `docs/ui-execution-plan.md`. This document remains the broader vision/background note.

This document describes the next major UI direction for BuildScope. The goal is not only to make the graph prettier, but to make it more useful for real dependency debugging while keeping large graphs fast.

This roadmap complements `docs/large-graph-ui-plan.md`, which focuses on large-graph structure and interaction. This document focuses on product feel, visual direction, workflows, and performance guardrails.

## Goals

- Make the UI feel intentional, modern, and memorable.
- Make common dependency questions easy to answer without fighting the graph.
- Keep large graphs smooth and readable.
- Avoid shipping visual improvements that quietly reintroduce renderer regressions.

## Product Principles

### 1. Search-first, not graph-first

Most users are trying to answer a question:

- Why does A depend on B?
- What depends on X?
- Where are the hottest modules?
- Where are the cycles?

The graph should support those tasks, but the UI should lead with them.

### 2. Overview, focus, detail

The product should have 3 clear levels:

- Overview: condensed graph, rankings, packages, clusters
- Focus: selected neighborhood, paths, upstream/downstream flows
- Detail: node metadata, members, paths, actions, filters

The current product overuses one canvas for all 3 jobs.

### 3. Beauty must reinforce hierarchy

Visual polish should make the graph easier to read:

- better panel composition
- stronger typography
- clearer spacing
- cleaner color semantics
- more deliberate emphasis for selected paths, clusters, and hotspots

Decoration without hierarchy is noise.

### 4. Performance is a feature

No design change should require drawing the full raw graph at all zoom levels.

## Proposed Experience

### Entry State

When a large graph opens, the user should not land in a raw hairball. The default should be:

- condensed graph mode for large inputs
- visible rankings and summaries in a side panel
- search box with immediate focus
- obvious top actions: `Find hotspots`, `Find cycles`, `Trace path`, `Expand cluster`

### Main Layout

Use a 3-column shell:

1. Left rail
   Search, task shortcuts, saved filters, view mode
2. Center canvas
   Graph overview or scoped focus view
3. Right inspector
   Selected node or cluster details, paths, metrics, member list

Optional:

- bottom context bar for breadcrumbs, current scope, and graph stats

### View Modes

### Condensed Overview

- SCC/package meta-nodes
- aggregated edges
- cluster hulls or grouped lanes
- top hotspots visually surfaced

### Neighborhood Focus

- selected node or cluster centered
- `1 hop`, `2 hops`, `upstream`, `downstream`, `paths`
- unrelated content hidden or strongly dimmed

### Path Mode

- explicit source + destination query
- shortest path or bounded path list
- path steps mirrored in the side panel

### Analysis Mode

- hotspot rankings
- SCC rankings
- highest fan-in / fan-out
- package summaries

These views should feel like different tools over the same graph data, not just different weight settings.

## Visual Direction

### Panels

- Make panels feel like crisp tools, not overlays floating on top of the graph.
- Use stronger titles, tighter spacing, and fewer low-value labels.
- Keep panel chrome calm so the graph remains the star.

### Color

- Reserve bright highlight color for selection and active paths.
- Use separate directional colors for upstream vs downstream.
- Keep non-focused edges subdued.
- Treat hotspots as a distinct semantic state, not just "bigger red dots."

### Typography

- Stronger type hierarchy for panel titles, stats, and selected item names
- Smaller, quieter metadata
- Labels only where they help the current task

### Motion

- Subtle entry animation for panels and focus transitions
- No constant animated noise
- Transitions should clarify scope changes, not slow them down

## Performance Guardrails

The UI redesign should not regress the renderer. These rules should stay in force:

- No raw full-graph edge rendering at low zoom on large inputs
- No per-frame whole-edge scans during navigation
- No expensive selection recomputation in the hot draw loop
- Graph preprocessing stays in the worker
- Large-graph defaults use condensed representations
- Labels and edge detail are budgeted by zoom and scope

Target expectations for a graph around the current large Angular fixture size:

- pan/zoom should feel immediate
- mode switches should avoid visible stalls
- selecting a node should not freeze the UI
- overview mode should remain usable without requiring deep zoom

## Implementation Phases

### Phase 1: Shell And Workflow Upgrade

- introduce a stronger app shell with left rail + right inspector
- make search and task shortcuts primary controls
- clean up panel hierarchy and labeling

This improves usefulness and aesthetics without changing the graph model yet.

### Phase 2: Condensed Graph Default

- add SCC/package meta-nodes
- aggregate cluster edges
- switch large graphs to condensed overview by default

This is the biggest usability win.

### Phase 3: Focused Exploration

- add neighborhood and path modes
- add upstream/downstream scoped rendering
- add richer inspector content for the selected node or cluster

This turns the UI into a debugging tool instead of only a viewer.

### Phase 4: Polish Without Regression

- better motion
- clearer color semantics
- refined type and spacing
- renderer profiling and fixture validation before shipping

## Suggested Near-Term Milestones

1. Ship a stronger shell and inspector.
2. Ship condensed overview mode for large graphs.
3. Ship scoped neighborhood mode.
4. Ship path mode and hotspot/SCC analysis panels.

## Codebase Touchpoints

- `ui/src/ui.ts`
  New layout shell, panels, task shortcuts, inspector structure
- `ui/src/main.ts`
  Shared state for mode switching, selection scope, and panel coordination
- `ui/src/GraphVisualization.ts`
  LOD rules, scope-aware drawing, path highlighting, cluster expansion
- `ui/src/graphLayout.ts`
  Condensed graph layout, package grouping, SCC meta-node layout
- `ui/src/graphWorker.ts`
  Background preprocessing for grouped views and rankings

## Non-Goals

- Do not try to make the raw full graph beautiful at every scale.
- Do not add costly visual effects that fight the canvas budget.
- Do not treat the current node-link view as the only valid interface.

## Recommended First Build

If only one major UI project is started next, it should be this:

- redesign the shell
- add condensed large-graph overview
- add a right-hand inspector
- keep the existing renderer as the execution engine underneath

That gets the product much closer to "amazing and useful" without betting everything on a full rewrite.
