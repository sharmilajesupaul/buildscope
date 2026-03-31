#!/bin/bash

set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "Usage: $0 <version> <darwin-amd64-sha> <darwin-arm64-sha> <linux-amd64-sha> <linux-arm64-sha> <output-path>" >&2
  exit 1
fi

VERSION="$1"
VERSION_NO_V="${VERSION#v}"
DARWIN_AMD64_SHA="$2"
DARWIN_ARM64_SHA="$3"
LINUX_AMD64_SHA="$4"
LINUX_ARM64_SHA="$5"
OUTPUT_PATH="$6"

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

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/${VERSION}/buildscope_${VERSION_NO_V}_linux_arm64.tar.gz"
      sha256 "${LINUX_ARM64_SHA}"
    else
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/${VERSION}/buildscope_${VERSION_NO_V}_linux_amd64.tar.gz"
      sha256 "${LINUX_AMD64_SHA}"
    end
  end

  def install
    bin.install "buildscope"
    prefix.install_metafiles
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/buildscope version")
  end
end
EOF
