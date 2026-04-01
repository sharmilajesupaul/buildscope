---
name: buildscope-choke-points
description: Detect choke points, hotspots, and breakup candidates in BuildScope dependency graphs. Use when Codex needs to inspect a running BuildScope server or a saved `graph.json`, fetch precomputed rankings from `/analysis.json`, inspect raw graph and details data from `/graph.json` and `/graph.details.json`, or propose how to split large shared hubs and cycles in a BuildScope graph.
---

# BuildScope Choke Points

Use this skill to turn a BuildScope graph into concrete refactor guidance. Always prefer the backend's precomputed analysis: if you only have a saved `graph.json`, serve it through BuildScope first and then query `/analysis.json`.

## Quick Start

1. Pick a graph source.
- Running app: read [references/backend-endpoints.md](references/backend-endpoints.md) and fetch `/analysis.json` from the Go server.
- Saved graph: use a checked-in fixture or a file from `buildscope extract`, then start a local BuildScope server for it with `buildscope view` or `go run ./cli/cmd/buildscope view`.
- If the graph was extracted with enrichment enabled, expect a sibling `graph.details.json` sidecar and richer node fields inside `graph.json`.

2. If you only have a saved graph file, serve it through BuildScope.

```bash
go run ./cli/cmd/buildscope view fixtures/buildscope_large_angular_app.json -addr :4422
```

`buildscope view` auto-loads a sibling `*.details.json` sidecar when present. Use `buildscope serve --graph ... --details ...` when the details file lives elsewhere.

3. Use the backend analysis endpoint.

```bash
curl -fsS "http://localhost:4422/analysis.json?top=15" | jq
```

4. Deep-dive a suspicious target through the backend.

```bash
curl -fsS "http://localhost:4422/analysis.json?top=15&focus=//pkg:target" | jq
```

5. Translate the output into a breakup plan.
- Use [references/refactor-playbook.md](references/refactor-playbook.md) when the ranking alone is not enough to pick a split strategy.
- Prefer recommendations that reduce `outDegree`, cut SCC cycles, or isolate stable facades from unstable implementation detail.
- When enrichment is available, use file counts, input bytes, output bytes, and action count to explain why a target is a bottleneck instead of relying only on degree.

## Workflow

1. Confirm how the graph is exposed.
- The preferred backend contract is `/analysis.json`.
- `/graph.json` is still the raw graph endpoint when you need the unsummarized dependency data.
- `/graph.details.json` is the detail sidecar for large direct input/output lists and mnemonic mixes.
- If the user says "use the running app", fetch backend JSON over HTTP instead of trying to scrape the UI.

2. Reuse the backend analysis for every graph source.
- Prefer the backend's precomputed analysis from `/analysis.json`.
- For a checked-in or extracted `graph.json`, start `buildscope view /path/to/graph.json` first instead of reimplementing the analysis locally.
- `buildscope view` auto-loads a sibling `graph.details.json` when present.
- Use `buildscope serve --graph /path/to/graph.json --details /path/to/graph.details.json` when the sidecar is not adjacent.

3. Separate the questions.
- "High impact" means many downstream dependents and broad blast radius.
- "Break up first" means the node is both highly shared and structurally broad enough to benefit from splitting.
- "Source-heavy" means a target owns a large direct file surface or rolls up many bytes of source inputs.
- "Output-heavy" means a target emits large artifacts or fans out through many actions.
- Do not recommend splitting every high-impact target. A stable leaf utility with low `outDegree` is often central but not a good first breakup target.

4. Focus on a small shortlist.
- Start with the top 5 to 15 breakup candidates.
- If the graph is large, use the `focus` query param on one or two candidates before writing recommendations.
- Quote concrete numbers from the analyzer: dependents, direct deps, SCC size, pressure score, file counts, byte totals, and notable direct neighbors.

## Interpreting Results

- High-impact targets are ranked mostly by `transitiveInDegree`. These are the nodes with the largest downstream blast radius.
- Breakup candidates are ranked by `pressure = log2(transitiveInDegree + 1) * max(1, outDegree) + log2(inputFileCount + 1) + log2(outputFileCount + 1) + log2(actionCount + 1)`. This favors broad shared hubs with meaningful build surface over narrow leaf utilities.
- Source-heavy targets are useful when a broadly shared target hides just a few large files inside a much larger rule.
- Output-heavy targets are useful when slow or bulky generated artifacts, not just dependency fan-out, are the real chokepoint.
- SCC hotspots indicate cyclic coupling. Break those cycles before trying to do finer-grained cleanup inside them.
- A node with high `transitiveInDegree` and low `outDegree` is usually a stable shared leaf. Keep it stable; do not automatically split it.
- A node with high `transitiveInDegree` and high `outDegree` is a better breakup target because it combines broad fan-in with broad fan-out.

## Output Style

- Lead with the top breakup candidates and why they are choke points.
- Add source-heavy or output-heavy evidence when it strengthens the recommendation.
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
- Use `/analysis.json` for both running app instances and saved graph files after serving them through BuildScope.
- When the graph includes `detailsPath`, use or mention the sidecar instead of claiming the summary view is the full artifact list.

## Limits

- Do not claim every BuildScope instance exposes `/analysis.json` unless it is running a version that includes the Go-side analysis endpoint.
- Do not infer architecture from one node alone when the SCC or direct-dependency list says otherwise.
- Do not recommend a breakup without naming which incoming or outgoing edges the split is meant to reduce.
- Do not confuse source/generated file nodes with split candidates. Keep the recommendations target-centric unless the user explicitly asks for file-level drill-down.
