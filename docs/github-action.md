# GitHub Action

`particular-labs/codestory` ships a composite action that wraps `codestory validate`,
so a pull request fails the moment a journey drifts out of sync with the referential
contract (unknown links, missing tests on `built` steps, broken `refs`, etc).

## Usage

```yaml
name: codestory

on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
      - uses: particular-labs/codestory@main
        with:
          working-directory: .
          version: latest
```

## Inputs

| Input               | Default  | Description                                                        |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `working-directory` | `.`      | Directory to run `codestory validate` from (must contain `.codestory/`). |
| `version`            | `latest` | `@particular-labs/codestory` version to run via `npx`, e.g. `0.3.0`. |

## What it does

The action installs Node.js 20+ on the runner, then runs:

```bash
npx --yes @particular-labs/codestory@<version> validate
```

`codestory validate` parses every file under `.codestory/` and runs the referential
checks documented in the [README](../README.md#how-it-works). The action does no
work of its own beyond invoking the CLI — the exit-code contract carries the result:

- **exit 0** — all checks pass, the job succeeds.
- **exit 1** — one or more issues found; they're printed to the log and the job fails.

## Pinning a version

Pin `version` to a specific release (e.g. `0.3.0`) in CI so a new codestory release
can't silently change validation behavior on an unrelated PR. Leave it at `latest`
if you want to pick up new checks automatically.
