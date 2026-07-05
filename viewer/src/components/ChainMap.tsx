import * as React from 'react';
import { css } from '../ui';

export interface MapCard {
  id: string;
  index: string;
  title: string;
  sub: string;
  meta: string;
  statusText: string;
  statusStyle: React.CSSProperties;
  style: React.CSSProperties;
  entryPort: React.CSSProperties;
  exitPort: React.CSSProperties;
  onPointerDown: (e: React.PointerEvent) => void;
}

export interface ChainMapProps {
  mapCards: MapCard[];
  chainEdgesEl: React.ReactNode;
  mapDims: { w: number; h: number };
  vertical: boolean;
  canvasRef: React.Ref<HTMLDivElement>;
}

export function ChainMap(props: ChainMapProps) {
  const { mapCards, chainEdgesEl, mapDims, vertical, canvasRef } = props;
  return (
    <div style={css('flex:1 1 auto;position:relative;overflow:auto;background:var(--bg);background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:22px 22px;animation:fadeZoom 240ms ease;')}>
      <div ref={canvasRef} style={{ position: 'relative', width: mapDims.w, height: mapDims.h, margin: vertical ? '32px auto' : 32 }}>
        <div style={css('position:absolute;left:0;top:0;')}>{chainEdgesEl}</div>
        {mapCards.map((m) => (
          <div key={m.id} data-export-step onPointerDown={m.onPointerDown} style={m.style}>
            <span style={m.entryPort}></span>
            <span style={m.exitPort}></span>
            <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
              <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute);letter-spacing:0.04em;")}>{m.index}</span>
              <span style={m.statusStyle}>{m.statusText}</span>
            </div>
            <div style={css('font-size:15px;font-weight:600;letter-spacing:-0.01em;margin-top:8px;')}>{m.title}</div>
            <div style={css('font-size:11.5px;color:var(--dim);line-height:1.4;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>{m.sub}</div>
            <div style={css("margin-top:auto;display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mute);font-family:'JetBrains Mono',monospace;")}>{m.meta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
