#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { resolve } from 'node:path';
import { version } from '../package.json';
import { initCommand } from './init';
import { migrateCommand } from './migrate';
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
    console.log(`✓ ${result.journeys.length} journey(s), ${result.manifest?.personas.length ?? 0} persona(s) — all checks pass`);
  },
});

const main = defineCommand({
  meta: { name: 'codestory', version, description: 'Living storyboards for codebases' },
  subCommands: {
    init: initCommand,
    validate,
    migrate: migrateCommand,
    present: () => import('./present').then((m) => m.presentCommand),
    mcp: () => import('./mcp').then((m) => m.mcpCommand),
    skill: () => import('./skill-install').then((m) => m.skillCommand),
  },
});

runMain(main);
