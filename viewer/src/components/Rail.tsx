import * as React from 'react';
import type { Graph } from '../graph';
import { Ic } from '../icons';
import { css } from '../ui';

export interface RailPersona {
  id: string;
  label: string;
  count: string;
  onClick: () => void;
  dotStyle: React.CSSProperties;
  style: React.CSSProperties;
}

export interface RailJourney {
  id: string;
  inJ: boolean;
  badge: string;
  badgeStyle: React.CSSProperties;
}

/** Everything railRow needs, threaded explicitly so the recursion stays pure. */
interface RailRowCtx {
  byId: Graph['byId'];
  subsByJourney: Graph['subsByJourney'];
  railOpen: Record<string, boolean>;
  toggleRail: (path: string) => void;
  enterPath: (ids: string[]) => void;
  closeDrawer: () => void;
  curEntryId: string | null;
  pathSep: string;
  countBadge: React.CSSProperties;
}

// one rail row + its sub-flow children, recursively; `visited` holds the
// ancestor chain so a cyclic sub-flow reference can never recurse forever
function railRow(ctx: RailRowCtx, id: string, path: string, inJ: boolean, badge: string, badgeStyle: React.CSSProperties, visited: Set<string>): React.ReactNode {
  const b = ctx.byId.get(id);
  if (!b) return null;
  const subs = (ctx.subsByJourney.get(id) ?? []).filter((s) => !visited.has(s));
  const open = ctx.railOpen[path] ?? true; // expanded by default — visible sub-flows are what makes the rail self-explanatory
  const active = ctx.curEntryId === id; // highlight the journey being viewed, not the stack root
  return (
    <div key={path} style={css('display:flex;flex-direction:column;gap:2px;')}>
      <div style={css('display:flex;align-items:center;gap:0;')}>
        <button
          onClick={() => ctx.toggleRail(path)}
          data-tip={subs.length ? (open ? 'Collapse sub-flows' : 'Show sub-flows') : undefined} data-tip-align="left"
          style={{ flex: '0 0 auto', width: 20, height: 28, border: 'none', background: 'none', color: 'var(--dim)', fontSize: 16, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: subs.length ? 'pointer' : 'default', visibility: subs.length ? 'visible' : 'hidden' }}
        >{open ? <Ic n="chevron-down" size={14} /> : <Ic n="chevron-right" size={14} />}</button>
        <button onClick={() => { ctx.enterPath(path.split(ctx.pathSep)); ctx.closeDrawer(); }} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '1 1 auto', minWidth: 0, padding: '7px 10px 7px 4px', borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accentSoft)' : 'transparent', color: 'var(--fg)', opacity: inJ ? 1 : 0.45, cursor: 'pointer' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${b.status})`, flex: '0 0 auto', opacity: inJ ? 1 : 0.4 }}></span>
          <span style={css('font-size:12.5px;font-weight:500;flex:1 1 auto;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{b.title}</span>
          <span style={badgeStyle}>{badge}</span>
        </button>
      </div>
      {open && subs.length > 0 && (
        <div style={css('margin-left:11px;padding-left:8px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:2px;')}>
          {subs.map((s) => railRow(ctx, s, `${path}${ctx.pathSep}${s}`, inJ, `${ctx.byId.get(s)?.steps.length ?? 0}`, ctx.countBadge, new Set([...visited, s])))}
        </div>
      )}
    </div>
  );
}

export interface RailProps {
  railStyle: React.CSSProperties;
  personaList: RailPersona[];
  railJourneys: RailJourney[];
  jJourneys: string[] | null;
  personaTitle: string | undefined;
  isMap: boolean;
  hasPersona: boolean;
  rootLabel: string;
  railHint: React.ReactNode;
  countBadge: React.CSSProperties;
  goCrumb: (k: number) => void;
  closeDrawer: () => void;
  // railRow context
  byId: Graph['byId'];
  subsByJourney: Graph['subsByJourney'];
  railOpen: Record<string, boolean>;
  toggleRail: (path: string) => void;
  enterPath: (ids: string[]) => void;
  curEntryId: string | null;
  pathSep: string;
}

export function Rail(props: RailProps) {
  const {
    railStyle, personaList, railJourneys, jJourneys, personaTitle, isMap, hasPersona,
    rootLabel, railHint, countBadge, goCrumb, closeDrawer,
    byId, subsByJourney, railOpen, toggleRail, enterPath, curEntryId, pathSep,
  } = props;
  const ctx: RailRowCtx = { byId, subsByJourney, railOpen, toggleRail, enterPath, closeDrawer, curEntryId, pathSep, countBadge };
  return (
    <div style={railStyle}>
      <div>
        <div style={css('padding:0 4px 9px;')}>
          <div style={css('font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);')}>Personas</div>
          <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>Lens · reorders the journeys</div>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:4px;')}>
          {personaList.map((j) => (
            <button key={j.id} onClick={j.onClick} style={j.style}>
              <span style={css('display:flex;align-items:center;gap:9px;')}>
                <span style={j.dotStyle}></span>
                <span style={css('font-size:13px;font-weight:550;')}>{j.label}</span>
              </span>
              <span style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);")}>{j.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={css('padding:0 4px 9px;')}>
          <div style={css('font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);')}>{jJourneys ? `${personaTitle} path` : 'Journeys'}</div>
          <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>{jJourneys ? 'Steps in this persona’s flow' : 'Open a journey to inspect'}</div>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:2px;')}>
          {/* Root is "selected" only when it's truly the whole map — view=map AND no persona lens; one active thing at a time */}
          <button onClick={() => { goCrumb(0); closeDrawer(); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 9px', borderRadius: 8, border: `1px solid ${isMap && !hasPersona ? 'var(--accent)' : 'var(--border)'}`, background: isMap && !hasPersona ? 'var(--accentSoft)' : 'var(--inset)', color: 'var(--fg)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <span style={css('display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;background:var(--accentSoft);color:var(--accent);font-size:11px;flex:0 0 auto;')}>⊞</span>
            <span style={css('flex:1 1 auto;text-align:left;')}>{rootLabel}</span>
            <span style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--mute);")}>{isMap && !hasPersona ? 'here' : 'root'}</span>
          </button>
          <div style={css('margin-left:9px;padding-left:2px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:2px;')}>
            {railJourneys.map((b) => railRow(ctx, b.id, b.id, b.inJ, b.badge, b.badgeStyle, new Set([b.id])))}
          </div>
        </div>
      </div>

      <div style={css('margin-top:auto;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--inset);font-size:11.5px;line-height:1.5;color:var(--dim);')}>{railHint}</div>
    </div>
  );
}
