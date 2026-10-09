// Renders the videos with Remotion, then remuxes for the web: H.264, 30 fps, CRF 18, yuv420p,
// +faststart, no audio track. Run from video/:  npm run render  (after npm run capture)
// Pass names to render only some: npm run render -- OneNumber Import
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ffmpeg: string = createRequire(import.meta.url)(path.join(ROOT, 'node_modules/ffmpeg-static'));

export const OUTPUTS: Record<string, string> = {
  OneNumber: path.join(ROOT, 'listing/video-1-one-number.mp4'),
  Import: path.join(ROOT, 'listing/video-2-import.mp4'),
  Product: path.join(HERE, 'out/product-60s.mp4'),
  ProductVertical: path.join(HERE, 'out/product-60s-vertical.mp4'),
};

const only = process.argv.slice(2);
fs.mkdirSync(path.join(HERE, 'out/raw'), { recursive: true });
for (const [id, out] of Object.entries(OUTPUTS)) {
  if (only.length && !only.includes(id)) continue;
  const raw = path.join(HERE, 'out/raw', `${id}.mp4`);
  console.log(`Rendering ${id}…`);
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['remotion', 'render', 'src/index.ts', id, raw, '--codec=h264', '--crf=18', '--pixel-format=yuv420p', '--color-space=bt709', '--muted', '--concurrency=4', '--log=warn'],
    { cwd: HERE, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Same frames, re-wrapped: no audio track, moov atom first so it starts playing at once.
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-map', '0:v:0', '-c', 'copy', '-an', '-movflags', '+faststart', out]);
  console.log(`  → ${path.relative(ROOT, out)}`);
}
