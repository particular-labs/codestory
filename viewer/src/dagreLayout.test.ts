import { expect, test } from 'bun:test';
import { dagreLayout } from './dagreLayout';

// TDD guard for the pure dagre layout adapter (viewer-decompose P2). The parity
// snapshots only exercise dagreLayout indirectly through full-graph fixtures, so
// they never pin the degenerate/edge cases below. This file locks those directly.

test('empty graph returns the bare-padding degenerate guard', () => {
  expect(dagreLayout([], [], false, { main: 80, cross: 50 })).toEqual({
    pos: {},
    w: 64,
    h: 56,
  });
});

test('single node lands at the padding origin, canvas dims include 2x pad', () => {
  const boxes = [{ id: 'a', w: 100, h: 50 }];
  const layout = dagreLayout(boxes, [], false, { main: 80, cross: 50 });

  // top-left convention: x-pad is always 32, y-pad always 28 (PADX/PADY),
  // regardless of orientation.
  expect(layout.pos).toEqual({ a: { x: 32, y: 28 } });
  expect(layout.w).toBe(100 + 64); // w + 2*PADX
  expect(layout.h).toBe(50 + 56); // h + 2*PADY
});

test('center->top-left conversion yields non-negative, exact coordinates', () => {
  const boxes = [
    { id: 'a', w: 100, h: 50 },
    { id: 'b', w: 100, h: 50 },
  ];
  const { pos } = dagreLayout(boxes, [['a', 'b']], false, { main: 80, cross: 50 });

  expect(pos.a).toEqual({ x: 32, y: 28 });
  expect(pos.b).toEqual({ x: 212, y: 28 });
  for (const { x, y } of Object.values(pos)) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  }
});

test('vertical vs horizontal picks the flow axis for separation (rankdir LR vs TB)', () => {
  const boxes = [
    { id: 'a', w: 100, h: 50 },
    { id: 'b', w: 100, h: 50 },
  ];
  const gaps = { main: 80, cross: 50 };

  const horiz = dagreLayout(boxes, [['a', 'b']], false, gaps);
  // LR: separated on X by w + ransep(main), aligned on Y.
  expect(horiz.pos.b!.x - horiz.pos.a!.x).toBe(100 + 80);
  expect(horiz.pos.b!.y - horiz.pos.a!.y).toBe(0);

  const vert = dagreLayout(boxes, [['a', 'b']], true, gaps);
  // TB: separated on Y by h + ranksep(main), aligned on X.
  expect(vert.pos.b!.y - vert.pos.a!.y).toBe(50 + 80);
  expect(vert.pos.b!.x - vert.pos.a!.x).toBe(0);
});

test('cycles do not throw or hang; dagre resolves them via its internal acyclic pass', () => {
  const boxes = [
    { id: 'a', w: 100, h: 50 },
    { id: 'b', w: 100, h: 50 },
    { id: 'c', w: 100, h: 50 },
  ];
  const edges: Array<[string, string]> = [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'a'],
  ];

  let layout: ReturnType<typeof dagreLayout> | undefined;
  expect(() => {
    layout = dagreLayout(boxes, edges, false, { main: 80, cross: 50 });
  }).not.toThrow();

  const pos = layout!.pos;
  expect(Object.keys(pos).sort()).toEqual(['a', 'b', 'c']);
  for (const p of Object.values(pos)) {
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  }
  // non-vacuous: dagre must actually SPREAD the cycle, not collapse it to a single
  // point. A degenerate all-{0,0} result would satisfy the finite/non-negative
  // checks above, so assert at least two of the three nodes occupy distinct spots.
  const distinct = new Set(Object.values(pos).map((p) => `${p.x},${p.y}`));
  expect(distinct.size).toBeGreaterThanOrEqual(2);
});

test('reserved-word ids (constructor / __proto__ / next) lay out safely, not on the prototype', () => {
  // ids come from user-authored .codestory/*.journey.json, so a step named
  // `constructor` or `__proto__` must not throw (graphlib keys its node object by
  // id) nor land on the OUTPUT object's prototype. A uniform key prefix inside
  // dagreLayout + an Object.create(null) pos map guard both sides.
  const reserved = ['constructor', '__proto__', 'hasOwnProperty', 'toString', 'next'];
  const boxes = reserved.map((id) => ({ id, w: 100, h: 50 }));
  const edges: Array<[string, string]> = [
    ['constructor', '__proto__'],
    ['__proto__', 'hasOwnProperty'],
    ['hasOwnProperty', 'toString'],
    ['toString', 'next'],
    ['next', 'constructor'], // close the loop → also exercises the acyclic pass
  ];

  let layout: ReturnType<typeof dagreLayout> | undefined;
  expect(() => {
    layout = dagreLayout(boxes, edges, false, { main: 80, cross: 50 });
  }).not.toThrow();

  const pos = layout!.pos;
  // every reserved id is a real OWN key (Object.keys sees it — proves __proto__ did
  // not silently become a prototype assignment) with finite, non-negative coords.
  expect(Object.keys(pos).sort()).toEqual([...reserved].sort());
  for (const id of reserved) {
    const p = pos[id]!;
    expect(p).toBeDefined();
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  }
});

test('an edge endpoint missing from the box set is dropped, not thrown on', () => {
  const boxes = [{ id: 'a', w: 100, h: 50 }];
  const layout = dagreLayout(boxes, [['a', 'ghost']], false, { main: 80, cross: 50 });

  expect(layout.pos).toEqual({ a: { x: 32, y: 28 } });
  expect('ghost' in layout.pos).toBe(false);
});
