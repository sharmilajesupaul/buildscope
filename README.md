<p align="center">
  <img src="ui/public/brand/buildscope-badge.svg" alt="BuildScope" width="360" />
</p>

# BuildScope

BuildScope is a local-first Bazel dependency explorer. Point it at a Bazel target, stream the graph out of `bazel query`, and inspect the result in a fast WebGL UI.

## Why BuildScope

- Runs entirely on your machine. No hosted backend, database, or repo upload.
- Extracts real Bazel dependency graphs instead of relying on hand-built metadata.
- Keeps layout work off the main thread so large graphs stay navigable.
- Ships with a small fixture corpus for repeatable UI and performance checks.

## Install

macOS via Homebrew:

```bash
brew tap sharmilajesupaul/buildscope https://github.com/sharmilajesupaul/buildscope
brew install sharmilajesupaul/buildscope/buildscope
```

The release workflow opens a Homebrew formula update PR after each tagged prerelease.
If this repo is still private, your GitHub access for `git` and Homebrew needs to be configured first. The formula builds from the tagged source checkout, so it no longer depends on anonymous GitHub release asset URLs.

Linux via GitHub Releases:

```bash
ARCH=amd64   # or arm64
gh auth login
TAG="$(gh api repos/sharmilajesupaul/buildscope/releases --jq 'map(select(.prerelease and (.draft | not)))[0].tag_name')"
TMPDIR="$(mktemp -d)"
gh release download "$TAG" \
  --repo sharmilajesupaul/buildscope \
  --pattern "buildscope_linux_${ARCH}.tar.gz" \
  --dir "$TMPDIR"
tar -xzf "$TMPDIR/buildscope_linux_${ARCH}.tar.gz" -C "$TMPDIR"
install -m 755 "$(find "$TMPDIR" -type f -name buildscope -perm -u+x | head -n 1)" ~/.local/bin/buildscope
```

That installs the latest prerelease binary into `~/.local/bin`. To pin a specific version instead, set `TAG=v0.1.1` before the download step or run `VERSION=v0.1.1 ./scripts/install-release.sh` from a checkout.

Runtime prerequisites for the installed binary:

- Bazel, if you want to extract graphs from a live workspace

Source-build prerequisites:

- Go `1.22+`
- Bazel, if you want to extract graphs from a live workspace

Build from source into `~/.local/bin`:

```bash
./install.sh
```

That install path builds a single Go binary with the UI embedded. Node.js is not required to run the installed app.

You can override the install destination with `PREFIX` or `BINDIR`.

Windows is currently unsupported, and no Windows release artifacts are published right now.

## Quick Start

Smoke-test the installed viewer:

```bash
buildscope version
buildscope demo
```

Open a pre-generated graph:

```bash
buildscope view /path/to/graph.json
```

From the root of a Bazel workspace:

```bash
buildscope open //your/package:target
```

Override the port with `--addr`:

```bash
buildscope open //your/package:target --addr :4500
```

If you are running from a repo checkout without installing first, the existing wrapper still works:

```bash
./buildscope.sh //your/package:target
```

## Release Versioning

BuildScope is currently pre-1.0. Use tags in the `v0.1.x` series for releases.

Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

That tag triggers the GitHub release workflow to:

- run the frontend and Go test suites
- publish versioned release assets for macOS and Linux on `amd64` and `arm64`
- publish stable alias asset names inside each tagged release
- mark the GitHub release as a prerelease because the tag is still under `v1`
- open a PR that updates the Homebrew formula

## How It Gets The Graph

The extraction path is the `extract` command:

```bash
buildscope extract \
  -target //your/package:target \
  -workdir /path/to/bazel/workspace \
  -out /tmp/graph.json
```

Under the hood, that command shells out to:

```bash
bazel query 'deps(//your/package:target)' --output=graph --keep_going
```

BuildScope streams Bazel's graph output, converts it into a plain JSON shape, and writes:

```json
{
  "nodes": [
    { "id": "//app:bin", "label": "//app:bin" },
    { "id": "//lib:core", "label": "//lib:core" }
  ],
  "edges": [
    { "source": "//app:bin", "target": "//lib:core" }
  ]
}
```

The full Bazel extraction and BuildScope analysis flow now lives in [docs/bazel-graph-flow.md](docs/bazel-graph-flow.md).

That doc shows the exact `buildscope open` / `buildscope extract` paths, the concrete `bazel query 'deps(target)' --output=graph --keep_going` invocation, and the worker-side steps that turn the raw dependency graph into high-impact targets and break-up candidates.

For the Go server's local HTTP surface, including `/graph.json` and `/analysis.json`, see [docs/backend-api.md](docs/backend-api.md).

## Development

Frontend development prerequisites:

- Node.js `24.11.1` or newer
- Go `1.22+`

Prepare the repo:

```bash
./setup.sh
```

Start the local development stack:

```bash
./dev.sh
```

Or point the UI at a specific graph JSON file:

```bash
./dev.sh path/to/graph.json
```

Direct commands:

```bash
npm --prefix ui run dev
npm --prefix ui run build
npm --prefix ui test
cd cli && go test ./...
```

Ports can be overridden with `GO_PORT`, `VITE_PORT`, and `SERVER_PORT`.

If you change the shipped UI and want the standalone binary to pick it up, refresh the embedded bundle:

```bash
./scripts/refresh-embedded-ui.sh
```

Build a release archive locally:

```bash
./scripts/build-release.sh v0.1.0 darwin arm64 dist
```

## Startup Paths

Installed CLI:

```bash
buildscope demo
buildscope view /tmp/graph.json
buildscope open //your/package:target
```

Repo checkout helpers:

```bash
./setup.sh
./dev.sh
./buildscope.sh //your/package:target
```

## Fixture Corpus

BuildScope keeps a small fixture corpus in-repo so UI changes and layout changes can be checked against repeatable graphs instead of ad hoc screenshots.

See [fixtures/README.md](fixtures/README.md) for the corpus and refresh workflow.

## Repository Layout

- `cli/` Go CLI for graph extraction and local serving
- `cli/internal/embeddedui/` committed UI bundle embedded into the Go binary
- `ui/` TypeScript frontend and Pixi.js renderer
- `fixtures/` checked-in sample graphs and fixture metadata
- `scripts/` helper scripts for local development and fixture maintenance

## Contributing

Keep changes focused, run the relevant checks, and include enough context in a PR for someone new to the project to understand the user-facing impact.
