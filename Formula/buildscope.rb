class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  version "0.1.10"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.10/buildscope_0.1.10_darwin_arm64.tar.gz"
      sha256 ""
    else
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.10/buildscope_0.1.10_darwin_amd64.tar.gz"
      sha256 ""
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
