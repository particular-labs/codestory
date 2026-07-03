import { createRoot } from 'react-dom/client';
import { App, type ApiData } from './app';
import { loadSetting } from './settings';

const root = createRoot(document.getElementById('root')!);

// theme + flow are persisted settings; a URL param (?theme=light&flow=vertical)
// overrides for the visit without overwriting the saved preference
const P = new URLSearchParams(location.search);
const props = {
  defaultTheme: loadSetting('theme', P.get('theme'), ['dark', 'light'], 'dark') as 'dark' | 'light',
  accent: P.get('accent') ?? '',
  flowDirection: loadSetting('flow', P.get('flow'), ['horizontal', 'vertical'], 'horizontal') as 'horizontal' | 'vertical',
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
