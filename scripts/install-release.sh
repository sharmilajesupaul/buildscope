#!/bin/sh

set -eu

REPO="${REPO:-sharmilajesupaul/buildscope}"
VERSION="${VERSION:-latest}"
PREFIX="${PREFIX:-$HOME/.local}"
BINDIR="${BINDIR:-$PREFIX/bin}"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

detect_os() {
  case "$(uname -s)" in
    Linux) printf 'linux\n' ;;
    Darwin) printf 'darwin\n' ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT) fail "Windows is currently unsupported" ;;
    *) fail "unsupported operating system: $(uname -s)" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64\n' ;;
    arm64|aarch64) printf 'arm64\n' ;;
    *) fail "unsupported architecture: $(uname -m)" ;;
  esac
}

github_token() {
  if [ -n "${BUILDSCOPE_GITHUB_TOKEN:-}" ]; then
    printf '%s\n' "$BUILDSCOPE_GITHUB_TOKEN"
    return
  fi
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    printf '%s\n' "$GITHUB_TOKEN"
    return
  fi
  if [ -n "${GH_TOKEN:-}" ]; then
    printf '%s\n' "$GH_TOKEN"
    return
  fi

  printf '\n'
}

github_api_get() {
  URL="$1"
  TOKEN="$(github_token)"

  require_command curl

  if [ -n "$TOKEN" ]; then
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer $TOKEN" \
      "$URL"
    return
  fi

  curl -fsSL -H "Accept: application/vnd.github+json" "$URL"
}

release_asset_id_from_api() {
  TAG="$1"
  ASSET="$2"
  RESPONSE="$(github_api_get "https://api.github.com/repos/$REPO/releases/tags/$TAG")" || return 1

  printf '%s' "$RESPONSE" | awk -v asset="$ASSET" '
    {
      recent[NR % 8] = $0
      if (index($0, "\"name\": \"" asset "\"") > 0) {
        for (i = 1; i <= 8; i++) {
          idx = (NR - i) % 8
          if (idx < 0) {
            idx += 8
          }
          if (recent[idx] ~ /"id":[[:space:]]*[0-9]+/) {
            line = recent[idx]
            sub(/.*"id":[[:space:]]*/, "", line)
            sub(/,.*/, "", line)
            print line
            exit
          }
        }
      }
    }
  '
}

resolve_latest_release_tag_from_api() {
  RESPONSE="$(github_api_get "https://api.github.com/repos/$REPO/releases?per_page=1")" || return 1
  TAG="$(printf '%s' "$RESPONSE" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$TAG" ] && [ "$TAG" != "null" ] || return 1

  printf '%s\n' "$TAG"
}

resolve_latest_release_tag() {
  if TAG="$(resolve_latest_release_tag_from_api 2>/dev/null)"; then
    printf '%s\n' "$TAG"
    return
  fi

  command -v gh >/dev/null 2>&1 || fail "could not resolve the latest release tag; install gh or set GITHUB_TOKEN"
  require_command gh
  gh auth status >/dev/null 2>&1 || fail "gh is not authenticated; run: gh auth login"

  TAG="$(gh api "repos/$REPO/releases?per_page=1" --jq '.[0].tag_name')"
  [ -n "$TAG" ] && [ "$TAG" != "null" ] || fail "could not resolve the latest release tag for $REPO"
  printf '%s\n' "$TAG"
}

curl_download() {
  URL="$1"
  OUTPUT_PATH="$2"
  TOKEN="$(github_token)"

  require_command curl

  if [ -n "$TOKEN" ]; then
    curl -fsSL -H "Authorization: Bearer $TOKEN" "$URL" -o "$OUTPUT_PATH"
    return
  fi

  curl -fsSL "$URL" -o "$OUTPUT_PATH"
}

download_with_curl() {
  TAG="$1"
  ASSET="$2"
  URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
  TOKEN="$(github_token)"

  printf 'Downloading %s\n' "$URL"
  if curl_download "$URL" "$TMPDIR/$ASSET"; then
    return
  fi

  [ -n "$TOKEN" ] || return 1

  ASSET_ID="$(release_asset_id_from_api "$TAG" "$ASSET")" || return 1
  [ -n "$ASSET_ID" ] || return 1

  printf 'Downloading %s from the GitHub release API\n' "$ASSET"
  curl -fsSL \
    -H "Accept: application/octet-stream" \
    -H "Authorization: Bearer $TOKEN" \
    "https://api.github.com/repos/${REPO}/releases/assets/${ASSET_ID}" \
    -o "$TMPDIR/$ASSET"
}

download_with_gh() {
  TAG="$1"
  ASSET="$2"

  require_command gh
  gh auth status >/dev/null 2>&1 || fail "gh is not authenticated; run: gh auth login"

  printf 'Downloading %s from %s via gh\n' "$ASSET" "$TAG"
  gh release download "$TAG" --repo "$REPO" --pattern "$ASSET" --dir "$TMPDIR" >/dev/null
}

require_command tar

OS="$(detect_os)"
ARCH="$(detect_arch)"
TMPDIR="$(mktemp -d)"
ARCHIVE_ASSET="buildscope_${OS}_${ARCH}.tar.gz"
ARCHIVE_PATH="$TMPDIR/$ARCHIVE_ASSET"

trap 'rm -rf "$TMPDIR"' EXIT HUP INT TERM

mkdir -p "$BINDIR"

if [ "$VERSION" = "latest" ]; then
  TAG="$(resolve_latest_release_tag)"
else
  TAG="$VERSION"
fi

if ! download_with_curl "$TAG" "$ARCHIVE_ASSET"; then
  command -v gh >/dev/null 2>&1 || fail "unable to download $ARCHIVE_ASSET; install gh or set GITHUB_TOKEN"
  download_with_gh "$TAG" "$ARCHIVE_ASSET"
fi

[ -f "$ARCHIVE_PATH" ] || fail "expected downloaded archive at $ARCHIVE_PATH"

tar -xzf "$ARCHIVE_PATH" -C "$TMPDIR"

BINARY="$(find "$TMPDIR" -type f -name buildscope -perm -u+x | head -n 1)"
[ -n "$BINARY" ] || fail "downloaded archive did not contain a buildscope binary"

install -m 755 "$BINARY" "$BINDIR/buildscope"

printf '\nInstalled buildscope %s to %s\n' "$TAG" "$BINDIR/buildscope"

case ":$PATH:" in
  *":$BINDIR:"*) ;;
  *)
    printf 'Warning: %s is not on PATH\n' "$BINDIR" >&2
    printf 'Warning: add this to your shell profile:\n' >&2
    printf 'Warning:   export PATH="%s:$PATH"\n' "$BINDIR" >&2
    ;;
esac

printf '\nTry:\n'
printf '  buildscope version\n'
printf '  buildscope demo\n'
