import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { BoardSchema, ManifestSchema, NotesFileSchema, type Board, type Manifest, type Note } from './schema';

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  boards: Board[];
  manifest: Manifest | null;
  notes: Note[];
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
    return { ok: false, issues: [{ file: dir, message: 'no .codestory/ directory found' }], boards: [], manifest: null, notes: [] };
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
      else if (n.board && byId.get(n.board)!.variantOf) push(file, `node '${n.id}' sub-board '${n.board}' must be a base board, not a variant`);
      if (n.type === 'exit' && n.port && !board.exits.includes(n.port)) {
        push(file, `exit node '${n.id}' uses port '${n.port}' not declared in exits[]`);
      }
      if (n.status === 'built' && !(n.tests && n.tests.length > 0)) {
        push(file, `node '${n.id}' is built but has no tests`);
      }
      for (const ref of n.refs ?? []) {
        const path = ref.split('#')[0]!;
        const abs = resolve(repoRoot, path);
        if (!path || !abs.startsWith(resolve(repoRoot))) push(file, `node '${n.id}' ref is not a repo-relative path: '${ref}'`);
        else if (!existsSync(abs)) push(file, `node '${n.id}' ref not found on disk: ${path}`);
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
      else if (target.variantOf) push(file, `link target '${l.board}' must be a base board, not a variant`);
      else if (!target.entries.includes(l.entry)) {
        push(file, `link targets unknown entry '${l.entry}' on board '${l.board}'`);
      }
    }
  }

  // variants: base exists, no variant chains, port sets match the base
  const samePorts = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  for (const board of boards) {
    if (!board.variantOf) continue;
    const file = join(dir, `${board.id}.board.json`);
    const base = byId.get(board.variantOf);
    if (!base) {
      push(file, `variantOf references unknown board '${board.variantOf}'`);
      continue;
    }
    if (base.variantOf) push(file, `variantOf must target a base board, not another variant ('${board.variantOf}')`);
    if (!samePorts(board.entries, base.entries)) push(file, `variant entries [${board.entries}] must match base '${base.id}' [${base.entries}] — ports are the contract`);
    if (!samePorts(board.exits, base.exits)) push(file, `variant exits [${board.exits}] must match base '${base.id}' [${base.exits}] — ports are the contract`);
  }

  // journeys reference real boards/entries
  if (manifest) {
    for (const j of manifest.journeys) {
      const start = byId.get(j.start.board);
      if (!start) push(manifestFile, `journey '${j.id}' starts at unknown board '${j.start.board}'`);
      else if (start.variantOf) push(manifestFile, `journey '${j.id}' start '${j.start.board}' must be a base board, not a variant`);
      else if (!start.entries.includes(j.start.entry)) {
        push(manifestFile, `journey '${j.id}' starts at unknown entry '${j.start.entry}' on board '${j.start.board}'`);
      }
      for (const b of j.boards) {
        if (!byId.has(b)) push(manifestFile, `journey '${j.id}' lists unknown board '${b}'`);
        else if (byId.get(b)!.variantOf) push(manifestFile, `journey '${j.id}' board '${b}' must be a base board, not a variant`);
      }
    }
  }

  // notes.v0 sidecar (optional): schema-parse, then every note must reference an
  // existing board (base or variant) and, if set, an existing node on that board;
  // ids are unique. Absent notes.json is fine.
  let notes: Note[] = [];
  if (files.includes('notes.json')) {
    const notesFile = join(dir, 'notes.json');
    const parsed = await parseJson(notesFile, push);
    if (parsed !== undefined) {
      const r = NotesFileSchema.safeParse(parsed);
      if (!r.success) push(notesFile, zodMessage(r.error));
      else {
        notes = r.data.notes;
        const seen = new Set<string>();
        for (const n of notes) {
          if (seen.has(n.id)) push(notesFile, `duplicate note id '${n.id}'`);
          seen.add(n.id);
          const board = byId.get(n.board);
          if (!board) push(notesFile, `note '${n.id}' references unknown board '${n.board}'`);
          else if (n.node && !board.nodes.some((nd) => nd.id === n.node)) {
            push(notesFile, `note '${n.id}' references unknown node '${n.node}' on board '${n.board}'`);
          }
        }
      }
    }
  }

  return { ok: issues.length === 0, issues, boards, manifest, notes };
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
