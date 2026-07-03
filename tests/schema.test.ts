import { describe, expect, test } from 'bun:test';
import { JourneySchema, ManifestSchema, NotesFileSchema } from '../src/schema';

const manifest = {
  $schema: 'codestory/manifest.v0',
  version: 1,
  project: 'AstroDemo',
  personas: [
    {
      id: 'owner',
      title: 'Owner',
      persona: 'STR property owner',
      start: { journey: 'booking-sync', entry: 'start' },
      journeys: ['booking-sync', 'payout-noi'],
    },
  ],
};

// spec-grade journey straight from KB #182's example
const journey = {
  $schema: 'codestory/journey.v0',
  version: 1,
  id: 'turnover-dispatch',
  title: 'Turnover dispatch',
  status: 'planned',
  owner: 'lennick',
  docs: ['kb://ddr-astrodemo'],
  nonGoals: ['no auto-assign without accept'],
  entries: ['start'],
  exits: ['assigned', 'failed'],
  nodes: [
    {
      id: 'trig',
      type: 'step',
      label: 'Checkout trigger',
      note: 'narration for play mode',
      refs: ['src/dispatch/trigger.ts#TurnoverTrigger'],
      contract: { in: 'BookingFact', out: 'TurnoverWindow' },
      acceptance: ['window opens within 5m of checkout'],
      data: ['turnovers', 'bookings'],
      actors: ['system'],
      effects: ['fact:turnover.opened'],
      errors: [{ to: 'exit:failed', when: 'no cleaner pool' }],
      status: 'planned',
      tests: ['tests/dispatch/trigger.test.ts'],
      ticket: 'keel://ticket/123',
      ui: '/ops/turnovers',
    },
    { id: 'match', type: 'step', label: 'Match cleaner', journey: 'match-cleaner', with: { mode: 'ranked' } },
    { id: 'x', type: 'exit', port: 'assigned' },
  ],
  edges: [{ from: 'trig', to: 'match', label: 'window open', when: 'pool.size > 0' }],
  links: [{ exit: 'assigned', journey: 'cleaning-job', entry: 'start' }],
};

describe('ManifestSchema', () => {
  test('parses the spec example', () => {
    const m = ManifestSchema.parse(manifest);
    expect(m.project).toBe('AstroDemo');
    expect(m.personas[0]?.start.journey).toBe('booking-sync');
  });

  test('rejects wrong $schema', () => {
    expect(() => ManifestSchema.parse({ ...manifest, $schema: 'codestory/manifest.v1' })).toThrow();
  });

  test('rejects persona without start', () => {
    const bad = { ...manifest, personas: [{ id: 'x', title: 'X', journeys: [] }] };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });
});

describe('JourneySchema', () => {
  test('parses the spec example', () => {
    const b = JourneySchema.parse(journey);
    expect(b.id).toBe('turnover-dispatch');
    expect(b.nodes).toHaveLength(3);
    expect(b.links[0]?.entry).toBe('start');
  });

  test('minimal journey = nodes+edges envelope only', () => {
    const b = JourneySchema.parse({
      $schema: 'codestory/journey.v0',
      version: 1,
      id: 'mini',
      title: 'Mini',
      nodes: [{ id: 'a', type: 'step', label: 'A' }],
    });
    expect(b.status).toBe('planned'); // defaults
    expect(b.edges).toEqual([]);
    expect(b.exits).toEqual([]);
  });

  test('rejects unknown node type', () => {
    const bad = { ...journey, nodes: [{ id: 'a', type: 'subflow', label: 'A' }] };
    expect(() => JourneySchema.parse(bad)).toThrow();
  });

  test('step node requires label', () => {
    const bad = { ...journey, nodes: [{ id: 'a', type: 'step' }] };
    expect(() => JourneySchema.parse(bad)).toThrow(/label/);
  });

  test('exit node requires port, label optional', () => {
    const noPort = { ...journey, nodes: [{ id: 'a', type: 'exit' }] };
    expect(() => JourneySchema.parse(noPort)).toThrow(/port/);
    const ok = { ...journey, nodes: [{ id: 'a', type: 'exit', port: 'assigned' }] };
    expect(JourneySchema.parse(ok).nodes[0]?.port).toBe('assigned');
  });

  test('rejects unknown keys (agent typo guard)', () => {
    const bad = { ...journey, nodes: [{ id: 'a', type: 'step', label: 'A', lable: 'typo' }] };
    expect(() => JourneySchema.parse(bad)).toThrow();
  });

  test('rejects non-integer version', () => {
    expect(() => JourneySchema.parse({ ...journey, version: 1.5 })).toThrow();
  });

  test('rejects bad status', () => {
    expect(() => JourneySchema.parse({ ...journey, status: 'done' })).toThrow();
  });
});

const notesFile = {
  $schema: 'codestory/notes.v0',
  version: 1,
  notes: [
    { id: 'n1', journey: 'turnover-dispatch', node: 'trig', text: 'tighten the window', status: 'open', createdAt: '2026-07-03T00:00:00.000Z' },
    { id: 'n2', journey: 'turnover-dispatch', text: 'journey-level note, no node', status: 'applied', createdAt: '2026-07-03T00:00:00.000Z' },
  ],
};

describe('NotesFileSchema', () => {
  test('parses a valid notes file', () => {
    const f = NotesFileSchema.parse(notesFile);
    expect(f.notes).toHaveLength(2);
    expect(f.notes[0]?.node).toBe('trig');
    expect(f.notes[1]?.node).toBeUndefined(); // node is optional
  });

  test('status defaults to open', () => {
    const f = NotesFileSchema.parse({
      $schema: 'codestory/notes.v0', version: 1,
      notes: [{ id: 'n', journey: 'b', text: 't', createdAt: '2026-07-03T00:00:00.000Z' }],
    });
    expect(f.notes[0]?.status).toBe('open');
  });

  test('rejects wrong $schema', () => {
    expect(() => NotesFileSchema.parse({ ...notesFile, $schema: 'codestory/notes.v1' })).toThrow();
  });

  test('rejects empty text and empty id', () => {
    expect(() => NotesFileSchema.parse({ ...notesFile, notes: [{ id: '', journey: 'b', text: 't', createdAt: 'x' }] })).toThrow();
    expect(() => NotesFileSchema.parse({ ...notesFile, notes: [{ id: 'n', journey: 'b', text: '', createdAt: 'x' }] })).toThrow();
  });

  test('rejects unknown status and unknown keys', () => {
    expect(() => NotesFileSchema.parse({ ...notesFile, notes: [{ id: 'n', journey: 'b', text: 't', status: 'closed', createdAt: 'x' }] })).toThrow();
    expect(() => NotesFileSchema.parse({ ...notesFile, notes: [{ id: 'n', journey: 'b', text: 't', createdAt: 'x', oops: 1 }] })).toThrow();
  });
});
