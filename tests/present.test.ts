import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/present';
import { validateDir } from '../src/validate';
import { readNotesFile, repo } from './fixtures';

function fixtureRepo(): string {
  return join(
    repo({
      '.codestory/codestory.json': {
        $schema: 'codestory/manifest.v0', version: 1, project: 'Demo',
        personas: [{ id: 'ops', title: 'Ops', start: { journey: 'alpha', entry: 'start' }, journeys: ['alpha'] }],
      },
      '.codestory/alpha.journey.json': {
        $schema: 'codestory/journey.v1', version: 1, id: 'alpha', title: 'Alpha',
        entries: ['start'], steps: [{ id: 'a', type: 'action', label: 'A' }],
      },
    }),
    '.codestory',
  );
}

function fakeDist(): string {
  const dist = mkdtempSync(join(tmpdir(), 'codestory-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>viewer</title>');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  return dist;
}

describe('present app', () => {
  test('GET /api/journeys returns manifest + journeys', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const res = await app.request('/api/journeys');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { manifest: { project: string }; journeys: Array<{ id: string }> };
    expect(body.manifest.project).toBe('Demo');
    expect(body.journeys).toHaveLength(1);
    expect(body.journeys[0]?.id).toBe('alpha');
  });

  test('serves index.html at / and assets by path', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const home = await app.request('/');
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('viewer');
    expect(home.headers.get('cache-control')).toBe('no-store'); // html shell must never cache
    const js = await app.request('/assets/app.js');
    expect(js.status).toBe(200);
    expect(await js.text()).toBe('console.log(1)'); // the asset itself, not the SPA fallback
    expect(js.headers.get('cache-control')).toBeNull(); // hashed assets stay cacheable
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
    const api = await app.request('/api/journeys');
    expect(api.status).toBe(200);
  });
});

const postJson = (body: unknown) =>
  new Request('http://x/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('notes API', () => {
  test('GET /api/journeys includes notes ([] when no notes.json)', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const body = (await (await app.request('/api/journeys')).json()) as { notes: unknown[] };
    expect(body.notes).toEqual([]);
  });

  test('POST creates a note, persists notes.json, GET returns it', async () => {
    const dir = fixtureRepo();
    const app = buildApp(dir, fakeDist());
    const res = await app.request(postJson({ journey: 'alpha', step: 'a', text: 'tighten this' }));
    expect(res.status).toBe(200);
    const note = (await res.json()) as { id: string; status: string; journey: string; step?: string; createdAt: string };
    expect(note.id).toBeTruthy();
    expect(note.status).toBe('open');
    expect(note.step).toBe('a');
    expect(note.createdAt).toMatch(/\dT\d/); // ISO-ish

    expect(existsSync(join(dir, 'notes.json'))).toBe(true);
    const persisted = readNotesFile(dir);
    expect(persisted.$schema).toBe('codestory/notes.v1');
    expect(persisted.notes).toHaveLength(1);

    const journeys = (await (await app.request('/api/journeys')).json()) as { notes: Array<{ id: string }> };
    expect(journeys.notes).toHaveLength(1);
    expect(journeys.notes[0]?.id).toBe(note.id);

    // notes.json written by the API stays valid
    const v = await validateDir(dir);
    expect(v.ok).toBe(true);
  });

  test('POST 400s on unknown journey or step', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    expect((await app.request(postJson({ journey: 'ghost', text: 'x' }))).status).toBe(400);
    expect((await app.request(postJson({ journey: 'alpha', step: 'nope', text: 'x' }))).status).toBe(400);
    expect((await app.request(postJson({ journey: 'alpha', text: '' }))).status).toBe(400);
    expect((await app.request(postJson({ text: 'no journey' }))).status).toBe(400);
  });

  test('POST with { id, status } flips status and persists', async () => {
    const dir = fixtureRepo();
    const app = buildApp(dir, fakeDist());
    const note = (await (await app.request(postJson({ journey: 'alpha', step: 'a', text: 'do it' }))).json()) as { id: string };

    const res = await app.request(postJson({ id: note.id, status: 'applied' }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('applied');

    const persisted = readNotesFile(dir);
    expect(persisted.notes[0]?.status).toBe('applied');
  });

  test('POST status flip 404s on unknown id', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const res = await app.request(postJson({ id: 'does-not-exist', status: 'applied' }));
    expect(res.status).toBe(404);
  });

  test('POST with { id, delete } removes the note and persists', async () => {
    const dir = fixtureRepo();
    const app = buildApp(dir, fakeDist());
    const note = (await (await app.request(postJson({ journey: 'alpha', step: 'a', text: 'scrap this' }))).json()) as { id: string };

    const res = await app.request(postJson({ id: note.id, delete: true }));
    expect(res.status).toBe(200);
    const persisted = readNotesFile(dir);
    expect(persisted.notes).toHaveLength(0);

    expect((await app.request(postJson({ id: note.id, delete: true }))).status).toBe(404);
  });

  test('POST with { clear } empties all notes', async () => {
    const dir = fixtureRepo();
    const app = buildApp(dir, fakeDist());
    await app.request(postJson({ journey: 'alpha', step: 'a', text: 'one' }));
    await app.request(postJson({ journey: 'alpha', text: 'two' }));

    const res = await app.request(postJson({ clear: true }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { cleared: number }).cleared).toBe(2);
    const persisted = readNotesFile(dir);
    expect(persisted.notes).toHaveLength(0);
    expect((await validateDir(dir)).ok).toBe(true);
  });

  test('GET /api/events is an SSE stream', async () => {
    const app = buildApp(fixtureRepo(), fakeDist());
    const res = await app.request('/api/events');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    await res.body?.cancel(); // don't leave the stream open
  });
});
