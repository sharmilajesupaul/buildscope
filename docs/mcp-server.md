# MCP Server

BuildScope ships a stdio MCP server so AI agents can inspect the same dependency graph and analysis data that the UI uses.

The MCP server is a thin adapter over the existing BuildScope backend surface:

- `/analysis.json`
- `/decomposition.json`
- `/graph.json`
- `/graph.details.json`
- `/file-focus.json`

It does not run a second analyzer implementation.

For the recommended MCP setup, use the happy-path instructions in [README.md](../README.md#mcp-server).

## Tools

### `get_source_info`

Returns whether BuildScope is connected to:

- a running server URL
- a saved graph file

It also reports the active graph path and details path when using file-backed mode.

### `get_analysis`

Returns:

- top impact targets
- breakup candidates
- source-heavy targets
- output-heavy targets
- cyclic hotspots
- an optional focus target drill-down

Arguments:

- `top`: optional integer, defaults to `10`, capped at `100`
- `focus`: optional Bazel label such as `//pkg:target`

### `get_target_details`

Returns focused analysis for one target and merges in `graph.details.json` direct inputs and outputs when that sidecar exists.

Arguments:

- `target`: required exact Bazel label

### `get_target_decomposition`

Returns focused split guidance for one target:

- impact, mass, and shardability scores
- dependency-domain groups across direct rule deps
- cross-group coupling and largest-group share
- short split recommendations

Arguments:

- `target`: required exact Bazel label

### `get_file_details`

Returns file-centric drill-down data for one source or generated file label:

- direct consumers in the current graph snapshot
- transitive consumers in the current graph snapshot
- top current-graph consumer targets ranked by breakup opportunity
- live workspace reverse dependencies when the connected server was started from `buildscope open`

Arguments:

- `label`: required exact Bazel file label such as `//pkg:file.go`

## Suggested Agent Instructions

Paste something like this into your MCP client's instructions:

```text
Use BuildScope to inspect Bazel dependency graphs.
Call get_analysis first to find top impact targets and breakup candidates.
Use exact Bazel labels from that response when calling get_target_decomposition or get_target_details.
Use get_target_decomposition to inspect likely split seams for one target.
Use get_file_details when you need to understand which files are pulling a heavy target into rebuild paths.
When BuildScope is connected to a static graph file, treat the results as a snapshot instead of live workspace state.
```

## Example Agent Prompts

```text
Find the top breakup candidates in this Bazel graph and explain why they are risky shared hubs.
```

```text
Find the heaviest breakup candidates in this Bazel graph and tell me which ones are real split opportunities versus stable shared leaves.
```

```text
Inspect //pkg:hub and summarize its direct inputs, outputs, and likely reasons it became a choke point.
```

```text
Inspect //pkg:hub and propose likely shard boundaries using dependency groups and cross-group coupling.
```

```text
Inspect //pkg:file.go and tell me which current-graph targets consume it, plus whether the live workspace shows broader reverse dependencies.
```

## Notes

- The MCP server speaks stdio JSON-RPC and is meant to be launched by an MCP client.
- `buildscope mcp` defaults to `http://localhost:4422` when neither `--server` nor `--graph` is provided.
- For the underlying HTTP API, see [backend-api.md](backend-api.md).
