import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotesFileSchema, type Note, type NoteStatus, type NotesFile } from './schema';

// Write side of the notes.v0 sidecar. Reading + referential validation lives in
// validate.ts (SSOT for validation); this module only appends notes and flips
// their status, always through `.codestory/notes.json`.

export const NOTES_FILENAME = 'notes.json';

export function notesPath(dir: string): string {
  return join(dir, NOTES_FILENAME);
}

function emptyNotesFile(): NotesFile {
  return { $schema: 'codestory/notes.v0', version: 1, notes: [] };
}

/** Load the current notes file for mutation. Throws on a corrupt/invalid file so
 *  a write never silently clobbers existing notes. */
function loadForWrite(dir: string): NotesFile {
  const path = notesPath(dir);
  if (!existsSync(path)) return emptyNotesFile();
  const r = NotesFileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!r.success) throw new Error(`${NOTES_FILENAME} is invalid — refusing to overwrite`);
  return r.data;
}

/** Write temp + rename so a reader never sees a half-written file. */
function atomicWrite(dir: string, file: NotesFile): void {
  const path = notesPath(dir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n');
  renameSync(tmp, path);
}

export function appendNote(dir: string, input: { board: string; node?: string; text: string }): Note {
  const file = loadForWrite(dir);
  const note: Note = {
    id: randomUUID(),
    board: input.board,
    ...(input.node ? { node: input.node } : {}),
    text: input.text,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  file.notes.push(note);
  atomicWrite(dir, file);
  return note;
}

/** Flip an existing note's status. Returns the updated note, or null if no such id. */
export function setNoteStatus(dir: string, id: string, status: NoteStatus): Note | null {
  const file = loadForWrite(dir);
  const note = file.notes.find((n) => n.id === id);
  if (!note) return null;
  note.status = status;
  atomicWrite(dir, file);
  return note;
}
