#!/bin/bash

# Check if a port is already in use (best-effort; assumes free if no tool available).
port_in_use() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1
    return $?
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z localhost "$port" >/dev/null 2>&1
    return $?
  fi
  return 1
}

# Find the first open port starting at the default.
find_open_port() {
  local default=$1
  local port=$default
  local max_tries=20
  local i=0

  while [ $i -lt $max_tries ]; do
    if ! port_in_use "$port"; then
      echo "$port"
      return 0
    fi
    if [ "$port" -eq "$default" ]; then
      echo "⚠️  Port $default is in use; searching for an open port..." >&2
    fi
    port=$((port + 1))
    i=$((i + 1))
  done

  echo "❌ Error: No open port found starting at $default" >&2
  return 1
}

# Resolve a port from an env var name with a default fallback.
resolve_port() {
  local env_name=$1
  local default=$2
  local start_port="${!env_name:-$default}"

  find_open_port "$start_port"
}
