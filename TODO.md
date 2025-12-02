# TODO

Manual testing is done by using Bazel apps in the bazel-examples repo: https://github.com/aspect-build/bazel-examples

Additionally, there are large graph examples in ./fixtures in this repo, for frontend only tests.

## Features

### Quantify Selections

Selecting a node should show the number of edges that node is connected to. Currently, we only show the total number of nodes and edges always.

### More robust edge pruning

Performance suffers on larger apps during zoom in, due to the number of edges being rendered. Only show a certain number of edges.

### Add an exclude filter

Allow excluding certain targets from the graph altogether through an --exclude flag.
