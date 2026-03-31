class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  version "0.1.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.1/buildscope_0.1.1_darwin_arm64.tar.gz"
      sha256 "adb3259a248e2fd17598fee6d71db254b538e5f6b5208b90315c791d2f1a4577"
    else
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.1/buildscope_0.1.1_darwin_amd64.tar.gz"
      sha256 "24c123a8927853c78f33a3b9d47a99ab27b98ae1b601de5f555c82e1fee4a43e"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.1/buildscope_0.1.1_linux_arm64.tar.gz"
      sha256 "8d0764fd6a84ca23dcc760dc21cdbe3124dd9db78177577e0921db80e312a5ef"
    else
      url "https://github.com/sharmilajesupaul/buildscope/releases/download/v0.1.1/buildscope_0.1.1_linux_amd64.tar.gz"
      sha256 "29128b7934552c63373f8e63e88308ed19a78a9a0340e0863fea84c475e8aa15"
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
