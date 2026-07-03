# codestory

**Living journey maps for codebases.** Journeys are flows — a sequence of steps, decisions, and exits. Journeys chain into an end-to-end map by wiring one journey's exit **ports** to another journey's entries. Agents keep the journeys in sync with the code they describe, and a local viewer presents them.

![viewer screenshot placeholder](./assets/screenshot.png)

## Quickstart

```bash
npx @particular-labs/codestory init      # scaffold .codestory/ with an example journey
npx @particular-labs/codestory validate   # parse + referential checks (exit 0 = clean)
npx @particular-labs/codestory present     # serve the viewer at http://localhost:4747
```

Requires Node >= 20. `present --no-open` skips launching the browser; `--port` changes the port.

## How it works

- **`.codestory/codestory.json`** — the manifest: project name + named personas (entry lenses into the graph).
- **`.codestory/<id>.journey.json`** — one journey per flow: `nodes` (step / decision / exit), `edges`, declared `entries` / `exits`, and `links` that connect an exit port to another journey's entry.
- **`validate`** enforces the contract: links/personas point at real journeys and entries, exit nodes use declared ports, `built` nodes carry tests, `refs` resolve on disk, ids are unique, and variant journeys keep the same ports as their base.

## Schema

The zod schemas in [`src/schema.ts`](./src/schema.ts) are the source of truth for the manifest and journey formats (`codestory/manifest.v0`, `codestory/journey.v0`).

## License

MIT © Particular Labs
