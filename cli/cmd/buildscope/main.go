package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

func usage() {
	fmt.Println("BuildScope CLI (MVP)")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  extract -target //pkg:rule [-workdir <bazel workspace>] [-out graph.json]")
	fmt.Println("    Run bazel query deps(target) and emit a simple graph JSON.")
	fmt.Println("  serve [-dir ui/dist] [-graph ui/public/sample-graph.json] [-addr :4400]")
	fmt.Println("    Serve the static UI assets and expose /graph.json for the viewer.")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  buildscope serve")
	fmt.Println("  buildscope serve -dir ../ui/dist -graph ../ui/public/sample-graph.json -addr :8080")
	fmt.Println("  buildscope extract -target //speller/main:spell -workdir ~/code/repos/bazel-examples -out /tmp/graph.json")
}

func serve(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	dir := fs.String("dir", "ui/dist", "path to static UI assets (run npm run build first)")
	graph := fs.String("graph", "ui/public/sample-graph.json", "graph JSON to serve at /graph.json")
	addr := fs.String("addr", ":4400", "listen address (e.g. :4400)")
	_ = fs.Parse(args)

	staticDir, err := filepath.Abs(*dir)
	if err != nil {
		return fmt.Errorf("resolve dir: %w", err)
	}
	graphPath, err := filepath.Abs(*graph)
	if err != nil {
		return fmt.Errorf("resolve graph: %w", err)
	}

	if _, err := os.Stat(staticDir); err != nil {
		return fmt.Errorf("static dir not found: %s", staticDir)
	}
	if _, err := os.Stat(graphPath); err != nil {
		return fmt.Errorf("graph file not found: %s", graphPath)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir(staticDir)))
	mux.HandleFunc("/graph.json", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, graphPath)
	})

	log.Printf("Serving UI from %s", staticDir)
	log.Printf("Serving graph from %s at /graph.json", graphPath)

	listener, listenAddr, fellBack, err := listenWithFallback(*addr, 20)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", *addr, err)
	}
	if fellBack {
		log.Printf("Port %s is in use; falling back to %s", *addr, listenAddr)
	}
	log.Printf("Listening on %s", listenAddr)
	return http.Serve(listener, mux)
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
func parseQueryGraphStreaming(r interface{ Read([]byte) (int, error) }) graph {
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

	out := graph{}
	for n := range nodes {
		out.Nodes = append(out.Nodes, graphNode{ID: n, Label: n})
	}
	for _, e := range edgeSet {
		out.Edges = append(out.Edges, e)
	}
	return out
}

// parseQueryGraph parses `bazel query --output=graph` output from a string.
// Deprecated: Use parseQueryGraphStreaming for large graphs.
func parseQueryGraph(data string) graph {
	return parseQueryGraphStreaming(strings.NewReader(data))
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

func extract(args []string) error {
	fs := flag.NewFlagSet("extract", flag.ExitOnError)
	target := fs.String("target", "", "bazel target (e.g. //speller/main:spell)")
	workdir := fs.String("workdir", ".", "bazel workspace directory")
	outPath := fs.String("out", "graph.json", "output graph JSON path")
	_ = fs.Parse(args)

	if *target == "" {
		return fmt.Errorf("missing -target")
	}

	// Run bazel query deps(target) --output=graph
	log.Printf("Running bazel query for %s...", *target)
	cmd := exec.Command("/bin/sh", "-c",
		fmt.Sprintf("cd %s && bazel query 'deps(%s)' --output=graph --keep_going", *workdir, *target))

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("create pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start bazel: %w", err)
	}

	// Parse streaming output
	g := parseQueryGraphStreaming(stdout)

	if err := cmd.Wait(); err != nil {
		log.Printf("Warning: bazel query exited with error (might be partial results): %v", err)
	}

	if len(g.Nodes) == 0 {
		return fmt.Errorf("no nodes parsed; ensure target exists")
	}

	f, err := os.Create(*outPath)
	if err != nil {
		return fmt.Errorf("create out: %w", err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(g); err != nil {
		return fmt.Errorf("encode json: %w", err)
	}

	log.Printf("Wrote %s with %d nodes, %d edges", *outPath, len(g.Nodes), len(g.Edges))
	return nil
}

// runCmdCapture runs a shell command and returns stdout.
func runCmdCapture(cmd string) ([]byte, error) {
	// Use /bin/sh -c for simplicity
	command := exec.Command("/bin/sh", "-c", cmd)
	return command.Output()
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}
	cmd := os.Args[1]
	switch cmd {
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
