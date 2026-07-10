import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldDir } from '../src/init';
import {
  appendNoteHandler,
  getJourneyContextHandler,
  getJourneyHandler,
  listJourneysHandler,
  setNoteStatusHandler,
  validateHandler,
} from '../src/mcp-tools';
import { aBetaJourneyDir, readNotesFile } from './fixtures';

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), 'codestory-mcp-'));
  const dir = join(root, '.codestory');
  scaffoldDir(dir, 'Demo');
  return dir;
}

describe('list_journeys', () => {
  test('lists journeys with id/title/status/entries/exits', async () => {
    const journeys = await listJourneysHandler(scaffold());
    expect(journeys).toHaveLength(1);
    expect(journeys[0]).toMatchObject({ id: 'example', title: 'Example journey', status: 'planned', entries: ['start'], exits: [] });
  });

  test('empty array when the directory has no journey files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codestory-mcp-empty-'));
    const dir = join(root, '.codestory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'codestory.json'), JSON.stringify({ $schema: 'codestory/manifest.v0', version: 1, project: 'Empty', personas: [] }));
    expect(await listJourneysHandler(dir)).toEqual([]);
  });
});

describe('get_journey', () => {
  test('returns the full journey by id', async () => {
    const journey = await getJourneyHandler(scaffold(), { id: 'example' });
    expect(journey?.id).toBe('example');
    expect(journey?.steps).toHaveLength(2);
  });

  test('returns null for an unknown id', async () => {
    expect(await getJourneyHandler(scaffold(), { id: 'ghost' })).toBeNull();
  });
});

describe('validate', () => {
  test('wraps validateDir directly — same ok/issues/journeys shape', async () => {
    const r = await validateHandler(scaffold());
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.journeys).toHaveLength(1);
    expect(r.manifest?.project).toBe('Demo');
  });

  test('surfaces issues on a broken directory instead of throwing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codestory-mcp-broken-'));
    const dir = join(root, '.codestory');
    mkdirSync(dir, { recursive: true });
    const r = await validateHandler(dir);
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe('append_note', () => {
  test('appends a note against a known journey + step and persists it', async () => {
    const dir = scaffold();
    const r = await appendNoteHandler(dir, { journey: 'example', step: 'start', text: 'tighten this' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.note.journey).toBe('example');
    expect(r.note.step).toBe('start');
    expect(r.note.status).toBe('open');

    const persisted = readNotesFile(dir);
    expect(persisted.notes).toHaveLength(1);
    expect(persisted.notes[0]?.id).toBe(r.note.id);
  });

  test('rejects an unknown journey without writing', async () => {
    const dir = scaffold();
    const r = await appendNoteHandler(dir, { journey: 'ghost', text: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toContain('ghost');
  });

  test('rejects an unknown step on a known journey', async () => {
    const dir = scaffold();
    const r = await appendNoteHandler(dir, { journey: 'example', step: 'nope', text: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toContain('nope');
  });
});

describe('set_note_status', () => {
  test('flips an existing note to applied and persists it', async () => {
    const dir = scaffold();
    const created = await appendNoteHandler(dir, { journey: 'example', text: 'do it' });
    if (!created.ok) throw new Error('setup failed');

    const r = await setNoteStatusHandler(dir, { id: created.note.id, status: 'applied' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.note.status).toBe('applied');

    const persisted = readNotesFile(dir);
    expect(persisted.notes[0]?.status).toBe('applied');
  });

  test('errors on an unknown note id', async () => {
    const r = await setNoteStatusHandler(scaffold(), { id: 'does-not-exist', status: 'applied' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toContain('does-not-exist');
  });
});

describe('get_journey_context', () => {
  test('formats the journey and includes sub/linked journeys one level deep', async () => {
    const r = await getJourneyContextHandler(aBetaJourneyDir(), { id: 'alpha' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.markdown).toContain('Alpha');
    expect(r.markdown).toContain('Beta');
  });

  test('errors on an unknown journey id', async () => {
    const r = await getJourneyContextHandler(aBetaJourneyDir(), { id: 'ghost' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toContain('ghost');
  });
});
