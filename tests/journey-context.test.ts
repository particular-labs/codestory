import { describe, expect, test } from 'bun:test';
import { formatJourneyContext } from '../src/journey-context';
import type { Journey } from '../src/schema';

function journey(overrides: Partial<Journey> & { id: string; title: string }): Journey {
  return {
    $schema: 'codestory/journey.v1',
    version: 1,
    status: 'planned',
    entries: [],
    exits: [],
    steps: [],
    edges: [],
    links: [],
    ...overrides,
  } as Journey;
}

describe('formatJourneyContext', () => {
  test('includes title, id, status, entries/exits, and steps', () => {
    const main = journey({
      id: 'alpha',
      title: 'Alpha',
      status: 'built',
      entries: ['start'],
      exits: ['done'],
      steps: [
        { id: 'a', type: 'action', label: 'Do A', status: 'built' },
        { id: 'x', type: 'exit', port: 'done' },
      ],
      edges: [{ from: 'a', to: 'x' }],
    });
    const out = formatJourneyContext(main, [main]);
    expect(out).toContain('Alpha');
    expect(out).toContain('`alpha`');
    expect(out).toContain('status: built');
    expect(out).toContain('`start`');
    expect(out).toContain('`done`');
    expect(out).toContain('Do A');
    expect(out).toContain('a → x');
  });

  test('includes sub-journeys (via step.journey) and linked journeys (via links[]), deduped', () => {
    const beta = journey({ id: 'beta', title: 'Beta', entries: ['start'], steps: [{ id: 'b', type: 'action', label: 'B' }] });
    const main = journey({
      id: 'alpha',
      title: 'Alpha',
      entries: ['start'],
      exits: ['done'],
      steps: [
        { id: 'a', type: 'action', label: 'A' },
        { id: 'sub', type: 'action', label: 'Sub', journey: 'beta' }, // sub-journey ref
        { id: 'x', type: 'exit', port: 'done' },
      ],
      links: [{ exit: 'done', journey: 'beta', entry: 'start' }], // linked journey ref, same id as the sub-journey
    });
    const out = formatJourneyContext(main, [main, beta]);
    expect(out).toContain('Beta');
    expect(out).toContain('`beta`');
    expect((out.match(/Beta \(`beta`\)/g) ?? []).length).toBe(1); // referenced twice, rendered once
  });

  test('does not recurse past one level of relation', () => {
    const gamma = journey({ id: 'gamma', title: 'Gamma', entries: ['start'], steps: [{ id: 'g', type: 'action', label: 'G' }] });
    const beta = journey({
      id: 'beta',
      title: 'Beta',
      entries: ['start'],
      steps: [{ id: 'b', type: 'action', label: 'B', journey: 'gamma' }],
    });
    const main = journey({
      id: 'alpha',
      title: 'Alpha',
      entries: ['start'],
      exits: ['done'],
      steps: [
        { id: 'sub', type: 'action', label: 'Sub', journey: 'beta' },
        { id: 'x', type: 'exit', port: 'done' },
      ],
    });
    const out = formatJourneyContext(main, [main, beta, gamma]);
    expect(out).toContain('Beta');
    expect(out).not.toContain('Gamma');
  });

  test('omits empty sections and never leaves trailing blank lines', () => {
    const main = journey({ id: 'solo', title: 'Solo', steps: [{ id: 's', type: 'action', label: 'S' }] });
    const out = formatJourneyContext(main, [main]);
    expect(out).not.toContain('Edges');
    expect(out).not.toContain('Links');
    expect(out).not.toContain('Related journeys');
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
    expect(out).not.toMatch(/\n{3,}/);
  });

  test('unrelated journey in `all` is not pulled in', () => {
    const beta = journey({ id: 'beta', title: 'Beta', steps: [{ id: 'b', type: 'action', label: 'B' }] });
    const main = journey({ id: 'alpha', title: 'Alpha', steps: [{ id: 'a', type: 'action', label: 'A' }] });
    const out = formatJourneyContext(main, [main, beta]);
    expect(out).not.toContain('Beta');
  });
});
