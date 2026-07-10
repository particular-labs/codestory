import { afterEach, expect, test } from 'bun:test';
import { mountApp, resetApp } from './harness';

// The static-export contract (codestory build): when window.__CODESTORY_DATA__ is
// present the viewer must render from it with NO network — never fetch /api/journeys
// and never open the SSE live-reload EventSource (there is no server behind the export).
// When the global is absent the live path is untouched (EventSource still opens), which
// is what the byte-identical parity snapshots already assert for the render output.

const G = window as unknown as { __CODESTORY_DATA__?: unknown; EventSource: unknown; fetch: typeof fetch };

function spyNetwork() {
  const realES = G.EventSource;
  const realFetch = G.fetch;
  let esCount = 0;
  let fetchCount = 0;
  class FakeES {
    constructor() { esCount++; }
    addEventListener() {}
    close() {}
  }
  G.EventSource = FakeES as unknown as typeof EventSource;
  G.fetch = (() => { fetchCount++; return Promise.resolve(new Response('{}')); }) as unknown as typeof fetch;
  return {
    esCount: () => esCount,
    fetchCount: () => fetchCount,
    restore() { G.EventSource = realES; G.fetch = realFetch; },
  };
}

let spy: ReturnType<typeof spyNetwork> | null = null;
afterEach(() => {
  spy?.restore();
  spy = null;
  delete G.__CODESTORY_DATA__;
  resetApp();
});

test('with __CODESTORY_DATA__ set: renders journeys, opens no EventSource and no fetch', () => {
  G.__CODESTORY_DATA__ = {}; // presence is the signal; App still gets data via props
  spy = spyNetwork();
  const { container } = mountApp('/');
  expect(container.innerHTML).toContain('Signup'); // rendered from the seeded FIXTURE prop
  expect(spy.esCount()).toBe(0); // no live-reload stream in a static export
  expect(spy.fetchCount()).toBe(0); // no network at all
});

test('without the global: the live path still opens the SSE stream', () => {
  spy = spyNetwork();
  mountApp('/');
  expect(spy.esCount()).toBe(1); // `present` behavior untouched
});
