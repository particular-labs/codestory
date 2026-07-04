import { describe, expect, test } from 'bun:test';
import { EMPTY_LOC, parseLocation, serializeLocation, type Loc } from '../viewer/src/urlState';

const roundtrip = (loc: Loc) => parseLocation(serializeLocation(loc));

describe('urlState codec', () => {
  test('empty location serializes to empty string', () => {
    expect(serializeLocation(EMPTY_LOC)).toBe('');
    expect(parseLocation('')).toEqual(EMPTY_LOC);
  });

  test('round-trips a nested path with node, persona, variants', () => {
    const loc: Loc = {
      path: ['intake', 'matching'],
      node: 'requested',
      persona: 'customer',
      variants: { intake: 'intake@v2' },
    };
    expect(roundtrip(loc)).toEqual(loc);
  });

  test('serializes readably', () => {
    expect(serializeLocation({ path: ['a', 'b'], node: 'n1', persona: null, variants: {} }))
      .toBe('p=a~b&n=n1');
  });

  test('map view with only a persona lens', () => {
    const loc: Loc = { path: [], node: null, persona: 'ops', variants: {} };
    expect(serializeLocation(loc)).toBe('persona=ops');
    expect(roundtrip(loc)).toEqual(loc);
  });

  test('drops malformed variant pairs, keeps good ones', () => {
    // ':x' (empty base) and 'bare' (no colon) are dropped; 'b:b@v' survives
    expect(parseLocation('v=:x,bare,b:b@v').variants).toEqual({ b: 'b@v' });
  });

  test('tolerates a leading ? and unknown params', () => {
    expect(parseLocation('?p=x&junk=1').path).toEqual(['x']);
  });
});
