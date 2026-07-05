import { describe, expect, test } from 'bun:test';
import { summarize } from '../viewer/src/export-meta';

describe('summarize (export legend)', () => {
  test('counts steps, built, exits', () => {
    expect(summarize([
      { type: 'action', status: 'built' },
      { type: 'decision', status: 'planned' },
      { type: 'exit', status: 'built' },
    ])).toBe('3 steps · 2 built · 1 exit');
  });

  test('singularizes and appends sub-flows', () => {
    expect(summarize([{ type: 'action', journey: 'child' }])).toBe('1 step · 0 built · 0 exits · 1 sub-flow');
  });

  test('handles empty', () => {
    expect(summarize([])).toBe('0 steps · 0 built · 0 exits');
  });
});
