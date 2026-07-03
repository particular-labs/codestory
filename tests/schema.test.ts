import { describe, expect, test } from 'bun:test';
import { BoardSchema, ManifestSchema, NotesFileSchema } from '../src/schema';

const manifest = {
  $schema: 'codestory/manifest.v0',
  version: 1,
  project: 'AstroDemo',
  journeys: [
    {
      id: 'owner',
      title: 'Owner',
      persona: 'STR property owner',
      start: { board: 'booking-sync', entry: 'start' },
      boards: ['booking-sync', 'payout-noi'],
    },
  ],
};

// spec-grade board straight from KB #182's example
const board = {
  $schema: 'codestory/board.v0',
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
    { id: 'match', type: 'step', label: 'Match cleaner', board: 'match-cleaner', with: { mode: 'ranked' } },
    { id: 'x', type: 'exit', port: 'assigned' },
  ],
  edges: [{ from: 'trig', to: 'match', label: 'window open', when: 'pool.size > 0' }],
  links: [{ exit: 'assigned', board: 'cleaning-job', entry: 'start' }],
};

describe('ManifestSchema', () => {
  test('parses the spec example', () => {
    const m = ManifestSchema.parse(manifest);
    expect(m.project).toBe('AstroDemo');
    expect(m.journeys[0]?.start.board).toBe('booking-sync');
  });

  test('rejects wrong $schema', () => {
    expect(() => ManifestSchema.parse({ ...manifest, $schema: 'codestory/manifest.v1' })).toThrow();
  });

  test('rejects journey without start', () => {
    const bad = { ...manifest, journeys: [{ id: 'x', title: 'X', boards: [] }] };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });
});

describe('BoardSchema', () => {
  test('parses the spec example', () => {
    const b = BoardSchema.parse(board);
    expect(b.id).toBe('turnover-dispatch');
    expect(b.nodes).toHaveLength(3);
    expect(b.links[0]?.entry).toBe('start');
  });

  test('minimal board = nodes+edges envelope only', () => {
    const b = BoardSchema.parse({
      $schema: 'codestory/board.v0',
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
    const bad = { ...board, nodes: [{ id: 'a', type: 'subflow', label: 'A' }] };
    expect(() => BoardSchema.parse(bad)).toThrow();
  });

  test('step node requires label', () => {
    const bad = { ...board, nodes: [{ id: 'a', type: 'step' }] };
    expect(() => BoardSchema.parse(bad)).toThrow(/label/);
  });

  test('exit node requires port, label optional', () => {
    const noPort = { ...board, nodes: [{ id: 'a', type: 'exit' }] };
    expect(() => BoardSchema.parse(noPort)).toThrow(/port/);
    const ok = { ...board, nodes: [{ id: 'a', type: 'exit', port: 'assigned' }] };
    expect(BoardSchema.parse(ok).nodes[0]?.port).toBe('assigned');
  });

  test('rejects unknown keys (agent typo guard)', () => {
    const bad = { ...board, nodes: [{ id: 'a', type: 'step', label: 'A', lable: 'typo' }] };
    expect(() => BoardSchema.parse(bad)).toThrow();
  });

  test('rejects non-integer version', () => {
    expect(() => BoardSchema.parse({ ...board, version: 1.5 })).toThrow();
  });

  test('rejects bad status', () => {
    expect(() => BoardSchema.parse({ ...board, status: 'done' })).toThrow();
  });
});

const notesFile = {
  $schema: 'codestory/notes.v0',
  version: 1,
  notes: [
    { id: 'n1', board: 'turnover-dispatch', node: 'trig', text: 'tighten the window', status: 'open', createdAt: '2026-07-03T00:00:00.000Z' },
    { id: 'n2', board: 'turnover-dispatch', text: 'board-level note, no node', status: 'applied', createdAt: '2026-07-03T00:00:00.000Z' },
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
      notes: [{ id: 'n', board: 'b', text: 't', createdAt: '2026-07-03T00:00:00.000Z' }],
    });
    expect(f.notes[0]?.status).toBe('open');
  });

  test('rejects wrong $schema', () => {
    expect(() => NotesFileSchema.parse({ ...notesFile, $schema: 'codestory/notes.v1' })).toThrow();
  });

  test('rejects empty text and empty id', () => {
    expect(() => NotesFileSchema.parse({ ...notesFile, notes: [{ id: '', board: 'b', text: 't', createdAt: 'x' }] })).toThrow();
    expect(() => NotesFileSchema.parse({ ...notesFile, notes: [{ id: 'n', board: 'b', text: '', createdAt: 'x' }] })).toThrow();
  });

  test('rejects unknown status and unknown keys', () => {
    expect(() => NotesFileSchema.parse({ ...notesFile, notes: [{ id: 'n', board: 'b', text: 't', status: 'closed', createdAt: 'x' }] })).toThrow();
    expect(() => NotesFileSchema.parse({ ...notesFile, notes: [{ id: 'n', board: 'b', text: 't', createdAt: 'x', oops: 1 }] })).toThrow();
  });
});
