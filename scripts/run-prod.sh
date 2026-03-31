#!/bin/bash

set -euo pipefail

# BuildScope - Quick graph viewer for any Bazel repo
# Usage: buildscope.sh <target>
# Example: buildscope.sh //my/package:target

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
  echo "Usage: buildscope.sh <bazel-target>"
  echo "Example: buildscope.sh //src/main:app"
  echo ""
  echo "Run this from any Bazel workspace directory."
  exit 1
fi

TARGET="$1"
WORKSPACE_DIR="$(pwd)"
SERVER_PORT="$(resolve_port SERVER_PORT 4422)"
BIN_PATH="${BUILDSCOPE_BIN:-$REPO_DIR/bin/buildscope}"

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
echo "View BuildScope at http://localhost:$SERVER_PORT"
exec "$BIN_PATH" open "$TARGET" --workdir "$WORKSPACE_DIR" --addr ":$SERVER_PORT"
