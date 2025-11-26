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

# Start the viewer
echo ""
echo "🚀 Starting BuildScope viewer..."
echo "   Graph: $GRAPH_FILE"
echo ""

cd "$SCRIPT_DIR"
exec ./dev.sh "$GRAPH_FILE"
