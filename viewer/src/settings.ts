// SSOT for persisted viewer *preferences* — the durable, follows-you-everywhere
// choices (theme, flow direction, export defaults). Location (which journey/step
// you're looking at) is not a preference; it lives in the URL — see urlState.ts.
//
// Stored as one JSON object under `codestory:settings`. Precedence for a given
// pref: explicit URL param (per-visit override, not persisted) > saved value > default.
import type { ExportOpts } from './export-meta';

export type Theme = 'dark' | 'light';
export type FlowDir = 'horizontal' | 'vertical';

export interface Settings {
  theme?: Theme;
  flow?: FlowDir;
  exportOpts?: ExportOpts;
}

const KEY = 'codestory:settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Settings;
    return migrateLegacy(); // first run since the object landed — fold old per-key values in
  } catch {
    return {}; // storage unavailable (private mode) or corrupt JSON — safe empty
  }
}

export function saveSettings(patch: Partial<Settings>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSettings(), ...patch }));
  } catch {
    /* best-effort */
  }
}

/** URL param override (per-visit) > saved preference > fallback. */
export function resolvePref<T extends string>(urlValue: string | null, saved: T | undefined, allowed: readonly T[], fallback: T | null): T | null {
  if (urlValue && (allowed as readonly string[]).includes(urlValue)) return urlValue as T;
  if (saved && allowed.includes(saved)) return saved;
  return fallback;
}

/** One-time fold of the previous `codestory:theme` / `codestory:flow` keys into the
 *  object, so an existing user's saved theme/flow survive the format change. */
function migrateLegacy(): Settings {
  const s: Settings = {};
  try {
    const t = localStorage.getItem('codestory:theme');
    if (t === 'dark' || t === 'light') s.theme = t;
    const f = localStorage.getItem('codestory:flow');
    if (f === 'horizontal' || f === 'vertical') s.flow = f;
    if (s.theme || s.flow) localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}
