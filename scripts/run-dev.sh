#!/bin/bash

set -euo pipefail

# BuildScope Development Script
# Starts both the Go server and Vite dev server with one command
# Watches for changes in Go and TypeScript files and rebuilds automatically

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT_UTILS="$SCRIPT_DIR/port-utils.sh"

if [ ! -f "$PORT_UTILS" ]; then
  echo "❌ Error: missing port helper at $PORT_UTILS" >&2
  exit 1
fi

. "$PORT_UTILS"

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
  if [ -n "${GO_PID:-}" ]; then
    kill "$GO_PID" 2>/dev/null || true
  fi
  if [ -n "${VITE_PID:-}" ]; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [ -n "${WATCH_PID:-}" ]; then
    kill "$WATCH_PID" 2>/dev/null || true
  fi
  exit 0
}

server_log_file=$(mktemp /tmp/buildscope-server-log.XXXXXX)
vite_log_file=$(mktemp /tmp/buildscope-vite-log.XXXXXX)
touch "$server_log_file"
touch "$vite_log_file"

# Register cleanup function for Ctrl+C
trap cleanup INT TERM

GO_PORT="$(resolve_port GO_PORT 4422)"
VITE_PORT="$(resolve_port VITE_PORT 4400)"
export GO_PORT VITE_PORT

# Function to start Go server
start_go_server() {
  cd "$REPO_DIR/cli"
  go run ./cmd/buildscope serve -dir ../ui/dist -graph "$GRAPH_ARG" -addr ":$GO_PORT" &> "$server_log_file" &
  GO_PID=$!
  cd "$REPO_DIR"
  echo "Go server started with PID $GO_PID"
}

# Function to restart Go server
restart_go_server() {
  echo ""
  echo "🔄 Restarting Go server (Go files changed)..."
  kill $GO_PID 2>/dev/null || true
  sleep 2
  start_go_server
}

# Start initial Go server
echo "Starting Go server on :$GO_PORT..."
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

# Check and install npm dependencies if needed
if [ ! -d "$REPO_DIR/ui/node_modules" ]; then
  echo "📦 Installing npm dependencies..."
  cd "$REPO_DIR/ui"
  npm install
  cd "$REPO_DIR"
  echo ""
fi

# Start Vite dev server in background (handles TS watching automatically)
echo "Starting Vite dev server on :$VITE_PORT..."
cd "$REPO_DIR/ui"
npm run dev -- --port "$VITE_PORT" &> "$vite_log_file" &
VITE_PID=$!
cd "$REPO_DIR"

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
echo "✨ View BuildScope at http://localhost:$VITE_PORT"
echo "📊 Go API server at http://localhost:$GO_PORT"
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
    current_time=$(date +%s)
    # Find any .go files modified since last check (matching the 2-second interval)
    if find "$REPO_DIR/cli" -name "*.go" -type f -newermt "@$last_check" 2>/dev/null | grep -q .; then
      restart_go_server
      # Update timestamp after restart to avoid duplicate detections
      last_check=$(date +%s)
    else
      last_check=$current_time
    fi
  done
} &
WATCH_PID=$!

wait
