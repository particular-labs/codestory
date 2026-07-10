import { describe, expect, test } from 'bun:test';
import { JourneySchema, ManifestSchema, NotesFileSchema } from '../src/schema';

const manifest = {
  $schema: 'codestory/manifest.v0',
  version: 1,
  project: 'Astro Outfitters',
  personas: [
    {
      id: 'shopper',
      title: 'Shopper',
      persona: 'telescope shopper',
      start: { journey: 'storefront', entry: 'start' },
      journeys: ['storefront', 'checkout'],
    },
  ],
};

// spec-grade journey straight from KB #182's example (vocabulary neutralized)
const journey = {
  $schema: 'codestory/journey.v1',
  version: 1,
  id: 'fulfillment',
  title: 'Fulfillment',
  status: 'planned',
  owner: 'demo',
  docs: ['kb://ddr-demo'],
  nonGoals: ['no auto-assign without accept'],
  entries: ['start'],
  exits: ['assigned', 'failed'],
  steps: [
    {
      id: 'trig',
      type: 'action',
      label: 'Order placed trigger',
      note: 'narration for play mode',
      refs: ['src/fulfillment/trigger.ts#OrderTrigger'],
      contract: { in: 'OrderFact', out: 'PickWindow' },
      acceptance: ['pick window opens within 5m of order'],
      data: ['orders', 'shipments'],
      actors: ['system'],
      effects: ['fact:pick.opened'],
      errors: [{ to: 'exit:failed', when: 'no packer available' }],
      status: 'planned',
      tests: ['tests/fulfillment/trigger.test.ts'],
      ticket: 'keel://ticket/123',
      ui: '/ops/orders',
    },
    { id: 'match', type: 'action', label: 'Assign packer', journey: 'packer-assign', with: { mode: 'ranked' } },
    { id: 'x', type: 'exit', port: 'assigned' },
  ],
  edges: [{ from: 'trig', to: 'match', label: 'window open', when: 'pool.size > 0' }],
  links: [{ exit: 'assigned', journey: 'shipping', entry: 'start' }],
};

describe('ManifestSchema', () => {
  test('parses the spec example', () => {
    const m = ManifestSchema.parse(manifest);
    expect(m.project).toBe('Astro Outfitters');
    expect(m.personas[0]?.start.journey).toBe('storefront');
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
    expect(b.id).toBe('fulfillment');
    expect(b.steps).toHaveLength(3);
    expect(b.links[0]?.entry).toBe('start');
  });

  test('minimal journey = steps+edges envelope only', () => {
    const b = JourneySchema.parse({
      $schema: 'codestory/journey.v1',
      version: 1,
      id: 'mini',
      title: 'Mini',
      steps: [{ id: 'a', type: 'action', label: 'A' }],
    });
    expect(b.status).toBe('planned'); // defaults
    expect(b.edges).toEqual([]);
    expect(b.exits).toEqual([]);
  });

  test('rejects unknown step type', () => {
    const bad = { ...journey, steps: [{ id: 'a', type: 'subflow', label: 'A' }] };
    expect(() => JourneySchema.parse(bad)).toThrow();
  });

  test('step step requires label', () => {
    const bad = { ...journey, steps: [{ id: 'a', type: 'action' }] };
    expect(() => JourneySchema.parse(bad)).toThrow(/label/);
  });

  test('exit step requires port, label optional', () => {
    const noPort = { ...journey, steps: [{ id: 'a', type: 'exit' }] };
    expect(() => JourneySchema.parse(noPort)).toThrow(/port/);
    const ok = { ...journey, steps: [{ id: 'a', type: 'exit', port: 'assigned' }] };
    expect(JourneySchema.parse(ok).steps[0]?.port).toBe('assigned');
  });

  test('rejects unknown keys (agent typo guard)', () => {
    const bad = { ...journey, steps: [{ id: 'a', type: 'action', label: 'A', lable: 'typo' }] };
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
  $schema: 'codestory/notes.v1',
  version: 1,
  notes: [
    { id: 'n1', journey: 'fulfillment', step: 'trig', text: 'tighten the window', status: 'open', createdAt: '2026-07-03T00:00:00.000Z' },
    { id: 'n2', journey: 'fulfillment', text: 'journey-level note, no step', status: 'applied', createdAt: '2026-07-03T00:00:00.000Z' },
  ],
};

describe('NotesFileSchema', () => {
  test('parses a valid notes file', () => {
    const f = NotesFileSchema.parse(notesFile);
    expect(f.notes).toHaveLength(2);
    expect(f.notes[0]?.step).toBe('trig');
    expect(f.notes[1]?.step).toBeUndefined(); // step is optional
  });

  test('status defaults to open', () => {
    const f = NotesFileSchema.parse({
      $schema: 'codestory/notes.v1', version: 1,
      notes: [{ id: 'n', journey: 'b', text: 't', createdAt: '2026-07-03T00:00:00.000Z' }],
    });
    expect(f.notes[0]?.status).toBe('open');
  });

  test('rejects wrong $schema', () => {
    expect(() => NotesFileSchema.parse({ ...notesFile, $schema: 'codestory/notes.v0' })).toThrow();
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
