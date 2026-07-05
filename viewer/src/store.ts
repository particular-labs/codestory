// SSOT for the App's runtime state (#P3). A zustand *vanilla* store (createStore,
// not the React binding) created PER APP INSTANCE inside App's constructor — parity
// mounts App several times with different props, so a module singleton would
// cross-contaminate them. Persisted prefs (theme/flow/exportOpts) are written through
// settings.ts's saveSettings (NOT zustand persist), because main.tsx reads the raw
// `codestory:settings` key before App mounts.
import { createStore, type StoreApi } from 'zustand/vanilla';
import { deriveGraph, type Graph } from './graph';
import { saveSettings, type FlowDir, type Theme } from './settings';
import { DEFAULT_EXPORT_OPTS, type ExportOpts } from './export-meta';
import type { Loc } from './urlState';
import type { ApiData, ApiStep, StackEntry } from './app';

// ── the 24 state fields (mirrors the App's old this.state) ──
export interface AppState {
  data: ApiData;
  theme: Theme;
  view: 'map' | 'journey';
  stack: StackEntry[];
  selectedStepId: string | null;
  persona: string | null;
  query: string;
  detailOpen: boolean;
  stepPos: Record<string, { x: number; y: number }>;
  mapPos: Record<string, { x: number; y: number }>;
  variantSel: Record<string, string>;
  flow: FlowDir;
  notesOpen: boolean;
  railOpen: Record<string, boolean>;
  notePopover: { journey: string; step: string } | null;
  noteDraft: string;
  promptText: string | null;
  copied: boolean;
  isNarrow: boolean;
  versionsOpen: boolean;
  drawerOpen: boolean;
  exportOpen: boolean;
  exportOpts: ExportOpts;
  linkCopied: boolean;
}

// ── actions: one per old setState concern, mechanically 1:1 with app.tsx ──
export interface AppActions {
  // simple field setters / toggles
  setNarrow(matches: boolean): void;
  closeDrawer(): void;
  toggleDrawer(): void;
  setQuery(v: string): void;
  toggleNotes(): void;
  toggleExport(): void;
  closeExport(): void;
  toggleDetail(): void;
  toggleRail(path: string): void;
  clearPersona(): void;
  openVersions(): void;
  closeVersions(): void;
  setNoteDraft(v: string): void;
  closeNotePopover(): void;
  cancelNote(): void;
  openNotePopover(journey: string, step: string): void;
  setCopied(v: boolean): void;
  setLinkCopied(v: boolean): void;
  setPrompt(text: string): void;
  clearPrompt(): void;
  setMapPos(key: string, p: { x: number; y: number }): void;
  setStepPos(key: string, p: { x: number; y: number }): void;
  selectNode(id: string): void;
  // persisted prefs (write through settings.ts)
  toggleTheme(): void;
  toggleFlow(): void;
  toggleExportOpt(key: keyof ExportOpts): void;
  togglePersona(id: string): void;
  // graph-aware navigation
  enterJourney(id: string): void;
  enterPath(ids: string[]): void;
  stepInto(subId: string, callerNode: string): void;
  goCrumb(k: number): void;
  setVariant(baseId: string, journeyId: string): void;
  hop(nextId: string): void;
  returnToParent(): void;
  restoreLocation(loc: Loc): void;
  applyRefetch(data: ApiData): void;
}

export type AppStore = AppState & AppActions;
export type AppStoreApi = StoreApi<AppStore>;

/** Seed inputs the App constructor computes (two-phase URL seed lives here). */
export interface AppInit {
  data: ApiData;
  theme: Theme;
  flow: FlowDir;
  isNarrow: boolean;
  loc: Loc;
  exportOpts: ExportOpts;
}

export function createAppStore(init: AppInit): AppStoreApi {
  return createStore<AppStore>((set, get) => {
    // per-store derived-graph cache, invalidated when `data` changes (refetch).
    let _g: Graph | null = null;
    let _gData: ApiData | null = null;
    const graph = (): Graph => {
      const d = get().data;
      if (_g && _gData === d) return _g;
      _gData = d;
      return (_g = deriveGraph(d));
    };
    const firstStep = (id: string): string | null => graph().byId.get(id)?.steps[0]?.id ?? null;
    const displayed = (id: string): string => get().variantSel[id] ?? id;
    // Rebuild the enriched call stack (caller journey + step per hop) from a bare id
    // chain. `resolve` maps a base id to its shown variant (so a restore can honour
    // URL variants before variantSel is committed). Mirrors App.buildStack.
    const buildStack = (ids: string[], resolve: (id: string) => string): StackEntry[] => {
      const d = graph();
      const stack: StackEntry[] = [];
      ids.forEach((id, i) => {
        if (i === 0) { stack.push({ id }); return; }
        const parent = ids[i - 1]!;
        const callerNode = d.byId.get(resolve(parent))?.steps.find((n: ApiStep) => n.journey === id)?.id;
        stack.push({ id, callerJourney: parent, ...(callerNode ? { callerNode } : {}) });
      });
      return stack;
    };

    const { loc } = init;
    return {
      // ── two-phase seed: raw, unvalidated location (cDM's restoreLocation validates) ──
      data: init.data,
      theme: init.theme,
      view: loc.journeys.length ? 'journey' : 'map',
      stack: loc.journeys.map((id) => ({ id })),
      selectedStepId: loc.step,
      persona: loc.persona,
      query: '',
      detailOpen: !init.isNarrow,
      stepPos: {},
      mapPos: {},
      variantSel: loc.variants,
      flow: init.flow,
      notesOpen: false,
      railOpen: {},
      notePopover: null,
      noteDraft: '',
      promptText: null,
      copied: false,
      isNarrow: init.isNarrow,
      versionsOpen: false,
      drawerOpen: false,
      exportOpen: false,
      exportOpts: init.exportOpts ?? { ...DEFAULT_EXPORT_OPTS },
      linkCopied: false,

      // ── simple setters / toggles ──
      setNarrow: (matches) => set({ isNarrow: matches, drawerOpen: matches && get().drawerOpen }),
      closeDrawer: () => set({ drawerOpen: false }),
      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
      setQuery: (v) => set({ query: v }),
      toggleNotes: () => set((s) => ({ notesOpen: !s.notesOpen, notePopover: null })),
      toggleExport: () => set((s) => ({ exportOpen: !s.exportOpen, notesOpen: false })),
      closeExport: () => set({ exportOpen: false }),
      toggleDetail: () => set((s) => ({ detailOpen: !s.detailOpen })),
      toggleRail: (path) => set((s) => ({ railOpen: { ...s.railOpen, [path]: !(s.railOpen[path] ?? true) } })),
      clearPersona: () => set({ persona: null }),
      openVersions: () => set({ versionsOpen: true }),
      closeVersions: () => set({ versionsOpen: false }),
      setNoteDraft: (v) => set({ noteDraft: v }),
      closeNotePopover: () => set({ notePopover: null }),
      cancelNote: () => set({ notePopover: null, noteDraft: '' }),
      openNotePopover: (journey, step) => set({ notePopover: { journey, step }, noteDraft: '' }),
      setCopied: (v) => set({ copied: v }),
      setLinkCopied: (v) => set({ linkCopied: v }),
      setPrompt: (text) => set({ promptText: text }),
      clearPrompt: () => set({ promptText: null }),
      setMapPos: (key, p) => set((s) => ({ mapPos: { ...s.mapPos, [key]: p } })),
      setStepPos: (key, p) => set((s) => ({ stepPos: { ...s.stepPos, [key]: p } })),
      selectNode: (id) => set({ selectedStepId: id }),

      // ── persisted prefs: write through settings.ts (same payload shape as before) ──
      toggleTheme: () => set((s) => { const theme = s.theme === 'dark' ? 'light' : ('dark' as const); saveSettings({ theme }); return { theme }; }),
      toggleFlow: () => set((s) => { const flow = s.flow === 'vertical' ? 'horizontal' : ('vertical' as const); saveSettings({ flow }); return { flow }; }),
      toggleExportOpt: (key) => set((s) => { const exportOpts = { ...s.exportOpts, [key]: !s.exportOpts[key] }; saveSettings({ exportOpts }); return { exportOpts }; }),
      togglePersona: (id) => set((s) => ({ persona: s.persona === id ? null : id })),

      // ── graph-aware navigation (validates against the derived graph) ──
      enterJourney: (id) => set({ view: 'journey', stack: [{ id }], selectedStepId: firstStep(displayed(id)) }),
      enterPath: (ids) => {
        const stack = buildStack(ids, (id) => displayed(id));
        const last = ids[ids.length - 1]!;
        set({ view: 'journey', stack, selectedStepId: firstStep(displayed(last)) });
      },
      stepInto: (subId, callerNode) => {
        const s = get();
        const cur = s.stack[s.stack.length - 1];
        if (!cur) return;
        set({ stack: [...s.stack, { id: subId, callerJourney: cur.id, callerNode }], selectedStepId: firstStep(displayed(subId)) });
      },
      goCrumb: (k) => {
        if (k === 0) { set({ view: 'map', stack: [], selectedStepId: null, persona: null }); return; }
        const st = get().stack.slice(0, k);
        set({ stack: st, selectedStepId: firstStep(displayed(st[st.length - 1]!.id)) });
      },
      setVariant: (baseId, journeyId) => set((s) => ({ variantSel: { ...s.variantSel, [baseId]: journeyId }, selectedStepId: firstStep(journeyId), versionsOpen: false })),
      hop: (nextId) => set({ stack: [{ id: nextId }], selectedStepId: firstStep(displayed(nextId)) }),
      returnToParent: () => {
        const s = get();
        const e = s.stack[s.stack.length - 1];
        if (!e?.callerJourney || !e.callerNode) return;
        const parent = graph().byId.get(displayed(e.callerJourney));
        const returnEdge = parent?.edges.find((ed) => ed.from === e.callerNode);
        set({ stack: s.stack.slice(0, -1), selectedStepId: returnEdge?.to ?? e.callerNode ?? null });
      },
      restoreLocation: (l) => {
        const d = graph();
        const path: string[] = [];
        for (const id of l.journeys) { if (d.byId.has(id)) path.push(id); else break; } // longest valid prefix
        const variants: Record<string, string> = {};
        for (const [base, sel] of Object.entries(l.variants)) if (d.byId.has(sel)) variants[base] = sel;
        const resolve = (id: string) => variants[id] ?? id;
        const persona = l.persona && d.personas.some((p) => p.id === l.persona) ? l.persona : null;
        if (path.length === 0) { set({ view: 'map', stack: [], selectedStepId: null, persona, variantSel: variants }); return; }
        const last = path[path.length - 1]!;
        const lastSteps = d.byId.get(resolve(last))?.steps ?? [];
        const step = l.step && lastSteps.some((n) => n.id === l.step) ? l.step : firstStep(resolve(last));
        set({ view: 'journey', stack: buildStack(path, resolve), variantSel: variants, persona, selectedStepId: step });
      },
      applyRefetch: (data) => {
        const s = get();
        const byId = new Map(data.journeys.map((b) => [b.id, b]));
        const stack = s.stack.filter((e) => byId.has(e.id));
        let selectedStepId = s.selectedStepId;
        const top = stack[stack.length - 1];
        if (top) {
          const selVar = s.variantSel[top.id];
          const journey = byId.get(selVar && byId.has(selVar) ? selVar : top.id);
          if (!journey?.steps.some((n) => n.id === selectedStepId)) selectedStepId = journey?.steps[0]?.id ?? null;
        }
        set({ data, stack, selectedStepId, view: stack.length ? s.view : 'map' });
      },
    };
  });
}
