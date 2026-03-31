# Refactor Playbook For Graph Choke Points

Use this file after the analyzer has identified a shortlist of choke points.

## Pattern: Broad Shared Hub

Signals:

- high `transitiveInDegree`
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

## Pattern: Cyclic Cluster

Signals:

- `sccSize > 1`
- hotspot rank driven by SCC score rather than only fan-in

Meaning:

- the problem is mutual coupling, not just a shared hub

Good breakup moves:

- move shared contracts into a lower-level package
- replace one concrete dependency with an interface or generated protocol
- introduce a one-way event or callback boundary
- force a single direction across layers

## Pattern: Stable Leaf Utility

Signals:

- high `transitiveInDegree`
- low `outDegree`
- not in a meaningful SCC

Meaning:

- this target is central, but it may simply be a reused utility

Good response:

- prefer stabilization over breakup
- improve tests, ownership, and API boundaries
- avoid splitting it first unless the implementation is unstable or bloated

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
