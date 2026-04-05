# Release Process

## Versioning

BuildScope is currently pre-1.0. Tag releases in the `v0.1.x` series.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## What The Release Workflow Does

- runs the frontend and Go test suites
- refreshes the embedded UI bundle
- publishes macOS and Linux release archives for `amd64` and `arm64`
- publishes `latest` Linux asset aliases used by the install script
- updates the Homebrew formula to install the published macOS release archives
- marks `v0.x` GitHub releases as prereleases
- opens a Homebrew formula update PR

## Build A Release Archive Locally

```bash
./scripts/build-release.sh v0.1.0 darwin arm64 dist
```
