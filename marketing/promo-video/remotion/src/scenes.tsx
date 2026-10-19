import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  Series,
  interpolate,
  interpolateColors,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {C, Chip, Copy, DrawPath, LogoMark, NodeCard, TextCard, inter, mono} from './ui';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// KIVI-style beat map: hard cuts, text cards between demos. 450f = 15s @ 30fps.
export const D = {
  t1: 21, //   0 "Docs drift."
  t2: 21, //  21 "Diagrams rot."
  intro: 36, //  42 Introducing codestory
  f1: 24, //  78 "Living journey maps"
  s3: 84, // 102 journey assembles
  s4: 60, // 186 map chain zoom
  f2: 24, // 246 "Synced by agents"
  s5: 60, // 270 diff → built flip
  f3: 24, // 330 "Step through the flow"
  s6: 60, // 354 viewer float
  end: 36, // 414 end card
};
export const TOTAL = Object.values(D).reduce((a, b) => a + b, 0);

// ————— Introducing card —————
const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 14, stiffness: 260}, durationInFrames: 12});
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', background: C.bg}}>
      <div style={{transform: `scale(${0.9 + 0.1 * pop})`, textAlign: 'center'}}>
        <div
          style={{
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: 6,
            color: C.dim,
            textTransform: 'uppercase',
            marginBottom: 30,
          }}
        >
          Introducing
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 26, justifyContent: 'center'}}>
          <LogoMark size={92} />
          <div
            style={{
              fontFamily: inter,
              fontSize: 128,
              fontWeight: 800,
              color: C.text,
              letterSpacing: '-0.03em',
            }}
          >
            codestory
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ————— Demo: a journey assembles —————
const JourneyDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const orbit = interpolate(frame, [0, D.s3], [3, -1.5]);
  const push = interpolate(frame, [0, D.s3], [1, 1.05]);
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{transform: `perspective(1400px) rotateY(${orbit}deg) scale(${push})`}}
      >
        <svg
          width={1920}
          height={1080}
          style={{position: 'absolute', inset: 0}}
          viewBox="0 0 1920 1080"
        >
          <DrawPath d="M 560 520 L 700 520" delay={8} dur={10} />
          <DrawPath d="M 1030 520 L 1170 520" delay={18} dur={10} />
          <DrawPath d="M 1500 500 C 1580 460, 1640 440, 1710 430" delay={28} dur={10} />
          <DrawPath d="M 1500 540 C 1580 580, 1640 600, 1710 610" delay={32} dur={10} />
        </svg>
        <div style={{position: 'absolute', left: 260, top: 465}}>
          <NodeCard title="Receive request" delay={2} selected />
        </div>
        <div style={{position: 'absolute', left: 700, top: 465}}>
          <NodeCard title="Validate payload" delay={12} />
        </div>
        <div style={{position: 'absolute', left: 1170, top: 450}}>
          <NodeCard title="Needs review?" delay={22} kind="decision" width={330} />
        </div>
        <Chip label="low risk" delay={30} x={1560} y={410} />
        <Chip label="high risk" delay={34} x={1555} y={615} />
      </AbsoluteFill>
      <Copy text="Journeys map your flows, step by step." delay={38} size={40} />
    </AbsoluteFill>
  );
};

// ————— Demo: journeys chain into one map —————
const Mini: React.FC<{x: number; y: number; delay: number; ghost?: boolean}> = ({
  x,
  y,
  delay,
  ghost,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 18], [0, ghost ? 0.35 : 1], clamp);
  return (
    <div
      style={{position: 'absolute', left: x, top: y, opacity: o, display: 'flex', alignItems: 'center'}}
    >
      {[0, 1, 2].map((i) => (
        <React.Fragment key={i}>
          {i > 0 && <div style={{width: 26, height: 2, background: C.edge}} />}
          <div
            style={{
              width: 92,
              height: 44,
              borderRadius: 8,
              background: C.panel,
              border: `1.5px solid ${C.border}`,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 6,
                height: 6,
                borderRadius: 3,
                background: i === 2 && !ghost ? C.amber : C.green,
              }}
            />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

const ChainDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [4, 56], [1.25, 0.74], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });
  const portGlow = interpolate(frame, [4, 12], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{transform: `scale(${zoom})`, justifyContent: 'center', alignItems: 'center'}}
      >
        <div style={{position: 'relative', width: 1920, height: 1080}}>
          <Mini x={280} y={420} delay={0} />
          <Mini x={1240} y={330} delay={10} />
          <div
            style={{
              position: 'absolute',
              left: 700,
              top: 436,
              width: 14,
              height: 14,
              borderRadius: 4,
              background: C.indigo,
              opacity: portGlow,
              boxShadow: `0 0 ${22 * portGlow}px ${C.indigo}`,
            }}
          />
          <svg
            width={1920}
            height={1080}
            style={{position: 'absolute', inset: 0}}
            viewBox="0 0 1920 1080"
          >
            <DrawPath
              d="M 714 443 C 900 340, 1050 320, 1240 352"
              delay={8}
              dur={14}
              color={C.indigo}
              width={3}
              glow
            />
          </svg>
          <Mini x={300} y={130} delay={26} ghost />
          <Mini x={1300} y={700} delay={30} ghost />
          <Mini x={700} y={800} delay={34} ghost />
          <Mini x={1450} y={80} delay={38} ghost />
          <svg
            width={1920}
            height={1080}
            style={{position: 'absolute', inset: 0}}
            viewBox="0 0 1920 1080"
          >
            <DrawPath d="M 640 174 C 800 260, 900 340, 980 400" delay={34} dur={14} color="#33374a" width={2} />
            <DrawPath d="M 1580 396 C 1560 500, 1500 620, 1420 700" delay={38} dur={14} color="#33374a" width={2} />
            <DrawPath d="M 620 464 C 640 600, 680 720, 720 800" delay={42} dur={14} color="#33374a" width={2} />
          </svg>
        </div>
      </AbsoluteFill>
      <Copy text="Exit ports chain them into one map." delay={26} size={40} />
    </AbsoluteFill>
  );
};

// ————— Demo: agents flip drifted → built —————
const DIFF: Array<{t: '+' | '-' | ' '; s: string}> = [
  {t: ' ', s: 'export async function review(req: Request) {'},
  {t: '-', s: '  return autoApprove(req);'},
  {t: '+', s: '  const risk = scoreRisk(req);'},
  {t: '+', s: '  if (risk > THRESHOLD) {'},
  {t: '+', s: '    return queueManualReview(req);'},
  {t: '+', s: '  }'},
  {t: ' ', s: '  return approve(req);'},
  {t: ' ', s: '}'},
  {t: ' ', s: ''},
  {t: ' ', s: 'export function scoreRisk(req: Request) {'},
  {t: '+', s: '  const signals = collectSignals(req);'},
  {t: '+', s: '  return weigh(signals);'},
  {t: ' ', s: '}'},
];

const SyncDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scroll = interpolate(frame, [0, D.s5], [0, -190]);
  const dot = interpolateColors(frame, [20, 32], [C.amber, C.green]);
  const ripple = spring({frame, fps, delay: 22, config: {damping: 200}, durationInFrames: 25});
  const flip = interpolate(frame, [21, 30], [0, 1], clamp);
  const rows = [...DIFF, ...DIFF, ...DIFF];
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 200,
          top: 220,
          width: 720,
          height: 460,
          borderRadius: 14,
          background: C.panel,
          border: `1.5px solid ${C.border}`,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            padding: '14px 22px',
            borderBottom: `1px solid ${C.border}`,
            fontFamily: mono,
            fontSize: 14,
            color: C.dim,
          }}
        >
          src/review.ts · changed
        </div>
        <div style={{height: 410, overflow: 'hidden'}}>
          <div style={{padding: '18px 26px', transform: `translateY(${scroll}px)`}}>
            {rows.map((l, i) => (
              <div
                key={i}
                style={{
                  fontFamily: mono,
                  fontSize: 17,
                  lineHeight: '30px',
                  whiteSpace: 'pre',
                  color: l.t === '+' ? '#7ee2a8' : l.t === '-' ? '#f28b8b' : C.dim,
                }}
              >
                {l.t} {l.s}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 1180, top: 380}}>
        <div
          style={{
            width: 340,
            padding: '26px 30px',
            borderRadius: 12,
            background: C.panel,
            border: `1.5px solid ${C.border}`,
            position: 'relative',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{fontFamily: inter, fontSize: 26, fontWeight: 600, color: C.text}}>
            Manual review
          </div>
          <div style={{marginTop: 14, position: 'relative', height: 30}}>
            <span
              style={{
                position: 'absolute',
                fontFamily: mono,
                fontSize: 14,
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid ${C.amber}`,
                color: C.amber,
                opacity: 1 - flip,
              }}
            >
              drifted
            </span>
            <span
              style={{
                position: 'absolute',
                fontFamily: mono,
                fontSize: 14,
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid ${C.green}`,
                color: C.green,
                opacity: flip,
              }}
            >
              built
            </span>
          </div>
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 12,
              height: 12,
              borderRadius: 6,
              background: dot,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 22 - 60 * ripple,
              right: 22 - 60 * ripple,
              width: 120 * ripple,
              height: 120 * ripple,
              borderRadius: '50%',
              border: `2px solid ${C.green}`,
              opacity: ripple > 0 ? 0.6 * (1 - ripple) : 0,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ————— Demo: the viewer, floating —————
const ViewerDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const rx = interpolate(frame, [0, D.s6], [7, 1]);
  const ry = interpolate(frame, [0, D.s6], [-6, 0]);
  const scale = interpolate(frame, [0, D.s6], [0.92, 1.06]);
  const sweep = interpolate(frame, [10, 52], [-500, 2300], clamp);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          transform: `perspective(1600px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`,
          borderRadius: 18,
          overflow: 'hidden',
          border: `1.5px solid ${C.border}`,
          boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 80px rgba(99,102,241,0.12)',
          position: 'relative',
        }}
      >
        <Img src={staticFile('viewer.png')} style={{width: 1460, display: 'block'}} />
        <div
          style={{
            position: 'absolute',
            top: -200,
            left: sweep,
            width: 260,
            height: 1100,
            transform: 'rotate(18deg)',
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ————— End card —————
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 15, stiffness: 240}, durationInFrames: 14});
  const flash = interpolate(frame, [0, 3, 12], [0.9, 0.5, 0], clamp);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', gap: 28, background: C.bg}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          transform: `scale(${0.9 + 0.1 * pop})`,
        }}
      >
        <LogoMark size={64} />
        <div
          style={{
            fontFamily: inter,
            fontSize: 96,
            fontWeight: 800,
            color: C.text,
            letterSpacing: '-0.03em',
          }}
        >
          codestory
        </div>
      </div>
      <div style={{fontFamily: mono, fontSize: 28, color: C.indigo}}>
        particular-labs.github.io/codestory
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 20,
          color: C.dim,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '10px 22px',
          background: C.panel,
        }}
      >
        $ npx @particular-labs/codestory init
      </div>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 50%, rgba(99,102,241,0.5), transparent 65%)`,
          opacity: flash,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

// ————— Soundtrack —————
// Beat starts: t1 0 · t2 21 · intro 42 · f1 78 · s3 102 · s4 186 · f2 246 · s5 270 · f3 330 · s6 354 · end 414
const Soundtrack: React.FC = () => (
  <>
    <Audio src={staticFile('audio/music.mp3')} volume={0.8} />
    {[0, 21, 42, 78, 246, 330].map((f) => (
      <Sequence key={`swish-${f}`} from={f}>
        <Audio src={staticFile('audio/swish.mp3')} volume={0.55} />
      </Sequence>
    ))}
    {[102, 186, 354].map((f) => (
      <Sequence key={`whoosh-${f}`} from={f}>
        <Audio src={staticFile('audio/whoosh.mp3')} volume={0.4} />
      </Sequence>
    ))}
    {[104, 114, 124, 194, 290].map((f) => (
      <Sequence key={`pop-${f}`} from={f}>
        <Audio src={staticFile('audio/pop.mp3')} volume={0.5} />
      </Sequence>
    ))}
    <Sequence from={369}>
      <Audio src={staticFile('audio/riser.mp3')} volume={0.7} />
    </Sequence>
    <Sequence from={414}>
      <Audio src={staticFile('audio/hit.mp3')} volume={0.9} />
    </Sequence>
  </>
);

export const Promo: React.FC = () => (
  <AbsoluteFill style={{background: C.bg}}>
    <Soundtrack />
    <Series>
      <Series.Sequence durationInFrames={D.t1}>
        <TextCard lines={['Docs drift.']} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.t2}>
        <TextCard lines={['Diagrams rot.']} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.intro}>
        <Intro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.f1}>
        <TextCard lines={['Living journey maps', 'for your codebase.']} size={92} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.s3}>
        <JourneyDemo />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.s4}>
        <ChainDemo />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.f2}>
        <TextCard lines={['Synced by agents.']} kicker="never stale" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.s5}>
        <SyncDemo />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.f3}>
        <TextCard lines={['Step through', 'the flow.']} size={100} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.s6}>
        <ViewerDemo />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.end}>
        <EndCard />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
