# UI Execution Plan

This document is the short-term execution plan for the BuildScope UI. It sits on top of:

- `docs/ui-vision-roadmap.md` for broad product intent
- `docs/large-graph-ui-plan.md` for large-graph background

Those docs are still useful context, but this document is the one to execute against now.

## Product Position

BuildScope is not a generic graph toy.

It should help a user answer a small set of dependency questions quickly:

- What does this target depend on?
- What depends on this target?
- Why does A depend on B?
- Which packages or areas of the repo have the most dependency pressure?

That means:

- search-first
- path-first
- package-first for large graphs
- selection must materially change the view

## What To Stop Emphasizing

### 1. Cycles are not a product feature

Bazel target graphs should be acyclic in the normal case. SCC and cycle code can remain as implementation detail for anomaly detection or strange non-target nodes, but it should not drive the UI.

UI implication:

- remove `cycles` as a primary task
- stop framing the product around `hotspots` that are actually SCC-driven
- use `impact`, `fan-in`, `fan-out`, and `paths` as the main concepts

### 2. Raw full-graph view is not the hero

For large graphs, raw node-link view is useful only after scoping. It should not be the main entry state.

## Primary Views

The product should have 4 coherent views.

### 1. Overview

Default for large graphs.

- package-level or directory-level meta-nodes
- aggregated edges between groups
- size by impact
- color by state, not by weight

Purpose:

- understand structure
- identify dense areas
- pick where to drill in

### 2. Neighborhood

Default after selecting a node.

- `1 hop`
- `2 hops`
- `upstream`
- `downstream`

Purpose:

- inspect local dependency context without the whole graph fighting back

### 3. Path

Explicit source and destination.

- shortest path
- maybe bounded alternative paths later
- mirrored textual step list in the inspector

Purpose:

- answer “why does A depend on B?”

### 4. Analysis

Non-canvas ranking/table views.

- top fan-in
- top fan-out
- top transitive impact
- package summary

Purpose:

- answer high-level questions without depending on visual graph inspection

## Theme Plan

Build 3 supported themes from the same semantic token system.

### 1. Dark

Default.

- optimized for dense graph work
- low-luminance background
- restrained chrome
- bright selection / path contrast

### 2. Light

Needed for screenshots, docs, and users who do not want a dark workspace.

- paper-like background
- lower saturation than dark theme
- same semantic color mapping

### 3. Colorblind-safe

Not a novelty mode. It must be first-class.

- never rely on red vs green alone
- selection must use ring + contrast, not only hue
- path direction should use hue plus line style or opacity difference
- hotspot/impact states should use shape/ring/badge support, not only color

## Color Semantics

One channel per meaning.

- Size: importance only
- Fill color: node category / base state only
- Ring or stroke: selection only
- Edge color: relationship only
- Opacity: relevance only

Recommended semantic mapping:

- Default nodes: cool neutral
- Selected node: bright cyan or near-white with a strong ring
- Hovered node: softer ring only
- Focus path: warm amber
- Upstream edges: one cool accent
- Downstream edges: a second distinct accent
- De-emphasized context: blue-gray at very low opacity
- Impact badges in panel: semantic labels, not graph fill colors

## Immediate Design Rules

Apply these before adding more features:

1. Remove low-value labels and decorative copy.
2. Reduce panel footprint and visual contrast.
3. Make selection impossible to miss.
4. Never let default nodes and selected nodes share the same color treatment.
5. Keep the graph area dominant; chrome should support, not compete.

## Execution Phases

### Phase 0: Stabilize Current Interaction

- make `transitive-total` the default
- make clicking/selecting reliable
- make selection persist visually
- de-emphasize unrelated nodes and edges when selected

Exit criteria:

- selection feels trustworthy
- large graph is usable in the default mode

### Phase 1: Semantic Visual System

- introduce theme tokens for `dark`, `light`, and `colorblind`
- redesign node, edge, and selection colors around semantic roles
- remove leftover cycle-first wording from UI

Exit criteria:

- same UI structure works in all 3 themes
- selected node and active path pass the “3-second glance test”

### Phase 2: Real Large-Graph Overview

- build package/directory meta-node overview
- aggregate inter-package edges
- make this the default entry state for large graphs

Exit criteria:

- large graphs open into something understandable without immediate zooming

### Phase 3: Focused Graph Modes

- neighborhood mode
- upstream mode
- downstream mode
- path mode

Exit criteria:

- the user can intentionally switch between question types

### Phase 4: Analysis Views

- ranked lists
- package summaries
- path details panel
- filter and slice controls

Exit criteria:

- common dependency questions can be answered without relying only on the canvas

## Code Direction

### Keep

- worker-based layout preprocessing
- selection scoping
- transitive directionality
- fixture benchmark harness

### De-emphasize

- SCC/hotspot UI language
- cycle-oriented workflow
- raw full-graph rendering as the main experience

### Build Next

- theme token layer
- semantic color system
- package-level condensed graph model
- path finder state and UI

## The Next 5 Tasks

1. Remove cycle-first product language from the UI and docs.
2. Add theme tokens and ship `dark`, `light`, and `colorblind` themes.
3. Redesign node and edge semantics so selection and path are visually unmistakable.
4. Build package-level condensed overview for large graphs.
5. Add explicit `Neighborhood`, `Upstream`, `Downstream`, and `Path` modes.
