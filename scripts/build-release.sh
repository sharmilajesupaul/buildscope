#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_SH="$SCRIPT_DIR/common.sh"

if [ ! -f "$COMMON_SH" ]; then
  echo "Error: missing shared helper at $COMMON_SH" >&2
  exit 1
fi

. "$COMMON_SH"

if [ "$#" -ne 4 ]; then
  echo "Usage: $0 <version> <goos> <goarch> <output-dir>" >&2
  echo "Example: $0 v0.1.0 darwin arm64 dist" >&2
  exit 1
fi

VERSION="$1"
GOOS="$2"
GOARCH="$3"
OUTPUT_DIR="$4"
VERSION_NO_V="${VERSION#v}"

case "$GOOS" in
  darwin|linux) ;;
  *)
    fail "unsupported GOOS for release packaging: $GOOS"
    ;;
esac

case "$GOARCH" in
  amd64|arm64) ;;
  *)
    fail "unsupported GOARCH for release packaging: $GOARCH"
    ;;
esac

ensure_go
ensure_embedded_ui_assets

COMMIT_SHA="${COMMIT_SHA:-$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')}"
BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

ARCHIVE_BASE="buildscope_${VERSION_NO_V}_${GOOS}_${GOARCH}"
LATEST_ALIAS="buildscope_${GOOS}_${GOARCH}.tar.gz"
STAGING_ROOT="$(mktemp -d)"
STAGING_DIR="$STAGING_ROOT/$ARCHIVE_BASE"
OUTPUT_PATH="$OUTPUT_DIR/${ARCHIVE_BASE}.tar.gz"
ALIAS_PATH="$OUTPUT_DIR/$LATEST_ALIAS"

mkdir -p "$STAGING_DIR" "$OUTPUT_DIR"

LDFLAGS="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT_SHA} -X main.buildDate=${BUILD_DATE}"

CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
  go -C "$CLI_DIR" build -trimpath -ldflags "$LDFLAGS" -o "$STAGING_DIR/buildscope" ./cmd/buildscope

cp "$REPO_DIR/README.md" "$STAGING_DIR/README.md"

tar -C "$STAGING_ROOT" -czf "$OUTPUT_PATH" "$ARCHIVE_BASE"
cp "$OUTPUT_PATH" "$ALIAS_PATH"

log "Wrote $OUTPUT_PATH"
log "Wrote $ALIAS_PATH"
