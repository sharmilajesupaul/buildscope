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

func usage() {
	fmt.Println("BuildScope CLI")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  open <target> [-workdir <bazel workspace>] [-ui-dir <ui/dist>] [-addr :4422]")
	fmt.Println("    Extract a graph for the Bazel target and open the local viewer.")
	fmt.Println("  view <graph.json> [-ui-dir <ui/dist>] [-addr :4422]")
	fmt.Println("    Serve a pre-generated graph JSON in the local viewer.")
	fmt.Println("  demo [-ui-dir <ui/dist>] [-addr :4422]")
	fmt.Println("    Open the bundled sample graph.")
	fmt.Println("  version")
	fmt.Println("    Print the BuildScope version, commit, and build date.")
	fmt.Println("  extract -target //pkg:rule [-workdir <bazel workspace>] [-out graph.json]")
	fmt.Println("    Run bazel query 'deps(target)' --output=graph --keep_going and emit graph JSON.")
	fmt.Println("  serve [-dir <ui/dist>] [-graph <graph.json>] [-addr :4422]")
	fmt.Println("    Low-level server command. Defaults to the bundled sample graph when -graph is omitted.")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  buildscope version")
	fmt.Println("  buildscope demo")
	fmt.Println("  buildscope open //speller/main:spell -workdir ~/code/repos/bazel-examples")
	fmt.Println("  buildscope view /tmp/graph.json")
	fmt.Println("  buildscope extract -target //speller/main:spell -workdir ~/code/repos/bazel-examples -out /tmp/graph.json")
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

type uiAssets struct {
	fsys   iofs.FS
	source string
	dir    string
}

type graphPayload struct {
	path   string
	data   []byte
	source string
}

func serveGraph(ui uiAssets, graph graphPayload, addr string) error {
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(ui.fsys)))
	mux.HandleFunc("/graph.json", func(w http.ResponseWriter, r *http.Request) {
		if graph.path != "" {
			http.ServeFile(w, r, graph.path)
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		http.ServeContent(w, r, "graph.json", time.Time{}, bytes.NewReader(graph.data))
	})

	log.Printf("Serving UI from %s", ui.source)
	log.Printf("Serving graph from %s at /graph.json", graph.source)

	listener, listenAddr, fellBack, err := listenWithFallback(addr, 20)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", addr, err)
	}
	if fellBack {
		log.Printf("Port %s is in use; falling back to %s", addr, listenAddr)
	}
	log.Printf("Listening on %s", listenAddr)
	return http.Serve(listener, mux)
}

func serve(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	dir := fs.String("dir", "", "path to static UI assets; embedded assets when omitted")
	graph := fs.String("graph", "", "graph JSON to serve at /graph.json; defaults to the bundled sample graph")
	addr := fs.String("addr", ":4422", "listen address (e.g. :4422)")
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

	return serveGraph(ui, servedGraph, *addr)
}

func listenWithFallback(addr string, maxTries int) (net.Listener, string, bool, error) {
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

type graph struct {
	Nodes []graphNode `json:"nodes"`
	Edges []graphEdge `json:"edges"`
}

type graphNode struct {
	ID    string `json:"id"`
	Label string `json:"label"`
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
	return graphPayload{
		path:   graphPath,
		source: graphPath,
	}, nil
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

func extractGraph(target, workdir, outPath string) error {
	if target == "" {
		return fmt.Errorf("missing target")
	}

	if _, err := validateWorkspaceDir(workdir); err != nil {
		return err
	}

	log.Printf("Running bazel query for %s...", target)
	cmd := exec.Command("bazel", "query", fmt.Sprintf("deps(%s)", target), "--output=graph", "--keep_going")
	cmd.Dir = workdir
	cmd.Stderr = os.Stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("create pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start bazel: %w", err)
	}

	g := parseQueryGraphStreaming(stdout)

	if err := cmd.Wait(); err != nil {
		log.Printf("Warning: bazel query exited with error (might be partial results): %v", err)
	}

	if len(g.Nodes) == 0 {
		return fmt.Errorf("no nodes parsed; ensure target exists")
	}

	f, err := os.Create(outPath)
	if err != nil {
		return fmt.Errorf("create out: %w", err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(g); err != nil {
		return fmt.Errorf("encode json: %w", err)
	}

	log.Printf("Wrote %s with %d nodes, %d edges", outPath, len(g.Nodes), len(g.Edges))
	return nil
}

func extract(args []string) error {
	fs := flag.NewFlagSet("extract", flag.ExitOnError)
	target := fs.String("target", "", "bazel target (e.g. //speller/main:spell)")
	workdir := fs.String("workdir", ".", "bazel workspace directory")
	outPath := fs.String("out", "graph.json", "output graph JSON path")
	_ = fs.Parse(normalizeFlagArgs(args))

	if *target == "" {
		return fmt.Errorf("missing -target")
	}

	return extractGraph(*target, *workdir, *outPath)
}

func openCommand(args []string) error {
	fs := flag.NewFlagSet("open", flag.ExitOnError)
	workdir := fs.String("workdir", ".", "bazel workspace directory")
	uiDir := fs.String("ui-dir", "", "path to static UI assets; embedded assets when omitted")
	addr := fs.String("addr", ":4422", "listen address (e.g. :4422)")
	_ = fs.Parse(normalizeFlagArgs(args))

	if fs.NArg() != 1 {
		return fmt.Errorf("usage: buildscope open <target>")
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

	if err := extractGraph(fs.Arg(0), workspaceDir, graphPath); err != nil {
		return err
	}
	defer os.Remove(graphPath)

	return serveGraph(ui, graphPayload{
		path:   graphPath,
		source: graphPath,
	}, *addr)
}

func viewCommand(args []string) error {
	fs := flag.NewFlagSet("view", flag.ExitOnError)
	uiDir := fs.String("ui-dir", "", "path to static UI assets; embedded assets when omitted")
	addr := fs.String("addr", ":4422", "listen address (e.g. :4422)")
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

	return serveGraph(ui, graph, *addr)
}

func demoCommand(args []string) error {
	fs := flag.NewFlagSet("demo", flag.ExitOnError)
	uiDir := fs.String("ui-dir", "", "path to static UI assets; embedded assets when omitted")
	addr := fs.String("addr", ":4422", "listen address (e.g. :4422)")
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

	return serveGraph(ui, graph, *addr)
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
	switch cmd {
	case "open":
		if err := openCommand(os.Args[2:]); err != nil {
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
