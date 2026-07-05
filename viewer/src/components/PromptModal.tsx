import * as React from 'react';
import { css, mono } from '../ui';

export interface PromptModalProps {
  promptText: string;
  clearPrompt: () => void;
}

export function PromptModal(props: PromptModalProps) {
  const { promptText, clearPrompt } = props;
  return (
    <div onPointerDown={() => clearPrompt()} style={css('position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--overlay);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);')}>
      <div onPointerDown={(e) => e.stopPropagation()} style={css('width:560px;max-width:90vw;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:20px;display:flex;flex-direction:column;gap:12px;')}>
        <div style={css('font-size:14px;font-weight:650;letter-spacing:-0.01em;')}>Copy prompt manually</div>
        <div style={css('font-size:12px;color:var(--dim);line-height:1.5;')}>Clipboard access was blocked — select all and copy the block below.</div>
        <textarea
          readOnly
          autoFocus
          value={promptText}
          onFocus={(e) => e.currentTarget.select()}
          style={{ width: '100%', height: 260, resize: 'vertical', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inset)', color: 'var(--fg)', padding: 12, fontSize: 12, fontFamily: mono, outline: 'none' }}
        />
        <div style={css('display:flex;justify-content:flex-end;')}>
          <button onClick={() => clearPrompt()} style={css('height:30px;padding:0 14px;border-radius:7px;border:1px solid var(--accent);background:var(--accent);color:var(--accentFg);font-size:12.5px;font-weight:600;cursor:pointer;')}>Done</button>
        </div>
      </div>
    </div>
  );
}
