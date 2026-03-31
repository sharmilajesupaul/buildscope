class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  version "0.1.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.0/buildscope_0.1.0_darwin_arm64.tar.gz"
      sha256 "fc11b2b222be38ffaebd090d54d7ab20d6621102f73f35a81e671b4020fb2f37"
    else
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.0/buildscope_0.1.0_darwin_amd64.tar.gz"
      sha256 "8799b9d80b8a97fdf38559a892960260c148078b04fec8890cefea1421ce5825"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.0/buildscope_0.1.0_linux_arm64.tar.gz"
      sha256 "37f81004d2661ff408e41cf3c7dac5f886863440855f1315fe9dfc45ed3b0966"
    else
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.0/buildscope_0.1.0_linux_amd64.tar.gz"
      sha256 "8daccf01de82aee33e1a08001ddd152e4b8d4e35f3e8a1ff5d2e82ef61fd1738"
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
