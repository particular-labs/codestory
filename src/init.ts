import { defineCommand } from 'citty';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/**
 * Write a fresh `.codestory/` scaffold: a manifest with one example persona and
 * one example journey that passes `validateDir` with zero issues. Pure filesystem
 * side effects so `init` and the scaffold test share one source of truth.
 */
export function scaffoldDir(dir: string, project: string): void {
  mkdirSync(dir, { recursive: true });

  const manifest = {
    $schema: 'codestory/manifest.v0',
    version: 1,
    project,
    personas: [
      { id: 'example', title: 'Example persona', start: { journey: 'example', entry: 'start' }, journeys: ['example'] },
    ],
  };

  const journey = {
    $schema: 'codestory/journey.v0',
    version: 1,
    id: 'example',
    title: 'Example journey',
    entries: ['start'],
    exits: [],
    steps: [
      { id: 'start', type: 'action', label: 'Start here' },
      { id: 'done', type: 'action', label: 'Done' },
    ],
    edges: [{ from: 'start', to: 'done' }],
  };

  writeFileSync(join(dir, 'codestory.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, 'example.journey.json'), `${JSON.stringify(journey, null, 2)}\n`);
}

export const initCommand = defineCommand({
  meta: { name: 'init', description: 'Scaffold a .codestory/ directory with an example journey' },
  args: {
    dir: { type: 'string', description: 'Path to the .codestory directory', default: '.codestory' },
  },
  run({ args }) {
    const dir = resolve(args.dir);
    if (existsSync(dir)) {
      console.error(`✗ ${dir} already exists — refusing to overwrite`);
      process.exit(1);
    }
    scaffoldDir(dir, basename(process.cwd()));
    console.log(`✓ scaffolded ${dir} — run 'codestory validate' then 'codestory present'`);
  },
});
