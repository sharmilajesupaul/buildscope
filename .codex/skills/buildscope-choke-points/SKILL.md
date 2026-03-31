---
name: buildscope-choke-points
description: Detect choke points, hotspots, and breakup candidates in BuildScope dependency graphs. Use when Codex needs to inspect a running BuildScope server or a saved `graph.json`, fetch the graph from the app backend endpoint (`/graph.json`), rank high-impact Bazel targets, analyze SCC hotspots, or propose how to split large shared hubs and cycles in a BuildScope graph.
---

# BuildScope Choke Points

Use this skill to turn a BuildScope graph into concrete refactor guidance. Fetch the raw graph from the app backend or from disk, compute the same core metrics the app uses, and then write a breakup plan that is specific to the highest-pressure targets.

## Quick Start

1. Pick a graph source.
- Running app: read [references/backend-endpoints.md](references/backend-endpoints.md) and fetch `/graph.json` from the Go server or the Vite proxy.
- Saved graph: use a checked-in fixture, a file from `buildscope extract`, or a graph already being served by `buildscope view`.

2. Run the analyzer script.

```bash
python3 .codex/skills/buildscope-choke-points/scripts/analyze_graph.py \
  --url http://localhost:4422/graph.json \
  --top 15
```

Or:

```bash
python3 .codex/skills/buildscope-choke-points/scripts/analyze_graph.py \
  --file fixtures/buildscope_large_angular_app.json \
  --top 15
```

3. Deep-dive a suspicious target.

```bash
python3 .codex/skills/buildscope-choke-points/scripts/analyze_graph.py \
  --url http://localhost:4422/graph.json \
  --focus //pkg:target
```

4. Translate the output into a breakup plan.
- Use [references/refactor-playbook.md](references/refactor-playbook.md) when the ranking alone is not enough to pick a split strategy.
- Prefer recommendations that reduce `outDegree`, cut SCC cycles, or isolate stable facades from unstable implementation detail.

## Workflow

1. Confirm how the graph is exposed.
- The backend does not expose a dedicated analysis API. It serves raw graph data at `/graph.json`.
- If the user says "use the running app", fetch the graph over HTTP instead of trying to scrape the UI.

2. Compute rankings locally.
- Use `scripts/analyze_graph.py` instead of recomputing formulas by hand.
- The analyzer uses the same core ideas as the app: direct degree, transitive dependents, SCC detection, hotspot ranking, and the `pressure` score for breakup candidates.

3. Separate the questions.
- "High impact" means many downstream dependents and broad blast radius.
- "Break up first" means the node is both highly shared and structurally broad enough to benefit from splitting.
- Do not recommend splitting every high-impact target. A stable leaf utility with low `outDegree` is often central but not a good first breakup target.

4. Focus on a small shortlist.
- Start with the top 5 to 15 breakup candidates.
- If the graph is large, use `--focus` on one or two candidates before writing recommendations.
- Quote concrete numbers from the analyzer: dependents, direct deps, SCC size, pressure score, and notable direct neighbors.

## Interpreting Results

- High-impact targets are ranked mostly by `transitiveInDegree`. These are the nodes with the largest downstream blast radius.
- Breakup candidates are ranked by `pressure = log2(transitiveInDegree + 1) * max(1, outDegree)`. This favors broad shared hubs over narrow leaf utilities.
- SCC hotspots indicate cyclic coupling. Break those cycles before trying to do finer-grained cleanup inside them.
- A node with high `transitiveInDegree` and low `outDegree` is usually a stable shared leaf. Keep it stable; do not automatically split it.
- A node with high `transitiveInDegree` and high `outDegree` is a better breakup target because it combines broad fan-in with broad fan-out.

## Output Style

- Lead with the top breakup candidates and why they are choke points.
- For each recommended split, name the likely seam:
  - domain slice
  - interface extraction
  - dependency inversion
  - cycle break
  - stable facade with internal shards
- Use exact target labels, not vague descriptions.
- Call out when the graph suggests "stabilize, do not split" instead of forcing a breakup recommendation.

## Resources

- Read [references/backend-endpoints.md](references/backend-endpoints.md) for the exact backend endpoints, CLI entrypoints, and port behavior.
- Read [references/refactor-playbook.md](references/refactor-playbook.md) for concrete breakup patterns tied to graph shapes.
- Run `scripts/analyze_graph.py` for deterministic rankings and node-level drill-down.

## Limits

- Do not claim the backend exposes rankings or choke-point endpoints. It does not.
- Do not infer architecture from one node alone when the SCC or direct-dependency list says otherwise.
- Do not recommend a breakup without naming which incoming or outgoing edges the split is meant to reduce.
