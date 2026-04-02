package main

import (
	"fmt"
	"sort"
	"strings"
)

var workspaceQueryOutput = bazelCombinedOutput

type workspaceAnalysisContext struct {
	Workdir    string
	RootTarget string
}

type fileFocusConsumer struct {
	ID                string  `json:"id"`
	Label             string  `json:"label"`
	Direct            bool    `json:"direct"`
	OpportunityScore  float64 `json:"opportunityScore"`
	ImpactScore       float64 `json:"impactScore"`
	MassScore         float64 `json:"massScore"`
	ShardabilityScore float64 `json:"shardabilityScore"`
	StableSharedLeaf  bool    `json:"stableSharedLeaf,omitempty"`
}

type fileFocusResponse struct {
	Label                               string              `json:"label"`
	NodeType                            string              `json:"nodeType,omitempty"`
	RootTarget                          string              `json:"rootTarget,omitempty"`
	CurrentGraphDirectConsumerCount     int                 `json:"currentGraphDirectConsumerCount"`
	CurrentGraphDirectConsumers         []string            `json:"currentGraphDirectConsumers,omitempty"`
	CurrentGraphTransitiveConsumerCount int                 `json:"currentGraphTransitiveConsumerCount"`
	TopCurrentGraphConsumers            []fileFocusConsumer `json:"topCurrentGraphConsumers,omitempty"`
	WorkspaceReverseDependencyCount     int                 `json:"workspaceReverseDependencyCount,omitempty"`
	WorkspaceReverseDependencySample    []string            `json:"workspaceReverseDependencySample,omitempty"`
	WorkspaceReverseDependencyError     string              `json:"workspaceReverseDependencyError,omitempty"`
	LiveQueryAvailable                  bool                `json:"liveQueryAvailable"`
}

func loadWorkspaceReverseDependencies(workdir, label string) ([]string, error) {
	out, err := workspaceQueryOutput(
		workdir,
		"query",
		fmt.Sprintf("rdeps(//..., %s)", label),
		"--noimplicit_deps",
		"--keep_going",
	)
	if err != nil {
		return nil, fmt.Errorf("bazel query rdeps for %s: %w", label, err)
	}

	seen := make(map[string]struct{})
	labels := make([]string, 0)
	for _, raw := range strings.Split(string(out), "\n") {
		label := strings.TrimSpace(raw)
		if label == "" || !isValidGraphID(label) {
			continue
		}
		if _, ok := seen[label]; ok {
			continue
		}
		seen[label] = struct{}{}
		labels = append(labels, label)
	}
	sort.Strings(labels)
	return labels, nil
}

func (base *analysisBase) fileFocus(label string, live *workspaceAnalysisContext) (fileFocusResponse, error) {
	nodeIndex, ok := base.idIndex[label]
	if !ok {
		return fileFocusResponse{}, fmt.Errorf("file label not found in graph: %s", label)
	}
	node := base.nodes[nodeIndex]
	if node.NodeType != "source-file" && node.NodeType != "generated-file" {
		return fileFocusResponse{}, fmt.Errorf("label is not a file node: %s", label)
	}

	directConsumers := make([]string, 0)
	directConsumerSet := make(map[int]struct{})
	for _, sourceIndex := range base.incoming[nodeIndex] {
		sourceNode := base.nodes[sourceIndex]
		if !isRuleNode(sourceNode) {
			continue
		}
		directConsumerSet[sourceIndex] = struct{}{}
		directConsumers = append(directConsumers, sourceNode.ID)
	}
	sort.Strings(directConsumers)

	transitiveIndexes := bfsReachability(base.incoming[nodeIndex], base.incoming)
	consumerEntries := make([]fileFocusConsumer, 0, len(transitiveIndexes))
	for consumerIndex := range transitiveIndexes {
		consumerNode := base.nodes[consumerIndex]
		if !isRuleNode(consumerNode) {
			continue
		}
		metrics := breakupMetricsFor(consumerNode, sampleOutgoingLabels(base, consumerIndex, 0))
		_, direct := directConsumerSet[consumerIndex]
		consumerEntries = append(consumerEntries, fileFocusConsumer{
			ID:                consumerNode.ID,
			Label:             consumerNode.Label,
			Direct:            direct,
			OpportunityScore:  metrics.OpportunityScore,
			ImpactScore:       metrics.ImpactScore,
			MassScore:         metrics.MassScore,
			ShardabilityScore: metrics.ShardabilityScore,
			StableSharedLeaf:  metrics.StableSharedLeaf,
		})
	}
	sort.Slice(consumerEntries, func(i, j int) bool {
		left := consumerEntries[i]
		right := consumerEntries[j]
		if left.OpportunityScore != right.OpportunityScore {
			return left.OpportunityScore > right.OpportunityScore
		}
		if left.Direct != right.Direct {
			return left.Direct
		}
		return left.ID < right.ID
	})
	transitiveConsumerCount := len(consumerEntries)
	if len(consumerEntries) > 10 {
		consumerEntries = consumerEntries[:10]
	}

	rootTarget := base.target
	if live != nil && live.RootTarget != "" {
		rootTarget = live.RootTarget
	}
	response := fileFocusResponse{
		Label:                               label,
		NodeType:                            node.NodeType,
		RootTarget:                          rootTarget,
		CurrentGraphDirectConsumerCount:     len(directConsumers),
		CurrentGraphDirectConsumers:         directConsumers,
		CurrentGraphTransitiveConsumerCount: transitiveConsumerCount,
		TopCurrentGraphConsumers:            consumerEntries,
		LiveQueryAvailable:                  live != nil && strings.TrimSpace(live.Workdir) != "",
	}

	if !response.LiveQueryAvailable {
		return response, nil
	}

	reverseDeps, err := loadWorkspaceReverseDependencies(live.Workdir, label)
	if err != nil {
		response.WorkspaceReverseDependencyError = err.Error()
		return response, nil
	}
	filtered := make([]string, 0, len(reverseDeps))
	for _, dep := range reverseDeps {
		if dep == label {
			continue
		}
		filtered = append(filtered, dep)
	}
	response.WorkspaceReverseDependencyCount = len(filtered)
	if len(filtered) > 25 {
		response.WorkspaceReverseDependencySample = append([]string(nil), filtered[:25]...)
	} else {
		response.WorkspaceReverseDependencySample = filtered
	}
	return response, nil
}
