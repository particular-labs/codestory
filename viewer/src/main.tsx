import { createRoot } from 'react-dom/client';
import { App, type ApiData } from './app';

const root = createRoot(document.getElementById('root')!);

// design props (Appearance/Layout) exposed as URL params:
// ?theme=light&accent=%233ecf8e&flow=vertical
const P = new URLSearchParams(location.search);
const props = {
  defaultTheme: (P.get('theme') === 'light' ? 'light' : 'dark') as 'dark' | 'light',
  accent: P.get('accent') ?? '',
  flowDirection: (P.get('flow') === 'vertical' ? 'vertical' : 'horizontal') as 'horizontal' | 'vertical',
};

fetch('/api/boards')
  .then((r) => {
    if (!r.ok) throw new Error(`GET /api/boards → ${r.status}`);
    return r.json() as Promise<ApiData>;
  })
  .then((data) => root.render(<App data={data} {...props} />))
  .catch((e) => root.render(
    <pre style={{ padding: 24, fontFamily: 'monospace' }}>
      failed to load boards: {String(e)}{'\n'}is `codestory present` running?
    </pre>,
  ));
