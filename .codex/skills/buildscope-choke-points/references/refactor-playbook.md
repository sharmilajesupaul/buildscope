# Refactor Playbook For Graph Choke Points

Use this file after the analyzer has identified a shortlist of choke points.

## Pattern: Broad Shared Hub

Signals:

- high `transitiveInDegree`
- high `massScore`
- high `outDegree`
- `sccSize = 1`

Meaning:

- many targets rely on it
- it also reaches too many direct dependencies
- it likely mixes multiple responsibilities behind one label

Good breakup moves:

- split by domain or subsystem
- keep the public target as a stable facade
- move cohesive groups of direct dependencies behind narrower internal targets
- peel build-heavy generators, compile bundles, or asset producers behind explicit subtargets

## Pattern: Stable Leaf Utility

Signals:

- high `transitiveInDegree`
- low `outDegree`
- not in a meaningful SCC

Meaning:

- this target is central, but it may simply be a reused utility
- build mass is low relative to the rest of the graph

Good response:

- prefer stabilization over breakup
- improve tests, ownership, and API boundaries
- avoid splitting it first unless the implementation is unstable or bloated

## Pattern: File-Level Lever

Signals:

- one file keeps appearing in `topFiles` or `directInputs` for a heavy target
- `/file-focus.json` shows that the file has broad current-graph consumers
- live workspace reverse deps are broader than the current graph snapshot

Meaning:

- the real rebuild lever may be a file or small file cluster, not just the target label

Good response:

- isolate the file behind a narrower subtarget
- move generated inputs behind a dedicated generator rule
- separate slow-changing shared assets from fast-changing implementation files

## Pattern: Mega-Aggregator

Signals:

- very high `outDegree`
- many direct dependencies with different package prefixes or domains

Meaning:

- one target is acting as a grab bag or orchestration layer

Good breakup moves:

- extract smaller dependency bundles by domain
- move optional features behind explicit subtargets
- reduce wildcard or omnibus dependencies

## How To Write Recommendations

- Name the exact target label.
- Quote the concrete graph evidence: dependents, direct deps, SCC size, pressure score.
- Name the first seam to try.
- State what edge reduction you expect from the split.

Weak recommendation:

- "This module looks too big."

Strong recommendation:

- "Split `//app/core:runtime` into runtime, config, and transport shards. It has 184 transitive dependents, 17 direct deps, and its direct dependency list spans config, logging, networking, and metrics targets."
