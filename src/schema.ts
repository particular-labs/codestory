import { z } from 'zod';

// SSOT: Keel KB #182 "Codestory v1 Spec" — schema section. Keys stay boring
// (steps/edges/entries/exits/links/personas) for agent/stranger parseability.

// Format ids — the `$schema` value carries the format version. These name the
// LATEST format; `migrate` upgrades older files up to these (see migrate.ts).
// Bump one of these + add a migration case when a format changes structurally.
export const JOURNEY_SCHEMA_ID = 'codestory/journey.v1';
export const NOTES_SCHEMA_ID = 'codestory/notes.v1';
export const MANIFEST_SCHEMA_ID = 'codestory/manifest.v0';

export const StatusSchema = z.enum(['planned', 'built', 'drifted']);
export type Status = z.infer<typeof StatusSchema>;

export const StepTypeSchema = z.enum(['action', 'decision', 'exit']);
export type StepType = z.infer<typeof StepTypeSchema>;

// All spec-grade step fields optional except id/type/label — except exit
// steps, whose label is optional (KB example: { id, type: "exit", port }) and
// whose port is required.
export const StepSchema = z
  .strictObject({
    id: z.string().min(1),
    type: StepTypeSchema,
    label: z.string().min(1).optional(),
    note: z.string().optional(),
    refs: z.array(z.string()).optional(),
    contract: z.strictObject({ in: z.string().optional(), out: z.string().optional() }).optional(),
    acceptance: z.array(z.string()).optional(),
    data: z.array(z.string()).optional(),
    actors: z.array(z.string()).optional(),
    effects: z.array(z.string()).optional(),
    errors: z.array(z.strictObject({ to: z.string(), when: z.string().optional() })).optional(),
    status: StatusSchema.optional(),
    tests: z.array(z.string()).optional(),
    ticket: z.string().optional(),
    ui: z.string().optional(),
    journey: z.string().optional(), // sub-flow: separate journey file, never inlined
    with: z.record(z.string(), z.unknown()).optional(), // args passed into sub-journey
    port: z.string().optional(), // exit steps: which declared exit this is
  })
  .superRefine((n, ctx) => {
    if (n.type === 'exit' && !n.port) {
      ctx.addIssue({ code: 'custom', path: ['port'], message: 'exit step requires a port' });
    }
    if (n.type !== 'exit' && !n.label) {
      ctx.addIssue({ code: 'custom', path: ['label'], message: 'step requires a label' });
    }
  });
export type Step = z.infer<typeof StepSchema>;

export const EdgeSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  when: z.string().optional(), // freeform v0
});
export type Edge = z.infer<typeof EdgeSchema>;

export const LinkSchema = z.strictObject({
  exit: z.string(),
  journey: z.string(),
  entry: z.string(),
});
export type Link = z.infer<typeof LinkSchema>;

export const JourneySchema = z.strictObject({
  $schema: z.literal(JOURNEY_SCHEMA_ID),
  version: z.number().int(), // bump on structural change
  id: z.string().min(1),
  title: z.string().min(1),
  status: StatusSchema.default('planned'),
  // variant journeys: a full alternate take on `variantOf`, same entries/exits
  // (ports are the contract — callers always link to the base id)
  variantOf: z.string().min(1).optional(),
  variantLabel: z.string().optional(),
  owner: z.string().optional(),
  docs: z.array(z.string()).optional(),
  nonGoals: z.array(z.string()).optional(),
  entries: z.array(z.string()).default([]),
  exits: z.array(z.string()).default([]),
  steps: z.array(StepSchema),
  edges: z.array(EdgeSchema).default([]),
  links: z.array(LinkSchema).default([]),
});
export type Journey = z.infer<typeof JourneySchema>;

export const PersonaSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  persona: z.string().optional(),
  start: z.strictObject({ journey: z.string(), entry: z.string() }),
  journeys: z.array(z.string()),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const ManifestSchema = z.strictObject({
  $schema: z.literal(MANIFEST_SCHEMA_ID),
  version: z.number().int(),
  project: z.string().min(1),
  personas: z.array(PersonaSchema).default([]), // personas = named entry lenses; no single root
});
export type Manifest = z.infer<typeof ManifestSchema>;

// Annotations layer: reviewers drop change-notes against journeys/steps in the
// viewer; agents read them, apply the change, flip them applied. Notes ALWAYS
// live in the sidecar `.codestory/notes.json`, never inside journey files.
export const NoteStatusSchema = z.enum(['open', 'applied']);
export type NoteStatus = z.infer<typeof NoteStatusSchema>;

export const NoteSchema = z.strictObject({
  id: z.string().min(1),
  journey: z.string().min(1), // must reference an existing journey id (base or variant)
  step: z.string().min(1).optional(), // if set, must exist on that journey
  text: z.string().min(1),
  status: NoteStatusSchema.default('open'),
  createdAt: z.string(), // ISO 8601
});
export type Note = z.infer<typeof NoteSchema>;

export const NotesFileSchema = z.strictObject({
  $schema: z.literal(NOTES_SCHEMA_ID),
  version: z.number().int(),
  notes: z.array(NoteSchema).default([]),
});
export type NotesFile = z.infer<typeof NotesFileSchema>;
