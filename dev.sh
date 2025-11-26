#!/bin/bash

# BuildScope Development Script
# Starts both the Go server and Vite dev server with one command

set -e

# Default to sample graph if no argument provided
GRAPH_PATH="${1:-ui/public/sample-graph.json}"

GRAPH_ARG="$(cd "$(dirname "$GRAPH_PATH")" && pwd)/$(basename "$GRAPH_PATH")"

echo "🚀 Starting BuildScope development servers..."
echo "📊 Graph: $GRAPH_ARG"
echo ""

# Cleanup function to kill background processes
cleanup() {
  echo ""
  echo "🛑 Shutting down servers..."
  kill $GO_PID 2>/dev/null || true
  exit 0
}

server_log_file=$(mktemp /tmp/buildscope-server-log.XXXXXX)
touch "$server_log_file"

# Register cleanup function for Ctrl+C
trap cleanup INT TERM

# Start Go server in background
echo "Starting Go server on :4422..."
cd cli
go run ./cmd/buildscope serve -dir ../ui/dist -graph "$GRAPH_ARG" -addr :4422 &> "$server_log_file" &
GO_PID=$!
cd ..

echo ""
echo "Go server started with PID $GO_PID"
echo "Logs available at $server_log_file"

echo ""
echo "✨ View BuildScope at http://localhost:4422"

wait

