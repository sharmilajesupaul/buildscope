#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST_PATH="$REPO_DIR/fixtures/manifest.json"
CLI_DIR="$REPO_DIR/cli"
SOURCE_ROOT="${BUILDSCOPE_FIXTURE_SOURCE_ROOT:-/tmp/buildscope-fixture-sources}"

usage() {
  cat <<'EOF'
Usage: ./scripts/refresh-fixtures.sh [fixture-id ...] [--all]

Without arguments, refreshes the fixtures marked refreshDefault=true in fixtures/manifest.json.

Examples:
  ./scripts/refresh-fixtures.sh
  ./scripts/refresh-fixtures.sh examples_go_tutorial_stage3_print_fortune
  ./scripts/refresh-fixtures.sh --all
  ./scripts/refresh-fixtures.sh openai_codex_cli
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

mkdir -p "$SOURCE_ROOT"

FIXTURE_ROWS=()
while IFS= read -r line; do
  FIXTURE_ROWS+=("$line")
done < <(
  node - "$MANIFEST_PATH" "$@" <<'NODE'
const fs = require('fs');

const manifestPath = process.argv[2];
const args = process.argv.slice(3);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fixtureById = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
const includeAll = args.includes('--all');
const requestedIds = args.filter((arg) => !arg.startsWith('--'));

let selected;
if (includeAll) {
  selected = manifest.fixtures.filter((fixture) => fixture.source);
} else if (requestedIds.length > 0) {
  selected = requestedIds.map((id) => {
    const fixture = fixtureById.get(id);
    if (!fixture) {
      console.error(`Unknown fixture id: ${id}`);
      process.exit(1);
    }
    if (!fixture.source) {
      console.error(`Fixture ${id} does not have a refresh source.`);
      process.exit(1);
    }
    return fixture;
  });
} else {
  selected = manifest.fixtures.filter((fixture) => fixture.source && fixture.refreshDefault);
}

for (const fixture of selected) {
  console.log([
    fixture.id,
    fixture.path,
    fixture.source.repoUrl,
    fixture.source.commit,
    fixture.source.cloneDir,
    fixture.source.workspaceDir,
    fixture.source.target,
  ].join('\t'));
}
NODE
)

if [ ${#FIXTURE_ROWS[@]} -eq 0 ]; then
  echo "No fixtures selected."
  exit 1
fi

ensure_clone() {
  local repo_url=$1
  local clone_dir=$2
  local commit=$3
  local clone_path="$SOURCE_ROOT/$clone_dir"

  if [ ! -d "$clone_path/.git" ]; then
    echo "Cloning $repo_url -> $clone_path"
    git clone "$repo_url" "$clone_path"
  fi

  if ! git -C "$clone_path" fetch --depth=1 origin "$commit" >/dev/null 2>&1; then
    git -C "$clone_path" fetch --prune origin >/dev/null
  fi

  git -C "$clone_path" checkout --detach "$commit" >/dev/null
}

for row in "${FIXTURE_ROWS[@]}"; do
  IFS=$'\t' read -r fixture_id output_path repo_url commit clone_dir workspace_dir target <<<"$row"

  ensure_clone "$repo_url" "$clone_dir" "$commit"

  absolute_output="$REPO_DIR/$output_path"
  mkdir -p "$(dirname "$absolute_output")"

  echo ""
  echo "Refreshing $fixture_id"
  echo "  repo:    $repo_url"
  echo "  commit:  $commit"
  echo "  target:  $target"
  echo "  output:  $absolute_output"

  (
    cd "$CLI_DIR"
    go run ./cmd/buildscope extract \
      -target "$target" \
      -workdir "$SOURCE_ROOT/$clone_dir/$workspace_dir" \
      -out "$absolute_output"
  )
done
