// Pure canvas framing: given the rects of everything on the canvas, how far to
// shift so nothing sits at negative coords — the scroll container can't scroll past
// 0, so a node dragged left/up would otherwise vanish under the rail, unreachable.
// Shifting pins it at the canvas edge instead and the reported extent grows the
// canvas so the rest stays horizontally/vertically scrollable.
export interface Rectish { x: number; y: number; w: number; h: number }

export function frameOffset(rects: Rectish[]): { dx: number; dy: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  for (const r of rects) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  if (!isFinite(minX)) return { dx: 0, dy: 0, w: 0, h: 0 };
  const dx = Math.max(0, -minX), dy = Math.max(0, -minY);
  return { dx, dy, w: maxX + dx, h: maxY + dy };
}
