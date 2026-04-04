package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	iofs "io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/sharmilajesupaul/buildscope/internal/embeddedui"
)

var workspaceMarkers = []string{"WORKSPACE", "WORKSPACE.bazel", "MODULE.bazel"}
var version = "dev"
var commit = "unknown"
var buildDate = "unknown"

func usageText() string {
	var b strings.Builder
	fmt.Fprintln(&b, "BuildScope CLI")
	fmt.Fprintln(&b)
	fmt.Fprintf(&b, "  %s\n", "buildscope <target> [-workdir <bazel workspace>] [-ui-dir <ui/dist>] [-addr "+defaultListenAddr+"]")
	fmt.Fprintln(&b, "    Extract a graph for the Bazel target and open the local viewer.")
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "Commands:")
	fmt.Fprintf(&b, "  open <target> [-workdir <bazel workspace>] [-ui-dir <ui/dist>] [-addr %s]\n", defaultListenAddr)
	fmt.Fprintln(&b, "    Alias for the default target invocation.")
	fmt.Fprintf(&b, "  extract-view <target> [-workdir <bazel workspace>] [-ui-dir <ui/dist>] [-addr %s]\n", defaultListenAddr)
	fmt.Fprintln(&b, "    Alias for the default target invocation.")
	fmt.Fprintf(&b, "  view <graph.json> [-ui-dir <ui/dist>] [-addr %s]\n", defaultListenAddr)
	fmt.Fprintln(&b, "    Serve a pre-generated graph JSON in the local viewer.")
	fmt.Fprintf(&b, "  demo [-ui-dir <ui/dist>] [-addr %s]\n", defaultListenAddr)
	fmt.Fprintln(&b, "    Open the bundled sample graph.")
	fmt.Fprintf(&b, "  mcp [-server %s] [-graph <graph.json>] [-details <graph.details.json>]\n", defaultServerURL)
	fmt.Fprintln(&b, "    Serve BuildScope analysis over stdio MCP for AI agents and MCP clients.")
	fmt.Fprintln(&b, "  version")
	fmt.Fprintln(&b, "    Print the BuildScope version, commit, and build date.")
	fmt.Fprintln(&b, "  extract -target //pkg:rule [-workdir <bazel workspace>] [-out graph.json] [-details_out graph.details.json] [-enrich none|analyze|build]")
	fmt.Fprintln(&b, "    Run bazel query 'deps(target)' --output=graph --keep_going and emit graph JSON.")
	fmt.Fprintln(&b, "    Enriched modes add node kind, file counts, file bytes, outputs, and action summaries.")
	fmt.Fprintf(&b, "  serve [-dir <ui/dist>] [-graph <graph.json>] [-details <graph.details.json>] [-addr %s]\n", defaultListenAddr)
	fmt.Fprintln(&b, "    Low-level server command. Defaults to the bundled sample graph when -graph is omitted.")
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "Examples:")
	fmt.Fprintln(&b, "  buildscope version")
	fmt.Fprintln(&b, "  buildscope demo")
	fmt.Fprintln(&b, "  buildscope //speller/main:spell")
	fmt.Fprintln(&b, "  buildscope open //speller/main:spell -workdir ~/code/repos/bazel-examples")
	fmt.Fprintln(&b, "  buildscope extract-view //speller/main:spell -workdir ~/code/repos/bazel-examples")
	fmt.Fprintln(&b, "  buildscope view /tmp/graph.json")
	fmt.Fprintf(&b, "  buildscope mcp -server %s\n", defaultServerURL)
	fmt.Fprintln(&b, "  buildscope mcp -server localhost:4500")
	fmt.Fprintln(&b, "  buildscope mcp -graph /tmp/graph.json -details /tmp/graph.details.json")
	fmt.Fprintln(&b, "  buildscope extract -target //speller/main:spell -workdir ~/code/repos/bazel-examples -out /tmp/graph.json")
	fmt.Fprintln(&b, "  buildscope extract -target //speller/main:spell -workdir ~/code/repos/bazel-examples -out /tmp/graph.json -enrich build")
	return b.String()
}

func usage() {
	fmt.Print(usageText())
}

func printVersion(w io.Writer) {
	fmt.Fprintf(w, "buildscope %s\n", version)
	fmt.Fprintf(w, "commit: %s\n", commit)
	fmt.Fprintf(w, "built: %s\n", buildDate)
}

func normalizeFlagArgs(args []string) []string {
	flags := make([]string, 0, len(args))
	positionals := make([]string, 0, len(args))

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			flags = append(flags, arg)
			if arg == "--" {
				positionals = append(positionals, args[i+1:]...)
				break
			}
			if !strings.Contains(arg, "=") && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				flags = append(flags, args[i+1])
				i++
			}
			continue
		}

		positionals = append(positionals, arg)
	}

	return append(flags, positionals...)
}

func looksLikeBazelTarget(arg string) bool {
	arg = strings.TrimSpace(arg)
	return strings.HasPrefix(arg, "//") || strings.HasPrefix(arg, "@") || strings.HasPrefix(arg, ":")
}

type uiAssets struct {
	fsys   iofs.FS
	source string
	dir    string
}

type graphPayload struct {
	path         string
	data         []byte
	source       string
	detailsPath  string
	detailsData  []byte
	workspaceDir string
	rootTarget   string
}

func serveGraph(ui uiAssets, graph graphPayload, addr string, launchBrowser bool) error {
	graphData, err := loadGraphBytes(graph)
	if err != nil {
		return err
	}
	graphData, rawGraph, err := sanitizeServedGraphJSON(graphData)
	if err != nil {
		return err
	}
	detailsData := append([]byte(nil), graph.detailsData...)
	if graph.detailsPath != "" && len(detailsData) == 0 {
		detailsData, err = os.ReadFile(graph.detailsPath)
		if err != nil {
			return fmt.Errorf("read details file: %w", err)
		}
	}
	analysis := buildAnalysisBase(rawGraph)
	liveContext := &workspaceAnalysisContext{
		Workdir:    graph.workspaceDir,
		RootTarget: graph.rootTarget,
	}
	if strings.TrimSpace(liveContext.Workdir) == "" && strings.TrimSpace(liveContext.RootTarget) == "" {
		liveContext = nil
	}
	mux := newServeMux(ui, graphData, detailsData, analysis, liveContext)

	log.Printf("Serving UI from %s", ui.source)
	log.Printf("Serving graph from %s at /graph.json", graph.source)
	if graph.detailsPath != "" || len(detailsData) > 0 {
		log.Printf("Serving details at /graph.details.json")
	}
	log.Printf("Serving analysis at /analysis.json")
	log.Printf("Serving decomposition at /decomposition.json")
	log.Printf("Serving file focus at /file-focus.json")

	listener, listenAddr, fellBack, err := listenWithFallback(addr, 20)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", addr, err)
	}
	if fellBack {
		log.Printf("Port %s is in use; falling back to %s", addr, listenAddr)
	}
	if url, err := viewerURL(listenAddr); err == nil {
		log.Printf("Listening on %s", url)
	} else {
		log.Printf("Listening on %s", listenAddr)
	}
	if launchBrowser {
		go func() {
			if err := openViewer(listenAddr); err != nil {
				log.Printf("Warning: failed to open browser: %v", err)
			}
		}()
	}
	return http.Serve(listener, mux)
}

func sanitizeServedGraphJSON(data []byte) ([]byte, graph, error) {
	rawGraph, err := parseGraphJSON(data)
	if err != nil {
		return nil, graph{}, err
	}
	sanitized, err := json.Marshal(rawGraph)
	if err != nil {
		return nil, graph{}, fmt.Errorf("encode graph JSON: %w", err)
	}
	return sanitized, rawGraph, nil
}

func newServeMux(ui uiAssets, graphData, detailsData []byte, analysis *analysisBase, live *workspaceAnalysisContext) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(ui.fsys)))
	mux.HandleFunc("/graph.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		http.ServeContent(w, r, "graph.json", time.Time{}, bytes.NewReader(graphData))
	})
	if len(detailsData) > 0 {
		mux.HandleFunc("/graph.details.json", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			http.ServeContent(w, r, "graph.details.json", time.Time{}, bytes.NewReader(detailsData))
		})
	}
	mux.HandleFunc("/analysis.json", func(w http.ResponseWriter, r *http.Request) {
		limit, err := parseAnalysisLimit(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, analysisError(err.Error()))
			return
		}
		response, err := analysis.response(limit, strings.TrimSpace(r.URL.Query().Get("focus")))
		if err != nil {
			writeJSON(w, http.StatusNotFound, analysisError(err.Error()))
			return
		}
		writeJSON(w, http.StatusOK, response)
	})
	mux.HandleFunc("/decomposition.json", func(w http.ResponseWriter, r *http.Request) {
		target := strings.TrimSpace(r.URL.Query().Get("target"))
		if target == "" {
			writeJSON(w, http.StatusBadRequest, analysisError("target is required"))
			return
		}
		response, err := analysis.decomposition(target)
		if err != nil {
			writeJSON(w, http.StatusNotFound, analysisError(err.Error()))
			return
		}
		writeJSON(w, http.StatusOK, response)
	})
	mux.HandleFunc("/file-focus.json", func(w http.ResponseWriter, r *http.Request) {
		label := strings.TrimSpace(r.URL.Query().Get("label"))
		if label == "" {
			writeJSON(w, http.StatusBadRequest, analysisError("label is required"))
			return
		}
		response, err := analysis.fileFocus(label, live)
		if err != nil {
			writeJSON(w, http.StatusNotFound, analysisError(err.Error()))
			return
		}
		writeJSON(w, http.StatusOK, response)
	})
	return mux
}

func serve(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	dir := fs.String("dir", "", "path to static UI assets; embedded assets when omitted")
	graph := fs.String("graph", "", "graph JSON to serve at /graph.json; defaults to the bundled sample graph")
	details := fs.String("details", "", "optional details JSON to serve at /graph.details.json")
	addr := registerListenAddrFlag(fs)
	_ = fs.Parse(normalizeFlagArgs(args))

	ui, err := resolveUIAssets(*dir)
	if err != nil {
		return err
	}

	var servedGraph graphPayload
	if *graph == "" {
		servedGraph, err = bundledGraphPayload(ui)
	} else {
		servedGraph, err = fileGraphPayload(*graph)
	}
	if err != nil {
		return err
	}
	if *details != "" {
		detailsPath, err := resolveGraphPath(*details)
		if err != nil {
			return err
		}
		servedGraph.detailsPath = detailsPath
	}

	return serveGraph(ui, servedGraph, *addr, false)
}

func listenWithFallback(addr string, maxTries int) (net.Listener, string, bool, error) {
	addr, err := normalizeListenAddr(addr)
	if err != nil {
		return nil, "", false, err
	}

	listener, err := net.Listen("tcp", addr)
	if err == nil {
		return listener, addr, false, nil
	}
	if !isAddrInUse(err) {
		return nil, "", false, err
	}

	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, "", false, err
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, "", false, err
	}

	for i := 1; i <= maxTries; i++ {
		candidate := port + i
		tryAddr := net.JoinHostPort(host, strconv.Itoa(candidate))
		listener, err = net.Listen("tcp", tryAddr)
		if err == nil {
			return listener, tryAddr, true, nil
		}
		if !isAddrInUse(err) {
			return nil, "", false, err
		}
	}

	return nil, "", false, fmt.Errorf("no open port found starting at %s", addr)
}

func isAddrInUse(err error) bool {
	if errors.Is(err, syscall.EADDRINUSE) {
		return true
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) && errors.Is(opErr.Err, syscall.EADDRINUSE) {
		return true
	}
	return false
}

func viewerURL(listenAddr string) (string, error) {
	host, port, err := net.SplitHostPort(listenAddr)
	if err != nil {
		return "", fmt.Errorf("split listen addr: %w", err)
	}

	switch host {
	case "", "0.0.0.0":
		host = "127.0.0.1"
	case "::":
		host = "::1"
	}

	return "http://" + net.JoinHostPort(host, port), nil
}

func browserCommand(goos, url string) (string, []string, error) {
	switch goos {
	case "darwin":
		return "open", []string{url}, nil
	case "linux":
		return "xdg-open", []string{url}, nil
	default:
		return "", nil, fmt.Errorf("automatic browser launch is unsupported on %s", goos)
	}
}

func openViewer(listenAddr string) error {
	url, err := viewerURL(listenAddr)
	if err != nil {
		return err
	}
	command, args, err := browserCommand(runtime.GOOS, url)
	if err != nil {
		return err
	}
	if _, err := exec.LookPath(command); err != nil {
		return fmt.Errorf("%s not found in PATH", command)
	}

	cmd := exec.Command(command, args...)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start %s: %w", command, err)
	}
	if cmd.Process != nil {
		_ = cmd.Process.Release()
	}
	return nil
}

type graph struct {
	SchemaVersion int         `json:"schemaVersion,omitempty"`
	AnalysisMode  string      `json:"analysisMode,omitempty"`
	Target        string      `json:"target,omitempty"`
	DetailsPath   string      `json:"detailsPath,omitempty"`
	Nodes         []graphNode `json:"nodes"`
	Edges         []graphEdge `json:"edges"`
}

type graphNode struct {
	ID              string            `json:"id"`
	Label           string            `json:"label"`
	NodeType        string            `json:"nodeType,omitempty"`
	RuleKind        string            `json:"ruleKind,omitempty"`
	PackageName     string            `json:"packageName,omitempty"`
	SourceFileCount int               `json:"sourceFileCount,omitempty"`
	SourceBytes     int64             `json:"sourceBytes,omitempty"`
	InputFileCount  int               `json:"inputFileCount,omitempty"`
	InputBytes      int64             `json:"inputBytes,omitempty"`
	OutputFileCount int               `json:"outputFileCount,omitempty"`
	OutputBytes     int64             `json:"outputBytes,omitempty"`
	ActionCount     int               `json:"actionCount,omitempty"`
	MnemonicSummary []mnemonicCount   `json:"mnemonicSummary,omitempty"`
	TopFiles        []artifactSummary `json:"topFiles,omitempty"`
	TopOutputs      []artifactSummary `json:"topOutputs,omitempty"`
}

type graphEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

// parseQueryGraphStreaming parses `bazel query --output=graph` from a streaming reader.
// This avoids loading the entire output into memory, critical for large graphs (50k+ nodes).
func parseQueryGraphStreaming(r io.Reader) graph {
	nodes := make(map[string]struct{})
	edgeSet := make(map[string]graphEdge)

	sc := bufio.NewScanner(r)
	// Increase buffer size for very long lines in large graphs
	const maxCapacity = 1024 * 1024 // 1MB per line
	buf := make([]byte, maxCapacity)
	sc.Buffer(buf, maxCapacity)

	lineCount := 0
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		lineCount++

		// Progress indicator for large graphs
		if lineCount%10000 == 0 {
			log.Printf("Processed %d lines, found %d nodes, %d edges...", lineCount, len(nodes), len(edgeSet))
		}

		if line == "" || strings.HasPrefix(line, "digraph") || line == "}" {
			continue
		}
		if strings.HasPrefix(line, "node ") || strings.HasPrefix(line, "edge ") {
			// styling lines
			continue
		}
		// edge line: "  \"//a\" -> \"//b\";"
		if strings.Contains(line, "->") {
			parts := strings.Split(line, "->")
			if len(parts) != 2 {
				continue
			}
			lhs := strings.TrimSpace(parts[0])
			rhs := strings.TrimSpace(parts[1])
			lhs = strings.Trim(lhs, "\";")
			rhs = strings.Trim(rhs, "\";")
			if lhs == "" || rhs == "" {
				continue
			}
			lefts := splitLabels(lhs)
			rights := splitLabels(rhs)
			for _, a := range lefts {
				for _, b := range rights {
					nodes[a] = struct{}{}
					nodes[b] = struct{}{}
					key := a + "->" + b
					edgeSet[key] = graphEdge{Source: a, Target: b}
				}
			}
		} else {
			// standalone node line: "  \"//foo:bar\";"
			val := strings.Trim(line, "\";")
			if val != "" {
				for _, v := range splitLabels(val) {
					nodes[v] = struct{}{}
				}
			}
		}
	}
	if err := sc.Err(); err != nil {
		log.Printf("Warning: failed while scanning bazel query output: %v", err)
	}

	out := graph{}
	for n := range nodes {
		out.Nodes = append(out.Nodes, graphNode{ID: n, Label: n})
	}
	for _, e := range edgeSet {
		out.Edges = append(out.Edges, e)
	}
	return out
}

func splitLabels(raw string) []string {
	parts := strings.Split(raw, "\\n")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && !strings.Contains(p, " ") && !strings.HasPrefix(p, "node") {
			out = append(out, p)
		}
	}
	return out
}

func resolveGraphPath(path string) (string, error) {
	graphPath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve graph path: %w", err)
	}
	if _, err := os.Stat(graphPath); err != nil {
		return "", fmt.Errorf("graph file not found: %s", graphPath)
	}
	return graphPath, nil
}

func resolveUIAssets(explicit string) (uiAssets, error) {
	if explicit != "" {
		staticDir, err := validateUIDir(explicit)
		if err != nil {
			return uiAssets{}, err
		}
		return uiAssets{
			fsys:   os.DirFS(staticDir),
			source: staticDir,
			dir:    staticDir,
		}, nil
	}

	if _, err := iofs.Stat(embeddedui.Assets, "index.html"); err != nil {
		return uiAssets{}, fmt.Errorf("embedded UI assets are missing index.html: %w", err)
	}

	return uiAssets{
		fsys:   embeddedui.Assets,
		source: "embedded UI assets",
	}, nil
}

func fileGraphPayload(path string) (graphPayload, error) {
	graphPath, err := resolveGraphPath(path)
	if err != nil {
		return graphPayload{}, err
	}
	payload := graphPayload{
		path:   graphPath,
		source: graphPath,
	}
	detailsPath := defaultDetailsPath(graphPath)
	if fileExists(detailsPath) {
		payload.detailsPath = detailsPath
	}
	return payload, nil
}

func bundledGraphPayload(ui uiAssets) (graphPayload, error) {
	if ui.dir != "" {
		return fileGraphPayload(filepath.Join(ui.dir, "sample-graph.json"))
	}

	graphData, err := iofs.ReadFile(ui.fsys, "sample-graph.json")
	if err != nil {
		return graphPayload{}, fmt.Errorf("load bundled sample graph: %w", err)
	}

	return graphPayload{
		data:   graphData,
		source: "embedded sample graph",
	}, nil
}

func validateUIDir(dir string) (string, error) {
	staticDir, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("resolve ui dir: %w", err)
	}
	info, err := os.Stat(staticDir)
	if err != nil {
		return "", fmt.Errorf("ui dir not found: %s", staticDir)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("ui dir is not a directory: %s", staticDir)
	}
	if _, err := os.Stat(filepath.Join(staticDir, "index.html")); err != nil {
		return "", fmt.Errorf("ui dir does not contain index.html: %s", staticDir)
	}

	return staticDir, nil
}

func validateWorkspaceDir(dir string) (string, error) {
	workdir, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("resolve workspace dir: %w", err)
	}

	info, err := os.Stat(workdir)
	if err != nil {
		return "", fmt.Errorf("workspace dir not found: %s", workdir)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("workspace path is not a directory: %s", workdir)
	}

	for _, marker := range workspaceMarkers {
		if _, err := os.Stat(filepath.Join(workdir, marker)); err == nil {
			return workdir, nil
		}
	}

	return "", fmt.Errorf("not a Bazel workspace directory: %s", workdir)
}

func extractGraph(target, workdir, outPath, detailsOut string, mode enrichMode) error {
	g, err := extractGraphData(target, workdir)
	if err != nil {
		return err
	}
	var details *graphDetails
	if mode != enrichNone {
		g.SchemaVersion = 2
		g.AnalysisMode = string(mode)
		g.Target = target
		g.DetailsPath = filepath.Base(defaultDetailsPath(outPath))
		if detailsOut != "" {
			g.DetailsPath = filepath.Base(detailsOut)
		}
		details, err = enrichGraphData(&g, workdir, target, mode)
		if err != nil {
			return err
		}
	}
	return writeGraphFiles(g, details, outPath, detailsOut)
}

func extract(args []string) error {
	fs := flag.NewFlagSet("extract", flag.ExitOnError)
	target := fs.String("target", "", "bazel target (e.g. //speller/main:spell)")
	workdir := fs.String("workdir", ".", "bazel workspace directory")
	outPath := fs.String("out", "graph.json", "output graph JSON path")
	detailsOut := fs.String("details_out", "", "optional details JSON path (defaults to <out>.details.json)")
	enrich := fs.String("enrich", string(enrichAnalyze), "metadata enrichment mode: none, analyze, or build")
	_ = fs.Parse(normalizeFlagArgs(args))

	if *target == "" {
		return fmt.Errorf("missing -target")
	}
	mode := enrichMode(*enrich)
	switch mode {
	case enrichNone, enrichAnalyze, enrichBuild:
	default:
		return fmt.Errorf("invalid -enrich value %q (want none|analyze|build)", *enrich)
	}

	return extractGraph(*target, *workdir, *outPath, *detailsOut, mode)
}

func openCommand(commandName string, args []string) error {
	flagSetName := commandName
	if flagSetName == "" {
		flagSetName = "run"
	}
	fs := flag.NewFlagSet(flagSetName, flag.ExitOnError)
	workdir := fs.String("workdir", ".", "bazel workspace directory")
	uiDir := fs.String("ui-dir", "", "path to static UI assets; embedded assets when omitted")
	addr := registerListenAddrFlag(fs)
	enrich := fs.String("enrich", string(enrichAnalyze), "metadata enrichment mode: none, analyze, or build")
	_ = fs.Parse(normalizeFlagArgs(args))

	if fs.NArg() != 1 {
		if commandName == "" {
			return fmt.Errorf("usage: buildscope <target>")
		}
		return fmt.Errorf("usage: buildscope %s <target>", commandName)
	}

	ui, err := resolveUIAssets(*uiDir)
	if err != nil {
		return err
	}
	workspaceDir, err := validateWorkspaceDir(*workdir)
	if err != nil {
		return err
	}

	tempFile, err := os.CreateTemp("", "buildscope-graph-*.json")
	if err != nil {
		return fmt.Errorf("create temp graph: %w", err)
	}
	graphPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temp graph: %w", err)
	}
	detailsPath := defaultDetailsPath(graphPath)
	mode := enrichMode(*enrich)
	switch mode {
	case enrichNone, enrichAnalyze, enrichBuild:
	default:
		return fmt.Errorf("invalid -enrich value %q (want none|analyze|build)", *enrich)
	}

	if err := extractGraph(fs.Arg(0), workspaceDir, graphPath, detailsPath, mode); err != nil {
		return err
	}
	defer os.Remove(graphPath)
	if mode != enrichNone {
		defer os.Remove(detailsPath)
	}

	payload := graphPayload{
		path:         graphPath,
		source:       graphPath,
		workspaceDir: workspaceDir,
		rootTarget:   fs.Arg(0),
	}
	if mode != enrichNone {
		payload.detailsPath = detailsPath
	}
	return serveGraph(ui, payload, *addr, true)
}

func viewCommand(args []string) error {
	fs := flag.NewFlagSet("view", flag.ExitOnError)
	uiDir := fs.String("ui-dir", "", "path to static UI assets; embedded assets when omitted")
	addr := registerListenAddrFlag(fs)
	_ = fs.Parse(normalizeFlagArgs(args))

	if fs.NArg() != 1 {
		return fmt.Errorf("usage: buildscope view <graph.json>")
	}

	ui, err := resolveUIAssets(*uiDir)
	if err != nil {
		return err
	}
	graph, err := fileGraphPayload(fs.Arg(0))
	if err != nil {
		return err
	}

	return serveGraph(ui, graph, *addr, true)
}

func demoCommand(args []string) error {
	fs := flag.NewFlagSet("demo", flag.ExitOnError)
	uiDir := fs.String("ui-dir", "", "path to static UI assets; embedded assets when omitted")
	addr := registerListenAddrFlag(fs)
	_ = fs.Parse(normalizeFlagArgs(args))

	if fs.NArg() != 0 {
		return fmt.Errorf("usage: buildscope demo")
	}

	ui, err := resolveUIAssets(*uiDir)
	if err != nil {
		return err
	}

	graph, err := bundledGraphPayload(ui)
	if err != nil {
		return fmt.Errorf("resolve bundled demo graph: %w", err)
	}

	return serveGraph(ui, graph, *addr, true)
}

func versionCommand(args []string) error {
	fs := flag.NewFlagSet("version", flag.ExitOnError)
	_ = fs.Parse(normalizeFlagArgs(args))

	if fs.NArg() != 0 {
		return fmt.Errorf("usage: buildscope version")
	}

	printVersion(os.Stdout)
	return nil
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}
	cmd := os.Args[1]
	if cmd == "--version" || cmd == "-version" || cmd == "-v" {
		printVersion(os.Stdout)
		return
	}
	if looksLikeBazelTarget(cmd) {
		if err := openCommand("", os.Args[1:]); err != nil {
			log.Fatal(err)
		}
		return
	}
	switch cmd {
	case "open", "extract-view":
		if err := openCommand(cmd, os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	case "view":
		if err := viewCommand(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	case "demo":
		if err := demoCommand(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	case "mcp":
		if err := mcpCommand(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	case "version":
		if err := versionCommand(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	case "serve":
		if err := serve(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	case "extract":
		if err := extract(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	default:
		usage()
		os.Exit(1)
	}
}
