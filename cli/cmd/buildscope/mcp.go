package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultMCPProtocolVersion = "2024-11-05"
	defaultMCPServerURL       = defaultServerURL
	mcpJSONRPCVersion         = "2.0"
)

type mcpSourceConfig struct {
	ServerURL   string
	GraphPath   string
	DetailsPath string
}

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type mcpResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *mcpErrorObject `json:"error,omitempty"`
}

type mcpErrorObject struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpInitializeParams struct {
	ProtocolVersion string `json:"protocolVersion,omitempty"`
}

type mcpInitializeResult struct {
	ProtocolVersion string         `json:"protocolVersion"`
	Capabilities    map[string]any `json:"capabilities"`
	ServerInfo      mcpServerInfo  `json:"serverInfo"`
	Instructions    string         `json:"instructions,omitempty"`
}

type mcpServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type mcpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

type mcpToolCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments,omitempty"`
}

type mcpToolCallResult struct {
	Content           []mcpToolContent `json:"content"`
	StructuredContent any              `json:"structuredContent,omitempty"`
	IsError           bool             `json:"isError,omitempty"`
}

type mcpToolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type mcpSourceInfo struct {
	Mode        string `json:"mode"`
	ServerURL   string `json:"serverUrl,omitempty"`
	GraphPath   string `json:"graphPath,omitempty"`
	DetailsPath string `json:"detailsPath,omitempty"`
}

type mcpTargetDetailsResult struct {
	Target           string            `json:"target"`
	Focus            *focusTarget      `json:"focus,omitempty"`
	DetailsAvailable bool              `json:"detailsAvailable"`
	Details          *graphNodeDetails `json:"details,omitempty"`
}

type mcpTargetDecompositionResult struct {
	Target        string                       `json:"target"`
	Decomposition *targetDecompositionResponse `json:"decomposition,omitempty"`
}

type mcpAnalysisArgs struct {
	Top   int    `json:"top,omitempty"`
	Focus string `json:"focus,omitempty"`
}

type mcpTargetArgs struct {
	Target string `json:"target"`
}

type mcpFileArgs struct {
	Label string `json:"label"`
}

type mcpServer struct {
	source     mcpSourceConfig
	httpClient *http.Client
}

type mcpTransport struct {
	reader *bufio.Reader
	writer *bufio.Writer
}

func mcpCommand(args []string) error {
	fs := flag.NewFlagSet("mcp", flag.ExitOnError)
	serverURL := fs.String("server", "", fmt.Sprintf("base URL of a running BuildScope server (e.g. %s)", defaultMCPServerURL))
	graphPath := fs.String("graph", "", "path to graph JSON for direct file-backed analysis")
	detailsPath := fs.String("details", "", "optional details JSON path for --graph mode")
	_ = fs.Parse(normalizeFlagArgs(args))

	if fs.NArg() != 0 {
		return fmt.Errorf("usage: buildscope mcp [-server %s] [-graph <graph.json>] [-details <graph.details.json>]", defaultMCPServerURL)
	}
	if *graphPath != "" && *serverURL != "" {
		return fmt.Errorf("choose either -server or -graph, not both")
	}
	if *detailsPath != "" && *graphPath == "" {
		return fmt.Errorf("-details requires -graph")
	}

	source := mcpSourceConfig{}
	if *graphPath != "" {
		payload, err := fileGraphPayload(*graphPath)
		if err != nil {
			return err
		}
		source.GraphPath = payload.path
		source.DetailsPath = payload.detailsPath
		if *detailsPath != "" {
			resolvedDetails, err := resolveGraphPath(*detailsPath)
			if err != nil {
				return err
			}
			source.DetailsPath = resolvedDetails
		}
	} else {
		rawURL := strings.TrimSpace(*serverURL)
		if rawURL == "" {
			rawURL = defaultMCPServerURL
		}
		source.ServerURL = normalizeMCPServerURL(rawURL)
	}

	server := &mcpServer{
		source: source,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
	return server.serve(os.Stdin, os.Stdout)
}

func normalizeMCPServerURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}
	return strings.TrimRight(raw, "/")
}

func (s *mcpServer) serve(stdin io.Reader, stdout io.Writer) error {
	transport := &mcpTransport{
		reader: bufio.NewReader(stdin),
		writer: bufio.NewWriter(stdout),
	}

	for {
		body, err := transport.readMessage()
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}

		var request mcpRequest
		if err := json.Unmarshal(body, &request); err != nil {
			if err := transport.writeResponse(mcpResponse{
				JSONRPC: mcpJSONRPCVersion,
				Error:   &mcpErrorObject{Code: -32700, Message: "parse error"},
			}); err != nil {
				return err
			}
			continue
		}

		response := s.handleRequest(request)
		if response == nil {
			continue
		}
		if err := transport.writeResponse(*response); err != nil {
			return err
		}
	}
}

func (t *mcpTransport) readMessage() ([]byte, error) {
	contentLength := -1
	for {
		line, err := t.reader.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) && contentLength == -1 {
				return nil, io.EOF
			}
			return nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid MCP header: %q", line)
		}
		name := strings.ToLower(strings.TrimSpace(parts[0]))
		value := strings.TrimSpace(parts[1])
		if name == "content-length" {
			n, err := strconv.Atoi(value)
			if err != nil || n < 0 {
				return nil, fmt.Errorf("invalid Content-Length %q", value)
			}
			contentLength = n
		}
	}
	if contentLength < 0 {
		return nil, fmt.Errorf("missing Content-Length header")
	}
	body := make([]byte, contentLength)
	if _, err := io.ReadFull(t.reader, body); err != nil {
		return nil, err
	}
	return body, nil
}

func (t *mcpTransport) writeResponse(response mcpResponse) error {
	data, err := json.Marshal(response)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(t.writer, "Content-Length: %d\r\n\r\n", len(data)); err != nil {
		return err
	}
	if _, err := t.writer.Write(data); err != nil {
		return err
	}
	return t.writer.Flush()
}

func (s *mcpServer) handleRequest(request mcpRequest) *mcpResponse {
	if request.JSONRPC != "" && request.JSONRPC != mcpJSONRPCVersion {
		return &mcpResponse{
			JSONRPC: mcpJSONRPCVersion,
			ID:      request.ID,
			Error:   &mcpErrorObject{Code: -32600, Message: "invalid jsonrpc version"},
		}
	}

	switch request.Method {
	case "initialize":
		var params mcpInitializeParams
		if err := decodeMCPParams(request.Params, &params); err != nil {
			return s.invalidParamsResponse(request.ID, err)
		}
		version := params.ProtocolVersion
		if version == "" {
			version = defaultMCPProtocolVersion
		}
		return &mcpResponse{
			JSONRPC: mcpJSONRPCVersion,
			ID:      request.ID,
			Result: mcpInitializeResult{
				ProtocolVersion: version,
				Capabilities: map[string]any{
					"tools": map[string]any{},
				},
				ServerInfo: mcpServerInfo{
					Name:    "buildscope",
					Version: versionString(),
				},
				Instructions: mcpUsageInstructions(s.source),
			},
		}
	case "notifications/initialized":
		return nil
	case "ping":
		return &mcpResponse{
			JSONRPC: mcpJSONRPCVersion,
			ID:      request.ID,
			Result:  map[string]any{},
		}
	case "tools/list":
		return &mcpResponse{
			JSONRPC: mcpJSONRPCVersion,
			ID:      request.ID,
			Result: map[string]any{
				"tools": s.tools(),
			},
		}
	case "resources/list":
		return &mcpResponse{
			JSONRPC: mcpJSONRPCVersion,
			ID:      request.ID,
			Result: map[string]any{
				"resources": []any{},
			},
		}
	case "prompts/list":
		return &mcpResponse{
			JSONRPC: mcpJSONRPCVersion,
			ID:      request.ID,
			Result: map[string]any{
				"prompts": []any{},
			},
		}
	case "tools/call":
		var params mcpToolCallParams
		if err := decodeMCPParams(request.Params, &params); err != nil {
			return s.invalidParamsResponse(request.ID, err)
		}
		result := s.callTool(params.Name, params.Arguments)
		return &mcpResponse{
			JSONRPC: mcpJSONRPCVersion,
			ID:      request.ID,
			Result:  result,
		}
	default:
		return &mcpResponse{
			JSONRPC: mcpJSONRPCVersion,
			ID:      request.ID,
			Error:   &mcpErrorObject{Code: -32601, Message: "method not found"},
		}
	}
}

func (s *mcpServer) invalidParamsResponse(id json.RawMessage, err error) *mcpResponse {
	return &mcpResponse{
		JSONRPC: mcpJSONRPCVersion,
		ID:      id,
		Error:   &mcpErrorObject{Code: -32602, Message: err.Error()},
	}
}

func decodeMCPParams(raw json.RawMessage, dest any) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return json.Unmarshal(raw, dest)
}

func versionString() string {
	if strings.TrimSpace(version) == "" {
		return "dev"
	}
	return version
}

func mcpUsageInstructions(source mcpSourceConfig) string {
	mode := "running BuildScope server"
	if source.GraphPath != "" {
		mode = "graph file"
	}
	return fmt.Sprintf("BuildScope MCP is connected to a %s. Start with get_analysis, then use get_target_decomposition for split seams, get_target_details for focused target context, or get_file_details for file-level drill-downs. Prefer exact Bazel labels like //pkg:target and //pkg:file.go.", mode)
}

func (s *mcpServer) tools() []mcpTool {
	return []mcpTool{
		{
			Name:        "get_source_info",
			Description: "Describe the BuildScope source this MCP server is using.",
			InputSchema: map[string]any{
				"type":                 "object",
				"properties":           map[string]any{},
				"additionalProperties": false,
			},
		},
		{
			Name:        "get_analysis",
			Description: "Return BuildScope impact rankings, breakup candidates, heavy-source targets, heavy-output targets, and an optional focus target drill-down.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"top": map[string]any{
						"type":        "integer",
						"minimum":     1,
						"maximum":     maxAnalysisLimit,
						"description": "Number of ranked entries to return. Defaults to 10.",
					},
					"focus": map[string]any{
						"type":        "string",
						"description": "Optional Bazel label to drill into, for example //pkg:target.",
					},
				},
				"additionalProperties": false,
			},
		},
		{
			Name:        "get_target_details",
			Description: "Return the focused BuildScope analysis for one target plus direct input/output details when a graph.details.json sidecar is available.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"target": map[string]any{
						"type":        "string",
						"description": "Exact Bazel label for the target, for example //pkg:target.",
					},
				},
				"required":             []string{"target"},
				"additionalProperties": false,
			},
		},
		{
			Name:        "get_target_decomposition",
			Description: "Return focused decomposition guidance for one target, including impact, mass, shardability, dependency-domain groups, and cross-group coupling.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"target": map[string]any{
						"type":        "string",
						"description": "Exact Bazel label for the target, for example //pkg:target.",
					},
				},
				"required":             []string{"target"},
				"additionalProperties": false,
			},
		},
		{
			Name:        "get_file_details",
			Description: "Return current-graph consumers for one file label, plus live workspace reverse dependencies when the BuildScope server was started from a Bazel workspace.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"label": map[string]any{
						"type":        "string",
						"description": "Exact Bazel file label for the source or generated file, for example //pkg:file.go.",
					},
				},
				"required":             []string{"label"},
				"additionalProperties": false,
			},
		},
	}
}

func (s *mcpServer) callTool(name string, rawArgs json.RawMessage) mcpToolCallResult {
	switch name {
	case "get_source_info":
		info := s.sourceInfo()
		return newMCPToolResult(fmt.Sprintf("BuildScope MCP is using %s.", sourceInfoSummary(info)), info)
	case "get_analysis":
		var args mcpAnalysisArgs
		if err := decodeMCPParams(rawArgs, &args); err != nil {
			return newMCPToolError(err)
		}
		if args.Top < 0 {
			return newMCPToolError(fmt.Errorf("top must be greater than zero"))
		}
		analysis, err := s.loadAnalysis(args.Top, strings.TrimSpace(args.Focus))
		if err != nil {
			return newMCPToolError(err)
		}
		return newMCPToolResult(analysisSummary(analysis), analysis)
	case "get_target_details":
		var args mcpTargetArgs
		if err := decodeMCPParams(rawArgs, &args); err != nil {
			return newMCPToolError(err)
		}
		target := strings.TrimSpace(args.Target)
		if target == "" {
			return newMCPToolError(fmt.Errorf("target is required"))
		}
		result, err := s.loadTargetDetails(target)
		if err != nil {
			return newMCPToolError(err)
		}
		return newMCPToolResult(targetDetailsSummary(result), result)
	case "get_target_decomposition":
		var args mcpTargetArgs
		if err := decodeMCPParams(rawArgs, &args); err != nil {
			return newMCPToolError(err)
		}
		target := strings.TrimSpace(args.Target)
		if target == "" {
			return newMCPToolError(fmt.Errorf("target is required"))
		}
		result, err := s.loadTargetDecomposition(target)
		if err != nil {
			return newMCPToolError(err)
		}
		return newMCPToolResult(targetDecompositionSummary(result), result)
	case "get_file_details":
		var args mcpFileArgs
		if err := decodeMCPParams(rawArgs, &args); err != nil {
			return newMCPToolError(err)
		}
		label := strings.TrimSpace(args.Label)
		if label == "" {
			return newMCPToolError(fmt.Errorf("label is required"))
		}
		result, err := s.loadFileFocus(label)
		if err != nil {
			return newMCPToolError(err)
		}
		return newMCPToolResult(fileFocusSummary(result), result)
	default:
		return newMCPToolError(fmt.Errorf("unknown tool %q", name))
	}
}

func newMCPToolResult(text string, structured any) mcpToolCallResult {
	return mcpToolCallResult{
		Content: []mcpToolContent{
			{Type: "text", Text: text},
		},
		StructuredContent: structured,
	}
}

func newMCPToolError(err error) mcpToolCallResult {
	return mcpToolCallResult{
		Content: []mcpToolContent{
			{Type: "text", Text: err.Error()},
		},
		IsError: true,
	}
}

func (s *mcpServer) sourceInfo() mcpSourceInfo {
	if s.source.GraphPath != "" {
		return mcpSourceInfo{
			Mode:        "graph-file",
			GraphPath:   s.source.GraphPath,
			DetailsPath: s.source.DetailsPath,
		}
	}
	return mcpSourceInfo{
		Mode:      "server",
		ServerURL: s.source.ServerURL,
	}
}

func sourceInfoSummary(info mcpSourceInfo) string {
	if info.Mode == "graph-file" {
		if info.DetailsPath != "" {
			return fmt.Sprintf("graph file %s with details sidecar %s", info.GraphPath, info.DetailsPath)
		}
		return fmt.Sprintf("graph file %s", info.GraphPath)
	}
	return fmt.Sprintf("BuildScope server %s", info.ServerURL)
}

func analysisSummary(response analysisResponse) string {
	candidateBits := make([]string, 0, min(3, len(response.TopBreakupCandidates)))
	for _, candidate := range response.TopBreakupCandidates[:min(3, len(response.TopBreakupCandidates))] {
		score := candidate.OpportunityScore
		if score == 0 {
			score = candidate.Pressure
		}
		candidateBits = append(candidateBits, fmt.Sprintf("%s (%.1f)", candidate.ID, score))
	}
	if len(candidateBits) == 0 {
		return fmt.Sprintf("Analyzed %d nodes and %d edges. No breakup candidates were ranked.", response.NodeCount, response.EdgeCount)
	}
	return fmt.Sprintf(
		"Analyzed %d nodes and %d edges. Top breakup candidates: %s.",
		response.NodeCount,
		response.EdgeCount,
		strings.Join(candidateBits, ", "),
	)
}

func targetDetailsSummary(result mcpTargetDetailsResult) string {
	parts := make([]string, 0, 4)
	if result.Focus != nil {
		parts = append(parts, fmt.Sprintf("%d direct deps", result.Focus.OutDegree))
		parts = append(parts, fmt.Sprintf("%d dependents", result.Focus.TransitiveInDegree))
	}
	if result.Details != nil {
		parts = append(parts, fmt.Sprintf("%d direct inputs", len(result.Details.DirectInputs)))
		parts = append(parts, fmt.Sprintf("%d direct outputs", len(result.Details.DirectOutputs)))
	}
	if len(parts) == 0 {
		return fmt.Sprintf("Loaded focused details for %s.", result.Target)
	}
	return fmt.Sprintf("Loaded focused details for %s: %s.", result.Target, strings.Join(parts, ", "))
}

func targetDecompositionSummary(result mcpTargetDecompositionResult) string {
	if result.Decomposition == nil {
		return fmt.Sprintf("Loaded decomposition for %s.", result.Target)
	}
	decomposition := result.Decomposition
	parts := make([]string, 0, 6)
	if decomposition.Verdict != "" {
		parts = append(parts, decomposition.Verdict)
	}
	if decomposition.Impact.Band != "" {
		parts = append(parts, fmt.Sprintf("blast radius %s", strings.ToLower(decomposition.Impact.Band)))
	}
	if decomposition.Mass.Band != "" {
		parts = append(parts, fmt.Sprintf("build mass %s", strings.ToLower(decomposition.Mass.Band)))
	}
	if decomposition.SplitFit.Band != "" {
		parts = append(parts, fmt.Sprintf("split fit %s", strings.ToLower(decomposition.SplitFit.Band)))
	}
	if decomposition.CommunityCount > 0 {
		parts = append(parts, fmt.Sprintf("%d dependency groups", decomposition.CommunityCount))
		parts = append(parts, fmt.Sprintf("%.0f%% cross-group coupling", decomposition.CrossCommunityEdgeRatio*100))
	}
	if decomposition.Reason != "" {
		parts = append(parts, decomposition.Reason)
	}
	return fmt.Sprintf("Loaded decomposition for %s: %s.", result.Target, strings.Join(parts, ", "))
}

func fileFocusSummary(result fileFocusResponse) string {
	parts := []string{
		fmt.Sprintf("%d direct consumers in the current graph", result.CurrentGraphDirectConsumerCount),
		fmt.Sprintf("%d transitive consumers in the current graph", result.CurrentGraphTransitiveConsumerCount),
	}
	if result.LiveQueryAvailable {
		if result.WorkspaceReverseDependencyError != "" {
			parts = append(parts, fmt.Sprintf("workspace reverse-deps unavailable: %s", result.WorkspaceReverseDependencyError))
		} else {
			parts = append(parts, fmt.Sprintf("%d workspace reverse deps", result.WorkspaceReverseDependencyCount))
		}
	}
	return fmt.Sprintf("Loaded file details for %s: %s.", result.Label, strings.Join(parts, ", "))
}

func (s *mcpServer) loadAnalysis(limit int, focus string) (analysisResponse, error) {
	if s.source.GraphPath != "" {
		payload, err := s.localGraphPayload()
		if err != nil {
			return analysisResponse{}, err
		}
		graphData, err := loadGraphBytes(payload)
		if err != nil {
			return analysisResponse{}, err
		}
		rawGraph, err := parseGraphJSON(graphData)
		if err != nil {
			return analysisResponse{}, err
		}
		return buildAnalysisBase(rawGraph).response(limit, focus)
	}

	var response analysisResponse
	query := url.Values{}
	query.Set("top", strconv.Itoa(clampAnalysisLimit(limit)))
	if strings.TrimSpace(focus) != "" {
		query.Set("focus", strings.TrimSpace(focus))
	}
	if err := s.fetchServerJSON("/analysis.json", query, &response); err != nil {
		return analysisResponse{}, err
	}
	return response, nil
}

func (s *mcpServer) loadTargetDetails(target string) (mcpTargetDetailsResult, error) {
	analysis, err := s.loadAnalysis(5, target)
	if err != nil {
		return mcpTargetDetailsResult{}, err
	}
	result := mcpTargetDetailsResult{
		Target: target,
		Focus:  analysis.Focus,
	}

	details, err := s.loadDetails()
	if err != nil {
		return mcpTargetDetailsResult{}, err
	}
	if details != nil {
		if nodeDetails, ok := details.Nodes[target]; ok {
			copy := nodeDetails
			result.Details = &copy
			result.DetailsAvailable = true
		}
	}
	return result, nil
}

func (s *mcpServer) loadTargetDecomposition(target string) (mcpTargetDecompositionResult, error) {
	if s.source.GraphPath != "" {
		payload, err := s.localGraphPayload()
		if err != nil {
			return mcpTargetDecompositionResult{}, err
		}
		graphData, err := loadGraphBytes(payload)
		if err != nil {
			return mcpTargetDecompositionResult{}, err
		}
		rawGraph, err := parseGraphJSON(graphData)
		if err != nil {
			return mcpTargetDecompositionResult{}, err
		}
		response, err := buildAnalysisBase(rawGraph).decomposition(target)
		if err != nil {
			return mcpTargetDecompositionResult{}, err
		}
		return mcpTargetDecompositionResult{Target: target, Decomposition: &response}, nil
	}

	var response targetDecompositionResponse
	query := url.Values{}
	query.Set("target", target)
	if err := s.fetchServerJSON("/decomposition.json", query, &response); err != nil {
		return mcpTargetDecompositionResult{}, err
	}
	return mcpTargetDecompositionResult{Target: target, Decomposition: &response}, nil
}

func (s *mcpServer) loadFileFocus(label string) (fileFocusResponse, error) {
	if s.source.GraphPath != "" {
		payload, err := s.localGraphPayload()
		if err != nil {
			return fileFocusResponse{}, err
		}
		graphData, err := loadGraphBytes(payload)
		if err != nil {
			return fileFocusResponse{}, err
		}
		rawGraph, err := parseGraphJSON(graphData)
		if err != nil {
			return fileFocusResponse{}, err
		}
		return buildAnalysisBase(rawGraph).fileFocus(label, nil)
	}

	var response fileFocusResponse
	query := url.Values{}
	query.Set("label", label)
	if err := s.fetchServerJSON("/file-focus.json", query, &response); err != nil {
		return fileFocusResponse{}, err
	}
	return response, nil
}

func (s *mcpServer) loadDetails() (*graphDetails, error) {
	if s.source.GraphPath != "" {
		payload, err := s.localGraphPayload()
		if err != nil {
			return nil, err
		}
		return loadGraphDetails(payload)
	}

	var details graphDetails
	if err := s.fetchServerJSON("/graph.details.json", nil, &details); err != nil {
		var httpErr *mcpHTTPStatusError
		if errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &details, nil
}

func (s *mcpServer) localGraphPayload() (graphPayload, error) {
	payload, err := fileGraphPayload(s.source.GraphPath)
	if err != nil {
		return graphPayload{}, err
	}
	if s.source.DetailsPath != "" {
		payload.detailsPath = s.source.DetailsPath
	}
	return payload, nil
}

func loadGraphDetails(payload graphPayload) (*graphDetails, error) {
	data := append([]byte(nil), payload.detailsData...)
	if payload.detailsPath != "" && len(data) == 0 {
		bytes, err := os.ReadFile(payload.detailsPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, nil
			}
			return nil, fmt.Errorf("read details file: %w", err)
		}
		data = bytes
	}
	if len(data) == 0 {
		return nil, nil
	}

	var details graphDetails
	if err := json.Unmarshal(data, &details); err != nil {
		return nil, fmt.Errorf("decode details JSON: %w", err)
	}
	return &details, nil
}

type mcpHTTPStatusError struct {
	StatusCode int
	Path       string
}

func (e *mcpHTTPStatusError) Error() string {
	return fmt.Sprintf("request to %s failed with HTTP %d", e.Path, e.StatusCode)
}

func (s *mcpServer) fetchServerJSON(path string, query url.Values, dest any) error {
	baseURL, err := url.Parse(s.source.ServerURL)
	if err != nil {
		return fmt.Errorf("invalid server URL %q: %w", s.source.ServerURL, err)
	}
	rel := &url.URL{Path: path}
	endpoint := baseURL.ResolveReference(rel)
	if len(query) > 0 {
		endpoint.RawQuery = query.Encode()
	}

	request, err := http.NewRequest(http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return err
	}
	response, err := s.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("request %s: %w", endpoint.String(), err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return &mcpHTTPStatusError{StatusCode: response.StatusCode, Path: endpoint.String()}
	}
	if err := json.NewDecoder(response.Body).Decode(dest); err != nil {
		return fmt.Errorf("decode %s: %w", endpoint.String(), err)
	}
	return nil
}
