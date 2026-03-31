package main

import (
	"bytes"
	iofs "io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestNormalizeFlagArgsMovesPositionalsToEnd(t *testing.T) {
	t.Parallel()

	args := []string{"//pkg:target", "--workdir", "/tmp/ws", "--addr", ":4500"}
	got := normalizeFlagArgs(args)
	want := []string{"--workdir", "/tmp/ws", "--addr", ":4500", "//pkg:target"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("normalizeFlagArgs = %#v, want %#v", got, want)
	}
}

func TestValidateUIDir(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}

	got, err := validateUIDir(dir)
	if err != nil {
		t.Fatalf("validateUIDir returned error: %v", err)
	}
	if got != dir {
		t.Fatalf("validateUIDir = %q, want %q", got, dir)
	}
}

func TestValidateUIDirRequiresIndexHTML(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if _, err := validateUIDir(dir); err == nil {
		t.Fatal("validateUIDir succeeded for a directory without index.html")
	}
}

func TestValidateWorkspaceDirAcceptsModuleBazel(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "MODULE.bazel"), []byte("module(name = \"demo\")\n"), 0o644); err != nil {
		t.Fatalf("write MODULE.bazel: %v", err)
	}

	got, err := validateWorkspaceDir(dir)
	if err != nil {
		t.Fatalf("validateWorkspaceDir returned error: %v", err)
	}
	if got != dir {
		t.Fatalf("validateWorkspaceDir = %q, want %q", got, dir)
	}
}

func TestValidateWorkspaceDirRejectsNonWorkspace(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if _, err := validateWorkspaceDir(dir); err == nil {
		t.Fatal("validateWorkspaceDir succeeded for a directory without Bazel markers")
	}
}

func TestResolveUIAssetsDefaultsToEmbeddedBundle(t *testing.T) {
	t.Parallel()

	ui, err := resolveUIAssets("")
	if err != nil {
		t.Fatalf("resolveUIAssets returned error: %v", err)
	}

	if ui.dir != "" {
		t.Fatalf("resolveUIAssets dir = %q, want embedded assets", ui.dir)
	}
	if _, err := iofs.Stat(ui.fsys, "index.html"); err != nil {
		t.Fatalf("embedded assets are missing index.html: %v", err)
	}
}

func TestBundledGraphPayloadReadsEmbeddedSample(t *testing.T) {
	t.Parallel()

	ui, err := resolveUIAssets("")
	if err != nil {
		t.Fatalf("resolveUIAssets returned error: %v", err)
	}

	graph, err := bundledGraphPayload(ui)
	if err != nil {
		t.Fatalf("bundledGraphPayload returned error: %v", err)
	}
	if graph.path != "" {
		t.Fatalf("bundledGraphPayload path = %q, want embedded bytes", graph.path)
	}
	if !bytes.Contains(graph.data, []byte(`"nodes"`)) {
		t.Fatalf("bundledGraphPayload data did not contain graph JSON")
	}
}

func TestPrintVersionIncludesBuildMetadata(t *testing.T) {
	t.Parallel()

	origVersion := version
	origCommit := commit
	origBuildDate := buildDate
	version = "v0.1.7"
	commit = "abc1234"
	buildDate = "2026-03-30T17:00:00Z"
	defer func() {
		version = origVersion
		commit = origCommit
		buildDate = origBuildDate
	}()

	var buf bytes.Buffer
	printVersion(&buf)

	output := buf.String()
	for _, part := range []string{
		"buildscope v0.1.7",
		"commit: abc1234",
		"built: 2026-03-30T17:00:00Z",
	} {
		if !strings.Contains(output, part) {
			t.Fatalf("printVersion output %q did not contain %q", output, part)
		}
	}
}
