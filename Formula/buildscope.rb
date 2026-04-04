class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  url "https://github.com/sharmilajesupaul/buildscope.git",
      tag: "v0.1.9",
      revision: "137184dbd333ba160254101e54f8cd0a84fe1e99"
  version "0.1.9"

  depends_on "go" => :build

  def install
    ldflags = %W[
      -s
      -w
      -X main.version=v#{version}
      -X main.commit=137184dbd333ba160254101e54f8cd0a84fe1e99
    ]

    cd "cli" do
      system "go", "build", *std_go_args(ldflags: ldflags), "./cmd/buildscope"
    end
  end

  test do
    assert_match "buildscope v#{version}", shell_output("#{bin}/buildscope version")
  end
end
