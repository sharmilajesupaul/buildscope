#!/bin/bash

set -euo pipefail

# BuildScope - Quick graph viewer for any Bazel repo
# Usage: buildscope.sh <target>
# Example: buildscope.sh //my/package:target

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT_UTILS="$SCRIPT_DIR/port-utils.sh"

if [ ! -f "$PORT_UTILS" ]; then
  echo "❌ Error: missing port helper at $PORT_UTILS" >&2
  exit 1
fi

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
GRAPH_FILE="/tmp/buildscope-graph-$$.json"
SERVER_PORT="$(resolve_port SERVER_PORT 4422)"

echo "🔍 BuildScope - Analyzing $TARGET"
echo "📁 Workspace: $WORKSPACE_DIR"
echo ""

# Check if we're in a Bazel workspace
if [ ! -f "WORKSPACE" ] && [ ! -f "WORKSPACE.bazel" ] && [ ! -f "MODULE.bazel" ]; then
  echo "❌ Error: Not in a Bazel workspace directory"
  echo "   Please run this from the root of your Bazel project"
  exit 1
fi

# Extract the graph
echo "📊 Extracting dependency graph..."
cd "$REPO_DIR/cli"
go run ./cmd/buildscope extract \
  -target "$TARGET" \
  -workdir "$WORKSPACE_DIR" \
  -out "$GRAPH_FILE"

# Build UI if not already built or outdated
cd "$REPO_DIR/ui"
if [ ! -d "dist" ] || [ "package.json" -nt "dist" ]; then
  echo ""
  echo "📦 Building UI..."
  npm run build
fi

# Start the viewer (production mode - just Go server, no dev watchers)
echo ""
echo "🚀 Starting BuildScope viewer..."
echo "   Graph: $GRAPH_FILE"
echo ""

cd "$REPO_DIR/cli"
echo "✨ View BuildScope at http://localhost:$SERVER_PORT"
exec go run ./cmd/buildscope serve -dir ../ui/dist -graph "$GRAPH_FILE" -addr ":$SERVER_PORT"
