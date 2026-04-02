class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  url "https://github.com/sharmilajesupaul/buildscope.git",
      tag: "v0.1.7",
      revision: "0558a36f2cb82a892b3fb0e4c06ca673a50b6f0f"
  version "0.1.7"

  depends_on "go" => :build

  def install
    ldflags = %W[
      -s
      -w
      -X main.version=v#{version}
      -X main.commit=0558a36f2cb82a892b3fb0e4c06ca673a50b6f0f
    ]

    cd "cli" do
      system "go", "build", *std_go_args(ldflags: ldflags), "./cmd/buildscope"
    end
  end

  test do
    assert_match "buildscope v#{version}", shell_output("#{bin}/buildscope version")
  end
end
