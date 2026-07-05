import { describe, expect, test } from 'bun:test';
import { needsUpgrade, upgrade } from '../src/migrate';

// v0 = the pre-rename format: journey.nodes, step type 'step', note.node
const v0Journey = {
  $schema: 'codestory/journey.v0',
  version: 1,
  id: 'signup',
  title: 'Signup',
  entries: ['start'],
  exits: ['done'],
  nodes: [
    { id: 'start', type: 'step', label: 'Open form' },
    { id: 'branch', type: 'decision', label: 'Valid?' },
    { id: 'out', type: 'exit', port: 'done' },
  ],
  edges: [{ from: 'start', to: 'branch' }],
};

const v0Notes = {
  $schema: 'codestory/notes.v0',
  version: 1,
  notes: [{ id: 'n1', journey: 'signup', node: 'start', text: 'fix', status: 'open', createdAt: 'x' }],
};

describe('upgrade (versioned migration chain)', () => {
  test('v0 journey → v1: nodes→steps, type step→action, $schema bumped, no nodes key', () => {
    const j = upgrade(v0Journey) as { $schema: string; steps: Array<{ type: string; label?: string }>; edges: unknown };
    expect(j.$schema).toBe('codestory/journey.v1');
    expect('nodes' in j).toBe(false);
    expect(j.steps.map((s) => s.type)).toEqual(['action', 'decision', 'exit']);
    expect(j.steps[0]?.label).toBe('Open form'); // other fields preserved
    expect(j.edges).toEqual(v0Journey.edges);
  });

  test('v0 notes → v1: note.node → note.step', () => {
    const f = upgrade(v0Notes) as { $schema: string; notes: Array<{ step?: string; node?: string }> };
    expect(f.$schema).toBe('codestory/notes.v1');
    expect(f.notes[0]?.step).toBe('start');
    expect(f.notes[0] && 'node' in f.notes[0]).toBe(false);
  });

  test('already-latest is a no-op (idempotent)', () => {
    const once = upgrade(v0Journey);
    expect(upgrade(once)).toEqual(once);
    expect(needsUpgrade(once)).toBe(false);
  });

  test('needsUpgrade true for an old format', () => {
    expect(needsUpgrade(v0Journey)).toBe(true);
  });

  test('unknown $schema is returned untouched', () => {
    const alien = { $schema: 'something/else.v9', x: 1 };
    expect(upgrade(alien)).toEqual(alien);
  });
});
