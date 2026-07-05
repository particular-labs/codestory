import * as React from 'react';
import type { ApiNote } from '../app';
import type { Graph } from '../graph';
import { Ic } from '../icons';
import { css, statusPill, stepTitle } from '../ui';

export interface NotesHubProps {
  notes: ApiNote[];
  byId: Graph['byId'];
  openCount: number;
  copied: boolean;
  isNarrow: boolean;
  goToNote: (n: ApiNote) => void;
  applyNote: (id: string) => void;
  deleteNote: (id: string) => void;
  copyPrompt: () => void;
  clearNotes: () => void;
}

export function NotesHub(props: NotesHubProps) {
  const { notes, byId, openCount, copied, isNarrow, goToNote, applyNote, deleteNote, copyPrompt, clearNotes } = props;
  return (
    <div style={{ ...css('position:absolute;top:58px;z-index:30;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow);animation:slideUp 180ms ease;'), right: 12, left: isNarrow ? 12 : 'auto', width: isNarrow ? 'auto' : 340, maxHeight: isNarrow ? '60vh' : '70vh' }}>
      <div style={css('padding:12px 14px 10px;border-bottom:1px solid var(--border);')}>
        <div style={css('font-size:12.5px;font-weight:650;letter-spacing:-0.01em;')}>Notes</div>
        <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>Click any step on a journey to leave a change-note.</div>
      </div>
      <div style={css('flex:1 1 auto;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;')}>
        {notes.length === 0 && (
          <div style={css('padding:14px 6px;font-size:11.5px;color:var(--mute);text-align:center;')}>No notes yet.</div>
        )}
        {notes.map((n) => {
          const nb = byId.get(n.journey);
          const nn = n.step ? nb?.steps.find((x) => x.id === n.step) : undefined;
          const applied = n.status === 'applied';
          return (
            <div key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inset)', opacity: applied ? 0.55 : 1 }}>
              <div style={css('display:flex;align-items:center;gap:7px;')}>
                <button onClick={() => goToNote(n)} title="Go to step" style={css("border:none;background:none;padding:0;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;")}>{nb?.title ?? n.journey}{nn ? ` › ${stepTitle(nn)}` : ''}</button>
                <span style={{ ...statusPill(applied ? 'built' : 'drifted'), marginLeft: 'auto', flex: '0 0 auto' }}>{n.status}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--fg)', textDecoration: applied ? 'line-through' : 'none' }}>{n.text}</div>
              <div style={css('display:flex;gap:6px;justify-content:flex-end;')}>
                {!applied && (
                  <button onClick={() => applyNote(n.id)} title="Mark applied" style={css('height:22px;padding:0 8px;border-radius:5px;border:1px solid var(--built);background:transparent;color:var(--built);font-size:10.5px;font-weight:600;cursor:pointer;')}>✓ applied</button>
                )}
                <button onClick={() => deleteNote(n.id)} data-tip="Delete note" data-tip-pos="up" style={css('height:22px;padding:0 8px;border-radius:5px;border:1px solid var(--borderStrong);background:transparent;color:var(--dim);font-size:10.5px;font-weight:600;cursor:pointer;')}><Ic n="trash" size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {notes.length > 0 && (
        <div style={css('padding:10px 12px;border-top:1px solid var(--border);display:flex;gap:8px;')}>
          {openCount > 0 && (
            <button onClick={() => void copyPrompt()} style={css('flex:1 1 auto;height:30px;border-radius:7px;border:1px solid var(--accent);background:var(--accentSoft);color:var(--accent);font-size:11.5px;font-weight:600;cursor:pointer;')}>{copied ? '✓ Copied' : `⧉ Copy ${openCount} as prompt`}</button>
          )}
          <button onClick={() => clearNotes()} title="Delete all notes" style={css('flex:0 0 auto;height:30px;padding:0 11px;border-radius:7px;border:1px solid var(--borderStrong);background:var(--inset);color:var(--dim);font-size:11.5px;font-weight:600;cursor:pointer;')}>Clear all</button>
        </div>
      )}
    </div>
  );
}
