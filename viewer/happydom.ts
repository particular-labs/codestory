// bun test preload: register a DOM, then stub the two browser APIs App touches on
// mount (A2 in assumptions.md) so `<App/>` mounts headless. Order matters — the DOM
// must exist before react-dom is imported by any test.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// React 19 + Testing Library: mark this as an act() environment so state updates in
// componentDidMount flush deterministically instead of warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// matchMedia: happy-dom ships one, but pin it to a known default (not-narrow) so
// snapshots are deterministic. Tests that need the narrow branch override this.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() { return false; },
})) as typeof window.matchMedia;

// EventSource: happy-dom has none; App opens one for SSE live-reload on mount.
if (!('EventSource' in globalThis)) {
  (globalThis as unknown as { EventSource: unknown }).EventSource = class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    onmessage: unknown = null;
    onerror: unknown = null;
  };
}
