// Pure notes→prompt serializer, lifted verbatim out of App (viewer-decompose P6).
// Reads ONLY its arguments (the open notes + the derived graph), so it is
// unit-testable and is the SSOT for the LLM-ready annotation markdown.
import type { ApiNote, ApiStep } from './app';
import type { Graph } from './graph';
import { stepTitle } from './ui';

/** Format a resolved step's own detail lines (id/title, refs, contract, acceptance). */
function formatStepDetails(step: ApiStep): string[] {
  const lines: string[] = [`- step: \`${step.id}\` — ${stepTitle(step)}`];
  if (step.refs?.length) lines.push(`- refs: ${step.refs.join(', ')}`);
  if (step.contract) lines.push(`- contract: in ${step.contract.in ?? '—'} → out ${step.contract.out ?? '—'}`);
  if (step.acceptance?.length) {
    lines.push('- acceptance:');
    step.acceptance.forEach((a) => lines.push(`  - ${a}`));
  }
  return lines;
}

/** Format one open note + its step context as markdown lines (no header/footer). */
function formatNote(note: ApiNote, index: number, graph: Graph): string[] {
  const journey = graph.byId.get(note.journey);
  const step = note.step ? journey?.steps.find((n) => n.id === note.step) : undefined;
  const lines: string[] = [
    `## Note ${index + 1}`,
    `- journey: \`${note.journey}\`${journey ? ` (${journey.title})` : ''}`,
  ];
  if (step) {
    lines.push(...formatStepDetails(step));
  } else if (note.step) {
    lines.push(`- step: \`${note.step}\``);
  }
  lines.push(`- change requested: ${note.text}`);
  lines.push('');
  return lines;
}

/** Serialize every open note + its step context into an LLM-ready markdown block. */
export function buildPrompt(openNotes: ApiNote[], graph: Graph): string {
  const out: string[] = [
    '# Codestory annotations — apply these changes',
    '',
    'Each note below requests a change against a step in the codestory journeys under `.codestory/`. For each note, edit the referenced journey JSON and/or the code it points to, then mark the note applied.',
    '',
  ];
  openNotes.forEach((note, i) => out.push(...formatNote(note, i, graph)));
  return out.join('\n');
}
