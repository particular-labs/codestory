import { afterEach, expect, test } from 'bun:test';
import { fireEvent } from '@testing-library/react';
import { mountApp, resetApp } from './harness';

// PARITY ORACLE (#2068). A DIFFERENTIAL gate, not pixel truth: the viewer styles
// everything inline (`css()` → style attrs; global CSS in index.html is an invariant)
// and the initial render does NO live DOM measurement (assumptions.md A1/A3), so the
// serialized `innerHTML` is byte-stable. happy-dom's CSS serialization is its own
// (e.g. it expands `borderBottom` shorthand to longhand) — that's fine because BOTH
// baseline and phase-N run through the same serializer; a real render change still
// diffs. Every phase re-runs this: any snapshot diff is a regression to investigate.
// Baseline re-captured 2026-07-06 after P2 swapped the hand-rolled Sugiyama layout for
// @dagrejs/dagre (./dagreLayout) — the geometry-only diff (card left/top, edge path
// coords, canvas dims; no DOM/structure change) was reviewed and user-signed-off. From
// here the dagre-layout output IS the baseline, so any snapshot diff is again a real
// regression.

afterEach(resetApp);

test('parity: chain map (root)', () => {
  const { container } = mountApp('/');
  expect(container.innerHTML).toContain('Signup');
  expect(container.innerHTML).toContain('Account');
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: map with persona lens', () => {
  const { container } = mountApp('/?persona=user');
  // Non-vacuous: the `user` lens covers only [signup], so the `account` map card must
  // dim (opacity < 1) — proves the lens actually applied, not just that 'User' is in the rail.
  const cards = [...container.querySelectorAll('[data-export-step]')] as HTMLElement[];
  const account = cards.find((c) => c.textContent?.includes('Account'));
  expect(account).toBeTruthy();
  expect(Number(account!.style.opacity || '1')).toBeLessThan(1);
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: journey view at a step (action/decision/exit/sub-flow, statuses)', () => {
  const { container } = mountApp('/?journeys=signup&step=save');
  expect(container.innerHTML).toContain('Create account');
  expect(container.innerHTML).toContain('Verify email'); // sub-flow step
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: journey with variant selected (union layout)', () => {
  const { container } = mountApp('/?journeys=signup&variants=signup:signup@fast');
  expect(container.innerHTML).toContain('One-tap create'); // variant-only step → variant applied
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: drilled into a sub-flow (call stack)', () => {
  const { container } = mountApp('/?journeys=signup~verify-sub');
  expect(container.innerHTML).toContain('Check inbox'); // sub-flow step
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: narrow viewport (mobile layout)', () => {
  const real = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } })) as typeof window.matchMedia;
  try {
    const { container } = mountApp('/?journeys=signup&step=save', { flowDirection: null });
    expect(container.innerHTML).toMatchSnapshot();
  } finally {
    window.matchMedia = real;
  }
});

test('parity: notes hub open', () => {
  const { container } = mountApp('/?journeys=signup&step=save');
  const btn = container.querySelector('[data-tip^="Notes"]') as HTMLElement | null;
  expect(btn).not.toBeNull();
  fireEvent.click(btn!);
  expect(container.innerHTML).toContain('tighten the button copy'); // the open note
  expect(container.innerHTML).toMatchSnapshot();
});

test('parity: export-options popover open', () => {
  const { container } = mountApp('/?journeys=signup&step=save');
  const btn = container.querySelector('[data-tip="Export view as PNG"]') as HTMLElement | null;
  expect(btn).not.toBeNull();
  fireEvent.click(btn!);
  expect(container.innerHTML).toMatchSnapshot();
});
