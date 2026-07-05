import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { App, type AppProps } from './app';
import { FIXTURE } from './parity.fixture';

// Shared DOM-test harness. parity/navigation/drag predate this and each inline
// their own copy; new tests import from here instead of re-duplicating the seed.
const BASE: Omit<AppProps, 'data'> = { defaultTheme: 'dark', accent: '', flowDirection: 'horizontal' };

/** afterEach body: drop persisted exportOpts (settings.ts) + unmount, so test order can't leak. */
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
