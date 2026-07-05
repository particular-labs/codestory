import * as React from 'react';
import { useStore } from 'zustand';
import { composeExportPng, DEFAULT_EXPORT_OPTS, summarize, type ExportOpts } from './export';
import { frameOffset } from './frame';
import { activePrefix, deriveGraph, type Graph, unionOf } from './graph';
import { Ic } from './icons';
import { loadSettings } from './settings';
import { createAppStore, type AppInit, type AppState } from './store';
import { ExportPopover } from './components/ExportPopover';
import { Header } from './components/Header';
import { NotesHub } from './components/NotesHub';
import { PromptModal } from './components/PromptModal';
import { VersionsPicker } from './components/VersionsPicker';
import { css, GLYPHS, mono, statusMeta, statusPill, stepKind, stepTitle, TYPE_TEXT } from './ui';
import { type Loc, parseLocation, relevantLoc, serializeLocation } from './urlState';
import { useCardDrag } from './useCardDrag';

// ── API projection (viewer-local; SSOT is src/schema.ts, this is read-only) ──

export type Status = 'planned' | 'built' | 'drifted';

export interface ApiStep {
  id: string;
  type: 'action' | 'decision' | 'exit';
  label?: string;
  note?: string;
  refs?: string[];
  contract?: { in?: string; out?: string };
  acceptance?: string[];
  status?: Status;
  tests?: string[];
  ticket?: string;
  journey?: string;
  port?: string;
}

export interface ApiJourney {
  id: string;
  title: string;
  status: Status;
  variantOf?: string;
  variantLabel?: string;
  entries: string[];
  exits: string[];
  steps: ApiStep[];
  edges: Array<{ from: string; to: string; label?: string; when?: string }>;
  links: Array<{ exit: string; journey: string; entry: string }>;
}

export interface ApiPersona {
  id: string;
  title: string;
  persona?: string;
  start: { journey: string; entry: string };
  journeys: string[];
}

export interface ApiNote {
  id: string;
  journey: string;
  step?: string;
  text: string;
  status: 'open' | 'applied';
  createdAt: string;
}

export interface ApiData {
  manifest: { project: string; personas: ApiPersona[] } | null;
  journeys: ApiJourney[];
  issues?: Array<{ file: string; message: string }>;
  notes?: ApiNote[];
}

export interface AppProps {
  data: ApiData;
  defaultTheme: 'dark' | 'light';
  accent: string;
  /** Explicit flow choice (URL param or saved setting), or null when unset —
   *  the App then defaults to vertical on narrow viewports, horizontal otherwise. */
  flowDirection: 'horizontal' | 'vertical' | null;
}

// ── layered DAG auto-layout (from the design export, generalized for cards vs boxes) ──
// Size-aware Sugiyama subset: longest-path ranking → barycenter ordering sweeps
// (crossing reduction) → cumulative per-rank packing using each box's real
// estimated size, so tall boxes never overlap. Gaps are CLEARANCE between boxes.

interface LayoutGaps { main: number; cross: number }
interface SizedBox { id: string; w: number; h: number }
interface Layout { pos: Record<string, { x: number; y: number }>; w: number; h: number }

function computeLayout(boxes: SizedBox[], edges: Array<[string, string]>, vertical: boolean, g: LayoutGaps): Layout {
  const PADX = 32, PADY = 28;
  if (!boxes.length) return { pos: {}, w: PADX * 2, h: PADY * 2 };
  const ids = new Set(boxes.map((n) => n.id));
  const size: Record<string, { w: number; h: number }> = {};
  const authored: Record<string, number> = {};
  boxes.forEach((n, i) => { size[n.id] = { w: n.w, h: n.h }; authored[n.id] = i; });
  const raw: Record<string, string[]> = {};
  boxes.forEach((n) => { raw[n.id] = []; });
  edges.forEach(([a, b]) => { if (ids.has(a) && ids.has(b) && a !== b) raw[a]!.push(b); });

  // 1. detect back-edges (cycle closers) via DFS coloring so ranks stay monotonic
  const color: Record<string, number> = {};
  boxes.forEach((n) => { color[n.id] = 0; });
  const back: Record<string, boolean> = {};
  const dfs = (u: string) => {
    color[u] = 1;
    raw[u]!.forEach((v) => { if (color[v] === 1) back[u + '>' + v] = true; else if (color[v] === 0) dfs(v); });
    color[u] = 2;
  };
  boxes.forEach((n) => { if (color[n.id] === 0) dfs(n.id); });

  // 2. longest-path ranking over forward edges (Kahn relaxation)
  const adj: Record<string, string[]> = {};
  const pred: Record<string, string[]> = {};
  const indeg: Record<string, number> = {};
  boxes.forEach((n) => { adj[n.id] = []; pred[n.id] = []; indeg[n.id] = 0; });
  edges.forEach(([a, b]) => {
    if (!ids.has(a) || !ids.has(b) || a === b || back[a + '>' + b]) return;
    adj[a]!.push(b); pred[b]!.push(a); indeg[b]!++;
  });
  const rank: Record<string, number> = {};
  boxes.forEach((n) => { rank[n.id] = 0; });
  const q = boxes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  while (q.length) {
    const u = q.shift()!;
    adj[u]!.forEach((v) => { if (rank[u]! + 1 > rank[v]!) rank[v] = rank[u]! + 1; if (--indeg[v]! === 0) q.push(v); });
  }

  // 3. bucket boxes by rank, preserving authored order → initial lane order
  const cols: Record<number, string[]> = {};
  let maxRank = 0;
  boxes.forEach((n) => { const r = rank[n.id]!; (cols[r] = cols[r] ?? []).push(n.id); if (r > maxRank) maxRank = r; });

  // 3b. crossing reduction: barycenter ordering sweeps (down, up, down).
  // A box's key is the mean centered lane index of its neighbors in the
  // sweep direction; stable sort + authored tie-break keeps it deterministic.
  const laneIdx: Record<string, number> = {};
  const reindex = (r: number) => (cols[r] ?? []).forEach((id, i) => { laneIdx[id] = i; });
  for (let r = 0; r <= maxRank; r++) reindex(r);
  const centered = (id: string) => laneIdx[id]! - ((cols[rank[id]!]?.length ?? 1) - 1) / 2;
  const sweep = (up: boolean) => {
    for (let s = 0; s <= maxRank; s++) {
      const r = up ? maxRank - s : s;
      const col = cols[r];
      if (!col || col.length < 2) continue;
      const key: Record<string, number> = {};
      col.forEach((id) => {
        const nb = (up ? adj : pred)[id]!.filter((m) => rank[m] !== r);
        key[id] = nb.length ? nb.reduce((a, m) => a + centered(m), 0) / nb.length : centered(id);
      });
      cols[r] = [...col].sort((a, b) => key[a]! - key[b]! || authored[a]! - authored[b]!);
      reindex(r);
    }
  };
  sweep(false); sweep(true); sweep(false);

  // 4. coordinates: main axis advances by each rank's max extent + gap;
  // cross axis packs each rank cumulatively (size + gap) and centers the
  // rank's total span against the widest rank.
  const mainOf = (id: string) => (vertical ? size[id]!.h : size[id]!.w);
  const crossOf = (id: string) => (vertical ? size[id]!.w : size[id]!.h);
  const mainPad = vertical ? PADY : PADX, crossPad = vertical ? PADX : PADY;
  const spanOf = (col: string[]) => col.reduce((a, id) => a + crossOf(id), 0) + (col.length - 1) * g.cross;
  let maxSpan = 0;
  for (let r = 0; r <= maxRank; r++) maxSpan = Math.max(maxSpan, spanOf(cols[r] ?? []));
  const pos: Layout['pos'] = {};
  let mainOff = mainPad;
  for (let r = 0; r <= maxRank; r++) {
    const col = cols[r] ?? [];
    let crossOff = crossPad + (maxSpan - spanOf(col)) / 2;
    let rankMain = 0;
    col.forEach((id) => {
      pos[id] = vertical ? { x: crossOff, y: mainOff } : { x: mainOff, y: crossOff };
      crossOff += crossOf(id) + g.cross;
      rankMain = Math.max(rankMain, mainOf(id));
    });
    mainOff += rankMain + g.main;
  }
  const acrossMain = mainOff - g.main + mainPad;
  const acrossCross = crossPad * 2 + maxSpan;
  return { pos, w: vertical ? acrossCross : acrossMain, h: vertical ? acrossMain : acrossCross };
}

// ── SVG edges (from the design export) ──

export type EdgeTuple = [string, string, string?];
interface Rect { x: number; y: number; w: number; h: number }

function edgesSvg(edges: EdgeTuple[], nodeMap: Record<string, Rect>, dims: { w: number; h: number }, activeSet: Set<string> | null, currentId: string | null, onLabel: ((id: string) => void) | null, vertical: boolean) {
  const R = React.createElement;
  const els: React.ReactNode[] = [];
  edges.forEach((e, i) => {
    const a = nodeMap[e[0]], b = nodeMap[e[1]];
    if (!a || !b) return;
    let x1: number, y1: number, x2: number, y2: number, back: boolean, c1x: number, c1y: number, c2x: number, c2y: number;
    if (vertical) {
      x1 = a.x + a.w / 2; y1 = a.y + a.h; x2 = b.x + b.w / 2; y2 = b.y; back = b.y < a.y;
      if (back) { c1x = x1 + 54; c1y = y1 + 34; c2x = x2 + 54; c2y = y2 - 34; }
      else { const dy = Math.max(30, Math.abs(y2 - y1) / 2); c1x = x1; c1y = y1 + dy; c2x = x2; c2y = y2 - dy; }
    } else {
      x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x; y2 = b.y + b.h / 2; back = b.x < a.x;
      if (back) { c1x = x1 + 46; c1y = y1 - 34; c2x = x2 - 46; c2y = y2 - 34; }
      else { const dx = Math.max(38, Math.abs(x2 - x1) / 2); c1x = x1 + dx; c1y = y1; c2x = x2 - dx; c2y = y2; }
    }
    const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
    const act = !!activeSet && activeSet.has(e[0]) && activeSet.has(e[1]);
    const flowing = currentId != null && e[0] === currentId;
    const stroke = act || flowing ? 'var(--accent)' : 'var(--edge)';
    els.push(R('path', { key: 'p' + i, d, fill: 'none', stroke, strokeWidth: act || flowing ? 2 : 1.5, markerEnd: act || flowing ? 'url(#ah-a)' : 'url(#ah)' }));
    if (flowing) {
      els.push(R('path', { key: 'f' + i, d, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5, strokeLinecap: 'round', strokeDasharray: '2 14', style: { animation: 'dashFlow 0.7s linear infinite' } }));
    }
    const label = e[2];
    if (label) {
      // place the chip ON the curve, alternating 0.42/0.58 along it per edge
      // index so neighboring chips (fan-outs, converging edges) don't stack
      const t = i % 2 === 0 ? 0.42 : 0.58, u = 1 - t;
      const bez = (p0: number, p1: number, p2: number, p3: number) => u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
      const mx = bez(x1, c1x, c2x, x2), my = bez(y1, c1y, c2y, y2), w = label.length * 5.9 + 18;
      const clickable = !!onLabel;
      els.push(R('g', { key: 'g' + i, onPointerDown: clickable ? (ev: React.PointerEvent) => { ev.stopPropagation(); onLabel!(e[0]); } : undefined, style: { cursor: clickable ? 'pointer' : 'default', pointerEvents: clickable ? 'auto' : 'none' } },
        R('rect', { x: mx - w / 2, y: my - 9.5, width: w, height: 19, rx: 6, fill: 'var(--surface)', stroke: act || flowing ? 'var(--accent)' : 'var(--borderStrong)' }),
        R('circle', { cx: mx - w / 2 + 8, cy: my, r: 2.4, fill: act || flowing ? 'var(--accent)' : 'var(--mute)' }),
        R('text', { x: mx + 4, y: my + 3.5, textAnchor: 'middle', fontSize: 10.5, fill: 'var(--fg)', style: { fontFamily: 'inherit', fontWeight: 500 } }, label),
      ));
    }
  });
  const mk = (id: string, c: string) => R('marker', { id, viewBox: '0 0 8 8', markerWidth: 7, markerHeight: 7, refX: 6.5, refY: 4, orient: 'auto' }, R('path', { d: 'M0,0 L8,4 L0,8 Z', fill: c }));
  return R('svg', { width: dims.w, height: dims.h, style: { position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' } }, R('defs', null, mk('ah', 'var(--edge)'), mk('ah-a', 'var(--accent)')), els);
}

// ── themes (from the design export) ──

const THEMES = {
  dark: { bg: '#0e0f13', surface: '#15171d', surface2: '#1c1f27', inset: '#101217', border: '#282c36', borderStrong: '#3a3f4c', fg: '#e7e9f0', dim: '#a2a8b8', mute: '#6a7080', accent: '#7c8cff', accentFg: '#ffffff', accentSoft: 'rgba(124,140,255,0.15)', grid: '#1b1e26', edge: '#3a3f4c', planned: '#7a8194', built: '#3ecf8e', drifted: '#e0a341', shadow: '0 6px 22px rgba(0,0,0,0.4)', overlay: 'rgba(14,15,19,0.7)' },
  light: { bg: '#f5f6f8', surface: '#ffffff', surface2: '#f3f4f7', inset: '#f1f3f6', border: '#e4e7ec', borderStrong: '#cdd3dc', fg: '#1b1e26', dim: '#5b6270', mute: '#98a0ad', accent: '#5b63f0', accentFg: '#ffffff', accentSoft: 'rgba(91,99,240,0.10)', grid: '#e8ebf0', edge: '#c9cfd8', planned: '#8a90a0', built: '#1f9d63', drifted: '#b07d18', shadow: '0 6px 22px rgba(20,25,40,0.10)', overlay: 'rgba(245,246,248,0.72)' },
};

// ── viewer constants ──

const STEP_W = 176, STEP_H = 64;
const CARD_W = 224, CARD_H = 120;
// phone breakpoint — SSOT for every narrow-viewport layout switch (drawer rail,
// compact header, vertical-by-default canvas, bottom-sheet detail, ≥16px inputs)
const NARROW_QUERY = '(max-width: 719px)';
const narrowMql = () => (typeof matchMedia === 'function' ? matchMedia(NARROW_QUERY) : null);
const ROOT_LABEL = 'Root'; // one name for the chain-map home, shared by rail + breadcrumb
const PATH_SEP = '\u0000'; // rail-tree path separator — no filesystem allows it in a filename, so never in a journey id
export interface StackEntry { id: string; callerJourney?: string; callerNode?: string }

// AppState (the 24 fields) + all actions now live in the zustand vanilla store
// (./store, SSOT). The App holds a per-mount store and reads it via `useStore`.

/** Estimated rendered height of a journey step card (pure; mirrors the card CSS:
 *  minHeight 64, ~22 chars/wrapped title line at STEP_W, +28px Step-into button).
 *  Ghosts render no button, but a step may be active in another variant, so we
 *  size sub-flow steps for the button either way — layout stays stable across
 *  variant switches and ghosts just get extra slack. */
const estimateStepH = (n: ApiStep) => {
  const lines = Math.max(1, Math.ceil(stepTitle(n).length / 22));
  return STEP_H + (lines - 1) * 17 + (stepKind(n) === 'subflow' ? 28 : 0);
};
const sizedStep = (n: ApiStep): SizedBox => ({ id: n.id, w: STEP_W, h: estimateStepH(n) });
const portsSummary = (b: ApiJourney) =>
  [b.entries.length ? `entry: ${b.entries.join(', ')}` : '', b.exits.length ? `exits: ${b.exits.join(', ')}` : ''].filter(Boolean).join(' · ');

/** The shareable location embedded in app state (drives urlState serialization).
 *  relevantLoc drops params that don't apply to the current view so nothing sticks. */
const locOf = (s: AppState): Loc => relevantLoc({ journeys: s.stack.map((e) => e.id), step: s.selectedStepId, persona: s.persona, variants: s.variantSel });


/** Everything the old constructor computed once, per mount (two-phase URL seed). */
function computeInit(props: AppProps): AppInit {
  const isNarrow = narrowMql()?.matches ?? false;
  // precedence: explicit URL/saved flow > narrow ? vertical : horizontal
  const flow = props.flowDirection ?? (isNarrow ? 'vertical' : 'horizontal');
  // seed location from the URL so a refresh / shared link lands on the same view.
  // caller-chain info is enriched (and ids validated) in the mount effect.
  const loc = parseLocation(window.location.search);
  const exportOpts = { ...DEFAULT_EXPORT_OPTS, ...(loadSettings().exportOpts ?? {}) };
  return { data: props.data, theme: props.defaultTheme, flow, isNarrow, loc, exportOpts };
}

export function App(props: AppProps) {
  // per-mount seed computed exactly once (the old constructor body).
  const initRef = React.useRef<AppInit | undefined>(undefined);
  if (!initRef.current) initRef.current = computeInit(props);
  const init = initRef.current;

  // per-mount zustand vanilla store (SSOT for the 24 state fields), stable across
  // re-renders. NOT a module singleton — parity mounts App several times.
  const [store] = React.useState(() => createAppStore(init));
  // whole-state subscription: re-renders on exactly the changes the old
  // subscribe→forceUpdate did (every store `set` mints a new state object).
  const state = useStore(store);

  // derived graph, keyed on data identity (the old `_d` cache; refetch swaps data).
  const d = React.useMemo(() => deriveGraph(state.data), [state.data]);

  // layout cache (the old `_lay`): a ref that ACCUMULATES keys across renders and
  // resets only when data identity changes (refetch) — a plain useMemo would drop
  // sibling keys and shift card positions. Reset mirrors refetch clearing `_lay`.
  const layRef = React.useRef<Record<string, Layout>>({});
  const dataRef = React.useRef(state.data);
  if (dataRef.current !== state.data) { dataRef.current = state.data; layRef.current = {}; }

  // the URL-seeded location (enriched once in the mount effect) + the restore guard
  // (don't echo a popstate/restore back into history).
  const initialLocRef = React.useRef(init.loc);
  const restoringRef = React.useRef(false);

  const canvasEl = React.useRef<HTMLDivElement>(null);
  const startDrag = useCardDrag(store);

  /** Reflect location-bearing state into the URL after it changes: pushState on a
   *  journey-path move (so back/forward walks hops), replaceState for step/persona/
   *  variant tweaks (so history isn't flooded). Skips the echo from a restore.
   *  Runs on every store change (subscribe) with the store's prev/next snapshots. */
  const syncUrl = (next: AppState, prevState: AppState) => {
    if (restoringRef.current) { restoringRef.current = false; return; }
    const nextUrl = serializeLocation(locOf(next));
    if (nextUrl === serializeLocation(locOf(prevState))) return;
    const pathMoved = prevState.stack.map((e) => e.id).join('~') !== next.stack.map((e) => e.id).join('~');
    window.history[pathMoved ? 'pushState' : 'replaceState']({}, '', nextUrl ? `?${nextUrl}` : window.location.pathname);
  };

  // ── live reload: SSE tells us .codestory/ changed → refetch + re-render, keeping
  //    the current view/stack/selection wherever those ids still exist ──
  const refetch = async () => {
    try {
      const res = await fetch('/api/journeys');
      if (!res.ok) return;
      const data = (await res.json()) as ApiData;
      layRef.current = {}; // journey set may have changed → drop layout cache (d recomputes on data identity)
      store.getState().applyRefetch(data);
    } catch { /* network blip — keep showing current data */ }
  };

  // ── mount effect: URL-sync subscribe → SSE → matchMedia → seeded restore →
  //    popstate, in the SAME ORDER as the old componentDidMount. Subscribe BEFORE
  //    restore so restore's set() is observed and swallowed by the restore guard.
  //    useStore drives re-renders, so syncUrl must NOT force one. ──
  React.useEffect(() => {
    const unsub = store.subscribe((s, prev) => syncUrl(s, prev));
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      es.addEventListener('reload', () => { void refetch(); });
    } catch { /* SSE unsupported — no live reload, viewer still works */ }
    const mql = narrowMql();
    // one place updates isNarrow; a narrow→wide change also closes the drawer so it
    // can't linger as a stuck overlay when the rail returns inline
    const onNarrow = (ev: MediaQueryListEvent) => store.getState().setNarrow(ev.matches);
    mql?.addEventListener('change', onNarrow);
    // enrich the URL-seeded location: validate ids + rebuild the caller chain
    const l = initialLocRef.current;
    if (l.journeys.length || l.step || l.persona || Object.keys(l.variants).length) {
      restoringRef.current = true;
      store.getState().restoreLocation(l);
    }
    const onPop = () => { restoringRef.current = true; store.getState().restoreLocation(parseLocation(window.location.search)); };
    window.addEventListener('popstate', onPop);
    return () => {
      unsub();
      es?.close();
      mql?.removeEventListener('change', onNarrow);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const closeDrawer = () => state.closeDrawer();

  // ── notes (annotations) ──
  const allNotes = () => state.data.notes ?? [];
  const openNotes = () => allNotes().filter((n) => n.status === 'open');
  const openNotesFor = (journey: string, step: string) => allNotes().filter((n) => n.journey === journey && n.step === step && n.status === 'open');

  const postNote = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) await refetch(); // snappy update; the file-watch SSE would refetch too
      return res.ok;
    } catch { return false; }
  };
  const saveNote = async (journey: string, step: string, text: string) => {
    if (!text.trim()) return;
    const ok = await postNote({ journey, step, text: text.trim() });
    if (ok) state.cancelNote();
  };
  const applyNote = (id: string) => { void postNote({ id, status: 'applied' }); };
  const deleteNote = (id: string) => { void postNote({ id, delete: true }); };
  const clearNotes = () => { void postNote({ clear: true }); };
  const goToNote = (n: { journey: string; step?: string }) => {
    enterJourney(n.journey);
    if (n.step) state.selectNode(n.step);
  };

  /** Serialize every open note + its step context into an LLM-ready markdown block. */
  const buildPrompt = (): string => {
    const out: string[] = [
      '# Codestory annotations — apply these changes',
      '',
      'Each note below requests a change against a step in the codestory journeys under `.codestory/`. For each note, edit the referenced journey JSON and/or the code it points to, then mark the note applied.',
      '',
    ];
    openNotes().forEach((note, i) => {
      const journey = d.byId.get(note.journey);
      const step = note.step ? journey?.steps.find((n) => n.id === note.step) : undefined;
      out.push(`## Note ${i + 1}`);
      out.push(`- journey: \`${note.journey}\`${journey ? ` (${journey.title})` : ''}`);
      if (step) {
        out.push(`- step: \`${step.id}\` — ${stepTitle(step)}`);
        if (step.refs?.length) out.push(`- refs: ${step.refs.join(', ')}`);
        if (step.contract) out.push(`- contract: in ${step.contract.in ?? '—'} → out ${step.contract.out ?? '—'}`);
        if (step.acceptance?.length) { out.push('- acceptance:'); step.acceptance.forEach((a) => out.push(`  - ${a}`)); }
      } else if (note.step) {
        out.push(`- step: \`${note.step}\``);
      }
      out.push(`- change requested: ${note.text}`);
      out.push('');
    });
    return out.join('\n');
  };
  const copyPrompt = async () => {
    const text = buildPrompt();
    try {
      await navigator.clipboard.writeText(text);
      state.setCopied(true);
      setTimeout(() => store.getState().setCopied(false), 1500);
    } catch {
      state.setPrompt(text); // fallback: show a selectable textarea
    }
  };

  const layout = (key: string, boxes: SizedBox[], edges: Array<[string, string]>, vertical: boolean, gaps: LayoutGaps): Layout => {
    const k = `${key}:${vertical ? 'v' : 'h'}`;
    layRef.current[k] = layRef.current[k] ?? computeLayout(boxes, edges, vertical, gaps);
    return layRef.current[k]!;
  };

  // ── navigation (read helpers; mutations delegate to the store) ──

  const curEntry = () => state.stack[state.stack.length - 1] ?? null;
  /** The displayed journey: the selected variant of the stacked base id, else the base. */
  const curJourney = () => {
    const e = curEntry();
    if (!e) return null;
    const sel = state.variantSel[e.id];
    return d.byId.get(sel ?? e.id) ?? null;
  };
  const setVariant = (baseId: string, journeyId: string) => state.setVariant(baseId, journeyId);
  /** The journey id actually displayed for a base id (its selected variant, else itself). */
  const displayedId = (baseId: string) => state.variantSel[baseId] ?? baseId;
  const steps = () => curJourney()?.steps ?? [];
  const selIndex = () => steps().findIndex((n) => n.id === state.selectedStepId);

  const enterJourney = (id: string) => state.enterJourney(id);
  /** Enter a nested journey with its full caller chain (rail tree click) so
   *  breadcrumbs, Return chips, and the persona lens see the real call stack. */
  const enterPath = (ids: string[]) => state.enterPath(ids);
  const stepInto = (subId: string, callerNode: string) => state.stepInto(subId, callerNode);
  const goCrumb = (k: number) => state.goCrumb(k);
  const selectNode = (id: string) => state.selectNode(id);
  const setPersona = (id: string) => state.togglePersona(id);
  const toggleTheme = () => state.toggleTheme();
  /** Copy a link to the exact current view (URL already encodes the location). */
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      state.setLinkCopied(true);
      window.setTimeout(() => store.getState().setLinkCopied(false), 1400);
    } catch {
      state.setPrompt(window.location.href); // clipboard blocked → manual-copy overlay
    }
  };

  /** Export the visible canvas (chain map or current journey) as a framed 2x PNG:
   *  header + background grid + centered padding + legend, per the export-options.
   *  The heavy DOM assembly lives in export.ts; here we just supply theme + meta. */
  const exportPng = async () => {
    const el = canvasEl.current;
    if (!el) return;
    const vars: Record<string, string> = { ...THEMES[state.theme], accent: props.accent || THEMES[state.theme].accent };
    const journey = curJourney();
    const project = props.data.manifest?.project ?? 'codestory';
    const flowName = journey
      ? `${journey.title}${journey.variantOf && journey.variantLabel ? ` — ${journey.variantLabel}` : ''}`
      : 'Root';
    const meta = journey
      ? { title: flowName, subtitle: portsSummary(journey), legend: summarize(journey.steps) }
      : { title: `${project} — Root`, subtitle: `${d.order.length} journeys · ${props.data.manifest?.personas?.length ?? 0} personas`, legend: `${d.order.length} journeys` };
    const dataUrl = await composeExportPng(el, vars, meta, state.exportOpts);
    const a = document.createElement('a');
    a.href = dataUrl;
    // every file leads with the app name, then the flow, then the date: "<app> — <flow> - DD-MM-YYYY.png"
    const n = new Date();
    const p2 = (x: number) => String(x).padStart(2, '0');
    const date = `${p2(n.getDate())}-${p2(n.getMonth() + 1)}-${n.getFullYear()}`;
    a.download = `${`${project} — ${flowName} - ${date}`.replace(/[\\/:*?"<>|]/g, '-')}.png`; // filesystem-safe
    a.click();
    state.closeExport();
  };
  const toggleFlow = () => state.toggleFlow();

  const step = (dir: number) => {
    const ns = steps();
    if (!ns.length) return;
    let i = selIndex();
    if (i < 0) i = 0;
    const ni = Math.max(0, Math.min(ns.length - 1, i + dir));
    state.selectNode(ns[ni]!.id);
  };
  const hop = (nextId: string) => state.hop(nextId);

  const returnToParent = () => state.returnToParent();

  const continueTarget = (): { label: string; onClick: () => void } | null => {
    const ns = steps();
    const cur = ns[selIndex()];
    const journey = curJourney();
    if (!cur || cur.type !== 'exit' || !journey) return null;
    const e = curEntry();
    if (e?.callerJourney && e.callerNode) {
      const parent = d.byId.get(displayedId(e.callerJourney));
      const returnEdge = parent?.edges.find((ed) => ed.from === e.callerNode);
      const returnNode = parent?.steps.find((n) => n.id === returnEdge?.to);
      return { label: `Return → ${returnNode ? stepTitle(returnNode) : parent?.title ?? 'parent'}`, onClick: () => returnToParent() };
    }
    const link = journey.links.find((l) => l.exit === cur.port);
    const next = link ? d.byId.get(link.journey) : null;
    if (next) return { label: `Continue → ${next.title}`, onClick: () => hop(next.id) };
    return null;
  };

  // ── render ──
  const t: Record<string, string> = { ...THEMES[state.theme], accent: props.accent || THEMES[state.theme].accent };
    const rootStyle: Record<string, string> = {};
    Object.keys(t).forEach((k) => { rootStyle['--' + k] = t[k]!; });
    Object.assign(rootStyle, css("background:var(--bg);color:var(--fg);height:100vh;width:100%;display:flex;flex-direction:column;overflow:hidden;position:relative;font-size:14px;") as Record<string, string>, { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif', WebkitFontSmoothing: 'antialiased' });

    const isMap = state.view === 'map';
    const isJourney = state.view === 'journey';
    const vertical = state.flow === 'vertical';
    const { isNarrow, drawerOpen } = state;
    const topJourneyId = state.stack[0]?.id ?? null;
    const persona = state.persona ? d.personas.find((j) => j.id === state.persona) ?? null : null;
    const personaSet = persona ? new Set(persona.journeys) : null;
    const q = state.query.trim().toLowerCase();

    // chain map
    const chainLayout = layout('__chain', d.order.map((id) => ({ id, w: CARD_W, h: CARD_H })), d.chainEdges.map((e) => [e[0], e[1]] as [string, string]), vertical, { main: vertical ? 80 : 106, cross: vertical ? 66 : 50 });
    const mapRects: Record<string, Rect> = {};
    const mapCards = d.order.map((id, idx) => {
      const b = d.byId.get(id)!;
      const inJ = !personaSet || personaSet.has(id);
      const matchQ = !q || b.title.toLowerCase().includes(q) || b.id.includes(q) || b.steps.some((n) => stepTitle(n).toLowerCase().includes(q));
      const dim = !inJ || !matchQ;
      const built = b.steps.filter((n) => n.status === 'built').length;
      const mkey = (vertical ? 'v' : 'h') + ':' + id;
      const base = chainLayout.pos[id] ?? { x: 32, y: 32 };
      const mp = state.mapPos[mkey];
      const px = mp?.x ?? base.x, py = mp?.y ?? base.y;
      mapRects[id] = { x: px, y: py, w: CARD_W, h: CARD_H };
      const portStyle = (edge: 'left' | 'right' | 'top' | 'bottom'): React.CSSProperties => ({
        position: 'absolute',
        ...(vertical ? { left: '50%', marginLeft: -6 } : { top: 54 }),
        [edge]: -6,
        width: 11, height: 11, borderRadius: '50%', background: 'var(--surface)',
        border: `2px solid var(--${personaSet && inJ ? 'accent' : 'borderStrong'})`,
      });
      return {
        id, index: `JOURNEY ${idx + 1}`, title: b.title, sub: portsSummary(b),
        meta: `${b.steps.length} steps · ${built} built`,
        statusText: statusMeta(b.status).label, statusStyle: statusPill(b.status),
        style: { position: 'absolute', left: px, top: py, width: CARD_W, height: CARD_H, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow)', padding: '13px 15px', display: 'flex', flexDirection: 'column', cursor: 'grab', userSelect: 'none', touchAction: 'none', opacity: dim ? 0.34 : 1, transition: 'opacity 200ms ease, box-shadow 160ms ease', outline: inJ && personaSet ? '1.5px solid var(--accent)' : 'none', outlineOffset: -1.5 } as React.CSSProperties,
        entryPort: portStyle(vertical ? 'top' : 'left'), exitPort: portStyle(vertical ? 'bottom' : 'right'),
        onPointerDown: (e: React.PointerEvent) => startDrag('map', id, mkey, px, py, e),
      };
    });
    // shift so a dragged-left card stays reachable, then size the canvas to fit
    const mf = frameOffset(Object.values(mapRects));
    if (mf.dx || mf.dy) {
      for (const id in mapRects) { mapRects[id]!.x += mf.dx; mapRects[id]!.y += mf.dy; }
      for (const c of mapCards) { c.style.left = (c.style.left as number) + mf.dx; c.style.top = (c.style.top as number) + mf.dy; }
    }
    const mapDims = { w: Math.max(vertical ? chainLayout.w : Math.max(chainLayout.w, 480), mf.w), h: Math.max(360, mf.h) };
    const chainEdgesEl = edgesSvg(d.chainEdges, mapRects, mapDims, personaSet, null, null, vertical);

    // personas rail
    const personaList = d.personas.map((j) => {
      const active = state.persona === j.id;
      return {
        id: j.id, label: j.title, count: `${j.journeys.length}/${d.order.length}`,
        onClick: () => setPersona(j.id),
        dotStyle: { width: 8, height: 8, borderRadius: 2, background: active ? 'var(--accent)' : 'var(--mute)' } as React.CSSProperties,
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accentSoft)' : 'transparent', color: 'var(--fg)', textAlign: 'left' } as React.CSSProperties,
      };
    });
    const jJourneys = persona?.journeys ?? null;
    // top level = root journeys only; a persona-listed sub-journey stays nested (no duplicate rows)
    const railOrder = (jJourneys ? [...jJourneys, ...d.order.filter((id) => !jJourneys.includes(id))] : d.order).filter((id) => d.order.includes(id));
    const countBadge: React.CSSProperties = { fontFamily: mono, fontSize: 10, color: 'var(--mute)' };
    const stepBadge: React.CSSProperties = { fontFamily: mono, fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'var(--accentSoft)', border: '1px solid var(--accent)', borderRadius: 5, padding: '1px 6px' };
    const outBadge: React.CSSProperties = { fontFamily: mono, fontSize: 10, color: 'var(--mute)', opacity: 0.7 };
    const railJourneys = railOrder.flatMap((id) => {
      const b = d.byId.get(id);
      if (!b) return [];
      const active = topJourneyId === id;
      const inJ = !jJourneys || jJourneys.includes(id);
      const seq = jJourneys ? jJourneys.indexOf(id) : -1;
      return [{
        id, inJ,
        badge: jJourneys ? (inJ ? `${seq + 1}` : 'skip') : `${b.steps.length}`,
        badgeStyle: jJourneys ? (inJ ? stepBadge : outBadge) : countBadge,
      }];
    });

    // one rail row + its sub-flow children, recursively; `visited` holds the
    // ancestor chain so a cyclic sub-flow reference can never recurse forever
    const railRow = (id: string, path: string, inJ: boolean, badge: string, badgeStyle: React.CSSProperties, visited: Set<string>): React.ReactNode => {
      const b = d.byId.get(id);
      if (!b) return null;
      const subs = (d.subsByJourney.get(id) ?? []).filter((s) => !visited.has(s));
      const open = state.railOpen[path] ?? true; // expanded by default — visible sub-flows are what makes the rail self-explanatory
      const active = curEntry()?.id === id; // highlight the journey being viewed, not the stack root
      return (
        <div key={path} style={css('display:flex;flex-direction:column;gap:2px;')}>
          <div style={css('display:flex;align-items:center;gap:0;')}>
            <button
              onClick={() => state.toggleRail(path)}
              data-tip={subs.length ? (open ? 'Collapse sub-flows' : 'Show sub-flows') : undefined} data-tip-align="left"
              style={{ flex: '0 0 auto', width: 20, height: 28, border: 'none', background: 'none', color: 'var(--dim)', fontSize: 16, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: subs.length ? 'pointer' : 'default', visibility: subs.length ? 'visible' : 'hidden' }}
            >{open ? <Ic n="chevron-down" size={14} /> : <Ic n="chevron-right" size={14} />}</button>
            <button onClick={() => { enterPath(path.split(PATH_SEP)); closeDrawer(); }} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '1 1 auto', minWidth: 0, padding: '7px 10px 7px 4px', borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accentSoft)' : 'transparent', color: 'var(--fg)', opacity: inJ ? 1 : 0.45, cursor: 'pointer' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${b.status})`, flex: '0 0 auto', opacity: inJ ? 1 : 0.4 }}></span>
              <span style={css('font-size:12.5px;font-weight:500;flex:1 1 auto;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{b.title}</span>
              <span style={badgeStyle}>{badge}</span>
            </button>
          </div>
          {open && subs.length > 0 && (
            <div style={css('margin-left:11px;padding-left:8px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:2px;')}>
              {subs.map((s) => railRow(s, `${path}${PATH_SEP}${s}`, inJ, `${d.byId.get(s)?.steps.length ?? 0}`, countBadge, new Set([...visited, s])))}
            </div>
          )}
        </div>
      );
    };
    const railHint = persona
      ? persona.persona ?? persona.title
      : isJourney
        ? 'Step through steps with the ◂ ▸ controls below. At an exit, follow the chip to the next journey.'
        : 'Pick a persona to highlight their path, or open a journey. Journeys chain exit → entry into one continuous movie.';

    // journey view — `journey` is the displayed version; ghosts come from the others
    const baseEntryId = curEntry()?.id ?? '';
    const baseJourney = d.byId.get(baseEntryId) ?? null;
    const variants = d.variantsByBase.get(baseEntryId) ?? [];
    const versions = baseJourney ? [baseJourney, ...variants] : [];
    const journey = curJourney();
    const journeyId = journey?.id ?? '';
    const ns = steps();
    const selI = selIndex();
    const activeSet = activePrefix(ns, selI);

    // with variants, lay out the UNION of all versions so shared steps don't
    // jump when the picker switches; without, keep the plain per-journey layout
    const hasVariants = versions.length > 1;
    const { steps: unionSteps, edges: unionEdges } = unionOf(versions);
    // gaps are clearance between boxes: main keeps the old rank pitch feel
    // (260-176 / 128-64); cross is breathing room — real sizes do the rest
    const journeyGaps = { main: vertical ? 64 : 84, cross: vertical ? 48 : 28 };
    const lay = journey
      ? hasVariants
        ? layout(`${baseEntryId}:union:${versions.map((v) => v.id).join(',')}`, unionSteps.map(sizedStep), unionEdges, vertical, journeyGaps)
        : layout(journeyId, journey.steps.map(sizedStep), journey.edges.map((e) => [e.from, e.to] as [string, string]), vertical, journeyGaps)
      : null;
    const eff = (n: ApiStep) => {
      const base = lay?.pos[n.id] ?? { x: 32, y: 28 };
      const key = `${journeyId}:${vertical ? 'v' : 'h'}:${n.id}`;
      const o = state.stepPos[key];
      return { x: o?.x ?? base.x, y: o?.y ?? base.y, key };
    };
    const journeyRects: Record<string, Rect> = {};
    (hasVariants ? unionSteps : ns).forEach((n) => { const p = eff(n); journeyRects[n.id] = { x: p.x, y: p.y, w: STEP_W, h: estimateStepH(n) }; });
    // frame offset: keep left/up-dragged steps reachable, then rects hold rendered coords
    const jf = frameOffset(Object.values(journeyRects));
    if (jf.dx || jf.dy) for (const id in journeyRects) { journeyRects[id]!.x += jf.dx; journeyRects[id]!.y += jf.dy; }

    // diff vs the base (only meaningful when a variant is displayed)
    const baseNodeById = new Map((baseJourney?.steps ?? []).map((n) => [n.id, n]));
    const activeIds = new Set(ns.map((n) => n.id));
    const stepDiff = (n: ApiStep): 'new' | 'changed' | null => {
      if (!journey?.variantOf) return null;
      const b = baseNodeById.get(n.id);
      if (!b) return 'new';
      const sig = (x: ApiStep) => JSON.stringify([x.type, x.journey, x.port, x.label, x.status, x.note, x.contract, x.acceptance, x.refs]);
      return sig(n) !== sig(b) ? 'changed' : null;
    };
    // ghosts: union steps/edges not in the displayed version, at low opacity
    const ghostSteps = hasVariants ? unionSteps.filter((n) => !activeIds.has(n.id)) : [];
    const activeEdgeKeys = new Set((journey?.edges ?? []).map((e) => `${e.from}>${e.to}`));
    const ghostEdges: EdgeTuple[] = hasVariants ? unionEdges.filter(([a, b]) => !activeEdgeKeys.has(`${a}>${b}`)) : [];

    const journeySteps = ns.map((n) => {
      const isSel = n.id === state.selectedStepId;
      const kind = stepKind(n);
      const p = eff(n);
      const status = n.status ?? 'planned';
      return {
        id: n.id, title: stepTitle(n), typeText: TYPE_TEXT[kind]!, glyph: GLYPHS[kind]!, isSubflow: kind === 'subflow', subJourney: n.journey, diff: stepDiff(n),
        noteCount: journeyId ? openNotesFor(journeyId, n.id).length : 0,
        dotStyle: { width: 8, height: 8, borderRadius: '50%', background: `var(--${status})`, flex: '0 0 auto' } as React.CSSProperties,
        style: { position: 'absolute', left: p.x + jf.dx, top: p.y + jf.dy, width: STEP_W, minHeight: STEP_H, borderRadius: 10, border: kind === 'decision' ? '1.5px dashed var(--borderStrong)' : `1px solid ${kind === 'exit' ? 'var(--accent)' : 'var(--border)'}`, background: isSel ? 'var(--surface2)' : kind === 'exit' ? 'var(--accentSoft)' : 'var(--surface)', boxShadow: isSel ? '0 0 0 2px var(--accent)' : 'var(--shadow)', padding: '9px 11px', display: 'flex', flexDirection: 'column', cursor: 'grab', userSelect: 'none', touchAction: 'none', transition: 'box-shadow 150ms ease, background 150ms ease', zIndex: isSel ? 3 : 2 } as React.CSSProperties,
        onPointerDown: (e: React.PointerEvent) => startDrag('step', n.id, p.key, p.x, p.y, e),
      };
    });
    // vertical: hug content width so margin:auto centers the flow; horizontal keeps a
    // min width; both grow to the framed extent so dragged-out steps stay scrollable
    const baseW = vertical ? (lay?.w ?? 480) : Math.max(lay?.w ?? 480, 480);
    const journeyDims = lay ? { w: Math.max(baseW, jf.w), h: Math.max(360, jf.h) } : { w: 480, h: 360 };
    const journeyEdgeTuples: EdgeTuple[] = (journey?.edges ?? []).map((e) => [e.from, e.to, e.label ?? e.when]);
    const journeyEdgesEl = journey ? edgesSvg(journeyEdgeTuples, journeyRects, journeyDims, activeSet, state.selectedStepId, (id) => selectNode(id), vertical) : null;

    // crumbs
    const crumbBtn = (last: boolean): React.CSSProperties => ({ border: 'none', background: 'none', padding: '3px 6px', borderRadius: 5, color: last ? 'var(--fg)' : 'var(--dim)', fontWeight: last ? 600 : 500, fontSize: 12.5, cursor: last ? 'default' : 'pointer' });
    const crumbs: Array<{ label: string; onClick: () => void; style: React.CSSProperties }> = [{ label: ROOT_LABEL, onClick: () => goCrumb(0), style: crumbBtn(false) }];
    const crumbSep = (): React.CSSProperties => ({ border: 'none', background: 'none', color: 'var(--mute)', fontSize: 12, padding: '0 1px', cursor: 'default' });
    const stackLen = state.stack.length;
    state.stack.forEach((entry, i) => {
      const last = i === stackLen - 1;
      // narrow: collapse the middle of a deep path to a single "…" (up one level)
      // so a long call stack never widens the header past the viewport
      if (isNarrow && stackLen > 2 && i > 0 && !last) {
        if (i === 1) {
          crumbs.push({ label: '/', onClick: () => {}, style: crumbSep() });
          crumbs.push({ label: '…', onClick: () => goCrumb(stackLen - 1), style: crumbBtn(false) });
        }
        return;
      }
      crumbs.push({ label: '/', onClick: () => {}, style: crumbSep() });
      crumbs.push({ label: d.byId.get(entry.id)?.title ?? entry.id, onClick: () => goCrumb(i + 1), style: crumbBtn(last) });
    });

    // transport + detail
    const selNode = ns[selI];
    const narration = selNode ? selNode.note ?? '' : journey ? portsSummary(journey) : '';
    const stepLabel = ns.length ? `${(selI < 0 ? 1 : selI + 1)} / ${ns.length}` : '';
    const pct = ns.length ? Math.round(((selI < 0 ? 0 : selI + 1) / ns.length) * 100) : 0;
    const cont = continueTarget();
    const atStart = selI <= 0;
    const atEnd = selI >= ns.length - 1;
    const navBtn = (disabled: boolean): React.CSSProperties => ({ width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inset)', color: disabled ? 'var(--mute)' : 'var(--dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' });
    const selStatus = selNode?.status ?? 'planned';
    // honest rule: criteria read as verified only when the step is built (has tests)
    const chk = (_i: number) => selStatus === 'built';
    const detailShown = isJourney && !!selNode && state.detailOpen;
    const lensBlocked = isJourney && !!personaSet && !!topJourneyId && !personaSet.has(topJourneyId);
    // left rail: inline 220px column normally; on narrow it's an overlay drawer
    // (absolute within the content row) that slides in over a tap-to-close backdrop
    const railStyle: React.CSSProperties = isNarrow
      ? { ...css('position:absolute;left:0;top:0;bottom:0;z-index:40;border-right:1px solid var(--border);background:var(--surface);padding:14px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:18px;box-shadow:var(--shadow);'), width: 280, maxWidth: '82vw', transform: drawerOpen ? 'translateX(0)' : 'translateX(-102%)', transition: 'transform 200ms ease' }
      : css('width:220px;flex:0 0 auto;border-right:1px solid var(--border);background:var(--surface);padding:14px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:18px;');

    return (
      <div style={rootStyle as React.CSSProperties}>
        <Header
          isNarrow={isNarrow}
          isMap={isMap}
          isJourney={isJourney}
          vertical={vertical}
          project={state.data.manifest?.project}
          issues={state.data.issues ?? []}
          query={state.query}
          setQuery={state.setQuery}
          crumbs={crumbs}
          notesOpen={state.notesOpen}
          toggleNotes={state.toggleNotes}
          openNotesCount={openNotes().length}
          toggleFlow={toggleFlow}
          linkCopied={state.linkCopied}
          copyLink={copyLink}
          exportOpen={state.exportOpen}
          toggleExport={state.toggleExport}
          theme={state.theme}
          toggleTheme={toggleTheme}
          toggleDrawer={state.toggleDrawer}
        />

        {state.notesOpen && (
          <NotesHub
            notes={allNotes()}
            byId={d.byId}
            openCount={openNotes().length}
            copied={state.copied}
            isNarrow={isNarrow}
            goToNote={goToNote}
            applyNote={applyNote}
            deleteNote={deleteNote}
            copyPrompt={copyPrompt}
            clearNotes={clearNotes}
          />
        )}

        {state.exportOpen && (
          <ExportPopover
            exportOpts={state.exportOpts}
            isNarrow={isNarrow}
            toggleExportOpt={state.toggleExportOpt}
            exportPng={exportPng}
          />
        )}

        <div style={css('flex:1 1 auto;display:flex;min-height:0;position:relative;')}>
          {isNarrow && drawerOpen && (
            <div onPointerDown={closeDrawer} style={css('position:absolute;inset:0;z-index:38;background:var(--overlay);animation:fadeZoom 160ms ease;')}></div>
          )}
          <div style={railStyle}>
            <div>
              <div style={css('padding:0 4px 9px;')}>
                <div style={css('font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);')}>Personas</div>
                <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>Lens · reorders the journeys</div>
              </div>
              <div style={css('display:flex;flex-direction:column;gap:4px;')}>
                {personaList.map((j) => (
                  <button key={j.id} onClick={j.onClick} style={j.style}>
                    <span style={css('display:flex;align-items:center;gap:9px;')}>
                      <span style={j.dotStyle}></span>
                      <span style={css('font-size:13px;font-weight:550;')}>{j.label}</span>
                    </span>
                    <span style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);")}>{j.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={css('padding:0 4px 9px;')}>
                <div style={css('font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);')}>{jJourneys ? `${persona!.title} path` : 'Journeys'}</div>
                <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>{jJourneys ? 'Steps in this persona’s flow' : 'Open a journey to inspect'}</div>
              </div>
              <div style={css('display:flex;flex-direction:column;gap:2px;')}>
                {/* Root is "selected" only when it's truly the whole map — view=map AND no persona lens; one active thing at a time */}
                <button onClick={() => { goCrumb(0); closeDrawer(); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 9px', borderRadius: 8, border: `1px solid ${isMap && !persona ? 'var(--accent)' : 'var(--border)'}`, background: isMap && !persona ? 'var(--accentSoft)' : 'var(--inset)', color: 'var(--fg)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  <span style={css('display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;background:var(--accentSoft);color:var(--accent);font-size:11px;flex:0 0 auto;')}>⊞</span>
                  <span style={css('flex:1 1 auto;text-align:left;')}>{ROOT_LABEL}</span>
                  <span style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--mute);")}>{isMap && !persona ? 'here' : 'root'}</span>
                </button>
                <div style={css('margin-left:9px;padding-left:2px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:2px;')}>
                  {railJourneys.map((b) => railRow(b.id, b.id, b.inJ, b.badge, b.badgeStyle, new Set([b.id])))}
                </div>
              </div>
            </div>

            <div style={css('margin-top:auto;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--inset);font-size:11.5px;line-height:1.5;color:var(--dim);')}>{railHint}</div>
          </div>

          <div style={css('flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;')}>
            {isMap && (
              <div style={css('flex:1 1 auto;position:relative;overflow:auto;background:var(--bg);background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:22px 22px;animation:fadeZoom 240ms ease;')}>
                <div ref={canvasEl} style={{ position: 'relative', width: mapDims.w, height: mapDims.h, margin: vertical ? '32px auto' : 32 }}>
                  <div style={css('position:absolute;left:0;top:0;')}>{chainEdgesEl}</div>
                  {mapCards.map((m) => (
                    <div key={m.id} data-export-step onPointerDown={m.onPointerDown} style={m.style}>
                      <span style={m.entryPort}></span>
                      <span style={m.exitPort}></span>
                      <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                        <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute);letter-spacing:0.04em;")}>{m.index}</span>
                        <span style={m.statusStyle}>{m.statusText}</span>
                      </div>
                      <div style={css('font-size:15px;font-weight:600;letter-spacing:-0.01em;margin-top:8px;')}>{m.title}</div>
                      <div style={css('font-size:11.5px;color:var(--dim);line-height:1.4;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>{m.sub}</div>
                      <div style={css("margin-top:auto;display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mute);font-family:'JetBrains Mono',monospace;")}>{m.meta}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isJourney && (
              <div style={css('flex:1 1 auto;display:flex;flex-direction:column;min-height:0;position:relative;animation:fadeZoom 220ms ease;')}>
                {lensBlocked && (
                  <div style={css('position:absolute;inset:0;z-index:14;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--overlay);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:panelUp 200ms ease;')}>
                    <div style={css('max-width:400px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:26px 26px 22px;')}>
                      <div style={css('width:34px;height:34px;border-radius:9px;background:var(--accentSoft);border:1px solid var(--accent);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:15px;margin:0 auto 14px;')}>⦻</div>
                      <div style={css('font-size:15.5px;font-weight:650;letter-spacing:-0.01em;')}>Not on the {persona?.title} path</div>
                      <div style={css('font-size:12.5px;color:var(--dim);line-height:1.55;margin-top:8px;')}>The <b style={css('color:var(--fg);font-weight:600;')}>{persona?.title}</b> lens doesn’t pass through <b style={css('color:var(--fg);font-weight:600;')}>{journey?.title}</b>. Pick a journey this persona actually uses:</div>
                      <div style={css('display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px;')}>
                        {(jJourneys ?? []).map((id, i) => (
                          <button key={id} onClick={() => enterJourney(id)} style={css('display:flex;align-items:center;gap:8px;height:34px;padding:0 13px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:var(--accentFg);font-size:12.5px;font-weight:600;cursor:pointer;')}>
                            <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;opacity:0.85;")}>{i + 1}</span>{d.byId.get(id)?.title ?? id}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => state.clearPersona()} style={css('margin-top:16px;border:none;background:none;color:var(--mute);font-size:11.5px;cursor:pointer;text-decoration:underline;text-underline-offset:2px;')}>Clear lens instead</button>
                    </div>
                  </div>
                )}
                {hasVariants && (
                  <VersionsPicker
                    versions={versions}
                    journey={journey}
                    journeyId={journeyId}
                    baseEntryId={baseEntryId}
                    isNarrow={isNarrow}
                    versionsOpen={state.versionsOpen}
                    setVariant={setVariant}
                    openVersions={state.openVersions}
                    closeVersions={state.closeVersions}
                  />
                )}
                <div style={css('flex:1 1 auto;position:relative;overflow:auto;background:var(--bg);background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:22px 22px;')}>
                  <div style={css('position:absolute;left:16px;top:14px;z-index:5;')}>
                    <div style={css('font-size:17px;font-weight:650;letter-spacing:-0.015em;')}>{journey?.title}</div>
                    <div style={css('font-size:12px;color:var(--dim);margin-top:2px;')}>{journey ? portsSummary(journey) : ''}</div>
                  </div>
                  <div ref={canvasEl} style={{ position: 'relative', width: journeyDims.w, height: journeyDims.h, margin: vertical ? '64px auto 40px' : '64px 40px 40px' }}>
                    {ghostEdges.length > 0 && (
                      <div style={css('position:absolute;left:0;top:0;opacity:0.22;')}>{edgesSvg(ghostEdges, journeyRects, journeyDims, null, null, null, vertical)}</div>
                    )}
                    <div style={css('position:absolute;left:0;top:0;')}>{journeyEdgesEl}</div>
                    {ghostSteps.map((n) => {
                      const p = eff(n);
                      const kind = stepKind(n);
                      return (
                        <div key={'ghost-' + n.id} data-export-step data-ghost style={{ position: 'absolute', left: p.x + jf.dx, top: p.y + jf.dy, width: STEP_W, minHeight: STEP_H, borderRadius: 10, border: '1.5px dashed var(--borderStrong)', background: 'var(--surface)', padding: '9px 11px', display: 'flex', flexDirection: 'column', opacity: 0.22, pointerEvents: 'none', zIndex: 1 }}>
                          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px;')}>
                            <span style={css("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.06em;color:var(--mute);")}>{GLYPHS[kind]}{TYPE_TEXT[kind]}</span>
                          </div>
                          <div style={css('font-size:13px;font-weight:600;letter-spacing:-0.01em;line-height:1.25;margin-top:5px;')}>{stepTitle(n)}</div>
                        </div>
                      );
                    })}
                    {journeySteps.map((n) => (
                      <div key={n.id} data-export-step onPointerDown={n.onPointerDown} style={n.style}>
                        <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px;')}>
                          <span style={css("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.06em;color:var(--mute);display:flex;align-items:center;gap:5px;")}>{n.glyph}{n.typeText}</span>
                          <span style={css('display:flex;align-items:center;gap:5px;')}>
                            {n.noteCount > 0 && (
                              <span title={`${n.noteCount} open note${n.noteCount > 1 ? 's' : ''}`} style={css("font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:700;color:var(--accentFg);background:var(--accent);border-radius:9px;min-width:14px;height:14px;padding:0 4px;display:flex;align-items:center;justify-content:center;")}>✎{n.noteCount}</span>
                            )}
                            {n.diff && (
                              <span style={css("font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:600;color:var(--accent);background:var(--accentSoft);border:1px solid var(--accent);border-radius:4px;padding:1px 5px;")}>{n.diff === 'new' ? '+ new' : 'Δ'}</span>
                            )}
                            <span style={n.dotStyle}></span>
                          </span>
                        </div>
                        <div style={css('font-size:13px;font-weight:600;letter-spacing:-0.01em;line-height:1.25;margin-top:5px;')}>{n.title}</div>
                        {n.isSubflow && (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); stepInto(n.subJourney!, n.id); }}
                            style={css('margin-top:7px;align-self:flex-start;font-size:10.5px;font-weight:600;color:var(--accent);background:var(--accentSoft);border:1px solid var(--accent);border-radius:5px;padding:2px 8px;display:flex;align-items:center;gap:4px;cursor:pointer;')}
                          >Step into ↘</button>
                        )}
                      </div>
                    ))}
                    {state.notePopover && state.notePopover.journey === journeyId && journeyRects[state.notePopover.step] && (
                      <div
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{ position: 'absolute', left: journeyRects[state.notePopover.step]!.x, top: journeyRects[state.notePopover.step]!.y + journeyRects[state.notePopover.step]!.h + 8, zIndex: 30, width: 244, padding: 12, borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--surface)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 9 }}
                      >
                        <div style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);")}>Note on {state.notePopover.step}</div>
                        <textarea
                          autoFocus
                          value={state.noteDraft}
                          onChange={(e) => state.setNoteDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveNote(state.notePopover!.journey, state.notePopover!.step, state.noteDraft); } if (e.key === 'Escape') state.closeNotePopover(); }}
                          placeholder="What should change here?"
                          style={{ width: '100%', minHeight: 68, resize: 'vertical', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inset)', color: 'var(--fg)', padding: '7px 9px', fontSize: isNarrow ? 16 : 12.5, fontFamily: 'inherit', outline: 'none' }}
                        />
                        <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:7px;')}>
                          <button onClick={() => state.cancelNote()} style={css('height:28px;padding:0 11px;border-radius:6px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:12px;cursor:pointer;')}>Cancel</button>
                          <button onClick={() => void saveNote(state.notePopover!.journey, state.notePopover!.step, state.noteDraft)} disabled={!state.noteDraft.trim()} style={{ height: 28, padding: '0 13px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accentFg)', fontSize: 12, fontWeight: 600, cursor: state.noteDraft.trim() ? 'pointer' : 'default', opacity: state.noteDraft.trim() ? 1 : 0.5 }}>Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={css('flex:0 0 auto;border-top:1px solid var(--border);background:var(--surface);z-index:10;')}>
                  {(() => {
                    const detailToggle = (
                      <button
                        data-tip={state.detailOpen ? 'Hide step detail' : 'Show step detail'}
                        data-tip-pos="up"
                        onClick={() => state.toggleDetail()}
                        style={{ ...css('border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);display:flex;align-items:center;justify-content:center;'), flex: '0 0 auto', marginLeft: 'auto', width: isNarrow ? 36 : 30, height: isNarrow ? 36 : 30 }}
                      >{state.detailOpen ? <Ic n="chevron-down" size={isNarrow ? 19 : 16} /> : <Ic n="chevron-up" size={isNarrow ? 19 : 16} />}</button>
                    );
                    const navGroup = (
                      <div style={css('display:flex;align-items:center;gap:6px;flex:0 0 auto;')}>
                        <button data-tip="Previous step" data-tip-pos="up" data-tip-align="left" onClick={() => step(-1)} style={navBtn(atStart)}><Ic n="chevron-left" size={16} /></button>
                        <button data-tip="Next step" data-tip-pos="up" data-tip-align="left" onClick={() => step(1)} style={navBtn(atEnd)}><Ic n="chevron-right" size={16} /></button>
                      </div>
                    );
                    const stepChip = <div style={css("flex:0 0 auto;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);width:48px;")}>{stepLabel}</div>;
                    const progress = (grow: boolean) => (
                      <div style={{ ...css('height:4px;border-radius:3px;background:var(--inset);overflow:hidden;'), flex: grow ? '1 1 auto' : '0 0 120px' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 220ms ease' }}></div>
                      </div>
                    );
                    // block=true → full-width own-row button (phone: no horizontal squeeze, so no clipping)
                    const contChip = (block: boolean) => cont && (
                      <button onClick={cont.onClick} style={{ ...css('border-radius:7px;border:1px solid var(--accent);background:var(--accentSoft);color:var(--accent);font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;animation:slideUp 220ms ease;'), ...(block ? { width: '100%', minHeight: 38, padding: '8px 13px', lineHeight: 1.3, textAlign: 'center' as const } : { height: 32, padding: '0 13px', flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>{cont.label}</button>
                    );
                    return isNarrow ? (
                      // phone: controls row (chevron pinned right), then narration row — canvas keeps its space
                      <div style={{ ...css('display:flex;flex-direction:column;gap:10px;'), padding: '12px 12px calc(14px + env(safe-area-inset-bottom))' }}>
                        <div style={css('display:flex;align-items:center;gap:10px;')}>
                          {navGroup}{stepChip}{progress(true)}{detailToggle}
                        </div>
                        <div style={{ ...css('font-size:12.5px;color:var(--fg);line-height:1.4;'), display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{narration}</div>
                        {contChip(true)}
                      </div>
                    ) : (
                      <div style={css('min-height:56px;display:flex;align-items:center;gap:14px;padding:9px 16px;')}>
                        {navGroup}{stepChip}{progress(false)}
                        <div style={css('flex:1 1 auto;min-width:0;font-size:12.5px;color:var(--fg);line-height:1.45;')}>{narration}</div>
                        {contChip(false)}{detailToggle}
                      </div>
                    );
                  })()}

                  {detailShown && selNode && (
                    <div style={{ ...css('border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:14px 34px;overflow-y:auto;animation:panelUp 200ms ease;'), padding: isNarrow ? '20px 16px calc(28px + env(safe-area-inset-bottom))' : '16px 18px', maxHeight: isNarrow ? '50vh' : 236 }}>
                      <div style={css('flex:0 0 auto;max-width:280px;display:flex;flex-direction:column;')}>
                        <div style={css('display:flex;align-items:center;gap:9px;')}>
                          <span style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.06em;color:var(--mute);")}>{TYPE_TEXT[stepKind(selNode)]}</span>
                          <span style={statusPill(selStatus)}>{statusMeta(selStatus).label}</span>
                        </div>
                        <div style={css('font-size:16px;font-weight:650;letter-spacing:-0.01em;margin-top:8px;')}>{stepTitle(selNode)}</div>
                        <div style={css('font-size:12px;color:var(--dim);line-height:1.5;margin-top:6px;')}>{selNode.note ?? ''}</div>
                      </div>

                      {(selNode.refs?.length ?? 0) > 0 && (
                        <div style={css('flex:0 0 auto;')}>
                          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;')}>Code refs</div>
                          <div style={css('display:flex;flex-direction:column;gap:5px;')}>
                            {selNode.refs!.map((r, i) => (
                              <span key={i} style={css("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg);background:var(--inset);border:1px solid var(--border);border-radius:5px;padding:4px 8px;")}>{r}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selNode.contract && (
                        <div style={css('flex:0 0 auto;')}>
                          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;')}>Contract</div>
                          <div style={css("display:flex;flex-direction:column;gap:6px;font-family:'JetBrains Mono',monospace;font-size:11px;")}>
                            <div style={css('display:flex;gap:8px;')}><span style={css('color:var(--mute);width:30px;flex:0 0 auto;')}>in</span><span style={css('color:var(--fg);')}>{selNode.contract.in ?? '—'}</span></div>
                            <div style={css('display:flex;gap:8px;')}><span style={css('color:var(--mute);width:30px;flex:0 0 auto;')}>out</span><span style={css('color:var(--fg);')}>{selNode.contract.out ?? '—'}</span></div>
                          </div>
                        </div>
                      )}

                      {(selNode.acceptance?.length ?? 0) > 0 && (
                        <div style={css('flex:0 0 auto;')}>
                          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;')}>Acceptance</div>
                          <div style={css('display:flex;flex-direction:column;gap:6px;')}>
                            {selNode.acceptance!.map((a, i) => {
                              const on = chk(i);
                              return (
                                <div key={i} style={css('display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.4;')}>
                                  <span style={{ flex: '0 0 auto', width: 15, height: 15, borderRadius: 4, border: `1px solid ${on ? 'var(--built)' : 'var(--borderStrong)'}`, background: on ? 'var(--built)' : 'transparent', color: '#fff', fontSize: 10, lineHeight: '13px', textAlign: 'center', marginTop: 1 }}>{on ? '✓' : ''}</span>
                                  <span style={{ color: on ? 'var(--fg)' : 'var(--dim)' }}>{a}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selNode.ticket && (
                        <div style={css('flex:0 0 auto;')}>
                          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;')}>Ticket</div>
                          <span style={css("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);background:var(--accentSoft);border:1px solid var(--accent);border-radius:5px;padding:4px 9px;")}>{selNode.ticket}</span>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {state.promptText !== null && (
          <PromptModal promptText={state.promptText} clearPrompt={state.clearPrompt} />
        )}
      </div>
    );
}
