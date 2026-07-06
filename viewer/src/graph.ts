// Pure graph derivations extracted out of the App class (viewer-decompose).
// These are behaviour-preserving lifts of App.d() and two render-local reductions.
// They read ONLY their arguments — no `this`, no state, no caches — so they are
// unit-testable in isolation and are the SSOT for how the journey graph is shaped.
import type { ApiData, ApiJourney, ApiPersona, ApiStep, EdgeTuple, StackEntry } from './app';
import { stepTitle } from './ui';

export interface Graph {
  byId: Map<string, ApiJourney>;
  order: string[];
  chainEdges: EdgeTuple[];
  personas: ApiPersona[];
  variantsByBase: Map<string, ApiJourney[]>;
  subsByJourney: Map<string, string[]>;
}

/** Derive the journey graph (byId / order / chainEdges / variants / subs) from the
 *  current API data. Verbatim body of the old App.d(), minus the memo cache. */
export function deriveGraph(data: ApiData): Graph {
  const { journeys, manifest } = data;
  const byId = new Map(journeys.map((b) => [b.id, b]));
  const variantsByBase = new Map<string, ApiJourney[]>();
  journeys.forEach((b) => {
    if (b.variantOf) variantsByBase.set(b.variantOf, [...(variantsByBase.get(b.variantOf) ?? []), b]);
  });
  // the base-journey graph defines the tree; variants' extra sub refs don't hide journeys
  const bases = journeys.filter((b) => !b.variantOf);
  const subIds = new Set(bases.flatMap((b) => b.steps.map((n) => n.journey)).filter(Boolean) as string[]);
  let order = bases.filter((b) => !subIds.has(b.id)).map((b) => b.id);
  // journey id → its direct sub-flow journey ids (step.journey refs), in step order
  const subsByJourney = new Map<string, string[]>();
  bases.forEach((b) => {
    const subs = b.steps.flatMap((n) => (n.journey ? [n.journey] : [])).filter((s, i, a) => a.indexOf(s) === i);
    if (subs.length) subsByJourney.set(b.id, subs);
  });
  // cycle rescue: a mutually-referencing component has no unreferenced root —
  // surface any base journey unreachable from the roots as a root itself
  {
    const reachable = new Set(order);
    const queue = [...order];
    while (queue.length) {
      for (const s of subsByJourney.get(queue.shift()!) ?? []) {
        if (!reachable.has(s)) { reachable.add(s); queue.push(s); }
      }
    }
    order = [...order, ...bases.filter((b) => !reachable.has(b.id)).map((b) => b.id)];
  }
  const chainEdges: EdgeTuple[] = [];
  for (const b of journeys) {
    for (const l of b.links) {
      if (order.includes(b.id) && order.includes(l.journey)) chainEdges.push([b.id, l.journey, `${l.exit} → ${l.entry}`]);
    }
  }
  // journeys arrive in file order (alphabetical) — re-order along the chain so
  // "JOURNEY n" and the rail read as the movie, not the directory listing
  const indeg = new Map(order.map((id) => [id, 0]));
  chainEdges.forEach(([, to]) => indeg.set(to, (indeg.get(to) ?? 0) + 1));
  const queue = order.filter((id) => indeg.get(id) === 0);
  const sorted: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    sorted.push(u);
    chainEdges.filter(([from]) => from === u).forEach(([, to]) => {
      indeg.set(to, indeg.get(to)! - 1);
      if (indeg.get(to) === 0) queue.push(to);
    });
  }
  order = [...sorted, ...order.filter((id) => !sorted.includes(id))]; // cycles/orphans keep file order
  return { byId, order, chainEdges, personas: manifest?.personas ?? [], variantsByBase, subsByJourney };
}

/** Union the steps + edges of several journey versions (base + variants), deduping
 *  steps by id and edges by `from>to` — first version wins. Verbatim from render. */
export function unionOf(versions: ApiJourney[]): { steps: ApiStep[]; edges: Array<[string, string]> } {
  const steps: ApiStep[] = [];
  const seen = new Set<string>();
  versions.forEach((v) => v.steps.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); steps.push(n); } }));
  const edgeKeys = new Set<string>();
  const edges: Array<[string, string]> = [];
  versions.forEach((v) => v.edges.forEach((e) => {
    const k = `${e.from}>${e.to}`;
    if (!edgeKeys.has(k)) { edgeKeys.add(k); edges.push([e.from, e.to]); }
  }));
  return { steps, edges };
}

/** The set of step ids up to and including the selected step (empty when nothing
 *  is selected). Verbatim from the render `activeSet` line. */
export function activePrefix(steps: ApiStep[], selIndex: number): Set<string> {
  return new Set(steps.slice(0, selIndex < 0 ? 0 : selIndex + 1).map((n) => n.id));
}

/** The continue-affordance shown at an exit step: `return` walks back up the call
 *  stack, `continue` hops to the linked journey. A PURE descriptor of what App's
 *  onClick should do (App reads `kind`/`targetId` and wires returnToParent/hop) —
 *  null when the selected step isn't an exit, or an exit with nowhere to go. */
export type ContinueTarget = { kind: 'return' | 'continue'; label: string; targetId: string };

export function continueTarget(
  steps: ApiStep[],
  selIndex: number,
  journey: ApiJourney | null,
  entry: StackEntry | null,
  graph: Graph,
  variantSel: Record<string, string>,
): ContinueTarget | null {
  const cur = steps[selIndex];
  if (!cur || cur.type !== 'exit' || !journey) return null;
  const displayedId = (baseId: string) => variantSel[baseId] ?? baseId;
  if (entry?.callerJourney && entry.callerNode) {
    const parent = graph.byId.get(displayedId(entry.callerJourney));
    const returnEdge = parent?.edges.find((ed) => ed.from === entry.callerNode);
    const returnNode = parent?.steps.find((n) => n.id === returnEdge?.to);
    return { kind: 'return', label: `Return → ${returnNode ? stepTitle(returnNode) : parent?.title ?? 'parent'}`, targetId: displayedId(entry.callerJourney) };
  }
  const link = journey.links.find((l) => l.exit === cur.port);
  const next = link ? graph.byId.get(link.journey) : null;
  if (next) return { kind: 'continue', label: `Continue → ${next.title}`, targetId: next.id };
  return null;
}
