import { afterEach, expect, test } from 'bun:test';
import { fireEvent } from '@testing-library/react';
import { findCard, historySpy, mountApp, resetApp } from './harness';

// DRAG-MOVE ORACLE. Pins `startDrag` (app.tsx ~L560-594) against the CURRENT class
// before the P5 class→function + useCardDrag rewrite: a pointermove past a small
// threshold is a DRAG — it repositions the card via setMapPos/setStepPos (mapPos
// for kind 'map', stepPos for kind 'step') and does NOT navigate — while pointerup
// at (or near) the start position with no qualifying move is a CLICK — it fires
// enterJourney (kind 'map') / selectNode (kind 'step'), which is the path
// navigation.test.tsx already covers (pointerdown+pointerup at the SAME coords,
// no move in between). This file covers the move branch that oracle leaves dark.
//
// Threshold (app.tsx startDrag): `Math.abs(dx) + Math.abs(dy) > 3` — Manhattan
// distance of the pointer delta from the pointerdown origin, NOT Euclidean. So a
// (+30,+30) drag (sum 60) is unambiguously over threshold, and a (+2,0) nudge
// (sum 2) is unambiguously under it.
//
// Position mechanism: a dragged card's rendered position is `baseX/baseY + delta`,
// written into React inline `style.left`/`style.top` (map cards: `mapPos[mkey]`
// read back at app.tsx:625-626; step cards: `stepPos[key]` read back at
// app.tsx:744-745). React serializes those numeric style props to "<n>px" strings
// on the DOM node, so we read `el.style.left`/`el.style.top` and parseFloat them.
// A canvas-framing pass (`frameOffset`, src/frame.ts) can shift ALL cards by a
// shared (dx,dy) to keep left/up-dragged content non-negative and reachable, but
// only when some rect's x or y goes negative — a +30/+30 move (away from the
// origin) never triggers that, so the reframe delta is 0 here and the raw
// before/after left/top diff is exactly the drag delta. This is the same
// history-spy pattern as navigation.test.tsx: pushState/replaceState fire from
// _syncUrl only on click-driven navigation, so a drag that touches neither proves
// the drag path never reaches that code — position isn't serialized to the URL.

// History spy stays opt-in (harness.historySpy): each test installs it and this
// afterEach restores it, so parity's shared resetApp never touches history.
let spy: ReturnType<typeof historySpy> | null = null;
afterEach(() => {
  spy?.restore();
  spy = null;
  resetApp();
});

/** left/top as written by React (numeric style props get "<n>px" serialized). */
function pos(el: HTMLElement): { left: number; top: number } {
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
}

/** startDrag's window-level pointermove/pointerup gesture (app.tsx `startDrag`):
 *  pointerdown on the card captures the start coords + pointerId, then window
 *  pointermove/pointerup carry the same pointerId. A move whose Manhattan delta
 *  exceeds the 3px threshold is a DRAG (reposition, no navigation); otherwise the
 *  pointerup is a CLICK (navigate, no reposition). */
function drag(card: HTMLElement, pointerId: number, from: { x: number; y: number }, dx: number, dy: number) {
  fireEvent.pointerDown(card, { pointerId, clientX: from.x, clientY: from.y, button: 0 });
  fireEvent.pointerMove(window, { pointerId, clientX: from.x + dx, clientY: from.y + dy });
  fireEvent.pointerUp(window, { pointerId, clientX: from.x + dx, clientY: from.y + dy });
}

const SEARCH_INPUT = 'input[placeholder="Search journeys & steps"]'; // isMap-only (app.tsx ~L847)
const SELECTED_SHADOW = '0 0 0 2px var(--accent)'; // isSel-only boxShadow (app.tsx ~L777)

test('drag: dragging a map card moves it and does not enter the journey', () => {
  const { calls } = (spy = historySpy());
  const { container } = mountApp('/');
  expect(calls.length).toBe(0); // seed mount — no emission yet

  const signup = findCard(container, 'Signup');
  const before = pos(signup);

  drag(signup, 1, { x: 100, y: 100 }, 30, 30);

  const after = pos(signup);
  // (a) position shifted by the drag delta — mapPos applied via setMapPos
  expect(after.left).toBe(before.left + 30);
  expect(after.top).toBe(before.top + 30);
  // (b) drag never touches the URL — zero history calls, push or replace
  expect(calls.length).toBe(0);
  // (c) still the map view, not a journey entered (enterJourney did NOT fire) —
  // the map-only search input is still present
  expect(container.querySelector(SEARCH_INPUT)).toBeTruthy();
});

test('drag: dragging a step card moves it and does not select/navigate', () => {
  const { calls } = (spy = historySpy());
  const { container } = mountApp('/?journeys=signup&step=start');
  expect(calls.length).toBe(0); // seed mount — no emission yet

  const startCard = findCard(container, 'Open form'); // step 'start', pre-selected via ?step=start
  expect(startCard.style.boxShadow).toBe(SELECTED_SHADOW); // sanity: seed selection took

  const decision = findCard(container, 'Valid?'); // step 'valid'
  const before = pos(decision);

  drag(decision, 2, { x: 200, y: 200 }, 30, 30);

  const after = pos(decision);
  // (a) position shifted by the drag delta — stepPos applied via setStepPos
  expect(after.left).toBe(before.left + 30);
  expect(after.top).toBe(before.top + 30);
  // (b) selection would replaceState — zero history calls proves no selectNode fired
  expect(calls.length).toBe(0);
  // (c) the previously-selected step ('start') is unchanged, and the dragged card
  // ('valid') was never selected
  expect(findCard(container, 'Open form').style.boxShadow).toBe(SELECTED_SHADOW);
  expect(findCard(container, 'Valid?').style.boxShadow).not.toBe(SELECTED_SHADOW);
});

test('drag: a sub-threshold move is still a click (pins the 3px boundary)', () => {
  const { calls } = (spy = historySpy());
  const { container } = mountApp('/?journeys=signup');
  expect(calls.length).toBe(0); // seed mount — no emission yet

  const decision = findCard(container, 'Valid?');

  // 2px nudge: Math.abs(dx)+Math.abs(dy) = 2, which is NOT > 3 — startDrag never
  // flips `moved`, so pointerup falls through to the click branch (selectNode).
  drag(decision, 3, { x: 50, y: 50 }, 2, 0);

  // non-vacuity guard + the actual assertion: the click fired a replaceState
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((c) => c.method === 'replace')).toBe(true);
  const last = calls[calls.length - 1]!;
  expect(last.url).toBe('?journeys=signup&step=valid');
});
