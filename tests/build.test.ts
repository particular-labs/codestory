import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStatic, injectData } from '../src/build';
import { scaffoldDir } from '../src/init';

/** A valid scaffolded repo (parent of .codestory), returns the .codestory dir. */
function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'codestory-build-'));
  const dir = join(root, '.codestory');
  scaffoldDir(dir, 'BuildDemo');
  return dir;
}

/** A minimal fake shipped viewer bundle (mirrors present.test.ts's fakeDist). */
function fakeDist(): string {
  const dist = mkdtempSync(join(tmpdir(), 'codestory-builddist-'));
  writeFileSync(
    join(dist, 'index.html'),
    '<!doctype html><title>viewer</title><script type="module" src="/assets/app.js"></script>',
  );
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  return dist;
}

const outDir = () => mkdtempSync(join(tmpdir(), 'codestory-out-'));

describe('injectData', () => {
  test('injects the data global BEFORE the bundle script tag', () => {
    const html = '<head><script type="module" src="/assets/app.js"></script></head>';
    const out = injectData(html, { journeys: [] });
    const dataIdx = out.indexOf('window.__CODESTORY_DATA__');
    const bundleIdx = out.indexOf('src="/assets/app.js"');
    expect(dataIdx).toBeGreaterThan(-1);
    expect(dataIdx).toBeLessThan(bundleIdx); // payload runs first
  });

  test('escapes </script> in the payload so it cannot break out of the tag', () => {
    const out = injectData('<script src="x"></script>', { note: 'evil </script><script>alert(1)</script>' });
    expect(out).not.toMatch(/<\/script>\s*<script>alert/); // no real closing tag from the payload
    expect(out).toContain('<\\/script>'); // escaped form present
  });
});

describe('codestory build', () => {
  test('valid repo → copies bundle + injects data script', async () => {
    const dir = fixtureRepo();
    const out = outDir();
    const r = await buildStatic({ dir, out, dist: fakeDist() });
    expect(r.ok).toBe(true);

    const indexPath = join(out, 'index.html');
    expect(existsSync(indexPath)).toBe(true);
    expect(existsSync(join(out, 'assets', 'app.js'))).toBe(true); // bundle copied

    const html = readFileSync(indexPath, 'utf8');
    expect(html).toContain('window.__CODESTORY_DATA__');
    expect(html).toContain('"example"'); // the scaffolded journey id is in the payload
    expect(html.indexOf('window.__CODESTORY_DATA__')).toBeLessThan(html.indexOf('src="/assets/app.js"'));
  });

  test('invalid repo → ok:false, no output written', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codestory-bad-'));
    const dir = join(root, '.codestory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'codestory.json'), '{ not valid json');
    const out = outDir();
    const r = await buildStatic({ dir, out, dist: fakeDist() });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
    expect(existsSync(join(out, 'index.html'))).toBe(false); // nothing emitted on failure
  });

  test('CLI exits 1 on invalid data', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codestory-badcli-'));
    const dir = join(root, '.codestory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'codestory.json'), '{ not valid json');
    const proc = Bun.spawnSync([
      'bun', 'run', join(import.meta.dir, '..', 'src', 'cli.ts'), 'build', '--dir', dir, '-o', join(root, 'dist'),
    ]);
    expect(proc.exitCode).toBe(1);
  });
});
