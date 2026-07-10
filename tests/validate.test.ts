import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { validateDir } from '../src/validate';
import { alpha, beta, good, manifest, repo, type Json } from './fixtures';

async function issuesOf(files: Record<string, Json | string>) {
  const r = await validateDir(join(repo(files), '.codestory'));
  return r;
}

describe('validateDir', () => {
  test('valid set → ok, no issues', async () => {
    const r = await issuesOf(good);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.journeys).toHaveLength(2);
    expect(r.manifest?.project).toBe('Demo');
  });

  test('missing manifest → issue', async () => {
    const { '.codestory/codestory.json': _, ...rest } = good;
    const r = await issuesOf(rest);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.match(/codestory\.json/))).toBe(true);
  });

  test('malformed JSON → issue, not crash', async () => {
    const r = await issuesOf({ ...good, '.codestory/broken.journey.json': '{ nope' });
    expect(r.ok).toBe(false);
  });

  test('schema violation reported with file', async () => {
    const r = await issuesOf({
      ...good,
      '.codestory/bad.journey.json': { $schema: 'codestory/journey.v1', version: 1, id: 'bad', title: 'Bad', steps: [{ id: 'n', type: 'wat', label: 'N' }] },
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.file.includes('bad.journey.json'))).toBe(true);
  });

  test('link to unknown journey → issue', async () => {
    const a = { ...alpha, links: [{ exit: 'done', journey: 'ghost', entry: 'start' }] };
    const r = await issuesOf({ ...good, '.codestory/alpha.journey.json': a });
    expect(r.issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  test('link to unknown entry on target journey → issue', async () => {
    const a = { ...alpha, links: [{ exit: 'done', journey: 'beta', entry: 'side-door' }] };
    const r = await issuesOf({ ...good, '.codestory/alpha.journey.json': a });
    expect(r.issues.some((i) => i.message.includes('side-door'))).toBe(true);
  });

  test('link from undeclared exit port → issue', async () => {
    const a = { ...alpha, links: [{ exit: 'undeclared', journey: 'beta', entry: 'start' }] };
    const r = await issuesOf({ ...good, '.codestory/alpha.journey.json': a });
    expect(r.issues.some((i) => i.message.includes('undeclared'))).toBe(true);
  });

  test('exit step port not in exits[] → issue', async () => {
    const a = { ...alpha, exits: [], links: [], steps: alpha.steps };
    const r = await issuesOf({ ...good, '.codestory/alpha.journey.json': a });
    expect(r.issues.some((i) => i.message.includes('done'))).toBe(true);
  });

  test('sub-journey ref to unknown journey → issue', async () => {
    const steps = [{ id: 'sub', type: 'action', label: 'Sub', journey: 'ghost' }];
    const a = { ...alpha, steps, edges: [], links: [] };
    const r = await issuesOf({ ...good, '.codestory/alpha.journey.json': a });
    expect(r.issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  test('edge endpoints must be step ids', async () => {
    const a = { ...alpha, edges: [{ from: 'a', to: 'nowhere' }] };
    const r = await issuesOf({ ...good, '.codestory/alpha.journey.json': a });
    expect(r.issues.some((i) => i.message.includes('nowhere'))).toBe(true);
  });

  test('refs must exist on disk, relative to repo root', async () => {
    const withRef = (ref: string): Json => ({
      ...alpha,
      steps: [{ id: 'a', type: 'action', label: 'A', refs: [ref] }],
      edges: [], links: [],
    });
    const missing = await issuesOf({ ...good, '.codestory/alpha.journey.json': withRef('src/nope.ts') });
    expect(missing.issues.some((i) => i.message.includes('src/nope.ts'))).toBe(true);

    const present = await issuesOf({
      ...good,
      'src/yes.ts': 'export {}',
      '.codestory/alpha.journey.json': withRef('src/yes.ts#Symbol'),
    });
    expect(present.issues).toEqual([]);
  });

  test('empty or repo-escaping refs → issue', async () => {
    const withRef = (ref: string): Json => ({
      ...alpha,
      steps: [{ id: 'a', type: 'action', label: 'A', refs: [ref] }],
      edges: [], links: [],
    });
    const empty = await issuesOf({ ...good, '.codestory/alpha.journey.json': withRef('#Missing') });
    expect(empty.issues.some((i) => i.message.includes('repo-relative'))).toBe(true);
    const escape = await issuesOf({ ...good, '.codestory/alpha.journey.json': withRef('../../etc/passwd') });
    expect(escape.issues.some((i) => i.message.includes('repo-relative'))).toBe(true);
  });

  test('built step without tests → issue', async () => {
    const a = {
      ...alpha,
      steps: [{ id: 'a', type: 'action', label: 'A', status: 'built' }],
      edges: [], links: [],
    };
    const r = await issuesOf({ ...good, '.codestory/alpha.journey.json': a });
    expect(r.issues.some((i) => i.message.match(/built.*tests/))).toBe(true);
  });

  test('persona referencing unknown journey/entry → issue', async () => {
    const m = { ...manifest, personas: [{ id: 'j', title: 'J', start: { journey: 'ghost', entry: 'start' }, journeys: ['alpha'] }] };
    const r = await issuesOf({ ...good, '.codestory/codestory.json': m });
    expect(r.issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  test('duplicate journey ids and step ids → issues', async () => {
    const dupJourney = { ...beta, id: 'alpha' };
    const r = await issuesOf({ ...good, '.codestory/beta.journey.json': dupJourney });
    expect(r.issues.some((i) => i.message.includes('duplicate journey id'))).toBe(true);

    const dupSteps = { ...beta, steps: [{ id: 'b', type: 'action', label: 'B' }, { id: 'b', type: 'action', label: 'B2' }] };
    const r2 = await issuesOf({ ...good, '.codestory/beta.journey.json': dupSteps });
    expect(r2.issues.some((i) => i.message.includes("'b'"))).toBe(true);
  });

  test('valid variant journey (same ports as base) → green', async () => {
    const variant = {
      ...alpha,
      id: 'alpha@v2',
      variantOf: 'alpha',
      variantLabel: 'V2 take',
    };
    const r = await issuesOf({ ...good, '.codestory/alpha@v2.journey.json': variant });
    expect(r.issues).toEqual([]);
  });

  test('variantOf must reference an existing base journey', async () => {
    const variant = { ...beta, id: 'x@v2', variantOf: 'ghost', links: [] };
    const r = await issuesOf({ ...good, '.codestory/x@v2.journey.json': variant });
    expect(r.issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  test('variant ports must match the base (ports are the contract)', async () => {
    const variant = { ...alpha, id: 'alpha@v2', variantOf: 'alpha', exits: ['other'], links: [], steps: [{ id: 'a', type: 'action', label: 'A' }], edges: [] };
    const r = await issuesOf({ ...good, '.codestory/alpha@v2.journey.json': variant });
    expect(r.issues.some((i) => i.message.match(/exits.*match base/))).toBe(true);
  });

  test('links, sub-journey refs, and personas must target base journeys, not variants', async () => {
    const variant = { ...alpha, id: 'alpha@v2', variantOf: 'alpha' };
    const withVariant = { ...good, '.codestory/alpha@v2.journey.json': variant };

    const badLink = { ...beta, entries: ['start'], exits: ['out'], steps: [...(beta.steps as unknown[]), { id: 'x', type: 'exit', port: 'out' }], links: [{ exit: 'out', journey: 'alpha@v2', entry: 'start' }] };
    const r1 = await issuesOf({ ...withVariant, '.codestory/beta.journey.json': badLink });
    expect(r1.issues.some((i) => i.message.match(/base journey/))).toBe(true);

    const badSub = { ...beta, steps: [{ id: 'b', type: 'action', label: 'B', journey: 'alpha@v2' }] };
    const r2 = await issuesOf({ ...withVariant, '.codestory/beta.journey.json': badSub });
    expect(r2.issues.some((i) => i.message.match(/base journey/))).toBe(true);

    const badPersona = { ...manifest, personas: [{ id: 'j', title: 'J', start: { journey: 'alpha@v2', entry: 'start' }, journeys: ['alpha@v2'] }] };
    const r3 = await issuesOf({ ...withVariant, '.codestory/codestory.json': badPersona });
    expect(r3.issues.some((i) => i.message.match(/base journey/))).toBe(true);
  });

  test('empty variantOf is rejected by schema', async () => {
    const r = await issuesOf({ ...good, '.codestory/beta.journey.json': { ...beta, variantOf: '' } });
    expect(r.ok).toBe(false);
  });

  test('variant of a variant is rejected', async () => {
    const v1 = { ...alpha, id: 'alpha@v1', variantOf: 'alpha' };
    const v2 = { ...alpha, id: 'alpha@v2', variantOf: 'alpha@v1' };
    const r = await issuesOf({ ...good, '.codestory/alpha@v1.journey.json': v1, '.codestory/alpha@v2.journey.json': v2 });
    expect(r.issues.some((i) => i.message.includes('base journey'))).toBe(true);
  });

  test('journey file name must match journey id', async () => {
    const r = await issuesOf({ ...good, '.codestory/gamma.journey.json': { ...beta, id: 'delta' } });
    expect(r.issues.some((i) => i.file.includes('gamma.journey.json'))).toBe(true);
  });

  // ── notes.v0 sidecar ──

  const notesFile = (notes: unknown[]): Json => ({ $schema: 'codestory/notes.v1', version: 1, notes });

  test('absent notes.json is fine; result.notes is []', async () => {
    const r = await issuesOf(good);
    expect(r.ok).toBe(true);
    expect(r.notes).toEqual([]);
  });

  test('valid notes referencing real journey + step → green, notes returned', async () => {
    const r = await issuesOf({
      ...good,
      '.codestory/notes.json': notesFile([
        { id: 'n1', journey: 'alpha', step: 'a', text: 'fix A', status: 'open', createdAt: '2026-07-03T00:00:00.000Z' },
        { id: 'n2', journey: 'beta', text: 'journey note', status: 'applied', createdAt: '2026-07-03T00:00:00.000Z' },
      ]),
    });
    expect(r.issues).toEqual([]);
    expect(r.notes).toHaveLength(2);
    expect(r.notes[0]?.id).toBe('n1');
  });

  test('note referencing unknown journey → issue', async () => {
    const r = await issuesOf({
      ...good,
      '.codestory/notes.json': notesFile([{ id: 'n', journey: 'ghost', text: 't', createdAt: 'x' }]),
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  test('note referencing unknown step on a real journey → issue', async () => {
    const r = await issuesOf({
      ...good,
      '.codestory/notes.json': notesFile([{ id: 'n', journey: 'alpha', step: 'nope', text: 't', createdAt: 'x' }]),
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('nope'))).toBe(true);
  });

  test('duplicate note ids → issue', async () => {
    const r = await issuesOf({
      ...good,
      '.codestory/notes.json': notesFile([
        { id: 'dup', journey: 'alpha', text: 'a', createdAt: 'x' },
        { id: 'dup', journey: 'beta', text: 'b', createdAt: 'x' },
      ]),
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('dup'))).toBe(true);
  });

  test('malformed notes.json → issue, not crash', async () => {
    const bad = await issuesOf({ ...good, '.codestory/notes.json': '{ nope' });
    expect(bad.ok).toBe(false);
    const badSchema = await issuesOf({ ...good, '.codestory/notes.json': notesFile([{ id: 'n', journey: 'alpha', text: '', createdAt: 'x' }]) });
    expect(badSchema.ok).toBe(false);
  });

  test('note may reference a variant journey id', async () => {
    const variant = { ...alpha, id: 'alpha@v2', variantOf: 'alpha', variantLabel: 'V2' };
    const r = await issuesOf({
      ...good,
      '.codestory/alpha@v2.journey.json': variant,
      '.codestory/notes.json': notesFile([{ id: 'n', journey: 'alpha@v2', step: 'a', text: 't', createdAt: 'x' }]),
    });
    expect(r.issues).toEqual([]);
  });
});
