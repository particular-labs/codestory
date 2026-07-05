import { beforeEach, expect, test } from 'bun:test';
import { createAppStore, type AppInit } from './store';
import { loadSettings } from './settings';
import { DEFAULT_EXPORT_OPTS } from './export-meta';
import type { ApiData } from './app';
import type { Loc } from './urlState';

// Minimal two-journey fixture: `signup` (a→b) and `account` (x). Enough to exercise
// the graph-validating actions (restoreLocation prefix trim, firstStep) with no DOM.
const DATA: ApiData = {
  manifest: { project: 'test', personas: [{ id: 'user', title: 'User', start: { journey: 'signup', entry: 'a' }, journeys: ['signup'] }] },
  journeys: [
    { id: 'signup', title: 'Signup', status: 'built', entries: ['a'], exits: [], steps: [{ id: 'a', type: 'action' }, { id: 'b', type: 'action' }], edges: [{ from: 'a', to: 'b' }], links: [] },
    { id: 'account', title: 'Account', status: 'built', entries: ['x'], exits: [], steps: [{ id: 'x', type: 'action' }], edges: [], links: [] },
  ],
  notes: [],
};

const EMPTY_LOC: Loc = { journeys: [], step: null, persona: null, variants: {} };
const baseInit = (loc: Loc = EMPTY_LOC): AppInit => ({ data: DATA, theme: 'dark', flow: 'horizontal', isNarrow: false, loc, exportOpts: { ...DEFAULT_EXPORT_OPTS } });

beforeEach(() => localStorage.clear());

test('initial state reproduces the raw ctor seed from an init', () => {
  const s = createAppStore(baseInit({ journeys: ['signup'], step: 'b', persona: 'user', variants: {} })).getState();
  expect(s.view).toBe('journey'); // journeys present → journey view
  expect(s.stack).toEqual([{ id: 'signup' }]); // raw, unvalidated
  expect(s.selectedStepId).toBe('b');
  expect(s.persona).toBe('user');
  expect(s.theme).toBe('dark');
  expect(s.flow).toBe('horizontal');
  expect(s.detailOpen).toBe(true); // !isNarrow
  expect(s.query).toBe('');
  expect(s.notesOpen).toBe(false);
  expect(s.exportOpts).toEqual(DEFAULT_EXPORT_OPTS);
});

test('empty loc seeds the map view', () => {
  const s = createAppStore(baseInit()).getState();
  expect(s.view).toBe('map');
  expect(s.stack).toEqual([]);
  expect(s.selectedStepId).toBeNull();
});

test('toggleTheme flips dark↔light and persists through saveSettings', () => {
  const store = createAppStore(baseInit());
  store.getState().toggleTheme();
  expect(store.getState().theme).toBe('light');
  expect(loadSettings().theme).toBe('light'); // wrote through settings.ts, not persist middleware
  store.getState().toggleTheme();
  expect(store.getState().theme).toBe('dark');
  expect(loadSettings().theme).toBe('dark');
});

test('toggleFlow persists through saveSettings', () => {
  const store = createAppStore(baseInit());
  store.getState().toggleFlow();
  expect(store.getState().flow).toBe('vertical');
  expect(loadSettings().flow).toBe('vertical');
});

test('toggleExportOpt flips one key and persists exportOpts', () => {
  const store = createAppStore(baseInit());
  store.getState().toggleExportOpt('legend');
  expect(store.getState().exportOpts.legend).toBe(false);
  expect(loadSettings().exportOpts?.legend).toBe(false);
});

test('selectNode + enterJourney update the selection/stack (functional-updater path)', () => {
  const store = createAppStore(baseInit());
  store.getState().enterJourney('signup');
  expect(store.getState().view).toBe('journey');
  expect(store.getState().stack).toEqual([{ id: 'signup' }]);
  expect(store.getState().selectedStepId).toBe('a'); // firstStep(signup)
  store.getState().selectNode('b');
  expect(store.getState().selectedStepId).toBe('b');
});

test('togglePersona toggles the lens on/off', () => {
  const store = createAppStore(baseInit());
  store.getState().togglePersona('user');
  expect(store.getState().persona).toBe('user');
  store.getState().togglePersona('user');
  expect(store.getState().persona).toBeNull();
});

test('restoreLocation validates journeys against data (longest valid prefix)', () => {
  const store = createAppStore(baseInit());
  store.getState().restoreLocation({ journeys: ['signup', 'ghost'], step: 'b', persona: 'nobody', variants: {} });
  expect(store.getState().stack.map((e) => e.id)).toEqual(['signup']); // 'ghost' trimmed
  expect(store.getState().selectedStepId).toBe('b'); // 'b' valid in signup
  expect(store.getState().persona).toBeNull(); // 'nobody' not a real persona
  // an entirely invalid journey chain degrades to the map
  store.getState().restoreLocation({ journeys: ['ghost'], step: null, persona: null, variants: {} });
  expect(store.getState().view).toBe('map');
  expect(store.getState().stack).toEqual([]);
});

test('subscribe fires on set (drives forceUpdate in the app)', () => {
  const store = createAppStore(baseInit());
  let hits = 0;
  const unsub = store.subscribe(() => hits++);
  store.getState().setQuery('hello');
  expect(store.getState().query).toBe('hello');
  expect(hits).toBe(1);
  unsub();
});
