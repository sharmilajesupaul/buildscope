# Fixture Corpus

BuildScope keeps a small, pinned corpus of Bazel graphs so layout and UI changes can be tested against repeatable data.

`fixtures/manifest.json` is the source of truth. It records which fixtures are checked in, which ones are generated on demand, and the exact upstream commit and Bazel target used for extraction.

## Checked-In Fixtures

| ID | Graph | Nodes | Edges | Purpose |
| --- | --- | ---: | ---: | --- |
| `sample_graph` | `ui/public/sample-graph.json` | 20 | 36 | Tiny fallback graph for local iteration and demos. |
| `buildscope_logger` | `fixtures/buildscope_logger.json` | 601 | 1675 | Medium-sized in-repo reference graph. |
| `buildscope_large_angular_app` | `fixtures/buildscope_large_angular_app.json` | 3386 | 8751 | Large in-repo stress graph for layout and navigation work. |
| `examples_java_tutorial_projectrunner` | `fixtures/examples_java_tutorial_projectrunner.json` | 22 | 22 | Small Java graph with toolchain edges. |
| `examples_cpp_tutorial_stage3_hello_world` | `fixtures/examples_cpp_tutorial_stage3_hello_world.json` | 27 | 38 | Small C++ graph with platform and toolchain structure. |
| `examples_go_tutorial_stage3_print_fortune` | `fixtures/examples_go_tutorial_stage3_print_fortune.json` | 70 | 91 | Small Go graph with `rules_go` structure. |

## Generated On Demand

| ID | Output Path | Nodes | Edges | Purpose |
| --- | --- | ---: | ---: | --- |
| `openai_codex_cli` | `fixtures/generated/openai_codex_cli.json` | 13053 | 65066 | Large real-world workspace for stress testing. |
| `zml_mnist` | `fixtures/generated/zml_mnist.json` | 5147 | 15277 | Medium-large ML-oriented workspace for contrast testing. |

## Refreshing Fixtures

Refresh the default upstream fixtures:

```bash
./scripts/refresh-fixtures.sh
```

Refresh one fixture:

```bash
./scripts/refresh-fixtures.sh examples_go_tutorial_stage3_print_fortune
```

Refresh every fixture with an upstream source:

```bash
./scripts/refresh-fixtures.sh --all
```

Generate one of the large on-demand fixtures:

```bash
./scripts/refresh-fixtures.sh openai_codex_cli
```

By default, the script clones sources under `/tmp/buildscope-fixture-sources`, checks out the pinned commit from the manifest, and reruns `buildscope extract`.

## Benchmarking Fixtures

Run the default benchmark set:

```bash
./scripts/benchmark-fixtures.sh
```

Include generated fixtures that already exist on disk:

```bash
./scripts/benchmark-fixtures.sh --include-generated
```

Benchmark specific fixtures:

```bash
./scripts/benchmark-fixtures.sh openai_codex_cli zml_mnist --include-generated --iterations=1
```

The benchmark harness measures `sanitizeGraph` and `layeredLayout` separately so layout changes can be compared before and after a UI or algorithm update.
