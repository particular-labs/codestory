import * as React from 'react';
import type { ApiStep, Status } from './app';

// ── shared presentational primitives ──
// Pure, DOM-free helpers lifted out of app.tsx so the extracted presentational
// components can share them without an app↔component runtime cycle (this module
// imports only TYPES from app, which are erased at runtime).

export const mono = "'JetBrains Mono',monospace";

const _cssCache: Record<string, React.CSSProperties> = {};

/** Parse the design export's inline style strings into React style objects, once each. */
export function css(str: string): React.CSSProperties {
  const hit = _cssCache[str];
  if (hit) return hit;
  const o: Record<string, string> = {};
  str.split(';').forEach((p) => {
    const i = p.indexOf(':');
    if (i < 0) return;
    let k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) return;
    k = k.replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    o[k] = v;
  });
  _cssCache[str] = o as React.CSSProperties;
  return _cssCache[str]!;
}

export function statusMeta(s: Status) {
  return { label: s.charAt(0).toUpperCase() + s.slice(1), varName: '--' + s };
}
export function statusPill(s: Status): React.CSSProperties {
  const m = statusMeta(s);
  return { color: `var(${m.varName})`, border: `1px solid var(${m.varName})`, background: 'transparent', borderRadius: 5, padding: '2px 7px', fontSize: 9.5, fontWeight: 600, fontFamily: mono, letterSpacing: '0.02em' };
}

export const GLYPHS: Record<string, string> = { step: '', decision: '◇ ', subflow: '▤ ', exit: '⚑ ' };
export const TYPE_TEXT: Record<string, string> = { step: 'STEP', decision: 'DECISION', subflow: 'SUB-FLOW', exit: 'EXIT' };

export const stepKind = (n: ApiStep) => (n.journey ? 'subflow' : n.type);
export const stepTitle = (n: ApiStep) => n.label ?? n.port ?? n.id;
