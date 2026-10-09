// Pure layout and cursor paths, shared by the scenes and by check.ts (which proves the cursor never jumps).
import data from '../public/capture/scenes.json';
import { FPS } from './timeline';

export const APP = { width: 430, height: 932 }; // the phone the captures were taken on (CSS px)
type Rect = { x: number; y: number; width: number; height: number };
export const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export interface CursorKey {
  f: number;
  x: number;
  y: number;
}

export function layoutFor(width: number, height: number) {
  const vertical = height > width;
  return vertical
    ? { vertical, width, height, caption: { x: 70, y: 64, w: width - 140, align: 'center' as const }, stage: { x: 0, y: 330, w: width, h: height - 360 } }
    : { vertical, width, height, caption: { x: 130, y: 0, w: 760, align: 'left' as const }, stage: { x: 930, y: 0, w: width - 960, h: height } };
}
export type Layout = ReturnType<typeof layoutFor>;

/** Where the phone sits: alone in the stage, or to the left of something else. */
export function phoneSpot(L: Layout, mode: 'single' | 'left' = 'single') {
  if (L.vertical) {
    const screenH = mode === 'left' ? 760 : 900;
    const w = (APP.width * screenH) / APP.height;
    return { screenH, x: mode === 'left' ? 70 : (L.width - w) / 2, y: 380, w };
  }
  const screenH = 860;
  const w = (APP.width * screenH) / APP.height;
  return { screenH, x: mode === 'left' ? 960 : L.stage.x + (L.stage.w - w) / 2, y: 110, w };
}
export type Spot = ReturnType<typeof phoneSpot>;

/** Where an app point lands on the canvas (no zoom). */
export const onPhone = (spot: { x: number; y: number; screenH: number }, p: { x: number; y: number }) => {
  const s = spot.screenH / APP.height;
  return { x: spot.x + p.x * s, y: spot.y + p.y * s };
};

const D = data as unknown as { coffee: { tapAt: number; chip: Rect }; typing: { box: Rect } };

/** Coffee scene: in from the right, onto the chip, tap, then away beside the phone before the zoom. */
export function coffeeCursor(L: Layout) {
  const spot = phoneSpot(L);
  const tap = Math.round(D.coffee.tapAt * FPS);
  const chip = onPhone(spot, centre(D.coffee.chip));
  const keys: CursorKey[] = [
    // In from the lower right; a short path keeps it under 60 px per frame.
    { f: 0, x: chip.x + 480, y: chip.y + 140 },
    { f: tap - 6, x: chip.x, y: chip.y },
    { f: tap + 4, x: chip.x, y: chip.y },
    { f: tap + 28, x: spot.x + spot.w + 90, y: chip.y + 40 },
  ];
  return { keys, taps: [tap] };
}

/** Typing scene: from just beside the phone onto the log box, tap, then down out of the way. */
export function typingCursor(L: Layout) {
  const spot = phoneSpot(L);
  const tap = Math.round(0.7 * FPS); // the clip taps the box 0.7 s in
  const box = onPhone(spot, centre(D.typing.box));
  const keys: CursorKey[] = [
    { f: 0, x: box.x + 120, y: box.y + 170 },
    { f: tap - 4, x: box.x - 60, y: box.y },
    { f: tap + 30, x: box.x - 60, y: box.y },
    { f: tap + 56, x: box.x + 40, y: box.y + 150 },
  ];
  return { keys, taps: [tap] };
}
