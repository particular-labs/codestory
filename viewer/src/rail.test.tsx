import { afterEach, expect, test } from 'bun:test';
import { fireEvent } from '@testing-library/react';
import { mountApp, resetApp } from './harness';

// RAIL EXPAND/COLLAPSE INTERACTION. The recursive sub-flow renderer (Rail.tsx railRow)
// is only ever structurally snapshotted by parity.test.tsx — its actual toggle behavior
// (chevron -> toggleRail -> railOpen[path] -> child rows mount/unmount) was never exercised.
// FIXTURE's `signup` journey has a `verify` step whose `journey: 'verify-sub'` makes
// verify-sub ("Verify email") a sub-flow child under signup in the rail. It renders
// expanded by default, so we assert the child is PRESENT, click the chevron, then assert
// it's GONE — behavior (DOM presence toggling), not a snapshot.

afterEach(resetApp);

test('rail: collapsing a journey hides its sub-flow child row, re-expanding shows it', () => {
  const { container } = mountApp('/');

  // The only sub-flow-bearing rail row in FIXTURE is `signup` (its `verify` step ->
  // verify-sub), and railOpen defaults to expanded, so exactly one chevron reads
  // "Collapse sub-flows". Finding it is the non-vacuity guard that the selector matched.
  const chevron = container.querySelector('[data-tip="Collapse sub-flows"]') as HTMLElement | null;
  expect(chevron).not.toBeNull();

  // Scope assertions to just this railRow subtree so a stray "Verify email" elsewhere
  // can't make the test pass vacuously: chevron -> row div -> railRow root div.
  const railRowRoot = chevron!.parentElement!.parentElement!;
  // Expanded: verify-sub's child row ("Verify email") is mounted under signup ("Signup").
  expect(railRowRoot.textContent).toContain('Signup');
  expect(railRowRoot.textContent).toContain('Verify email');

  fireEvent.click(chevron!); // toggleRail('signup') -> railOpen.signup = false

  // Collapsed: the child row unmounts; the parent row and its chevron stay, now flipped.
  expect(railRowRoot.textContent).toContain('Signup');
  expect(railRowRoot.textContent).not.toContain('Verify email');
  expect(container.querySelector('[data-tip="Show sub-flows"]')).not.toBeNull();

  fireEvent.click(chevron!); // toggle back -> railOpen.signup = true

  // Re-expanded: the child row remounts — proves the toggle is a real two-way switch.
  expect(railRowRoot.textContent).toContain('Verify email');
  expect(container.querySelector('[data-tip="Collapse sub-flows"]')).not.toBeNull();
});
