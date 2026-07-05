import * as React from 'react';
import { Ic } from '../icons';
import { css } from '../ui';

export interface TransportProps {
  narration: string;
  stepLabel: string;
  pct: number;
  cont: { label: string; onClick: () => void } | null;
  atStart: boolean;
  atEnd: boolean;
  isNarrow: boolean;
  detailOpen: boolean;
  step: (dir: number) => void;
  toggleDetail: () => void;
}

const navBtn = (disabled: boolean): React.CSSProperties => ({ width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inset)', color: disabled ? 'var(--mute)' : 'var(--dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' });

export function Transport(props: TransportProps) {
  const { narration, stepLabel, pct, cont, atStart, atEnd, isNarrow, detailOpen, step, toggleDetail } = props;
  const detailToggle = (
    <button
      data-tip={detailOpen ? 'Hide step detail' : 'Show step detail'}
      data-tip-pos="up"
      onClick={() => toggleDetail()}
      style={{ ...css('border-radius:7px;border:1px solid var(--border);background:var(--inset);color:var(--dim);display:flex;align-items:center;justify-content:center;'), flex: '0 0 auto', marginLeft: 'auto', width: isNarrow ? 36 : 30, height: isNarrow ? 36 : 30 }}
    >{detailOpen ? <Ic n="chevron-down" size={isNarrow ? 19 : 16} /> : <Ic n="chevron-up" size={isNarrow ? 19 : 16} />}</button>
  );
  const navGroup = (
    <div style={css('display:flex;align-items:center;gap:6px;flex:0 0 auto;')}>
      <button data-tip="Previous step" data-tip-pos="up" data-tip-align="left" onClick={() => step(-1)} style={navBtn(atStart)}><Ic n="chevron-left" size={16} /></button>
      <button data-tip="Next step" data-tip-pos="up" data-tip-align="left" onClick={() => step(1)} style={navBtn(atEnd)}><Ic n="chevron-right" size={16} /></button>
    </div>
  );
  const stepChip = <div style={css("flex:0 0 auto;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);width:48px;")}>{stepLabel}</div>;
  const progress = (grow: boolean) => (
    <div style={{ ...css('height:4px;border-radius:3px;background:var(--inset);overflow:hidden;'), flex: grow ? '1 1 auto' : '0 0 120px' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 220ms ease' }}></div>
    </div>
  );
  // block=true → full-width own-row button (phone: no horizontal squeeze, so no clipping)
  const contChip = (block: boolean) => cont && (
    <button onClick={cont.onClick} style={{ ...css('border-radius:7px;border:1px solid var(--accent);background:var(--accentSoft);color:var(--accent);font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;animation:slideUp 220ms ease;'), ...(block ? { width: '100%', minHeight: 38, padding: '8px 13px', lineHeight: 1.3, textAlign: 'center' as const } : { height: 32, padding: '0 13px', flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>{cont.label}</button>
  );
  return isNarrow ? (
    // phone: controls row (chevron pinned right), then narration row — canvas keeps its space
    <div style={{ ...css('display:flex;flex-direction:column;gap:10px;'), padding: '12px 12px calc(14px + env(safe-area-inset-bottom))' }}>
      <div style={css('display:flex;align-items:center;gap:10px;')}>
        {navGroup}{stepChip}{progress(true)}{detailToggle}
      </div>
      <div style={{ ...css('font-size:12.5px;color:var(--fg);line-height:1.4;'), display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{narration}</div>
      {contChip(true)}
    </div>
  ) : (
    <div style={css('min-height:56px;display:flex;align-items:center;gap:14px;padding:9px 16px;')}>
      {navGroup}{stepChip}{progress(false)}
      <div style={css('flex:1 1 auto;min-width:0;font-size:12.5px;color:var(--fg);line-height:1.45;')}>{narration}</div>
      {contChip(false)}{detailToggle}
    </div>
  );
}
