# Bugs

All repro tests are done in the bazel-examples repo

## ./buildscope.sh fails to generate new graph.json output from Go CLI

```
Starting Go server on :4422...
2025/11/25 16:07:50 static dir not found: /Users/sharmilajesupaul/code/repos/buildscope/cli/ui/dist
exit status 1
```

Note the wrong dir `buildscope/cli/ui/dist` instead of `buildscope/ui/dist` a path somewhere is wrong.

This works properly when running the go server with the output directly, i.e.

```
❯ cd ~/code/repos/buildscope && npm --prefix ui run build && cd cli && go run ./cmd/buildscope serve -dir ../ui/dist -graph /tmp/buildscope-graph-56063.json -addr :4421
```

Run the above after generating graph using `buildscope.sh`.
