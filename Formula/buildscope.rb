class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  url "https://github.com/sharmilajesupaul/buildscope.git",
      tag: "v0.1.1",
      revision: "991faca7353960046f3521bd6cd509c89c8773af"
  version "0.1.1"

  depends_on "go" => :build

  def install
    ldflags = %W[
      -s
      -w
      -X main.version=v#{version}
      -X main.commit=991faca7353960046f3521bd6cd509c89c8773af
    ]

    cd "cli" do
      system "go", "build", *std_go_args(ldflags: ldflags), "./cmd/buildscope"
    end
  end

  test do
    assert_match "buildscope v#{version}", shell_output("#{bin}/buildscope version")
  end
end
