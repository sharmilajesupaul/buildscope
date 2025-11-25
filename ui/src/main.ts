type GraphNode = {
  id: string;
  label: string;
  x?: number;
  y?: number;
};

type GraphEdge = {
  source: string;
  target: string;
};

type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const vertexShaderSrc = `#version 300 es
precision highp float;
in vec2 a_position;
uniform vec2 u_translate;
uniform float u_scale;
uniform vec2 u_resolution;
void main() {
  // Apply pan/zoom in world space
  vec2 pos = (a_position + u_translate) * u_scale;
  // Convert to clip space
  vec2 zeroToOne = pos / u_resolution;
  vec2 zeroToTwo = zeroToOne * 2.0;
  vec2 clip = zeroToTwo - 1.0;
  // Flip Y because canvas origin is top-left
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = 7.0;
}
`;

const fragmentShaderSrc = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}
`;

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info || "unknown"}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const vert = createShader(gl, gl.VERTEX_SHADER, vs);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create program");
  }
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info || "unknown"}`);
  }
  return program;
}

function buildPositions(graph: Graph): { nodes: Float32Array; edges: Float32Array } {
  // Layout: use existing x/y if provided, else distribute on a circle
  const nodes = graph.nodes;
  const n = nodes.length;
  const radius = 200;
  const computed = nodes.map((node, idx) => {
    if (node.x !== undefined && node.y !== undefined) {
      return { x: node.x, y: node.y };
    }
    const angle = (idx / Math.max(1, n)) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });

  const nodePositions = new Float32Array(n * 2);
  const idToIndex: Record<string, number> = {};
  computed.forEach((p, i) => {
    nodePositions[i * 2] = p.x;
    nodePositions[i * 2 + 1] = p.y;
    idToIndex[nodes[i].id] = i;
  });

  const edgePositions: number[] = [];
  for (const e of graph.edges) {
    const srcIdx = idToIndex[e.source];
    const tgtIdx = idToIndex[e.target];
    if (srcIdx === undefined || tgtIdx === undefined) continue;
    edgePositions.push(
      computed[srcIdx].x,
      computed[srcIdx].y,
      computed[tgtIdx].x,
      computed[tgtIdx].y
    );
  }

  return {
    nodes: nodePositions,
    edges: new Float32Array(edgePositions),
  };
}

function main() {
  const root = document.getElementById("app");
  if (!root) return;

  // Basic styles
  document.body.style.margin = "0";
  document.body.style.background =
    "radial-gradient(circle at 20% 20%, rgba(80,120,255,0.07), transparent 30%), radial-gradient(circle at 80% 60%, rgba(255,200,120,0.08), transparent 32%), #0b0f14";
  root.innerHTML = "";

  const status = document.createElement("div");
  status.style.position = "fixed";
  status.style.top = "12px";
  status.style.left = "12px";
  status.style.color = "#d4e5ff";
  status.style.fontFamily = "system-ui, sans-serif";
  status.style.fontSize = "14px";
  status.style.background = "rgba(12, 18, 26, 0.7)";
  status.style.padding = "8px 10px";
  status.style.borderRadius = "8px";
  status.style.border = "1px solid rgba(255,255,255,0.08)";
  status.innerText = "Loading sample graph…";
  root.appendChild(status);

  const controls = document.createElement("div");
  controls.style.position = "fixed";
  controls.style.top = "12px";
  controls.style.right = "12px";
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.alignItems = "center";
  controls.style.background = "rgba(12, 18, 26, 0.7)";
  controls.style.border = "1px solid rgba(255,255,255,0.08)";
  controls.style.borderRadius = "8px";
  controls.style.padding = "8px 10px";
  controls.style.color = "#d4e5ff";
  controls.style.fontFamily = "system-ui, sans-serif";
  controls.style.fontSize = "13px";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search node label…";
  searchInput.style.background = "rgba(255,255,255,0.06)";
  searchInput.style.border = "1px solid rgba(255,255,255,0.12)";
  searchInput.style.borderRadius = "6px";
  searchInput.style.padding = "6px 8px";
  searchInput.style.color = "#d4e5ff";
  searchInput.style.outline = "none";
  searchInput.style.width = "200px";

  const fitBtn = document.createElement("button");
  fitBtn.textContent = "Fit";
  fitBtn.style.background = "linear-gradient(135deg, #4f7cff, #79a8ff)";
  fitBtn.style.border = "none";
  fitBtn.style.color = "#0b0f14";
  fitBtn.style.fontWeight = "600";
  fitBtn.style.padding = "8px 10px";
  fitBtn.style.borderRadius = "6px";
  fitBtn.style.cursor = "pointer";

  controls.appendChild(searchInput);
  controls.appendChild(fitBtn);
  root.appendChild(controls);

  const canvas = document.createElement("canvas");
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.display = "block";
  root.appendChild(canvas);

  const tooltip = document.createElement("div");
  tooltip.style.position = "fixed";
  tooltip.style.pointerEvents = "none";
  tooltip.style.padding = "6px 8px";
  tooltip.style.background = "rgba(12,18,26,0.9)";
  tooltip.style.borderRadius = "6px";
  tooltip.style.border = "1px solid rgba(255,255,255,0.12)";
  tooltip.style.color = "#d4e5ff";
  tooltip.style.fontFamily = "system-ui, sans-serif";
  tooltip.style.fontSize = "12px";
  tooltip.style.transform = "translate(10px, 10px)";
  tooltip.style.opacity = "0";
  root.appendChild(tooltip);

  const gl = canvas.getContext("webgl2");
  if (!gl) {
    status.innerText = "WebGL2 not available";
    return;
  }

  const program = createProgram(gl, vertexShaderSrc, fragmentShaderSrc);
  const aPosition = gl.getAttribLocation(program, "a_position");
  const uTranslate = gl.getUniformLocation(program, "u_translate");
  const uScale = gl.getUniformLocation(program, "u_scale");
  const uResolution = gl.getUniformLocation(program, "u_resolution");
  const uColor = gl.getUniformLocation(program, "u_color");

  let nodeBuffer: WebGLBuffer | null = null;
  let edgeBuffer: WebGLBuffer | null = null;
  let highlightEdgeBuffer: WebGLBuffer | null = null;
  let nodeCount = 0;
  let edgeVertexCount = 0;
  let highlightEdgeVertexCount = 0;

  let nodePositions: Float32Array | null = null;
  let idToIndex: Record<string, number> = {};
  let edgesIdx: Array<{ s: number; t: number }> = [];
  let hoveredIndex: number | null = null;
  let nodesMeta: GraphNode[] = [];
  let lastMouse: { x: number; y: number } | null = null;

  const state = {
    scale: 1,
    translate: { x: 0, y: 0 },
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(canvas.clientWidth * dpr);
    const displayHeight = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      gl.viewport(0, 0, displayWidth, displayHeight);
    }
  }

  function fitView(nodes: Float32Array) {
    resize();
    if (nodes.length < 2) return;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < nodes.length; i += 2) {
      const x = nodes[i];
      const y = nodes[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const padding = 60;
    const targetW = Math.max(1, canvas.width - padding * 2);
    const targetH = Math.max(1, canvas.height - padding * 2);
    const scale = Math.min(targetW / width, targetH / height);
    const clampedScale = Math.min(Math.max(scale, 0.05), 10);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    state.scale = clampedScale;
    state.translate.x = canvas.width / (2 * clampedScale) - cx;
    state.translate.y = canvas.height / (2 * clampedScale) - cy;
  }

  function draw() {
    resize();
    gl.clearColor(0.04, 0.07, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform2f(uTranslate, state.translate.x, state.translate.y);
    gl.uniform1f(uScale, state.scale);

    // Edges
    if (edgeBuffer && edgeVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(uColor, 0.23, 0.46, 0.74, 0.35);
      gl.lineWidth(1);
      gl.drawArrays(gl.LINES, 0, edgeVertexCount);
    }

    // Highlight edges
    if (highlightEdgeBuffer && highlightEdgeVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, highlightEdgeBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(uColor, 0.97, 0.79, 0.36, 0.8);
      gl.lineWidth(2);
      gl.drawArrays(gl.LINES, 0, highlightEdgeVertexCount);
    }

    // Nodes
    if (nodeBuffer && nodeCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(uColor, 0.97, 0.79, 0.36, 1.0);
      gl.drawArrays(gl.POINTS, 0, nodeCount);

      // Highlight node
      if (hoveredIndex !== null) {
        gl.uniform4f(uColor, 1.0, 0.95, 0.75, 1.0);
        gl.drawArrays(gl.POINTS, hoveredIndex, 1);
      }
    }

    if (hoveredIndex !== null && lastMouse) {
      tooltip.style.opacity = "1";
      tooltip.style.left = `${lastMouse.x}px`;
      tooltip.style.top = `${lastMouse.y}px`;
      tooltip.textContent = nodesMeta[hoveredIndex].label;
    } else {
      tooltip.style.opacity = "0";
    }
  }

  function attachGraph(graph: Graph) {
    const { nodes, edges } = buildPositions(graph);
    nodeCount = nodes.length / 2;
    edgeVertexCount = edges.length / 2;

    nodeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.STATIC_DRAW);

    edgeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, edges, gl.STATIC_DRAW);

    nodePositions = nodes;
    idToIndex = {};
    edgesIdx = [];
    nodesMeta = graph.nodes;
    for (let i = 0; i < graph.nodes.length; i++) {
      idToIndex[graph.nodes[i].id] = i;
    }
    for (const e of graph.edges) {
      const s = idToIndex[e.source];
      const t = idToIndex[e.target];
      if (s !== undefined && t !== undefined) {
        edgesIdx.push({ s, t });
      }
    }

    fitView(nodes);
    status.innerText = `Loaded ${graph.nodes.length} nodes, ${graph.edges.length} edges`;
    draw();
  }

  // Pan/zoom controls
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const scaleDelta = e.deltaY > 0 ? 0.9 : 1.1;
    state.scale *= scaleDelta;
    state.scale = Math.max(0.1, Math.min(5, state.scale));
    draw();
  });

  canvas.addEventListener("mousedown", (e) => {
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  });
  window.addEventListener("mouseup", () => {
    state.dragging = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.translate.x += dx;
    state.translate.y += dy;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    draw();
  });
  window.addEventListener("resize", draw);

  function handleHover(clientX: number, clientY: number) {
    if (!nodePositions) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const xCss = clientX - rect.left;
    const yCss = clientY - rect.top;
    const xDev = xCss * dpr;
    const yDev = yCss * dpr;

    // Invert transform: world = (screen / scale) - translate
    const worldX = xDev / state.scale - state.translate.x;
    const worldY = yDev / state.scale - state.translate.y;

    let closest = -1;
    let best = Number.POSITIVE_INFINITY;
    const radius = 12 / state.scale;
    for (let i = 0; i < nodeCount; i++) {
      const nx = nodePositions[i * 2];
      const ny = nodePositions[i * 2 + 1];
      const dx = nx - worldX;
      const dy = ny - worldY;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < best && dist2 <= radius * radius) {
        best = dist2;
        closest = i;
      }
    }

    if (closest === hoveredIndex) return;
    hoveredIndex = closest >= 0 ? closest : null;

    if (hoveredIndex !== null) {
      const node = nodesMeta[hoveredIndex];
      status.innerText = `${node.label}`;
      // Build highlight edges
      const hi: number[] = [];
      for (const e of edgesIdx) {
        if (e.s === hoveredIndex || e.t === hoveredIndex) {
          const sx = nodePositions[e.s * 2];
          const sy = nodePositions[e.s * 2 + 1];
          const tx = nodePositions[e.t * 2];
          const ty = nodePositions[e.t * 2 + 1];
          hi.push(sx, sy, tx, ty);
        }
      }
      highlightEdgeVertexCount = hi.length / 2;
      if (!highlightEdgeBuffer) {
        highlightEdgeBuffer = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, highlightEdgeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hi), gl.STATIC_DRAW);
    } else {
      highlightEdgeVertexCount = 0;
      if (highlightEdgeBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, highlightEdgeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(), gl.STATIC_DRAW);
      }
      status.innerText = `Loaded ${nodeCount} nodes, ${edgeVertexCount / 2} edges`;
    }
    draw();
  }

  canvas.addEventListener("mousemove", (e) => {
    if (state.dragging) return;
    lastMouse = { x: e.clientX, y: e.clientY };
    handleHover(e.clientX, e.clientY);
  });

  function focusSearch() {
    const term = searchInput.value.trim().toLowerCase();
    if (!term || !nodePositions) return;
    const idx = nodesMeta.findIndex((n) => n.label.toLowerCase().includes(term));
    if (idx < 0) {
      status.innerText = `Not found: ${term}`;
      return;
    }
    hoveredIndex = idx;
    const nx = nodePositions[idx * 2];
    const ny = nodePositions[idx * 2 + 1];
    resize();
    state.translate.x = canvas.width / (2 * state.scale) - nx;
    state.translate.y = canvas.height / (2 * state.scale) - ny;
    status.innerText = nodesMeta[idx].label;
    lastMouse = { x: canvas.width / 2, y: canvas.height / 2 };
    const hi: number[] = [];
    for (const e of edgesIdx) {
      if (e.s === idx || e.t === idx) {
        const sx = nodePositions[e.s * 2];
        const sy = nodePositions[e.s * 2 + 1];
        const tx = nodePositions[e.t * 2];
        const ty = nodePositions[e.t * 2 + 1];
        hi.push(sx, sy, tx, ty);
      }
    }
    highlightEdgeVertexCount = hi.length / 2;
    if (!highlightEdgeBuffer) {
      highlightEdgeBuffer = gl.createBuffer();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, highlightEdgeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hi), gl.STATIC_DRAW);
    draw();
  }

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      focusSearch();
    }
  });
  fitBtn.addEventListener("click", () => {
    if (nodePositions) {
      fitView(nodePositions);
      status.innerText = `Loaded ${nodeCount} nodes, ${edgeVertexCount / 2} edges`;
      draw();
    }
  });

  function load(url: string) {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Graph>;
    });
  }

  load("/graph.json")
    .catch(() => load("/sample-graph.json"))
    .then((graph) => attachGraph(graph))
    .catch((err) => {
      console.error(err);
      status.innerText = "Failed to load graph";
    });
}

main();
