# Development

## Prerequisites

- Node.js `24.11.1` or newer
- Go `1.22+`
- Bazel, if you want to test live workspace extraction

## Setup

```bash
./setup.sh
```

## Run The Local Stack

Start the Go server on `:4422` and the Vite dev server on `:4400`:

```bash
./dev.sh
```

Or point the UI at a specific graph JSON file:

```bash
./dev.sh path/to/graph.json
```

Ports can be overridden with `GO_PORT`, `VITE_PORT`, and `SERVER_PORT`.

## Useful Commands

```bash
npm --prefix ui run dev
npm --prefix ui run build
cd ui && npm test
cd ui && npm test -- --run <file>
cd cli && go test ./...
./buildscope.sh //your/package:target
```

## Embedded UI

If you change the shipped UI and want the standalone binary to pick it up, refresh the embedded bundle:

```bash
./scripts/refresh-embedded-ui.sh
```

## Related Docs

- [Bazel graph flow](bazel-graph-flow.md)
- [Fixture corpus](../fixtures/README.md)
- [Release process](releases.md)
