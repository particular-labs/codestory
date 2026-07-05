import { serve } from '@hono/node-server';
import { defineCommand } from 'citty';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendNote, clearNotes, deleteNote, setNoteStatus } from './notes';
import { validateDir } from './validate';
import { watchDir, type DirWatcher } from './watch';

const VIEWER_DIST = resolve(fileURLToPath(import.meta.url), '..', '..', 'viewer', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Read a file into a Response with a best-effort Content-Type (node:fs, no Bun). */
function fileResponse(path: string): Response {
  const type = MIME[extname(path)] ?? 'application/octet-stream';
  const headers: Record<string, string> = { 'content-type': type };
  // html must never be cached: it references hash-named bundles, and a cached
  // shell keeps serving yesterday's app after a rebuild (assets stay cacheable)
  if (type.startsWith('text/html')) headers['cache-control'] = 'no-store';
  return new Response(readFileSync(path), { headers });
}

/** Hono app: GET /api/journeys + static viewer bundle with SPA fallback. */
export function buildApp(codestoryDir: string, distDir: string = VIEWER_DIST): Hono {
  const app = new Hono();
  let watcher: DirWatcher | null = null; // created lazily on the first /api/events client

  app.get('/api/journeys', async (c) => {
    // re-read on every request: agent edits JSON, browser refresh shows it
    const r = await validateDir(codestoryDir);
    return c.json({ manifest: r.manifest, journeys: r.journeys, issues: r.issues, notes: r.notes });
  });

  // Annotations. One boring endpoint dispatches on body shape:
  //   { clear: true }        → remove every note
  //   { id, delete: true }   → remove one note
  //   { id, status }         → flip an existing note's status
  //   { journey, step?, text } → append a new note (journeys stay read-only)
  app.post('/api/notes', async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { id?: string; status?: string; delete?: boolean; clear?: boolean; journey?: string; step?: string; text?: string }
      | null;
    if (!body) return c.json({ error: 'invalid JSON body' }, 400);

    if (body.clear === true) {
      return c.json({ cleared: clearNotes(codestoryDir) });
    }

    if (typeof body.id === 'string') {
      if (body.delete === true) {
        const removed = deleteNote(codestoryDir, body.id);
        if (!removed) return c.json({ error: `no note with id '${body.id}'` }, 404);
        return c.json(removed);
      }
      if (body.status !== 'open' && body.status !== 'applied') return c.json({ error: 'status must be open|applied' }, 400);
      const updated = setNoteStatus(codestoryDir, body.id, body.status);
      if (!updated) return c.json({ error: `no note with id '${body.id}'` }, 404);
      return c.json(updated);
    }

    const { journey, step, text } = body;
    if (typeof journey !== 'string' || !journey) return c.json({ error: 'journey is required' }, 400);
    if (typeof text !== 'string' || !text.trim()) return c.json({ error: 'text is required' }, 400);
    if (step !== undefined && typeof step !== 'string') return c.json({ error: 'step must be a string' }, 400);

    // validate ids against the loaded journeys — never write a note that dangles
    const { journeys } = await validateDir(codestoryDir);
    const target = journeys.find((b) => b.id === journey);
    if (!target) return c.json({ error: `unknown journey '${journey}'` }, 400);
    if (step && !target.steps.some((s) => s.id === step)) return c.json({ error: `unknown step '${step}' on journey '${journey}'` }, 400);

    const note = appendNote(codestoryDir, { journey, ...(step ? { step } : {}), text });
    return c.json(note);
  });

  // Live reload: SSE stream, one shared directory watcher created on first client.
  app.get('/api/events', (c) => {
    watcher ??= watchDir(codestoryDir);
    const w = watcher;
    return streamSSE(c, async (stream) => {
      const unsub = w.subscribe(() => { void stream.writeSSE({ event: 'reload', data: '1' }); });
      stream.onAbort(unsub);
      await stream.writeSSE({ event: 'ready', data: '1' });
      while (!stream.aborted) await stream.sleep(30_000);
      unsub();
    });
  });

  app.get('*', (c) => {
    const index = join(distDir, 'index.html');
    if (!existsSync(index)) {
      return c.html(
        '<h1>codestory viewer bundle not found</h1><p>Run <code>bun run build:viewer</code> in the codestory repo, then restart <code>codestory present</code>.</p>',
        200,
      );
    }
    // hand-rolled static handler: root must be absolute (serveStatic resolves
    // relative to the consumer repo's cwd), plus path-traversal guard + SPA fallback
    const rel = normalize(decodeURIComponent(new URL(c.req.url).pathname)).replace(/^([/\\]|\.\.)+/, '');
    const path = join(distDir, rel);
    if (rel && path.startsWith(distDir) && existsSync(path) && statSync(path).isFile()) {
      return fileResponse(path);
    }
    return fileResponse(index);
  });

  return app;
}

export const presentCommand = defineCommand({
  meta: { name: 'present', description: 'Serve the viewer + journey data locally and open the browser' },
  args: {
    dir: { type: 'string', description: 'Path to the .codestory directory', default: '.codestory' },
    port: { type: 'string', description: 'Port to listen on', default: '4747' },
    host: { type: 'string', description: 'Bind address. Default loopback; pass 0.0.0.0 to view from other devices on your network (serves repo flow data — trusted networks only)', default: '127.0.0.1' },
    'no-open': { type: 'boolean', description: 'Do not open the browser', default: false },
  },
  async run({ args }) {
    const dir = resolve(args.dir);
    const r = await validateDir(dir);
    for (const issue of r.issues) console.error(`⚠ ${issue.file}: ${issue.message}`);
    const port = Number(args.port);
    // loopback by default — this serves repo internals; --host is an explicit opt-in
    serve({ fetch: buildApp(dir).fetch, port, hostname: args.host });
    const url = `http://localhost:${port}`;
    console.log(`codestory present → ${url}  (${r.journeys.length} journeys)`);
    if (args.host !== '127.0.0.1') console.log(`  bound to ${args.host} — reachable from your network`);
    if (!args['no-open']) openBrowser(url);
  },
});

/** Open the default browser without blocking, cross-platform (node:child_process). */
function openBrowser(url: string): void {
  const [cmd, cmdArgs] =
    process.platform === 'darwin'
      ? (['open', [url]] as const)
      : process.platform === 'win32'
        ? (['cmd', ['/c', 'start', '', url]] as const)
        : (['xdg-open', [url]] as const);
  const child = spawn(cmd, [...cmdArgs], { detached: true, stdio: 'ignore' });
  child.unref();
}
