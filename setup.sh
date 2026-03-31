#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$SCRIPT_DIR/scripts/setup.sh"

if [ ! -f "$RUNNER" ]; then
  echo "Error: missing setup runner at $RUNNER" >&2
  exit 1
fi

exec bash "$RUNNER" "$@"

