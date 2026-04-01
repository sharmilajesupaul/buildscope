package main

import (
	"bytes"
	"encoding/json"
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

func TestNormalizeListenAddrDefaultsToLoopback(t *testing.T) {
	t.Parallel()

	got, err := normalizeListenAddr("")
	if err != nil {
		t.Fatalf("normalizeListenAddr returned error: %v", err)
	}
	if got != defaultListenAddr {
		t.Fatalf("normalizeListenAddr = %q, want %q", got, defaultListenAddr)
	}
}

func TestNormalizeListenAddrPinsHostlessPortToLoopback(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		":4500":   "127.0.0.1:4500",
		"4501":    "127.0.0.1:4501",
		" :4502 ": "127.0.0.1:4502",
	}

	for input, want := range tests {
		got, err := normalizeListenAddr(input)
		if err != nil {
			t.Fatalf("normalizeListenAddr(%q) returned error: %v", input, err)
		}
		if got != want {
			t.Fatalf("normalizeListenAddr(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizeListenAddrPreservesExplicitHost(t *testing.T) {
	t.Parallel()

	got, err := normalizeListenAddr("0.0.0.0:4600")
	if err != nil {
		t.Fatalf("normalizeListenAddr returned error: %v", err)
	}
	if got != "0.0.0.0:4600" {
		t.Fatalf("normalizeListenAddr = %q, want 0.0.0.0:4600", got)
	}
}

func TestNormalizeListenAddrRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	for _, input := range []string{"localhost", "host:notaport", ":0", "70000"} {
		if _, err := normalizeListenAddr(input); err == nil {
			t.Fatalf("normalizeListenAddr(%q) succeeded, want error", input)
		}
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

func TestSanitizeServedGraphJSONRedactsWorkspaceRoot(t *testing.T) {
	t.Parallel()

	input := []byte(`{
		"schemaVersion": 2,
		"analysisMode": "analyze",
		"target": "//app:bin",
		"workspaceRoot": "/Users/example/workspace",
		"detailsPath": "graph.details.json",
		"nodes": [{"id":"//app:bin","label":"//app:bin"}],
		"edges": []
	}`)

	graphData, rawGraph, err := sanitizeServedGraphJSON(input)
	if err != nil {
		t.Fatalf("sanitizeServedGraphJSON returned error: %v", err)
	}
	if bytes.Contains(graphData, []byte(`"workspaceRoot"`)) {
		t.Fatalf("sanitized graph data still contained workspaceRoot: %s", graphData)
	}
	if rawGraph.Target != "//app:bin" {
		t.Fatalf("sanitized graph target = %q, want //app:bin", rawGraph.Target)
	}

	var served map[string]any
	if err := json.Unmarshal(graphData, &served); err != nil {
		t.Fatalf("decode sanitized graph JSON: %v", err)
	}
	if _, exists := served["workspaceRoot"]; exists {
		t.Fatalf("sanitized graph JSON still exposed workspaceRoot: %#v", served)
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
