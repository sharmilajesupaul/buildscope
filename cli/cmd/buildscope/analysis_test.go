package main

import (
	"encoding/json"
	"fmt"
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

func TestTargetDecompositionGroupsDirectRuleDepsByPackage(t *testing.T) {
	t.Parallel()

	base := buildAnalysisBase(graph{
		Nodes: []graphNode{
			{ID: "//app:bin", Label: "//app:bin", NodeType: "rule"},
			{ID: "//feature/auth:api", Label: "//feature/auth:api", NodeType: "rule", ActionCount: 3},
			{ID: "//feature/auth:session", Label: "//feature/auth:session", NodeType: "rule", ActionCount: 2},
			{ID: "//feature/data:store", Label: "//feature/data:store", NodeType: "rule", ActionCount: 5},
			{ID: "//feature/data:model", Label: "//feature/data:model", NodeType: "rule", ActionCount: 4},
			{ID: "//feature/ui:view", Label: "//feature/ui:view", NodeType: "rule", ActionCount: 1},
		},
		Edges: []graphEdge{
			{Source: "//app:bin", Target: "//feature/auth:api"},
			{Source: "//app:bin", Target: "//feature/auth:session"},
			{Source: "//app:bin", Target: "//feature/data:store"},
			{Source: "//app:bin", Target: "//feature/data:model"},
			{Source: "//app:bin", Target: "//feature/ui:view"},
			{Source: "//feature/auth:api", Target: "//feature/auth:session"},
			{Source: "//feature/data:store", Target: "//feature/data:model"},
			{Source: "//feature/auth:api", Target: "//feature/data:store"},
		},
	})

	decomposition, err := base.decomposition("//app:bin")
	if err != nil {
		t.Fatalf("decomposition returned error: %v", err)
	}
	if !decomposition.Eligible {
		t.Fatalf("expected eligible decomposition, got %#v", decomposition)
	}
	if decomposition.CommunityCount != 3 {
		t.Fatalf("community count = %d, want 3", decomposition.CommunityCount)
	}
	foundAuth := false
	for _, community := range decomposition.Communities {
		if community.Title == "//feature/auth" {
			foundAuth = true
			break
		}
	}
	if !foundAuth {
		t.Fatalf("communities = %#v, want //feature/auth group", decomposition.Communities)
	}
	if got := decomposition.CrossCommunityEdgeRatio; got < 0.333 || got > 0.334 {
		t.Fatalf("cross-community edge ratio = %f, want about 0.333", got)
	}
	if decomposition.Impact.Band == "" || decomposition.Mass.Band == "" || decomposition.SplitFit.Band == "" {
		t.Fatalf("expected metric insights, got %#v", decomposition)
	}
	if decomposition.Verdict == "" {
		t.Fatalf("expected decomposition verdict, got %#v", decomposition)
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
	}), nil)

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

func TestServeMuxServesDecompositionJSON(t *testing.T) {
	t.Parallel()

	uiDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(uiDir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}

	graphValue := graph{
		Nodes: []graphNode{
			{ID: "//app:bin", Label: "//app:bin", NodeType: "rule"},
			{ID: "//feature/auth:api", Label: "//feature/auth:api", NodeType: "rule"},
			{ID: "//feature/data:store", Label: "//feature/data:store", NodeType: "rule"},
		},
		Edges: []graphEdge{
			{Source: "//app:bin", Target: "//feature/auth:api"},
			{Source: "//app:bin", Target: "//feature/data:store"},
		},
	}
	graphData, err := json.Marshal(graphValue)
	if err != nil {
		t.Fatalf("marshal graph: %v", err)
	}

	mux := newServeMux(uiAssets{
		fsys:   os.DirFS(uiDir),
		source: uiDir,
		dir:    uiDir,
	}, graphData, nil, buildAnalysisBase(graphValue), nil)

	request := httptest.NewRequest(http.MethodGet, "/decomposition.json?target=//app:bin", nil)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("/decomposition.json status = %d, want 200", recorder.Code)
	}

	var response targetDecompositionResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode decomposition response: %v", err)
	}
	if response.Target != "//app:bin" {
		t.Fatalf("target = %q, want //app:bin", response.Target)
	}
	if !response.Eligible {
		t.Fatalf("expected eligible decomposition, got %#v", response)
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
	}), nil)

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

func TestAnalysisResponseDemotesTinySharedLeafs(t *testing.T) {
	t.Parallel()

	nodes := []graphNode{
		{ID: "//heavy:hub", Label: "//heavy:hub", NodeType: "rule", InputBytes: 512 * 1024, OutputBytes: 2 * 1024 * 1024, ActionCount: 12},
		{ID: "//leaf:tiny", Label: "//leaf:tiny", NodeType: "rule", SourceBytes: 512, ActionCount: 1},
		{ID: "//dep:a", Label: "//dep:a", NodeType: "rule"},
		{ID: "//dep:b", Label: "//dep:b", NodeType: "rule"},
		{ID: "//dep:c", Label: "//dep:c", NodeType: "rule"},
		{ID: "//leaf:impl", Label: "//leaf:impl", NodeType: "rule"},
	}
	edges := []graphEdge{
		{Source: "//heavy:hub", Target: "//dep:a"},
		{Source: "//heavy:hub", Target: "//dep:b"},
		{Source: "//heavy:hub", Target: "//dep:c"},
		{Source: "//leaf:tiny", Target: "//leaf:impl"},
	}
	for i := 0; i < 24; i++ {
		consumer := fmt.Sprintf("//consumer:%02d", i)
		nodes = append(nodes, graphNode{ID: consumer, Label: consumer, NodeType: "rule"})
		edges = append(edges, graphEdge{Source: consumer, Target: "//leaf:tiny"})
		if i < 14 {
			edges = append(edges, graphEdge{Source: consumer, Target: "//heavy:hub"})
		}
	}

	response, err := buildAnalysisBase(graph{Nodes: nodes, Edges: edges}).response(5, "//leaf:tiny")
	if err != nil {
		t.Fatalf("analysis response returned error: %v", err)
	}

	if got := response.TopBreakupCandidates[0].ID; got != "//heavy:hub" {
		t.Fatalf("top breakup candidate = %q, want //heavy:hub", got)
	}
	if response.Focus == nil || !response.Focus.StableSharedLeaf {
		t.Fatalf("focus = %#v, want stable shared leaf classification", response.Focus)
	}
}

func TestServeMuxServesFileFocusJSON(t *testing.T) {
	t.Parallel()

	uiDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(uiDir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}

	graphData, err := json.Marshal(graph{
		Target: "//app:bin",
		Nodes: []graphNode{
			{ID: "//app:bin", Label: "//app:bin", NodeType: "rule", InputBytes: 128 * 1024, ActionCount: 4},
			{ID: "//pkg:lib", Label: "//pkg:lib", NodeType: "rule", InputBytes: 512 * 1024, ActionCount: 8},
			{ID: "//pkg:file.go", Label: "//pkg:file.go", NodeType: "source-file"},
		},
		Edges: []graphEdge{
			{Source: "//app:bin", Target: "//pkg:lib"},
			{Source: "//pkg:lib", Target: "//pkg:file.go"},
			{Source: "//app:bin", Target: "//pkg:file.go"},
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
		Target: "//app:bin",
		Nodes: []graphNode{
			{ID: "//app:bin", Label: "//app:bin", NodeType: "rule", InputBytes: 128 * 1024, ActionCount: 4},
			{ID: "//pkg:lib", Label: "//pkg:lib", NodeType: "rule", InputBytes: 512 * 1024, ActionCount: 8},
			{ID: "//pkg:file.go", Label: "//pkg:file.go", NodeType: "source-file"},
		},
		Edges: []graphEdge{
			{Source: "//app:bin", Target: "//pkg:lib"},
			{Source: "//pkg:lib", Target: "//pkg:file.go"},
			{Source: "//app:bin", Target: "//pkg:file.go"},
		},
	}), nil)

	request := httptest.NewRequest(http.MethodGet, "/file-focus.json?label=//pkg:file.go", nil)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("/file-focus.json status = %d, want 200", recorder.Code)
	}

	var response fileFocusResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode file focus response: %v", err)
	}
	if response.CurrentGraphDirectConsumerCount != 2 {
		t.Fatalf("direct consumer count = %d, want 2", response.CurrentGraphDirectConsumerCount)
	}
	if response.CurrentGraphTransitiveConsumerCount != 2 {
		t.Fatalf("transitive consumer count = %d, want 2", response.CurrentGraphTransitiveConsumerCount)
	}
	if len(response.TopCurrentGraphConsumers) == 0 || response.TopCurrentGraphConsumers[0].ID != "//pkg:lib" {
		t.Fatalf("top current graph consumers = %#v, want //pkg:lib first", response.TopCurrentGraphConsumers)
	}
}
