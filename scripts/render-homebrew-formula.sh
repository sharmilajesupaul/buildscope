#!/bin/bash

set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "Usage: $0 <version> <darwin-amd64-sha256> <darwin-arm64-sha256> <output-path>" >&2
  exit 1
fi

VERSION="$1"
VERSION_NO_V="${VERSION#v}"
DARWIN_AMD64_SHA="$2"
DARWIN_ARM64_SHA="$3"
OUTPUT_PATH="$4"

mkdir -p "$(dirname "$OUTPUT_PATH")"

cat >"$OUTPUT_PATH" <<EOF
class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  version "${VERSION_NO_V}"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/${VERSION}/buildscope_${VERSION_NO_V}_darwin_arm64.tar.gz"
      sha256 "${DARWIN_ARM64_SHA}"
    else
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/${VERSION}/buildscope_${VERSION_NO_V}_darwin_amd64.tar.gz"
      sha256 "${DARWIN_AMD64_SHA}"
    end
  end

  def install
    bin.install Dir["**/buildscope"].fetch(0)
    doc.install Dir["**/README.md"].first if Dir["**/README.md"].any?
  end

  test do
    assert_match "buildscope v#{version}", shell_output("#{bin}/buildscope version")
  end
end
EOF
