#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_SH="$SCRIPT_DIR/common.sh"

if [ ! -f "$COMMON_SH" ]; then
  echo "Error: missing shared helper at $COMMON_SH" >&2
  exit 1
fi

. "$COMMON_SH"

PREFIX="${PREFIX:-$HOME/.local}"
BINDIR="${BINDIR:-$PREFIX/bin}"
BIN_PATH="$BINDIR/buildscope"

log "Preparing BuildScope for installation..."
ensure_go
warm_go_modules
ensure_embedded_ui_assets
ensure_cli_binary "$BIN_PATH"

log ""
log "Installed buildscope to $BIN_PATH"

if ! path_contains_dir "$BINDIR"; then
  warn "$BINDIR is not on PATH"
  warn "Add this to your shell profile:"
  warn "  export PATH=\"$BINDIR:\$PATH\""
fi

log ""
log "Try:"
log "  buildscope demo"
log "  buildscope open //your/package:target --workdir /path/to/workspace"
