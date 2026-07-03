# Slice-1 assumptions log (vs KB #182)

Working notes for phased execution — reconcile into KB comments at close-out.

1. **Exit-node label**: KB says "all fields optional except id/type/label" but its own
   exit example is `{ id, type: "exit", port }` with no label. Resolved: `label`
   optional for `type: exit` (viewer falls back to port name), required otherwise;
   `port` required for exit nodes, optional (unused) otherwise. → flag to KB.
2. **Strict objects**: schemas reject unknown keys. Not stated in KB, but boards are
   agent-written JSON — typo'd field names should fail validate, not silently drop.
   → flag to KB.
3. **AstroDemo set omits `refs`**: validate checks refs exist on disk; AstroDemo source
   lives in another repo. Board-first workflow says refs are backfilled post-code,
   so the hand-written set ships without refs (optional field). Statuses stay mixed
   (planned/built/drifted) for demo value; `built` nodes carry `tests` entries
   (existence of test paths is NOT checked per KB wording — only refs are).
4. **Viewer**: KB mentions React Flow; the Claude Design export implements its own
   canvas + layered DAG auto-layout. Ticket #2021 + user say port the design, don't
   redesign → no React Flow dep. → flag to KB.
5. **`contract.in/out`** both optional (KB shows both but doesn't mark required).
6. **`when`/`label` on edges** freeform optional strings per KB v0.
7. **CLI lib**: citty (KB offers "citty or commander").
8. **Persona rail**: design export includes the journeys/persona lens (nominally
   slice 2); it comes free with the port and reads from manifest journeys — kept.
