import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { JourneySchema, ManifestSchema, NotesFileSchema, type Journey, type Manifest, type Note } from './schema';

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  journeys: Journey[];
  manifest: Manifest | null;
  notes: Note[];
}

/**
 * Validate a `.codestory/` directory: zod-parse every file, then run the
 * referential checks from KB #182 — links point to existing journeys/entries,
 * sub-journey refs exist, `refs` paths exist on disk (relative to the repo root,
 * i.e. the parent of `.codestory/`), `built` steps have tests, exit ports are
 * declared, edges reference real steps, ids are unique.
 */
export async function validateDir(dir: string): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const repoRoot = dirname(dir);
  const push = (file: string, message: string) => issues.push({ file, message });

  if (!existsSync(dir)) {
    return { ok: false, issues: [{ file: dir, message: 'no .codestory/ directory found' }], journeys: [], manifest: null, notes: [] };
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

  // journeys
  const journeys: Journey[] = [];
  const byId = new Map<string, Journey>();
  for (const f of files.filter((f) => f.endsWith('.journey.json')).sort()) {
    const file = join(dir, f);
    const parsed = await parseJson(file, push);
    if (parsed === undefined) continue;
    const r = JourneySchema.safeParse(parsed);
    if (!r.success) {
      push(file, zodMessage(r.error));
      continue;
    }
    const journey = r.data;
    const stem = basename(f, '.journey.json');
    if (stem !== journey.id) push(file, `file name '${stem}' does not match journey id '${journey.id}'`);
    if (byId.has(journey.id)) push(file, `duplicate journey id '${journey.id}'`);
    else byId.set(journey.id, journey);
    journeys.push(journey);
  }

  // referential checks
  for (const journey of journeys) {
    const file = join(dir, `${journey.id}.journey.json`);
    const stepIds = new Set<string>();
    for (const n of journey.steps) {
      if (stepIds.has(n.id)) push(file, `duplicate step id '${n.id}'`);
      stepIds.add(n.id);

      if (n.journey && !byId.has(n.journey)) push(file, `step '${n.id}' references unknown sub-journey '${n.journey}'`);
      else if (n.journey && byId.get(n.journey)!.variantOf) push(file, `step '${n.id}' sub-journey '${n.journey}' must be a base journey, not a variant`);
      if (n.type === 'exit' && n.port && !journey.exits.includes(n.port)) {
        push(file, `exit step '${n.id}' uses port '${n.port}' not declared in exits[]`);
      }
      if (n.status === 'built' && !(n.tests && n.tests.length > 0)) {
        push(file, `step '${n.id}' is built but has no tests`);
      }
      for (const ref of n.refs ?? []) {
        const path = ref.split('#')[0]!;
        const abs = resolve(repoRoot, path);
        if (!path || !abs.startsWith(resolve(repoRoot))) push(file, `step '${n.id}' ref is not a repo-relative path: '${ref}'`);
        else if (!existsSync(abs)) push(file, `step '${n.id}' ref not found on disk: ${path}`);
      }
    }
    for (const e of journey.edges) {
      if (!stepIds.has(e.from)) push(file, `edge references unknown step '${e.from}'`);
      if (!stepIds.has(e.to)) push(file, `edge references unknown step '${e.to}'`);
    }
    for (const l of journey.links) {
      if (!journey.exits.includes(l.exit)) push(file, `link from undeclared exit port '${l.exit}'`);
      const target = byId.get(l.journey);
      if (!target) push(file, `link references unknown journey '${l.journey}'`);
      else if (target.variantOf) push(file, `link target '${l.journey}' must be a base journey, not a variant`);
      else if (!target.entries.includes(l.entry)) {
        push(file, `link targets unknown entry '${l.entry}' on journey '${l.journey}'`);
      }
    }
  }

  // variants: base exists, no variant chains, port sets match the base
  const samePorts = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  for (const journey of journeys) {
    if (!journey.variantOf) continue;
    const file = join(dir, `${journey.id}.journey.json`);
    const base = byId.get(journey.variantOf);
    if (!base) {
      push(file, `variantOf references unknown journey '${journey.variantOf}'`);
      continue;
    }
    if (base.variantOf) push(file, `variantOf must target a base journey, not another variant ('${journey.variantOf}')`);
    if (!samePorts(journey.entries, base.entries)) push(file, `variant entries [${journey.entries}] must match base '${base.id}' [${base.entries}] — ports are the contract`);
    if (!samePorts(journey.exits, base.exits)) push(file, `variant exits [${journey.exits}] must match base '${base.id}' [${base.exits}] — ports are the contract`);
  }

  // personas reference real journeys/entries
  if (manifest) {
    for (const j of manifest.personas) {
      const start = byId.get(j.start.journey);
      if (!start) push(manifestFile, `persona '${j.id}' starts at unknown journey '${j.start.journey}'`);
      else if (start.variantOf) push(manifestFile, `persona '${j.id}' start '${j.start.journey}' must be a base journey, not a variant`);
      else if (!start.entries.includes(j.start.entry)) {
        push(manifestFile, `persona '${j.id}' starts at unknown entry '${j.start.entry}' on journey '${j.start.journey}'`);
      }
      for (const b of j.journeys) {
        if (!byId.has(b)) push(manifestFile, `persona '${j.id}' lists unknown journey '${b}'`);
        else if (byId.get(b)!.variantOf) push(manifestFile, `persona '${j.id}' journey '${b}' must be a base journey, not a variant`);
      }
    }
  }

  // notes.v0 sidecar (optional): schema-parse, then every note must reference an
  // existing journey (base or variant) and, if set, an existing step on that journey;
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
          const journey = byId.get(n.journey);
          if (!journey) push(notesFile, `note '${n.id}' references unknown journey '${n.journey}'`);
          else if (n.step && !journey.steps.some((nd) => nd.id === n.step)) {
            push(notesFile, `note '${n.id}' references unknown step '${n.step}' on journey '${n.journey}'`);
          }
        }
      }
    }
  }

  return { ok: issues.length === 0, issues, journeys, manifest, notes };
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
