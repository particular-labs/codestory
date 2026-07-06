// Pure notes→prompt serializer, lifted verbatim out of App (viewer-decompose P6).
// Reads ONLY its arguments (the open notes + the derived graph), so it is
// unit-testable and is the SSOT for the LLM-ready annotation markdown.
import type { ApiNote } from './app';
import type { Graph } from './graph';
import { stepTitle } from './ui';

/** Serialize every open note + its step context into an LLM-ready markdown block. */
export function buildPrompt(openNotes: ApiNote[], graph: Graph): string {
  const out: string[] = [
    '# Codestory annotations — apply these changes',
    '',
    'Each note below requests a change against a step in the codestory journeys under `.codestory/`. For each note, edit the referenced journey JSON and/or the code it points to, then mark the note applied.',
    '',
  ];
  openNotes.forEach((note, i) => {
    const journey = graph.byId.get(note.journey);
    const step = note.step ? journey?.steps.find((n) => n.id === note.step) : undefined;
    out.push(`## Note ${i + 1}`);
    out.push(`- journey: \`${note.journey}\`${journey ? ` (${journey.title})` : ''}`);
    if (step) {
      out.push(`- step: \`${step.id}\` — ${stepTitle(step)}`);
      if (step.refs?.length) out.push(`- refs: ${step.refs.join(', ')}`);
      if (step.contract) out.push(`- contract: in ${step.contract.in ?? '—'} → out ${step.contract.out ?? '—'}`);
      if (step.acceptance?.length) { out.push('- acceptance:'); step.acceptance.forEach((a) => out.push(`  - ${a}`)); }
    } else if (note.step) {
      out.push(`- step: \`${note.step}\``);
    }
    out.push(`- change requested: ${note.text}`);
    out.push('');
  });
  return out.join('\n');
}
