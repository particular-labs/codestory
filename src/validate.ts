import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { BoardSchema, ManifestSchema, type Board, type Manifest } from './schema';

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  boards: Board[];
  manifest: Manifest | null;
}

/**
 * Validate a `.codestory/` directory: zod-parse every file, then run the
 * referential checks from KB #182 — links point to existing boards/entries,
 * sub-board refs exist, `refs` paths exist on disk (relative to the repo root,
 * i.e. the parent of `.codestory/`), `built` nodes have tests, exit ports are
 * declared, edges reference real nodes, ids are unique.
 */
export async function validateDir(dir: string): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const repoRoot = dirname(dir);
  const push = (file: string, message: string) => issues.push({ file, message });

  if (!existsSync(dir)) {
    return { ok: false, issues: [{ file: dir, message: 'no .codestory/ directory found' }], boards: [], manifest: null };
  }

  const files = await readdir(dir);

  // manifest
  let manifest: Manifest | null = null;
  const manifestFile = join(dir, 'codestory.json');
  if (!files.includes('codestory.json')) {
    push(manifestFile, 'missing codestory.json manifest');
  } else {
    const parsed = await parseJson(manifestFile, push);
    if (parsed !== undefined) {
      const r = ManifestSchema.safeParse(parsed);
      if (r.success) manifest = r.data;
      else push(manifestFile, zodMessage(r.error));
    }
  }

  // boards
  const boards: Board[] = [];
  const byId = new Map<string, Board>();
  for (const f of files.filter((f) => f.endsWith('.board.json')).sort()) {
    const file = join(dir, f);
    const parsed = await parseJson(file, push);
    if (parsed === undefined) continue;
    const r = BoardSchema.safeParse(parsed);
    if (!r.success) {
      push(file, zodMessage(r.error));
      continue;
    }
    const board = r.data;
    const stem = basename(f, '.board.json');
    if (stem !== board.id) push(file, `file name '${stem}' does not match board id '${board.id}'`);
    if (byId.has(board.id)) push(file, `duplicate board id '${board.id}'`);
    else byId.set(board.id, board);
    boards.push(board);
  }

  // referential checks
  for (const board of boards) {
    const file = join(dir, `${board.id}.board.json`);
    const nodeIds = new Set<string>();
    for (const n of board.nodes) {
      if (nodeIds.has(n.id)) push(file, `duplicate node id '${n.id}'`);
      nodeIds.add(n.id);

      if (n.board && !byId.has(n.board)) push(file, `node '${n.id}' references unknown sub-board '${n.board}'`);
      if (n.type === 'exit' && n.port && !board.exits.includes(n.port)) {
        push(file, `exit node '${n.id}' uses port '${n.port}' not declared in exits[]`);
      }
      if (n.status === 'built' && !(n.tests && n.tests.length > 0)) {
        push(file, `node '${n.id}' is built but has no tests`);
      }
      for (const ref of n.refs ?? []) {
        const path = ref.split('#')[0]!;
        if (!existsSync(join(repoRoot, path))) push(file, `node '${n.id}' ref not found on disk: ${path}`);
      }
    }
    for (const e of board.edges) {
      if (!nodeIds.has(e.from)) push(file, `edge references unknown node '${e.from}'`);
      if (!nodeIds.has(e.to)) push(file, `edge references unknown node '${e.to}'`);
    }
    for (const l of board.links) {
      if (!board.exits.includes(l.exit)) push(file, `link from undeclared exit port '${l.exit}'`);
      const target = byId.get(l.board);
      if (!target) push(file, `link references unknown board '${l.board}'`);
      else if (!target.entries.includes(l.entry)) {
        push(file, `link targets unknown entry '${l.entry}' on board '${l.board}'`);
      }
    }
  }

  // journeys reference real boards/entries
  if (manifest) {
    for (const j of manifest.journeys) {
      const start = byId.get(j.start.board);
      if (!start) push(manifestFile, `journey '${j.id}' starts at unknown board '${j.start.board}'`);
      else if (!start.entries.includes(j.start.entry)) {
        push(manifestFile, `journey '${j.id}' starts at unknown entry '${j.start.entry}' on board '${j.start.board}'`);
      }
      for (const b of j.boards) {
        if (!byId.has(b)) push(manifestFile, `journey '${j.id}' lists unknown board '${b}'`);
      }
    }
  }

  return { ok: issues.length === 0, issues, boards, manifest };
}

async function parseJson(file: string, push: (file: string, message: string) => void): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    push(file, `invalid JSON: ${(e as Error).message}`);
    return undefined;
  }
}

function zodMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}
