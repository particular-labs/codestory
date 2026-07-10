import { defineCommand } from 'citty';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDir, type ValidationIssue } from './validate';

// Same shipped bundle `present` serves — resolved off this module's location so it
// points at the packaged `viewer/dist`, not the consumer repo's cwd (mirrors present.ts).
const VIEWER_DIST = resolve(fileURLToPath(import.meta.url), '..', '..', 'viewer', 'dist');

/**
 * Insert `<script>window.__CODESTORY_DATA__ = {json}</script>` immediately BEFORE
 * the viewer's bundle script tag, so the global is defined before the app boots.
 * EVERY `<` in the payload is escaped to `<` (a valid escape inside a JSON
 * string literal, so JSON.parse restores it). Escaping only `</script` is not enough:
 * a payload like `<!--<script` flips the HTML parser into "double-escaped script"
 * state, after which our `</script>` no longer closes the tag — the injected script
 * becomes a syntax error and the following bundle `<script src>` is swallowed (blank
 * page). Killing every `<` removes all `<`-based tokenizer transitions at once.
 */
export function injectData(html: string, data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
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

  // A rebuild must not leave stale files from a previous run merged in. If `out` is a
  // prior build artifact (has an index.html) wipe it first; if it's a non-empty dir that
  // ISN'T ours, refuse rather than clobber it — guards against an accidental `-o src`.
  if (existsSync(out)) {
    if (existsSync(join(out, 'index.html'))) {
      rmSync(out, { recursive: true, force: true });
    } else if (readdirSync(out).length > 0) {
      return {
        ok: false,
        issues: [{ file: out, message: 'output directory is not empty and is not a codestory build (no index.html) — refusing to overwrite; choose an empty or new directory' }],
        outDir: out,
      };
    }
  }

  mkdirSync(out, { recursive: true });
  cpSync(dist, out, { recursive: true });

  const data = { manifest: r.manifest, journeys: r.journeys, issues: r.issues, notes: r.notes };
  const indexPath = join(out, 'index.html');
  writeFileSync(indexPath, injectData(readFileSync(indexPath, 'utf8'), data));

  return { ok: true, issues: [], outDir: out };
}

/**
 * Best-effort one-line hint nudging consumers to gitignore the build output so it
 * doesn't pollute their `git status`. Returns null (no hint) when the repo's
 * .gitignore already covers the dir, when `out` sits outside `cwd`, or on any error —
 * a courtesy tip must never break or fail a successful build.
 */
export function gitignoreTip(out: string, cwd: string = process.cwd()): string | null {
  try {
    const rel = relative(cwd, out);
    if (!rel || rel.startsWith('..')) return null; // nothing sensible to suggest
    const gi = join(cwd, '.gitignore');
    if (existsSync(gi) && readFileSync(gi, 'utf8').includes(rel)) return null; // already covered
    return `tip: add ${rel}/ to .gitignore`;
  } catch {
    return null;
  }
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
    const tip = gitignoreTip(r.outDir);
    if (tip) console.log(tip);
  },
});
