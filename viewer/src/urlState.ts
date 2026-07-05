// Pure codec for the viewer's *location* — the shareable, refresh-surviving part
// of UI state: which journeys you're drilled into, the selected step, the persona
// lens, and any variant selections. Preferences (theme, flow) live in settings.ts.
//
// Separators ~ , : are safe: journey/step/persona ids are kebab-case and variant
// ids use '@', so none of them collide with the delimiters.
export interface Loc {
  journeys: string[]; // journey drill-down ids, root→leaf ([] = map/Root view)
  step: string | null; // selected step id
  persona: string | null; // persona-lens id
  variants: Record<string, string>; // base journey id → chosen variant journey id
}

export const EMPTY_LOC: Loc = { journeys: [], step: null, persona: null, variants: {} };

/** Keep only what's meaningful for the current view, so stale params don't stick:
 *  a `step` means nothing on the map (no journey), and a variant pick is irrelevant
 *  once you've left that journey (its base id is no longer in the drill-down). */
export function relevantLoc(loc: Loc): Loc {
  const inJourneys = new Set(loc.journeys);
  const variants: Record<string, string> = {};
  for (const [base, sel] of Object.entries(loc.variants)) if (inJourneys.has(base)) variants[base] = sel;
  return { journeys: loc.journeys, step: loc.journeys.length ? loc.step : null, persona: loc.persona, variants };
}

/** Loc → query string (no leading '?'). Empty fields are omitted so a bare view
 *  yields '' and the URL stays clean. Ids are concatenated raw (they can't contain
 *  the & = ~ , : delimiters), keeping shared links human-readable instead of a
 *  wall of %7E/%3A percent-escapes. Field order is stable for equality checks. */
export function serializeLocation(loc: Loc): string {
  const parts: string[] = [];
  if (loc.journeys.length) parts.push('journeys=' + loc.journeys.join('~'));
  if (loc.step) parts.push('step=' + loc.step);
  if (loc.persona) parts.push('persona=' + loc.persona);
  const v = Object.entries(loc.variants);
  if (v.length) parts.push('variants=' + v.map(([base, sel]) => `${base}:${sel}`).join(','));
  return parts.join('&');
}

/** Query string (with or without leading '?') → Loc. Malformed pieces are dropped,
 *  never thrown — a hand-edited or stale shared link degrades, it doesn't crash. */
export function parseLocation(search: string): Loc {
  const q = new Map<string, string>();
  for (const kv of (search.startsWith('?') ? search.slice(1) : search).split('&')) {
    const i = kv.indexOf('=');
    if (i > 0) q.set(kv.slice(0, i), kv.slice(i + 1));
  }
  const variants: Record<string, string> = {};
  for (const pair of (q.get('variants') ?? '').split(',')) {
    if (!pair) continue;
    const i = pair.indexOf(':');
    if (i <= 0) continue;
    variants[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return {
    journeys: (q.get('journeys') ?? '').split('~').filter(Boolean),
    step: q.get('step') || null,
    persona: q.get('persona') || null,
    variants,
  };
}
