import { expect, test } from 'bun:test';
import type { StackEntry } from './app';
import { FIXTURE } from './parity.fixture';
import { activePrefix, continueTarget, deriveGraph, unionOf } from './graph';

// TDD guard for the pure graph functions extracted out of App (viewer-decompose).
// Pins the ACTUAL shapes App.d()/render produce for FIXTURE so a refactor that
// changes edge/order/union computation fails here before it reaches the parity oracle.

test('deriveGraph pins byId / order / chainEdges / variantsByBase / subsByJourney', () => {
  const g = deriveGraph(FIXTURE);

  // byId maps journey id → journey (every journey present, variants included)
  expect([...g.byId.keys()].sort()).toEqual(['account', 'signup', 'signup@fast', 'verify-sub']);
  expect(g.byId.get('signup')?.title).toBe('Signup');

  // variants are grouped under their base id
  const sVariants = g.variantsByBase.get('signup') ?? [];
  expect(sVariants.map((v) => v.id)).toEqual(['signup@fast']);

  // sub-flow refs: signup's `verify` step has journey:'verify-sub'
  expect(g.subsByJourney.get('signup')).toEqual(['verify-sub']);

  // order: variants + referenced subs are excluded; chain-sorted (signup → account)
  expect(g.order).toEqual(['signup', 'account']);

  // chainEdges: signup links exit 'done' → account entry 'start'
  expect(g.chainEdges).toEqual([['signup', 'account', 'done → start']]);

  // personas come straight from the manifest
  expect(g.personas.map((p) => p.id)).toEqual(['user', 'admin']);
});

test('unionOf dedups the step + edge union across base and variant (first-wins)', () => {
  const base = FIXTURE.journeys.find((j) => j.id === 'signup')!;
  const fast = FIXTURE.journeys.find((j) => j.id === 'signup@fast')!;
  const { steps, edges } = unionOf([base, fast]);

  // union of step ids, no dupes; base order first, variant contributes nothing new by id
  expect(steps.map((s) => s.id)).toEqual(['start', 'valid', 'verify', 'save', 'ok', 'bad']);
  // first-wins dedup: shared `save` keeps the BASE label (versions = [base, ...variants])
  expect(steps.find((s) => s.id === 'save')?.label).toBe('Create account');

  // edges deduped by `from>to`; variant adds start>save and save>bad only
  expect(edges).toEqual([
    ['start', 'valid'],
    ['valid', 'verify'],
    ['verify', 'save'],
    ['save', 'ok'],
    ['valid', 'bad'],
    ['start', 'save'],
    ['save', 'bad'],
  ]);
});

test('activePrefix follows the slice(0, selI<0?0:selI+1) rule', () => {
  const steps = FIXTURE.journeys.find((j) => j.id === 'signup')!.steps;

  // no selection → empty set
  expect([...activePrefix(steps, -1)]).toEqual([]);

  // selIndex=2 → first 3 step ids
  expect([...activePrefix(steps, 2)]).toEqual(['start', 'valid', 'verify']);
});

test('continueTarget pins the exit-step descriptor (mid-step / continue / end / return)', () => {
  const g = deriveGraph(FIXTURE);
  const signup = g.byId.get('signup')!;
  const account = g.byId.get('account')!;
  const verifySub = g.byId.get('verify-sub')!;
  const rootEntry = (id: string): StackEntry => ({ id });

  // (1) mid-journey step (a decision, not an exit) → no continue affordance
  const validIdx = signup.steps.findIndex((s) => s.id === 'valid');
  expect(continueTarget(signup.steps, validIdx, signup, rootEntry('signup'), g, {})).toBeNull();

  // (2) an exit that links onward (signup 'ok' port 'done' → account) → Continue descriptor
  const okIdx = signup.steps.findIndex((s) => s.id === 'ok');
  expect(continueTarget(signup.steps, okIdx, signup, rootEntry('signup'), g, {})).toEqual({
    kind: 'continue',
    label: 'Continue → Account',
    targetId: 'account',
  });

  // (3) end-of-journey: account's terminal exit has no onward link, no caller → null
  const doneIdx = account.steps.findIndex((s) => s.id === 'done');
  expect(continueTarget(account.steps, doneIdx, account, rootEntry('account'), g, {})).toBeNull();

  // (4) exit while drilled into a sub-flow (caller signup/verify) → Return descriptor,
  // labelled by the caller's return-edge target (verify → save = "Create account")
  const subEntry: StackEntry = { id: 'verify-sub', callerJourney: 'signup', callerNode: 'verify' };
  const outIdx = verifySub.steps.findIndex((s) => s.id === 'out');
  expect(continueTarget(verifySub.steps, outIdx, verifySub, subEntry, g, {})).toEqual({
    kind: 'return',
    label: 'Return → Create account',
    targetId: 'signup',
  });
});
