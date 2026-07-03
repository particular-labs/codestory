// SSOT for persisted viewer settings (theme, flow direction, …).
// Precedence: explicit URL param (per-visit override, not persisted) > saved setting > default.
const NS = 'codestory:';

export function loadSetting(key: string, urlValue: string | null, allowed: string[], fallback: string): string {
  if (urlValue && allowed.includes(urlValue)) return urlValue;
  try {
    const stored = localStorage.getItem(NS + key);
    if (stored && allowed.includes(stored)) return stored;
  } catch { /* storage unavailable (private mode) — fall back */ }
  return fallback;
}

export function saveSetting(key: string, value: string): void {
  try { localStorage.setItem(NS + key, value); } catch { /* best-effort */ }
}
