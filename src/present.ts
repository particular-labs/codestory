import { serve } from '@hono/node-server';
import { defineCommand } from 'citty';
import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDir } from './validate';

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
  return new Response(readFileSync(path), { headers: { 'content-type': type } });
}

/** Hono app: GET /api/boards + static viewer bundle with SPA fallback. */
export function buildApp(codestoryDir: string, distDir: string = VIEWER_DIST): Hono {
  const app = new Hono();

  app.get('/api/boards', async (c) => {
    // re-read on every request: agent edits JSON, browser refresh shows it
    const r = await validateDir(codestoryDir);
    return c.json({ manifest: r.manifest, boards: r.boards, issues: r.issues });
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
  meta: { name: 'present', description: 'Serve the viewer + board data locally and open the browser' },
  args: {
    dir: { type: 'string', description: 'Path to the .codestory directory', default: '.codestory' },
    port: { type: 'string', description: 'Port to listen on', default: '4747' },
    'no-open': { type: 'boolean', description: 'Do not open the browser', default: false },
  },
  async run({ args }) {
    const dir = resolve(args.dir);
    const r = await validateDir(dir);
    for (const issue of r.issues) console.error(`⚠ ${issue.file}: ${issue.message}`);
    const port = Number(args.port);
    // loopback only — this serves repo internals; LAN exposure is share-layer (v2) scope
    serve({ fetch: buildApp(dir).fetch, port, hostname: '127.0.0.1' });
    const url = `http://localhost:${port}`;
    console.log(`codestory present → ${url}  (${r.boards.length} boards)`);
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
