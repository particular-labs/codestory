import { expect, test } from 'bun:test';
import { deriveGraph } from './graph';
import { FIXTURE } from './parity.fixture';
import { buildPrompt } from './prompt';

// TDD guard for buildPrompt, lifted verbatim out of App (viewer-decompose P6).
// Pins the LLM-ready markdown App emits for FIXTURE's open notes so a refactor that
// changes the note serialization fails here. Pure: (openNotes, graph) → string.

test('buildPrompt serializes each open note + its step context to markdown', () => {
  const graph = deriveGraph(FIXTURE);
  const openNotes = (FIXTURE.notes ?? []).filter((n) => n.status === 'open');

  const md = buildPrompt(openNotes, graph);

  // exact shape: header block + one `## Note` per open note. FIXTURE has a single
  // open note (n1: signup/save) — the applied journey-level n2 is filtered out upstream.
  expect(md).toBe(
    [
      '# Codestory annotations — apply these changes',
      '',
      'Each note below requests a change against a step in the codestory journeys under `.codestory/`. For each note, edit the referenced journey JSON and/or the code it points to, then mark the note applied.',
      '',
      '## Note 1',
      '- journey: `signup` (Signup)',
      '- step: `save` — Create account',
      '- refs: src/save.ts#save',
      '- contract: in Form → out Account',
      '- acceptance:',
      '  - persists within 200ms',
      '- change requested: tighten the button copy',
      '',
    ].join('\n'),
  );

  // non-vacuity: the applied note never leaks in
  expect(md).not.toContain('journey-level note');
});
