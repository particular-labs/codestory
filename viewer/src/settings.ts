// SSOT for persisted viewer settings (theme, flow direction, …).
// Precedence: explicit URL param (per-visit override, not persisted) > saved setting > default.
const NS = 'codestory:';

/** Resolve a setting to its explicit source (URL override, then saved preference),
 *  or null when the user has expressed no choice — lets callers apply a
 *  context-dependent default (e.g. narrow viewport → vertical) only when nothing
 *  explicit exists, without conflating "unset" with a baked-in fallback. */
export function loadSettingOrNull(key: string, urlValue: string | null, allowed: string[]): string | null {
  if (urlValue && allowed.includes(urlValue)) return urlValue;
  try {
    const stored = localStorage.getItem(NS + key);
    if (stored && allowed.includes(stored)) return stored;
  } catch { /* storage unavailable (private mode) — fall back */ }
  return null;
}

export function loadSetting(key: string, urlValue: string | null, allowed: string[], fallback: string): string {
  return loadSettingOrNull(key, urlValue, allowed) ?? fallback;
}

export function saveSetting(key: string, value: string): void {
  try { localStorage.setItem(NS + key, value); } catch { /* best-effort */ }
}
