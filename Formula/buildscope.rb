class Buildscope < Formula
  desc "Local-first Bazel dependency explorer"
  homepage "https://github.com/sharmilajesupaul/buildscope"
  url "https://github.com/sharmilajesupaul/buildscope.git",
      tag: "v0.1.6",
      revision: "c9d89d1f377a3e7661b148e04d0cbb217203c5d3"
  version "0.1.6"

  depends_on "go" => :build

  def install
    ldflags = %W[
      -s
      -w
      -X main.version=v#{version}
      -X main.commit=c9d89d1f377a3e7661b148e04d0cbb217203c5d3
    ]

    cd "cli" do
      system "go", "build", *std_go_args(ldflags: ldflags), "./cmd/buildscope"
    end
  end

  test do
    assert_match "buildscope v#{version}", shell_output("#{bin}/buildscope version")
  end
end
