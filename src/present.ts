import { defineCommand } from 'citty';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDir } from './validate';

const VIEWER_DIST = resolve(fileURLToPath(import.meta.url), '..', '..', 'viewer', 'dist');

/** Hono app: GET /api/boards + static viewer bundle with SPA fallback. */
export function buildApp(codestoryDir: string, distDir: string = VIEWER_DIST): Hono {
  const app = new Hono();

  app.get('/api/boards', async (c) => {
    // re-read on every request: agent edits JSON, browser refresh shows it
    const r = await validateDir(codestoryDir);
    return c.json({ manifest: r.manifest, boards: r.boards, issues: r.issues });
  });

  app.get('*', async (c) => {
    const index = join(distDir, 'index.html');
    if (!existsSync(index)) {
      return c.html(
        '<h1>codestory viewer bundle not found</h1><p>Run <code>bun run build:viewer</code> in the codestory repo, then restart <code>codestory present</code>.</p>',
        200,
      );
    }
    // hand-rolled static handler: root must be absolute (hono/bun serveStatic
    // resolves relative to the consumer repo's cwd), plus SPA fallback
    const rel = normalize(decodeURIComponent(new URL(c.req.url).pathname)).replace(/^([/\\]|\.\.)+/, '');
    const path = join(distDir, rel);
    if (rel && path.startsWith(distDir)) {
      const file = Bun.file(path);
      if (await file.exists()) return new Response(file);
    }
    return new Response(Bun.file(index));
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
    Bun.serve({ port, hostname: '127.0.0.1', fetch: buildApp(dir).fetch });
    const url = `http://localhost:${port}`;
    console.log(`codestory present → ${url}  (${r.boards.length} boards)`);
    if (!args['no-open']) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      Bun.spawn([opener, url], { stdout: 'ignore', stderr: 'ignore' });
    }
  },
});
