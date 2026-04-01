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
	ID                     string   `json:"id"`
	Label                  string   `json:"label"`
	Pressure               float64  `json:"pressure"`
	TransitiveInDegree     int      `json:"transitiveInDegree"`
	OutDegree              int      `json:"outDegree"`
	TransitiveOutDegree    int      `json:"transitiveOutDegree"`
	SCCSize                int      `json:"sccSize"`
	DirectDependencySample []string `json:"directDependencySample,omitempty"`
	Recommendations        []string `json:"recommendations,omitempty"`
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
	ID                  string   `json:"id"`
	Label               string   `json:"label"`
	InDegree            int      `json:"inDegree"`
	OutDegree           int      `json:"outDegree"`
	TransitiveInDegree  int      `json:"transitiveInDegree"`
	TransitiveOutDegree int      `json:"transitiveOutDegree"`
	SCCSize             int      `json:"sccSize"`
	HotspotRank         int      `json:"hotspotRank"`
	IsHotspot           bool     `json:"isHotspot"`
	Pressure            float64  `json:"pressure"`
	DirectDependencies  []string `json:"directDependencies,omitempty"`
	DirectDependents    []string `json:"directDependents,omitempty"`
	targetSurfaceSummary
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

func breakupPressure(node analyzedNode) float64 {
	return math.Log2(float64(node.TransitiveInDegree)+1)*math.Max(1, float64(node.OutDegree)) +
		math.Log2(float64(node.InputFileCount)+1) +
		math.Log2(float64(node.OutputFileCount)+1) +
		math.Log2(float64(node.ActionCount)+1)
}

func packagePrefix(label string) string {
	if idx := strings.Index(label, ":"); idx >= 0 {
		return label[:idx]
	}
	return label
}

func breakupRecommendations(node analyzedNode, outgoingLabels []string) []string {
	recommendations := make([]string, 0, 4)
	if node.SCCSize > 1 {
		recommendations = append(recommendations, "Break the cycle before finer cleanup. Introduce a one-way boundary, shared contract target, or interface between SCC members.")
	}
	if node.TransitiveInDegree >= 20 && node.OutDegree <= 2 {
		recommendations = append(recommendations, "This target is central but structurally narrow. Prefer stabilization and tighter API ownership before splitting it.")
	}
	if node.OutDegree >= 8 {
		recommendations = append(recommendations, fmt.Sprintf("Reduce direct dependency fan-out. This target reaches %d direct deps and likely mixes multiple responsibilities.", node.OutDegree))
	}
	prefixSet := make(map[string]struct{})
	for _, label := range outgoingLabels {
		prefixSet[packagePrefix(label)] = struct{}{}
	}
	if len(prefixSet) >= 3 {
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
		leftPressure := breakupPressure(left)
		rightPressure := breakupPressure(right)
		if leftPressure != rightPressure {
			return leftPressure > rightPressure
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
		response.TopBreakupCandidates = append(response.TopBreakupCandidates, breakupCandidate{
			ID:                     node.ID,
			Label:                  node.Label,
			Pressure:               breakupPressure(node),
			TransitiveInDegree:     node.TransitiveInDegree,
			OutDegree:              node.OutDegree,
			TransitiveOutDegree:    node.TransitiveOutDegree,
			SCCSize:                node.SCCSize,
			DirectDependencySample: directSample,
			Recommendations:        breakupRecommendations(node, outgoingLabels),
			targetSurfaceSummary:   surfaceSummary(node),
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
		response.Focus = &focusTarget{
			ID:                   node.ID,
			Label:                node.Label,
			InDegree:             node.InDegree,
			OutDegree:            node.OutDegree,
			TransitiveInDegree:   node.TransitiveInDegree,
			TransitiveOutDegree:  node.TransitiveOutDegree,
			SCCSize:              node.SCCSize,
			HotspotRank:          node.HotspotRank,
			IsHotspot:            node.IsHotspot,
			Pressure:             breakupPressure(node),
			DirectDependencies:   sampleOutgoingLabels(base, nodeIndex, 0),
			DirectDependents:     sampleIncomingLabels(base, nodeIndex, 0),
			targetSurfaceSummary: surfaceSummary(node),
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
