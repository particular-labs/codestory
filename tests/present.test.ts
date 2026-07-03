import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/present';

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'codestory-present-'));
  const dir = join(root, '.codestory');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'codestory.json'), JSON.stringify({
    $schema: 'codestory/manifest.v0', version: 1, project: 'Demo',
    journeys: [{ id: 'ops', title: 'Ops', start: { board: 'alpha', entry: 'start' }, boards: ['alpha'] }],
  }));
  writeFileSync(join(dir, 'alpha.board.json'), JSON.stringify({
    $schema: 'codestory/board.v0', version: 1, id: 'alpha', title: 'Alpha',
    entries: ['start'], nodes: [{ id: 'a', type: 'step', label: 'A' }],
  }));
  return dir;
}

function fakeDist(): string {
  const dist = mkdtempSync(join(tmpdir(), 'codestory-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>viewer</title>');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  return dist;
}

describe('present app', () => {
  test('GET /api/boards returns manifest + boards', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const res = await app.request('/api/boards');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { manifest: { project: string }; boards: Array<{ id: string }> };
    expect(body.manifest.project).toBe('Demo');
    expect(body.boards).toHaveLength(1);
    expect(body.boards[0]?.id).toBe('alpha');
  });

  test('serves index.html at / and assets by path', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const home = await app.request('/');
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('viewer');
    const js = await app.request('/assets/app.js');
    expect(js.status).toBe(200);
    expect(await js.text()).toBe('console.log(1)'); // the asset itself, not the SPA fallback
  });

  test('unknown path falls back to index.html (SPA)', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const res = await app.request('/some/route');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('viewer');
  });

  test('path traversal is rejected', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const res = await app.request('/../../etc/passwd');
    expect([200, 404]).toContain(res.status); // never the file itself
    if (res.status === 200) expect(await res.text()).toContain('viewer');
  });

  test('missing viewer bundle → helpful message, api still works', async () => {
    const app = buildApp(fixtureRepo(), join(tmpdir(), 'codestory-nonexistent-dist'));
    const home = await app.request('/');
    expect(await home.text()).toContain('bun run build:viewer');
    const api = await app.request('/api/boards');
    expect(api.status).toBe(200);
  });
});
