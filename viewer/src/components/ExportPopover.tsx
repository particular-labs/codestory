import * as React from 'react';
import { EXPORT_TOGGLES, type ExportOpts } from '../export';
import { Ic } from '../icons';
import { css } from '../ui';

export interface ExportPopoverProps {
  exportOpts: ExportOpts;
  isNarrow: boolean;
  toggleExportOpt: (key: keyof ExportOpts) => void;
  exportPng: () => void;
}

export function ExportPopover(props: ExportPopoverProps) {
  const { exportOpts, isNarrow, toggleExportOpt, exportPng } = props;
  return (
    <div style={{ ...css('position:absolute;top:58px;z-index:30;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow);animation:slideUp 180ms ease;'), right: 12, left: isNarrow ? 12 : 'auto', width: isNarrow ? 'auto' : 280 }}>
      <div style={css('padding:12px 14px 10px;border-bottom:1px solid var(--border);')}>
        <div style={css('font-size:12.5px;font-weight:650;letter-spacing:-0.01em;')}>Export PNG</div>
        <div style={css('font-size:10.5px;color:var(--mute);margin-top:2px;')}>Choose what to include.</div>
      </div>
      <div style={css('padding:8px 10px;display:flex;flex-direction:column;gap:2px;')}>
        {EXPORT_TOGGLES.map(({ key, label }) => {
          const on = exportOpts[key];
          return (
            <button key={key} onClick={() => toggleExportOpt(key)} style={css('display:flex;align-items:center;gap:9px;padding:7px 8px;border:none;background:none;border-radius:7px;cursor:pointer;text-align:left;color:var(--fg);')}>
              <span style={{ flex: '0 0 auto', width: 16, height: 16, borderRadius: 5, border: `1px solid ${on ? 'var(--accent)' : 'var(--borderStrong)'}`, background: on ? 'var(--accent)' : 'transparent', color: 'var(--accentFg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Ic n="check" size={11} />}</span>
              <span style={css('font-size:12.5px;')}>{label}</span>
            </button>
          );
        })}
      </div>
      <div style={css('padding:10px 12px;border-top:1px solid var(--border);')}>
        <button onClick={() => void exportPng()} style={css('width:100%;height:32px;border-radius:7px;border:1px solid var(--accent);background:var(--accent);color:var(--accentFg);font-size:12px;font-weight:650;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;')}><Ic n="download" size={14} />Export PNG</button>
      </div>
    </div>
  );
}
