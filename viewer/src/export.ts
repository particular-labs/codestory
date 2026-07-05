// PNG export composition. The live canvas has no header, no background grid, and
// scrolls — so a raw capture is off-centre and bare (see the user's report). This
// module measures the true step bounding box, clones the canvas into an off-screen
// wrapper with symmetric padding + optional header/background/legend, and rasterizes
// that. Pure summary/opts logic lives in ./export-meta (unit-tested); this file is
// the thin DOM adapter.
import { toPng } from 'html-to-image';
import type { ExportMeta, ExportOpts } from './export-meta';

export * from './export-meta';

const PAD = 46; // outer frame padding — the "centralized" breathing room
const MARGIN = 38; // inner slack around the step bbox (covers curved edges + label chips)

/** Union bounding box of the canvas's export-step elements, in canvas-local px.
 *  Edges are excluded (they span the full canvas and would defeat the crop). */
function contentBox(canvas: HTMLElement, includeGhosts: boolean): { x: number; y: number; w: number; h: number } {
  const cb = canvas.getBoundingClientRect();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of canvas.querySelectorAll<HTMLElement>('[data-export-step]')) {
    if (!includeGhosts && el.hasAttribute('data-ghost')) continue;
    const r = el.getBoundingClientRect();
    minX = Math.min(minX, r.left - cb.left);
    minY = Math.min(minY, r.top - cb.top);
    maxX = Math.max(maxX, r.right - cb.left);
    maxY = Math.max(maxY, r.bottom - cb.top);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: canvas.offsetWidth, h: canvas.offsetHeight };
  return { x: minX - MARGIN, y: minY - MARGIN, w: maxX - minX + MARGIN * 2, h: maxY - minY + MARGIN * 2 };
}

function el(tag: string, cssText: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = cssText;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Compose an off-screen framed clone of the canvas and rasterize it to a PNG data URL. */
export async function composeExportPng(
  canvas: HTMLElement,
  vars: Record<string, string>,
  meta: ExportMeta,
  opts: ExportOpts,
): Promise<string> {
  const box = contentBox(canvas, opts.ghosts);

  // on-screen at 0,0 but behind the app (z-index:-1) — html-to-image renders blank
  // for elements parked far off-screen (left:-99999px), so occlude instead of hide.
  const root = el('div', `box-sizing:border-box;position:fixed;left:0;top:0;z-index:-1;pointer-events:none;width:${box.w + PAD * 2}px;padding:${PAD}px;background:${vars.bg};color:${vars.fg};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;`);
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty('--' + k, v));
  if (opts.background) {
    root.style.backgroundImage = `radial-gradient(${vars.grid} 1px, transparent 1px)`;
    root.style.backgroundSize = '22px 22px';
  }

  if (opts.title || (opts.description && meta.subtitle)) {
    const head = el('div', 'margin-bottom:24px;');
    if (opts.title) head.appendChild(el('div', `font-size:23px;font-weight:700;letter-spacing:-0.02em;color:${vars.fg};`, meta.title));
    if (opts.description && meta.subtitle) head.appendChild(el('div', `font-size:13px;color:${vars.dim};margin-top:6px;`, meta.subtitle));
    root.appendChild(head);
  }

  // crop window: clone offset so the bbox sits flush at the window's top-left
  const win = el('div', `position:relative;width:${box.w}px;height:${box.h}px;overflow:hidden;`);
  const clone = canvas.cloneNode(true) as HTMLElement;
  clone.style.position = 'absolute';
  clone.style.left = `${-box.x}px`;
  clone.style.top = `${-box.y}px`;
  clone.style.margin = '0';
  if (!opts.ghosts) clone.querySelectorAll('[data-ghost]').forEach((e) => e.remove());
  win.appendChild(clone);
  root.appendChild(win);

  if (opts.legend) {
    const leg = el('div', `margin-top:22px;display:flex;align-items:center;gap:16px;font-size:12px;color:${vars.mute};`);
    leg.appendChild(el('span', `color:${vars.dim};font-weight:600;`, meta.legend));
    for (const s of ['planned', 'built', 'drifted'] as const) {
      const item = el('span', 'display:flex;align-items:center;gap:5px;', s);
      item.insertBefore(el('span', `width:8px;height:8px;border-radius:50%;background:${vars[s]};flex:0 0 auto;`), item.firstChild);
      leg.appendChild(item);
    }
    root.appendChild(leg);
  }

  document.body.appendChild(root);
  try {
    return await toPng(root, { pixelRatio: 2, backgroundColor: vars.bg });
  } finally {
    root.remove();
  }
}
