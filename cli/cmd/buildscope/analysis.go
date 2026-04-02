package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
)

const (
	defaultAnalysisLimit = 10
	maxAnalysisLimit     = 100
)

type analyzedNode struct {
	graphNode
	InDegree            int
	OutDegree           int
	TransitiveInDegree  int
	TransitiveOutDegree int
	SCCID               int
	SCCSize             int
	HotspotScore        int
	HotspotRank         int
	IsHotspot           bool
}

type analyzedComponent struct {
	ID           int
	Members      []int
	Size         int
	SelfLoop     bool
	Incoming     map[int]struct{}
	Outgoing     map[int]struct{}
	HotspotScore int
	HotspotRank  int
	IsHotspot    bool
}

type analysisBase struct {
	schemaVersion      int
	analysisMode       string
	target             string
	detailsPath        string
	nodes              []analyzedNode
	edges              []graphEdge
	idIndex            map[string]int
	incoming           [][]int
	outgoing           [][]int
	components         []analyzedComponent
	ruleTargetCount    int
	hotspotCount       int
	largestHotspotSize int
}

type targetSurfaceSummary struct {
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

type impactTarget struct {
	ID                  string `json:"id"`
	Label               string `json:"label"`
	TransitiveInDegree  int    `json:"transitiveInDegree"`
	OutDegree           int    `json:"outDegree"`
	TransitiveOutDegree int    `json:"transitiveOutDegree"`
	SCCSize             int    `json:"sccSize"`
	HotspotRank         int    `json:"hotspotRank"`
	IsHotspot           bool   `json:"isHotspot"`
	targetSurfaceSummary
}

type breakupCandidate struct {
	ID                       string   `json:"id"`
	Label                    string   `json:"label"`
	Pressure                 float64  `json:"pressure"`
	OpportunityScore         float64  `json:"opportunityScore"`
	ImpactScore              float64  `json:"impactScore"`
	MassScore                float64  `json:"massScore"`
	ShardabilityScore        float64  `json:"shardabilityScore"`
	TransitiveInDegree       int      `json:"transitiveInDegree"`
	OutDegree                int      `json:"outDegree"`
	TransitiveOutDegree      int      `json:"transitiveOutDegree"`
	SCCSize                  int      `json:"sccSize"`
	DependencyPackageCount   int      `json:"dependencyPackageCount,omitempty"`
	DependencyPackageEntropy float64  `json:"dependencyPackageEntropy,omitempty"`
	StableSharedLeaf         bool     `json:"stableSharedLeaf,omitempty"`
	DirectDependencySample   []string `json:"directDependencySample,omitempty"`
	Recommendations          []string `json:"recommendations,omitempty"`
	targetSurfaceSummary
}

type sourceHeavyTarget struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	targetSurfaceSummary
}

type outputHeavyTarget struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	targetSurfaceSummary
}

type cyclicHotspot struct {
	ComponentID  int      `json:"componentId"`
	Size         int      `json:"size"`
	HotspotScore int      `json:"hotspotScore"`
	Members      []string `json:"members"`
}

type focusTarget struct {
	ID                       string   `json:"id"`
	Label                    string   `json:"label"`
	InDegree                 int      `json:"inDegree"`
	OutDegree                int      `json:"outDegree"`
	TransitiveInDegree       int      `json:"transitiveInDegree"`
	TransitiveOutDegree      int      `json:"transitiveOutDegree"`
	SCCSize                  int      `json:"sccSize"`
	HotspotRank              int      `json:"hotspotRank"`
	IsHotspot                bool     `json:"isHotspot"`
	Pressure                 float64  `json:"pressure"`
	OpportunityScore         float64  `json:"opportunityScore"`
	ImpactScore              float64  `json:"impactScore"`
	MassScore                float64  `json:"massScore"`
	ShardabilityScore        float64  `json:"shardabilityScore"`
	DependencyPackageCount   int      `json:"dependencyPackageCount,omitempty"`
	DependencyPackageEntropy float64  `json:"dependencyPackageEntropy,omitempty"`
	StableSharedLeaf         bool     `json:"stableSharedLeaf,omitempty"`
	DirectDependencies       []string `json:"directDependencies,omitempty"`
	DirectDependents         []string `json:"directDependents,omitempty"`
	targetSurfaceSummary
}

type decompositionCommunity struct {
	ID                      string   `json:"id"`
	Title                   string   `json:"title"`
	PackageName             string   `json:"packageName,omitempty"`
	NodeCount               int      `json:"nodeCount"`
	Share                   float64  `json:"share"`
	InternalEdgeCount       int      `json:"internalEdgeCount"`
	CrossCommunityEdgeCount int      `json:"crossCommunityEdgeCount"`
	SourceBytes             int64    `json:"sourceBytes,omitempty"`
	InputBytes              int64    `json:"inputBytes,omitempty"`
	OutputBytes             int64    `json:"outputBytes,omitempty"`
	ActionCount             int      `json:"actionCount,omitempty"`
	SampleLabels            []string `json:"sampleLabels,omitempty"`
}

type decompositionMetricInsight struct {
	Score      float64 `json:"score,omitempty"`
	Percentile int     `json:"percentile,omitempty"`
	Band       string  `json:"band,omitempty"`
	Reason     string  `json:"reason,omitempty"`
}

type targetDecompositionResponse struct {
	Target                    string                     `json:"target"`
	Label                     string                     `json:"label"`
	NodeType                  string                     `json:"nodeType,omitempty"`
	Eligible                  bool                       `json:"eligible"`
	Reason                    string                     `json:"reason,omitempty"`
	Method                    string                     `json:"method,omitempty"`
	Verdict                   string                     `json:"verdict,omitempty"`
	ImpactScore               float64                    `json:"impactScore,omitempty"`
	MassScore                 float64                    `json:"massScore,omitempty"`
	ShardabilityScore         float64                    `json:"shardabilityScore,omitempty"`
	Impact                    decompositionMetricInsight `json:"impact,omitempty"`
	Mass                      decompositionMetricInsight `json:"mass,omitempty"`
	SplitFit                  decompositionMetricInsight `json:"splitFit,omitempty"`
	DirectDependencyCount     int                        `json:"directDependencyCount"`
	DirectRuleDependencyCount int                        `json:"directRuleDependencyCount"`
	CommunityCount            int                        `json:"communityCount"`
	LargestCommunityShare     float64                    `json:"largestCommunityShare,omitempty"`
	CrossCommunityEdgeRatio   float64                    `json:"crossCommunityEdgeRatio,omitempty"`
	Communities               []decompositionCommunity   `json:"communities,omitempty"`
	Recommendations           []string                   `json:"recommendations,omitempty"`
}

type analysisResponse struct {
	SchemaVersion         int                 `json:"schemaVersion,omitempty"`
	AnalysisMode          string              `json:"analysisMode,omitempty"`
	Target                string              `json:"target,omitempty"`
	DetailsPath           string              `json:"detailsPath,omitempty"`
	NodeCount             int                 `json:"nodeCount"`
	EdgeCount             int                 `json:"edgeCount"`
	RuleTargetCount       int                 `json:"ruleTargetCount"`
	HotspotCount          int                 `json:"hotspotCount"`
	LargestHotspotSize    int                 `json:"largestHotspotSize"`
	TopImpactTargets      []impactTarget      `json:"topImpactTargets"`
	TopBreakupCandidates  []breakupCandidate  `json:"topBreakupCandidates"`
	TopSourceHeavyTargets []sourceHeavyTarget `json:"topSourceHeavyTargets,omitempty"`
	TopOutputHeavyTargets []outputHeavyTarget `json:"topOutputHeavyTargets,omitempty"`
	CyclicHotspots        []cyclicHotspot     `json:"cyclicHotspots"`
	Focus                 *focusTarget        `json:"focus,omitempty"`
}

func loadGraphBytes(payload graphPayload) ([]byte, error) {
	if payload.path != "" {
		data, err := os.ReadFile(payload.path)
		if err != nil {
			return nil, fmt.Errorf("read graph file: %w", err)
		}
		return data, nil
	}

	return append([]byte(nil), payload.data...), nil
}

func parseGraphJSON(data []byte) (graph, error) {
	var raw graph
	if err := json.Unmarshal(data, &raw); err != nil {
		return graph{}, fmt.Errorf("decode graph JSON: %w", err)
	}
	return raw, nil
}

func isValidGraphID(value string) bool {
	return value != "" &&
		!strings.Contains(value, " ") &&
		!strings.Contains(value, "[") &&
		!strings.Contains(value, "]") &&
		(strings.HasPrefix(value, "//") || strings.HasPrefix(value, "@"))
}

func sanitizeGraph(raw graph) graph {
	nodeIndex := make(map[string]int, len(raw.Nodes))
	nodes := make([]graphNode, 0, len(raw.Nodes))
	for _, node := range raw.Nodes {
		if !isValidGraphID(node.ID) {
			continue
		}
		if _, exists := nodeIndex[node.ID]; exists {
			continue
		}
		label := node.Label
		if label == "" {
			label = node.ID
		}
		node.Label = label
		nodeIndex[node.ID] = len(nodes)
		nodes = append(nodes, node)
	}

	edges := make([]graphEdge, 0, len(raw.Edges))
	edgeSet := make(map[string]struct{}, len(raw.Edges))
	for _, edge := range raw.Edges {
		if !isValidGraphID(edge.Source) || !isValidGraphID(edge.Target) {
			continue
		}
		if _, ok := nodeIndex[edge.Source]; !ok {
			continue
		}
		if _, ok := nodeIndex[edge.Target]; !ok {
			continue
		}
		key := edge.Source + "->" + edge.Target
		if _, exists := edgeSet[key]; exists {
			continue
		}
		edgeSet[key] = struct{}{}
		edges = append(edges, edge)
	}

	return graph{
		SchemaVersion: raw.SchemaVersion,
		AnalysisMode:  raw.AnalysisMode,
		Target:        raw.Target,
		DetailsPath:   raw.DetailsPath,
		Nodes:         nodes,
		Edges:         edges,
	}
}

func isRuleNode(node analyzedNode) bool {
	return node.NodeType == "" || node.NodeType == "rule"
}

func surfaceSummary(node analyzedNode) targetSurfaceSummary {
	return targetSurfaceSummary{
		NodeType:        node.NodeType,
		RuleKind:        node.RuleKind,
		PackageName:     node.PackageName,
		SourceFileCount: node.SourceFileCount,
		SourceBytes:     node.SourceBytes,
		InputFileCount:  node.InputFileCount,
		InputBytes:      node.InputBytes,
		OutputFileCount: node.OutputFileCount,
		OutputBytes:     node.OutputBytes,
		ActionCount:     node.ActionCount,
		MnemonicSummary: append([]mnemonicCount(nil), node.MnemonicSummary...),
		TopFiles:        append([]artifactSummary(nil), node.TopFiles...),
		TopOutputs:      append([]artifactSummary(nil), node.TopOutputs...),
	}
}

func buildAnalysisBase(raw graph) *analysisBase {
	clean := sanitizeGraph(raw)
	nodes := make([]analyzedNode, len(clean.Nodes))
	idIndex := make(map[string]int, len(clean.Nodes))
	ruleTargetCount := 0
	for i, node := range clean.Nodes {
		nodes[i] = analyzedNode{
			graphNode:   node,
			SCCID:       -1,
			SCCSize:     1,
			HotspotRank: 0,
		}
		idIndex[node.ID] = i
		if isRuleNode(nodes[i]) {
			ruleTargetCount++
		}
	}

	incoming := make([][]int, len(nodes))
	outgoing := make([][]int, len(nodes))
	edges := make([]graphEdge, 0, len(clean.Edges))
	for _, edge := range clean.Edges {
		sourceIndex, sourceOK := idIndex[edge.Source]
		targetIndex, targetOK := idIndex[edge.Target]
		if !sourceOK || !targetOK {
			continue
		}
		nodes[sourceIndex].OutDegree++
		nodes[targetIndex].InDegree++
		outgoing[sourceIndex] = append(outgoing[sourceIndex], targetIndex)
		incoming[targetIndex] = append(incoming[targetIndex], sourceIndex)
		edges = append(edges, edge)
	}

	for i := range nodes {
		nodes[i].TransitiveInDegree = len(bfsReachability(incoming[i], incoming))
		nodes[i].TransitiveOutDegree = len(bfsReachability(outgoing[i], outgoing))
	}

	components := calculateAnalyzedSCCs(nodes, outgoing)
	for sourceIndex, targets := range outgoing {
		sourceComponent := nodes[sourceIndex].SCCID
		for _, targetIndex := range targets {
			targetComponent := nodes[targetIndex].SCCID
			if sourceComponent == targetComponent {
				continue
			}
			components[sourceComponent].Outgoing[targetComponent] = struct{}{}
			components[targetComponent].Incoming[sourceComponent] = struct{}{}
		}
	}

	rankedComponents := make([]*analyzedComponent, 0, len(components))
	for i := range components {
		component := &components[i]
		degreeImpact := len(component.Incoming) + len(component.Outgoing)
		cyclicityBonus := 0
		if component.SelfLoop || component.Size > 1 {
			cyclicityBonus = component.Size * 4
		}
		component.HotspotScore = degreeImpact + cyclicityBonus
		component.IsHotspot = component.HotspotScore > 0 && (component.Size > 1 || component.SelfLoop)
		rankedComponents = append(rankedComponents, component)
	}
	sort.Slice(rankedComponents, func(i, j int) bool {
		left := rankedComponents[i]
		right := rankedComponents[j]
		if left.HotspotScore != right.HotspotScore {
			return left.HotspotScore > right.HotspotScore
		}
		if left.Size != right.Size {
			return left.Size > right.Size
		}
		return left.ID < right.ID
	})
	for rank, component := range rankedComponents {
		component.HotspotRank = rank + 1
	}
	for i := range nodes {
		component := components[nodes[i].SCCID]
		nodes[i].HotspotScore = component.HotspotScore
		nodes[i].HotspotRank = component.HotspotRank
		nodes[i].IsHotspot = component.IsHotspot
		nodes[i].SCCSize = component.Size
	}

	markHighImpactHotspots(nodes)

	hotspotCount := 0
	largestHotspotSize := 0
	for _, node := range nodes {
		if node.IsHotspot && isRuleNode(node) {
			hotspotCount++
		}
	}
	for _, component := range components {
		if component.IsHotspot && component.Size > largestHotspotSize {
			largestHotspotSize = component.Size
		}
	}

	return &analysisBase{
		schemaVersion:      clean.SchemaVersion,
		analysisMode:       clean.AnalysisMode,
		target:             clean.Target,
		detailsPath:        clean.DetailsPath,
		nodes:              nodes,
		edges:              edges,
		idIndex:            idIndex,
		incoming:           incoming,
		outgoing:           outgoing,
		components:         components,
		ruleTargetCount:    ruleTargetCount,
		hotspotCount:       hotspotCount,
		largestHotspotSize: largestHotspotSize,
	}
}

func bfsReachability(start []int, adjacency [][]int) map[int]struct{} {
	visited := make(map[int]struct{}, len(start))
	queue := make([]int, 0, len(start))
	for _, node := range start {
		if _, exists := visited[node]; exists {
			continue
		}
		visited[node] = struct{}{}
		queue = append(queue, node)
	}
	for head := 0; head < len(queue); head++ {
		current := queue[head]
		for _, next := range adjacency[current] {
			if _, exists := visited[next]; exists {
				continue
			}
			visited[next] = struct{}{}
			queue = append(queue, next)
		}
	}
	return visited
}

func calculateAnalyzedSCCs(nodes []analyzedNode, outgoing [][]int) []analyzedComponent {
	indexByNode := make([]int, len(nodes))
	for i := range indexByNode {
		indexByNode[i] = -1
	}
	lowLink := make([]int, len(nodes))
	onStack := make([]bool, len(nodes))
	stack := make([]int, 0, len(nodes))
	componentByNode := make([]int, len(nodes))
	for i := range componentByNode {
		componentByNode[i] = -1
	}
	selfLoop := make(map[int]struct{})
	for sourceIndex, targets := range outgoing {
		for _, targetIndex := range targets {
			if sourceIndex == targetIndex {
				selfLoop[sourceIndex] = struct{}{}
			}
		}
	}

	components := make([]analyzedComponent, 0)
	index := 0
	type frame struct {
		nodeIndex  int
		childIndex int
	}

	var enter func(nodeIndex int, callStack *[]frame)
	enter = func(nodeIndex int, callStack *[]frame) {
		indexByNode[nodeIndex] = index
		lowLink[nodeIndex] = index
		index++
		stack = append(stack, nodeIndex)
		onStack[nodeIndex] = true
		*callStack = append(*callStack, frame{nodeIndex: nodeIndex, childIndex: 0})
	}

	for startIndex := range nodes {
		if indexByNode[startIndex] != -1 {
			continue
		}
		callStack := make([]frame, 0, 32)
		enter(startIndex, &callStack)

		for len(callStack) > 0 {
			currentFrame := &callStack[len(callStack)-1]
			nodeIndex := currentFrame.nodeIndex
			pushed := false

			for currentFrame.childIndex < len(outgoing[nodeIndex]) {
				nextNode := outgoing[nodeIndex][currentFrame.childIndex]
				currentFrame.childIndex++
				if indexByNode[nextNode] == -1 {
					enter(nextNode, &callStack)
					pushed = true
					break
				}
				if onStack[nextNode] && lowLink[nodeIndex] > indexByNode[nextNode] {
					lowLink[nodeIndex] = indexByNode[nextNode]
				}
			}
			if pushed {
				continue
			}

			callStack = callStack[:len(callStack)-1]
			if len(callStack) > 0 {
				parentIndex := callStack[len(callStack)-1].nodeIndex
				if lowLink[parentIndex] > lowLink[nodeIndex] {
					lowLink[parentIndex] = lowLink[nodeIndex]
				}
			}

			if lowLink[nodeIndex] == indexByNode[nodeIndex] {
				members := make([]int, 0)
				member := -1
				for member != nodeIndex {
					member = stack[len(stack)-1]
					stack = stack[:len(stack)-1]
					onStack[member] = false
					componentByNode[member] = len(components)
					members = append(members, member)
				}
				component := analyzedComponent{
					ID:       len(components),
					Members:  members,
					Size:     len(members),
					Incoming: make(map[int]struct{}),
					Outgoing: make(map[int]struct{}),
				}
				for _, memberIndex := range members {
					if _, exists := selfLoop[memberIndex]; exists {
						component.SelfLoop = true
						break
					}
				}
				components = append(components, component)
			}
		}
	}

	for nodeIndex := range nodes {
		nodes[nodeIndex].SCCID = componentByNode[nodeIndex]
		nodes[nodeIndex].SCCSize = components[componentByNode[nodeIndex]].Size
	}

	return components
}

func markHighImpactHotspots(nodes []analyzedNode) {
	sortedScores := make([]int, len(nodes))
	for i, node := range nodes {
		sortedScores[i] = node.TransitiveInDegree
	}
	sort.Ints(sortedScores)
	threshold := 0
	if len(sortedScores) > 0 {
		threshold = sortedScores[int(float64(len(sortedScores))*0.9)]
	}
	minimumScore := 1
	if threshold > 0 {
		minimumScore = threshold + 1
	}

	for i := range nodes {
		if !nodes[i].IsHotspot && nodes[i].TransitiveInDegree >= minimumScore {
			nodes[i].IsHotspot = true
			nodes[i].HotspotScore = nodes[i].TransitiveInDegree
		}
	}

	nextRank := 0
	for _, node := range nodes {
		if node.HotspotRank > nextRank {
			nextRank = node.HotspotRank
		}
	}
	nextRank++

	dagHotspots := make([]*analyzedNode, 0)
	for i := range nodes {
		if nodes[i].IsHotspot && nodes[i].HotspotRank == 0 {
			dagHotspots = append(dagHotspots, &nodes[i])
		}
	}
	sort.Slice(dagHotspots, func(i, j int) bool {
		left := dagHotspots[i]
		right := dagHotspots[j]
		if left.HotspotScore != right.HotspotScore {
			return left.HotspotScore > right.HotspotScore
		}
		if left.TransitiveInDegree != right.TransitiveInDegree {
			return left.TransitiveInDegree > right.TransitiveInDegree
		}
		return left.Label < right.Label
	})
	for _, node := range dagHotspots {
		node.HotspotRank = nextRank
		nextRank++
	}
}

type breakupMetrics struct {
	Pressure                 float64
	OpportunityScore         float64
	ImpactScore              float64
	MassScore                float64
	ShardabilityScore        float64
	DependencyPackageCount   int
	DependencyPackageEntropy float64
	StableSharedLeaf         bool
}

func breakupPressure(node analyzedNode) float64 {
	return math.Log2(float64(node.TransitiveInDegree)+1)*math.Max(1, float64(node.OutDegree)) +
		math.Log2(float64(node.InputFileCount)+1) +
		math.Log2(float64(node.OutputFileCount)+1) +
		math.Log2(float64(node.ActionCount)+1)
}

func byteSurfaceScore(bytes int64) float64 {
	if bytes <= 0 {
		return 0
	}
	return math.Log2(float64(bytes)/1024 + 1)
}

func packagePrefix(label string) string {
	if idx := strings.Index(label, ":"); idx >= 0 {
		return label[:idx]
	}
	return label
}

func dependencyPackageMetrics(outgoingLabels []string) (int, float64) {
	if len(outgoingLabels) == 0 {
		return 0, 0
	}
	counts := make(map[string]int)
	for _, label := range outgoingLabels {
		counts[packagePrefix(label)]++
	}
	total := 0
	for _, count := range counts {
		total += count
	}
	if total == 0 {
		return len(counts), 0
	}
	entropy := 0.0
	for _, count := range counts {
		p := float64(count) / float64(total)
		entropy -= p * math.Log2(p)
	}
	return len(counts), entropy
}

func breakupMetricsFor(node analyzedNode, outgoingLabels []string) breakupMetrics {
	packageCount, packageEntropy := dependencyPackageMetrics(outgoingLabels)
	impactScore := math.Log2(float64(node.TransitiveInDegree) + 1)
	massScore := 1 +
		0.20*math.Log2(float64(node.SourceFileCount)+1) +
		0.30*byteSurfaceScore(node.SourceBytes) +
		0.25*math.Log2(float64(node.InputFileCount)+1) +
		0.60*byteSurfaceScore(node.InputBytes) +
		0.25*math.Log2(float64(node.OutputFileCount)+1) +
		0.70*byteSurfaceScore(node.OutputBytes) +
		0.85*math.Log2(float64(node.ActionCount)+1)
	shardabilityScore := 1 +
		0.80*math.Log2(float64(node.OutDegree)+1) +
		0.75*math.Log2(float64(packageCount)+1) +
		0.60*packageEntropy
	stableSharedLeaf := node.TransitiveInDegree >= 20 &&
		node.OutDegree <= 2 &&
		packageCount <= 1 &&
		massScore <= 4.0 &&
		node.ActionCount <= 2 &&
		node.OutputBytes <= 256*1024
	opportunityScore := impactScore * massScore * shardabilityScore
	if stableSharedLeaf {
		opportunityScore *= 0.2
	}
	return breakupMetrics{
		Pressure:                 breakupPressure(node),
		OpportunityScore:         opportunityScore,
		ImpactScore:              impactScore,
		MassScore:                massScore,
		ShardabilityScore:        shardabilityScore,
		DependencyPackageCount:   packageCount,
		DependencyPackageEntropy: packageEntropy,
		StableSharedLeaf:         stableSharedLeaf,
	}
}

func breakupRecommendations(node analyzedNode, outgoingLabels []string, metrics breakupMetrics) []string {
	recommendations := make([]string, 0, 4)
	if metrics.StableSharedLeaf {
		recommendations = append(recommendations, "This target is widely reused but still looks light and structurally narrow. Stabilize its API and ownership before treating it as a breakup candidate.")
	}
	if node.OutDegree >= 8 {
		recommendations = append(recommendations, fmt.Sprintf("Reduce direct dependency fan-out. This target reaches %d direct deps and likely mixes multiple responsibilities.", node.OutDegree))
	}
	if metrics.DependencyPackageCount >= 3 {
		prefixSet := make(map[string]struct{})
		for _, label := range outgoingLabels {
			prefixSet[packagePrefix(label)] = struct{}{}
		}
		prefixes := make([]string, 0, len(prefixSet))
		for prefix := range prefixSet {
			prefixes = append(prefixes, prefix)
		}
		sort.Strings(prefixes)
		if len(prefixes) > 4 {
			prefixes = prefixes[:4]
		}
		recommendations = append(recommendations, fmt.Sprintf("Split by dependency domain. Direct deps already span multiple package groups: %s.", strings.Join(prefixes, ", ")))
	}
	if metrics.MassScore >= 6.0 && node.TransitiveInDegree >= 10 {
		recommendations = append(recommendations, "This target carries meaningful build mass. Prefer splits that peel off generators, large artifact producers, or heavy source bundles first.")
	}
	if node.TransitiveInDegree >= 50 && node.OutDegree >= 4 {
		recommendations = append(recommendations, "Keep the public target stable and peel behavior behind narrower internal targets or facades to avoid a large caller migration.")
	}
	if len(recommendations) == 0 {
		recommendations = append(recommendations, "Inspect its direct deps and dependents before splitting. The graph signal is moderate rather than decisive.")
	}
	return recommendations
}

func sampleOutgoingLabels(base *analysisBase, nodeIndex int, limit int) []string {
	labels := make([]string, 0, len(base.outgoing[nodeIndex]))
	for _, targetIndex := range base.outgoing[nodeIndex] {
		labels = append(labels, base.nodes[targetIndex].ID)
	}
	if limit > 0 && len(labels) > limit {
		return labels[:limit]
	}
	return labels
}

func sampleIncomingLabels(base *analysisBase, nodeIndex int, limit int) []string {
	labels := make([]string, 0, len(base.incoming[nodeIndex]))
	for _, sourceIndex := range base.incoming[nodeIndex] {
		labels = append(labels, base.nodes[sourceIndex].ID)
	}
	if limit > 0 && len(labels) > limit {
		return labels[:limit]
	}
	return labels
}

func sampleLabelsForIndexes(base *analysisBase, indexes []int, limit int) []string {
	labels := make([]string, 0, len(indexes))
	for _, idx := range indexes {
		labels = append(labels, base.nodes[idx].ID)
	}
	sort.Strings(labels)
	if limit > 0 && len(labels) > limit {
		return labels[:limit]
	}
	return labels
}

func scorePercentile(sortedScores []float64, value float64) int {
	if len(sortedScores) == 0 {
		return 0
	}
	count := sort.Search(len(sortedScores), func(i int) bool {
		return sortedScores[i] > value
	})
	if count == 0 {
		count = 1
	}
	percentile := int(math.Ceil(float64(count) * 100 / float64(len(sortedScores))))
	if percentile < 1 {
		return 1
	}
	return percentile
}

func percentileBand(percentile int, lowLabel, mediumLabel, highLabel string) string {
	switch {
	case percentile >= 70:
		return highLabel
	case percentile >= 35:
		return mediumLabel
	default:
		return lowLabel
	}
}

func collectRuleMetricScores(base *analysisBase) ([]float64, []float64, []float64) {
	impactScores := make([]float64, 0, base.ruleTargetCount)
	massScores := make([]float64, 0, base.ruleTargetCount)
	shardabilityScores := make([]float64, 0, base.ruleTargetCount)
	for nodeIndex, node := range base.nodes {
		if !isRuleNode(node) {
			continue
		}
		metrics := breakupMetricsFor(node, sampleOutgoingLabels(base, nodeIndex, 0))
		impactScores = append(impactScores, metrics.ImpactScore)
		massScores = append(massScores, metrics.MassScore)
		shardabilityScores = append(shardabilityScores, metrics.ShardabilityScore)
	}
	sort.Float64s(impactScores)
	sort.Float64s(massScores)
	sort.Float64s(shardabilityScores)
	return impactScores, massScores, shardabilityScores
}

func summarizeImpact(node analyzedNode) string {
	switch {
	case node.TransitiveInDegree <= 0:
		return "No downstream dependents in this graph."
	case node.TransitiveInDegree == 1:
		return "1 downstream dependent in this graph."
	default:
		return fmt.Sprintf("%d downstream dependents in this graph.", node.TransitiveInDegree)
	}
}

func summarizeMass(node analyzedNode) string {
	switch {
	case node.InputFileCount > 0 && node.OutputFileCount == 0 && node.ActionCount == 0:
		return fmt.Sprintf("%d direct inputs; no outputs or actions recorded.", node.InputFileCount)
	case node.OutputFileCount > 0 && node.ActionCount > 0:
		return fmt.Sprintf("%d outputs and %d actions dominate the build surface.", node.OutputFileCount, node.ActionCount)
	case node.ActionCount > 0 && node.InputFileCount > 0:
		return fmt.Sprintf("%d actions and %d direct inputs contribute most.", node.ActionCount, node.InputFileCount)
	case node.InputFileCount > 0:
		return fmt.Sprintf("%d direct inputs dominate the recorded build surface.", node.InputFileCount)
	case node.SourceFileCount > 0:
		return fmt.Sprintf("%d source files dominate the recorded build surface.", node.SourceFileCount)
	case node.OutputFileCount > 0:
		return fmt.Sprintf("%d outputs dominate the recorded build surface.", node.OutputFileCount)
	case node.ActionCount > 0:
		return fmt.Sprintf("%d actions dominate the recorded build surface.", node.ActionCount)
	default:
		return "No direct file, output, or action weight was recorded."
	}
}

func summarizeSplitFit(communityCount int, crossCommunityEdgeRatio float64, largestCommunityShare float64) string {
	switch {
	case communityCount <= 1:
		return "Direct rule deps collapse into one dependency domain."
	case crossCommunityEdgeRatio <= 0.15 && largestCommunityShare <= 0.65:
		return fmt.Sprintf("%d dependency groups with low coupling (%d%% cross-group edges).", communityCount, int(math.Round(crossCommunityEdgeRatio*100)))
	case crossCommunityEdgeRatio <= 0.35:
		return fmt.Sprintf("%d dependency groups, but some coupling remains (%d%% cross-group edges).", communityCount, int(math.Round(crossCommunityEdgeRatio*100)))
	default:
		return fmt.Sprintf("%d dependency groups, but %d%% of local edges still cross between them.", communityCount, int(math.Round(crossCommunityEdgeRatio*100)))
	}
}

func splitFitBand(communityCount int, crossCommunityEdgeRatio float64, largestCommunityShare float64) string {
	switch {
	case communityCount <= 1:
		return "Weak"
	case crossCommunityEdgeRatio <= 0.15 && largestCommunityShare <= 0.65:
		return "Good"
	case crossCommunityEdgeRatio <= 0.35:
		return "Mixed"
	default:
		return "Weak"
	}
}

func decompositionVerdict(impactBand, massBand, splitBand string, eligible bool) string {
	if !eligible {
		return "Not enough structure for split guidance yet."
	}
	switch {
	case splitBand == "Good" && (impactBand == "High" || massBand == "Heavy"):
		return "Strong split candidate"
	case splitBand == "Good":
		return "Good structural split candidate"
	case splitBand == "Mixed" && (impactBand == "High" || massBand == "Heavy"):
		return "Worth splitting, but expect prep work"
	case splitBand == "Mixed":
		return "Moderate split candidate"
	case impactBand == "High" || massBand == "Heavy":
		return "Important target, but seams are still unclear"
	default:
		return "Weak split candidate"
	}
}

func (base *analysisBase) decomposition(target string) (targetDecompositionResponse, error) {
	nodeIndex, ok := base.idIndex[target]
	if !ok {
		return targetDecompositionResponse{}, fmt.Errorf("target not found: %s", target)
	}
	node := base.nodes[nodeIndex]
	metrics := breakupMetricsFor(node, sampleOutgoingLabels(base, nodeIndex, 0))
	impactScores, massScores, shardabilityScores := collectRuleMetricScores(base)
	impactPercentile := scorePercentile(impactScores, metrics.ImpactScore)
	massPercentile := scorePercentile(massScores, metrics.MassScore)
	shardabilityPercentile := scorePercentile(shardabilityScores, metrics.ShardabilityScore)
	impactBand := percentileBand(impactPercentile, "Low", "Moderate", "High")
	massBand := percentileBand(massPercentile, "Light", "Medium", "Heavy")
	response := targetDecompositionResponse{
		Target:            node.ID,
		Label:             node.Label,
		NodeType:          node.NodeType,
		ImpactScore:       metrics.ImpactScore,
		MassScore:         metrics.MassScore,
		ShardabilityScore: metrics.ShardabilityScore,
		Impact: decompositionMetricInsight{
			Score:      metrics.ImpactScore,
			Percentile: impactPercentile,
			Band:       impactBand,
			Reason:     summarizeImpact(node),
		},
		Mass: decompositionMetricInsight{
			Score:      metrics.MassScore,
			Percentile: massPercentile,
			Band:       massBand,
			Reason:     summarizeMass(node),
		},
		SplitFit: decompositionMetricInsight{
			Score:      metrics.ShardabilityScore,
			Percentile: shardabilityPercentile,
			Band:       percentileBand(shardabilityPercentile, "Low", "Moderate", "High"),
			Reason:     "Not enough dependency structure to judge split fit yet.",
		},
		DirectDependencyCount:     node.OutDegree,
		DirectRuleDependencyCount: 0,
		CommunityCount:            0,
		Eligible:                  false,
	}
	if !isRuleNode(node) {
		response.Reason = "Decomposition is only available for rule targets."
		response.Verdict = decompositionVerdict(impactBand, massBand, response.SplitFit.Band, response.Eligible)
		return response, nil
	}

	directRuleDeps := make([]int, 0, len(base.outgoing[nodeIndex]))
	directRuleSet := make(map[int]struct{}, len(base.outgoing[nodeIndex]))
	for _, depIndex := range base.outgoing[nodeIndex] {
		if !isRuleNode(base.nodes[depIndex]) {
			continue
		}
		if _, exists := directRuleSet[depIndex]; exists {
			continue
		}
		directRuleSet[depIndex] = struct{}{}
		directRuleDeps = append(directRuleDeps, depIndex)
	}
	response.DirectRuleDependencyCount = len(directRuleDeps)
	if len(directRuleDeps) < 2 {
		response.Reason = "This target does not fan out into enough direct rule dependencies to suggest shard boundaries."
		response.Recommendations = []string{"Use the build-surface panels below to inspect heavy inputs, outputs, or actions before proposing a split."}
		response.Verdict = decompositionVerdict(impactBand, massBand, response.SplitFit.Band, response.Eligible)
		return response, nil
	}

	type communityAccumulator struct {
		key         string
		title       string
		deps        []int
		internal    int
		cross       int
		sourceBytes int64
		inputBytes  int64
		outputBytes int64
		actions     int
	}

	groupByNode := make(map[int]string, len(directRuleDeps))
	groups := make(map[string]*communityAccumulator)
	for _, depIndex := range directRuleDeps {
		groupKey := packagePrefix(base.nodes[depIndex].ID)
		groupByNode[depIndex] = groupKey
		group := groups[groupKey]
		if group == nil {
			group = &communityAccumulator{
				key:   groupKey,
				title: groupKey,
			}
			groups[groupKey] = group
		}
		group.deps = append(group.deps, depIndex)
		group.sourceBytes += base.nodes[depIndex].SourceBytes
		group.inputBytes += base.nodes[depIndex].InputBytes
		group.outputBytes += base.nodes[depIndex].OutputBytes
		group.actions += base.nodes[depIndex].ActionCount
	}

	totalLocalEdges := 0
	crossEdges := 0
	for _, depIndex := range directRuleDeps {
		depGroup := groups[groupByNode[depIndex]]
		for _, nextIndex := range base.outgoing[depIndex] {
			if _, exists := directRuleSet[nextIndex]; !exists {
				continue
			}
			totalLocalEdges++
			nextGroupKey := groupByNode[nextIndex]
			if depGroup.key == nextGroupKey {
				depGroup.internal++
				continue
			}
			depGroup.cross++
			groups[nextGroupKey].cross++
			crossEdges++
		}
	}

	communities := make([]decompositionCommunity, 0, len(groups))
	largestCommunityShare := 0.0
	for _, group := range groups {
		share := float64(len(group.deps)) / float64(len(directRuleDeps))
		if share > largestCommunityShare {
			largestCommunityShare = share
		}
		communities = append(communities, decompositionCommunity{
			ID:                      group.key,
			Title:                   group.title,
			PackageName:             group.key,
			NodeCount:               len(group.deps),
			Share:                   share,
			InternalEdgeCount:       group.internal,
			CrossCommunityEdgeCount: group.cross,
			SourceBytes:             group.sourceBytes,
			InputBytes:              group.inputBytes,
			OutputBytes:             group.outputBytes,
			ActionCount:             group.actions,
			SampleLabels:            sampleLabelsForIndexes(base, group.deps, 4),
		})
	}
	sort.Slice(communities, func(i, j int) bool {
		left := communities[i]
		right := communities[j]
		if left.NodeCount != right.NodeCount {
			return left.NodeCount > right.NodeCount
		}
		leftMass := left.SourceBytes + left.InputBytes + left.OutputBytes + int64(left.ActionCount)*1024
		rightMass := right.SourceBytes + right.InputBytes + right.OutputBytes + int64(right.ActionCount)*1024
		if leftMass != rightMass {
			return leftMass > rightMass
		}
		return left.Title < right.Title
	})

	crossCommunityEdgeRatio := 0.0
	if totalLocalEdges > 0 {
		crossCommunityEdgeRatio = float64(crossEdges) / float64(totalLocalEdges)
	}

	recommendations := make([]string, 0, 4)
	switch {
	case len(communities) == 1:
		recommendations = append(recommendations, "Direct rule deps mostly collapse into one dependency domain. Split by interface or artifact boundary rather than package alone.")
	case crossCommunityEdgeRatio <= 0.15:
		recommendations = append(recommendations, "Direct rule deps already separate into low-coupling dependency domains. Those domains are the cleanest shard candidates.")
	case crossCommunityEdgeRatio <= 0.35:
		recommendations = append(recommendations, "There are plausible dependency-domain seams here, but expect some API cleanup across groups before splitting the public target.")
	default:
		recommendations = append(recommendations, "Direct rule deps are still coupled across dependency domains. Introduce facades or narrower contracts before splitting this target.")
	}
	if largestCommunityShare >= 0.65 {
		recommendations = append(recommendations, "One dependency domain dominates the target. Keep the public surface stable and peel smaller groups away first.")
	}
	if metrics.MassScore >= 6.0 {
		recommendations = append(recommendations, "Start with the heaviest domain or artifact-producing slice first to reduce rebuild cost fastest.")
	}
	if response.DirectRuleDependencyCount < response.DirectDependencyCount {
		recommendations = append(recommendations, "Some direct deps are files or non-rule nodes. Use the build-surface panels below to validate file-level drivers before finalizing the split.")
	}

	response.SplitFit = decompositionMetricInsight{
		Score:      metrics.ShardabilityScore,
		Percentile: shardabilityPercentile,
		Band:       splitFitBand(len(communities), crossCommunityEdgeRatio, largestCommunityShare),
		Reason:     summarizeSplitFit(len(communities), crossCommunityEdgeRatio, largestCommunityShare),
	}
	response.Eligible = true
	response.Method = "package-domain partition over direct rule dependencies"
	response.Verdict = decompositionVerdict(impactBand, massBand, response.SplitFit.Band, response.Eligible)
	response.CommunityCount = len(communities)
	response.LargestCommunityShare = largestCommunityShare
	response.CrossCommunityEdgeRatio = crossCommunityEdgeRatio
	response.Communities = communities
	response.Recommendations = recommendations
	return response, nil
}

func clampAnalysisLimit(limit int) int {
	if limit <= 0 {
		return defaultAnalysisLimit
	}
	if limit > maxAnalysisLimit {
		return maxAnalysisLimit
	}
	return limit
}

func (base *analysisBase) response(limit int, focus string) (analysisResponse, error) {
	limit = clampAnalysisLimit(limit)

	impactNodes := make([]analyzedNode, 0, len(base.nodes))
	breakupNodes := make([]analyzedNode, 0, len(base.nodes))
	sourceHeavyNodes := make([]analyzedNode, 0, len(base.nodes))
	outputHeavyNodes := make([]analyzedNode, 0, len(base.nodes))
	for _, node := range base.nodes {
		if !isRuleNode(node) {
			continue
		}
		if node.TransitiveInDegree > 0 {
			impactNodes = append(impactNodes, node)
		}
		if node.TransitiveInDegree > 0 && node.OutDegree > 0 {
			breakupNodes = append(breakupNodes, node)
		}
		if node.SourceBytes > 0 || node.SourceFileCount > 0 {
			sourceHeavyNodes = append(sourceHeavyNodes, node)
		}
		if node.OutputBytes > 0 || node.OutputFileCount > 0 || node.ActionCount > 0 {
			outputHeavyNodes = append(outputHeavyNodes, node)
		}
	}
	sort.Slice(impactNodes, func(i, j int) bool {
		left := impactNodes[i]
		right := impactNodes[j]
		if left.TransitiveInDegree != right.TransitiveInDegree {
			return left.TransitiveInDegree > right.TransitiveInDegree
		}
		if left.OutDegree != right.OutDegree {
			return left.OutDegree > right.OutDegree
		}
		return left.Label < right.Label
	})
	sort.Slice(breakupNodes, func(i, j int) bool {
		left := breakupNodes[i]
		right := breakupNodes[j]
		leftMetrics := breakupMetricsFor(left, sampleOutgoingLabels(base, base.idIndex[left.ID], 0))
		rightMetrics := breakupMetricsFor(right, sampleOutgoingLabels(base, base.idIndex[right.ID], 0))
		if leftMetrics.OpportunityScore != rightMetrics.OpportunityScore {
			return leftMetrics.OpportunityScore > rightMetrics.OpportunityScore
		}
		if leftMetrics.Pressure != rightMetrics.Pressure {
			return leftMetrics.Pressure > rightMetrics.Pressure
		}
		if left.TransitiveInDegree != right.TransitiveInDegree {
			return left.TransitiveInDegree > right.TransitiveInDegree
		}
		if left.OutDegree != right.OutDegree {
			return left.OutDegree > right.OutDegree
		}
		return left.Label < right.Label
	})
	sort.Slice(sourceHeavyNodes, func(i, j int) bool {
		left := sourceHeavyNodes[i]
		right := sourceHeavyNodes[j]
		if left.SourceBytes != right.SourceBytes {
			return left.SourceBytes > right.SourceBytes
		}
		if left.SourceFileCount != right.SourceFileCount {
			return left.SourceFileCount > right.SourceFileCount
		}
		if left.InputBytes != right.InputBytes {
			return left.InputBytes > right.InputBytes
		}
		return left.Label < right.Label
	})
	sort.Slice(outputHeavyNodes, func(i, j int) bool {
		left := outputHeavyNodes[i]
		right := outputHeavyNodes[j]
		if left.OutputBytes != right.OutputBytes {
			return left.OutputBytes > right.OutputBytes
		}
		if left.OutputFileCount != right.OutputFileCount {
			return left.OutputFileCount > right.OutputFileCount
		}
		if left.ActionCount != right.ActionCount {
			return left.ActionCount > right.ActionCount
		}
		return left.Label < right.Label
	})

	response := analysisResponse{
		SchemaVersion:         base.schemaVersion,
		AnalysisMode:          base.analysisMode,
		Target:                base.target,
		DetailsPath:           base.detailsPath,
		NodeCount:             len(base.nodes),
		EdgeCount:             len(base.edges),
		RuleTargetCount:       base.ruleTargetCount,
		HotspotCount:          base.hotspotCount,
		LargestHotspotSize:    base.largestHotspotSize,
		TopImpactTargets:      make([]impactTarget, 0, min(limit, len(impactNodes))),
		TopBreakupCandidates:  make([]breakupCandidate, 0, min(limit, len(breakupNodes))),
		TopSourceHeavyTargets: make([]sourceHeavyTarget, 0, min(limit, len(sourceHeavyNodes))),
		TopOutputHeavyTargets: make([]outputHeavyTarget, 0, min(limit, len(outputHeavyNodes))),
		CyclicHotspots:        make([]cyclicHotspot, 0),
	}

	for _, node := range impactNodes[:min(limit, len(impactNodes))] {
		response.TopImpactTargets = append(response.TopImpactTargets, impactTarget{
			ID:                   node.ID,
			Label:                node.Label,
			TransitiveInDegree:   node.TransitiveInDegree,
			OutDegree:            node.OutDegree,
			TransitiveOutDegree:  node.TransitiveOutDegree,
			SCCSize:              node.SCCSize,
			HotspotRank:          node.HotspotRank,
			IsHotspot:            node.IsHotspot,
			targetSurfaceSummary: surfaceSummary(node),
		})
	}

	for _, node := range breakupNodes[:min(limit, len(breakupNodes))] {
		nodeIndex := base.idIndex[node.ID]
		outgoingLabels := sampleOutgoingLabels(base, nodeIndex, 0)
		directSample := outgoingLabels
		if len(directSample) > 5 {
			directSample = directSample[:5]
		}
		metrics := breakupMetricsFor(node, outgoingLabels)
		response.TopBreakupCandidates = append(response.TopBreakupCandidates, breakupCandidate{
			ID:                       node.ID,
			Label:                    node.Label,
			Pressure:                 metrics.Pressure,
			OpportunityScore:         metrics.OpportunityScore,
			ImpactScore:              metrics.ImpactScore,
			MassScore:                metrics.MassScore,
			ShardabilityScore:        metrics.ShardabilityScore,
			TransitiveInDegree:       node.TransitiveInDegree,
			OutDegree:                node.OutDegree,
			TransitiveOutDegree:      node.TransitiveOutDegree,
			SCCSize:                  node.SCCSize,
			DependencyPackageCount:   metrics.DependencyPackageCount,
			DependencyPackageEntropy: metrics.DependencyPackageEntropy,
			StableSharedLeaf:         metrics.StableSharedLeaf,
			DirectDependencySample:   directSample,
			Recommendations:          breakupRecommendations(node, outgoingLabels, metrics),
			targetSurfaceSummary:     surfaceSummary(node),
		})
	}

	for _, node := range sourceHeavyNodes[:min(limit, len(sourceHeavyNodes))] {
		response.TopSourceHeavyTargets = append(response.TopSourceHeavyTargets, sourceHeavyTarget{
			ID:                   node.ID,
			Label:                node.Label,
			targetSurfaceSummary: surfaceSummary(node),
		})
	}

	for _, node := range outputHeavyNodes[:min(limit, len(outputHeavyNodes))] {
		response.TopOutputHeavyTargets = append(response.TopOutputHeavyTargets, outputHeavyTarget{
			ID:                   node.ID,
			Label:                node.Label,
			targetSurfaceSummary: surfaceSummary(node),
		})
	}

	components := make([]analyzedComponent, 0, len(base.components))
	for _, component := range base.components {
		if component.Size > 1 || component.SelfLoop {
			components = append(components, component)
		}
	}
	sort.Slice(components, func(i, j int) bool {
		left := components[i]
		right := components[j]
		if left.HotspotScore != right.HotspotScore {
			return left.HotspotScore > right.HotspotScore
		}
		if left.Size != right.Size {
			return left.Size > right.Size
		}
		return left.ID < right.ID
	})
	for _, component := range components[:min(limit, len(components))] {
		memberLabels := make([]string, 0, len(component.Members))
		for _, memberIndex := range component.Members {
			memberLabels = append(memberLabels, base.nodes[memberIndex].ID)
		}
		sort.Strings(memberLabels)
		if len(memberLabels) > 10 {
			memberLabels = memberLabels[:10]
		}
		response.CyclicHotspots = append(response.CyclicHotspots, cyclicHotspot{
			ComponentID:  component.ID,
			Size:         component.Size,
			HotspotScore: component.HotspotScore,
			Members:      memberLabels,
		})
	}

	if focus != "" {
		nodeIndex, ok := base.idIndex[focus]
		if !ok {
			return analysisResponse{}, fmt.Errorf("focus target not found: %s", focus)
		}
		node := base.nodes[nodeIndex]
		outgoingLabels := sampleOutgoingLabels(base, nodeIndex, 0)
		metrics := breakupMetricsFor(node, outgoingLabels)
		response.Focus = &focusTarget{
			ID:                       node.ID,
			Label:                    node.Label,
			InDegree:                 node.InDegree,
			OutDegree:                node.OutDegree,
			TransitiveInDegree:       node.TransitiveInDegree,
			TransitiveOutDegree:      node.TransitiveOutDegree,
			SCCSize:                  node.SCCSize,
			HotspotRank:              node.HotspotRank,
			IsHotspot:                node.IsHotspot,
			Pressure:                 metrics.Pressure,
			OpportunityScore:         metrics.OpportunityScore,
			ImpactScore:              metrics.ImpactScore,
			MassScore:                metrics.MassScore,
			ShardabilityScore:        metrics.ShardabilityScore,
			DependencyPackageCount:   metrics.DependencyPackageCount,
			DependencyPackageEntropy: metrics.DependencyPackageEntropy,
			StableSharedLeaf:         metrics.StableSharedLeaf,
			DirectDependencies:       outgoingLabels,
			DirectDependents:         sampleIncomingLabels(base, nodeIndex, 0),
			targetSurfaceSummary:     surfaceSummary(node),
		}
	}

	return response, nil
}

func parseAnalysisLimit(r *http.Request) (int, error) {
	topValue := strings.TrimSpace(r.URL.Query().Get("top"))
	if topValue == "" {
		return defaultAnalysisLimit, nil
	}
	limit, err := strconv.Atoi(topValue)
	if err != nil {
		return 0, fmt.Errorf("invalid top value %q", topValue)
	}
	if limit <= 0 {
		return 0, fmt.Errorf("top must be greater than zero")
	}
	return clampAnalysisLimit(limit), nil
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func analysisError(message string) map[string]string {
	return map[string]string{"error": message}
}
