import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSkill } from '../src/skill-install';

const pointerLines = (md: string) => md.split('\n').filter((l) => l.includes('.claude/skills/codestory'));

describe('skill install', () => {
  test('copies skill files and appends a CLAUDE.md pointer, idempotently', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'codestory-skill-'));

    const first = installSkill(cwd, { global: false });
    expect(existsSync(join(cwd, '.claude/skills/codestory/SKILL.md'))).toBe(true);
    expect(first.pointerAppended).toBe(true);

    const claudeMd = join(cwd, 'CLAUDE.md');
    expect(existsSync(claudeMd)).toBe(true);
    expect(pointerLines(readFileSync(claudeMd, 'utf8'))).toHaveLength(1);

    // second run: re-copies (fine) but must not add a second pointer line
    const second = installSkill(cwd, { global: false });
    expect(second.pointerAppended).toBe(false);
    expect(pointerLines(readFileSync(claudeMd, 'utf8'))).toHaveLength(1);
  });

  test('appends to an existing CLAUDE.md without clobbering its content', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'codestory-skill-existing-'));
    writeFileSync(join(cwd, 'CLAUDE.md'), '# My rules\n\nExisting content.\n');

    installSkill(cwd, { global: false });

    const md = readFileSync(join(cwd, 'CLAUDE.md'), 'utf8');
    expect(md).toContain('Existing content.');
    expect(pointerLines(md)).toHaveLength(1);
  });

  test('--global installs into the provided home dir, pointer still in the repo', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'codestory-skill-cwd-'));
    const home = mkdtempSync(join(tmpdir(), 'codestory-skill-home-'));

    const r = installSkill(cwd, { global: true, home });

    expect(existsSync(join(home, '.claude/skills/codestory/SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.claude/skills/codestory'))).toBe(false);
    expect(r.target.startsWith(home)).toBe(true);
    expect(pointerLines(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8'))).toHaveLength(1);
  });
});
