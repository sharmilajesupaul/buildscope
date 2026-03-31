---
name: buildscope-choke-points
description: Detect choke points, hotspots, and breakup candidates in BuildScope dependency graphs. Use when Codex needs to inspect a running BuildScope server or a saved `graph.json`, fetch precomputed rankings from the app backend endpoint (`/analysis.json`), inspect raw graph data from `/graph.json`, or propose how to split large shared hubs and cycles in a BuildScope graph.
---

# BuildScope Choke Points

Use this skill to turn a BuildScope graph into concrete refactor guidance. Prefer the backend's precomputed analysis when a BuildScope server is running, and fall back to the local analyzer script only when you are working from a saved graph file.

## Quick Start

1. Pick a graph source.
- Running app: read [references/backend-endpoints.md](references/backend-endpoints.md) and fetch `/analysis.json` from the Go server.
- Saved graph: use a checked-in fixture, a file from `buildscope extract`, or a graph already being served by `buildscope view`.

2. Use the backend analysis endpoint when it exists.

```bash
curl -fsS "http://localhost:4422/analysis.json?top=15" | jq
```

3. Deep-dive a suspicious target through the backend.

```bash
curl -fsS "http://localhost:4422/analysis.json?top=15&focus=//pkg:target" | jq
```

4. Fall back to the analyzer script for saved files or when no server is running.

```bash
python3 .codex/skills/buildscope-choke-points/scripts/analyze_graph.py \
  --file fixtures/buildscope_large_angular_app.json \
  --top 15
```

5. Translate the output into a breakup plan.
- Use [references/refactor-playbook.md](references/refactor-playbook.md) when the ranking alone is not enough to pick a split strategy.
- Prefer recommendations that reduce `outDegree`, cut SCC cycles, or isolate stable facades from unstable implementation detail.

## Workflow

1. Confirm how the graph is exposed.
- The preferred backend contract is `/analysis.json`.
- `/graph.json` is still the raw graph endpoint when you need the unsummarized dependency data.
- If the user says "use the running app", fetch backend JSON over HTTP instead of trying to scrape the UI.

2. Compute rankings locally.
- Prefer the backend's precomputed analysis from `/analysis.json`.
- Use `scripts/analyze_graph.py` only for saved graph files or as a fallback when no BuildScope server is running.

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
- Use `/analysis.json` for running app instances, and run `scripts/analyze_graph.py` for saved graph files.

## Limits

- Do not claim every BuildScope instance exposes `/analysis.json` unless it is running a version that includes the Go-side analysis endpoint.
- Do not infer architecture from one node alone when the SCC or direct-dependency list says otherwise.
- Do not recommend a breakup without naming which incoming or outgoing edges the split is meant to reduce.
