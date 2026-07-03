import { defineCommand } from 'citty';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/**
 * Write a fresh `.codestory/` scaffold: a manifest with one example journey and
 * one example board that passes `validateDir` with zero issues. Pure filesystem
 * side effects so `init` and the scaffold test share one source of truth.
 */
export function scaffoldDir(dir: string, project: string): void {
  mkdirSync(dir, { recursive: true });

  const manifest = {
    $schema: 'codestory/manifest.v0',
    version: 1,
    project,
    journeys: [
      { id: 'example', title: 'Example journey', start: { board: 'example', entry: 'start' }, boards: ['example'] },
    ],
  };

  const board = {
    $schema: 'codestory/board.v0',
    version: 1,
    id: 'example',
    title: 'Example board',
    entries: ['start'],
    exits: [],
    nodes: [
      { id: 'start', type: 'step', label: 'Start here' },
      { id: 'done', type: 'step', label: 'Done' },
    ],
    edges: [{ from: 'start', to: 'done' }],
  };

  writeFileSync(join(dir, 'codestory.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, 'example.board.json'), `${JSON.stringify(board, null, 2)}\n`);
}

export const initCommand = defineCommand({
  meta: { name: 'init', description: 'Scaffold a .codestory/ directory with an example board' },
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
