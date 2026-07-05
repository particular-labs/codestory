import { describe, expect, test } from 'bun:test';
import { frameOffset } from '../viewer/src/frame';

describe('frameOffset', () => {
  test('no negative coords → no shift, extent = right/bottom edge', () => {
    expect(frameOffset([{ x: 0, y: 0, w: 100, h: 50 }, { x: 200, y: 100, w: 100, h: 50 }]))
      .toEqual({ dx: 0, dy: 0, w: 300, h: 150 });
  });

  test('a step dragged left/up shifts everything back into positive space', () => {
    // leftmost at x=-40, topmost at y=-10 → shift by (40,10); extent includes the shift
    expect(frameOffset([{ x: -40, y: -10, w: 100, h: 50 }, { x: 160, y: 100, w: 100, h: 50 }]))
      .toEqual({ dx: 40, dy: 10, w: 300, h: 160 });
  });

  test('empty canvas is a no-op', () => {
    expect(frameOffset([])).toEqual({ dx: 0, dy: 0, w: 0, h: 0 });
  });
});
