// The scenes. Each is drawn from the real app's stills and clips (public/capture) and the numbers in
// scenes.json (what the app actually showed when it was captured).
import React from 'react';
import { AbsoluteFill, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import * as lucide from 'lucide';
import data from '../public/capture/scenes.json';
import { BODY, CREAM, DISPLAY, MINT, MUTED_ON_NAVY, NAVY, SURFACE } from './brand';
import {
  APP, Background, Caption, Card, CheckDraw, CountTo, Cursor, EndCard, Phone, Shot, Tag, Typed, onPhone, useIn, useLayout, type CursorKey, type Zoom,
} from './components';
import { coffeeCursor, phoneSpot, typingCursor } from './motion';
import { FPS, frames, type Scene } from './timeline';

type Rect = { x: number; y: number; width: number; height: number };
const D = data as unknown as {
  today: { number: string; heroNumber: Rect };
  coffee: { tapAt: number; length: number; chip: Rect; before: string; after: string };
  breakdown: { lines: string[] };
  calendar: { cells: Array<{ label: string; kind: 'payday' | 'bill'; rect: Rect }> };
  import: { dropZone: Rect; preview: { rect: Rect; rows: Array<{ rect: Rect; tag: 'already imported' | 'matches your entry' | 'new' }> }; counts: { skipped: number; linked: number; new: number }; both: string };
  todayAfterImport: { before: string; after: string; heroNumber: Rect };
  typing: { box: Rect; length: number };
};
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Where the phone sits: alone in the stage, or to the left of something else. */
function usePhone(mode: 'single' | 'left' = 'single') {
  return phoneSpot(useLayout(), mode);
}

const Screen: React.FC<{ name: string }> = ({ name }) => <Img src={staticFile(`capture/${name}.png`)} style={{ width: APP.width, height: APP.height, display: 'block' }} />;
const Clip: React.FC<{ name: string; freezeAt?: number }> = ({ name, freezeAt }) => {
  const video = <OffthreadVideo src={staticFile(`capture/${name}.mp4`)} muted style={{ width: APP.width, height: APP.height, display: 'block' }} />;
  return freezeAt === undefined ? video : <Freeze frame={freezeAt}>{video}</Freeze>;
};

/** Zoom toward a point, then (optionally) back out. */
const zoomTo = (p: { x: number; y: number }, scale: number, at: number, out?: number): Zoom & { out?: number } => ({ ...p, scale, at, out });

const ZoomedPhone: React.FC<{ spot: ReturnType<typeof usePhone>; zoom?: Zoom & { out?: number }; children: React.ReactNode }> = ({ spot, zoom, children }) => {
  const frame = useCurrentFrame();
  // Zoom out again after `out` by easing the scale back (keeps the toast at the bottom in view).
  const z = zoom && zoom.out !== undefined && frame >= zoom.out ? { ...zoom, scale: 1 + (zoom.scale - 1) * interpolate(frame, [zoom.out, zoom.out + 10], [1, 0], { extrapolateRight: 'clamp' }), at: -100 } : zoom;
  return (
    <Phone x={spot.x} y={spot.y} screenH={spot.screenH} zoom={z}>
      {children}
    </Phone>
  );
};

// ---------------------------------------------------------------- shared scenes

export const QuestionScene: React.FC<{ s: Scene }> = ({ s }) => (
  <AbsoluteFill>
    <Background />
    {s.small ? <Caption text={s.caption} small={s.small} center /> : <Typed text={s.caption} />}
  </AbsoluteFill>
);

export const TitleScene: React.FC<{ s: Scene }> = ({ s }) => (
  <AbsoluteFill>
    <Background />
    <Caption text={s.caption} small={s.small} center />
  </AbsoluteFill>
);

export const TodayScene: React.FC<{ s: Scene }> = ({ s }) => {
  const spot = usePhone();
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      <ZoomedPhone spot={spot} zoom={zoomTo(centre(D.today.heroNumber), 1.25, 18)}>
        <Screen name="today-380" />
      </ZoomedPhone>
    </AbsoluteFill>
  );
};

/** The coffee chip: our cursor glides in, taps; the app logs it, the number drops, the undo toast appears. */
export const CoffeeScene: React.FC<{ s: Scene }> = ({ s }) => {
  const spot = usePhone();
  const L = useLayout();
  const { keys, taps } = coffeeCursor(L);
  const tap = taps[0];
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      {/* A gentle zoom that keeps both the number (top) and the undo toast (bottom) in view. */}
      <ZoomedPhone spot={spot} zoom={zoomTo({ x: APP.width / 2, y: 560 }, 1.12, tap + 14)}>
        <Clip name="coffee-tap" />
      </ZoomedPhone>
      <Cursor keys={keys} taps={[tap]} />
    </AbsoluteFill>
  );
};

/** "How this number is made": the breakdown slides in beside the phone. */
export const WhyScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  const spot = usePhone('left');
  const last = Math.round(D.coffee.length * FPS) - 2;
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      <Phone x={spot.x} y={spot.y} screenH={spot.screenH}>
        <Clip name="coffee-tap" freezeAt={last} />
      </Phone>
      {L.vertical ? (
        <Card name="breakdown-376" x={spot.x + spot.w - 40} y={560} w={L.width - spot.x - spot.w + 10} at={4} pad title="How this number is made" />
      ) : (
        <Card name="breakdown-376" x={spot.x + spot.w + 40} y={250} w={480} at={4} pad title="How this number is made" />
      )}
    </AbsoluteFill>
  );
};

/** The calendar, with paydays (mint) and bills (sand) ringed one by one. */
export const CalendarScene: React.FC<{ s: Scene }> = ({ s }) => {
  const spot = usePhone();
  const frame = useCurrentFrame();
  const cells = D.calendar.cells;
  const mid = {
    x: cells.reduce((n, c) => n + centre(c.rect).x, 0) / cells.length,
    y: cells.reduce((n, c) => n + centre(c.rect).y, 0) / cells.length,
  };
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      <ZoomedPhone spot={spot} zoom={zoomTo({ x: APP.width / 2, y: mid.y }, 1.07, 4)}>
        <Screen name="bills-calendar" />
        {cells.map((c, i) => {
          const at = 14 + i * 5;
          const p = interpolate(frame, [at, at + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const color = c.kind === 'payday' ? MINT : '#E0B25A';
          return (
            <div key={c.label} style={{ position: 'absolute', left: c.rect.x - 4, top: c.rect.y - 4, width: c.rect.width + 8, height: c.rect.height + 8, borderRadius: 12, border: `3px solid ${color}`, background: `${color}22`, opacity: p, transform: `scale(${1.25 - 0.25 * p})` }} />
          );
        })}
      </ZoomedPhone>
      <Legend />
    </AbsoluteFill>
  );
};

const Legend: React.FC = () => {
  const L = useLayout();
  const p = useIn(30);
  const style: React.CSSProperties = L.vertical ? { left: 0, right: 0, top: 290, justifyContent: 'center' } : { left: 130, top: 700 };
  return (
    <div style={{ position: 'absolute', display: 'flex', gap: 34, fontFamily: BODY, fontSize: 30, color: MUTED_ON_NAVY, opacity: p, ...style }}>
      <span><i style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 9, background: MINT, marginRight: 12 }} />Payday</span>
      <span><i style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 9, background: '#E0B25A', marginRight: 12 }} />Bill due</span>
    </div>
  );
};

/** A statement file drops onto the app's import screen. */
export const DropScene: React.FC<{ s: Scene }> = ({ s }) => {
  const spot = usePhone();
  const frame = useCurrentFrame();
  const zone = onPhone(spot, centre(D.import.dropZone));
  const p = useIn(8, 18);
  const land = interpolate(frame, [26, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(p, [0, 1], [-260, zone.y - 120]);
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      <Phone x={spot.x} y={spot.y} screenH={spot.screenH}>
        <Screen name="import-pick" />
        <div style={{ position: 'absolute', left: D.import.dropZone.x, top: D.import.dropZone.y, width: D.import.dropZone.width, height: D.import.dropZone.height, borderRadius: 18, border: `4px solid ${MINT}`, background: 'rgb(124 200 181 / 18%)', opacity: land }} />
      </Phone>
      <div style={{ position: 'absolute', left: zone.x - 95, top: y, width: 190, height: 240, opacity: Math.min(1, p * 1.5), transform: `rotate(${(1 - p) * -8}deg) scale(${1 - 0.25 * land})`, transformOrigin: 'center bottom' }}>
        <CsvFile />
      </div>
    </AbsoluteFill>
  );
};

const CsvFile: React.FC = () => (
  <div style={{ width: 190, height: 240, borderRadius: 18, background: SURFACE, boxShadow: '0 24px 50px rgb(0 0 0 / 35%)', position: 'relative', overflow: 'hidden', fontFamily: BODY }}>
    <div style={{ position: 'absolute', right: 0, top: 0, width: 44, height: 44, background: '#E7E1D3', borderBottomLeftRadius: 14 }} />
    <div style={{ position: 'absolute', left: 22, top: 30, padding: '6px 12px', borderRadius: 8, background: '#2E7D5B', color: 'white', fontWeight: 700, fontSize: 24 }}>CSV</div>
    {[88, 112, 136, 160].map((t) => (
      <div key={t} style={{ position: 'absolute', left: 22, right: 22, top: t, height: 10, borderRadius: 5, background: '#E7E1D3' }} />
    ))}
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 16, textAlign: 'center', fontSize: 22, fontWeight: 600, color: NAVY }}>statement.csv</div>
  </div>
);

/** The preview: rows wipe in, tags pop onto them, the counts add up. */
export const PreviewScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  const spot = usePhone('left');
  const frame = useCurrentFrame();
  const card = D.import.preview.rect;
  const fit = Math.min(1, (APP.height - 30) / card.height);
  const top = 14;
  const left = (APP.width - card.width * fit) / 2;
  const wipe = interpolate(frame, [4, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const label = { 'already imported': 'already imported', 'matches your entry': 'matches your entry', new: 'new' } as const;
  const tone = { 'already imported': 'skip', 'matches your entry': 'link', new: 'new' } as const;
  const s2 = spot.screenH / APP.height;
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      <Phone x={spot.x} y={spot.y} screenH={spot.screenH}>
        <div style={{ position: 'absolute', inset: 0, background: CREAM }} />
        <div style={{ position: 'absolute', left, top, width: card.width * fit, clipPath: `inset(0 0 ${(1 - wipe) * 100}% 0)` }}>
          <Shot name="import-preview" style={{ borderRadius: 20 }} />
        </div>
      </Phone>
      {D.import.preview.rows.map((r, i) => {
        const y = spot.y + (top + (r.rect.y + r.rect.height / 2) * fit) * s2;
        if (y > spot.y + spot.screenH - 20) return null;
        const x = spot.x + spot.w + 34;
        return <Tag key={i} text={label[r.tag]} tone={tone[r.tag]} at={36 + i * 4} style={{ left: x, top: y - 24 }} />;
      })}
      <Counts />
    </AbsoluteFill>
  );
};

const Counts: React.FC = () => {
  const L = useLayout();
  const p = useIn(80, 12);
  const c = D.import.counts;
  const style: React.CSSProperties = L.vertical ? { left: 0, right: 0, top: 316, textAlign: 'center' } : { left: 130, top: 730 };
  return (
    <div style={{ position: 'absolute', fontFamily: BODY, fontWeight: 600, fontSize: 40, color: CREAM, opacity: p, ...style }}>
      <span style={{ color: MINT }}><CountTo value={c.skipped} at={80} /></span> skipped · <span style={{ color: MINT }}><CountTo value={c.linked} at={84} /></span> linked ·{' '}
      <span style={{ color: MINT }}><CountTo value={c.new} at={88} /></span> new
    </div>
  );
};

/** The balance check: the app's own card, and a mint check that draws itself. */
export const CheckScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={`Both say ${D.import.both}`} />
      {L.vertical ? (
        <>
          <div style={{ position: 'absolute', left: (L.width - 170) / 2, top: 430 }}><CheckDraw at={6} size={170} /></div>
          <Card name="import-balance" x={90} y={660} w={L.width - 180} at={2} from="below" />
        </>
      ) : (
        <>
          <div style={{ position: 'absolute', left: 1260, top: 230 }}><CheckDraw at={6} size={170} /></div>
          <Card name="import-balance" x={1000} y={450} w={720} at={2} from="below" />
        </>
      )}
    </AbsoluteFill>
  );
};

/** Today after the import: the number moves to the new one. */
export const UpdatedScene: React.FC<{ s: Scene }> = ({ s }) => {
  const spot = usePhone();
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [10, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={`${D.todayAfterImport.before} → ${D.todayAfterImport.after}`} />
      <ZoomedPhone spot={spot} zoom={zoomTo(centre(D.todayAfterImport.heroNumber), 1.22, 4)}>
        <Screen name="today-380" />
        <div style={{ position: 'absolute', inset: 0, opacity: fade }}>
          <Screen name="today-after-import" />
        </div>
      </ZoomedPhone>
    </AbsoluteFill>
  );
};

export const EndScene: React.FC<{ s: Scene }> = ({ s }) => (
  <AbsoluteFill>
    <Background />
    <EndCard text={s.caption} small={s.small} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- product-video scenes

/** Typing a quick log: our cursor taps the box, the real app takes the typing. */
export const TypingScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  const spot = usePhone();
  const { keys, taps } = typingCursor(L);
  const tap = taps[0];
  const clipFrames = Math.round(D.typing.length * FPS) - 2;
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      <ZoomedPhone spot={spot} zoom={zoomTo(onApp(centre(D.typing.box)), 1.15, tap + 10)}>
        {frame < clipFrames ? <Clip name="type-quick-log" /> : <Clip name="type-quick-log" freezeAt={clipFrames} />}
      </ZoomedPhone>
      <Cursor keys={keys} taps={[tap]} />
    </AbsoluteFill>
  );
};
const onApp = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - 120 });

export const AwayScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  const cards = ['away-1', 'away-2', 'away-3'];
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      {cards.map((c, i) =>
        L.vertical ? (
          <Card key={c} name={c} x={60 + i * 330} y={390 + (i === 1 ? 0 : 40)} w={300} at={6 + i * 14} from="below" />
        ) : (
          <Card key={c} name={c} x={960 + i * 315} y={200 + (i === 1 ? 0 : 40)} w={295} at={6 + i * 14} from="below" />
        ),
      )}
    </AbsoluteFill>
  );
};

export const PlanScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      {L.vertical ? (
        <>
          <Card name="plan-envelopes" x={60} y={380} w={470} at={4} from="below" />
          <Card name="plan-goal" x={560} y={380} w={460} at={16} from="below" pad />
          <Card name="plan-debt" x={560} y={700} w={460} at={28} from="below" />
        </>
      ) : (
        <>
          <Card name="plan-envelopes" x={950} y={150} w={450} at={4} from="below" />
          <Card name="plan-goal" x={1430} y={150} w={430} at={16} from="below" pad />
          <Card name="plan-debt" x={1430} y={470} w={430} at={28} from="below" />
        </>
      )}
    </AbsoluteFill>
  );
};

export const InsightsScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      {L.vertical ? (
        <>
          <Card name="insights-donut" x={60} y={380} w={470} at={4} from="below" />
          <Card name="insights-flow" x={560} y={460} w={460} at={18} from="below" />
        </>
      ) : (
        <>
          <Card name="insights-donut" x={950} y={170} w={440} at={4} from="below" />
          <Card name="insights-flow" x={1420} y={250} w={440} at={18} from="below" />
        </>
      )}
    </AbsoluteFill>
  );
};

const Icon: React.FC<{ name: keyof typeof lucide; size: number }> = ({ name, size }) => {
  const node = lucide[name] as unknown as Array<[string, Record<string, string>]>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
};

export const PrivateScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  const tiles: Array<[keyof typeof lucide, string]> = [['Landmark', 'No bank login'], ['UserX', 'No account'], ['Smartphone', 'Stays on your device'], ['ShieldCheck', 'Backups checked']];
  const w = L.vertical ? 430 : 400;
  const x0 = L.vertical ? 90 : 990;
  const y0 = L.vertical ? 420 : 250;
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      {tiles.map(([icon, label], i) => (
        <Tile key={label} x={x0 + (i % 2) * (w + 40)} y={y0 + Math.floor(i / 2) * 300} w={w} at={6 + i * 8} icon={icon} label={label} />
      ))}
    </AbsoluteFill>
  );
};
const Tile: React.FC<{ x: number; y: number; w: number; at: number; icon: keyof typeof lucide; label: string }> = ({ x, y, w, at, icon, label }) => {
  const p = useIn(at, 12);
  return (
    <div style={{ position: 'absolute', left: x, top: y + (1 - p) * 40, width: w, height: 260, opacity: p, borderRadius: 36, background: 'rgb(247 243 234 / 8%)', border: '2px solid rgb(247 243 234 / 16%)', padding: 34, display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div style={{ width: 104, height: 104, borderRadius: 28, background: MINT, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={60} />
      </div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 38, color: CREAM }}>{label}</div>
    </div>
  );
};

/** Phone, tablet and laptop — the same Today screen on all three. */
export const DevicesScene: React.FC<{ s: Scene }> = ({ s }) => {
  const L = useLayout();
  const frame = useCurrentFrame();
  const p = useIn(4, 16);
  const float = Math.sin(frame / 50) * 6;
  const scale = L.vertical ? 0.62 : 0.78;
  const ox = L.vertical ? 20 : 900;
  const oy = L.vertical ? 470 : 170;
  return (
    <AbsoluteFill>
      <Background />
      <Caption text={s.caption} small={s.small} />
      <div style={{ position: 'absolute', left: ox, top: oy + (1 - p) * 50 + float, width: 1240, height: 900, transform: `scale(${scale})`, transformOrigin: '0 0', opacity: p }}>
        <div style={{ position: 'absolute', left: 140, top: 0, width: 960 }}>
          <div style={{ background: '#0E1526', borderRadius: '28px 28px 0 0', padding: '18px 18px 22px', boxShadow: '0 40px 90px rgb(0 0 0 / 38%)' }}>
            <Img src={staticFile('capture/device-desktop.png')} style={{ display: 'block', width: '100%', borderRadius: 8 }} />
          </div>
          <div style={{ height: 30, margin: '0 -60px', background: 'linear-gradient(#C9CDD6, #8F96A6)', borderRadius: '0 0 34px 34px' }} />
        </div>
        <div style={{ position: 'absolute', left: 0, top: 300, width: 420, background: '#0E1526', borderRadius: 40, padding: 16, boxShadow: '0 40px 90px rgb(0 0 0 / 38%)' }}>
          <Img src={staticFile('capture/device-tablet.png')} style={{ display: 'block', width: '100%', borderRadius: 26 }} />
        </div>
        <div style={{ position: 'absolute', right: 0, top: 290, width: 300, background: '#0E1526', borderRadius: 48, padding: 13, boxShadow: '0 40px 90px rgb(0 0 0 / 38%)' }}>
          <Img src={staticFile('capture/device-phone.png')} style={{ display: 'block', width: '100%', borderRadius: 36 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the three videos

const sceneFor: Record<string, React.FC<{ s: Scene }>> = {};
export function Video({ scenes, kinds }: { scenes: Scene[]; kinds: Record<string, React.FC<{ s: Scene }>> }) {
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {scenes.map((s) => {
        const Kind = kinds[s.id] ?? sceneFor[s.id];
        return (
          <Sequence key={s.id} from={frames(s.from)} durationInFrames={frames(s.to) - frames(s.from)} name={s.id}>
            <Kind s={s} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

export const ONE_NUMBER_KINDS = { question: QuestionScene, today: TodayScene, coffee: CoffeeScene, why: WhyScene, calendar: CalendarScene, end: EndScene };
export const IMPORT_KINDS = { title: TitleScene, drop: DropScene, preview: PreviewScene, check: CheckScene, today: UpdatedScene, end: EndScene };
export const PRODUCT_KINDS = {
  problem: QuestionScene, number: TodayScene, log: TypingScene, bills: CalendarScene, import: PreviewScene, away: AwayScene, plan: PlanScene,
  insights: InsightsScene, private: PrivateScene, devices: DevicesScene, end: EndScene,
};
export { DISPLAY };
