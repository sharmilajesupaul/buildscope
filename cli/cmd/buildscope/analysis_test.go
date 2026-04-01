package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestAnalysisResponseRanksBroadHubAsBreakupCandidate(t *testing.T) {
	t.Parallel()

	base := buildAnalysisBase(graph{
		Nodes: []graphNode{
			{ID: "//consumer:a", Label: "A"},
			{ID: "//consumer:b", Label: "B"},
			{ID: "//consumer:c", Label: "C"},
			{ID: "//consumer:d", Label: "D"},
			{ID: "//hub:core", Label: "Hub"},
			{ID: "//leaf:shared", Label: "Leaf"},
			{ID: "//dep:x", Label: "X"},
			{ID: "//dep:y", Label: "Y"},
			{ID: "//dep:z", Label: "Z"},
		},
		Edges: []graphEdge{
			{Source: "//consumer:a", Target: "//hub:core"},
			{Source: "//consumer:b", Target: "//hub:core"},
			{Source: "//consumer:c", Target: "//hub:core"},
			{Source: "//consumer:d", Target: "//hub:core"},
			{Source: "//consumer:a", Target: "//leaf:shared"},
			{Source: "//consumer:b", Target: "//leaf:shared"},
			{Source: "//consumer:c", Target: "//leaf:shared"},
			{Source: "//consumer:d", Target: "//leaf:shared"},
			{Source: "//hub:core", Target: "//dep:x"},
			{Source: "//hub:core", Target: "//dep:y"},
			{Source: "//hub:core", Target: "//dep:z"},
		},
	})

	response, err := base.response(3, "//hub:core")
	if err != nil {
		t.Fatalf("analysis response returned error: %v", err)
	}

	if got := response.TopBreakupCandidates[0].ID; got != "//hub:core" {
		t.Fatalf("top breakup candidate = %q, want //hub:core", got)
	}
	if got := response.TopImpactTargets[0].ID; got != "//dep:x" {
		t.Fatalf("top impact target = %q, want //dep:x", got)
	}
	if response.Focus == nil {
		t.Fatal("focus target missing")
	}
	if response.Focus.TransitiveInDegree != 4 {
		t.Fatalf("focus transitive dependents = %d, want 4", response.Focus.TransitiveInDegree)
	}
	if response.Focus.OutDegree != 3 {
		t.Fatalf("focus direct deps = %d, want 3", response.Focus.OutDegree)
	}
	if response.Focus.TransitiveOutDegree != 3 {
		t.Fatalf("focus transitive deps = %d, want 3", response.Focus.TransitiveOutDegree)
	}
	if len(response.TopBreakupCandidates[0].Recommendations) == 0 {
		t.Fatal("expected breakup recommendations")
	}
}

func TestAnalysisResponseIncludesCyclicHotspots(t *testing.T) {
	t.Parallel()

	base := buildAnalysisBase(graph{
		Nodes: []graphNode{
			{ID: "//cycle:a", Label: "A"},
			{ID: "//cycle:b", Label: "B"},
			{ID: "//cycle:c", Label: "C"},
			{ID: "//chain:d", Label: "D"},
		},
		Edges: []graphEdge{
			{Source: "//cycle:a", Target: "//cycle:b"},
			{Source: "//cycle:b", Target: "//cycle:c"},
			{Source: "//cycle:c", Target: "//cycle:a"},
			{Source: "//cycle:c", Target: "//chain:d"},
		},
	})

	response, err := base.response(5, "//cycle:a")
	if err != nil {
		t.Fatalf("analysis response returned error: %v", err)
	}

	if len(response.CyclicHotspots) == 0 {
		t.Fatal("expected cyclic hotspots")
	}
	if response.CyclicHotspots[0].Size != 3 {
		t.Fatalf("cyclic hotspot size = %d, want 3", response.CyclicHotspots[0].Size)
	}
	if response.Focus == nil {
		t.Fatal("focus target missing")
	}
	if response.Focus.SCCSize != 3 {
		t.Fatalf("focus SCC size = %d, want 3", response.Focus.SCCSize)
	}
	if !response.Focus.IsHotspot {
		t.Fatal("expected cycle focus to be a hotspot")
	}
}

func TestAnalysisResponseIncludesEnrichedRankingsAndFocus(t *testing.T) {
	t.Parallel()

	base := buildAnalysisBase(graph{
		SchemaVersion: 2,
		AnalysisMode:  "analyze",
		Target:        "//app:bin",
		DetailsPath:   "graph.details.json",
		Nodes: []graphNode{
			{ID: "//app:bin", Label: "//app:bin", NodeType: "rule", RuleKind: "go_binary"},
			{
				ID:              "//pkg:biglib",
				Label:           "//pkg:biglib",
				NodeType:        "rule",
				RuleKind:        "go_library",
				PackageName:     "pkg",
				SourceFileCount: 12,
				SourceBytes:     12_000,
				InputFileCount:  13,
				InputBytes:      12_800,
				TopFiles:        []artifactSummary{{Label: "//pkg:file_a.go", SizeBytes: 7000}},
			},
			{
				ID:              "//pkg:generator",
				Label:           "//pkg:generator",
				NodeType:        "rule",
				RuleKind:        "genrule",
				PackageName:     "pkg",
				OutputFileCount: 4,
				OutputBytes:     32_000,
				ActionCount:     9,
				MnemonicSummary: []mnemonicCount{{Mnemonic: "Genrule", Count: 9}},
				TopOutputs:      []artifactSummary{{Path: "bazel-out/k8-fastbuild/bin/pkg/out.pb", SizeBytes: 32000}},
			},
			{ID: "//pkg:runtime", Label: "//pkg:runtime", NodeType: "rule", RuleKind: "go_library"},
			{ID: "//pkg:file_a.go", Label: "//pkg:file_a.go", NodeType: "source-file"},
		},
		Edges: []graphEdge{
			{Source: "//app:bin", Target: "//pkg:biglib"},
			{Source: "//app:bin", Target: "//pkg:generator"},
			{Source: "//pkg:generator", Target: "//pkg:runtime"},
			{Source: "//pkg:biglib", Target: "//pkg:file_a.go"},
		},
	})

	response, err := base.response(3, "//pkg:generator")
	if err != nil {
		t.Fatalf("analysis response returned error: %v", err)
	}

	if response.SchemaVersion != 2 || response.AnalysisMode != "analyze" {
		t.Fatalf("metadata = (%d, %q), want (2, analyze)", response.SchemaVersion, response.AnalysisMode)
	}
	if response.RuleTargetCount != 4 {
		t.Fatalf("rule target count = %d, want 4", response.RuleTargetCount)
	}
	if got := response.TopSourceHeavyTargets[0].ID; got != "//pkg:biglib" {
		t.Fatalf("top source-heavy target = %q, want //pkg:biglib", got)
	}
	if got := response.TopOutputHeavyTargets[0].ID; got != "//pkg:generator" {
		t.Fatalf("top output-heavy target = %q, want //pkg:generator", got)
	}
	if response.Focus == nil {
		t.Fatal("focus target missing")
	}
	if response.Focus.NodeType != "rule" || response.Focus.RuleKind != "genrule" {
		t.Fatalf("focus type = (%q, %q), want (rule, genrule)", response.Focus.NodeType, response.Focus.RuleKind)
	}
	if response.Focus.OutputBytes != 32_000 {
		t.Fatalf("focus output bytes = %d, want 32000", response.Focus.OutputBytes)
	}
	if response.Focus.ActionCount != 9 {
		t.Fatalf("focus action count = %d, want 9", response.Focus.ActionCount)
	}
	if len(response.Focus.TopOutputs) != 1 {
		t.Fatalf("focus top outputs = %d, want 1", len(response.Focus.TopOutputs))
	}
	if len(response.TopBreakupCandidates) == 0 || response.TopBreakupCandidates[0].ID != "//pkg:generator" {
		t.Fatalf("top breakup candidate = %#v, want //pkg:generator first", response.TopBreakupCandidates)
	}
}

func TestServeMuxServesAnalysisJSON(t *testing.T) {
	t.Parallel()

	uiDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(uiDir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}

	graphData, err := json.Marshal(graph{
		Nodes: []graphNode{
			{ID: "//consumer:a", Label: "A"},
			{ID: "//hub:core", Label: "Hub"},
			{ID: "//dep:x", Label: "X"},
		},
		Edges: []graphEdge{
			{Source: "//consumer:a", Target: "//hub:core"},
			{Source: "//hub:core", Target: "//dep:x"},
		},
	})
	if err != nil {
		t.Fatalf("marshal graph: %v", err)
	}

	mux := newServeMux(uiAssets{
		fsys:   os.DirFS(uiDir),
		source: uiDir,
		dir:    uiDir,
	}, graphData, nil, buildAnalysisBase(graph{
		Nodes: []graphNode{
			{ID: "//consumer:a", Label: "A"},
			{ID: "//hub:core", Label: "Hub"},
			{ID: "//dep:x", Label: "X"},
		},
		Edges: []graphEdge{
			{Source: "//consumer:a", Target: "//hub:core"},
			{Source: "//hub:core", Target: "//dep:x"},
		},
	}))

	request := httptest.NewRequest(http.MethodGet, "/analysis.json?top=1&focus=//hub:core", nil)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("/analysis.json status = %d, want 200", recorder.Code)
	}

	var response analysisResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode analysis response: %v", err)
	}
	if got := response.TopBreakupCandidates[0].ID; got != "//hub:core" {
		t.Fatalf("top breakup candidate = %q, want //hub:core", got)
	}
	if response.Focus == nil || response.Focus.ID != "//hub:core" {
		t.Fatalf("focus target = %#v, want //hub:core", response.Focus)
	}

	badRequest := httptest.NewRequest(http.MethodGet, "/analysis.json?top=0", nil)
	badRecorder := httptest.NewRecorder()
	mux.ServeHTTP(badRecorder, badRequest)
	if badRecorder.Code != http.StatusBadRequest {
		t.Fatalf("invalid top status = %d, want 400", badRecorder.Code)
	}
}

func TestServeMuxServesGraphDetailsJSON(t *testing.T) {
	t.Parallel()

	uiDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(uiDir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}

	graphData, err := json.Marshal(graph{
		Nodes: []graphNode{{ID: "//pkg:target", Label: "//pkg:target"}},
	})
	if err != nil {
		t.Fatalf("marshal graph: %v", err)
	}
	detailsData := []byte(`{"nodes":{"//pkg:target":{"directInputs":[{"label":"//pkg:file.go"}]}}}`)

	mux := newServeMux(uiAssets{
		fsys:   os.DirFS(uiDir),
		source: uiDir,
		dir:    uiDir,
	}, graphData, detailsData, buildAnalysisBase(graph{
		Nodes: []graphNode{{ID: "//pkg:target", Label: "//pkg:target"}},
	}))

	request := httptest.NewRequest(http.MethodGet, "/graph.details.json", nil)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("/graph.details.json status = %d, want 200", recorder.Code)
	}
	if got := recorder.Body.String(); got != string(detailsData) {
		t.Fatalf("/graph.details.json body = %q, want %q", got, detailsData)
	}
}
