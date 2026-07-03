import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDir } from '../src/validate';

type Json = Record<string, unknown>;

/** Write a fake repo: files maps repo-relative paths → JSON (objects) or raw strings. */
function repo(files: Record<string, Json | string>): string {
  const root = mkdtempSync(join(tmpdir(), 'codestory-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

const manifest: Json = {
  $schema: 'codestory/manifest.v0',
  version: 1,
  project: 'Demo',
  journeys: [
    { id: 'ops', title: 'Ops', start: { board: 'alpha', entry: 'start' }, boards: ['alpha', 'beta'] },
  ],
};

const alpha: Json = {
  $schema: 'codestory/board.v0',
  version: 1,
  id: 'alpha',
  title: 'Alpha',
  entries: ['start'],
  exits: ['done'],
  nodes: [
    { id: 'a', type: 'step', label: 'A' },
    { id: 'sub', type: 'step', label: 'Sub', board: 'beta' },
    { id: 'x', type: 'exit', port: 'done' },
  ],
  edges: [
    { from: 'a', to: 'sub' },
    { from: 'sub', to: 'x' },
  ],
  links: [{ exit: 'done', board: 'beta', entry: 'start' }],
};

const beta: Json = {
  $schema: 'codestory/board.v0',
  version: 1,
  id: 'beta',
  title: 'Beta',
  entries: ['start'],
  nodes: [{ id: 'b', type: 'step', label: 'B' }],
};

const good = {
  '.codestory/codestory.json': manifest,
  '.codestory/alpha.board.json': alpha,
  '.codestory/beta.board.json': beta,
};

async function issuesOf(files: Record<string, Json | string>) {
  const r = await validateDir(join(repo(files), '.codestory'));
  return r;
}

describe('validateDir', () => {
  test('valid set → ok, no issues', async () => {
    const r = await issuesOf(good);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.boards).toHaveLength(2);
    expect(r.manifest?.project).toBe('Demo');
  });

  test('missing manifest → issue', async () => {
    const { '.codestory/codestory.json': _, ...rest } = good;
    const r = await issuesOf(rest);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.match(/codestory\.json/))).toBe(true);
  });

  test('malformed JSON → issue, not crash', async () => {
    const r = await issuesOf({ ...good, '.codestory/broken.board.json': '{ nope' });
    expect(r.ok).toBe(false);
  });

  test('schema violation reported with file', async () => {
    const r = await issuesOf({
      ...good,
      '.codestory/bad.board.json': { $schema: 'codestory/board.v0', version: 1, id: 'bad', title: 'Bad', nodes: [{ id: 'n', type: 'wat', label: 'N' }] },
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.file.includes('bad.board.json'))).toBe(true);
  });

  test('link to unknown board → issue', async () => {
    const a = { ...alpha, links: [{ exit: 'done', board: 'ghost', entry: 'start' }] };
    const r = await issuesOf({ ...good, '.codestory/alpha.board.json': a });
    expect(r.issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  test('link to unknown entry on target board → issue', async () => {
    const a = { ...alpha, links: [{ exit: 'done', board: 'beta', entry: 'side-door' }] };
    const r = await issuesOf({ ...good, '.codestory/alpha.board.json': a });
    expect(r.issues.some((i) => i.message.includes('side-door'))).toBe(true);
  });

  test('link from undeclared exit port → issue', async () => {
    const a = { ...alpha, links: [{ exit: 'undeclared', board: 'beta', entry: 'start' }] };
    const r = await issuesOf({ ...good, '.codestory/alpha.board.json': a });
    expect(r.issues.some((i) => i.message.includes('undeclared'))).toBe(true);
  });

  test('exit node port not in exits[] → issue', async () => {
    const a = { ...alpha, exits: [], links: [], nodes: alpha.nodes };
    const r = await issuesOf({ ...good, '.codestory/alpha.board.json': a });
    expect(r.issues.some((i) => i.message.includes('done'))).toBe(true);
  });

  test('sub-board ref to unknown board → issue', async () => {
    const nodes = [{ id: 'sub', type: 'step', label: 'Sub', board: 'ghost' }];
    const a = { ...alpha, nodes, edges: [], links: [] };
    const r = await issuesOf({ ...good, '.codestory/alpha.board.json': a });
    expect(r.issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  test('edge endpoints must be node ids', async () => {
    const a = { ...alpha, edges: [{ from: 'a', to: 'nowhere' }] };
    const r = await issuesOf({ ...good, '.codestory/alpha.board.json': a });
    expect(r.issues.some((i) => i.message.includes('nowhere'))).toBe(true);
  });

  test('refs must exist on disk, relative to repo root', async () => {
    const withRef = (ref: string): Json => ({
      ...alpha,
      nodes: [{ id: 'a', type: 'step', label: 'A', refs: [ref] }],
      edges: [], links: [],
    });
    const missing = await issuesOf({ ...good, '.codestory/alpha.board.json': withRef('src/nope.ts') });
    expect(missing.issues.some((i) => i.message.includes('src/nope.ts'))).toBe(true);

    const present = await issuesOf({
      ...good,
      'src/yes.ts': 'export {}',
      '.codestory/alpha.board.json': withRef('src/yes.ts#Symbol'),
    });
    expect(present.issues).toEqual([]);
  });

  test('empty or repo-escaping refs → issue', async () => {
    const withRef = (ref: string): Json => ({
      ...alpha,
      nodes: [{ id: 'a', type: 'step', label: 'A', refs: [ref] }],
      edges: [], links: [],
    });
    const empty = await issuesOf({ ...good, '.codestory/alpha.board.json': withRef('#Missing') });
    expect(empty.issues.some((i) => i.message.includes('repo-relative'))).toBe(true);
    const escape = await issuesOf({ ...good, '.codestory/alpha.board.json': withRef('../../etc/passwd') });
    expect(escape.issues.some((i) => i.message.includes('repo-relative'))).toBe(true);
  });

  test('built node without tests → issue', async () => {
    const a = {
      ...alpha,
      nodes: [{ id: 'a', type: 'step', label: 'A', status: 'built' }],
      edges: [], links: [],
    };
    const r = await issuesOf({ ...good, '.codestory/alpha.board.json': a });
    expect(r.issues.some((i) => i.message.match(/built.*tests/))).toBe(true);
  });

  test('journey referencing unknown board/entry → issue', async () => {
    const m = { ...manifest, journeys: [{ id: 'j', title: 'J', start: { board: 'ghost', entry: 'start' }, boards: ['alpha'] }] };
    const r = await issuesOf({ ...good, '.codestory/codestory.json': m });
    expect(r.issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  test('duplicate board ids and node ids → issues', async () => {
    const dupBoard = { ...beta, id: 'alpha' };
    const r = await issuesOf({ ...good, '.codestory/beta.board.json': dupBoard });
    expect(r.issues.some((i) => i.message.includes('duplicate board id'))).toBe(true);

    const dupNodes = { ...beta, nodes: [{ id: 'b', type: 'step', label: 'B' }, { id: 'b', type: 'step', label: 'B2' }] };
    const r2 = await issuesOf({ ...good, '.codestory/beta.board.json': dupNodes });
    expect(r2.issues.some((i) => i.message.includes("'b'"))).toBe(true);
  });

  test('board file name must match board id', async () => {
    const r = await issuesOf({ ...good, '.codestory/gamma.board.json': { ...beta, id: 'delta' } });
    expect(r.issues.some((i) => i.file.includes('gamma.board.json'))).toBe(true);
  });
});
