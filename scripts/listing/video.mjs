// The two listing videos (1920×1080 MP4, 12–15 s, no sound), recorded from the real app with
// its example numbers. The phone layout is shown large (frame 1057 px tall) beside the headline.
// Our own cursor glides with CSS transitions (800 ms, ease-in-out); each tap shrinks it for 120 ms,
// shows a soft mint ripple, then makes the real click. Screens change with short cross-fades
// (no scrolling through lists); number changes get a gentle zoom inside the phone screen.
// Run after `npm run build`:  npm run listing:video
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { BUILD, COPY, OUT, ROOT, SCENE_DAY, finishImportUntil, importStatementA, openExampleApp, settle, startServer, statementB } from './lib.mjs';
import { calibrateClosing } from './capture.mjs';

const W = 1920;
const H = 1080;
const APP_W = 430;
const APP_H = 932;
const S = 1.1; // the phone screen, shown 1.1× (473 × 1025 px; frame 1057 px tall)
const BEZEL = 16;
const LIMITS = [[12, 14], [13, 15]];
const CHECK = path.join(OUT, 'frames-check');

const MOVE_MS = 800;
const HOLD_BEFORE = 800;
const HOLD_AFTER = 1200;

function stage(server, v) {
  const b = server.base;
  const phoneH = APP_H * S + BEZEL * 2;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="${b}/src/tokens.css"><link rel="stylesheet" href="${b}/src/fonts.css">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { font-family: var(--font); color: var(--hero-text); -webkit-font-smoothing: antialiased;
         background: radial-gradient(1100px 800px at 75% 20%, var(--hero-end), transparent 70%), var(--hero-start); }
  .copy { position: absolute; left: 150px; top: 0; bottom: 0; width: 760px; display: flex; flex-direction: column; justify-content: center; }
  .logo { height: 50px; margin-bottom: 52px; align-self: flex-start; }
  h1 { font-family: var(--font-display); font-weight: 600; font-size: 96px; line-height: 1.06; letter-spacing: 0.012em; }
  p { margin-top: 30px; font-size: 40px; line-height: 1.35; color: var(--hero-muted); }
  .device { position: absolute; left: 1100px; transform-origin: 0 0; transition: transform 700ms cubic-bezier(0.42, 0, 0.58, 1); top: ${(H - phoneH) / 2}px; padding: ${BEZEL}px; border-radius: 74px; background: #0E1526;
            box-shadow: 0 30px 80px rgb(0 0 0 / 40%); }
  .screen { position: relative; width: ${APP_W * S}px; height: ${APP_H * S}px; border-radius: 58px; overflow: hidden; background: var(--bg); }
  .zoom { position: absolute; left: 0; top: 0; width: ${APP_W}px; height: ${APP_H}px; transform-origin: 0 0; transform: scale(${S});
          transition: transform 600ms cubic-bezier(0.42, 0, 0.58, 1); }
  iframe { display: block; width: ${APP_W}px; height: ${APP_H}px; border: 0; background: var(--bg); }
  .veil { position: absolute; inset: 0; background: var(--bg) center / cover no-repeat; opacity: 0; transition: opacity 300ms ease; pointer-events: none; }
  .cursor { position: absolute; left: 0; top: 0; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
            background: rgb(255 255 255 / 60%); border: 3px solid var(--hero-start); box-shadow: 0 4px 14px rgb(0 0 0 / 30%);
            transform: translate(1700px, 1000px) scale(1); pointer-events: none; z-index: 10;
            transition: transform ${MOVE_MS}ms cubic-bezier(0.42, 0, 0.58, 1); }
  .ripple { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: rgb(124 200 181 / 45%);
            border: 3px solid var(--accent); pointer-events: none; z-index: 9; animation: ripple 400ms ease-out forwards; }
  @keyframes ripple { from { transform: scale(0.5); opacity: 1; } to { transform: scale(2.2); opacity: 0; } }
</style></head><body>
  <div class="copy"><img class="logo" src="${b}/branding/wordmark-reverse.svg" alt=""><h1>${v.headline}</h1><p>${v.sub}</p></div>
  <div class="device"><div class="screen"><div class="zoom" id="zoom"><iframe id="app" src="${server.app}"></iframe></div><div class="veil" id="veil"></div></div></div>
  <div class="cursor" id="cursor"></div>
<script>
  const c = document.getElementById('cursor');
  let at = { x: 1700, y: 1000 };
  const place = (scale) => { c.style.transform = 'translate(' + at.x + 'px, ' + at.y + 'px) scale(' + scale + ')'; };
  window.moveCursor = (x, y) => new Promise((done) => { at = { x, y }; c.style.transitionDuration = '${MOVE_MS}ms'; place(1); setTimeout(done, ${MOVE_MS} + 40); });
  window.pressCursor = () => new Promise((done) => {
    c.style.transitionDuration = '120ms';
    place(0.82);
    setTimeout(() => {
      place(1);
      const r = document.createElement('div');
      r.className = 'ripple';
      r.style.left = at.x + 'px';
      r.style.top = at.y + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 450);
      setTimeout(done, 400);
    }, 120);
  });
  const zoom = document.getElementById('zoom');
  /** Zoom the phone screen by k around a point given in app CSS pixels (k = 1: back to normal). */
  window.zoomTo = (px, py, k) => new Promise((done) => {
    const s = ${S} * k;
    zoom.style.transform = 'translate(' + (${S} * px * (1 - k)) + 'px, ' + (${S} * py * (1 - k)) + 'px) scale(' + s + ')';
    setTimeout(done, 640);
  });
  const veil = document.getElementById('veil');
  /** Cover the screen with a still of itself (instantly, so nothing visibly changes)… */
  window.freeze = (src) => new Promise((done) => {
    const img = new Image();
    img.onload = () => { veil.style.transition = 'none'; veil.style.backgroundImage = 'url(' + src + ')'; veil.style.opacity = '1'; requestAnimationFrame(() => done()); };
    img.src = src;
  });
  /** …then dissolve it away to show the new screen underneath. */
  window.thaw = () => new Promise((done) => { veil.style.transition = 'opacity 300ms ease'; veil.style.opacity = '0'; setTimeout(done, 320); });
  /** Camera close-up: scale the whole phone by k and move it by (tx, ty). */
  const device = document.querySelector('.device');
  window.closeUp = (tx, ty, k) => new Promise((done) => { device.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + k + ')'; setTimeout(done, 740); });
</script></body></html>`;
}

/** Records the stage with Chromium's screencast (crisp JPEG frames with timestamps). */
async function record(page, run) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await page.waitForTimeout(300); // the first frame arrives before anything happens: no loading frames
  const t0 = Date.now() / 1000;
  await run();
  const t1 = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  return { frames: frames.filter((f, i) => f.t >= t0 - 0.05 || i === frames.findLastIndex((g) => g.t < t0)), t0, t1 };
}

/** Frames → H.264 MP4 at 30 fps, holding each frame for as long as it was on screen. */
function encode({ frames, t0, t1 }, out) {
  if (!frames.length) throw new Error('No frames recorded');
  const dir = path.join(BUILD, path.basename(out, '.mp4'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const lines = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const start = Math.max(t0, f.t);
    const end = i + 1 < frames.length ? frames[i + 1].t : t1;
    lines.push(`file '${file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, end - start).toFixed(4)}`);
  });
  lines.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`).replace(/\\/g, '/')}'`);
  const list = path.join(dir, 'frames.txt');
  fs.writeFileSync(list, lines.join('\n'));
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=30,scale=${W}:${H}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out]);
  // A 2-frames-per-second contact sheet to check for jumps, a missing cursor or half-drawn frames.
  fs.mkdirSync(CHECK, { recursive: true });
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', out, '-vf', 'fps=2,scale=480:-1,tile=6x5:padding=6:color=0xE9E4D8', '-frames:v', '1',
    path.join(CHECK, `${path.basename(out, '.mp4')}-2fps.jpg`)]);
  return t1 - t0;
}

/** Moves our cursor to elements in the app (mapped from app pixels to the stage) and taps them. */
function director(page) {
  const frame = page.frame({ url: /dist\/app\.html/ });
  const toStage = async (locator) => {
    const screen = await page.locator('.screen').boundingBox();
    const r = await locator.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, top: b.y, bottom: b.y + b.height };
    });
    return { x: screen.x + r.x * S, y: screen.y + r.y * S, app: r };
  };
  return {
    frame,
    wait: (ms) => page.waitForTimeout(ms),
    async moveTo(locator, { below = false } = {}) {
      await page.waitForTimeout(HOLD_BEFORE);
      const p = await toStage(locator);
      const y = below ? p.y + ((p.app.bottom - p.app.top) / 2) * S + 34 : p.y;
      await page.evaluate(([x, y]) => window.moveCursor(x, y), [p.x, y]);
    },
    /** Hold, glide, press (120 ms + ripple), then the real click. */
    async tap(locator, click = () => locator.evaluate((el) => el.click())) {
      await this.moveTo(locator);
      await page.evaluate(() => window.pressCursor());
      await click();
    },
    /** A short cross-fade: freeze the screen as it is, change it underneath, dissolve to the new one. */
    async crossFade(work) {
      const still = await page.locator('.screen').screenshot({ type: 'jpeg', quality: 92 });
      await page.evaluate((src) => window.freeze(src), `data:image/jpeg;base64,${still.toString('base64')}`);
      await work();
      await settle(frame);
      await page.waitForTimeout(150);
      await page.evaluate(() => window.thaw());
    },
    /** Close-up on an element: the phone scales by k so the element's top-left lands at (x, y) on the stage. */
    async closeUp(locator, k, x, y) {
      const device = await page.locator('.device').boundingBox();
      const screen = await page.locator('.screen').boundingBox();
      const r = await locator.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y }; });
      const q = { x: screen.x + r.x * S - device.x, y: screen.y + r.y * S - device.y }; // in the phone's own pixels
      await page.evaluate(([tx, ty, k]) => window.closeUp(tx, ty, k), [x - device.x - k * q.x, y - device.y - k * q.y, k]);
    },
    async zoom(locator, k) {
      const r = await locator.evaluate((el) => {
        const b = el.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      });
      await page.evaluate(([x, y, k]) => window.zoomTo(x, y, k), [r.x, r.y, k]);
    },
    unzoom: () => page.evaluate(() => window.zoomTo(0, 0, 1)),
  };
}

async function newStage(browser, server, v) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'en-US' });
  const page = await ctx.newPage();
  await page.clock.install({ time: SCENE_DAY });
  await page.goto(server.page(`stage-${v.file}`, stage(server, v)));
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

async function video1(browser, server) {
  const v = COPY.videos[0];
  const { ctx, page } = await newStage(browser, server, v);
  const d = director(page);
  await openExampleApp(d.frame, server, { coffee: true, navigate: false });
  const chip = d.frame.getByRole('button', { name: /^Coffee \$4\.50/ });
  await d.frame.locator('#main').evaluate((m) => m.scrollTo(0, 0));
  await settle(d.frame);
  const hero = d.frame.locator('.hero .big-number');
  const before = await hero.textContent();
  const rec = await record(page, async () => {
    await d.wait(2800); // Today: $380
    await d.tap(chip);
    await page.waitForFunction(([b]) => {
      const el = document.querySelector('#app').contentDocument.querySelector('.hero .big-number');
      return el && el.textContent !== b;
    }, [before]);
    await d.zoom(d.frame.locator('.hero .big-number'), 1.15); // $380 → $376
    await d.wait(HOLD_AFTER);
    await d.unzoom();
    await d.wait(1000);
    await d.moveTo(d.frame.getByRole('button', { name: 'Undo' }), { below: true }); // the undo toast
    await d.wait(2000);
  });
  const after = await hero.textContent();
  console.log(`video 1: ${before} → ${after}`);
  await ctx.close();
  return encode(rec, path.join(OUT, v.file));
}

async function video2(browser, server, closing) {
  const v = COPY.videos[1];
  const { ctx, page } = await newStage(browser, server, v);
  const d = director(page);
  const f = d.frame;
  await openExampleApp(f, server, { coffee: false, navigate: false });
  await importStatementA(f, BUILD);
  const file = path.join(BUILD, 'statement-october.csv');
  fs.writeFileSync(file, statementB(closing));
  await f.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Log' }).click();
  await settle(f);
  const top = () => f.locator('#main').evaluate((m) => m.scrollTo(0, 0));
  const rec = await record(page, async () => {
    await d.wait(400);
    await d.tap(f.getByRole('button', { name: 'Import statement' }));
    await f.getByRole('heading', { name: 'Import a statement' }).waitFor();
    await d.wait(500);
    await d.tap(f.locator('label.file-btn'), () => f.locator('input[type=file]').setInputFiles(file));
    await f.getByRole('heading', { name: 'Preview' }).waitFor();
    // Jump to the preview rows: already imported, then matched to what you logged.
    await d.crossFade(() => f.getByRole('heading', { name: 'Preview' }).evaluate((h) => h.scrollIntoView({ block: 'start' })));
    await d.wait(1700);
    await d.crossFade(async () => {
      await f.getByRole('button', { name: 'Continue' }).click();
      await f.getByRole('heading', { name: 'Ready to import' }).waitFor();
      await top();
    });
    await d.wait(1600); // the counts
    await d.crossFade(async () => {
      await f.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
      await finishImportUntil(f, f.getByRole('heading', { name: 'Your bank and the app agree' }));
      await top();
    });
    await d.wait(500);
    // Close-up on the balance check: the card large, beside the headline (no empty phone below it).
    await d.closeUp(f.locator('.card').filter({ hasText: 'Your bank and the app agree' }).first(), 2, 990, 330);
    await page.evaluate(() => window.moveCursor(1430, 800)); // out of the way, below the card
    await d.wait(1100); // final state on screen ~2 s in all
  });
  await ctx.close();
  return encode(rec, path.join(OUT, v.file));
}

if (!fs.existsSync(path.join(ROOT, 'dist/app.html'))) throw new Error('Build the app first: npm run build');
fs.mkdirSync(BUILD, { recursive: true });
const server = await startServer();
const browser = await chromium.launch();
try {
  const closing = await calibrateClosing(browser, server);
  const lengths = [await video1(browser, server), await video2(browser, server, closing)];
  lengths.forEach((s, i) => {
    const f = COPY.videos[i].file;
    console.log(`${f}  ${s.toFixed(1)} s  ${(fs.statSync(path.join(OUT, f)).size / 1024 / 1024).toFixed(1)} MB`);
  });
  lengths.forEach((s, i) => {
    const [lo, hi] = LIMITS[i];
    if (s < lo || s > hi) throw new Error(`${COPY.videos[i].file} is ${s.toFixed(1)} s (want ${lo}–${hi} s)`);
  });
} finally {
  await browser.close();
  await server.close();
}
