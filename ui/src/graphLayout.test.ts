import { describe, expect, it } from "vitest";
import { fitToView, layeredLayout, sanitizeGraph, Graph } from "./graphLayout";

describe("sanitizeGraph", () => {
  it("drops invalid ids and edges", () => {
    const raw: Graph = {
      nodes: [
        { id: "//ok:one", label: "" },
        { id: "[label=\"bad\"]", label: "bad" },
      ],
      edges: [
        { source: "//ok:one", target: "[label=\"bad\"]" },
        { source: "//ok:one", target: "//ok:one" },
      ],
    };
    const clean = sanitizeGraph(raw);
    expect(clean.nodes.length).toBe(1);
    expect(clean.edges.length).toBe(1);
    expect(clean.edges[0].target).toBe("//ok:one");
  });
});

describe("layeredLayout + fitToView", () => {
  const graph: Graph = {
    nodes: Array.from({ length: 6 }, (_, i) => ({
      id: `//n${i}`,
      label: `//n${i}`,
    })),
    edges: [
      { source: "//n0", target: "//n1" },
      { source: "//n1", target: "//n2" },
      { source: "//n0", target: "//n3" },
      { source: "//n3", target: "//n4" },
      { source: "//n2", target: "//n5" },
    ],
  };

  it("centers nodes within view with padding", () => {
    const laid = layeredLayout(graph);
    const fit = fitToView(laid.nodes, 1200, 800);
    const xs = laid.nodes.map((n) => n.x * fit.scale + fit.offsetX);
    const ys = laid.nodes.map((n) => n.y * fit.scale + fit.offsetY);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    expect(minX).toBeGreaterThan(50);
    expect(minY).toBeGreaterThan(50);
    expect(maxX).toBeLessThan(1200 - 50);
    expect(maxY).toBeLessThan(800 - 50);
  });

  it("re-centers layout around origin", () => {
    const laid = layeredLayout(graph);
    const avgX =
      laid.nodes.reduce((acc, n) => acc + n.x, 0) / laid.nodes.length;
    const avgY =
      laid.nodes.reduce((acc, n) => acc + n.y, 0) / laid.nodes.length;
    expect(Math.abs(avgX)).toBeLessThan(1e-6);
    expect(Math.abs(avgY)).toBeLessThan(1e-6);
  });
});
