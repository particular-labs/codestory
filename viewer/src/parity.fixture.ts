import type { ApiData } from './app';

// Purpose-built fixture that exercises EVERY render branch the parity oracle must
// cover: action/decision/exit steps, a sub-flow step, a variant journey, a persona
// lens, all three statuses, step- and journey-level notes (open + applied), chain
// links, and edges with `when`. Deterministic — no dates/ids generated at render.
export const FIXTURE: ApiData = {
  manifest: {
    project: 'Fixture',
    personas: [
      { id: 'user', title: 'User', persona: 'end user', start: { journey: 'signup', entry: 'start' }, journeys: ['signup'] },
      { id: 'admin', title: 'Admin', start: { journey: 'account', entry: 'start' }, journeys: ['account'] },
    ],
  },
  journeys: [
    {
      id: 'signup',
      title: 'Signup',
      status: 'built',
      entries: ['start'],
      exits: ['done', 'failed'],
      steps: [
        { id: 'start', type: 'action', label: 'Open form', status: 'built', tests: ['tests/a.test.ts'] },
        { id: 'valid', type: 'decision', label: 'Valid?' },
        { id: 'verify', type: 'action', label: 'Verify email', journey: 'verify-sub' },
        { id: 'save', type: 'action', label: 'Create account', status: 'planned', note: 'narration for play', refs: ['src/save.ts#save'], contract: { in: 'Form', out: 'Account' }, acceptance: ['persists within 200ms'], ticket: 'keel://ticket/1' },
        { id: 'ok', type: 'exit', port: 'done' },
        { id: 'bad', type: 'exit', port: 'failed' },
      ],
      edges: [
        { from: 'start', to: 'valid' },
        { from: 'valid', to: 'verify', when: 'ok' },
        { from: 'verify', to: 'save' },
        { from: 'save', to: 'ok' },
        { from: 'valid', to: 'bad', when: 'invalid', label: 'reject' },
      ],
      links: [{ exit: 'done', journey: 'account', entry: 'start' }],
    },
    {
      id: 'signup@fast',
      title: 'Signup',
      status: 'planned',
      variantOf: 'signup',
      variantLabel: 'Fast path',
      entries: ['start'],
      exits: ['done', 'failed'],
      steps: [
        { id: 'start', type: 'action', label: 'Open form' },
        { id: 'save', type: 'action', label: 'One-tap create', status: 'planned' },
        { id: 'ok', type: 'exit', port: 'done' },
        { id: 'bad', type: 'exit', port: 'failed' },
      ],
      edges: [
        { from: 'start', to: 'save' },
        { from: 'save', to: 'ok' },
        { from: 'save', to: 'bad', when: 'error' },
      ],
      links: [],
    },
    {
      id: 'verify-sub',
      title: 'Verify email',
      status: 'built',
      entries: ['start'],
      exits: ['out'],
      steps: [
        { id: 'start', type: 'action', label: 'Check inbox', status: 'built', tests: ['tests/v.test.ts'] },
        { id: 'out', type: 'exit', port: 'out' },
      ],
      edges: [{ from: 'start', to: 'out' }],
      links: [],
    },
    {
      id: 'account',
      title: 'Account',
      status: 'drifted',
      entries: ['start'],
      exits: ['done'],
      steps: [
        { id: 'start', type: 'action', label: 'Land in account', status: 'drifted' },
        { id: 'done', type: 'exit', port: 'done' },
      ],
      edges: [{ from: 'start', to: 'done' }],
      links: [],
    },
  ],
  notes: [
    { id: 'n1', journey: 'signup', step: 'save', text: 'tighten the button copy', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'n2', journey: 'account', text: 'journey-level note', status: 'applied', createdAt: '2026-01-01T00:00:00.000Z' },
  ],
};
