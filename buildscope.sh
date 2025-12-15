#!/bin/bash

# BuildScope - Quick graph viewer for any Bazel repo
# Usage: buildscope.sh <target>
# Example: buildscope.sh //my/package:target

set -e

if [ -z "$1" ]; then
  echo "Usage: buildscope.sh <bazel-target>"
  echo "Example: buildscope.sh //src/main:app"
  echo ""
  echo "Run this from any Bazel workspace directory."
  exit 1
fi

TARGET="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$(pwd)"
GRAPH_FILE="/tmp/buildscope-graph-$$.json"

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
cd "$SCRIPT_DIR/cli"
go run ./cmd/buildscope extract \
  -target "$TARGET" \
  -workdir "$WORKSPACE_DIR" \
  -out "$GRAPH_FILE"

# Build UI if not already built or outdated
cd "$SCRIPT_DIR/ui"
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

cd "$SCRIPT_DIR/cli"
echo "✨ View BuildScope at http://localhost:4422"
exec go run ./cmd/buildscope serve -dir ../ui/dist -graph "$GRAPH_FILE" -addr :4422
