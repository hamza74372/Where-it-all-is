// The two listing videos (1920×1080 MP4, 12–15 s, no sound), recorded from the real app with
// its example numbers. The app runs in a phone frame on a branded stage; a gentle cursor glides to
// each target and shows a tap. Run after `npm run build`:  npm run listing:video
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { BUILD, COPY, OUT, ROOT, SCENE_DAY, finishImportUntil, importStatementA, openExampleApp, settle, startServer, statementB } from './lib.mjs';
import { calibrateClosing } from './capture.mjs';

const W = 1920;
const H = 1080;
const APP_W = 430; // a large phone, so Today's chips fit under the number
const APP_H = 932;
const MIN_S = 12;
const MAX_S = 15;

function stage(server, v) {
  const b = server.base;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="${b}/src/tokens.css"><link rel="stylesheet" href="${b}/src/fonts.css">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { font-family: var(--font); color: var(--hero-text); -webkit-font-smoothing: antialiased;
         background: radial-gradient(1100px 800px at 75% 20%, var(--hero-end), transparent 70%), var(--hero-start); }
  .copy { position: absolute; left: 150px; top: 0; bottom: 0; width: 760px; display: flex; flex-direction: column; justify-content: center; }
  .logo { height: 46px; margin-bottom: 56px; align-self: flex-start; }
  h1 { font-family: var(--font-display); font-weight: 640; font-size: 92px; line-height: 1.05; letter-spacing: -0.015em; }
  p { margin-top: 30px; font-size: 38px; line-height: 1.35; color: var(--hero-muted); }
  .device { position: absolute; right: 230px; top: ${(H - APP_H - 36) / 2}px; padding: 18px; border-radius: 64px; background: #0E1526;
            box-shadow: 0 30px 80px rgb(0 0 0 / 40%); }
  iframe { display: block; width: ${APP_W}px; height: ${APP_H}px; border: 0; border-radius: 48px; background: var(--bg); }
  .cursor { position: absolute; left: 0; top: 0; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
            background: rgb(255 255 255 / 55%); border: 3px solid var(--hero-start); box-shadow: 0 4px 14px rgb(0 0 0 / 30%);
            transform: translate(${W + 80}px, ${H * 0.75}px); pointer-events: none; z-index: 10; }
  .ripple { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; border: 4px solid var(--accent);
            pointer-events: none; z-index: 9; animation: ripple 600ms var(--ease) forwards; }
  @keyframes ripple { from { transform: scale(0.6); opacity: 1; } to { transform: scale(2.4); opacity: 0; } }
</style></head><body>
  <div class="copy"><img class="logo" src="${b}/branding/wordmark-reverse.svg" alt=""><h1>${v.headline}</h1><p>${v.sub}</p></div>
  <div class="device"><iframe id="app" src="${server.app}"></iframe></div>
  <div class="cursor" id="cursor"></div>
<script>
  const c = document.getElementById('cursor');
  window.moveCursor = (x, y, ms) => new Promise((done) => {
    c.style.transition = 'transform ' + ms + 'ms cubic-bezier(0.45, 0, 0.2, 1)';
    c.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    setTimeout(done, ms + 30);
  });
  window.tapAt = (x, y) => {
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    document.body.appendChild(r);
    c.animate([{ scale: 1 }, { scale: 0.8 }, { scale: 1 }], { duration: 260 });
    setTimeout(() => r.remove(), 700);
  };
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
  const t0 = Date.now() / 1000;
  await run();
  const t1 = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  return { frames, t0, t1 };
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
    const start = i === 0 ? t0 : f.t;
    const end = i + 1 < frames.length ? frames[i + 1].t : t1;
    lines.push(`file '${file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, end - start).toFixed(4)}`);
  });
  lines.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`).replace(/\\/g, '/')}'`);
  const list = path.join(dir, 'frames.txt');
  fs.writeFileSync(list, lines.join('\n'));
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=30,scale=${W}:${H},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', '-movflags', '+faststart', out]);
  return t1 - t0;
}

/** Glide the cursor to an element in the app, then tap it for real. */
function director(page) {
  const app = page.frameLocator('#app');
  const centre = async (locator, below = false) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error('Target not visible');
    // below: rest just under the target, so its label stays readable.
    return { x: box.x + box.width / 2, y: below ? box.y + box.height + 30 : box.y + box.height / 2 };
  };
  return {
    app,
    wait: (ms) => page.waitForTimeout(ms),
    async hover(locator, ms = 900, below = false) {
      const { x, y } = await centre(locator, below);
      await page.evaluate(([x, y, ms]) => window.moveCursor(x, y, ms), [x, y, ms]);
      return { x, y };
    },
    async tap(locator, ms = 900) {
      const { x, y } = await this.hover(locator, ms);
      await page.evaluate(([x, y]) => window.tapAt(x, y), [x, y]);
      await page.mouse.click(x, y);
    },
    /** Smooth-scroll the app's own scroller so `locator` comes into view (shown in the video). */
    async scrollTo(locator, block = 'center') {
      await locator.evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block);
      await page.waitForTimeout(900);
    },
    async away() {
      await page.evaluate(([x, y]) => window.moveCursor(x, y, 900), [W + 80, H * 0.75]);
    },
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

/** The app inside the stage's iframe, as a Playwright page-like object for setup helpers. */
const appFrame = (page) => page.frame({ url: /dist\/app\.html/ });

async function video1(browser, server) {
  const v = COPY.videos[0];
  const { ctx, page } = await newStage(browser, server, v);
  const frame = appFrame(page);
  await openExampleApp(frame, server, { coffee: true, navigate: false });
  const d = director(page);
  const chip = d.app.getByRole('button', { name: /^Coffee \$4\.50/ });
  await chip.scrollIntoViewIfNeeded();
  await settle(frame);
  const rec = await record(page, async () => {
    await d.wait(2000); // Today, the number
    await d.tap(chip, 1300);
    await d.wait(2200); // the number updates
    await d.hover(d.app.getByRole('button', { name: 'Undo' }), 1100, true);
    await d.wait(3300); // the undo toast
    await d.away();
    await d.wait(1700);
  });
  await ctx.close();
  return encode(rec, path.join(OUT, v.file));
}

async function video2(browser, server, closing) {
  const v = COPY.videos[1];
  const { ctx, page } = await newStage(browser, server, v);
  const frame = appFrame(page);
  await openExampleApp(frame, server, { coffee: false, navigate: false });
  await importStatementA(frame, BUILD);
  const file = path.join(BUILD, 'statement-october.csv');
  fs.writeFileSync(file, statementB(closing));
  const d = director(page);
  await d.app.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Log' }).click();
  await settle(frame);
  const rec = await record(page, async () => {
    await d.wait(700);
    await d.tap(d.app.getByRole('button', { name: 'Import statement' }), 1000);
    await d.wait(500);
    const chooser = page.waitForEvent('filechooser');
    await d.tap(d.app.locator('label.file-btn'), 900);
    await (await chooser).setFiles(file);
    await d.app.getByRole('heading', { name: 'Preview' }).waitFor();
    await d.wait(1200); // already imported
    await d.scrollTo(d.app.getByText('matches something you logged').nth(2));
    await d.wait(900); // matched to what you logged
    await d.tap(d.app.getByRole('button', { name: 'Continue' }), 900);
    await d.app.getByRole('heading', { name: 'Ready to import' }).waitFor();
    await d.wait(1500); // linked, not added twice · skipped
    await d.tap(d.app.getByRole('button', { name: /^(Import|Link) \d+/ }), 800);
    await finishImportUntil(frame, frame.getByRole('heading', { name: 'Your bank and the app agree' }));
    await d.away();
    await d.wait(1800);
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
    if (s < MIN_S || s > MAX_S) throw new Error(`${f} is ${s.toFixed(1)} s (want ${MIN_S}–${MAX_S} s)`);
  });
} finally {
  await browser.close();
  await server.close();
}
