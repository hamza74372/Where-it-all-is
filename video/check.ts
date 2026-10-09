// Quality checks for the rendered videos (run after npm run render):
// - Etsy videos A and B: exactly 15.0 s, under 100 MB; every video: 1920×1080 (or 1080×1350), 30 fps, H.264, no audio
// - every caption fully on screen for at least 1.8 s (from the timeline the compositions are built from)
// - the cursor never jumps: per-frame movement stays small and every move takes at least 0.4 s
// - a 2-frames-per-second contact sheet of each video in out/check/, plus a check for blank (single-colour) frames
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cursorAt } from './src/components';
import { coffeeCursor, layoutFor, typingCursor, type CursorKey } from './src/motion';
import { CAPTION_IN, FPS, importVideo, lengthOf, oneNumber, product, type Scene } from './src/timeline';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ffmpeg: string = createRequire(import.meta.url)(path.join(ROOT, 'node_modules/ffmpeg-static'));
const CHECK = path.join(HERE, 'out/check');
fs.mkdirSync(CHECK, { recursive: true });

const problems: string[] = [];
const ok: string[] = [];
const fail = (m: string) => problems.push(m);

// ---- captions (timeline)
for (const [name, scenes] of [['OneNumber', oneNumber], ['Import', importVideo], ['Product', product]] as Array<[string, Scene[]]>) {
  for (const s of scenes) {
    const full = s.to - s.from - (s.instant ? 0 : CAPTION_IN);
    if (full < 1.8 - 1e-9) fail(`${name} "${s.caption}": fully on screen ${full.toFixed(2)} s (< 1.8 s)`);
    const words = s.caption.replace(/[·.]/g, ' ').split(/\s+/).filter(Boolean).length;
    if (!s.instant && (words < 1 || words > 6)) fail(`${name} "${s.caption}": ${words} words (want 1–6)`);
  }
  ok.push(`${name}: ${scenes.length} captions, each fully on screen ≥ 1.8 s`);
}
if (lengthOf(oneNumber) !== 15 || lengthOf(importVideo) !== 15) fail('Etsy videos must be exactly 15 s in the timeline');
if (lengthOf(product) < 60 || lengthOf(product) > 75) fail(`Product video is ${lengthOf(product)} s (want 60–75 s)`);

// ---- cursor paths (every frame of every cursor, both layouts)
const MAX_STEP = 60; // px per frame at 30 fps
function checkCursor(label: string, keys: CursorKey[]) {
  let worst = 0;
  for (let f = keys[0].f; f < keys[keys.length - 1].f + 5; f++) {
    const a = cursorAt(keys, f);
    const b = cursorAt(keys, f + 1);
    worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
  }
  for (let i = 1; i < keys.length; i++) {
    const moved = Math.hypot(keys[i].x - keys[i - 1].x, keys[i].y - keys[i - 1].y);
    if (moved > 0 && (keys[i].f - keys[i - 1].f) / FPS < 0.4) fail(`${label}: a move of ${moved.toFixed(0)} px takes under 0.4 s`);
  }
  if (worst > MAX_STEP) fail(`${label}: cursor moves ${worst.toFixed(0)} px in one frame (max ${MAX_STEP})`);
  ok.push(`${label}: cursor glides, at most ${worst.toFixed(0)} px per frame`);
}
for (const [w, h] of [[1920, 1080], [1080, 1350]]) {
  const L = layoutFor(w, h);
  checkCursor(`coffee cursor ${w}×${h}`, coffeeCursor(L).keys);
  checkCursor(`typing cursor ${w}×${h}`, typingCursor(L).keys);
}

// ---- rendered files
const files: Array<[string, string, number | null, [number, number]]> = [
  ['OneNumber', path.join(ROOT, 'listing/video-1-one-number.mp4'), 15, [1920, 1080]],
  ['Import', path.join(ROOT, 'listing/video-2-import.mp4'), 15, [1920, 1080]],
  ['Product', path.join(HERE, 'out/product-60s.mp4'), lengthOf(product), [1920, 1080]],
  ['ProductVertical', path.join(HERE, 'out/product-60s-vertical.mp4'), lengthOf(product), [1080, 1350]],
];
for (const [name, file, seconds, [w, h]] of files) {
  if (!fs.existsSync(file)) {
    fail(`${name}: ${path.relative(ROOT, file)} missing (npm run render)`);
    continue;
  }
  const info = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  const dur = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const secs = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : NaN;
  const video = info.match(/Video: (\w+).*?(\d{3,4})x(\d{3,4}).*?(\d+(?:\.\d+)?) fps/);
  const mb = fs.statSync(file).size / 1024 / 1024;
  if (seconds !== null && Math.abs(secs - seconds) > 0.02) fail(`${name}: ${secs.toFixed(2)} s (want ${seconds.toFixed(1)} s)`);
  if (!video || video[1] !== 'h264' || Number(video[2]) !== w || Number(video[3]) !== h || Number(video[4]) !== FPS) fail(`${name}: not H.264 ${w}×${h} @ ${FPS} fps (${video?.slice(1).join(' ')})`);
  if (/Audio:/.test(info)) fail(`${name}: has an audio track`);
  if (/yuv420p/.test(info) === false) fail(`${name}: not yuv420p`);
  if ((name === 'OneNumber' || name === 'Import') && mb >= 100) fail(`${name}: ${mb.toFixed(1)} MB (limit 100 MB)`);
  // 2 frames per second, tiled into one sheet.
  const cols = w > h ? 6 : 8;
  const rows = Math.ceil((secs * 2) / cols);
  const sheet = path.join(CHECK, `${name}-2fps.jpg`);
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `fps=2,scale=${w > h ? 480 : 270}:-1,tile=${cols}x${rows}:padding=6:color=0xE9E4D8`, '-frames:v', '1', sheet]);
  // Blank frames: a frame of one flat colour has almost no luma range (ffmpeg's signalstats).
  const stats = spawnSync(ffmpeg, ['-hide_banner', '-i', file, '-vf', 'fps=2,signalstats,metadata=print:key=lavfi.signalstats.YMAX:key=lavfi.signalstats.YMIN', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const ymax = [...stats.matchAll(/YMAX=(\d+)/g)].map((m) => Number(m[1]));
  const ymin = [...stats.matchAll(/YMIN=(\d+)/g)].map((m) => Number(m[1]));
  const blank = ymax.map((v, i) => v - ymin[i]).filter((range) => range < 24).length;
  if (blank) fail(`${name}: ${blank} blank-looking frame(s) at 2 fps`);
  ok.push(`${name}: ${secs.toFixed(2)} s, ${w}×${h} H.264 ${FPS} fps, no audio, ${mb.toFixed(1)} MB → ${path.relative(HERE, sheet)}`);
}

console.log(ok.map((l) => `✓ ${l}`).join('\n'));
if (problems.length) {
  console.error(problems.map((l) => `✗ ${l}`).join('\n'));
  process.exit(1);
}
