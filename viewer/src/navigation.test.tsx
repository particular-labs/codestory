import { afterEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { App, type AppProps } from './app';
import { FIXTURE } from './parity.fixture';

// NAVIGATION → URL EMISSION ORACLE. Pins `_syncUrl`'s push-vs-replace split (app.tsx):
// a journeys-path move (map → journey, or journey → journey) must pushState (so
// back/forward walks each hop); an in-place tweak (step/persona/variant, same path)
// must replaceState (so history isn't flooded). This is exactly what the P3 store
// refactor relocated — a regression here would silently break the browser back button.
//
// happy-dom's history.pushState/replaceState don't reliably update window.location.search
// (see happydom.ts / parity.test.tsx comments), so we do NOT assert on location.search.
// Instead we spy on window.history.pushState/replaceState directly — that's exactly
// what `_syncUrl` calls — and assert on the captured {method, url} pairs. The spies
// still call through to the real implementation so app state (and a subsequent
// popstate-driven test) would see consistent history.

type Call = { method: 'push' | 'replace'; url: string };

let calls: Call[] = [];
let origPush: typeof window.history.pushState;
let origReplace: typeof window.history.replaceState;

function installHistorySpies() {
  calls = [];
  origPush = window.history.pushState.bind(window.history);
  origReplace = window.history.replaceState.bind(window.history);
  window.history.pushState = ((...args: Parameters<typeof window.history.pushState>) => {
    calls.push({ method: 'push', url: String(args[2]) });
    return origPush(...args);
  }) as typeof window.history.pushState;
  window.history.replaceState = ((...args: Parameters<typeof window.history.replaceState>) => {
    calls.push({ method: 'replace', url: String(args[2]) });
    return origReplace(...args);
  }) as typeof window.history.replaceState;
}

afterEach(() => {
  window.history.pushState = origPush;
  window.history.replaceState = origReplace;
  localStorage.clear();
  cleanup();
});

const BASE: Omit<AppProps, 'data'> = { defaultTheme: 'dark', accent: '', flowDirection: 'horizontal' };

// same pattern as parity.test.tsx: happyDOM.setURL (not replaceState) seeds location.search
// so the App constructor's parseLocation(window.location.search) sees the right seed.
function mountAt(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(`http://localhost${p}`);
  return render(createElement(App, { data: FIXTURE, ...BASE }));
}

/** Map cards / journey step cards have no onClick — they're driven by startDrag's
 *  pointerdown→pointerup gesture (app.tsx `startDrag`): pointerdown on the card,
 *  then a pointerup on `window` with the same pointerId and no intervening move
 *  clicks it (kind 'map' → enterJourney; kind 'step' → selectNode). This fires the
 *  exact same code path a real mouse/touch click does. */
function clickCard(el: HTMLElement, pointerId: number) {
  fireEvent.pointerDown(el, { pointerId, clientX: 10, clientY: 10, button: 0 });
  fireEvent.pointerUp(window, { pointerId, clientX: 10, clientY: 10 });
}

test('navigation: entering a journey from the map pushes a new history entry', () => {
  installHistorySpies();
  const { container } = mountAt('/');
  expect(calls.length).toBe(0); // nothing emitted yet — mount at map view is the seed, not a move

  const cards = [...container.querySelectorAll('[data-export-step]')] as HTMLElement[];
  const signup = cards.find((c) => c.textContent?.includes('Signup'));
  expect(signup).toBeTruthy(); // non-vacuity guard: the selector must find the card

  clickCard(signup!, 1);

  // non-vacuity guard: the click must actually have emitted something
  expect(calls.length).toBeGreaterThan(0);
  // journeys-path moved (map → [signup]) so pathMoved is true → MUST be a push
  const last = calls[calls.length - 1]!;
  expect(last.method).toBe('push');
  // exact serializeLocation output (urlState.ts serializeLocation): entering a journey
  // also selects its first step (store.ts enterJourney → firstStep), so the emitted
  // query is 'journeys=signup&step=start' — confirmed against urlState.ts lines 30-38
  // (journeys= then step=, joined with '&', no persona/variants present here).
  expect(last.url).toBe('?journeys=signup&step=start');
});

test('navigation: selecting a step within the same journey replaces (no new history entry)', () => {
  installHistorySpies();
  const { container } = mountAt('/?journeys=signup');
  expect(calls.length).toBe(0); // seed mount — no emission yet

  const cards = [...container.querySelectorAll('[data-export-step]')] as HTMLElement[];
  const decision = cards.find((c) => c.textContent?.includes('Valid?'));
  expect(decision).toBeTruthy(); // non-vacuity guard: the selector must find the card

  clickCard(decision!, 2);

  // non-vacuity guard
  expect(calls.length).toBeGreaterThan(0);
  // stack (journeys path) is unchanged — still just [signup] — so pathMoved is false
  // → MUST be a replace, and it must be the ONLY kind of call emitted (no push at all)
  expect(calls.every((c) => c.method === 'replace')).toBe(true);
  expect(calls.some((c) => c.method === 'push')).toBe(false);
  const last = calls[calls.length - 1]!;
  expect(last.method).toBe('replace');
  // exact serializeLocation output: journeys unchanged, step added → 'journeys=signup&step=valid'
  expect(last.url).toBe('?journeys=signup&step=valid');
});
