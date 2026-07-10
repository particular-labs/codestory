import type { Journey } from './schema';

// Pure formatter: journey data in, markdown string out. No filesystem access —
// callers (the MCP get_journey_context tool today, a future `codestory export`
// CLI command later) own loading the data via validateDir.

function metaLine(j: Journey): string {
  const meta = [`status: ${j.status}`];
  if (j.variantOf) meta.push(`variant of: \`${j.variantOf}\``);
  if (j.owner) meta.push(`owner: ${j.owner}`);
  return meta.join(' · ');
}

function portsLine(j: Journey): string | null {
  const parts: string[] = [];
  if (j.entries.length) parts.push(`entries: ${j.entries.map((e) => `\`${e}\``).join(', ')}`);
  if (j.exits.length) parts.push(`exits: ${j.exits.map((e) => `\`${e}\``).join(', ')}`);
  return parts.length ? parts.join(' · ') : null;
}

function stepLine(s: Journey['steps'][number]): string[] {
  const parts = [`- **${s.id}** (${s.type})`];
  if (s.label) parts.push(s.label);
  if (s.status) parts.push(`[${s.status}]`);
  if (s.journey) parts.push(`→ sub-journey \`${s.journey}\``);
  if (s.port) parts.push(`port \`${s.port}\``);
  const lines = [parts.join(' — ')];
  if (s.note) lines.push(`  note: ${s.note}`);
  return lines;
}

/** Render a journey's Steps/Edges/Links subsections at heading depth `sub`
 *  (edges/links are omitted when empty). */
function renderStepsEdgesLinks(j: Journey, sub: string): string[] {
  const lines: string[] = ['', `${sub} Steps`];
  for (const s of j.steps) lines.push(...stepLine(s));

  if (j.edges.length) {
    lines.push('', `${sub} Edges`);
    for (const e of j.edges) lines.push(`- ${e.from} → ${e.to}${e.label ? ` (${e.label})` : ''}`);
  }

  if (j.links.length) {
    lines.push('', `${sub} Links`);
    for (const l of j.links) lines.push(`- exit \`${l.exit}\` → \`${l.journey}\` @ \`${l.entry}\``);
  }

  return lines;
}

/** Render one journey as compact markdown, including its steps/edges/links.
 *  `level` is the heading depth for the journey title (1 = `#`); its
 *  subsections (Steps/Edges/Links) render one level deeper. */
function renderJourney(j: Journey, level: number): string[] {
  const h = '#'.repeat(level);
  const sub = '#'.repeat(level + 1);
  const lines: string[] = [`${h} ${j.title} (\`${j.id}\`)`, metaLine(j)];
  const ports = portsLine(j);
  if (ports) lines.push(ports);
  if (j.nonGoals?.length) lines.push(`non-goals: ${j.nonGoals.join('; ')}`);

  lines.push(...renderStepsEdgesLinks(j, sub));

  return lines;
}

/**
 * Render one journey (+ its linked/sub-journeys, one level deep) as compact
 * markdown for an agent context window. `all` is the full set of journeys the
 * caller loaded (e.g. via validateDir) — used to resolve related-journey ids.
 * Related journeys are NOT expanded further (their own sub-journeys/links are
 * not pulled in) to keep the output bounded.
 */
export function formatJourneyContext(journey: Journey, all: Journey[]): string {
  const byId = new Map(all.map((j) => [j.id, j]));
  const lines = renderJourney(journey, 1);

  const relatedIds = new Set<string>();
  for (const s of journey.steps) if (s.journey) relatedIds.add(s.journey);
  for (const l of journey.links) relatedIds.add(l.journey);
  relatedIds.delete(journey.id);

  const related = [...relatedIds].map((id) => byId.get(id)).filter((j): j is Journey => j !== undefined);
  if (related.length) {
    lines.push('', '## Related journeys');
    for (const rel of related) {
      lines.push('', ...renderJourney(rel, 3));
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
