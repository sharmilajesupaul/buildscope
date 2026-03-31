#!/bin/bash

set -euo pipefail

# BuildScope - Quick graph viewer for any Bazel repo
# Usage: buildscope.sh <target> [additional buildscope open flags]
# Example: buildscope.sh //my/package:target --addr :4500

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT_UTILS="$SCRIPT_DIR/port-utils.sh"
COMMON_SH="$SCRIPT_DIR/common.sh"

if [ ! -f "$PORT_UTILS" ]; then
  echo "Error: missing port helper at $PORT_UTILS" >&2
  exit 1
fi

if [ ! -f "$COMMON_SH" ]; then
  echo "Error: missing shared helper at $COMMON_SH" >&2
  exit 1
fi

. "$COMMON_SH"
. "$PORT_UTILS"

if [ -z "${1:-}" ]; then
  echo "Usage: buildscope.sh <bazel-target> [additional buildscope open flags]"
  echo "Example: buildscope.sh //src/main:app --addr :4500"
  echo ""
  echo "Run this from any Bazel workspace directory."
  exit 1
fi

TARGET="$1"
EXTRA_ARGS=("${@:2}")
WORKSPACE_DIR="$(pwd)"
BIN_PATH="${BUILDSCOPE_BIN:-$REPO_DIR/bin/buildscope}"
OPEN_ADDR=""

for ((i = 0; i < ${#EXTRA_ARGS[@]}; i++)); do
  arg="${EXTRA_ARGS[$i]}"
  case "$arg" in
    --addr|-addr)
      if [ $((i + 1)) -lt ${#EXTRA_ARGS[@]} ]; then
        OPEN_ADDR="${EXTRA_ARGS[$((i + 1))]}"
      fi
      ;;
    --addr=*|-addr=*)
      OPEN_ADDR="${arg#*=}"
      ;;
  esac
done

if [ -z "$OPEN_ADDR" ]; then
  SERVER_PORT="$(resolve_port SERVER_PORT 4422)"
  OPEN_ADDR=":$SERVER_PORT"
fi

ensure_go
ensure_bazel
ensure_embedded_ui_assets
ensure_cli_binary "$BIN_PATH"

echo "BuildScope analyzing $TARGET"
echo "Workspace: $WORKSPACE_DIR"
echo ""

# Check if we're in a Bazel workspace
if [ ! -f "WORKSPACE" ] && [ ! -f "WORKSPACE.bazel" ] && [ ! -f "MODULE.bazel" ]; then
  echo "Error: not in a Bazel workspace directory"
  echo "Please run this from the root of your Bazel project"
  exit 1
fi

echo "Starting viewer..."
if [[ "$OPEN_ADDR" == :* ]]; then
  echo "View BuildScope at http://localhost$OPEN_ADDR"
else
  echo "View BuildScope at http://$OPEN_ADDR"
fi
exec "$BIN_PATH" open "$TARGET" --workdir "$WORKSPACE_DIR" --addr "$OPEN_ADDR" "${EXTRA_ARGS[@]}"
