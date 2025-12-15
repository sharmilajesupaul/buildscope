#!/bin/bash

# BuildScope Development Script
# Starts both the Go server and Vite dev server with one command
# Watches for changes in Go and TypeScript files and rebuilds automatically

set -e

# Default to large Angular app fixture if no argument provided
GRAPH_PATH="${1:-fixtures/buildscope_large_angular_app.json}"

GRAPH_ARG="$(cd "$(dirname "$GRAPH_PATH")" && pwd)/$(basename "$GRAPH_PATH")"

echo "🚀 Starting BuildScope development servers..."
echo "📊 Graph: $GRAPH_ARG"
echo ""

# Cleanup function to kill background processes
cleanup() {
  echo ""
  echo "🛑 Shutting down servers..."
  kill $GO_PID 2>/dev/null || true
  kill $VITE_PID 2>/dev/null || true
  kill $WATCH_PID 2>/dev/null || true
  exit 0
}

server_log_file=$(mktemp /tmp/buildscope-server-log.XXXXXX)
vite_log_file=$(mktemp /tmp/buildscope-vite-log.XXXXXX)
touch "$server_log_file"
touch "$vite_log_file"

# Register cleanup function for Ctrl+C
trap cleanup INT TERM

# Function to start Go server
start_go_server() {
  cd cli
  go run ./cmd/buildscope serve -dir ../ui/dist -graph "$GRAPH_ARG" -addr :4422 &> "$server_log_file" &
  GO_PID=$!
  cd ..
  echo "Go server started with PID $GO_PID"
}

# Function to restart Go server
restart_go_server() {
  echo ""
  echo "🔄 Restarting Go server (Go files changed)..."
  kill $GO_PID 2>/dev/null || true
  sleep 1
  start_go_server
}

# Start initial Go server
echo "Starting Go server on :4422..."
start_go_server
echo "Logs available at $server_log_file"

# Wait a moment and check if the process is still running
sleep 2
if ! kill -0 $GO_PID 2>/dev/null; then
  echo ""
  echo "❌ Error: Go server exited early. Check logs:"
  cat "$server_log_file"
  exit 1
fi

echo ""

# Start Vite dev server in background (handles TS watching automatically)
echo "Starting Vite dev server on :4400..."
cd ui
npm run dev &> "$vite_log_file" &
VITE_PID=$!
cd ..

echo "Vite dev server started with PID $VITE_PID"
echo "Logs available at $vite_log_file"

# Wait for Vite to start
sleep 3
if ! kill -0 $VITE_PID 2>/dev/null; then
  echo ""
  echo "❌ Error: Vite server exited early. Check logs:"
  cat "$vite_log_file"
  kill $GO_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "✅ All servers running!"
echo "✨ View BuildScope at http://localhost:4400"
echo "📊 Go API server at http://localhost:4422"
echo ""
echo "👀 Watching for Go file changes in cli/..."
echo "👀 Vite is watching for TypeScript changes in ui/..."
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Watch for Go file changes and restart server
{
  last_check=$(date +%s)
  while true; do
    sleep 2
    # Find any .go files modified in the last 3 seconds
    if find cli -name "*.go" -type f -newermt "@$last_check" 2>/dev/null | grep -q .; then
      restart_go_server
    fi
    last_check=$(date +%s)
  done
} &
WATCH_PID=$!

wait

