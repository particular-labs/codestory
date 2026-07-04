import { createRoot } from 'react-dom/client';
import { App, type ApiData } from './app';
import { loadSettings, resolvePref } from './settings';

const root = createRoot(document.getElementById('root')!);

// theme + flow are persisted preferences; a URL param (?theme=light&flow=vertical)
// overrides for the visit without overwriting the saved value. flow resolves to
// null when unchosen so the App can pick its context default (narrow → vertical).
const P = new URLSearchParams(location.search);
const s = loadSettings();
const props = {
  defaultTheme: resolvePref(P.get('theme'), s.theme, ['dark', 'light'] as const, 'dark')!,
  accent: P.get('accent') ?? '',
  flowDirection: resolvePref(P.get('flow'), s.flow, ['horizontal', 'vertical'] as const, null),
};

fetch('/api/journeys')
  .then((r) => {
    if (!r.ok) throw new Error(`GET /api/journeys → ${r.status}`);
    return r.json() as Promise<ApiData>;
  })
  .then((data) => root.render(<App data={data} {...props} />))
  .catch((e) => root.render(
    <pre style={{ padding: 24, fontFamily: 'monospace' }}>
      failed to load journeys: {String(e)}{'\n'}is `codestory present` running?
    </pre>,
  ));
