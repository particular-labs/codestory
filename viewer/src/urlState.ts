// Pure codec for the viewer's *location* — the shareable, refresh-surviving part
// of UI state: which journey path you're in, the selected node, the persona lens,
// and any variant selections. Preferences (theme, flow) live in settings.ts, not here.
//
// Separators ~ , : are safe: journey/node/persona ids are kebab-case and variant
// ids use '@', so none of them collide with the delimiters.
export interface Loc {
  path: string[]; // journey stack ids, root→leaf ([] = map/Root view)
  node: string | null; // selected node id
  persona: string | null; // persona-lens id
  variants: Record<string, string>; // base journey id → chosen variant journey id
}

export const EMPTY_LOC: Loc = { path: [], node: null, persona: null, variants: {} };

/** Keep only what's meaningful for the current view, so stale params don't stick:
 *  a `node` means nothing on the map (no path), and a variant pick is irrelevant
 *  once you've left that journey (its base id is no longer in the path). */
export function relevantLoc(loc: Loc): Loc {
  const inPath = new Set(loc.path);
  const variants: Record<string, string> = {};
  for (const [base, sel] of Object.entries(loc.variants)) if (inPath.has(base)) variants[base] = sel;
  return { path: loc.path, node: loc.path.length ? loc.node : null, persona: loc.persona, variants };
}

/** Loc → query string (no leading '?'). Empty fields are omitted so a bare view
 *  yields '' and the URL stays clean. Ids are concatenated raw (they can't contain
 *  the & = ~ , : delimiters), keeping shared links human-readable instead of a
 *  wall of %7E/%3A percent-escapes. Field order is stable for equality checks. */
export function serializeLocation(loc: Loc): string {
  const parts: string[] = [];
  if (loc.path.length) parts.push('path=' + loc.path.join('~'));
  if (loc.node) parts.push('node=' + loc.node);
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
    path: (q.get('path') ?? '').split('~').filter(Boolean),
    node: q.get('node') || null,
    persona: q.get('persona') || null,
    variants,
  };
}
