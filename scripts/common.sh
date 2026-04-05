#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UI_DIR="$REPO_DIR/ui"
CLI_DIR="$REPO_DIR/cli"
EMBEDDED_UI_DIR="$CLI_DIR/internal/embeddedui/dist"

log() {
  printf '%s\n' "$*"
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  local name=$1
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "missing required command: $name"
  fi
}

has_fnm() {
  command -v fnm >/dev/null 2>&1
}

read_node_version() {
  sed 's/^v//' "$REPO_DIR/.node-version"
}

read_go_version() {
  awk '/^go / { print $2; exit }' "$CLI_DIR/go.mod"
}

current_node_version() {
  if has_fnm; then
    fnm exec --using "$REPO_DIR/.node-version" -- node -p 'process.versions.node'
    return
  fi

  node -p 'process.versions.node'
}

current_go_version() {
  local version
  version="$(go env GOVERSION 2>/dev/null || true)"
  version="${version#go}"
  if [ -n "$version" ]; then
    printf '%s\n' "$version"
    return
  fi

  go version | awk '{ print $3 }' | sed 's/^go//'
}

version_gte() {
  local current=$1
  local minimum=$2
  local current_major current_minor current_patch
  local minimum_major minimum_minor minimum_patch

  IFS=. read -r current_major current_minor current_patch <<<"$current"
  IFS=. read -r minimum_major minimum_minor minimum_patch <<<"$minimum"

  current_major=${current_major:-0}
  current_minor=${current_minor:-0}
  current_patch=${current_patch:-0}
  minimum_major=${minimum_major:-0}
  minimum_minor=${minimum_minor:-0}
  minimum_patch=${minimum_patch:-0}

  if [ "$current_major" -ne "$minimum_major" ]; then
    [ "$current_major" -gt "$minimum_major" ]
    return
  fi
  if [ "$current_minor" -ne "$minimum_minor" ]; then
    [ "$current_minor" -gt "$minimum_minor" ]
    return
  fi

  [ "$current_patch" -ge "$minimum_patch" ]
}

ensure_node() {
  if has_fnm; then
    if ! fnm exec --using "$REPO_DIR/.node-version" -- node -p 'process.versions.node' >/dev/null 2>&1; then
      fail "unable to activate Node.js from $REPO_DIR/.node-version with fnm"
    fi
    if ! fnm exec --using "$REPO_DIR/.node-version" -- npm -v >/dev/null 2>&1; then
      fail "npm is unavailable for the Node.js version from $REPO_DIR/.node-version"
    fi
  else
    require_command node
    require_command npm
  fi

  local current required
  current="$(current_node_version)"
  required="$(read_node_version)"
  if ! version_gte "$current" "$required"; then
    fail "Node.js $required or newer is required (found $current)"
  fi
}

run_with_repo_node() {
  if has_fnm; then
    fnm exec --using "$REPO_DIR/.node-version" -- "$@"
    return
  fi

  "$@"
}

ensure_go() {
  require_command go

  local current required
  current="$(current_go_version)"
  required="$(read_go_version)"
  if ! version_gte "$current" "$required"; then
    fail "Go $required or newer is required (found $current)"
  fi
}

ensure_bazel() {
  require_command bazel
}

ui_dependencies_need_install() {
  if [ ! -d "$UI_DIR/node_modules" ]; then
    return 0
  fi
  if [ "$UI_DIR/package-lock.json" -nt "$UI_DIR/node_modules" ]; then
    return 0
  fi
  if [ "$UI_DIR/package.json" -nt "$UI_DIR/node_modules" ]; then
    return 0
  fi

  return 1
}

ensure_ui_dependencies() {
  if ui_dependencies_need_install; then
    log "Installing UI dependencies..."
    run_with_repo_node npm --prefix "$UI_DIR" ci
  fi
}

ui_dist_needs_build() {
  local dist_index="$UI_DIR/dist/index.html"

  if [ ! -f "$dist_index" ]; then
    return 0
  fi
  if [ "$UI_DIR/package.json" -nt "$dist_index" ]; then
    return 0
  fi
  if [ "$UI_DIR/package-lock.json" -nt "$dist_index" ]; then
    return 0
  fi
  if [ -f "$UI_DIR/vite.config.ts" ] && [ "$UI_DIR/vite.config.ts" -nt "$dist_index" ]; then
    return 0
  fi
  if [ -f "$UI_DIR/vite.config.mts" ] && [ "$UI_DIR/vite.config.mts" -nt "$dist_index" ]; then
    return 0
  fi
  if find "$UI_DIR/src" "$UI_DIR/public" -type f -newer "$dist_index" | grep -q .; then
    return 0
  fi

  return 1
}

ensure_ui_dist() {
  ensure_node
  ensure_ui_dependencies
  if ui_dist_needs_build; then
    log "Building UI assets..."
    run_with_repo_node npm --prefix "$UI_DIR" run build
  fi
}

warm_go_modules() {
  log "Downloading Go modules..."
  go -C "$CLI_DIR" mod download
}

copy_ui_dist() {
  local destination=$1

  mkdir -p "$destination"
  rm -rf "$destination"/*
  cp -R "$UI_DIR/dist/." "$destination/"
}

sync_ui_dist() {
  local destination=$1

  ensure_ui_dist
  copy_ui_dist "$destination"
}

embedded_ui_assets_need_sync() {
  if [ ! -f "$EMBEDDED_UI_DIR/index.html" ]; then
    return 0
  fi

  if ! diff -qr "$UI_DIR/dist" "$EMBEDDED_UI_DIR" >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

ensure_embedded_ui_assets() {
  ensure_ui_dist
  if embedded_ui_assets_need_sync; then
    log "Syncing embedded UI assets..."
    copy_ui_dist "$EMBEDDED_UI_DIR"
  fi
  ensure_file_exists "$EMBEDDED_UI_DIR/index.html"
  ensure_file_exists "$EMBEDDED_UI_DIR/sample-graph.json"
}

cli_binary_needs_build() {
  local binary_path=$1

  if [ ! -x "$binary_path" ]; then
    return 0
  fi
  if [ "$CLI_DIR/go.mod" -nt "$binary_path" ]; then
    return 0
  fi
  if [ -f "$CLI_DIR/go.sum" ] && [ "$CLI_DIR/go.sum" -nt "$binary_path" ]; then
    return 0
  fi
  if find "$CLI_DIR/cmd" "$CLI_DIR/internal" -type f \
    \( -name "*.go" -o -name "*.json" -o -name "*.css" -o -name "*.js" -o -name "*.svg" -o -name "*.ico" -o -name "*.html" \) \
    -newer "$binary_path" | grep -q .; then
    return 0
  fi

  return 1
}

ensure_cli_binary() {
  local binary_path=$1

  ensure_go
  ensure_embedded_ui_assets

  if cli_binary_needs_build "$binary_path"; then
    mkdir -p "$(dirname "$binary_path")"
    log "Building BuildScope binary..."
    go -C "$CLI_DIR" build -o "$binary_path" ./cmd/buildscope
  fi
}

path_contains_dir() {
  local dir=$1
  local normalized

  normalized="$(cd "$dir" && pwd)"
  case ":$PATH:" in
    *":$normalized:"*) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_file_exists() {
  local path=$1
  [ -f "$path" ] || fail "file not found: $path"
}
