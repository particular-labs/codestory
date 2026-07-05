import * as React from 'react';
import { Ic } from '../icons';
import { css } from '../ui';

export interface HeaderCrumb {
  label: string;
  onClick: () => void;
  style: React.CSSProperties;
}

export interface HeaderProps {
  isNarrow: boolean;
  isMap: boolean;
  isJourney: boolean;
  vertical: boolean;
  project: string | undefined;
  issues: Array<{ file: string; message: string }>;
  query: string;
  setQuery: (q: string) => void;
  crumbs: HeaderCrumb[];
  notesOpen: boolean;
  toggleNotes: () => void;
  openNotesCount: number;
  toggleFlow: () => void;
  linkCopied: boolean;
  copyLink: () => void;
  exportOpen: boolean;
  toggleExport: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  toggleDrawer: () => void;
}

export function Header(props: HeaderProps) {
  const {
    isNarrow, isMap, isJourney, vertical, project, issues, query, setQuery, crumbs,
    notesOpen, toggleNotes, openNotesCount, toggleFlow, linkCopied, copyLink,
    exportOpen, toggleExport, theme, toggleTheme, toggleDrawer,
  } = props;
  return (
    <div style={{ ...css('height:52px;flex:0 0 auto;display:flex;align-items:center;border-bottom:1px solid var(--border);background:var(--surface);z-index:20;'), gap: isNarrow ? 8 : 16, padding: isNarrow ? '0 10px' : '0 16px' }}>
      {isNarrow && (
        <button data-tip="Menu" data-tip-align="left" onClick={() => toggleDrawer()} style={css('width:30px;height:30px;flex:0 0 auto;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:15px;display:flex;align-items:center;justify-content:center;')}><Ic n="menu" size={17} /></button>
      )}
      <div style={{ ...css('display:flex;align-items:center;gap:9px;'), flex: '0 0 auto' }}>
        <div style={css('width:15px;height:15px;border-radius:4px;background:var(--accent);box-shadow:0 0 0 3px var(--accentSoft);')}></div>
        <span style={css('font-size:14px;font-weight:650;letter-spacing:-0.01em;')}>codestory</span>
        {!isNarrow && (
          <span style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);background:var(--inset);border:1px solid var(--border);padding:2px 7px;border-radius:5px;")}>{project ?? 'codestory present'}</span>
        )}
        {!isNarrow && issues.length > 0 && (
          <span title={issues.map((i) => `${i.file}: ${i.message}`).join('\n')} style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--drifted);border:1px solid var(--drifted);padding:2px 7px;border-radius:5px;cursor:help;")}>⚠ {issues.length} validate issue(s) — journeys may be missing</span>
        )}
      </div>

      <div style={css('flex:1 1 auto;min-width:0;display:flex;justify-content:center;overflow:hidden;')}>
        {isMap && (
          <div style={{ ...css('position:relative;'), width: isNarrow ? '100%' : 320, maxWidth: isNarrow ? '100%' : '42vw' }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search journeys & steps" style={{ ...css('width:100%;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--fg);padding:0 10px 0 28px;outline:none;'), fontSize: isNarrow ? 16 : 12.5 }} />
            <span style={css('position:absolute;left:9px;top:7px;color:var(--mute);font-size:13px;')}>⌕</span>
          </div>
        )}
        {isJourney && (
          <div style={css('display:flex;align-items:center;gap:2px;font-size:12.5px;min-width:0;overflow:hidden;white-space:nowrap;')}>
            {crumbs.map((c, i) => <button key={i} onClick={c.onClick} style={c.style}>{c.label}</button>)}
          </div>
        )}
      </div>

      <div style={{ ...css('display:flex;align-items:center;gap:8px;'), flex: '0 0 auto' }}>
        {!isNarrow && (
          <div style={css('display:flex;align-items:center;gap:12px;font-size:10.5px;color:var(--mute);margin-right:2px;')}>
            <span style={css('display:flex;align-items:center;gap:5px;')}><span style={css('width:7px;height:7px;border-radius:50%;background:var(--planned);')}></span>planned</span>
            <span style={css('display:flex;align-items:center;gap:5px;')}><span style={css('width:7px;height:7px;border-radius:50%;background:var(--built);')}></span>built</span>
            <span style={css('display:flex;align-items:center;gap:5px;')}><span style={css('width:7px;height:7px;border-radius:50%;background:var(--drifted);')}></span>drifted</span>
          </div>
        )}
        <button data-tip={notesOpen ? 'Notes hub open — click a step to note it' : 'Notes — annotate steps, copy as prompt'} onClick={() => toggleNotes()} style={{ position: 'relative', width: 30, height: 30, borderRadius: 7, border: `1px solid ${notesOpen ? 'var(--accent)' : 'var(--border)'}`, background: notesOpen ? 'var(--accentSoft)' : 'var(--inset)', color: notesOpen ? 'var(--accent)' : 'var(--dim)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ic n="pencil" size={15} />
          {openNotesCount > 0 && (
            <span style={css("position:absolute;top:-5px;right:-5px;min-width:14px;height:14px;border-radius:7px;background:var(--accent);color:var(--accentFg);font-size:9px;font-weight:700;line-height:14px;text-align:center;padding:0 3px;font-family:'JetBrains Mono',monospace;")}>{openNotesCount}</span>
          )}
        </button>
        <button data-tip={vertical ? 'Flow: vertical — switch to horizontal' : 'Flow: horizontal — switch to vertical'} onClick={() => toggleFlow()} style={css('width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:13px;display:flex;align-items:center;justify-content:center;')}>{vertical ? <Ic n="arrows-ud" size={15} /> : <Ic n="arrows-lr" size={15} />}</button>
        <button data-tip={linkCopied ? 'Link copied' : 'Copy link to this view'} onClick={() => void copyLink()} style={css('width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:13px;display:flex;align-items:center;justify-content:center;')}><Ic n={linkCopied ? 'check' : 'link'} size={15} /></button>
        <button data-tip="Export view as PNG" onClick={() => toggleExport()} style={{ position: 'relative', width: 30, height: 30, borderRadius: 7, border: `1px solid ${exportOpen ? 'var(--accent)' : 'var(--border)'}`, background: exportOpen ? 'var(--accentSoft)' : 'var(--inset)', color: exportOpen ? 'var(--accent)' : 'var(--dim)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="download" size={15} /></button>
        <button data-tip={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => toggleTheme()} style={css('width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);font-size:13px;display:flex;align-items:center;justify-content:center;')}>{theme === 'dark' ? <Ic n="sun" size={15} /> : <Ic n="moon" size={15} />}</button>
      </div>
    </div>
  );
}
