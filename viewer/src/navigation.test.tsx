import { afterEach, expect, test } from 'bun:test';
import { clickCard, findCard, historySpy, mountApp, resetApp } from './harness';

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

// History spy stays opt-in (harness.historySpy): each test installs it and this
// afterEach restores it, so parity's shared resetApp never touches history.
let spy: ReturnType<typeof historySpy> | null = null;
afterEach(() => {
  spy?.restore();
  spy = null;
  resetApp();
});

test('navigation: entering a journey from the map pushes a new history entry', () => {
  const { calls } = (spy = historySpy());
  const { container } = mountApp('/');
  expect(calls.length).toBe(0); // nothing emitted yet — mount at map view is the seed, not a move

  const signup = findCard(container, 'Signup'); // non-vacuity guard: the selector must find the card

  clickCard(signup, 1);

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
  const { calls } = (spy = historySpy());
  const { container } = mountApp('/?journeys=signup');
  expect(calls.length).toBe(0); // seed mount — no emission yet

  const decision = findCard(container, 'Valid?'); // non-vacuity guard: the selector must find the card

  clickCard(decision, 2);

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
