import * as React from 'react';
import type { ApiJourney, ApiStep, Status } from '../app';
import type { Graph } from '../graph';
import { css } from '../ui';
import { DetailPanel } from './DetailPanel';
import { Transport } from './Transport';
import { VersionsPicker } from './VersionsPicker';

interface Rect { x: number; y: number; w: number; h: number }

export interface JourneyStepCard {
  id: string;
  title: string;
  typeText: string;
  glyph: string;
  isSubflow: boolean;
  subJourney: string | undefined;
  diff: 'new' | 'changed' | null;
  noteCount: number;
  dotStyle: React.CSSProperties;
  style: React.CSSProperties;
  onPointerDown: (e: React.PointerEvent) => void;
}

export interface GhostCard {
  id: string;
  title: string;
  typeText: string;
  glyph: string;
  style: React.CSSProperties;
}

export interface JourneyCanvasProps {
  // lens overlay
  lensBlocked: boolean;
  personaTitle: string | undefined;
  jJourneys: string[] | null;
  byId: Graph['byId'];
  enterJourney: (id: string) => void;
  clearPersona: () => void;
  // versions picker
  hasVariants: boolean;
  versions: ApiJourney[];
  journey: ApiJourney | null;
  journeyId: string;
  baseEntryId: string;
  isNarrow: boolean;
  versionsOpen: boolean;
  setVariant: (baseId: string, journeyId: string) => void;
  openVersions: () => void;
  closeVersions: () => void;
  // canvas
  journeyTitle: string | undefined;
  journeyPorts: string;
  journeyDims: { w: number; h: number };
  vertical: boolean;
  canvasRef: React.Ref<HTMLDivElement>;
  ghostEdgesEl: React.ReactNode;
  journeyEdgesEl: React.ReactNode;
  ghostCards: GhostCard[];
  journeySteps: JourneyStepCard[];
  stepInto: (subId: string, callerNode: string) => void;
  // note popover
  notePopover: { journey: string; step: string } | null;
  noteDraft: string;
  journeyRects: Record<string, Rect>;
  saveNote: (journey: string, step: string, text: string) => void;
  setNoteDraft: (text: string) => void;
  closeNotePopover: () => void;
  cancelNote: () => void;
  // bottom bar
  narration: string;
  stepLabel: string;
  pct: number;
  cont: { label: string; onClick: () => void } | null;
  atStart: boolean;
  atEnd: boolean;
  detailOpen: boolean;
  step: (dir: number) => void;
  toggleDetail: () => void;
  detailShown: boolean;
  selNode: ApiStep | undefined;
  selStatus: Status;
  chk: (i: number) => boolean;
}

export function JourneyCanvas(props: JourneyCanvasProps) {
  const {
    lensBlocked, personaTitle, jJourneys, byId, enterJourney, clearPersona,
    hasVariants, versions, journey, journeyId, baseEntryId, isNarrow, versionsOpen, setVariant, openVersions, closeVersions,
    journeyTitle, journeyPorts, journeyDims, vertical, canvasRef, ghostEdgesEl, journeyEdgesEl, ghostCards, journeySteps, stepInto,
    notePopover, noteDraft, journeyRects, saveNote, setNoteDraft, closeNotePopover, cancelNote,
    narration, stepLabel, pct, cont, atStart, atEnd, detailOpen, step, toggleDetail, detailShown, selNode, selStatus, chk,
  } = props;
  return (
    <div style={css('flex:1 1 auto;display:flex;flex-direction:column;min-height:0;position:relative;animation:fadeZoom 220ms ease;')}>
      {lensBlocked && (
        <div style={css('position:absolute;inset:0;z-index:14;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--overlay);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:panelUp 200ms ease;')}>
          <div style={css('max-width:400px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:26px 26px 22px;')}>
            <div style={css('width:34px;height:34px;border-radius:9px;background:var(--accentSoft);border:1px solid var(--accent);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:15px;margin:0 auto 14px;')}>⦻</div>
            <div style={css('font-size:15.5px;font-weight:650;letter-spacing:-0.01em;')}>Not on the {personaTitle} path</div>
            <div style={css('font-size:12.5px;color:var(--dim);line-height:1.55;margin-top:8px;')}>The <b style={css('color:var(--fg);font-weight:600;')}>{personaTitle}</b> lens doesn’t pass through <b style={css('color:var(--fg);font-weight:600;')}>{journeyTitle}</b>. Pick a journey this persona actually uses:</div>
            <div style={css('display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px;')}>
              {(jJourneys ?? []).map((id, i) => (
                <button key={id} onClick={() => enterJourney(id)} style={css('display:flex;align-items:center;gap:8px;height:34px;padding:0 13px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:var(--accentFg);font-size:12.5px;font-weight:600;cursor:pointer;')}>
                  <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;opacity:0.85;")}>{i + 1}</span>{byId.get(id)?.title ?? id}
                </button>
              ))}
            </div>
            <button onClick={() => clearPersona()} style={css('margin-top:16px;border:none;background:none;color:var(--mute);font-size:11.5px;cursor:pointer;text-decoration:underline;text-underline-offset:2px;')}>Clear lens instead</button>
          </div>
        </div>
      )}
      {hasVariants && (
        <VersionsPicker
          versions={versions}
          journey={journey}
          journeyId={journeyId}
          baseEntryId={baseEntryId}
          isNarrow={isNarrow}
          versionsOpen={versionsOpen}
          setVariant={setVariant}
          openVersions={openVersions}
          closeVersions={closeVersions}
        />
      )}
      <div style={css('flex:1 1 auto;position:relative;overflow:auto;background:var(--bg);background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:22px 22px;')}>
        <div style={css('position:absolute;left:16px;top:14px;z-index:5;')}>
          <div style={css('font-size:17px;font-weight:650;letter-spacing:-0.015em;')}>{journeyTitle}</div>
          <div style={css('font-size:12px;color:var(--dim);margin-top:2px;')}>{journeyPorts}</div>
        </div>
        <div ref={canvasRef} style={{ position: 'relative', width: journeyDims.w, height: journeyDims.h, margin: vertical ? '64px auto 40px' : '64px 40px 40px' }}>
          {ghostEdgesEl}
          <div style={css('position:absolute;left:0;top:0;')}>{journeyEdgesEl}</div>
          {ghostCards.map((g) => (
            <div key={'ghost-' + g.id} data-export-step data-ghost style={g.style}>
              <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px;')}>
                <span style={css("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.06em;color:var(--mute);")}>{g.glyph}{g.typeText}</span>
              </div>
              <div style={css('font-size:13px;font-weight:600;letter-spacing:-0.01em;line-height:1.25;margin-top:5px;')}>{g.title}</div>
            </div>
          ))}
          {journeySteps.map((n) => (
            <div key={n.id} data-export-step onPointerDown={n.onPointerDown} style={n.style}>
              <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px;')}>
                <span style={css("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.06em;color:var(--mute);display:flex;align-items:center;gap:5px;")}>{n.glyph}{n.typeText}</span>
                <span style={css('display:flex;align-items:center;gap:5px;')}>
                  {n.noteCount > 0 && (
                    <span title={`${n.noteCount} open note${n.noteCount > 1 ? 's' : ''}`} style={css("font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:700;color:var(--accentFg);background:var(--accent);border-radius:9px;min-width:14px;height:14px;padding:0 4px;display:flex;align-items:center;justify-content:center;")}>✎{n.noteCount}</span>
                  )}
                  {n.diff && (
                    <span style={css("font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:600;color:var(--accent);background:var(--accentSoft);border:1px solid var(--accent);border-radius:4px;padding:1px 5px;")}>{n.diff === 'new' ? '+ new' : 'Δ'}</span>
                  )}
                  <span style={n.dotStyle}></span>
                </span>
              </div>
              <div style={css('font-size:13px;font-weight:600;letter-spacing:-0.01em;line-height:1.25;margin-top:5px;')}>{n.title}</div>
              {n.isSubflow && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); stepInto(n.subJourney!, n.id); }}
                  style={css('margin-top:7px;align-self:flex-start;font-size:10.5px;font-weight:600;color:var(--accent);background:var(--accentSoft);border:1px solid var(--accent);border-radius:5px;padding:2px 8px;display:flex;align-items:center;gap:4px;cursor:pointer;')}
                >Step into ↘</button>
              )}
            </div>
          ))}
          {notePopover && notePopover.journey === journeyId && journeyRects[notePopover.step] && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              style={{ position: 'absolute', left: journeyRects[notePopover.step]!.x, top: journeyRects[notePopover.step]!.y + journeyRects[notePopover.step]!.h + 8, zIndex: 30, width: 244, padding: 12, borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--surface)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 9 }}
            >
              <div style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);")}>Note on {notePopover.step}</div>
              <textarea
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveNote(notePopover.journey, notePopover.step, noteDraft); } if (e.key === 'Escape') closeNotePopover(); }}
                placeholder="What should change here?"
                style={{ width: '100%', minHeight: 68, resize: 'vertical', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inset)', color: 'var(--fg)', padding: '7px 9px', fontSize: isNarrow ? 16 : 12.5, fontFamily: 'inherit', outline: 'none' }}
              />
              <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:7px;')}>
                <button onClick={() => cancelNote()} style={css('height:28px;padding:0 11px;border-radius:6px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:12px;cursor:pointer;')}>Cancel</button>
                <button onClick={() => void saveNote(notePopover.journey, notePopover.step, noteDraft)} disabled={!noteDraft.trim()} style={{ height: 28, padding: '0 13px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accentFg)', fontSize: 12, fontWeight: 600, cursor: noteDraft.trim() ? 'pointer' : 'default', opacity: noteDraft.trim() ? 1 : 0.5 }}>Save</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={css('flex:0 0 auto;border-top:1px solid var(--border);background:var(--surface);z-index:10;')}>
        <Transport
          narration={narration}
          stepLabel={stepLabel}
          pct={pct}
          cont={cont}
          atStart={atStart}
          atEnd={atEnd}
          isNarrow={isNarrow}
          detailOpen={detailOpen}
          step={step}
          toggleDetail={toggleDetail}
        />
        {detailShown && selNode && (
          <DetailPanel selNode={selNode} selStatus={selStatus} isNarrow={isNarrow} chk={chk} />
        )}
      </div>
    </div>
  );
}
