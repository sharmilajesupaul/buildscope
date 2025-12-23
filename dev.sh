#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$SCRIPT_DIR/scripts/run-dev.sh"

if [ ! -f "$RUNNER" ]; then
  echo "❌ Error: missing dev runner at $RUNNER" >&2
  exit 1
fi

exec bash "$RUNNER" "$@"
