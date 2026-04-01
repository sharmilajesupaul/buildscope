# MCP Server

BuildScope ships a stdio MCP server so AI agents can inspect the same dependency graph and analysis data that the UI uses.

The MCP server is a thin adapter over the existing BuildScope backend surface:

- `/analysis.json`
- `/graph.json`
- `/graph.details.json`

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

## Suggested Agent Instructions

Paste something like this into your MCP client's instructions:

```text
Use BuildScope to inspect Bazel dependency graphs.
Call get_analysis first to find top impact targets, breakup candidates, and cyclic hotspots.
Use exact Bazel labels from that response when calling get_target_details.
When BuildScope is connected to a static graph file, treat the results as a snapshot instead of live workspace state.
```

## Example Agent Prompts

```text
Find the top breakup candidates in this Bazel graph and explain why they are risky shared hubs.
```

```text
Look for cyclic hotspots and tell me which target I should split first.
```

```text
Inspect //pkg:hub and summarize its direct inputs, outputs, and likely reasons it became a choke point.
```

## Notes

- The MCP server speaks stdio JSON-RPC and is meant to be launched by an MCP client.
- `buildscope mcp` defaults to `http://localhost:4422` when neither `--server` nor `--graph` is provided.
- For the underlying HTTP API, see [backend-api.md](backend-api.md).
