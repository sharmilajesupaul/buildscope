# Fixture Corpus

BuildScope now keeps a pinned graph corpus so UI and performance work can be evaluated against real Bazel graphs instead of ad hoc screenshots.

`fixtures/manifest.json` is the source of truth for the corpus. It records which fixtures are checked in, which ones are generated on demand, and the exact repository / commit / Bazel target used for extraction.

## Checked-in Fixtures

| ID | Graph | Nodes | Edges | Why it exists |
| --- | --- | ---: | ---: | --- |
| `sample_graph` | `ui/public/sample-graph.json` | 20 | 36 | Tiny fallback graph for fast local iteration and demos. |
| `buildscope_logger` | `fixtures/buildscope_logger.json` | 601 | 1675 | Medium internal graph for interaction tuning. |
| `buildscope_large_angular_app` | `fixtures/buildscope_large_angular_app.json` | 3386 | 8751 | Main large in-repo stress fixture. |
| `examples_java_tutorial_projectrunner` | `fixtures/examples_java_tutorial_projectrunner.json` | 22 | 22 | Real Java Bazel graph with toolchain edges. |
| `examples_cpp_tutorial_stage3_hello_world` | `fixtures/examples_cpp_tutorial_stage3_hello_world.json` | 27 | 38 | Real C++ Bazel graph with platform / toolchain structure. |
| `examples_go_tutorial_stage3_print_fortune` | `fixtures/examples_go_tutorial_stage3_print_fortune.json` | 70 | 91 | Real Go Bazel graph with `rules_go` structure. |

## Generated On Demand

| ID | Output path | Nodes | Edges | Why it is generated |
| --- | --- | ---: | ---: | --- |
| `openai_codex_cli` | `fixtures/generated/openai_codex_cli.json` | 13053 | 65066 | Real-world large graph from `openai/codex`; too large to check in by default. |
| `zml_mnist` | `fixtures/generated/zml_mnist.json` | 5147 | 15277 | Real-world ML-oriented graph from `zml/zml`; useful as a second stress shape. |

## Refresh Workflow

Refresh the pinned small external fixtures:

```bash
./scripts/refresh-fixtures.sh
```

Refresh a specific fixture:

```bash
./scripts/refresh-fixtures.sh examples_go_tutorial_stage3_print_fortune
```

Generate the large Codex stress fixture:

```bash
./scripts/refresh-fixtures.sh openai_codex_cli
```

Generate the ZML fixture:

```bash
./scripts/refresh-fixtures.sh zml_mnist
```

The script clones upstream sources under `/tmp/buildscope-fixture-sources` by default, checks out the exact commit from the manifest, and reruns `buildscope extract`.

## Benchmark Workflow

Run the default benchmark set:

```bash
./scripts/benchmark-fixtures.sh
```

Include generated fixtures that already exist on disk:

```bash
./scripts/benchmark-fixtures.sh --include-generated
```

Benchmark a specific fixture:

```bash
./scripts/benchmark-fixtures.sh openai_codex_cli --include-generated
```

Benchmark multiple generated stress fixtures:

```bash
./scripts/benchmark-fixtures.sh openai_codex_cli zml_mnist --include-generated --iterations=1
```

The benchmark harness measures `sanitizeGraph` and `layeredLayout` separately so UI work can be compared against repeatable layout numbers before and after a change.

## External Repos In Scope

The current corpus intentionally covers:

- internal BuildScope graphs for regression testing
- `bazelbuild/examples` for small, legible reference graphs across Java, C++, and Go
- `openai/codex` for a large real-world graph that stresses both layout and navigation
- `zml/zml` for a second large graph shape from an ML-focused Bazel workspace

This is enough to keep the next UI pass grounded in real Bazel usage without bloating the repo.
