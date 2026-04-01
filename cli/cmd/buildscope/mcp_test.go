package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestMCPServerCallToolGetAnalysisFromHTTP(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/analysis.json" {
			t.Fatalf("path = %q, want /analysis.json", r.URL.Path)
		}
		if got := r.URL.Query().Get("top"); got != "3" {
			t.Fatalf("top query = %q, want 3", got)
		}
		if got := r.URL.Query().Get("focus"); got != "//pkg:hub" {
			t.Fatalf("focus query = %q, want //pkg:hub", got)
		}
		writeJSON(w, http.StatusOK, analysisResponse{
			NodeCount: 7,
			EdgeCount: 9,
			TopBreakupCandidates: []breakupCandidate{
				{ID: "//pkg:hub", Label: "//pkg:hub", Pressure: 42.5},
			},
		})
	}))
	defer server.Close()

	mcp := &mcpServer{
		source: mcpSourceConfig{ServerURL: server.URL},
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
	}

	args, err := json.Marshal(mcpAnalysisArgs{Top: 3, Focus: "//pkg:hub"})
	if err != nil {
		t.Fatalf("marshal args: %v", err)
	}
	result := mcp.callTool("get_analysis", args)

	if result.IsError {
		t.Fatalf("get_analysis returned error: %#v", result)
	}
	if len(result.Content) != 1 || !strings.Contains(result.Content[0].Text, "//pkg:hub") {
		t.Fatalf("summary = %#v, want mention of //pkg:hub", result.Content)
	}

	response, ok := result.StructuredContent.(analysisResponse)
	if !ok {
		t.Fatalf("structured content type = %T, want analysisResponse", result.StructuredContent)
	}
	if got := response.TopBreakupCandidates[0].ID; got != "//pkg:hub" {
		t.Fatalf("top breakup candidate = %q, want //pkg:hub", got)
	}
}

func TestMCPServerGetTargetDetailsFromGraphFile(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	graphPath := filepath.Join(tempDir, "graph.json")
	detailsPath := filepath.Join(tempDir, "graph.details.json")

	graphData := []byte(`{
		"schemaVersion": 2,
		"nodes": [
			{"id":"//app:bin","label":"//app:bin"},
			{"id":"//pkg:hub","label":"//pkg:hub"},
			{"id":"//pkg:leaf","label":"//pkg:leaf"}
		],
		"edges": [
			{"source":"//app:bin","target":"//pkg:hub"},
			{"source":"//pkg:hub","target":"//pkg:leaf"}
		]
	}`)
	if err := os.WriteFile(graphPath, graphData, 0o644); err != nil {
		t.Fatalf("write graph: %v", err)
	}

	detailsData := []byte(`{
		"nodes": {
			"//pkg:hub": {
				"directInputs": [{"label":"//pkg:file.go","kind":"source-file","sizeBytes":128}],
				"directOutputs": [{"path":"bazel-out/pkg/out.pb","kind":"output","sizeBytes":256}]
			}
		}
	}`)
	if err := os.WriteFile(detailsPath, detailsData, 0o644); err != nil {
		t.Fatalf("write details: %v", err)
	}

	mcp := &mcpServer{
		source: mcpSourceConfig{
			GraphPath:   graphPath,
			DetailsPath: detailsPath,
		},
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
	}

	args, err := json.Marshal(mcpTargetArgs{Target: "//pkg:hub"})
	if err != nil {
		t.Fatalf("marshal args: %v", err)
	}
	result := mcp.callTool("get_target_details", args)

	if result.IsError {
		t.Fatalf("get_target_details returned error: %#v", result)
	}

	details, ok := result.StructuredContent.(mcpTargetDetailsResult)
	if !ok {
		t.Fatalf("structured content type = %T, want mcpTargetDetailsResult", result.StructuredContent)
	}
	if details.Focus == nil || details.Focus.ID != "//pkg:hub" {
		t.Fatalf("focus = %#v, want //pkg:hub", details.Focus)
	}
	if !details.DetailsAvailable {
		t.Fatal("details sidecar should be available")
	}
	if details.Details == nil || len(details.Details.DirectInputs) != 1 {
		t.Fatalf("direct inputs = %#v, want 1 entry", details.Details)
	}
	if len(details.Details.DirectOutputs) != 1 {
		t.Fatalf("direct outputs = %#v, want 1 entry", details.Details.DirectOutputs)
	}
}

func TestMCPHandleInitializeIncludesInstructions(t *testing.T) {
	t.Parallel()

	mcp := &mcpServer{
		source: mcpSourceConfig{ServerURL: "http://localhost:4422"},
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
	}

	response := mcp.handleRequest(mcpRequest{
		JSONRPC: mcpJSONRPCVersion,
		ID:      json.RawMessage("1"),
		Method:  "initialize",
		Params:  json.RawMessage(`{"protocolVersion":"2024-11-05"}`),
	})
	if response == nil {
		t.Fatal("initialize response is nil")
	}
	if response.Error != nil {
		t.Fatalf("initialize error = %#v", response.Error)
	}

	result, ok := response.Result.(mcpInitializeResult)
	if !ok {
		t.Fatalf("result type = %T, want mcpInitializeResult", response.Result)
	}
	if result.ServerInfo.Name != "buildscope" {
		t.Fatalf("server name = %q, want buildscope", result.ServerInfo.Name)
	}
	if !strings.Contains(result.Instructions, "get_analysis") {
		t.Fatalf("instructions = %q, want get_analysis guidance", result.Instructions)
	}
}

func TestNormalizeMCPServerURLPreservesCustomPort(t *testing.T) {
	t.Parallel()

	if got := normalizeMCPServerURL("localhost:4500/"); got != "http://localhost:4500" {
		t.Fatalf("normalized URL = %q, want http://localhost:4500", got)
	}
}
