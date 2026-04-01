#!/bin/bash

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <version> <revision> <output-path>" >&2
  exit 1
fi

VERSION="$1"
VERSION_NO_V="${VERSION#v}"
REVISION="$2"
OUTPUT_PATH="$3"

mkdir -p "$(dirname "$OUTPUT_PATH")"

cat >"$OUTPUT_PATH" <<EOF
class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  url "https://github.com/sharmilajesupaul/buildscope.git",
      tag: "${VERSION}",
      revision: "${REVISION}"
  version "${VERSION_NO_V}"

  depends_on "go" => :build

  def install
    ldflags = %W[
      -s
      -w
      -X main.version=v#{version}
      -X main.commit=${REVISION}
    ]

    cd "cli" do
      system "go", "build", *std_go_args(ldflags: ldflags), "./cmd/buildscope"
    end
  end

  test do
    assert_match "buildscope v#{version}", shell_output("#{bin}/buildscope version")
  end
end
EOF
