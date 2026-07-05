import * as React from 'react';
import type { ApiJourney } from '../app';
import { Ic } from '../icons';
import { css, statusMeta, statusPill } from '../ui';

export interface VersionsPickerProps {
  versions: ApiJourney[];
  journey: ApiJourney | null;
  journeyId: string;
  baseEntryId: string;
  isNarrow: boolean;
  versionsOpen: boolean;
  setVariant: (baseId: string, journeyId: string) => void;
  openVersions: () => void;
  closeVersions: () => void;
}

export function VersionsPicker(props: VersionsPickerProps) {
  const { versions, journey, journeyId, baseEntryId, isNarrow, versionsOpen, setVariant, openVersions, closeVersions } = props;
  return (
    <>
      {isNarrow && !versionsOpen && (
        <button
          onClick={() => openVersions()}
          style={css('position:absolute;right:12px;top:12px;z-index:8;height:32px;padding:0 11px;border-radius:8px;border:1px solid var(--accent);background:var(--surface);color:var(--accent);font-size:12px;font-weight:600;display:flex;align-items:center;gap:7px;box-shadow:var(--shadow);')}
        ><Ic n="branch" size={13} /> {journey?.variantOf ? journey.variantLabel ?? journey.id : 'Current'} <Ic n="chevron-down" size={13} /></button>
      )}
      {(!isNarrow || versionsOpen) && (
        <div style={{ ...css('position:absolute;top:14px;z-index:8;display:flex;flex-direction:column;gap:7px;padding:11px 13px;border:1px solid var(--border);border-radius:10px;background:var(--surface);box-shadow:var(--shadow);overflow-y:auto;animation:slideUp 200ms ease;'), right: 14, left: isNarrow ? 12 : 'auto', maxHeight: isNarrow ? '45vh' : 'none' }}>
          <div style={css('display:flex;align-items:center;')}>
            <div style={css('font-size:9.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--mute);')}>Versions</div>
            {isNarrow && (
              <button onClick={() => closeVersions()} style={css('margin-left:auto;width:26px;height:26px;border:none;background:none;color:var(--dim);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;')}><Ic n="x" size={15} /></button>
            )}
          </div>
          {versions.map((v) => (
            <label key={v.id} style={css('display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--fg);cursor:pointer;')}>
              <input
                type="radio"
                name="cs-version"
                checked={journeyId === v.id}
                onChange={() => setVariant(baseEntryId, v.id)}
                style={{ accentColor: 'var(--accent)', margin: 0, cursor: 'pointer' }}
              />
              <span style={css('font-weight:550;')}>{v.variantOf ? v.variantLabel ?? v.id : 'Current'}</span>
              <span style={{ ...statusPill(v.status), marginLeft: 'auto' }}>{statusMeta(v.status).label}</span>
            </label>
          ))}
          <div style={css('font-size:10px;color:var(--mute);border-top:1px solid var(--border);padding-top:7px;margin-top:2px;')}>ghosts = other versions · <b style={css('color:var(--accent);font-weight:600;')}>+ new / Δ</b> vs current</div>
        </div>
      )}
    </>
  );
}
