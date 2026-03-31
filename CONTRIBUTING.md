# Contributing

Thanks for contributing to BuildScope.

## Before You Start

- Open an issue or discussion before starting large changes so the direction is clear.
- Keep pull requests focused. Small diffs are easier to review and safer to land.
- If your change affects install or release behavior, update the relevant docs in `README.md`.

## Local Setup

```bash
./setup.sh
./dev.sh
```

If you only need the frontend:

```bash
npm --prefix ui run dev
```

## Validation

Run the checks that match your change before opening a pull request.

```bash
npm --prefix ui test
cd cli && go test ./...
```

If you change the shipped UI, refresh the embedded bundle too:

```bash
./scripts/refresh-embedded-ui.sh
```

## Pull Requests

- Describe the user-visible change and why it is needed.
- Include the commands you ran to validate the change.
- Add or update tests when behavior changes.
- Avoid unrelated cleanup in the same pull request.

## Reporting Bugs

Please include:

- your operating system and architecture
- your Bazel version
- the exact command you ran
- a minimal reproduction if you have one

Security-sensitive issues should follow [SECURITY.md](SECURITY.md) instead of a public issue.
