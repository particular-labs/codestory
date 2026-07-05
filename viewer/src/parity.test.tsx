import { afterEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { App, type AppProps } from './app';
import { FIXTURE } from './parity.fixture';

// PARITY ORACLE (#2068). A DIFFERENTIAL gate, not pixel truth: the viewer styles
// everything inline (`css()` → style attrs; global CSS in index.html is an invariant)
// and the initial render does NO live DOM measurement (assumptions.md A1/A3), so the
// serialized `innerHTML` is byte-stable. happy-dom's CSS serialization is its own
// (e.g. it expands `borderBottom` shorthand to longhand) — that's fine because BOTH
// baseline and phase-N run through the same serializer; a real render change still
// diffs. Every phase re-runs this: any snapshot diff is a regression to investigate
// (except P2 layout, reviewed visually). Baseline captured on `viewer-decompose` with
// zero app changes, so it IS main's output for FIXTURE.

afterEach(() => {
  localStorage.clear(); // App reads persisted exportOpts (settings.ts) — clear so an
  cleanup(); //           interaction test can't leak state into the next via order.
});

const BASE: Omit<AppProps, 'data'> = { defaultTheme: 'dark', accent: '', flowDirection: 'horizontal' };

// happy-dom's replaceState doesn't populate location.search (which App's constructor
// reads); its `happyDOM.setURL` does, and preserves ~ : @ raw so compact keys survive.
function mountAt(path: string, propsOverride: Partial<AppProps> = {}) {
  const p = path.startsWith('/') ? path : `/${path}`;
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(`http://localhost${p}`);
  return render(createElement(App, { data: FIXTURE, ...BASE, ...propsOverride }));
}

test('parity: chain map (root)', () => {
  const { container } = mountAt('/');
  expect(container.innerHTML).toContain('Signup');
  expect(container.innerHTML).toContain('Account');
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: map with persona lens', () => {
  const { container } = mountAt('/?persona=user');
  // Non-vacuous: the `user` lens covers only [signup], so the `account` map card must
  // dim (opacity < 1) — proves the lens actually applied, not just that 'User' is in the rail.
  const cards = [...container.querySelectorAll('[data-export-step]')] as HTMLElement[];
  const account = cards.find((c) => c.textContent?.includes('Account'));
  expect(account).toBeTruthy();
  expect(Number(account!.style.opacity || '1')).toBeLessThan(1);
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: journey view at a step (action/decision/exit/sub-flow, statuses)', () => {
  const { container } = mountAt('/?journeys=signup&step=save');
  expect(container.innerHTML).toContain('Create account');
  expect(container.innerHTML).toContain('Verify email'); // sub-flow step
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: journey with variant selected (union layout)', () => {
  const { container } = mountAt('/?journeys=signup&variants=signup:signup@fast');
  expect(container.innerHTML).toContain('One-tap create'); // variant-only step → variant applied
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: drilled into a sub-flow (call stack)', () => {
  const { container } = mountAt('/?journeys=signup~verify-sub');
  expect(container.innerHTML).toContain('Check inbox'); // sub-flow step
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: narrow viewport (mobile layout)', () => {
  const real = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } })) as typeof window.matchMedia;
  try {
    const { container } = mountAt('/?journeys=signup&step=save', { flowDirection: null });
    expect(container.innerHTML).toMatchSnapshot();
  } finally {
    window.matchMedia = real;
  }
});

test('parity: notes hub open', () => {
  const { container } = mountAt('/?journeys=signup&step=save');
  const btn = container.querySelector('[data-tip^="Notes"]') as HTMLElement | null;
  expect(btn).not.toBeNull();
  fireEvent.click(btn!);
  expect(container.innerHTML).toContain('tighten the button copy'); // the open note
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: export-options popover open', () => {
  const { container } = mountAt('/?journeys=signup&step=save');
  const btn = container.querySelector('[data-tip="Export view as PNG"]') as HTMLElement | null;
  expect(btn).not.toBeNull();
  fireEvent.click(btn!);
  expect(container.innerHTML).toMatchSnapshot();
});
