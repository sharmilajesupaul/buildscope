#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_SH="$SCRIPT_DIR/common.sh"

if [ ! -f "$COMMON_SH" ]; then
  echo "Error: missing shared helper at $COMMON_SH" >&2
  exit 1
fi

. "$COMMON_SH"

ensure_node
ensure_go
warm_go_modules
sync_ui_dist "$EMBEDDED_UI_DIR"

log ""
log "Embedded UI assets refreshed in $EMBEDDED_UI_DIR"
