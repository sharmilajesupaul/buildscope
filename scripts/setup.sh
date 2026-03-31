#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_SH="$SCRIPT_DIR/common.sh"

if [ ! -f "$COMMON_SH" ]; then
  echo "Error: missing shared helper at $COMMON_SH" >&2
  exit 1
fi

. "$COMMON_SH"

log "Checking local toolchain..."
ensure_node
ensure_go

if command -v bazel >/dev/null 2>&1; then
  log "Found bazel: $(bazel --version | head -n 1)"
else
  warn "bazel is not installed; live workspace extraction will be unavailable"
fi

warm_go_modules
ensure_ui_dependencies
ensure_embedded_ui_assets

log ""
log "BuildScope is ready."
log "Development: ./dev.sh"
log "Viewer: ./buildscope.sh //your/package:target"
