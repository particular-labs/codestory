import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

export const inter = loadInter().fontFamily;
export const mono = loadMono().fontFamily;

// Palette lifted from the codestory viewer (dark theme)
export const C = {
  bg: '#0a0c11',
  panel: '#14161d',
  border: '#2a2e3a',
  text: '#e8eaf0',
  dim: '#8b90a0',
  indigo: '#6366f1',
  green: '#22c55e',
  amber: '#f59e0b',
  edge: '#454a58',
};

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

// Fades a scene in over its first 10 frames and out over its last 15.
export const Fade: React.FC<{
  dur: number;
  noIn?: boolean;
  noOut?: boolean;
  children: React.ReactNode;
}> = ({dur, noIn, noOut, children}) => {
  const frame = useCurrentFrame();
  const fadeIn = noIn ? 1 : interpolate(frame, [0, 6], [0, 1], clamp);
  const fadeOut = noOut ? 1 : interpolate(frame, [dur - 10, dur - 2], [1, 0], clamp);
  return <AbsoluteFill style={{opacity: fadeIn * fadeOut}}>{children}</AbsoluteFill>;
};

// Centered copy line that fades up into place.
export const Copy: React.FC<{
  text: string;
  delay: number;
  y?: number;
  size?: number;
  dim?: boolean;
}> = ({text, delay, y = 880, size = 46, dim}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, delay, config: {damping: 200}, durationInFrames: 18});
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        textAlign: 'center',
        opacity: s,
        transform: `translateY(${(1 - s) * 22}px)`,
        fontFamily: inter,
        fontSize: size,
        fontWeight: 600,
        color: dim ? C.dim : C.text,
        letterSpacing: '-0.01em',
      }}
    >
      {text}
    </div>
  );
};

// A journey step card in the viewer's visual language.
export const NodeCard: React.FC<{
  title: string;
  delay: number;
  kind?: 'action' | 'decision' | 'exit';
  dot?: string;
  width?: number;
  selected?: boolean;
}> = ({title, delay, kind = 'action', dot = C.green, width = 300, selected}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, delay, config: {damping: 13, stiffness: 200}});
  const o = interpolate(frame, [delay, delay + 8], [0, 1], clamp);
  const border =
    kind === 'decision'
      ? `2px dashed ${C.dim}`
      : selected || kind === 'exit'
        ? `2px solid ${C.indigo}`
        : `1.5px solid ${C.border}`;
  return (
    <div
      style={{
        width,
        padding: '24px 28px',
        borderRadius: 12,
        background: C.panel,
        border,
        transform: `scale(${0.7 + 0.3 * s}) translateY(${(1 - s) * 24}px)`,
        opacity: o,
        position: 'relative',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
      }}
    >
      {kind !== 'action' && (
        <div
          style={{
            fontFamily: mono,
            fontSize: 13,
            letterSpacing: 3,
            color: C.dim,
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          {kind === 'decision' ? '◇ decision' : '▪ exit'}
        </div>
      )}
      <div style={{fontFamily: inter, fontSize: 24, fontWeight: 600, color: C.text}}>
        {title}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 10,
          height: 10,
          borderRadius: 5,
          background: dot,
        }}
      />
    </div>
  );
};

// SVG path that draws itself in.
export const DrawPath: React.FC<{
  d: string;
  delay: number;
  dur?: number;
  color?: string;
  width?: number;
  glow?: boolean;
}> = ({d, delay, dur = 25, color = C.edge, width = 2.5, glow}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + dur], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.quad),
  });
  return (
    <path
      d={d}
      pathLength={1}
      stroke={color}
      strokeWidth={width}
      fill="none"
      strokeDasharray={1}
      strokeDashoffset={1 - p}
      opacity={p === 0 ? 0 : 1}
      style={glow ? {filter: `drop-shadow(0 0 8px ${color})`} : undefined}
    />
  );
};

// Small edge-label pill ("low risk", "approved", …)
export const Chip: React.FC<{label: string; delay: number; x: number; y: number}> = ({
  label,
  delay,
  x,
  y,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, delay, config: {damping: 11, stiffness: 260}});
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `scale(${s})`,
        opacity: s,
        fontFamily: mono,
        fontSize: 14,
        color: C.dim,
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: '5px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{width: 6, height: 6, borderRadius: 3, background: C.dim, display: 'inline-block'}}
      />
      {label}
    </div>
  );
};

// Full-screen kinetic text card — hard cut in with a tight pop (KIVI-style beat)
export const TextCard: React.FC<{lines: string[]; size?: number; kicker?: string}> = ({
  lines,
  size = 112,
  kicker,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 16, stiffness: 340}, durationInFrames: 10});
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', background: C.bg}}>
      <div style={{transform: `scale(${0.94 + 0.06 * pop})`, textAlign: 'center'}}>
        {kicker && (
          <div
            style={{
              fontFamily: mono,
              fontSize: 22,
              letterSpacing: 6,
              color: C.indigo,
              textTransform: 'uppercase',
              marginBottom: 26,
            }}
          >
            {kicker}
          </div>
        )}
        <div
          style={{
            fontFamily: inter,
            fontWeight: 800,
            fontSize: size,
            color: C.text,
            letterSpacing: '-0.03em',
            lineHeight: 1.04,
          }}
        >
          {lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const LogoMark: React.FC<{size?: number}> = ({size = 44}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.24,
      background: `linear-gradient(135deg, ${C.indigo}, #4f46e5)`,
      boxShadow: `0 0 ${size}px rgba(99,102,241,0.35)`,
    }}
  />
);
