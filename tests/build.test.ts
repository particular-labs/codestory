import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStatic, gitignoreTip, injectData } from '../src/build';
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
    expect(out).toContain('\\u003c/script'); // the `<` of `</script` is escaped
  });

  // Extract the JSON text of our injected `window.__CODESTORY_DATA__ = <json></script>`.
  const injectedJson = (out: string): string => {
    const marker = 'window.__CODESTORY_DATA__ = ';
    const after = out.slice(out.indexOf(marker) + marker.length);
    return after.slice(0, after.indexOf('</script>'));
  };

  test('escapes EVERY `<` so a `<!--<script` payload cannot flip the HTML tokenizer', () => {
    // `<!--` then `<script` drives the parser into "double-escaped" script state,
    // where our old `</script`-only escape was insufficient. Escaping every `<` kills it.
    const out = injectData('<script src="x"></script>', { note: '<!--<script>alert(1)</script>-->' });
    const inner = injectedJson(out);
    expect(inner.includes('<')).toBe(false); // no raw `<` survives in the payload
  });

  test('round-trips: the escaped JSON parses back to the input data', () => {
    const data = { note: '<!--<script>evil</script>-->', label: 'a < b && c </div>', nested: { x: [1, '<x>'] } };
    const inner = injectedJson(injectData('<script src="x"></script>', data));
    expect(inner.includes('<')).toBe(false); // fully escaped in the emitted HTML
    expect(JSON.parse(inner)).toEqual(data); // `<` parses natively back to `<`
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

  test('rebuild wipes stale files left by a previous build', async () => {
    const dir = fixtureRepo();
    const out = outDir();
    const dist = fakeDist();
    await buildStatic({ dir, out, dist });
    writeFileSync(join(out, 'stale.txt'), 'leftover from an earlier build'); // stray artifact
    await buildStatic({ dir, out, dist });
    expect(existsSync(join(out, 'stale.txt'))).toBe(false); // gone after the rebuild
    expect(existsSync(join(out, 'index.html'))).toBe(true); // fresh build in place
  });

  test('refuses to overwrite a non-empty dir that is not a build artifact', async () => {
    const dir = fixtureRepo();
    const out = outDir();
    writeFileSync(join(out, 'important.txt'), 'do not delete'); // e.g. an accidental `-o src`
    const r = await buildStatic({ dir, out, dist: fakeDist() });
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.message).toMatch(/not a codestory build|refus/i);
    expect(existsSync(join(out, 'important.txt'))).toBe(true); // left untouched
    expect(existsSync(join(out, 'index.html'))).toBe(false); // nothing emitted
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

  test('gitignoreTip suggests the out dir when .gitignore does not cover it', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'codestory-gi-'));
    expect(gitignoreTip(join(cwd, 'codestory-dist'), cwd)).toBe('tip: add codestory-dist/ to .gitignore');
  });

  test('gitignoreTip stays silent when .gitignore already covers the out dir', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'codestory-gi2-'));
    writeFileSync(join(cwd, '.gitignore'), 'node_modules\ncodestory-dist/\n');
    expect(gitignoreTip(join(cwd, 'codestory-dist'), cwd)).toBeNull();
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
