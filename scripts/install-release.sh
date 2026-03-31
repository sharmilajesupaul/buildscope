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

resolve_latest_prerelease_tag() {
  require_command gh
  gh auth status >/dev/null 2>&1 || fail "gh is not authenticated; run: gh auth login"

  TAG="$(gh api "repos/$REPO/releases" --jq 'map(select(.prerelease and (.draft | not)))[0].tag_name')"
  [ -n "$TAG" ] && [ "$TAG" != "null" ] || fail "could not resolve the latest prerelease tag for $REPO"

  printf '%s\n' "$TAG"
}

download_with_gh() {
  TAG="$1"
  ASSET="$2"

  require_command gh
  gh auth status >/dev/null 2>&1 || fail "gh is not authenticated; run: gh auth login"

  printf 'Downloading %s from %s via gh\n' "$ASSET" "$TAG"
  gh release download "$TAG" --repo "$REPO" --pattern "$ASSET" --dir "$TMPDIR" >/dev/null
}

download_with_curl() {
  TAG="$1"
  ASSET="$2"
  URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"

  require_command curl

  printf 'Downloading %s\n' "$URL"
  curl -fsSL "$URL" -o "$TMPDIR/$ASSET"
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
  TAG="$(resolve_latest_prerelease_tag)"
else
  TAG="$VERSION"
fi

if command -v gh >/dev/null 2>&1; then
  download_with_gh "$TAG" "$ARCHIVE_ASSET"
else
  [ "$VERSION" = "latest" ] && fail "gh is required to install the latest prerelease"
  download_with_curl "$TAG" "$ARCHIVE_ASSET"
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
