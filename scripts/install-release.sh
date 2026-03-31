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

require_command curl
require_command tar

OS="$(detect_os)"
ARCH="$(detect_arch)"
TMPDIR="$(mktemp -d)"
ARCHIVE="$TMPDIR/buildscope.tar.gz"

mkdir -p "$BINDIR"

if [ "$VERSION" = "latest" ]; then
  ASSET="buildscope_${OS}_${ARCH}.tar.gz"
  URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
  VERSION_NO_V="${VERSION#v}"
  ASSET="buildscope_${VERSION_NO_V}_${OS}_${ARCH}.tar.gz"
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
fi

printf 'Downloading %s\n' "$URL"
curl -fsSL "$URL" -o "$ARCHIVE"

tar -xzf "$ARCHIVE" -C "$TMPDIR"

BINARY="$(find "$TMPDIR" -type f -name buildscope -perm -u+x | head -n 1)"
[ -n "$BINARY" ] || fail "downloaded archive did not contain a buildscope binary"

install -m 755 "$BINARY" "$BINDIR/buildscope"

printf '\nInstalled buildscope to %s\n' "$BINDIR/buildscope"

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
