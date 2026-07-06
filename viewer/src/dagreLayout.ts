// ── @dagrejs/dagre layout adapter (the viewer's sole graph layout engine) ──
// app.tsx's `layout()` wrapper calls this for every graph (chain map + journeys).
// Returns the `Layout` shape the render path (rects → style.left/top + edgesSvg)
// consumes directly.
//
// Coordinate convention:
//   • pos[id] is the box TOP-LEFT (dagre reports node CENTER, so we subtract w/2, h/2).
//   • w/h are the full canvas dims INCLUDING padding on both sides (dagre marginx/marginy
//     are applied to both edges → x-pad always 32, y-pad always 28).
//   • vertical → top→bottom flow → rankdir 'TB'; horizontal → left→right → 'LR'.

import dagre from '@dagrejs/dagre';

// layout shapes (kept structurally identical to app.tsx's, not imported, so this
// file has no back-dependency on app.tsx).
interface LayoutGaps { main: number; cross: number }
interface SizedBox { id: string; w: number; h: number }
interface Layout { pos: Record<string, { x: number; y: number }>; w: number; h: number }

// outer padding baked into the canvas dims. dagre applies marginx/marginy to BOTH
// sides, so x-pad is always 32 and y-pad always 28 in both orientations.
const PADX = 32, PADY = 28;

// dagre's bundled graphlib stores nodes in a plain object keyed by id, so a user-
// authored id that collides with an Object.prototype key (`constructor`,
// `__proto__`, `hasOwnProperty`, `toString`, …) throws "Attempted to assign to
// readonly property" or silently pollutes the prototype. Since ids come from
// `.codestory/*.journey.json`, we map every id through a UNIFORM prefix before
// handing it to graphlib and strip it when reading positions back. The prefix can
// never equal an Object.prototype key, so `KEY_PREFIX + id` is always a safe
// own-property name; applying the SAME transform to every id leaves dagre's
// node-ordering (and therefore the resulting layout) byte-identical.
const KEY_PREFIX = 'n:';
const enc = (id: string): string => KEY_PREFIX + id;

export function dagreLayout(boxes: SizedBox[], edges: Array<[string, string]>, vertical: boolean, g: LayoutGaps): Layout {
  // empty guard: bare padding, no nodes (w = PADX*2, h = PADY*2).
  if (!boxes.length) return { pos: {}, w: PADX * 2, h: PADY * 2 };

  const ids = new Set(boxes.map((n) => n.id));
  const graph = new dagre.graphlib.Graph({ directed: true });
  graph.setGraph({
    // gaps are CLEARANCE between boxes (same meaning as Sugiyama's g.main/g.cross):
    // ranksep = along-flow gap between ranks; nodesep = cross-axis gap within a rank.
    rankdir: vertical ? 'TB' : 'LR',
    nodesep: g.cross,
    ranksep: g.main,
    marginx: PADX,
    marginy: PADY,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  // prefix every id (see KEY_PREFIX) so graphlib never keys its node object by a
  // reserved Object.prototype name; the uniform transform keeps ordering identical.
  boxes.forEach((n) => graph.setNode(enc(n.id), { width: n.w, height: n.h }));
  // skip self-loops and any endpoint not in the box set.
  edges.forEach(([a, b]) => { if (ids.has(a) && ids.has(b) && a !== b) graph.setEdge(enc(a), enc(b)); });

  dagre.layout(graph);

  // null-prototype map: keying by a raw id like `__proto__` on a plain `{}` would
  // reassign the object's prototype (an accessor, not a data slot) instead of
  // storing the node, dropping it from Object.keys/spread. Object.create(null) makes
  // every id — reserved or not — a plain own property.
  const pos: Layout['pos'] = Object.create(null);
  boxes.forEach((n) => {
    const nd = graph.node(enc(n.id)) as { x: number; y: number; width: number; height: number };
    // dagre reports CENTER; our pos convention is TOP-LEFT → convert.
    pos[n.id] = { x: nd.x - nd.width / 2, y: nd.y - nd.height / 2 };
  });

  const gl = graph.graph() as { width?: number; height?: number };
  return { pos, w: gl.width ?? PADX * 2, h: gl.height ?? PADY * 2 };
}
