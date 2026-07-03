import { defineCommand } from 'citty';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Packaged skill assets: <packageRoot>/assets/skill. Resolve relative to this
// module (not cwd) so it works from `bun run src/cli.ts` and the bundled
// dist/cli.js alike — both sit one level under the package root, mirroring how
// present.ts locates viewer/dist. `assets/skill` must ship in package.json files.
const SKILL_SRC = resolve(fileURLToPath(import.meta.url), '..', '..', 'assets', 'skill');

// Any line already mentioning this path counts as an existing pointer.
const POINTER_MATCH = '.claude/skills/codestory';
const POINTER_LINE =
  '- **codestory** (`.claude/skills/codestory/SKILL.md`) — maintain flow boards; board-first, capture flows, apply codestory notes.';

export interface InstallResult {
  /** Directory the skill was copied into. */
  target: string;
  /** Path of the CLAUDE.md pointer file (always the target repo, i.e. cwd). */
  claudeMd: string;
  /** True when this run appended the pointer; false when it was already present. */
  pointerAppended: boolean;
}

/**
 * Copy the packaged skill into `.claude/skills/codestory/` (repo-local, or the
 * home dir with `global`), then append a one-line pointer to the target repo's
 * CLAUDE.md unless one already exists. Idempotent: re-copying overwrites same-name
 * files and the pointer is only ever added once.
 */
export function installSkill(cwd: string, opts: { global?: boolean; home?: string } = {}): InstallResult {
  const base = opts.global ? (opts.home ?? homedir()) : cwd;
  const target = resolve(base, '.claude', 'skills', 'codestory');
  mkdirSync(target, { recursive: true });
  cpSync(SKILL_SRC, target, { recursive: true });

  // Pointer always lands in the target repo's CLAUDE.md so the repo references
  // the skill, even when the skill itself was installed globally.
  const claudeMd = resolve(cwd, 'CLAUDE.md');
  const existing = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : '';
  let pointerAppended = false;
  if (!existing.includes(POINTER_MATCH)) {
    const sep = existing === '' || existing.endsWith('\n') ? '' : '\n';
    writeFileSync(claudeMd, `${existing}${sep}${POINTER_LINE}\n`);
    pointerAppended = true;
  }

  return { target, claudeMd, pointerAppended };
}

export const skillInstallCommand = defineCommand({
  meta: { name: 'install', description: 'Install the codestory Claude Code skill into .claude/skills/' },
  args: {
    global: {
      type: 'boolean',
      description: 'Install into ~/.claude/skills instead of ./.claude/skills',
      default: false,
    },
  },
  run({ args }) {
    const r = installSkill(process.cwd(), { global: args.global });
    console.log(`✓ installed codestory skill → ${r.target}`);
    console.log(
      r.pointerAppended
        ? `✓ appended pointer to ${r.claudeMd}`
        : `• ${r.claudeMd} already points at the skill — left as is`,
    );
  },
});

export const skillCommand = defineCommand({
  meta: { name: 'skill', description: 'Manage the codestory Claude Code skill' },
  subCommands: {
    install: skillInstallCommand,
  },
});
