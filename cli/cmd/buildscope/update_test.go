package main

import (
	"strings"
	"testing"
)

func TestNormalizeRequestedVersion(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"":       "latest",
		"latest": "latest",
		"0.1.9":  "v0.1.9",
		"v0.1.9": "v0.1.9",
		"main":   "main",
	}

	for input, want := range tests {
		if got := normalizeRequestedVersion(input); got != want {
			t.Fatalf("normalizeRequestedVersion(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestReleaseArchiveAssetName(t *testing.T) {
	t.Parallel()

	got, err := releaseArchiveAssetName("darwin", "arm64")
	if err != nil {
		t.Fatalf("releaseArchiveAssetName returned error: %v", err)
	}
	if got != "buildscope_darwin_arm64.tar.gz" {
		t.Fatalf("releaseArchiveAssetName = %q, want %q", got, "buildscope_darwin_arm64.tar.gz")
	}
}

func TestReleaseArchiveAssetNameRejectsUnsupportedPlatform(t *testing.T) {
	t.Parallel()

	if _, err := releaseArchiveAssetName("windows", "amd64"); err == nil {
		t.Fatal("releaseArchiveAssetName(windows, amd64) succeeded, want error")
	}
	if _, err := releaseArchiveAssetName("linux", "386"); err == nil {
		t.Fatal("releaseArchiveAssetName(linux, 386) succeeded, want error")
	}
}

func TestLatestReleaseTagFromJSON(t *testing.T) {
	t.Parallel()

	tag, err := latestReleaseTagFromJSON(strings.NewReader(`[{"tag_name":"v0.1.9"}]`))
	if err != nil {
		t.Fatalf("latestReleaseTagFromJSON returned error: %v", err)
	}
	if tag != "v0.1.9" {
		t.Fatalf("latestReleaseTagFromJSON = %q, want %q", tag, "v0.1.9")
	}
}

func TestLatestReleaseTagFromJSONRejectsMissingTag(t *testing.T) {
	t.Parallel()

	if _, err := latestReleaseTagFromJSON(strings.NewReader(`[]`)); err == nil {
		t.Fatal("latestReleaseTagFromJSON succeeded for empty releases, want error")
	}
}

func TestIsHomebrewManagedPath(t *testing.T) {
	t.Parallel()

	if !isHomebrewManagedPath("/opt/homebrew/Cellar/buildscope/0.1.9/bin/buildscope") {
		t.Fatal("isHomebrewManagedPath did not detect Homebrew Cellar path")
	}
	if isHomebrewManagedPath("/Users/example/.local/bin/buildscope") {
		t.Fatal("isHomebrewManagedPath incorrectly detected non-Homebrew path")
	}
}
