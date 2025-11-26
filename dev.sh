#!/bin/bash

# BuildScope Development Script
# Starts both the Go server and Vite dev server with one command

set -e

# Default to sample graph if no argument provided
GRAPH_PATH="${1:-ui/public/sample-graph.json}"

echo "🚀 Starting BuildScope development servers..."
echo "📊 Graph: $GRAPH_PATH"
echo ""

# Cleanup function to kill background processes
cleanup() {
  echo ""
  echo "🛑 Shutting down servers..."
  kill $GO_PID 2>/dev/null || true
  exit 0
}

# Register cleanup function for Ctrl+C
trap cleanup INT TERM

# Start Go server in background
echo "Starting Go server on :4422..."
cd cli
go run ./cmd/buildscope serve -graph "../$GRAPH_PATH" -addr :4422 &
GO_PID=$!
cd ..

# Wait a moment for Go server to start
sleep 2

# Start Vite dev server (foreground)
echo "Starting Vite dev server on :4400..."
echo ""
echo "✨ Open http://localhost:4400 in your browser"
echo "Press Ctrl+C to stop both servers"
echo ""
cd ui
npm run dev

# If npm run dev exits, cleanup
cleanup
