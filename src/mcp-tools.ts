import { formatJourneyContext } from './journey-context';
import { appendNote, setNoteStatus } from './notes';
import type { Journey, Note, NoteStatus } from './schema';
import { validateDir, type ValidationResult } from './validate';

// Plain typed handler functions backing the `codestory mcp` tool surface (v1:
// list_journeys, get_journey, validate, append_note, set_note_status,
// get_journey_context). Each wraps the existing internals — validateDir is the
// SSOT loader/validator, notes.ts owns writes — so this module never
// re-implements schema parsing or referential checks. src/mcp.ts is the only
// caller; it's thin stdio glue over these.

export interface JourneySummary {
  id: string;
  title: string;
  status: Journey['status'];
  variantOf?: string;
  entries: string[];
  exits: string[];
}

export type HandlerResult<T> = { ok: true } & T;
export type HandlerError = { ok: false; error: string };

function summarize(j: Journey): JourneySummary {
  return {
    id: j.id,
    title: j.title,
    status: j.status,
    ...(j.variantOf ? { variantOf: j.variantOf } : {}),
    entries: j.entries,
    exits: j.exits,
  };
}

/** list_journeys: every journey in `rootDir`, summarized. */
export async function listJourneysHandler(rootDir: string): Promise<JourneySummary[]> {
  const { journeys } = await validateDir(rootDir);
  return journeys.map(summarize);
}

/** get_journey: the full journey definition, or null if `id` doesn't exist. */
export async function getJourneyHandler(rootDir: string, args: { id: string }): Promise<Journey | null> {
  const { journeys } = await validateDir(rootDir);
  return journeys.find((j) => j.id === args.id) ?? null;
}

/** validate: direct pass-through of validateDir — never re-implements the checks. */
export async function validateHandler(rootDir: string): Promise<ValidationResult> {
  return validateDir(rootDir);
}

/**
 * append_note: same referential guard `present.ts`'s POST /api/notes applies
 * (journey must exist; step, if given, must exist on that journey) before
 * delegating the write to notes.ts.
 */
export async function appendNoteHandler(
  rootDir: string,
  args: { journey: string; step?: string; text: string },
): Promise<HandlerResult<{ note: Note }> | HandlerError> {
  const { journeys } = await validateDir(rootDir);
  const target = journeys.find((j) => j.id === args.journey);
  if (!target) return { ok: false, error: `unknown journey '${args.journey}'` };
  if (args.step && !target.steps.some((s) => s.id === args.step)) {
    return { ok: false, error: `unknown step '${args.step}' on journey '${args.journey}'` };
  }
  const note = appendNote(rootDir, args);
  return { ok: true, note };
}

/** set_note_status: flip an existing note's status. */
export async function setNoteStatusHandler(
  rootDir: string,
  args: { id: string; status: NoteStatus },
): Promise<HandlerResult<{ note: Note }> | HandlerError> {
  const note = setNoteStatus(rootDir, args.id, args.status);
  if (!note) return { ok: false, error: `no note with id '${args.id}'` };
  return { ok: true, note };
}

/**
 * get_journey_context: load the journey (+ full set, for related lookups) via
 * validateDir, then hand off to the pure formatter in journey-context.ts.
 */
export async function getJourneyContextHandler(
  rootDir: string,
  args: { id: string },
): Promise<HandlerResult<{ markdown: string }> | HandlerError> {
  const { journeys } = await validateDir(rootDir);
  const journey = journeys.find((j) => j.id === args.id);
  if (!journey) return { ok: false, error: `unknown journey '${args.id}'` };
  return { ok: true, markdown: formatJourneyContext(journey, journeys) };
}
