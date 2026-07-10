import * as React from 'react';
import { useStore } from 'zustand';
import { composeExportPng, DEFAULT_EXPORT_OPTS, summarize, type ExportOpts } from './export';
import { frameOffset } from './frame';
import { activePrefix, continueTarget as continueTargetOf, deriveGraph, type Graph, unionOf } from './graph';
import { buildPrompt } from './prompt';
import { loadSettings } from './settings';
import { createAppStore, type AppInit, type AppState } from './store';
import { ExportPopover } from './components/ExportPopover';
import { Header } from './components/Header';
import { ChainMap } from './components/ChainMap';
import { JourneyCanvas } from './components/JourneyCanvas';
import { Rail } from './components/Rail';
import { NotesHub } from './components/NotesHub';
import { PromptModal } from './components/PromptModal';
import { css, GLYPHS, mono, statusMeta, statusPill, stepKind, stepTitle, TYPE_TEXT } from './ui';
import { dagreLayout } from './dagreLayout';
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

declare global {
  interface Window {
    // Present in the `codestory build` static export: the whole payload inlined into
    // index.html. When set, the viewer reads it instead of fetching /api/journeys and
    // never opens the SSE live-reload stream (there's no server behind a static export).
    __CODESTORY_DATA__?: ApiData;
  }
}

export interface AppProps {
  data: ApiData;
  defaultTheme: 'dark' | 'light';
  accent: string;
  /** Explicit flow choice (URL param or saved setting), or null when unset —
   *  the App then defaults to vertical on narrow viewports, horizontal otherwise. */
  flowDirection: 'horizontal' | 'vertical' | null;
}

// ── layout types (shared by the render path + the dagre layout adapter) ──
// Graph auto-layout is delegated to @dagrejs/dagre (see ./dagreLayout); the render
// path consumes its `Layout` output unchanged. Gaps are CLEARANCE between boxes.

interface LayoutGaps { main: number; cross: number }
interface SizedBox { id: string; w: number; h: number }
interface Layout { pos: Record<string, { x: number; y: number }>; w: number; h: number }

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
    // static export (window.__CODESTORY_DATA__) has no server → never open the SSE stream
    if (!window.__CODESTORY_DATA__) {
      try {
        es = new EventSource('/api/events');
        es.addEventListener('reload', () => { void refetch(); });
      } catch { /* SSE unsupported — no live reload, viewer still works */ }
    }
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

  // Static export (window.__CODESTORY_DATA__): no server behind it, so note mutations
  // can't be persisted. The notes-hub affordance is hidden (see Header), and postNote is
  // a belt-and-braces no-op — never silently POST into the void and lose the annotation.
  const isStatic = typeof window !== 'undefined' && !!window.__CODESTORY_DATA__;

  const postNote = async (body: Record<string, unknown>): Promise<boolean> => {
    if (isStatic) { console.warn('codestory: notes are disabled in a static export (no server to persist to)'); return false; }
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

  const copyPrompt = async () => {
    const text = buildPrompt(openNotes(), d);
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
    layRef.current[k] = layRef.current[k] ?? dagreLayout(boxes, edges, vertical, gaps);
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

  /** Wire the pure continue-target descriptor (graph.ts) to store actions: a `return`
   *  descriptor walks back up the stack, a `continue` hops to its target journey. */
  const continueTarget = (): { label: string; onClick: () => void } | null => {
    const desc = continueTargetOf(steps(), selIndex(), curJourney(), curEntry(), d, state.variantSel);
    if (!desc) return null;
    return { label: desc.label, onClick: desc.kind === 'return' ? () => returnToParent() : () => hop(desc.targetId) };
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
    const ghostEdgesEl = ghostEdges.length > 0
      ? <div style={css('position:absolute;left:0;top:0;opacity:0.22;')}>{edgesSvg(ghostEdges, journeyRects, journeyDims, null, null, null, vertical)}</div>
      : null;
    const ghostCards = ghostSteps.map((n) => {
      const p = eff(n);
      const kind = stepKind(n);
      return {
        id: n.id, title: stepTitle(n), typeText: TYPE_TEXT[kind]!, glyph: GLYPHS[kind]!,
        style: { position: 'absolute', left: p.x + jf.dx, top: p.y + jf.dy, width: STEP_W, minHeight: STEP_H, borderRadius: 10, border: '1.5px dashed var(--borderStrong)', background: 'var(--surface)', padding: '9px 11px', display: 'flex', flexDirection: 'column', opacity: 0.22, pointerEvents: 'none', zIndex: 1 } as React.CSSProperties,
      };
    });

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
          isStatic={isStatic}
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
          <Rail
            railStyle={railStyle}
            personaList={personaList}
            railJourneys={railJourneys}
            jJourneys={jJourneys}
            personaTitle={persona?.title}
            isMap={isMap}
            hasPersona={!!persona}
            rootLabel={ROOT_LABEL}
            railHint={railHint}
            countBadge={countBadge}
            goCrumb={goCrumb}
            closeDrawer={closeDrawer}
            byId={d.byId}
            subsByJourney={d.subsByJourney}
            railOpen={state.railOpen}
            toggleRail={state.toggleRail}
            enterPath={enterPath}
            curEntryId={curEntry()?.id ?? null}
            pathSep={PATH_SEP}
          />

          <div style={css('flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;')}>
            {isMap && (
              <ChainMap mapCards={mapCards} chainEdgesEl={chainEdgesEl} mapDims={mapDims} vertical={vertical} canvasRef={canvasEl} />
            )}

            {isJourney && (
              <JourneyCanvas
                lensBlocked={lensBlocked}
                personaTitle={persona?.title}
                jJourneys={jJourneys}
                byId={d.byId}
                enterJourney={enterJourney}
                clearPersona={state.clearPersona}
                hasVariants={hasVariants}
                versions={versions}
                journey={journey}
                journeyId={journeyId}
                baseEntryId={baseEntryId}
                isNarrow={isNarrow}
                versionsOpen={state.versionsOpen}
                setVariant={setVariant}
                openVersions={state.openVersions}
                closeVersions={state.closeVersions}
                journeyTitle={journey?.title}
                journeyPorts={journey ? portsSummary(journey) : ''}
                journeyDims={journeyDims}
                vertical={vertical}
                canvasRef={canvasEl}
                ghostEdgesEl={ghostEdgesEl}
                journeyEdgesEl={journeyEdgesEl}
                ghostCards={ghostCards}
                journeySteps={journeySteps}
                stepInto={stepInto}
                notePopover={state.notePopover}
                noteDraft={state.noteDraft}
                journeyRects={journeyRects}
                saveNote={saveNote}
                setNoteDraft={state.setNoteDraft}
                closeNotePopover={state.closeNotePopover}
                cancelNote={state.cancelNote}
                narration={narration}
                stepLabel={stepLabel}
                pct={pct}
                cont={cont}
                atStart={atStart}
                atEnd={atEnd}
                detailOpen={state.detailOpen}
                step={step}
                toggleDetail={state.toggleDetail}
                detailShown={detailShown}
                selNode={selNode}
                selStatus={selStatus}
                chk={chk}
              />
            )}
          </div>
        </div>

        {state.promptText !== null && (
          <PromptModal promptText={state.promptText} clearPrompt={state.clearPrompt} />
        )}
      </div>
    );
}
