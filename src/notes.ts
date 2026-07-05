import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOTES_SCHEMA_ID, NotesFileSchema, type Note, type NoteStatus, type NotesFile } from './schema';

// Write side of the notes sidecar. Reading + referential validation lives in
// validate.ts (SSOT for validation); this module only appends notes and flips
// their status, always through `.codestory/notes.json`.

export const NOTES_FILENAME = 'notes.json';

export function notesPath(dir: string): string {
  return join(dir, NOTES_FILENAME);
}

function emptyNotesFile(): NotesFile {
  return { $schema: NOTES_SCHEMA_ID, version: 1, notes: [] };
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

export function appendNote(dir: string, input: { journey: string; step?: string; text: string }): Note {
  const file = loadForWrite(dir);
  const note: Note = {
    id: randomUUID(),
    journey: input.journey,
    ...(input.step ? { step: input.step } : {}),
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

/** Delete a note by id. Returns the removed note, or null if no such id. */
export function deleteNote(dir: string, id: string): Note | null {
  const file = loadForWrite(dir);
  const i = file.notes.findIndex((n) => n.id === id);
  if (i < 0) return null;
  const [removed] = file.notes.splice(i, 1);
  atomicWrite(dir, file);
  return removed ?? null;
}

/** Remove every note. Returns how many were cleared. */
export function clearNotes(dir: string): number {
  const file = loadForWrite(dir);
  const cleared = file.notes.length;
  file.notes = [];
  atomicWrite(dir, file);
  return cleared;
}
