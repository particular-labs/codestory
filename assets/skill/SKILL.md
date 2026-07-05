---
name: codestory
description: >-
  Maintain flow journeys for a codebase with codestory — living journey maps kept
  in sync with the code. Use when asked to capture flows, map a codebase into
  journeys, work journey-first (write the visual spec before code), backfill
  journeys after a change, audit journeys for drift, or apply codestory
  notes/annotations. Trigger phrases: "maintain flow journeys", "capture flows",
  "journey-first", "codestory journeys", "apply codestory notes",
  "audit journeys for drift".
---

# codestory

Journeys are flows: a sequence of `action` / `decision` / `exit` steps. Journeys
chain end-to-end by wiring one journey's exit **port** to another journey's
entry. You (the agent) keep journeys true to the code; a local viewer presents
them. Files live in `.codestory/`. `codestory validate` is the contract check —
a nonzero exit means a broken reference, and you must not commit over it.

## Schema cheat-sheet

`src/schema.ts` is the source of truth. Shapes (JSONC, comments illustrative):

```jsonc
// .codestory/codestory.json — the manifest (one per repo)
{
  "$schema": "codestory/manifest.v0",
  "version": 1,
  "project": "MyApp",
  "personas": [ // named entry lenses into the graph; no single root
    { "id": "signup", "title": "Sign up",
      "start": { "journey": "signup", "entry": "start" },
      "journeys": ["signup", "verify-email"] } // bases only, never variants
  ]
}
```

```jsonc
// .codestory/<id>.journey.json — one journey per flow; file name === journey id
{
  "$schema": "codestory/journey.v0",
  "version": 1,                 // bump on structural change
  "id": "signup",
  "title": "Sign up",
  "status": "built",            // planned | built | drifted (default planned)
  "entries": ["start"],         // entry ports callers link to
  "exits": ["verified", "abandoned"], // exit ports (the contract)
  "steps": [                    // ≤ 9 steps; beyond that, extract a sub-journey
    // types: action | decision | exit ONLY.
    // every field optional EXCEPT id/type/label — but exit's label is optional
    // and its `port` is required; every non-exit step requires a `label`.
    { "id": "start", "type": "action", "label": "Open form",
      "refs": ["src/signup/Form.tsx#L1-L40"], // path#anchor, must exist on disk
      "status": "built", "tests": ["tests/signup.test.ts"] }, // built ⇒ tests
    { "id": "valid?", "type": "decision", "label": "Input valid?" },
    { "id": "create", "type": "action", "label": "Create account",
      "journey": "create-user", "with": { "plan": "free" } }, // sub-flow: separate file + args
    { "id": "ok", "type": "exit", "port": "verified" }, // port must be in exits[]
    { "id": "bail", "type": "exit", "port": "abandoned" }
  ],
  "edges": [ // from/to are step ids; label/when freeform
    { "from": "start", "to": "valid?" },
    { "from": "valid?", "to": "create", "when": "valid" },
    { "from": "valid?", "to": "bail", "when": "invalid" }
  ],
  "links": [ // wire THIS journey's exit port → another base journey's entry
    { "exit": "verified", "journey": "verify-email", "entry": "start" }
  ]
}
```

```jsonc
// .codestory/notes.json — reviewer annotations sidecar (optional; never inline in a journey)
{ "$schema": "codestory/notes.v0", "version": 1,
  "notes": [ { "id": "n1", "journey": "signup", "step": "valid?",
               "text": "Add password-strength check", "status": "open",
               "createdAt": "2026-07-03T00:00:00Z" } ] } // status: open | applied
```

Rules the validator enforces: one journey per flow; step ids unique; edges/links
resolve; exit steps only use ports declared in `exits[]`; `built` steps carry
`tests`; `refs` (the part before `#`) exist on disk relative to the repo root
(the parent of `.codestory/`); personas/links/`step.journey` target **base**
journeys only. **Variants**: an alternate take on a base, file
`<base>@<variant>.journey.json` with `id` matching, plus `variantOf: "<base>"`
and `variantLabel`. A variant must declare the **same** `entries`/`exits` as its
base — ports are the contract, so callers always link to the base id.

## Journey-first rule

New feature or refactor → write or extend the journey(s) (or add a variant)
BEFORE the code. The journey is the visual spec: steps are `planned`, refs point
at where code *will* live, exits name the outcomes. Then implement against it.

## Capture recipe (mapping an existing codebase)

You do the reading — there is no static-analysis tool; open the code yourself.

1. Read the codebase and identify 5–8 load-bearing flows (the journeys a user or
   system actually runs end to end).
2. Emit `codestory.json` personas + one journey per flow. Keep each journey ≤ 9
   steps; push detail into sub-journeys via `step.journey` + `with`.
3. Add disk-true `refs` to the real files/lines each step maps to.
4. Set statuses honestly: `built` only when the step has passing `tests`;
   `drifted` when the journey and code diverge or tests are missing; `planned`
   otherwise.
5. `codestory validate` until clean.

## Post-code recipe (after implementing)

1. Backfill `refs` to the code you just wrote and add the `tests` you wrote.
2. Flip `planned` → `built` on steps that now have tests.
3. Promote or delete variants: if a variant won, copy its content over the base,
   bump the base `version`, and delete the variant file (callers already target
   the base, so nothing else changes).
4. `codestory validate`.

## Drift audit checklist

- `refs` that no longer exist on disk → fix the path or mark the step `drifted`.
- steps `built` without `tests` → add tests or drop to `drifted`.
- journey vs. code divergence (branches/steps that no longer match) → mark
  affected steps/journey `drifted` and note what changed.
- run `codestory validate` — a nonzero exit lists the broken references; clear
  them before you consider the audit done.

## Notes workflow (annotations loop)

Reviewers drop notes in the viewer against a journey/step; you resolve them:

1. Read `.codestory/notes.json`. For each note with `status: "open"`:
2. Apply the requested change to the referenced journey/step **and** the code its
   `refs` point at.
3. Flip the note to `applied` — either edit `notes.json` directly, or (while
   `codestory present` is running) `POST /api/notes` with `{ "id": "n1",
   "status": "applied" }`.
4. `codestory validate`. The viewer live-reloads over SSE while `present` runs,
   so the change shows immediately.

## Always validate before commit

Run `codestory validate` before every commit. Exit 0 = references intact; nonzero
= broken references you must fix first.
