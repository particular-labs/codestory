#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { resolve } from 'node:path';
import { validateDir } from './validate';

const validate = defineCommand({
  meta: { name: 'validate', description: 'Parse all .codestory files and run referential checks' },
  args: {
    dir: { type: 'string', description: 'Path to the .codestory directory', default: '.codestory' },
  },
  async run({ args }) {
    const dir = resolve(args.dir);
    const result = await validateDir(dir);
    for (const issue of result.issues) {
      console.error(`✗ ${issue.file}\n  ${issue.message}`);
    }
    if (!result.ok) {
      console.error(`\ncodestory validate: ${result.issues.length} issue(s)`);
      process.exit(1);
    }
    console.log(`✓ ${result.boards.length} board(s), ${result.manifest?.journeys.length ?? 0} journey(s) — all checks pass`);
  },
});

const main = defineCommand({
  meta: { name: 'codestory', description: 'Living storyboards for codebases' },
  subCommands: {
    validate,
    present: () => import('./present').then((m) => m.presentCommand),
  },
});

runMain(main);
