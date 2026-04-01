package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type graphDetails struct {
	Nodes map[string]graphNodeDetails `json:"nodes"`
}

type graphNodeDetails struct {
	DirectInputs  []artifactSummary `json:"directInputs,omitempty"`
	DirectOutputs []artifactSummary `json:"directOutputs,omitempty"`
	Mnemonics     []mnemonicCount   `json:"mnemonics,omitempty"`
}

type artifactSummary struct {
	Label     string `json:"label,omitempty"`
	Path      string `json:"path,omitempty"`
	Kind      string `json:"kind,omitempty"`
	SizeBytes int64  `json:"sizeBytes,omitempty"`
	Exists    bool   `json:"exists,omitempty"`
}

type mnemonicCount struct {
	Mnemonic string `json:"mnemonic"`
	Count    int    `json:"count"`
}

type labelKindInfo struct {
	Kind     string
	NodeType string
	RuleKind string
}

type configuredTargetInfo struct {
	OutputPaths []string
	Mnemonics   []string
}

type enrichMode string

const (
	enrichNone    enrichMode = "none"
	enrichAnalyze enrichMode = "analyze"
	enrichBuild   enrichMode = "build"
)

func newBazelCommand(workdir string, args ...string) *exec.Cmd {
	cmd := exec.Command("bazel", args...)
	cmd.Dir = workdir
	return cmd
}

func bazelCombinedOutput(workdir string, args ...string) ([]byte, error) {
	cmd := newBazelCommand(workdir, args...)
	return cmd.CombinedOutput()
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func defaultDetailsPath(graphPath string) string {
	ext := filepath.Ext(graphPath)
	if ext == "" {
		return graphPath + ".details.json"
	}
	base := strings.TrimSuffix(graphPath, ext)
	return base + ".details" + ext
}

func extractGraphData(target, workdir string) (graph, error) {
	if target == "" {
		return graph{}, fmt.Errorf("missing target")
	}
	if _, err := validateWorkspaceDir(workdir); err != nil {
		return graph{}, err
	}

	log.Printf("Running bazel query graph for %s...", target)
	cmd := newBazelCommand(workdir, "query", fmt.Sprintf("deps(%s)", target), "--output=graph", "--keep_going")
	cmd.Stderr = os.Stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return graph{}, fmt.Errorf("create pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return graph{}, fmt.Errorf("start bazel query graph: %w", err)
	}

	g := parseQueryGraphStreaming(stdout)
	if err := cmd.Wait(); err != nil {
		log.Printf("Warning: bazel query graph exited with error (might be partial results): %v", err)
	}
	if len(g.Nodes) == 0 {
		return graph{}, fmt.Errorf("no nodes parsed; ensure target exists")
	}
	return g, nil
}

func loadLabelKinds(workdir, target string) (map[string]labelKindInfo, error) {
	log.Printf("Running bazel query label_kind for %s...", target)
	out, err := bazelCombinedOutput(workdir, "query", fmt.Sprintf("deps(%s)", target), "--output=label_kind", "--keep_going")
	if err != nil {
		log.Printf("Warning: bazel query label_kind exited with error (might be partial results): %v", err)
	}
	infoByLabel := make(map[string]labelKindInfo)
	sc := bufio.NewScanner(strings.NewReader(string(out)))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		label := parts[len(parts)-1]
		kind := strings.TrimSpace(strings.TrimSuffix(line, label))
		if label == "" || kind == "" {
			continue
		}
		info := labelKindInfo{Kind: kind}
		switch {
		case kind == "source file":
			info.NodeType = "source-file"
		case kind == "generated file":
			info.NodeType = "generated-file"
		case strings.HasSuffix(kind, " rule"):
			info.NodeType = "rule"
			info.RuleKind = strings.TrimSuffix(kind, " rule")
		default:
			info.NodeType = "other"
		}
		infoByLabel[label] = info
	}
	if err := sc.Err(); err != nil {
		return infoByLabel, fmt.Errorf("scan label_kind output: %w", err)
	}
	return infoByLabel, nil
}

func loadExecutionRoot(workdir string) (string, error) {
	out, err := bazelCombinedOutput(workdir, "info", "execution_root")
	if err != nil {
		return "", fmt.Errorf("bazel info execution_root: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

func loadConfiguredTargetInfo(workdir, target string) (map[string]*configuredTargetInfo, error) {
	log.Printf("Running bazel cquery metadata for %s...", target)
	tmpFile, err := os.CreateTemp("", "buildscope-*.cquery")
	if err != nil {
		return nil, fmt.Errorf("create temp cquery file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	script := strings.Join([]string{
		"LIST_SEP = '\\x1f'",
		"FIELD_SEP = '\\t'",
		"",
		"def join_parts(parts):",
		"  return LIST_SEP.join(parts)",
		"",
		"def format(target):",
		"  provider_map = providers(target)",
		"  default_info = provider_map.get('DefaultInfo')",
		"  output_paths = []",
		"  if default_info:",
		"    output_paths = sorted([f.path for f in default_info.files.to_list()])",
		"  mnemonics = sorted([a.mnemonic for a in target.actions])",
		"  return str(target.label) + FIELD_SEP + join_parts(output_paths) + FIELD_SEP + join_parts(mnemonics)",
		"",
	}, "\n")
	if _, err := tmpFile.WriteString(script); err != nil {
		return nil, fmt.Errorf("write cquery script: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return nil, fmt.Errorf("close cquery script: %w", err)
	}

	out, err := bazelCombinedOutput(workdir,
		"cquery", fmt.Sprintf("deps(%s)", target),
		"--output=starlark",
		fmt.Sprintf("--starlark:file=%s", tmpFile.Name()),
		"--keep_going")
	if err != nil {
		log.Printf("Warning: bazel cquery metadata exited with error (might be partial results): %v", err)
	}

	infoByLabel := make(map[string]*configuredTargetInfo)
	sc := bufio.NewScanner(strings.NewReader(string(out)))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		label := parts[0]
		if label == "" {
			continue
		}
		info := infoByLabel[label]
		if info == nil {
			info = &configuredTargetInfo{}
			infoByLabel[label] = info
		}
		if len(parts) > 1 && parts[1] != "" {
			for _, path := range strings.Split(parts[1], "\x1f") {
				if path != "" {
					info.OutputPaths = append(info.OutputPaths, path)
				}
			}
		}
		if len(parts) > 2 && parts[2] != "" {
			for _, mnemonic := range strings.Split(parts[2], "\x1f") {
				if mnemonic != "" {
					info.Mnemonics = append(info.Mnemonics, mnemonic)
				}
			}
		}
	}
	if err := sc.Err(); err != nil {
		return infoByLabel, fmt.Errorf("scan cquery output: %w", err)
	}

	for _, info := range infoByLabel {
		info.OutputPaths = uniqueSortedStrings(info.OutputPaths)
		sort.Strings(info.Mnemonics)
	}
	return infoByLabel, nil
}

func uniqueSortedStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func runBuildIfRequested(workdir, target string, mode enrichMode) error {
	if mode != enrichBuild {
		return nil
	}
	log.Printf("Running bazel build for %s to materialize outputs...", target)
	cmd := newBazelCommand(workdir, "build", target, "--keep_going")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("bazel build: %w", err)
	}
	return nil
}

func labelToPackage(label string) string {
	trimmed := strings.TrimPrefix(label, "@")
	parts := strings.SplitN(trimmed, "//", 2)
	if len(parts) == 2 {
		trimmed = parts[1]
	}
	packageAndName := strings.SplitN(trimmed, ":", 2)
	if len(packageAndName) == 0 {
		return ""
	}
	return packageAndName[0]
}

func labelToWorkspacePath(label string) string {
	repo := ""
	rest := label
	if strings.HasPrefix(label, "@") {
		afterRepo := strings.SplitN(label[1:], "//", 2)
		if len(afterRepo) != 2 {
			return ""
		}
		repo = afterRepo[0]
		rest = "//" + afterRepo[1]
	}
	if !strings.HasPrefix(rest, "//") {
		return ""
	}
	body := strings.TrimPrefix(rest, "//")
	parts := strings.SplitN(body, ":", 2)
	pkg := parts[0]
	name := ""
	if len(parts) > 1 {
		name = parts[1]
	}
	if name == "" {
		name = filepath.Base(pkg)
	}
	rel := filepath.Clean(filepath.Join(pkg, name))
	if repo != "" {
		return filepath.Join("external", repo, rel)
	}
	return rel
}

func resolveArtifactPath(workdir, execRoot, rel string) string {
	if rel == "" {
		return ""
	}
	if filepath.IsAbs(rel) {
		return rel
	}
	candidates := []string{
		filepath.Join(workdir, rel),
		filepath.Join(execRoot, rel),
	}
	for _, candidate := range candidates {
		if fileExists(candidate) {
			return candidate
		}
	}
	return candidates[len(candidates)-1]
}

func statArtifactSize(path string) (int64, bool) {
	if path == "" {
		return 0, false
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return 0, false
	}
	return info.Size(), true
}

func summarizeMnemonics(values []string) []mnemonicCount {
	if len(values) == 0 {
		return nil
	}
	counts := make(map[string]int)
	for _, value := range values {
		counts[value]++
	}
	summary := make([]mnemonicCount, 0, len(counts))
	for mnemonic, count := range counts {
		summary = append(summary, mnemonicCount{Mnemonic: mnemonic, Count: count})
	}
	sort.Slice(summary, func(i, j int) bool {
		if summary[i].Count != summary[j].Count {
			return summary[i].Count > summary[j].Count
		}
		return summary[i].Mnemonic < summary[j].Mnemonic
	})
	return summary
}

func topArtifacts(values []artifactSummary, limit int) []artifactSummary {
	if len(values) == 0 {
		return nil
	}
	cloned := append([]artifactSummary(nil), values...)
	sort.Slice(cloned, func(i, j int) bool {
		if cloned[i].SizeBytes != cloned[j].SizeBytes {
			return cloned[i].SizeBytes > cloned[j].SizeBytes
		}
		if cloned[i].Kind != cloned[j].Kind {
			return cloned[i].Kind < cloned[j].Kind
		}
		if cloned[i].Label != cloned[j].Label {
			return cloned[i].Label < cloned[j].Label
		}
		return cloned[i].Path < cloned[j].Path
	})
	if len(cloned) > limit {
		cloned = cloned[:limit]
	}
	return cloned
}

func enrichGraphData(g *graph, workdir, target string, mode enrichMode) (*graphDetails, error) {
	if mode == enrichNone {
		return nil, nil
	}
	execRoot, err := loadExecutionRoot(workdir)
	if err != nil {
		return nil, err
	}
	labelKinds, err := loadLabelKinds(workdir, target)
	if err != nil {
		return nil, err
	}
	if err := runBuildIfRequested(workdir, target, mode); err != nil {
		return nil, err
	}
	configuredInfo, err := loadConfiguredTargetInfo(workdir, target)
	if err != nil {
		return nil, err
	}

	nodeByID := make(map[string]*graphNode, len(g.Nodes))
	outgoing := make(map[string][]string)
	for i := range g.Nodes {
		node := &g.Nodes[i]
		if kindInfo, ok := labelKinds[node.ID]; ok {
			node.NodeType = kindInfo.NodeType
			node.RuleKind = kindInfo.RuleKind
		}
		node.PackageName = labelToPackage(node.ID)
		nodeByID[node.ID] = node
	}
	for _, edge := range g.Edges {
		outgoing[edge.Source] = append(outgoing[edge.Source], edge.Target)
	}

	fileArtifacts := make(map[string]artifactSummary)
	for _, node := range g.Nodes {
		if node.NodeType != "source-file" && node.NodeType != "generated-file" {
			continue
		}
		path := ""
		if info := configuredInfo[node.ID]; info != nil && len(info.OutputPaths) > 0 {
			path = info.OutputPaths[0]
		}
		if path == "" {
			path = labelToWorkspacePath(node.ID)
		}
		absPath := resolveArtifactPath(workdir, execRoot, path)
		sizeBytes, exists := statArtifactSize(absPath)
		fileArtifacts[node.ID] = artifactSummary{
			Label:     node.ID,
			Path:      path,
			Kind:      node.NodeType,
			SizeBytes: sizeBytes,
			Exists:    exists,
		}
	}

	details := &graphDetails{Nodes: make(map[string]graphNodeDetails)}
	for i := range g.Nodes {
		node := &g.Nodes[i]
		if node.NodeType != "rule" {
			continue
		}

		inputs := make([]artifactSummary, 0)
		for _, depID := range outgoing[node.ID] {
			depNode := nodeByID[depID]
			if depNode == nil {
				continue
			}
			if depNode.NodeType != "source-file" && depNode.NodeType != "generated-file" {
				continue
			}
			artifact, ok := fileArtifacts[depID]
			if !ok {
				continue
			}
			inputs = append(inputs, artifact)
			node.InputFileCount++
			if artifact.Exists {
				node.InputBytes += artifact.SizeBytes
			}
			if depNode.NodeType == "source-file" {
				node.SourceFileCount++
				if artifact.Exists {
					node.SourceBytes += artifact.SizeBytes
				}
			}
		}

		outputs := make([]artifactSummary, 0)
		if info := configuredInfo[node.ID]; info != nil {
			node.MnemonicSummary = summarizeMnemonics(info.Mnemonics)
			for _, entry := range node.MnemonicSummary {
				node.ActionCount += entry.Count
			}
			for _, outputPath := range info.OutputPaths {
				absPath := resolveArtifactPath(workdir, execRoot, outputPath)
				sizeBytes, exists := statArtifactSize(absPath)
				outputs = append(outputs, artifactSummary{
					Path:      outputPath,
					Kind:      "output",
					SizeBytes: sizeBytes,
					Exists:    exists,
				})
				node.OutputFileCount++
				if exists {
					node.OutputBytes += sizeBytes
				}
			}
		}

		sort.Slice(inputs, func(i, j int) bool {
			if inputs[i].SizeBytes != inputs[j].SizeBytes {
				return inputs[i].SizeBytes > inputs[j].SizeBytes
			}
			return inputs[i].Label < inputs[j].Label
		})
		sort.Slice(outputs, func(i, j int) bool {
			if outputs[i].SizeBytes != outputs[j].SizeBytes {
				return outputs[i].SizeBytes > outputs[j].SizeBytes
			}
			return outputs[i].Path < outputs[j].Path
		})

		node.TopFiles = topArtifacts(inputs, 5)
		node.TopOutputs = topArtifacts(outputs, 5)
		details.Nodes[node.ID] = graphNodeDetails{
			DirectInputs:  inputs,
			DirectOutputs: outputs,
			Mnemonics:     node.MnemonicSummary,
		}
	}

	return details, nil
}

func writeGraphFiles(g graph, details *graphDetails, outPath, detailsOut string) error {
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

	if details != nil {
		detailsPath := detailsOut
		if detailsPath == "" {
			detailsPath = defaultDetailsPath(outPath)
		}
		df, err := os.Create(detailsPath)
		if err != nil {
			return fmt.Errorf("create details out: %w", err)
		}
		defer df.Close()
		detailsEnc := json.NewEncoder(df)
		detailsEnc.SetIndent("", "  ")
		if err := detailsEnc.Encode(details); err != nil {
			return fmt.Errorf("encode details json: %w", err)
		}
		log.Printf("Wrote %s with %d detailed nodes", detailsPath, len(details.Nodes))
	}

	log.Printf("Wrote %s with %d nodes, %d edges", outPath, len(g.Nodes), len(g.Edges))
	return nil
}
