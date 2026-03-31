#!/usr/bin/env python3
"""Analyze BuildScope graph JSON for impact targets and breakup candidates."""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.request
from collections import deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Node:
    id: str
    label: str
    in_degree: int = 0
    out_degree: int = 0
    transitive_in_degree: int = 0
    transitive_out_degree: int = 0
    scc_id: int = -1
    scc_size: int = 1
    hotspot_score: int = 0
    hotspot_rank: int = 0
    is_hotspot: bool = False


@dataclass
class Component:
    id: int
    members: list[int]
    size: int
    self_loop: bool
    incoming: set[int] = field(default_factory=set)
    outgoing: set[int] = field(default_factory=set)
    hotspot_score: int = 0
    hotspot_rank: int = 0
    is_hotspot: bool = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", help="Path to graph.json")
    source.add_argument("--url", help="URL for BuildScope /graph.json")
    parser.add_argument("--top", type=int, default=10, help="Number of entries to show per ranking")
    parser.add_argument("--focus", help="Target label to inspect in detail")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    parser.add_argument("--timeout", type=float, default=10.0, help="HTTP timeout in seconds for --url")
    return parser.parse_args()


def load_graph(args: argparse.Namespace) -> dict[str, Any]:
    if args.file:
        with open(args.file, "r", encoding="utf-8") as fh:
            return json.load(fh)

    req = urllib.request.Request(args.url, headers={"User-Agent": "buildscope-choke-points/1"})
    with urllib.request.urlopen(req, timeout=args.timeout) as resp:
        return json.load(resp)


def is_valid_id(value: str) -> bool:
    return bool(
        value
        and " " not in value
        and "[" not in value
        and "]" not in value
        and (value.startswith("//") or value.startswith("@"))
    )


def sanitize_graph(raw: dict[str, Any]) -> tuple[list[Node], list[tuple[int, int]], dict[str, int]]:
    node_map: dict[str, Node] = {}
    for entry in raw.get("nodes", []):
        node_id = entry.get("id", "")
        if is_valid_id(node_id):
            node_map[node_id] = Node(id=node_id, label=entry.get("label") or node_id)

    id_to_index = {node_id: index for index, node_id in enumerate(node_map)}
    nodes = [node_map[node_id] for node_id in node_map]
    edges: list[tuple[int, int]] = []
    seen_edges: set[tuple[int, int]] = set()

    for entry in raw.get("edges", []):
        source = entry.get("source", "")
        target = entry.get("target", "")
        if not is_valid_id(source) or not is_valid_id(target):
            continue
        if source not in id_to_index or target not in id_to_index:
            continue
        edge = (id_to_index[source], id_to_index[target])
        if edge not in seen_edges:
            seen_edges.add(edge)
            edges.append(edge)

    return nodes, edges, id_to_index


def build_adjacency(node_count: int, edges: list[tuple[int, int]]) -> tuple[list[list[int]], list[list[int]]]:
    outgoing = [[] for _ in range(node_count)]
    incoming = [[] for _ in range(node_count)]
    for source, target in edges:
        outgoing[source].append(target)
        incoming[target].append(source)
    return outgoing, incoming


def compute_degrees(nodes: list[Node], edges: list[tuple[int, int]]) -> None:
    for source, target in edges:
        nodes[source].out_degree += 1
        nodes[target].in_degree += 1


def bfs_reachability(start_nodes: list[int], adjacency: list[list[int]]) -> set[int]:
    visited: set[int] = set()
    queue: deque[int] = deque()
    for node_index in start_nodes:
        if node_index not in visited:
            visited.add(node_index)
            queue.append(node_index)

    while queue:
        current = queue.popleft()
        for next_node in adjacency[current]:
            if next_node not in visited:
                visited.add(next_node)
                queue.append(next_node)
    return visited


def compute_transitive_in(nodes: list[Node], incoming: list[list[int]]) -> None:
    total = len(nodes)
    for node_index, node in enumerate(nodes):
        node.transitive_in_degree = len(bfs_reachability(incoming[node_index], incoming))
        if total >= 1000 and (node_index + 1) % 1000 == 0:
            print(f"computed transitive dependents for {node_index + 1}/{total} nodes", file=sys.stderr)


def compute_transitive_out(node_index: int, outgoing: list[list[int]]) -> int:
    return len(bfs_reachability(outgoing[node_index], outgoing))


def calculate_strongly_connected_components(
    nodes: list[Node], outgoing: list[list[int]], edges: list[tuple[int, int]]
) -> list[Component]:
    node_count = len(nodes)
    self_loop = {source for source, target in edges if source == target}

    index_by_node = [-1] * node_count
    low_link = [0] * node_count
    on_stack = [False] * node_count
    stack: list[int] = []
    component_by_node = [-1] * node_count
    components: list[Component] = []
    index = 0

    def strong_connect(start_index: int) -> None:
        nonlocal index
        call_stack: list[dict[str, int]] = []

        def enter(node_index: int) -> None:
            nonlocal index
            index_by_node[node_index] = index
            low_link[node_index] = index
            index += 1
            stack.append(node_index)
            on_stack[node_index] = True
            call_stack.append({"node_index": node_index, "child_index": 0})

        enter(start_index)

        while call_stack:
            frame = call_stack[-1]
            node_index = frame["node_index"]
            pushed = False

            while frame["child_index"] < len(outgoing[node_index]):
                next_node = outgoing[node_index][frame["child_index"]]
                frame["child_index"] += 1
                if index_by_node[next_node] == -1:
                    enter(next_node)
                    pushed = True
                    break
                if on_stack[next_node]:
                    low_link[node_index] = min(low_link[node_index], index_by_node[next_node])

            if pushed:
                continue

            call_stack.pop()
            if call_stack:
                parent = call_stack[-1]["node_index"]
                low_link[parent] = min(low_link[parent], low_link[node_index])

            if low_link[node_index] == index_by_node[node_index]:
                members: list[int] = []
                member = -1
                while member != node_index:
                    member = stack.pop()
                    on_stack[member] = False
                    component_by_node[member] = len(components)
                    members.append(member)
                components.append(
                    Component(
                        id=len(components),
                        members=members,
                        size=len(members),
                        self_loop=any(member_index in self_loop for member_index in members),
                    )
                )

    for node_index in range(node_count):
        if index_by_node[node_index] == -1:
            strong_connect(node_index)

    for source, target in edges:
        source_component = component_by_node[source]
        target_component = component_by_node[target]
        if source_component == target_component:
            continue
        components[source_component].outgoing.add(target_component)
        components[target_component].incoming.add(source_component)

    ranked = sorted(
        components,
        key=lambda component: (
            -(len(component.incoming) + len(component.outgoing) + ((component.size * 4) if (component.self_loop or component.size > 1) else 0)),
            -component.size,
            component.id,
        ),
    )

    for component in ranked:
        degree_impact = len(component.incoming) + len(component.outgoing)
        cyclicity_bonus = component.size * 4 if (component.self_loop or component.size > 1) else 0
        component.hotspot_score = degree_impact + cyclicity_bonus
        component.is_hotspot = component.hotspot_score > 0 and (component.size > 1 or component.self_loop)

    for rank, component in enumerate(ranked, start=1):
        component.hotspot_rank = rank

    for node_index, node in enumerate(nodes):
        component = components[component_by_node[node_index]]
        node.scc_id = component.id
        node.scc_size = component.size
        node.hotspot_score = component.hotspot_score
        node.hotspot_rank = component.hotspot_rank
        node.is_hotspot = component.is_hotspot

    return components


def mark_high_impact_hotspots(nodes: list[Node]) -> None:
    sorted_scores = sorted(node.transitive_in_degree for node in nodes)
    threshold = sorted_scores[int(len(sorted_scores) * 0.9)] if sorted_scores else 0
    minimum_score = 1 if threshold == 0 else threshold + 1

    for node in nodes:
        if not node.is_hotspot and node.transitive_in_degree >= minimum_score:
            node.is_hotspot = True
            node.hotspot_score = node.transitive_in_degree

    next_rank = max((node.hotspot_rank for node in nodes), default=0) + 1
    dag_hotspots = sorted(
        [node for node in nodes if node.is_hotspot and node.hotspot_rank == 0],
        key=lambda node: (-node.hotspot_score, -node.transitive_in_degree, node.label),
    )
    for node in dag_hotspots:
        node.hotspot_rank = next_rank
        next_rank += 1


def breakup_score(node: Node) -> float:
    return math.log2(node.transitive_in_degree + 1) * max(1, node.out_degree)


def top_impact_targets(nodes: list[Node], limit: int) -> list[Node]:
    return sorted(
        [node for node in nodes if node.transitive_in_degree > 0],
        key=lambda node: (-node.transitive_in_degree, -node.out_degree, node.label),
    )[:limit]


def top_breakup_candidates(nodes: list[Node], limit: int) -> list[Node]:
    return sorted(
        [node for node in nodes if node.transitive_in_degree > 0 and node.out_degree > 0],
        key=lambda node: (-breakup_score(node), -node.transitive_in_degree, -node.out_degree, node.label),
    )[:limit]


def top_cycle_components(components: list[Component], nodes: list[Node], limit: int) -> list[dict[str, Any]]:
    ranked = [
        component
        for component in components
        if component.size > 1 or component.self_loop
    ]
    ranked.sort(key=lambda component: (-component.hotspot_score, -component.size, component.id))
    results = []
    for component in ranked[:limit]:
        member_labels = sorted(nodes[node_index].label for node_index in component.members)
        results.append(
            {
                "component_id": component.id,
                "size": component.size,
                "hotspot_score": component.hotspot_score,
                "members": member_labels[:10],
            }
        )
    return results


def package_prefix(label: str) -> str:
    if ":" in label:
        return label.split(":", 1)[0]
    return label


def recommendation_strings(node: Node, outgoing_labels: list[str]) -> list[str]:
    recommendations: list[str] = []
    if node.scc_size > 1:
        recommendations.append(
            "Break the cycle before doing finer cleanup. Introduce a one-way boundary, shared contract target, or interface between SCC members."
        )
    if node.transitive_in_degree >= 20 and node.out_degree <= 2:
        recommendations.append(
            "This target is central but structurally narrow. Prefer stabilization and tighter API ownership before splitting it."
        )
    if node.out_degree >= 8:
        recommendations.append(
            f"Reduce direct dependency fan-out. This target reaches {node.out_degree} direct deps and likely mixes multiple responsibilities."
        )
    prefixes = sorted({package_prefix(label) for label in outgoing_labels})
    if len(prefixes) >= 3:
        sample = ", ".join(prefixes[:4])
        recommendations.append(
            f"Split by dependency domain. Direct deps already span multiple package groups: {sample}."
        )
    if node.transitive_in_degree >= 50 and node.out_degree >= 4:
        recommendations.append(
            "Keep the public target stable and peel behavior behind narrower internal targets or facades to avoid a large caller migration."
        )
    if not recommendations:
        recommendations.append("Inspect its direct deps and dependents before splitting. The graph signal is moderate rather than decisive.")
    return recommendations


def render_markdown(
    source: str,
    nodes: list[Node],
    id_to_index: dict[str, int],
    edges: list[tuple[int, int]],
    components: list[Component],
    outgoing: list[list[int]],
    incoming: list[list[int]],
    top_n: int,
    focus: Node | None,
) -> str:
    lines: list[str] = []
    lines.append(f"# BuildScope choke-point analysis")
    lines.append("")
    lines.append(f"- Source: `{source}`")
    lines.append(f"- Nodes: `{len(nodes)}`")
    lines.append(f"- Edges: `{len(edges)}`")
    lines.append(f"- Hotspots: `{sum(1 for node in nodes if node.is_hotspot)}`")
    lines.append("")
    lines.append("## Top Impact Targets")
    for index, node in enumerate(top_impact_targets(nodes, top_n), start=1):
        lines.append(
            f"{index}. `{node.id}` - {node.transitive_in_degree} dependents, {node.out_degree} direct deps, SCC size {node.scc_size}"
        )
    lines.append("")
    lines.append("## Top Breakup Candidates")
    for index, node in enumerate(top_breakup_candidates(nodes, top_n), start=1):
        node_index = id_to_index[node.id]
        direct_deps = [nodes[target_index].id for target_index in outgoing[node_index]][:5]
        dep_text = ", ".join(f"`{label}`" for label in direct_deps) if direct_deps else "none"
        lines.append(
            f"{index}. `{node.id}` - pressure {breakup_score(node):.2f}, {node.transitive_in_degree} dependents, {node.out_degree} direct deps, SCC size {node.scc_size}, direct deps: {dep_text}"
        )
        for recommendation in recommendation_strings(node, [nodes[target_index].id for target_index in outgoing[node_index]]):
            lines.append(f"   Recommendation: {recommendation}")
    cycles = top_cycle_components(components, nodes, top_n)
    if cycles:
        lines.append("")
        lines.append("## Largest Cyclic Hotspots")
        for index, component in enumerate(cycles, start=1):
            members = ", ".join(f"`{member}`" for member in component["members"])
            lines.append(
                f"{index}. component {component['component_id']} - size {component['size']}, hotspot score {component['hotspot_score']}, members: {members}"
            )
    if focus:
        focus_index = id_to_index[focus.id]
        focus.transitive_out_degree = compute_transitive_out(focus_index, outgoing)
        direct_deps = [nodes[target_index] for target_index in outgoing[focus_index]]
        direct_dependents = [nodes[source_index] for source_index in incoming[focus_index]]
        lines.append("")
        lines.append(f"## Focus: `{focus.id}`")
        lines.append(f"- Dependents: `{focus.transitive_in_degree}` transitive, `{focus.in_degree}` direct")
        lines.append(f"- Dependencies: `{focus.transitive_out_degree}` transitive, `{focus.out_degree}` direct")
        lines.append(f"- SCC size: `{focus.scc_size}`")
        lines.append(f"- Pressure: `{breakup_score(focus):.2f}`")
        if direct_deps:
            ranked_deps = sorted(direct_deps, key=lambda node: (-node.transitive_in_degree, node.label))[:10]
            lines.append("- Direct deps with the broadest blast radius:")
            for dep in ranked_deps:
                lines.append(
                    f"  - `{dep.id}` ({dep.transitive_in_degree} dependents, {dep.out_degree} direct deps)"
                )
        if direct_dependents:
            ranked_dependents = sorted(direct_dependents, key=lambda node: (-node.transitive_in_degree, node.label))[:10]
            lines.append("- Direct dependents most affected by a split:")
            for dep in ranked_dependents:
                lines.append(
                    f"  - `{dep.id}` ({dep.transitive_in_degree} dependents)"
                )
    return "\n".join(lines)


def render_json(
    source: str,
    nodes: list[Node],
    id_to_index: dict[str, int],
    edges: list[tuple[int, int]],
    components: list[Component],
    outgoing: list[list[int]],
    incoming: list[list[int]],
    top_n: int,
    focus: Node | None,
) -> str:
    payload: dict[str, Any] = {
        "source": source,
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "hotspotCount": sum(1 for node in nodes if node.is_hotspot),
        "topImpactTargets": [
            {
                "id": node.id,
                "transitiveInDegree": node.transitive_in_degree,
                "outDegree": node.out_degree,
                "hotspotRank": node.hotspot_rank if node.is_hotspot else None,
            }
            for node in top_impact_targets(nodes, top_n)
        ],
        "topBreakupCandidates": [
            {
                "id": node.id,
                "pressure": breakup_score(node),
                "transitiveInDegree": node.transitive_in_degree,
                "outDegree": node.out_degree,
                "sccSize": node.scc_size,
                "recommendations": recommendation_strings(
                    node, [nodes[target_index].id for target_index in outgoing[id_to_index[node.id]]]
                ),
            }
            for node in top_breakup_candidates(nodes, top_n)
        ],
        "cyclicHotspots": top_cycle_components(components, nodes, top_n),
    }
    if focus:
        focus_index = id_to_index[focus.id]
        payload["focus"] = {
            "id": focus.id,
            "transitiveInDegree": focus.transitive_in_degree,
            "transitiveOutDegree": compute_transitive_out(focus_index, outgoing),
            "inDegree": focus.in_degree,
            "outDegree": focus.out_degree,
            "sccSize": focus.scc_size,
            "pressure": breakup_score(focus),
            "directDependencies": [nodes[target_index].id for target_index in outgoing[focus_index]],
            "directDependents": [nodes[source_index].id for source_index in incoming[focus_index]],
        }
    return json.dumps(payload, indent=2)


if __name__ == "__main__":
    args = parse_args()
    raw = load_graph(args)
    nodes, edges, nodes_by_id = sanitize_graph(raw)
    if not nodes:
        raise SystemExit("no valid nodes found in graph")
    outgoing, incoming = build_adjacency(len(nodes), edges)
    compute_degrees(nodes, edges)
    compute_transitive_in(nodes, incoming)
    components = calculate_strongly_connected_components(nodes, outgoing, edges)
    mark_high_impact_hotspots(nodes)

    focus_node = None
    if args.focus:
        focus_index = nodes_by_id.get(args.focus)
        if focus_index is None:
            raise SystemExit(f"focus target not found after sanitization: {args.focus}")
        focus_node = nodes[focus_index]

    source = args.file or args.url
    if args.format == "json":
        print(render_json(source, nodes, nodes_by_id, edges, components, outgoing, incoming, args.top, focus_node))
    else:
        print(render_markdown(source, nodes, nodes_by_id, edges, components, outgoing, incoming, args.top, focus_node))
