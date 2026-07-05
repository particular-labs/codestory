import * as React from 'react';
import { deriveGraph } from './graph';
import type { AppStoreApi } from './store';

// ── card drag (click vs drag disambiguated by a 3px threshold) ──
// Pointer Events so mouse, touch, and pen all work: tap = select/open, drag =
// move. setPointerCapture keeps the gesture bound to the card even if the finger
// slides off it; captured events still bubble to the window listeners below.
//
// Holds NO React state (closure locals + the store), identical to the old class
// `startDrag`. `store.getState()` is read FRESH inside move/up so a drag decided
// long after pointerdown sees current state — notesOpen and the displayed journey
// at pointerup-time, never a stale render closure. The journey is re-derived from
// the store's CURRENT data (not a render-time `d`) so a mid-gesture SSE refetch is
// honoured, matching the old class's `this.curJourney()` reading live.

/** Returns a stable `startDrag(kind, id, key, baseX, baseY, e)`. */
export function useCardDrag(store: AppStoreApi) {
  return React.useCallback(
    (kind: 'map' | 'step', id: string, key: string, baseX: number, baseY: number, e: React.PointerEvent) => {
      if (e.button !== 0) return; // primary button / primary touch only
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY, pointerId = e.pointerId;
      const target = e.currentTarget as HTMLElement;
      try { target.setPointerCapture(pointerId); } catch { /* capture unsupported — window listeners still work */ }
      let moved = false;
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        if (!moved) return;
        // no lower clamp — a step must be draggable left/up too, not pinned at the
        // canvas origin (the old Math.max(0,…) stopped any leftward move dead at x=0)
        const p = { x: baseX + dx, y: baseY + dy };
        if (kind === 'map') store.getState().setMapPos(key, p);
        else store.getState().setStepPos(key, p);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        try { target.releasePointerCapture(pointerId); } catch { /* already released */ }
        if (moved) return;
        if (kind === 'map') { store.getState().enterJourney(id); return; }
        store.getState().selectNode(id);
        // notes hub open = annotate mode: a click also opens the note editor for this step.
        // read FRESH state (post-selectNode) and re-derive the displayed journey from the
        // store's current data — a mid-gesture SSE refetch must not annotate a stale journey.
        const s = store.getState();
        const entry = s.stack[s.stack.length - 1];
        const journey = entry ? deriveGraph(s.data).byId.get(s.variantSel[entry.id] ?? entry.id) ?? null : null;
        if (s.notesOpen && journey) s.openNotePopover(journey.id, id);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [store],
  );
}
