import * as React from 'react';
import type { ApiStep, Status } from '../app';
import { css, statusMeta, statusPill, stepKind, stepTitle, TYPE_TEXT } from '../ui';

export interface DetailPanelProps {
  selNode: ApiStep;
  selStatus: Status;
  isNarrow: boolean;
  chk: (i: number) => boolean;
}

export function DetailPanel(props: DetailPanelProps) {
  const { selNode, selStatus, isNarrow, chk } = props;
  return (
    <div style={{ ...css('border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:14px 34px;overflow-y:auto;animation:panelUp 200ms ease;'), padding: isNarrow ? '20px 16px calc(28px + env(safe-area-inset-bottom))' : '16px 18px', maxHeight: isNarrow ? '50vh' : 236 }}>
      <div style={css('flex:0 0 auto;max-width:280px;display:flex;flex-direction:column;')}>
        <div style={css('display:flex;align-items:center;gap:9px;')}>
          <span style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.06em;color:var(--mute);")}>{TYPE_TEXT[stepKind(selNode)]}</span>
          <span style={statusPill(selStatus)}>{statusMeta(selStatus).label}</span>
        </div>
        <div style={css('font-size:16px;font-weight:650;letter-spacing:-0.01em;margin-top:8px;')}>{stepTitle(selNode)}</div>
        <div style={css('font-size:12px;color:var(--dim);line-height:1.5;margin-top:6px;')}>{selNode.note ?? ''}</div>
      </div>

      {(selNode.refs?.length ?? 0) > 0 && (
        <div style={css('flex:0 0 auto;')}>
          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;')}>Code refs</div>
          <div style={css('display:flex;flex-direction:column;gap:5px;')}>
            {selNode.refs!.map((r, i) => (
              <span key={i} style={css("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg);background:var(--inset);border:1px solid var(--border);border-radius:5px;padding:4px 8px;")}>{r}</span>
            ))}
          </div>
        </div>
      )}

      {selNode.contract && (
        <div style={css('flex:0 0 auto;')}>
          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;')}>Contract</div>
          <div style={css("display:flex;flex-direction:column;gap:6px;font-family:'JetBrains Mono',monospace;font-size:11px;")}>
            <div style={css('display:flex;gap:8px;')}><span style={css('color:var(--mute);width:30px;flex:0 0 auto;')}>in</span><span style={css('color:var(--fg);')}>{selNode.contract.in ?? '—'}</span></div>
            <div style={css('display:flex;gap:8px;')}><span style={css('color:var(--mute);width:30px;flex:0 0 auto;')}>out</span><span style={css('color:var(--fg);')}>{selNode.contract.out ?? '—'}</span></div>
          </div>
        </div>
      )}

      {(selNode.acceptance?.length ?? 0) > 0 && (
        <div style={css('flex:0 0 auto;')}>
          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;')}>Acceptance</div>
          <div style={css('display:flex;flex-direction:column;gap:6px;')}>
            {selNode.acceptance!.map((a, i) => {
              const on = chk(i);
              return (
                <div key={i} style={css('display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.4;')}>
                  <span style={{ flex: '0 0 auto', width: 15, height: 15, borderRadius: 4, border: `1px solid ${on ? 'var(--built)' : 'var(--borderStrong)'}`, background: on ? 'var(--built)' : 'transparent', color: '#fff', fontSize: 10, lineHeight: '13px', textAlign: 'center', marginTop: 1 }}>{on ? '✓' : ''}</span>
                  <span style={{ color: on ? 'var(--fg)' : 'var(--dim)' }}>{a}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selNode.ticket && (
        <div style={css('flex:0 0 auto;')}>
          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;')}>Ticket</div>
          <span style={css("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);background:var(--accentSoft);border:1px solid var(--accent);border-radius:5px;padding:4px 9px;")}>{selNode.ticket}</span>
        </div>
      )}

    </div>
  );
}
