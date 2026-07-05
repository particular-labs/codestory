import { describe, expect, test } from 'bun:test';
import { EMPTY_LOC, parseLocation, relevantLoc, serializeLocation, type Loc } from '../viewer/src/urlState';

const roundtrip = (loc: Loc) => parseLocation(serializeLocation(loc));

describe('urlState codec', () => {
  test('empty location serializes to empty string', () => {
    expect(serializeLocation(EMPTY_LOC)).toBe('');
    expect(parseLocation('')).toEqual(EMPTY_LOC);
  });

  test('round-trips a drill-down with step, persona, variants', () => {
    const loc: Loc = {
      journeys: ['intake', 'matching'],
      step: 'requested',
      persona: 'customer',
      variants: { intake: 'intake@v2' },
    };
    expect(roundtrip(loc)).toEqual(loc);
  });

  test('serializes with descriptive keys', () => {
    expect(serializeLocation({ journeys: ['a', 'b'], step: 's1', persona: null, variants: {} }))
      .toBe('journeys=a~b&step=s1');
  });

  test('map view with only a persona lens', () => {
    const loc: Loc = { journeys: [], step: null, persona: 'ops', variants: {} };
    expect(serializeLocation(loc)).toBe('persona=ops');
    expect(roundtrip(loc)).toEqual(loc);
  });

  test('drops malformed variant pairs, keeps good ones', () => {
    // ':x' (empty base) and 'bare' (no colon) are dropped; 'b:b@v' survives
    expect(parseLocation('variants=:x,bare,b:b@v').variants).toEqual({ b: 'b@v' });
  });

  test('tolerates a leading ? and unknown params', () => {
    expect(parseLocation('?journeys=x&junk=1').journeys).toEqual(['x']);
  });
});

describe('relevantLoc (stale-param pruning)', () => {
  test('drops a step when there is no journey (map view)', () => {
    expect(relevantLoc({ journeys: [], step: 'stale', persona: 'ops', variants: {} }))
      .toEqual({ journeys: [], step: null, persona: 'ops', variants: {} });
  });

  test('drops variants whose base is no longer in the drill-down', () => {
    const loc: Loc = { journeys: ['b'], step: 'x', persona: null, variants: { a: 'a@v2', b: 'b@v2' } };
    expect(relevantLoc(loc).variants).toEqual({ b: 'b@v2' });
  });

  test('keeps everything relevant to the current journey', () => {
    const loc: Loc = { journeys: ['a', 'b'], step: 'x', persona: 'ops', variants: { a: 'a@v2' } };
    expect(relevantLoc(loc)).toEqual(loc);
  });
});
