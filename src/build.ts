import { defineCommand } from 'citty';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDir, type ValidationIssue } from './validate';

// Same shipped bundle `present` serves — resolved off this module's location so it
// points at the packaged `viewer/dist`, not the consumer repo's cwd (mirrors present.ts).
const VIEWER_DIST = resolve(fileURLToPath(import.meta.url), '..', '..', 'viewer', 'dist');

/**
 * Insert `<script>window.__CODESTORY_DATA__ = {json}</script>` immediately BEFORE
 * the viewer's bundle script tag, so the global is defined before the app boots.
 * `</script` sequences in the payload are escaped to `<\/script` — otherwise a note
 * (or any content) containing a literal closing tag would terminate our script early.
 */
export function injectData(html: string, data: unknown): string {
  const json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
  const tag = `<script>window.__CODESTORY_DATA__ = ${json}</script>`;
  const i = html.search(/<script\b/i); // computed on the original html, before splicing
  if (i === -1) return html.replace(/<\/body>/i, `${tag}</body>`); // no bundle tag → drop it before </body>
  return html.slice(0, i) + tag + html.slice(i);
}

export interface BuildResult {
  ok: boolean;
  issues: ValidationIssue[];
  outDir: string;
}

/**
 * Validate `.codestory/` exactly like `present`, then (only on success) copy the
 * shipped viewer bundle into `out` and inject the loaded data into its index.html.
 * On validation failure nothing is written and `ok:false` is returned with the issues.
 */
export async function buildStatic(opts: { dir: string; out: string; dist?: string }): Promise<BuildResult> {
  const dist = opts.dist ?? VIEWER_DIST;
  const out = resolve(opts.out);
  const r = await validateDir(opts.dir);
  if (!r.ok) return { ok: false, issues: r.issues, outDir: out };

  if (!existsSync(join(dist, 'index.html'))) {
    return {
      ok: false,
      issues: [{ file: dist, message: 'viewer bundle not found — run `bun run build:viewer` in the codestory repo' }],
      outDir: out,
    };
  }

  mkdirSync(out, { recursive: true });
  cpSync(dist, out, { recursive: true });

  const data = { manifest: r.manifest, journeys: r.journeys, issues: r.issues, notes: r.notes };
  const indexPath = join(out, 'index.html');
  writeFileSync(indexPath, injectData(readFileSync(indexPath, 'utf8'), data));

  return { ok: true, issues: [], outDir: out };
}

export const buildCommand = defineCommand({
  meta: { name: 'build', description: 'Export a static, self-contained viewer (no server) to a directory' },
  args: {
    dir: { type: 'string', description: 'Path to the .codestory directory', default: '.codestory' },
    out: { type: 'string', alias: 'o', description: 'Output directory', default: 'codestory-dist' },
  },
  async run({ args }) {
    const dir = resolve(args.dir);
    const r = await buildStatic({ dir, out: resolve(args.out) });
    if (!r.ok) {
      for (const issue of r.issues) console.error(`✗ ${issue.file}\n  ${issue.message}`);
      console.error(`\ncodestory build: ${r.issues.length} issue(s)`);
      process.exit(1);
    }
    console.log(`✓ static viewer → ${r.outDir}`);
  },
});
