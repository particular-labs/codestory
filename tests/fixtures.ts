import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Shared scaffolding for tests that write fake `.codestory/` repos to a temp
// dir. Centralizes the file-writing boilerplate and the alpha/beta journey
// fixture that validate/mcp-tools/present tests each used to duplicate.

export type Json = Record<string, unknown>;

/** Write a fake repo: files maps repo-relative paths → JSON (objects) or raw strings. Returns the repo root. */
export function repo(files: Record<string, Json | string>): string {
  const root = mkdtempSync(join(tmpdir(), 'codestory-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

/** Manifest + alpha/beta journey pair: alpha links to beta via both a
 *  sub-journey step and an exit link, covering both relation kinds in one
 *  fixture (used by validate, mcp-tools, and journey-context coverage). */
export const manifest: Json = {
  $schema: 'codestory/manifest.v0',
  version: 1,
  project: 'Demo',
  personas: [{ id: 'ops', title: 'Ops', start: { journey: 'alpha', entry: 'start' }, journeys: ['alpha', 'beta'] }],
};

export const alpha: Json = {
  $schema: 'codestory/journey.v1',
  version: 1,
  id: 'alpha',
  title: 'Alpha',
  entries: ['start'],
  exits: ['done'],
  steps: [
    { id: 'a', type: 'action', label: 'A' },
    { id: 'sub', type: 'action', label: 'Sub', journey: 'beta' },
    { id: 'x', type: 'exit', port: 'done' },
  ],
  edges: [
    { from: 'a', to: 'sub' },
    { from: 'sub', to: 'x' },
  ],
  links: [{ exit: 'done', journey: 'beta', entry: 'start' }],
};

export const beta: Json = {
  $schema: 'codestory/journey.v1',
  version: 1,
  id: 'beta',
  title: 'Beta',
  entries: ['start'],
  steps: [{ id: 'b', type: 'action', label: 'B' }],
};

/** The alpha/beta pair + manifest, keyed by repo-relative path — pass to
 *  `repo()` as-is, or spread and override one entry to break a specific rule. */
export const good = {
  '.codestory/codestory.json': manifest,
  '.codestory/alpha.journey.json': alpha,
  '.codestory/beta.journey.json': beta,
};

/** Write the alpha/beta fixture into a fresh temp `.codestory/` dir. Returns the dir. */
export function aBetaJourneyDir(): string {
  return join(repo(good), '.codestory');
}

/** Read and parse a repo's persisted notes.json. */
export function readNotesFile(dir: string): { $schema?: string; notes: Array<Record<string, unknown>> } {
  return JSON.parse(readFileSync(join(dir, 'notes.json'), 'utf8'));
}
