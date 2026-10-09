// Building blocks: background, captions, the phone (with zoom and gentle parallax), our cursor, tags,
// counters, a drawn check, the end card. Calm motion: springs, 250–400 ms, zooms 1.1–1.3×.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY, CREAM, DISPLAY, MINT, MUTED_ON_NAVY, NAVY, NAVY_2, SURFACE } from './brand';
import { layoutFor } from './motion';
import { CAPTION_IN, FPS } from './timeline';

export const APP = { width: 430, height: 932 }; // the phone the captures were taken on (CSS px)

export function useLayout() {
  const { width, height } = useVideoConfig();
  return layoutFor(width, height);
}

/** Navy with a slow, soft light moving across it. */
export const Background: React.FC<{ tone?: 'navy' | 'cream' }> = ({ tone = 'navy' }) => {
  const frame = useCurrentFrame();
  const x = 70 + Math.sin(frame / 140) * 12;
  const y = 25 + Math.cos(frame / 170) * 10;
  const base = tone === 'navy' ? NAVY : CREAM;
  const light = tone === 'navy' ? NAVY_2 : SURFACE;
  return <AbsoluteFill style={{ background: `radial-gradient(1200px 900px at ${x}% ${y}%, ${light}, transparent 70%), ${base}` }} />;
};

/** A caption: 1–6 words in Fraunces, an optional small line in Inter. Rises in over 0.2 s, then stays put. */
export const Caption: React.FC<{ text: string; small?: string; instant?: boolean; center?: boolean; size?: number; dark?: boolean }> = ({
  text, small, instant, center, size, dark,
}) => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const p = instant ? 1 : interpolate(frame, [0, CAPTION_IN * FPS], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const ink = dark ? NAVY : CREAM;
  const box = center
    ? { left: 90, top: 0, width: L.width - 180, height: L.height, align: 'center' as const, justify: 'center' }
    : L.vertical
      ? { left: L.caption.x, top: L.caption.y, width: L.caption.w, height: 250, align: 'center' as const, justify: 'center' }
      : { left: L.caption.x, top: 0, width: L.caption.w, height: L.height, align: 'left' as const, justify: 'center' };
  const fontSize = size ?? (center ? 96 : L.vertical ? 72 : 84);
  return (
    <div
      data-caption={text}
      style={{
        position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, display: 'flex', flexDirection: 'column',
        justifyContent: box.justify, alignItems: box.align === 'center' ? 'center' : 'flex-start', textAlign: box.align,
        opacity: p, transform: `translateY(${(1 - p) * 18}px)`,
      }}
    >
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize, lineHeight: 1.06, letterSpacing: '0.01em', color: ink, textWrap: 'balance' as never }}>{text}</div>
      {small && (
        <div style={{ fontFamily: BODY, fontWeight: 400, fontSize: L.vertical ? 34 : 38, lineHeight: 1.35, marginTop: 26, color: dark ? '#596175' : MUTED_ON_NAVY, maxWidth: box.width }}>
          {small}
        </div>
      )}
    </div>
  );
};

/** The question, typed in quickly (done in 0.2 s, then on screen in full). */
export const Typed: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const shown = Math.min(text.length, Math.ceil((frame / (CAPTION_IN * FPS)) * text.length));
  const caret = frame > CAPTION_IN * FPS && Math.floor(frame / 15) % 2 === 0;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div data-caption={text} style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 96, color: CREAM, letterSpacing: '0.01em' }}>
        {text.slice(0, shown)}
        <span style={{ display: 'inline-block', width: 6, height: 86, marginLeft: 10, background: MINT, opacity: caret ? 1 : 0, verticalAlign: '-8px' }} />
      </div>
    </AbsoluteFill>
  );
};

export interface Zoom {
  /** Point to zoom toward, in app CSS px. */
  x: number;
  y: number;
  scale: number;
  /** Frame the zoom starts (relative to the scene) and how long it takes. */
  at: number;
  dur?: number;
}

/** The phone: a bezel round the screen, with a gentle float. Content is drawn at app size and scaled. */
export const Phone: React.FC<{ x: number; y: number; screenH: number; zoom?: Zoom; children: React.ReactNode; float?: boolean }> = ({
  x, y, screenH, zoom, children, float = true,
}) => {
  const frame = useCurrentFrame();
  const s = screenH / APP.height;
  const w = APP.width * s;
  const bezel = Math.round(screenH * 0.022);
  const zp = zoom ? spring({ frame: frame - zoom.at, fps: FPS, config: { damping: 200 }, durationInFrames: zoom.dur ?? 12 }) : 0;
  const k = zoom ? 1 + (zoom.scale - 1) * zp : 1;
  const zx = zoom ? zoom.x * s : 0;
  const zy = zoom ? zoom.y * s : 0;
  const bob = float ? Math.sin(frame / 45) * 5 : 0;
  const tilt = float ? Math.sin(frame / 70) * 1.2 : 0;
  return (
    <div
      style={{
        position: 'absolute', left: x - bezel, top: y - bezel + bob, width: w + bezel * 2, height: screenH + bezel * 2, borderRadius: bezel * 3.4,
        background: '#0E1526', boxShadow: '0 40px 90px rgb(0 0 0 / 38%)', transform: `perspective(1600px) rotateY(${tilt}deg)`,
      }}
    >
      <div style={{ position: 'absolute', left: bezel, top: bezel, width: w, height: screenH, borderRadius: bezel * 2.5, overflow: 'hidden', background: CREAM }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: screenH, transformOrigin: `${zx}px ${zy}px`, transform: `scale(${k})` }}>
          <div style={{ width: APP.width, height: APP.height, transform: `scale(${s})`, transformOrigin: '0 0' }}>{children}</div>
        </div>
      </div>
    </div>
  );
};

/** Where an app point lands on the canvas (for the cursor), given the phone's place and no zoom. */
export const onPhone = (phone: { x: number; y: number; screenH: number }, p: { x: number; y: number }) => {
  const s = phone.screenH / APP.height;
  return { x: phone.x + p.x * s, y: phone.y + p.y * s };
};

export const Shot: React.FC<{ name: string; style?: React.CSSProperties }> = ({ name, style }) => (
  <Img src={staticFile(`capture/${name}.png`)} style={{ display: 'block', width: '100%', ...style }} />
);

export interface CursorKey {
  f: number;
  x: number;
  y: number;
}

/** Our cursor: glides between keyframes (ease in-out), shrinks for 4 frames before a tap, then a soft mint ripple. */
export function cursorAt(keys: CursorKey[], frame: number) {
  if (frame <= keys[0].f) return { x: keys[0].x, y: keys[0].y };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame <= b.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { easing: Easing.inOut(Easing.cubic) });
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  const last = keys[keys.length - 1];
  return { x: last.x, y: last.y };
}

export const Cursor: React.FC<{ keys: CursorKey[]; taps?: number[] }> = ({ keys, taps = [] }) => {
  const frame = useCurrentFrame();
  const { x, y } = cursorAt(keys, frame);
  const tap = taps.find((t) => frame >= t - 4 && frame < t + 12);
  const press = tap !== undefined && frame < tap ? interpolate(frame, [tap - 4, tap], [1, 0.82]) : tap !== undefined ? interpolate(frame, [tap, tap + 3], [0.82, 1], { extrapolateRight: 'clamp' }) : 1;
  const ripple = taps.find((t) => frame >= t && frame < t + 12);
  const rp = ripple !== undefined ? (frame - ripple) / 12 : 0;
  return (
    <>
      {ripple !== undefined && (
        <div style={{ position: 'absolute', left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: '50%', border: `4px solid ${MINT}`, background: 'rgb(124 200 181 / 30%)', transform: `scale(${0.6 + rp * 1.6})`, opacity: 1 - rp }} />
      )}
      <div
        data-cursor
        style={{
          position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, borderRadius: '50%', background: 'rgb(255 255 255 / 70%)',
          border: `3px solid ${NAVY}`, boxShadow: '0 6px 18px rgb(0 0 0 / 30%)', transform: `scale(${press})`,
        }}
      />
    </>
  );
};

/** Spring in (scale + fade) from frame `at`. */
export const useIn = (at: number, dur = 10) => {
  const frame = useCurrentFrame();
  return spring({ frame: frame - at, fps: FPS, config: { damping: 18, stiffness: 140 }, durationInFrames: dur });
};

export const Tag: React.FC<{ text: string; tone: 'skip' | 'link' | 'new'; at: number; style?: React.CSSProperties }> = ({ text, tone, at, style }) => {
  const p = useIn(at);
  const colors = { skip: ['#E5E9EE', '#334055'], link: ['#DDEEE8', '#1F5C4F'], new: [MINT, NAVY] }[tone];
  return (
    <div style={{ position: 'absolute', padding: '10px 22px', borderRadius: 999, background: colors[0], color: colors[1], fontFamily: BODY, fontWeight: 600, fontSize: 26, whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgb(0 0 0 / 18%)', opacity: p, transform: `scale(${0.7 + 0.3 * p})`, transformOrigin: 'left center', ...style }}>
      {text}
    </div>
  );
};

export const CountTo: React.FC<{ value: number; at: number; dur?: number }> = ({ value, at, dur = 18 }) => {
  const frame = useCurrentFrame();
  const v = Math.round(interpolate(frame, [at, at + dur], [0, value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }));
  return <>{v}</>;
};

/** A mint circle with a check that draws itself. */
export const CheckDraw: React.FC<{ at: number; size?: number }> = ({ at, size = 150 }) => {
  const frame = useCurrentFrame();
  const ring = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const tick = interpolate(frame, [at + 8, at + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="44" fill={MINT} opacity={ring} transform={`rotate(-90 50 50)`} />
      <circle cx="50" cy="50" r="44" fill="none" stroke={MINT} strokeWidth="6" strokeDasharray={`${276 * ring} 276`} transform="rotate(-90 50 50)" />
      <path d="M30 52 L45 66 L71 37" fill="none" stroke={NAVY} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" strokeDashoffset={70 * (1 - tick)} />
    </svg>
  );
};

/** End card: the logo and wordmark, with the caption under them. */
export const EndCard: React.FC<{ text: string; small?: string }> = ({ text, small }) => {
  const L = useLayout();
  const p = useIn(0, 14);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 54 }}>
      <Img src={staticFile('brand/wordmark-reverse.svg')} style={{ height: L.vertical ? 96 : 120, opacity: 0.4 + 0.6 * p, transform: `scale(${0.92 + 0.08 * p})` }} />
      <div data-caption={text} style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: L.vertical ? 64 : 72, color: CREAM, textAlign: 'center', maxWidth: L.width - 160, lineHeight: 1.1, letterSpacing: '0.01em' }}>
        {text}
      </div>
      {small && <div style={{ fontFamily: BODY, fontSize: L.vertical ? 34 : 38, color: MUTED_ON_NAVY, textAlign: 'center', maxWidth: L.width - 160 }}>{small}</div>}
    </AbsoluteFill>
  );
};

/** A floating card (a screenshot of part of the app), sliding in from the right. */
export const Card: React.FC<{ name: string; x: number; y: number; w: number; at?: number; from?: 'right' | 'below'; pad?: boolean; title?: string }> = ({
  name, x, y, w, at = 0, from = 'right', pad, title,
}) => {
  const p = useIn(at, 12);
  const dx = from === 'right' ? (1 - p) * 80 : 0;
  const dy = from === 'below' ? (1 - p) * 60 : 0;
  return (
    <div style={{ position: 'absolute', left: x + dx, top: y + dy, width: w, opacity: p, borderRadius: 28, overflow: 'hidden', background: SURFACE, boxShadow: '0 30px 70px rgb(0 0 0 / 32%)', padding: pad ? 26 : 0 }}>
      {title && <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 32, color: NAVY, margin: '6px 4px 18px' }}>{title}</div>}
      <Shot name={name} />
    </div>
  );
};
