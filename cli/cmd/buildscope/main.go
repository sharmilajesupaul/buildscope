package main

import (
	"bufio"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"encoding/json"
	"os/exec"
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
	log.Printf("Listening on %s", *addr)
	return http.ListenAndServe(*addr, mux)
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

// parseQueryGraph parses `bazel query --output=graph` output.
func parseQueryGraph(data string) graph {
	nodes := make(map[string]struct{})
	edgeSet := make(map[string]graphEdge)

	sc := bufio.NewScanner(strings.NewReader(data))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
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
	cmd := fmt.Sprintf("cd %s && bazel query 'deps(%s)' --output=graph --keep_going", *workdir, *target)
	outBytes, err := runCmdCapture(cmd)
	if err != nil {
		return fmt.Errorf("bazel query failed: %w", err)
	}

	g := parseQueryGraph(string(outBytes))
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
