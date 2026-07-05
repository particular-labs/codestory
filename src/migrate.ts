import { defineCommand } from 'citty';
import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Versioned format migration. Each `.codestory` file carries its format version in
// `$schema` (e.g. codestory/journey.v0). A migration is one step that upgrades an
// object from its current `$schema` to the next; `upgrade` chains them until the
// file reaches the latest format the schema validates.
//
// Adding a future format is a ONE-LINE change: bump the id in schema.ts and add a
// `'codestory/journey.v1': (j) => …` entry below. Old files then upgrade v0→v1→v2.
type Migration = (obj: Envelope) => Envelope;
interface Envelope {
  $schema?: string;
  [k: string]: unknown;
}

const MIGRATIONS: Record<string, Migration> = {
  // v0 → v1: the terminology unification — journey.nodes→steps, step type
  // 'step'→'action', note.node→note.step. (Defensive on already-renamed shapes so
  // re-running is safe.)
  'codestory/journey.v0': (j) => {
    const src = (j.steps ?? j.nodes ?? []) as Array<Record<string, unknown>>;
    const { nodes: _drop, ...rest } = j;
    return { ...rest, $schema: 'codestory/journey.v1', steps: src.map((s) => ({ ...s, type: s.type === 'step' ? 'action' : s.type })) };
  },
  'codestory/notes.v0': (f) => {
    const notes = ((f.notes ?? []) as Array<Record<string, unknown>>).map(({ node, ...n }) => (node !== undefined && n.step === undefined ? { ...n, step: node } : n));
    return { ...f, $schema: 'codestory/notes.v1', notes };
  },
};

/** True if a migration exists for this object's current `$schema`. */
export function needsUpgrade(obj: Envelope): boolean {
  return typeof obj.$schema === 'string' && obj.$schema in MIGRATIONS;
}

/** Chain every applicable migration until the object reaches the latest format.
 *  Unknown / already-latest `$schema` → returned unchanged. Pure (new object).
 *  Returns Envelope, not the input type — a migration changes the shape. */
export function upgrade(obj: Envelope): Envelope {
  let cur = obj;
  const seen = new Set<string>();
  while (typeof cur.$schema === 'string' && MIGRATIONS[cur.$schema]) {
    if (seen.has(cur.$schema)) break; // guard against a mis-authored cyclic registry
    seen.add(cur.$schema);
    cur = MIGRATIONS[cur.$schema]!(cur);
  }
  return cur;
}

/** Upgrade every JSON file in a `.codestory` directory in place. Returns which
 *  files were rewritten vs already current. */
export async function migrateDir(dir: string): Promise<{ migrated: string[]; upToDate: string[] }> {
  const migrated: string[] = [];
  const upToDate: string[] = [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const path = join(dir, file);
    let obj: Envelope;
    try {
      obj = JSON.parse(readFileSync(path, 'utf8')) as Envelope;
    } catch {
      continue; // not our JSON — skip
    }
    if (!needsUpgrade(obj)) {
      upToDate.push(file);
      continue;
    }
    writeFileSync(path, `${JSON.stringify(upgrade(obj), null, 2)}\n`);
    migrated.push(file);
  }
  return { migrated, upToDate };
}

export const migrateCommand = defineCommand({
  meta: { name: 'migrate', description: 'Upgrade .codestory files to the latest format version' },
  args: {
    dir: { type: 'string', description: 'Path to the .codestory directory', default: '.codestory' },
  },
  async run({ args }) {
    const dir = resolve(args.dir);
    const { migrated, upToDate } = await migrateDir(dir);
    for (const f of migrated) console.log(`↑ migrated ${f}`);
    if (!migrated.length) console.log(`✓ ${upToDate.length} file(s) already at the latest format`);
    else console.log(`✓ migrated ${migrated.length} file(s); ${upToDate.length} already current — run 'codestory validate' to confirm`);
  },
});
