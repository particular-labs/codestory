import * as React from 'react';
import { saveSetting } from './settings';

// ── API projection (viewer-local; SSOT is src/schema.ts, this is read-only) ──

export type Status = 'planned' | 'built' | 'drifted';

export interface ApiNode {
  id: string;
  type: 'step' | 'decision' | 'exit';
  label?: string;
  note?: string;
  refs?: string[];
  contract?: { in?: string; out?: string };
  acceptance?: string[];
  status?: Status;
  tests?: string[];
  ticket?: string;
  board?: string;
  port?: string;
}

export interface ApiBoard {
  id: string;
  title: string;
  status: Status;
  variantOf?: string;
  variantLabel?: string;
  entries: string[];
  exits: string[];
  nodes: ApiNode[];
  edges: Array<{ from: string; to: string; label?: string; when?: string }>;
  links: Array<{ exit: string; board: string; entry: string }>;
}

export interface ApiJourney {
  id: string;
  title: string;
  persona?: string;
  start: { board: string; entry: string };
  boards: string[];
}

export interface ApiNote {
  id: string;
  board: string;
  node?: string;
  text: string;
  status: 'open' | 'applied';
  createdAt: string;
}

export interface ApiData {
  manifest: { project: string; journeys: ApiJourney[] } | null;
  boards: ApiBoard[];
  issues?: Array<{ file: string; message: string }>;
  notes?: ApiNote[];
}

export interface AppProps {
  data: ApiData;
  defaultTheme: 'dark' | 'light';
  accent: string;
  flowDirection: 'horizontal' | 'vertical';
}

// ── style helpers ──

const mono = "'JetBrains Mono',monospace";
const _cssCache: Record<string, React.CSSProperties> = {};

/** Parse the design export's inline style strings into React style objects, once each. */
function css(str: string): React.CSSProperties {
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

function statusMeta(s: Status) {
  return { label: s.charAt(0).toUpperCase() + s.slice(1), varName: '--' + s };
}
function statusPill(s: Status): React.CSSProperties {
  const m = statusMeta(s);
  return { color: `var(${m.varName})`, border: `1px solid var(${m.varName})`, background: 'transparent', borderRadius: 5, padding: '2px 7px', fontSize: 9.5, fontWeight: 600, fontFamily: mono, letterSpacing: '0.02em' };
}

// ── layered DAG auto-layout (from the design export, generalized for cards vs nodes) ──

interface LayoutGaps { nw: number; nh: number; main: number; cross: number }
interface Layout { pos: Record<string, { x: number; y: number }>; w: number; h: number }

function computeLayout(nodes: Array<{ id: string }>, edges: Array<[string, string]>, vertical: boolean, g: LayoutGaps): Layout {
  const ids = new Set(nodes.map((n) => n.id));
  const raw: Record<string, string[]> = {};
  nodes.forEach((n) => { raw[n.id] = []; });
  edges.forEach(([a, b]) => { if (ids.has(a) && ids.has(b) && a !== b) raw[a]!.push(b); });

  // 1. detect back-edges (cycle closers) via DFS coloring so ranks stay monotonic
  const color: Record<string, number> = {};
  nodes.forEach((n) => { color[n.id] = 0; });
  const back: Record<string, boolean> = {};
  const dfs = (u: string) => {
    color[u] = 1;
    raw[u]!.forEach((v) => { if (color[v] === 1) back[u + '>' + v] = true; else if (color[v] === 0) dfs(v); });
    color[u] = 2;
  };
  nodes.forEach((n) => { if (color[n.id] === 0) dfs(n.id); });

  // 2. longest-path ranking over forward edges (Kahn relaxation)
  const adj: Record<string, string[]> = {};
  const indeg: Record<string, number> = {};
  nodes.forEach((n) => { adj[n.id] = []; indeg[n.id] = 0; });
  edges.forEach(([a, b]) => {
    if (!ids.has(a) || !ids.has(b) || a === b || back[a + '>' + b]) return;
    adj[a]!.push(b); indeg[b]!++;
  });
  const rank: Record<string, number> = {};
  nodes.forEach((n) => { rank[n.id] = 0; });
  const q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  while (q.length) {
    const u = q.shift()!;
    adj[u]!.forEach((v) => { if (rank[u]! + 1 > rank[v]!) rank[v] = rank[u]! + 1; if (--indeg[v]! === 0) q.push(v); });
  }

  // 3. bucket nodes by rank, preserving authored order → lane index
  const cols: Record<number, string[]> = {};
  let maxRank = 0;
  nodes.forEach((n) => { const r = rank[n.id]!; (cols[r] = cols[r] ?? []).push(n.id); if (r > maxRank) maxRank = r; });
  let maxLane = 1;
  for (const r in cols) maxLane = Math.max(maxLane, cols[r]!.length);

  // 4. place: rank → main axis, lane (centered) → cross axis
  const PADX = 32, PADY = 28;
  const pos: Layout['pos'] = {};
  for (let r = 0; r <= maxRank; r++) {
    const col = cols[r] ?? [];
    const start = (maxLane - col.length) / 2; // center the column
    col.forEach((id, i) => {
      const lane = start + i;
      const main = (vertical ? PADY : PADX) + r * g.main;
      const cross = (vertical ? PADX : PADY) + lane * g.cross;
      pos[id] = vertical ? { x: cross, y: main } : { x: main, y: cross };
    });
  }
  const acrossMain = (vertical ? PADY : PADX) + maxRank * g.main + (vertical ? g.nh : g.nw) + (vertical ? PADY : PADX);
  const acrossCross = (vertical ? PADX : PADY) + (maxLane - 1) * g.cross + (vertical ? g.nw : g.nh) + (vertical ? PADX : PADY);
  return { pos, w: vertical ? acrossCross : acrossMain, h: vertical ? acrossMain : acrossCross };
}

// ── SVG edges (from the design export) ──

type EdgeTuple = [string, string, string?];
interface Rect { x: number; y: number; w: number; h: number }

function edgesSvg(edges: EdgeTuple[], nodeMap: Record<string, Rect>, dims: { w: number; h: number }, activeSet: Set<string> | null, currentId: string | null, onLabel: ((id: string) => void) | null, vertical: boolean) {
  const R = React.createElement;
  const els: React.ReactNode[] = [];
  edges.forEach((e, i) => {
    const a = nodeMap[e[0]], b = nodeMap[e[1]];
    if (!a || !b) return;
    let x1: number, y1: number, x2: number, y2: number, back: boolean, d: string;
    if (vertical) {
      x1 = a.x + a.w / 2; y1 = a.y + a.h; x2 = b.x + b.w / 2; y2 = b.y; back = b.y < a.y;
      if (back) d = `M ${x1} ${y1} C ${x1 + 54} ${y1 + 34}, ${x2 + 54} ${y2 - 34}, ${x2} ${y2}`;
      else { const dy = Math.max(30, Math.abs(y2 - y1) / 2); d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`; }
    } else {
      x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x; y2 = b.y + b.h / 2; back = b.x < a.x;
      if (back) d = `M ${x1} ${y1} C ${x1 + 46} ${y1 - 34}, ${x2 - 46} ${y2 - 34}, ${x2} ${y2}`;
      else { const dx = Math.max(38, Math.abs(x2 - x1) / 2); d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`; }
    }
    const act = !!activeSet && activeSet.has(e[0]) && activeSet.has(e[1]);
    const flowing = currentId != null && e[0] === currentId;
    const stroke = act || flowing ? 'var(--accent)' : 'var(--edge)';
    els.push(R('path', { key: 'p' + i, d, fill: 'none', stroke, strokeWidth: act || flowing ? 2 : 1.5, markerEnd: act || flowing ? 'url(#ah-a)' : 'url(#ah)' }));
    if (flowing) {
      els.push(R('path', { key: 'f' + i, d, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5, strokeLinecap: 'round', strokeDasharray: '2 14', style: { animation: 'dashFlow 0.7s linear infinite' } }));
    }
    const label = e[2];
    if (label) {
      const mx = (x1 + x2) / 2 + (back && vertical ? 36 : 0), my = (y1 + y2) / 2 - (back && !vertical ? 30 : 0), w = label.length * 5.9 + 18;
      const clickable = !!onLabel;
      els.push(R('g', { key: 'g' + i, onMouseDown: clickable ? (ev: React.MouseEvent) => { ev.stopPropagation(); onLabel!(e[0]); } : undefined, style: { cursor: clickable ? 'pointer' : 'default', pointerEvents: clickable ? 'auto' : 'none' } },
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

const NODE_W = 176, NODE_H = 64;
const CARD_W = 224, CARD_H = 120;
const ROOT_LABEL = 'Root'; // one name for the chain-map home, shared by rail + breadcrumb
const PATH_SEP = '\u0000'; // rail-tree path separator — no filesystem allows it in a filename, so never in a board id
const GLYPHS: Record<string, string> = { step: '', decision: '◇ ', subflow: '▤ ', exit: '⚑ ' };
const TYPE_TEXT: Record<string, string> = { step: 'STEP', decision: 'DECISION', subflow: 'SUB-FLOW', exit: 'EXIT' };

interface StackEntry { id: string; callerBoard?: string; callerNode?: string }

interface AppState {
  data: ApiData; // stateful so SSE live-reload can swap in fresh boards/notes
  theme: 'dark' | 'light';
  view: 'map' | 'board';
  stack: StackEntry[];
  selectedNodeId: string | null;
  journey: string | null;
  query: string;
  detailOpen: boolean;
  nodePos: Record<string, { x: number; y: number }>;
  mapPos: Record<string, { x: number; y: number }>;
  variantSel: Record<string, string>; // base board id → selected version's board id
  flow: 'horizontal' | 'vertical'; // SSOT for flow direction — every layout/edge/port reads this
  notesOpen: boolean; // notes hub popover open — doubles as annotate mode (click a node to leave a change-note)
  railOpen: Record<string, boolean>; // rail sub-flow tree: path → expanded (collapsed by default)
  notePopover: { board: string; node: string } | null; // open note editor
  noteDraft: string;
  promptText: string | null; // clipboard fallback overlay
  copied: boolean;
}

const nodeKind = (n: ApiNode) => (n.board ? 'subflow' : n.type);
const nodeTitle = (n: ApiNode) => n.label ?? n.port ?? n.id;
const portsSummary = (b: ApiBoard) =>
  [b.entries.length ? `entry: ${b.entries.join(', ')}` : '', b.exits.length ? `exits: ${b.exits.join(', ')}` : ''].filter(Boolean).join(' · ');

export class App extends React.Component<AppProps, AppState> {
  constructor(props: AppProps) {
    super(props);
    this.state = { data: props.data, theme: props.defaultTheme, view: 'map', stack: [], selectedNodeId: null, journey: null, query: '', detailOpen: true, nodePos: {}, mapPos: {}, variantSel: {}, flow: props.flowDirection, notesOpen: false, railOpen: {}, notePopover: null, noteDraft: '', promptText: null, copied: false };
  }

  private _d: { byId: Map<string, ApiBoard>; order: string[]; chainEdges: EdgeTuple[]; journeys: ApiJourney[]; variantsByBase: Map<string, ApiBoard[]>; subsByBoard: Map<string, string[]> } | null = null;
  private _lay: Record<string, Layout> = {};
  private _es: EventSource | null = null;

  // ── live reload: SSE tells us .codestory/ changed → refetch + re-render, keeping
  //    the current view/stack/selection wherever those ids still exist ──
  componentDidMount() {
    try {
      const es = new EventSource('/api/events');
      es.addEventListener('reload', () => { void this.refetch(); });
      this._es = es;
    } catch { /* SSE unsupported — no live reload, viewer still works */ }
  }
  componentWillUnmount() { this._es?.close(); }

  async refetch() {
    try {
      const res = await fetch('/api/boards');
      if (!res.ok) return;
      const data = (await res.json()) as ApiData;
      this._d = null; // board set may have changed → drop derived-graph + layout caches
      this._lay = {};
      this.setState((s) => {
        const byId = new Map(data.boards.map((b) => [b.id, b]));
        const stack = s.stack.filter((e) => byId.has(e.id));
        let selectedNodeId = s.selectedNodeId;
        const top = stack[stack.length - 1];
        if (top) {
          const selVar = s.variantSel[top.id];
          const board = byId.get(selVar && byId.has(selVar) ? selVar : top.id);
          if (!board?.nodes.some((n) => n.id === selectedNodeId)) selectedNodeId = board?.nodes[0]?.id ?? null;
        }
        return { data, stack, selectedNodeId, view: stack.length ? s.view : 'map' };
      });
    } catch { /* network blip — keep showing current data */ }
  }

  // ── notes (annotations) ──
  allNotes() { return this.state.data.notes ?? []; }
  openNotes() { return this.allNotes().filter((n) => n.status === 'open'); }
  openNotesFor(board: string, node: string) { return this.allNotes().filter((n) => n.board === board && n.node === node && n.status === 'open'); }

  async postNote(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) await this.refetch(); // snappy update; the file-watch SSE would refetch too
      return res.ok;
    } catch { return false; }
  }
  async saveNote(board: string, node: string, text: string) {
    if (!text.trim()) return;
    const ok = await this.postNote({ board, node, text: text.trim() });
    if (ok) this.setState({ notePopover: null, noteDraft: '' });
  }
  applyNote(id: string) { void this.postNote({ id, status: 'applied' }); }
  deleteNote(id: string) { void this.postNote({ id, delete: true }); }
  clearNotes() { void this.postNote({ clear: true }); }
  goToNote(n: { board: string; node?: string }) {
    this.enterBoard(n.board);
    if (n.node) this.setState({ selectedNodeId: n.node });
  }

  /** Serialize every open note + its node context into an LLM-ready markdown block. */
  buildPrompt(): string {
    const d = this.d();
    const out: string[] = [
      '# Codestory annotations — apply these changes',
      '',
      'Each note below requests a change against a node in the codestory boards under `.codestory/`. For each note, edit the referenced board JSON and/or the code it points to, then mark the note applied.',
      '',
    ];
    this.openNotes().forEach((note, i) => {
      const board = d.byId.get(note.board);
      const node = note.node ? board?.nodes.find((n) => n.id === note.node) : undefined;
      out.push(`## Note ${i + 1}`);
      out.push(`- board: \`${note.board}\`${board ? ` (${board.title})` : ''}`);
      if (node) {
        out.push(`- node: \`${node.id}\` — ${nodeTitle(node)}`);
        if (node.refs?.length) out.push(`- refs: ${node.refs.join(', ')}`);
        if (node.contract) out.push(`- contract: in ${node.contract.in ?? '—'} → out ${node.contract.out ?? '—'}`);
        if (node.acceptance?.length) { out.push('- acceptance:'); node.acceptance.forEach((a) => out.push(`  - ${a}`)); }
      } else if (note.node) {
        out.push(`- node: \`${note.node}\``);
      }
      out.push(`- change requested: ${note.text}`);
      out.push('');
    });
    return out.join('\n');
  }
  async copyPrompt() {
    const text = this.buildPrompt();
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 1500);
    } catch {
      this.setState({ promptText: text }); // fallback: show a selectable textarea
    }
  }

  d() {
    if (this._d) return this._d;
    const { boards, manifest } = this.state.data;
    const byId = new Map(boards.map((b) => [b.id, b]));
    const variantsByBase = new Map<string, ApiBoard[]>();
    boards.forEach((b) => {
      if (b.variantOf) variantsByBase.set(b.variantOf, [...(variantsByBase.get(b.variantOf) ?? []), b]);
    });
    // the base-board graph defines the tree; variants' extra sub refs don't hide boards
    const bases = boards.filter((b) => !b.variantOf);
    const subIds = new Set(bases.flatMap((b) => b.nodes.map((n) => n.board)).filter(Boolean) as string[]);
    let order = bases.filter((b) => !subIds.has(b.id)).map((b) => b.id);
    // board id → its direct sub-flow board ids (node.board refs), in node order
    const subsByBoard = new Map<string, string[]>();
    bases.forEach((b) => {
      const subs = b.nodes.flatMap((n) => (n.board ? [n.board] : [])).filter((s, i, a) => a.indexOf(s) === i);
      if (subs.length) subsByBoard.set(b.id, subs);
    });
    // cycle rescue: a mutually-referencing component has no unreferenced root —
    // surface any base board unreachable from the roots as a root itself
    {
      const reachable = new Set(order);
      const queue = [...order];
      while (queue.length) {
        for (const s of subsByBoard.get(queue.shift()!) ?? []) {
          if (!reachable.has(s)) { reachable.add(s); queue.push(s); }
        }
      }
      order = [...order, ...bases.filter((b) => !reachable.has(b.id)).map((b) => b.id)];
    }
    const chainEdges: EdgeTuple[] = [];
    for (const b of boards) {
      for (const l of b.links) {
        if (order.includes(b.id) && order.includes(l.board)) chainEdges.push([b.id, l.board, `${l.exit} → ${l.entry}`]);
      }
    }
    // boards arrive in file order (alphabetical) — re-order along the chain so
    // "BOARD n" and the rail read as the movie, not the directory listing
    const indeg = new Map(order.map((id) => [id, 0]));
    chainEdges.forEach(([, to]) => indeg.set(to, (indeg.get(to) ?? 0) + 1));
    const queue = order.filter((id) => indeg.get(id) === 0);
    const sorted: string[] = [];
    while (queue.length) {
      const u = queue.shift()!;
      sorted.push(u);
      chainEdges.filter(([from]) => from === u).forEach(([, to]) => {
        indeg.set(to, indeg.get(to)! - 1);
        if (indeg.get(to) === 0) queue.push(to);
      });
    }
    order = [...sorted, ...order.filter((id) => !sorted.includes(id))]; // cycles/orphans keep file order
    this._d = { byId, order, chainEdges, journeys: manifest?.journeys ?? [], variantsByBase, subsByBoard };
    return this._d;
  }

  layout(key: string, nodes: Array<{ id: string }>, edges: Array<[string, string]>, vertical: boolean, gaps: LayoutGaps): Layout {
    const k = `${key}:${vertical ? 'v' : 'h'}`;
    this._lay[k] = this._lay[k] ?? computeLayout(nodes, edges, vertical, gaps);
    return this._lay[k]!;
  }

  // ── navigation ──

  curEntry() { return this.state.stack[this.state.stack.length - 1] ?? null; }
  /** The displayed board: the selected variant of the stacked base id, else the base. */
  curBoard() {
    const e = this.curEntry();
    if (!e) return null;
    const sel = this.state.variantSel[e.id];
    return this.d().byId.get(sel ?? e.id) ?? null;
  }
  setVariant(baseId: string, boardId: string) {
    this.setState((s) => ({ variantSel: { ...s.variantSel, [baseId]: boardId }, selectedNodeId: this.firstNode(boardId) }));
  }
  /** The board id actually displayed for a base id (its selected variant, else itself). */
  displayedId(baseId: string) { return this.state.variantSel[baseId] ?? baseId; }
  nodes() { return this.curBoard()?.nodes ?? []; }
  selIndex() { return this.nodes().findIndex((n) => n.id === this.state.selectedNodeId); }
  firstNode(id: string) { return this.d().byId.get(id)?.nodes[0]?.id ?? null; }

  enterBoard(id: string) { this.setState({ view: 'board', stack: [{ id }], selectedNodeId: this.firstNode(this.displayedId(id)) }); }
  /** Enter a nested board with its full caller chain (rail tree click) so
   *  breadcrumbs, Return chips, and the journey lens see the real call stack. */
  enterPath(ids: string[]) {
    const d = this.d();
    const stack: StackEntry[] = [];
    ids.forEach((id, i) => {
      if (i === 0) { stack.push({ id }); return; }
      const parent = ids[i - 1]!;
      const callerNode = d.byId.get(this.displayedId(parent))?.nodes.find((n) => n.board === id)?.id;
      stack.push({ id, callerBoard: parent, ...(callerNode ? { callerNode } : {}) });
    });
    const last = ids[ids.length - 1]!;
    this.setState({ view: 'board', stack, selectedNodeId: this.firstNode(this.displayedId(last)) });
  }
  stepInto(subId: string, callerNode: string) {
    const cur = this.curEntry();
    if (!cur) return;
    this.setState((s) => ({ stack: [...s.stack, { id: subId, callerBoard: cur.id, callerNode }], selectedNodeId: this.firstNode(this.displayedId(subId)) }));
  }
  goCrumb(k: number) {
    if (k === 0) { this.setState({ view: 'map', journey: null }); return; } // Root = whole map, no lens
    this.setState((s) => {
      const st = s.stack.slice(0, k);
      return { stack: st, selectedNodeId: this.firstNode(this.displayedId(st[st.length - 1]!.id)) };
    });
  }
  selectNode(id: string) { this.setState({ selectedNodeId: id }); }
  setJourney(id: string) { this.setState((s) => ({ journey: s.journey === id ? null : id })); }
  toggleTheme() { this.setState((s) => { const theme = s.theme === 'dark' ? 'light' : 'dark' as const; saveSetting('theme', theme); return { theme }; }); }
  toggleFlow() { this.setState((s) => { const flow = s.flow === 'vertical' ? 'horizontal' : 'vertical' as const; saveSetting('flow', flow); return { flow }; }); }

  step(dir: number) {
    const ns = this.nodes();
    if (!ns.length) return;
    let i = this.selIndex();
    if (i < 0) i = 0;
    const ni = Math.max(0, Math.min(ns.length - 1, i + dir));
    this.setState({ selectedNodeId: ns[ni]!.id });
  }
  hop(nextId: string) { this.setState({ stack: [{ id: nextId }], selectedNodeId: this.firstNode(this.displayedId(nextId)) }); }

  returnToParent() {
    const e = this.curEntry();
    if (!e?.callerBoard || !e.callerNode) return;
    // resolve the return edge against the parent's DISPLAYED version — a
    // selected variant may route the caller node differently than the base
    const parent = this.d().byId.get(this.displayedId(e.callerBoard));
    const returnEdge = parent?.edges.find((ed) => ed.from === e.callerNode);
    this.setState((s) => ({ stack: s.stack.slice(0, -1), selectedNodeId: returnEdge?.to ?? e.callerNode ?? null }));
  }

  continueTarget(): { label: string; onClick: () => void } | null {
    const ns = this.nodes();
    const cur = ns[this.selIndex()];
    const board = this.curBoard();
    if (!cur || cur.type !== 'exit' || !board) return null;
    const e = this.curEntry();
    if (e?.callerBoard && e.callerNode) {
      const parent = this.d().byId.get(this.displayedId(e.callerBoard));
      const returnEdge = parent?.edges.find((ed) => ed.from === e.callerNode);
      const returnNode = parent?.nodes.find((n) => n.id === returnEdge?.to);
      return { label: `Return → ${returnNode ? nodeTitle(returnNode) : parent?.title ?? 'parent'}`, onClick: () => this.returnToParent() };
    }
    const link = board.links.find((l) => l.exit === cur.port);
    const next = link ? this.d().byId.get(link.board) : null;
    if (next) return { label: `Continue → ${next.title}`, onClick: () => this.hop(next.id) };
    return null;
  }

  // ── drag (click vs drag disambiguated by 3px threshold) ──

  startDrag(kind: 'map' | 'node', id: string, key: string, baseX: number, baseY: number, e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      const p = { x: Math.max(0, baseX + dx), y: Math.max(0, baseY + dy) };
      if (kind === 'map') this.setState((s) => ({ mapPos: { ...s.mapPos, [key]: p } }));
      else this.setState((s) => ({ nodePos: { ...s.nodePos, [key]: p } }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (moved) return;
      if (kind === 'map') { this.enterBoard(id); return; }
      this.selectNode(id);
      // notes hub open = annotate mode: a click also opens the note editor for this node
      const board = this.curBoard();
      if (this.state.notesOpen && board) this.setState({ notePopover: { board: board.id, node: id }, noteDraft: '' });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // ── render ──

  render() {
    const t: Record<string, string> = { ...THEMES[this.state.theme], accent: this.props.accent || THEMES[this.state.theme].accent };
    const rootStyle: Record<string, string> = {};
    Object.keys(t).forEach((k) => { rootStyle['--' + k] = t[k]!; });
    Object.assign(rootStyle, css("background:var(--bg);color:var(--fg);height:100vh;width:100%;display:flex;flex-direction:column;overflow:hidden;position:relative;font-size:14px;") as Record<string, string>, { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif', WebkitFontSmoothing: 'antialiased' });

    const d = this.d();
    const isMap = this.state.view === 'map';
    const isBoard = this.state.view === 'board';
    const vertical = this.state.flow === 'vertical';
    const topBoardId = this.state.stack[0]?.id ?? null;
    const journey = this.state.journey ? d.journeys.find((j) => j.id === this.state.journey) ?? null : null;
    const journeySet = journey ? new Set(journey.boards) : null;
    const q = this.state.query.trim().toLowerCase();

    // chain map
    const chainLayout = this.layout('__chain', d.order.map((id) => ({ id })), d.chainEdges.map((e) => [e[0], e[1]] as [string, string]), vertical, { nw: CARD_W, nh: CARD_H, main: vertical ? 200 : 330, cross: vertical ? 290 : 170 });
    const mapRects: Record<string, Rect> = {};
    const mapCards = d.order.map((id, idx) => {
      const b = d.byId.get(id)!;
      const inJ = !journeySet || journeySet.has(id);
      const matchQ = !q || b.title.toLowerCase().includes(q) || b.id.includes(q) || b.nodes.some((n) => nodeTitle(n).toLowerCase().includes(q));
      const dim = !inJ || !matchQ;
      const built = b.nodes.filter((n) => n.status === 'built').length;
      const mkey = (vertical ? 'v' : 'h') + ':' + id;
      const base = chainLayout.pos[id] ?? { x: 32, y: 32 };
      const mp = this.state.mapPos[mkey];
      const px = mp?.x ?? base.x, py = mp?.y ?? base.y;
      mapRects[id] = { x: px, y: py, w: CARD_W, h: CARD_H };
      const portStyle = (edge: 'left' | 'right' | 'top' | 'bottom'): React.CSSProperties => ({
        position: 'absolute',
        ...(vertical ? { left: '50%', marginLeft: -6 } : { top: 54 }),
        [edge]: -6,
        width: 11, height: 11, borderRadius: '50%', background: 'var(--surface)',
        border: `2px solid var(--${journeySet && inJ ? 'accent' : 'borderStrong'})`,
      });
      return {
        id, index: `BOARD ${idx + 1}`, title: b.title, sub: portsSummary(b),
        meta: `${b.nodes.length} nodes · ${built} built`,
        statusText: statusMeta(b.status).label, statusStyle: statusPill(b.status),
        style: { position: 'absolute', left: px, top: py, width: CARD_W, height: CARD_H, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow)', padding: '13px 15px', display: 'flex', flexDirection: 'column', cursor: 'grab', userSelect: 'none', opacity: dim ? 0.34 : 1, transition: 'opacity 200ms ease, box-shadow 160ms ease', outline: inJ && journeySet ? '1.5px solid var(--accent)' : 'none', outlineOffset: -1.5 } as React.CSSProperties,
        entryPort: portStyle(vertical ? 'top' : 'left'), exitPort: portStyle(vertical ? 'bottom' : 'right'),
        onMouseDown: (e: React.MouseEvent) => this.startDrag('map', id, mkey, px, py, e),
      };
    });
    const mapDims = { w: Math.max(chainLayout.w, 480), h: Math.max(chainLayout.h, 360) };
    const chainEdgesEl = edgesSvg(d.chainEdges, mapRects, mapDims, journeySet, null, null, vertical);

    // journeys rail
    const journeyList = d.journeys.map((j) => {
      const active = this.state.journey === j.id;
      return {
        id: j.id, label: j.title, count: `${j.boards.length}/${d.order.length}`,
        onClick: () => this.setJourney(j.id),
        dotStyle: { width: 8, height: 8, borderRadius: 2, background: active ? 'var(--accent)' : 'var(--mute)' } as React.CSSProperties,
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accentSoft)' : 'transparent', color: 'var(--fg)', textAlign: 'left' } as React.CSSProperties,
      };
    });
    const jBoards = journey?.boards ?? null;
    // top level = root boards only; a journey-listed sub-board stays nested (no duplicate rows)
    const railOrder = (jBoards ? [...jBoards, ...d.order.filter((id) => !jBoards.includes(id))] : d.order).filter((id) => d.order.includes(id));
    const countBadge: React.CSSProperties = { fontFamily: mono, fontSize: 10, color: 'var(--mute)' };
    const stepBadge: React.CSSProperties = { fontFamily: mono, fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'var(--accentSoft)', border: '1px solid var(--accent)', borderRadius: 5, padding: '1px 6px' };
    const outBadge: React.CSSProperties = { fontFamily: mono, fontSize: 10, color: 'var(--mute)', opacity: 0.7 };
    const railBoards = railOrder.flatMap((id) => {
      const b = d.byId.get(id);
      if (!b) return [];
      const active = topBoardId === id;
      const inJ = !jBoards || jBoards.includes(id);
      const seq = jBoards ? jBoards.indexOf(id) : -1;
      return [{
        id, inJ,
        badge: jBoards ? (inJ ? `${seq + 1}` : 'skip') : `${b.nodes.length}`,
        badgeStyle: jBoards ? (inJ ? stepBadge : outBadge) : countBadge,
      }];
    });

    // one rail row + its sub-flow children, recursively; `visited` holds the
    // ancestor chain so a cyclic sub-flow reference can never recurse forever
    const railRow = (id: string, path: string, inJ: boolean, badge: string, badgeStyle: React.CSSProperties, visited: Set<string>): React.ReactNode => {
      const b = d.byId.get(id);
      if (!b) return null;
      const subs = (d.subsByBoard.get(id) ?? []).filter((s) => !visited.has(s));
      const open = !!this.state.railOpen[path];
      const active = this.curEntry()?.id === id; // highlight the board being viewed, not the stack root
      return (
        <div key={path} style={css('display:flex;flex-direction:column;gap:2px;')}>
          <div style={css('display:flex;align-items:center;gap:0;')}>
            <button
              onClick={() => this.setState((s) => ({ railOpen: { ...s.railOpen, [path]: !open } }))}
              title={subs.length ? (open ? 'Collapse sub-flows' : 'Show sub-flows') : undefined}
              style={{ flex: '0 0 auto', width: 15, height: 24, border: 'none', background: 'none', color: 'var(--mute)', fontSize: 9, padding: 0, cursor: subs.length ? 'pointer' : 'default', visibility: subs.length ? 'visible' : 'hidden' }}
            >{open ? '▾' : '▸'}</button>
            <button onClick={() => this.enterPath(path.split(PATH_SEP))} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '1 1 auto', minWidth: 0, padding: '7px 10px 7px 4px', borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accentSoft)' : 'transparent', color: 'var(--fg)', opacity: inJ ? 1 : 0.45, cursor: 'pointer' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${b.status})`, flex: '0 0 auto', opacity: inJ ? 1 : 0.4 }}></span>
              <span style={css('font-size:12.5px;font-weight:500;flex:1 1 auto;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{b.title}</span>
              <span style={badgeStyle}>{badge}</span>
            </button>
          </div>
          {open && subs.length > 0 && (
            <div style={css('margin-left:11px;padding-left:8px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:2px;')}>
              {subs.map((s) => railRow(s, `${path}${PATH_SEP}${s}`, inJ, `${d.byId.get(s)?.nodes.length ?? 0}`, countBadge, new Set([...visited, s])))}
            </div>
          )}
        </div>
      );
    };
    const railHint = journey
      ? journey.persona ?? journey.title
      : isBoard
        ? 'Step through nodes with the ◂ ▸ controls below. At an exit, follow the chip to the next board.'
        : 'Pick a persona to highlight their path, or open a board. Boards chain exit → entry into one continuous movie.';

    // board view — `board` is the displayed version; ghosts come from the others
    const baseEntryId = this.curEntry()?.id ?? '';
    const baseBoard = d.byId.get(baseEntryId) ?? null;
    const variants = d.variantsByBase.get(baseEntryId) ?? [];
    const versions = baseBoard ? [baseBoard, ...variants] : [];
    const board = this.curBoard();
    const boardId = board?.id ?? '';
    const ns = this.nodes();
    const selI = this.selIndex();
    const activeSet = new Set(ns.slice(0, selI < 0 ? 0 : selI + 1).map((n) => n.id));

    // with variants, lay out the UNION of all versions so shared nodes don't
    // jump when the picker switches; without, keep the plain per-board layout
    const hasVariants = versions.length > 1;
    const unionNodes: ApiNode[] = [];
    {
      const seen = new Set<string>();
      versions.forEach((v) => v.nodes.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); unionNodes.push(n); } }));
    }
    const unionEdgeKeys = new Set<string>();
    const unionEdges: Array<[string, string]> = [];
    versions.forEach((v) => v.edges.forEach((e) => {
      const k = `${e.from}>${e.to}`;
      if (!unionEdgeKeys.has(k)) { unionEdgeKeys.add(k); unionEdges.push([e.from, e.to]); }
    }));
    const boardGaps = { nw: NODE_W, nh: NODE_H, main: vertical ? 128 : 260, cross: vertical ? 232 : 128 };
    const lay = board
      ? hasVariants
        ? this.layout(`${baseEntryId}:union:${versions.map((v) => v.id).join(',')}`, unionNodes, unionEdges, vertical, boardGaps)
        : this.layout(boardId, board.nodes, board.edges.map((e) => [e.from, e.to] as [string, string]), vertical, boardGaps)
      : null;
    const eff = (n: ApiNode) => {
      const base = lay?.pos[n.id] ?? { x: 32, y: 28 };
      const key = `${boardId}:${vertical ? 'v' : 'h'}:${n.id}`;
      const o = this.state.nodePos[key];
      return { x: o?.x ?? base.x, y: o?.y ?? base.y, key };
    };
    const boardRects: Record<string, Rect> = {};
    (hasVariants ? unionNodes : ns).forEach((n) => { const p = eff(n); boardRects[n.id] = { x: p.x, y: p.y, w: NODE_W, h: NODE_H }; });

    // diff vs the base (only meaningful when a variant is displayed)
    const baseNodeById = new Map((baseBoard?.nodes ?? []).map((n) => [n.id, n]));
    const activeIds = new Set(ns.map((n) => n.id));
    const nodeDiff = (n: ApiNode): 'new' | 'changed' | null => {
      if (!board?.variantOf) return null;
      const b = baseNodeById.get(n.id);
      if (!b) return 'new';
      const sig = (x: ApiNode) => JSON.stringify([x.type, x.board, x.port, x.label, x.status, x.note, x.contract, x.acceptance, x.refs]);
      return sig(n) !== sig(b) ? 'changed' : null;
    };
    // ghosts: union nodes/edges not in the displayed version, at low opacity
    const ghostNodes = hasVariants ? unionNodes.filter((n) => !activeIds.has(n.id)) : [];
    const activeEdgeKeys = new Set((board?.edges ?? []).map((e) => `${e.from}>${e.to}`));
    const ghostEdges: EdgeTuple[] = hasVariants ? unionEdges.filter(([a, b]) => !activeEdgeKeys.has(`${a}>${b}`)) : [];

    const boardNodes = ns.map((n) => {
      const isSel = n.id === this.state.selectedNodeId;
      const kind = nodeKind(n);
      const p = eff(n);
      const status = n.status ?? 'planned';
      return {
        id: n.id, title: nodeTitle(n), typeText: TYPE_TEXT[kind]!, glyph: GLYPHS[kind]!, isSubflow: kind === 'subflow', subBoard: n.board, diff: nodeDiff(n),
        noteCount: boardId ? this.openNotesFor(boardId, n.id).length : 0,
        dotStyle: { width: 8, height: 8, borderRadius: '50%', background: `var(--${status})`, flex: '0 0 auto' } as React.CSSProperties,
        style: { position: 'absolute', left: p.x, top: p.y, width: NODE_W, minHeight: NODE_H, borderRadius: 10, border: kind === 'decision' ? '1.5px dashed var(--borderStrong)' : `1px solid ${kind === 'exit' ? 'var(--accent)' : 'var(--border)'}`, background: isSel ? 'var(--surface2)' : kind === 'exit' ? 'var(--accentSoft)' : 'var(--surface)', boxShadow: isSel ? '0 0 0 2px var(--accent)' : 'var(--shadow)', padding: '9px 11px', display: 'flex', flexDirection: 'column', cursor: 'grab', userSelect: 'none', transition: 'box-shadow 150ms ease, background 150ms ease', zIndex: isSel ? 3 : 2 } as React.CSSProperties,
        onMouseDown: (e: React.MouseEvent) => this.startDrag('node', n.id, p.key, p.x, p.y, e),
      };
    });
    const boardDims = lay ? { w: Math.max(lay.w, 480), h: Math.max(lay.h, 360) } : { w: 480, h: 360 };
    const boardEdgeTuples: EdgeTuple[] = (board?.edges ?? []).map((e) => [e.from, e.to, e.label ?? e.when]);
    const boardEdgesEl = board ? edgesSvg(boardEdgeTuples, boardRects, boardDims, activeSet, this.state.selectedNodeId, (id) => this.selectNode(id), vertical) : null;

    // crumbs
    const crumbBtn = (last: boolean): React.CSSProperties => ({ border: 'none', background: 'none', padding: '3px 6px', borderRadius: 5, color: last ? 'var(--fg)' : 'var(--dim)', fontWeight: last ? 600 : 500, fontSize: 12.5, cursor: last ? 'default' : 'pointer' });
    const crumbs: Array<{ label: string; onClick: () => void; style: React.CSSProperties }> = [{ label: ROOT_LABEL, onClick: () => this.goCrumb(0), style: crumbBtn(false) }];
    this.state.stack.forEach((entry, i) => {
      const last = i === this.state.stack.length - 1;
      crumbs.push({ label: '/', onClick: () => {}, style: { border: 'none', background: 'none', color: 'var(--mute)', fontSize: 12, padding: '0 1px', cursor: 'default' } });
      crumbs.push({ label: d.byId.get(entry.id)?.title ?? entry.id, onClick: () => this.goCrumb(i + 1), style: crumbBtn(last) });
    });

    // transport + detail
    const selNode = ns[selI];
    const narration = selNode ? selNode.note ?? '' : board ? portsSummary(board) : '';
    const stepLabel = ns.length ? `${(selI < 0 ? 1 : selI + 1)} / ${ns.length}` : '';
    const pct = ns.length ? Math.round(((selI < 0 ? 0 : selI + 1) / ns.length) * 100) : 0;
    const cont = this.continueTarget();
    const atStart = selI <= 0;
    const atEnd = selI >= ns.length - 1;
    const navBtn = (disabled: boolean): React.CSSProperties => ({ width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inset)', color: disabled ? 'var(--mute)' : 'var(--dim)', fontSize: 13, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' });
    const selStatus = selNode?.status ?? 'planned';
    // honest rule: criteria read as verified only when the node is built (has tests)
    const chk = (_i: number) => selStatus === 'built';
    const detailShown = isBoard && !!selNode && this.state.detailOpen;
    const lensBlocked = isBoard && !!journeySet && !!topBoardId && !journeySet.has(topBoardId);

    return (
      <div style={rootStyle as React.CSSProperties}>
        <div style={css('height:52px;flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:0 16px;border-bottom:1px solid var(--border);background:var(--surface);z-index:20;')}>
          <div style={css('display:flex;align-items:center;gap:9px;')}>
            <div style={css('width:15px;height:15px;border-radius:4px;background:var(--accent);box-shadow:0 0 0 3px var(--accentSoft);')}></div>
            <span style={css('font-size:14px;font-weight:650;letter-spacing:-0.01em;')}>codestory</span>
            <span style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);background:var(--inset);border:1px solid var(--border);padding:2px 7px;border-radius:5px;")}>{this.state.data.manifest?.project ?? 'codestory present'}</span>
            {(this.state.data.issues?.length ?? 0) > 0 && (
              <span title={this.state.data.issues!.map((i) => `${i.file}: ${i.message}`).join('\n')} style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--drifted);border:1px solid var(--drifted);padding:2px 7px;border-radius:5px;cursor:help;")}>⚠ {this.state.data.issues!.length} validate issue(s) — boards may be missing</span>
            )}
          </div>

          <div style={css('flex:1 1 auto;display:flex;justify-content:center;')}>
            {isMap && (
              <div style={css('position:relative;width:320px;max-width:42vw;')}>
                <input value={this.state.query} onChange={(e) => this.setState({ query: e.target.value })} placeholder="Search boards & nodes" style={css('width:100%;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--fg);padding:0 10px 0 28px;font-size:12.5px;outline:none;')} />
                <span style={css('position:absolute;left:9px;top:7px;color:var(--mute);font-size:13px;')}>⌕</span>
              </div>
            )}
            {isBoard && (
              <div style={css('display:flex;align-items:center;gap:2px;font-size:12.5px;')}>
                {crumbs.map((c, i) => <button key={i} onClick={c.onClick} style={c.style}>{c.label}</button>)}
              </div>
            )}
          </div>

          <div style={css('display:flex;align-items:center;gap:8px;')}>
            <div style={css('display:flex;align-items:center;gap:12px;font-size:10.5px;color:var(--mute);margin-right:2px;')}>
              <span style={css('display:flex;align-items:center;gap:5px;')}><span style={css('width:7px;height:7px;border-radius:50%;background:var(--planned);')}></span>planned</span>
              <span style={css('display:flex;align-items:center;gap:5px;')}><span style={css('width:7px;height:7px;border-radius:50%;background:var(--built);')}></span>built</span>
              <span style={css('display:flex;align-items:center;gap:5px;')}><span style={css('width:7px;height:7px;border-radius:50%;background:var(--drifted);')}></span>drifted</span>
            </div>
            <button title={this.state.notesOpen ? 'Notes hub open — click a node to leave a note' : 'Notes — annotate nodes, copy as prompt'} onClick={() => this.setState((s) => ({ notesOpen: !s.notesOpen, notePopover: null }))} style={{ position: 'relative', width: 30, height: 30, borderRadius: 7, border: `1px solid ${this.state.notesOpen ? 'var(--accent)' : 'var(--border)'}`, background: this.state.notesOpen ? 'var(--accentSoft)' : 'var(--inset)', color: this.state.notesOpen ? 'var(--accent)' : 'var(--dim)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ✎
              {this.openNotes().length > 0 && (
                <span style={css("position:absolute;top:-5px;right:-5px;min-width:14px;height:14px;border-radius:7px;background:var(--accent);color:var(--accentFg);font-size:9px;font-weight:700;line-height:14px;text-align:center;padding:0 3px;font-family:'JetBrains Mono',monospace;")}>{this.openNotes().length}</span>
              )}
            </button>
            <button title={vertical ? 'Flow: vertical — switch to horizontal' : 'Flow: horizontal — switch to vertical'} onClick={() => this.toggleFlow()} style={css('width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:13px;display:flex;align-items:center;justify-content:center;')}>{vertical ? '⇅' : '⇄'}</button>
            <button onClick={() => this.toggleTheme()} style={css('width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:13px;display:flex;align-items:center;justify-content:center;')}>{this.state.theme === 'dark' ? '☀' : '☾'}</button>
          </div>
        </div>

        {this.state.notesOpen && (
          <div style={css('position:absolute;right:12px;top:58px;z-index:30;width:340px;max-height:70vh;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow);animation:slideUp 180ms ease;')}>
            <div style={css('padding:12px 14px 10px;border-bottom:1px solid var(--border);')}>
              <div style={css('font-size:12.5px;font-weight:650;letter-spacing:-0.01em;')}>Notes</div>
              <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>Click any node on a board to leave a change-note.</div>
            </div>
            <div style={css('flex:1 1 auto;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;')}>
              {this.allNotes().length === 0 && (
                <div style={css('padding:14px 6px;font-size:11.5px;color:var(--mute);text-align:center;')}>No notes yet.</div>
              )}
              {this.allNotes().map((n) => {
                const nb = this.d().byId.get(n.board);
                const nn = n.node ? nb?.nodes.find((x) => x.id === n.node) : undefined;
                const applied = n.status === 'applied';
                return (
                  <div key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inset)', opacity: applied ? 0.55 : 1 }}>
                    <div style={css('display:flex;align-items:center;gap:7px;')}>
                      <button onClick={() => this.goToNote(n)} title="Go to node" style={css("border:none;background:none;padding:0;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;")}>{nb?.title ?? n.board}{nn ? ` › ${nodeTitle(nn)}` : ''}</button>
                      <span style={{ ...statusPill(applied ? 'built' : 'drifted'), marginLeft: 'auto', flex: '0 0 auto' }}>{n.status}</span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--fg)', textDecoration: applied ? 'line-through' : 'none' }}>{n.text}</div>
                    <div style={css('display:flex;gap:6px;justify-content:flex-end;')}>
                      {!applied && (
                        <button onClick={() => this.applyNote(n.id)} title="Mark applied" style={css('height:22px;padding:0 8px;border-radius:5px;border:1px solid var(--built);background:transparent;color:var(--built);font-size:10.5px;font-weight:600;cursor:pointer;')}>✓ applied</button>
                      )}
                      <button onClick={() => this.deleteNote(n.id)} title="Delete note" style={css('height:22px;padding:0 8px;border-radius:5px;border:1px solid var(--borderStrong);background:transparent;color:var(--dim);font-size:10.5px;font-weight:600;cursor:pointer;')}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {this.allNotes().length > 0 && (
              <div style={css('padding:10px 12px;border-top:1px solid var(--border);display:flex;gap:8px;')}>
                {this.openNotes().length > 0 && (
                  <button onClick={() => void this.copyPrompt()} style={css('flex:1 1 auto;height:30px;border-radius:7px;border:1px solid var(--accent);background:var(--accentSoft);color:var(--accent);font-size:11.5px;font-weight:600;cursor:pointer;')}>{this.state.copied ? '✓ Copied' : `⧉ Copy ${this.openNotes().length} as prompt`}</button>
                )}
                <button onClick={() => this.clearNotes()} title="Delete all notes" style={css('flex:0 0 auto;height:30px;padding:0 11px;border-radius:7px;border:1px solid var(--borderStrong);background:var(--inset);color:var(--dim);font-size:11.5px;font-weight:600;cursor:pointer;')}>Clear all</button>
              </div>
            )}
          </div>
        )}

        <div style={css('flex:1 1 auto;display:flex;min-height:0;')}>
          <div style={css('width:220px;flex:0 0 auto;border-right:1px solid var(--border);background:var(--surface);padding:14px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:18px;')}>
            <div>
              <div style={css('padding:0 4px 9px;')}>
                <div style={css('font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);')}>Personas</div>
                <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>Lens · reorders the journeys</div>
              </div>
              <div style={css('display:flex;flex-direction:column;gap:4px;')}>
                {journeyList.map((j) => (
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
                <div style={css('font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);')}>{jBoards ? `${journey!.title} path` : 'Journeys'}</div>
                <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>{jBoards ? 'Steps in this persona’s flow' : 'Open a journey to inspect'}</div>
              </div>
              <div style={css('display:flex;flex-direction:column;gap:2px;')}>
                {/* Root is "selected" only when it's truly the whole map — view=map AND no journey lens; one active thing at a time */}
                <button onClick={() => this.goCrumb(0)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 9px', borderRadius: 8, border: `1px solid ${isMap && !journey ? 'var(--accent)' : 'var(--border)'}`, background: isMap && !journey ? 'var(--accentSoft)' : 'var(--inset)', color: 'var(--fg)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  <span style={css('display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;background:var(--accentSoft);color:var(--accent);font-size:11px;flex:0 0 auto;')}>⊞</span>
                  <span style={css('flex:1 1 auto;text-align:left;')}>{ROOT_LABEL}</span>
                  <span style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--mute);")}>{isMap && !journey ? 'here' : 'root'}</span>
                </button>
                <div style={css('margin-left:9px;padding-left:2px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:2px;')}>
                  {railBoards.map((b) => railRow(b.id, b.id, b.inJ, b.badge, b.badgeStyle, new Set([b.id])))}
                </div>
              </div>
            </div>

            <div style={css('margin-top:auto;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--inset);font-size:11.5px;line-height:1.5;color:var(--dim);')}>{railHint}</div>
          </div>

          <div style={css('flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;')}>
            {isMap && (
              <div style={css('flex:1 1 auto;position:relative;overflow:auto;background:var(--bg);background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:22px 22px;animation:fadeZoom 240ms ease;')}>
                <div style={{ position: 'relative', width: mapDims.w, height: mapDims.h, margin: 32 }}>
                  <div style={css('position:absolute;left:0;top:0;')}>{chainEdgesEl}</div>
                  {mapCards.map((m) => (
                    <div key={m.id} onMouseDown={m.onMouseDown} style={m.style}>
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

            {isBoard && (
              <div style={css('flex:1 1 auto;display:flex;flex-direction:column;min-height:0;position:relative;animation:fadeZoom 220ms ease;')}>
                {lensBlocked && (
                  <div style={css('position:absolute;inset:0;z-index:14;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--overlay);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:panelUp 200ms ease;')}>
                    <div style={css('max-width:400px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:26px 26px 22px;')}>
                      <div style={css('width:34px;height:34px;border-radius:9px;background:var(--accentSoft);border:1px solid var(--accent);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:15px;margin:0 auto 14px;')}>⦻</div>
                      <div style={css('font-size:15.5px;font-weight:650;letter-spacing:-0.01em;')}>Not on the {journey?.title} path</div>
                      <div style={css('font-size:12.5px;color:var(--dim);line-height:1.55;margin-top:8px;')}>The <b style={css('color:var(--fg);font-weight:600;')}>{journey?.title}</b> lens doesn’t pass through <b style={css('color:var(--fg);font-weight:600;')}>{board?.title}</b>. Pick a board this persona actually uses:</div>
                      <div style={css('display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px;')}>
                        {(jBoards ?? []).map((id, i) => (
                          <button key={id} onClick={() => this.enterBoard(id)} style={css('display:flex;align-items:center;gap:8px;height:34px;padding:0 13px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:var(--accentFg);font-size:12.5px;font-weight:600;cursor:pointer;')}>
                            <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;opacity:0.85;")}>{i + 1}</span>{d.byId.get(id)?.title ?? id}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => this.setState({ journey: null })} style={css('margin-top:16px;border:none;background:none;color:var(--mute);font-size:11.5px;cursor:pointer;text-decoration:underline;text-underline-offset:2px;')}>Clear lens instead</button>
                    </div>
                  </div>
                )}
                {hasVariants && (
                  <div style={css('position:absolute;right:14px;top:14px;z-index:8;display:flex;flex-direction:column;gap:7px;padding:11px 13px;border:1px solid var(--border);border-radius:10px;background:var(--surface);box-shadow:var(--shadow);animation:slideUp 200ms ease;')}>
                    <div style={css('font-size:9.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);')}>Versions</div>
                    {versions.map((v) => (
                      <label key={v.id} style={css('display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--fg);cursor:pointer;')}>
                        <input
                          type="radio"
                          name="cs-version"
                          checked={boardId === v.id}
                          onChange={() => this.setVariant(baseEntryId, v.id)}
                          style={{ accentColor: 'var(--accent)', margin: 0, cursor: 'pointer' }}
                        />
                        <span style={css('font-weight:550;')}>{v.variantOf ? v.variantLabel ?? v.id : 'Current'}</span>
                        <span style={{ ...statusPill(v.status), marginLeft: 'auto' }}>{statusMeta(v.status).label}</span>
                      </label>
                    ))}
                    <div style={css('font-size:10px;color:var(--mute);border-top:1px solid var(--border);padding-top:7px;margin-top:2px;')}>ghosts = other versions · <b style={css('color:var(--accent);font-weight:600;')}>+ new / Δ</b> vs current</div>
                  </div>
                )}
                <div style={css('flex:1 1 auto;position:relative;overflow:auto;background:var(--bg);background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:22px 22px;')}>
                  <div style={css('position:absolute;left:16px;top:14px;z-index:5;')}>
                    <div style={css('font-size:17px;font-weight:650;letter-spacing:-0.015em;')}>{board?.title}</div>
                    <div style={css('font-size:12px;color:var(--dim);margin-top:2px;')}>{board ? portsSummary(board) : ''}</div>
                  </div>
                  <div style={{ position: 'relative', width: boardDims.w, height: boardDims.h, margin: '64px 40px 40px' }}>
                    {ghostEdges.length > 0 && (
                      <div style={css('position:absolute;left:0;top:0;opacity:0.22;')}>{edgesSvg(ghostEdges, boardRects, boardDims, null, null, null, vertical)}</div>
                    )}
                    <div style={css('position:absolute;left:0;top:0;')}>{boardEdgesEl}</div>
                    {ghostNodes.map((n) => {
                      const p = eff(n);
                      const kind = nodeKind(n);
                      return (
                        <div key={'ghost-' + n.id} style={{ position: 'absolute', left: p.x, top: p.y, width: NODE_W, minHeight: NODE_H, borderRadius: 10, border: '1.5px dashed var(--borderStrong)', background: 'var(--surface)', padding: '9px 11px', display: 'flex', flexDirection: 'column', opacity: 0.22, pointerEvents: 'none', zIndex: 1 }}>
                          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px;')}>
                            <span style={css("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.06em;color:var(--mute);")}>{GLYPHS[kind]}{TYPE_TEXT[kind]}</span>
                          </div>
                          <div style={css('font-size:13px;font-weight:600;letter-spacing:-0.01em;line-height:1.25;margin-top:5px;')}>{nodeTitle(n)}</div>
                        </div>
                      );
                    })}
                    {boardNodes.map((n) => (
                      <div key={n.id} onMouseDown={n.onMouseDown} style={n.style}>
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
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); this.stepInto(n.subBoard!, n.id); }}
                            style={css('margin-top:7px;align-self:flex-start;font-size:10.5px;font-weight:600;color:var(--accent);background:var(--accentSoft);border:1px solid var(--accent);border-radius:5px;padding:2px 8px;display:flex;align-items:center;gap:4px;cursor:pointer;')}
                          >Step into ↘</button>
                        )}
                      </div>
                    ))}
                    {this.state.notePopover && this.state.notePopover.board === boardId && boardRects[this.state.notePopover.node] && (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{ position: 'absolute', left: boardRects[this.state.notePopover.node]!.x, top: boardRects[this.state.notePopover.node]!.y + NODE_H + 8, zIndex: 30, width: 244, padding: 12, borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--surface)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 9 }}
                      >
                        <div style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);")}>Note on {this.state.notePopover.node}</div>
                        <textarea
                          autoFocus
                          value={this.state.noteDraft}
                          onChange={(e) => this.setState({ noteDraft: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void this.saveNote(this.state.notePopover!.board, this.state.notePopover!.node, this.state.noteDraft); } if (e.key === 'Escape') this.setState({ notePopover: null }); }}
                          placeholder="What should change here?"
                          style={{ width: '100%', minHeight: 68, resize: 'vertical', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inset)', color: 'var(--fg)', padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
                        />
                        <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:7px;')}>
                          <button onClick={() => this.setState({ notePopover: null, noteDraft: '' })} style={css('height:28px;padding:0 11px;border-radius:6px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:12px;cursor:pointer;')}>Cancel</button>
                          <button onClick={() => void this.saveNote(this.state.notePopover!.board, this.state.notePopover!.node, this.state.noteDraft)} disabled={!this.state.noteDraft.trim()} style={{ height: 28, padding: '0 13px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accentFg)', fontSize: 12, fontWeight: 600, cursor: this.state.noteDraft.trim() ? 'pointer' : 'default', opacity: this.state.noteDraft.trim() ? 1 : 0.5 }}>Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={css('flex:0 0 auto;border-top:1px solid var(--border);background:var(--surface);z-index:10;')}>
                  <div style={css('min-height:56px;display:flex;align-items:center;gap:14px;padding:9px 16px;')}>
                    <div style={css('display:flex;align-items:center;gap:6px;flex:0 0 auto;')}>
                      <button onClick={() => this.step(-1)} style={navBtn(atStart)}>◂</button>
                      <button onClick={() => this.step(1)} style={navBtn(atEnd)}>▸</button>
                    </div>
                    <div style={css("flex:0 0 auto;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);width:48px;")}>{stepLabel}</div>
                    <div style={css('flex:0 0 120px;height:4px;border-radius:3px;background:var(--inset);overflow:hidden;')}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 220ms ease' }}></div>
                    </div>
                    <div style={css('flex:1 1 auto;min-width:0;font-size:12.5px;color:var(--fg);line-height:1.45;')}>{narration}</div>
                    {cont && (
                      <button onClick={cont.onClick} style={css('flex:0 0 auto;height:32px;padding:0 13px;border-radius:7px;border:1px solid var(--accent);background:var(--accentSoft);color:var(--accent);font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;animation:slideUp 220ms ease;')}>{cont.label}</button>
                    )}
                    <button onClick={() => this.setState((s) => ({ detailOpen: !s.detailOpen }))} style={css('flex:0 0 auto;width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:11px;')}>{this.state.detailOpen ? '▾' : '▴'}</button>
                  </div>

                  {detailShown && selNode && (
                    <div style={css('border-top:1px solid var(--border);padding:16px 18px;display:flex;flex-wrap:wrap;gap:14px 34px;max-height:236px;overflow-y:auto;animation:panelUp 200ms ease;')}>
                      <div style={css('flex:0 0 auto;max-width:280px;display:flex;flex-direction:column;')}>
                        <div style={css('display:flex;align-items:center;gap:9px;')}>
                          <span style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.06em;color:var(--mute);")}>{TYPE_TEXT[nodeKind(selNode)]}</span>
                          <span style={statusPill(selStatus)}>{statusMeta(selStatus).label}</span>
                        </div>
                        <div style={css('font-size:16px;font-weight:650;letter-spacing:-0.01em;margin-top:8px;')}>{nodeTitle(selNode)}</div>
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

        {this.state.promptText !== null && (
          <div onMouseDown={() => this.setState({ promptText: null })} style={css('position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--overlay);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);')}>
            <div onMouseDown={(e) => e.stopPropagation()} style={css('width:560px;max-width:90vw;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:20px;display:flex;flex-direction:column;gap:12px;')}>
              <div style={css('font-size:14px;font-weight:650;letter-spacing:-0.01em;')}>Copy prompt manually</div>
              <div style={css('font-size:12px;color:var(--dim);line-height:1.5;')}>Clipboard access was blocked — select all and copy the block below.</div>
              <textarea
                readOnly
                autoFocus
                value={this.state.promptText}
                onFocus={(e) => e.currentTarget.select()}
                style={{ width: '100%', height: 260, resize: 'vertical', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inset)', color: 'var(--fg)', padding: 12, fontSize: 12, fontFamily: mono, outline: 'none' }}
              />
              <div style={css('display:flex;justify-content:flex-end;')}>
                <button onClick={() => this.setState({ promptText: null })} style={css('height:30px;padding:0 14px;border-radius:7px;border:1px solid var(--accent);background:var(--accent);color:var(--accentFg);font-size:12.5px;font-weight:600;cursor:pointer;')}>Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
