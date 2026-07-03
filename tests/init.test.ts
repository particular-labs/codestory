import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldDir } from '../src/init';
import { validateDir } from '../src/validate';

describe('init scaffold', () => {
  test('scaffolds a .codestory/ that passes validate with zero issues', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codestory-init-'));
    const dir = join(root, '.codestory');
    scaffoldDir(dir, 'MyProject');

    expect(existsSync(join(dir, 'codestory.json'))).toBe(true);
    expect(existsSync(join(dir, 'example.journey.json'))).toBe(true);

    const r = await validateDir(dir);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.manifest?.project).toBe('MyProject');
    expect(r.manifest?.personas).toHaveLength(1);
    expect(r.journeys).toHaveLength(1);
    expect(r.journeys[0]?.id).toBe('example');
  });
});
