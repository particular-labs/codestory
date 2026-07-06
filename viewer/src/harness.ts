import { cleanup, fireEvent, render } from '@testing-library/react';
import { expect } from 'bun:test';
import { createElement } from 'react';
import { App, type AppProps } from './app';
import { FIXTURE } from './parity.fixture';

// Shared DOM-test harness. parity/navigation/drag/rail all mount the same seeded App
// and (nav/drag) spy history the same way; this is the one copy they import instead of
// re-rolling BASE/mountAt + the pushState/replaceState recorder in each file.
const BASE: Omit<AppProps, 'data'> = { defaultTheme: 'dark', accent: '', flowDirection: 'horizontal' };

/** afterEach body: drop persisted exportOpts (settings.ts) + unmount, so test order can't leak.
 *  Deliberately does NOT touch pushState/replaceState — the history spy is opt-in (historySpy),
 *  so parity's teardown never writes an undefined history method back. */
export function resetApp(): void {
  localStorage.clear();
  cleanup();
}

// happy-dom's replaceState doesn't populate location.search (which App's constructor reads);
// happyDOM.setURL does, and preserves ~ : @ raw so compact keys survive → App sees the seed.
export function mountApp(path: string, propsOverride: Partial<AppProps> = {}) {
  const p = path.startsWith('/') ? path : `/${path}`;
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(`http://localhost${p}`);
  return render(createElement(App, { data: FIXTURE, ...BASE, ...propsOverride }));
}

export type Call = { method: 'push' | 'replace'; url: string };

/** OPT-IN history recorder. Installs pushState/replaceState spies that record a
 *  {method,url} then call through to the real impl (so app state + a later popstate
 *  stay consistent), and returns the live `calls` array plus `restore()` to uninstall.
 *  Call it in a test and invoke `restore()` in that file's afterEach; parity never
 *  calls it, so its teardown (resetApp) never touches history. */
export function historySpy(): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  window.history.pushState = ((...args: Parameters<typeof window.history.pushState>) => {
    calls.push({ method: 'push', url: String(args[2]) });
    return origPush(...args);
  }) as typeof window.history.pushState;
  window.history.replaceState = ((...args: Parameters<typeof window.history.replaceState>) => {
    calls.push({ method: 'replace', url: String(args[2]) });
    return origReplace(...args);
  }) as typeof window.history.replaceState;
  return {
    calls,
    restore() {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    },
  };
}

/** Map cards / journey step cards have no onClick — they're driven by startDrag's
 *  pointerdown→pointerup gesture (app.tsx `startDrag`): pointerdown on the card,
 *  then a pointerup on `window` with the same pointerId and no intervening move
 *  clicks it (kind 'map' → enterJourney; kind 'step' → selectNode). This fires the
 *  exact same code path a real mouse/touch click does. */
export function clickCard(el: HTMLElement, pointerId: number) {
  fireEvent.pointerDown(el, { pointerId, clientX: 10, clientY: 10, button: 0 });
  fireEvent.pointerUp(window, { pointerId, clientX: 10, clientY: 10 });
}

/** Find a step/map card by its rendered text, with a built-in non-vacuity guard. */
export function findCard(container: HTMLElement, text: string): HTMLElement {
  const cards = [...container.querySelectorAll('[data-export-step]')] as HTMLElement[];
  const el = cards.find((c) => c.textContent?.includes(text));
  expect(el).toBeTruthy(); // non-vacuity guard: the selector must find the card
  return el!;
}
