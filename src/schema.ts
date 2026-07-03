import { z } from 'zod';

// SSOT: Keel KB #182 "Codestory v1 Spec" — schema section. Keys stay boring
// (nodes/edges/entries/exits/links/personas) for agent/stranger parseability.

export const StatusSchema = z.enum(['planned', 'built', 'drifted']);
export type Status = z.infer<typeof StatusSchema>;

export const NodeTypeSchema = z.enum(['step', 'decision', 'exit']);
export type NodeType = z.infer<typeof NodeTypeSchema>;

// All spec-grade node fields optional except id/type/label — except exit
// nodes, whose label is optional (KB example: { id, type: "exit", port }) and
// whose port is required.
export const NodeSchema = z
  .strictObject({
    id: z.string().min(1),
    type: NodeTypeSchema,
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
    port: z.string().optional(), // exit nodes: which declared exit this is
  })
  .superRefine((n, ctx) => {
    if (n.type === 'exit' && !n.port) {
      ctx.addIssue({ code: 'custom', path: ['port'], message: 'exit node requires a port' });
    }
    if (n.type !== 'exit' && !n.label) {
      ctx.addIssue({ code: 'custom', path: ['label'], message: 'node requires a label' });
    }
  });
export type Node = z.infer<typeof NodeSchema>;

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
  $schema: z.literal('codestory/journey.v0'),
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
  nodes: z.array(NodeSchema),
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
  $schema: z.literal('codestory/manifest.v0'),
  version: z.number().int(),
  project: z.string().min(1),
  personas: z.array(PersonaSchema).default([]), // personas = named entry lenses; no single root
});
export type Manifest = z.infer<typeof ManifestSchema>;

// Annotations layer: reviewers drop change-notes against journeys/nodes in the
// viewer; agents read them, apply the change, flip them applied. Notes ALWAYS
// live in the sidecar `.codestory/notes.json`, never inside journey files.
export const NoteStatusSchema = z.enum(['open', 'applied']);
export type NoteStatus = z.infer<typeof NoteStatusSchema>;

export const NoteSchema = z.strictObject({
  id: z.string().min(1),
  journey: z.string().min(1), // must reference an existing journey id (base or variant)
  node: z.string().min(1).optional(), // if set, must exist on that journey
  text: z.string().min(1),
  status: NoteStatusSchema.default('open'),
  createdAt: z.string(), // ISO 8601
});
export type Note = z.infer<typeof NoteSchema>;

export const NotesFileSchema = z.strictObject({
  $schema: z.literal('codestory/notes.v0'),
  version: z.number().int(),
  notes: z.array(NoteSchema).default([]),
});
export type NotesFile = z.infer<typeof NotesFileSchema>;
