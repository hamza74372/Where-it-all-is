// Captures everything the videos are built from, from the real app (dist/app.html, example numbers):
// stills (PNG), action clips (MP4, recorded with Chromium's screencast) and scenes.json — the real numbers
// and on-screen positions the compositions use for zooms, tags and the cursor.
// Fails if the app doesn't show the numbers the scenes say.
// Run from video/:  npm run capture   (after `npm run build` in the app)
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// The listing's helpers: a local server, the example-numbers app on SCENE_DAY, the import fixtures.
import {
  BUILD, PHONE, SCENE_DAY, STATEMENT_A, finishImportUntil, hideExampleBanner, importFile, nav, openExampleApp, settle, startServer,
} from '../scripts/listing/lib.mjs';
import { captureAll } from '../scripts/listing/capture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'public', 'capture');
const require = (await import('node:module')).createRequire(import.meta.url);
const ffmpeg: string = require(path.join(ROOT, 'node_modules/ffmpeg-static'));

/** The phone the clips and stills are taken on: a large phone, so Today's number and chips fit. */
const APP = { width: 430, height: 932 };
const STILL_SCALE = 3;
const CLIP_SCALE = 2;
const CLIP_FPS = 30;

type Rect = { x: number; y: number; width: number; height: number };
const scenes: Record<string, unknown> = { app: APP };
const PHONE_OPTS = { ...PHONE, colorScheme: 'light' as const };

function expectEqual(what: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Capture check failed — ${what}: the app shows ${JSON.stringify(actual)}, the video says ${JSON.stringify(expected)}`);
  }
}

async function rectOf(locator: Locator, relativeTo?: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element not visible');
  if (!relativeTo) return box;
  const base = (await relativeTo.boundingBox())!;
  return { x: box.x - base.x, y: box.y - base.y, width: box.width, height: box.height };
}

async function phone(browser: Browser, scale = STILL_SCALE) {
  const ctx = await browser.newContext({ ...PHONE_OPTS, viewport: APP, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Toasts are for the moment; stills leave them out (clips keep them). */
async function still(target: Page | Locator, name: string) {
  const page = 'page' in target && typeof target.page === 'function' ? (target as Locator).page() : (target as Page);
  await page.addStyleTag({ content: '.toast-region { display: none !important; }' });
  await target.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
}

/** Records the page with Chromium's screencast while `run` happens; encodes a 30 fps H.264 clip. */
async function clip(page: Page, name: string, run: () => Promise<void>): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  const frames: Array<{ data: string; t: number }> = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: APP.width * CLIP_SCALE, maxHeight: APP.height * CLIP_SCALE, everyNthFrame: 1 });
  await page.waitForTimeout(300);
  const t0 = Date.now() / 1000;
  await run();
  const t1 = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  const dir = path.join(BUILD, `clip-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const kept = frames.filter((f, i) => f.t >= t0 - 0.05 || i === frames.findLastIndex((g) => g.t < t0));
  const lines: string[] = [];
  kept.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`).replace(/\\/g, '/');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const end = i + 1 < kept.length ? kept[i + 1].t : t1;
    lines.push(`file '${file}'`, `duration ${Math.max(0.001, end - Math.max(t0, f.t)).toFixed(4)}`);
  });
  lines.push(lines[lines.length - 2]);
  fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n'));
  const out = path.join(OUT, `${name}.mp4`);
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', `fps=${CLIP_FPS},scale=${APP.width * CLIP_SCALE}:${APP.height * CLIP_SCALE},format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-an', '-movflags', '+faststart', out]);
  return t1 - t0;
}

const hero = (page: Page) => page.locator('.hero .big-number');
const heroText = async (page: Page) => (await hero(page).textContent())?.trim();

// Video B's statements: A is imported first (its rows come back as "already imported"); B has five spends the
// example numbers already logged and two new ones, so the import moves the balance and the number.
const B_ROWS: Array<[string, string, number]> = [
  ['10/02/2026', 'CORNER SHOP', -620],
  ['10/03/2026', 'FUEL STATION', -4000],
  ['10/05/2026', 'PHARMACY', -980],
  ['10/08/2026', 'GROCERY MARKET', -2875],
  ['10/09/2026', 'BOOKSHOP', -1299],
  ['10/10/2026', 'MUSIC SUBSCRIPTION', -1099],
  ['10/11/2026', 'TRANSIT CARD', -1800],
  ['10/12/2026', 'SUPERMARKET', -3420],
  ['10/12/2026', 'COFFEE SHOP', -450],
  ['10/13/2026', 'BURRITO BAR', -1140],
];
function statement(closing: number) {
  let after = closing;
  const balances: number[] = [];
  for (let i = B_ROWS.length - 1; i >= 0; i--) {
    balances[i] = after;
    after -= B_ROWS[i][2];
  }
  const money = (m: number) => (m < 0 ? '-' : '') + (Math.abs(m) / 100).toFixed(2);
  return ['Date,Description,Amount,Balance', ...B_ROWS.map(([d, desc, a], i) => `${d},${desc},${money(a)},${money(balances[i])}`)].join('\n') + '\n';
}

async function importUpTo(page: Page, server: Awaited<ReturnType<typeof startServer>>, closing: number) {
  await openExampleApp(page, server, { coffee: false });
  const a = path.join(BUILD, 'video-statement-a.csv');
  fs.writeFileSync(a, STATEMENT_A);
  await importFile(page, a);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
  await finishImportUntil(page, page.getByRole('heading', { name: /^Imported|^Linked/ }));
  await page.getByRole('button', { name: 'Done' }).click();
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  const b = path.join(BUILD, 'statement.csv');
  fs.writeFileSync(b, statement(closing));
  return b;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(BUILD, { recursive: true });
const server = await startServer();
const browser = await chromium.launch();
try {
  // ---------- Video A: Today, the coffee tap, the breakdown, the calendar ----------
  {
    const { ctx, page } = await phone(browser);
    await openExampleApp(page, server, { coffee: true });
    await page.locator('#main').evaluate((m) => m.scrollTo(0, 0));
    await settle(page);
    expectEqual('Today before the coffee', await heroText(page), '$380');
    await still(page, 'today-380');
    scenes.today = { number: '$380', hero: await rectOf(page.locator('.hero')), heroNumber: await rectOf(hero(page)) };
    await ctx.close();
  }
  {
    const { ctx, page } = await phone(browser, CLIP_SCALE);
    await openExampleApp(page, server, { coffee: true });
    await page.locator('#main').evaluate((m) => m.scrollTo(0, 0));
    await settle(page);
    const chip = page.getByRole('button', { name: /^Coffee \$4\.50/ });
    const chipRect = await rectOf(chip);
    const TAP_AT = 1.2;
    const length = await clip(page, 'coffee-tap', async () => {
      await page.waitForTimeout(TAP_AT * 1000);
      await chip.click();
      await page.waitForFunction(() => document.querySelector('.hero .big-number')?.textContent?.trim() === '$376');
      await page.waitForTimeout(2200);
    });
    expectEqual('Today after the coffee', await heroText(page), '$376');
    expectEqual('the undo toast', (await page.locator('.toast').first().textContent())?.replace(/\s+/g, ' ').trim(), 'Logged $4.50 · CoffeeUndo');
    scenes.coffee = { tapAt: TAP_AT, length, chip: chipRect, before: '$380', after: '$376', toast: 'Logged $4.50 · Coffee' };
    // The breakdown, as it is after the coffee.
    await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
    await page.locator('.sheet-panel').waitFor();
    await settle(page);
    await page.waitForTimeout(800);
    const rows = page.locator('.sheet-body ul:has(.explain-line)').first();
    await ctx.close();
    const { ctx: c2, page: p2 } = await phone(browser);
    await openExampleApp(p2, server, { coffee: true });
    await p2.getByRole('button', { name: /^Coffee \$4\.50/ }).click();
    await p2.waitForFunction(() => document.querySelector('.hero .big-number')?.textContent?.trim() === '$376');
    await p2.getByRole('button', { name: 'How is this worked out?' }).last().click();
    await p2.locator('.sheet-panel').waitFor();
    await settle(p2);
    await p2.waitForTimeout(1200);
    const rows2 = p2.locator('.sheet-body ul:has(.explain-line)').first();
    const lines = (await rows2.locator('.explain-line').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
    if (!lines.some((l) => l.startsWith('Safe to spend today'))) throw new Error(`Breakdown rows missing "Safe to spend today": ${lines.join(' | ')}`);
    await still(rows2, 'breakdown-376');
    scenes.breakdown = { lines };
    void rows;
    await c2.close();
  }
  {
    const { ctx, page } = await phone(browser);
    await openExampleApp(page, server, { coffee: false });
    await nav(page, 'Bills').click();
    await page.getByRole('radio', { name: 'Calendar' }).click();
    await settle(page);
    // Days that have something on them: 'Fri, Oct 16, payday' or 'Thu, Oct 15, Electric'.
    const cells: Array<{ label: string; kind: 'payday' | 'bill'; rect: Rect }> = [];
    for (const b of await page.getByRole('button', { name: /Oct \d+/ }).all()) {
      const label = (await b.getAttribute('aria-label')) ?? '';
      const parts = label.split(', ');
      if (parts.length > 2) cells.push({ label, kind: label.includes('payday') ? 'payday' : 'bill', rect: await rectOf(b) } as never);
    }
    if (!cells.some((c) => c.kind === 'payday') || !cells.some((c) => c.kind === 'bill')) {
      throw new Error(`Calendar highlights missing a payday or a bill: ${cells.map((c) => c.label).join(' | ')}`);
    }
    await still(page, 'bills-calendar');
    scenes.calendar = { cells };
    await ctx.close();
  }

  // ---------- Video B: the import ----------
  // Calibrate: what the app's balance is at the end of the statement (its own balance check says).
  let closing = 0;
  {
    const { ctx, page } = await phone(browser, 1);
    const file = await importUpTo(page, server, 0);
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
    await finishImportUntil(page, page.getByRole('heading', { name: /^Your bank/ }));
    const heading = (await page.getByRole('heading', { name: /^Your bank/ }).textContent()) ?? '';
    const m = heading.match(/the app says \$([\d,]+\.\d\d)/);
    if (!m) throw new Error(`Couldn't read the app's balance: ${heading}`);
    closing = Math.round(Number(m[1].replace(/,/g, '')) * 100);
    await ctx.close();
  }
  {
    const { ctx, page } = await phone(browser);
    const file = await importUpTo(page, server, closing);
    await settle(page);
    await still(page, 'import-pick');
    const dropZone = await rectOf(page.locator('.drop-zone'));
    await page.locator('input[type=file]').setInputFiles(file);
    const preview = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Preview', exact: true }) }).last();
    await preview.waitFor();
    await preview.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await settle(page);
    // Each row: its place in the card and what the app says about it.
    const rowEls = await preview.locator('li.row').all();
    const rows: Array<{ rect: Rect; tag: 'already imported' | 'matches your entry' | 'new'; text: string }> = [];
    for (const r of rowEls) {
      const text = (await r.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
      const tag = /already imported/.test(text) ? 'already imported' : /matches something you logged/.test(text) ? 'matches your entry' : 'new';
      rows.push({ rect: await rectOf(r, preview), tag, text });
    }
    await page.addStyleTag({ content: 'nav[aria-label="Main"] { visibility: hidden !important; }' });
    await ctx.close();
    // The preview card on a tall phone, so every row is in the picture.
    const tall = await browser.newContext({ ...PHONE_OPTS, viewport: { width: APP.width, height: 2200 }, deviceScaleFactor: STILL_SCALE });
    const tp = await tall.newPage();
    const f2 = await importUpTo(tp, server, closing);
    await tp.locator('input[type=file]').setInputFiles(f2);
    const card = tp.locator('.card').filter({ has: tp.getByRole('heading', { name: 'Preview', exact: true }) }).last();
    await card.waitFor();
    await tp.addStyleTag({ content: 'nav[aria-label="Main"] { visibility: hidden !important; }' });
    await settle(tp);
    await still(card, 'import-preview');
    const cardRows: typeof rows = [];
    for (const r of await card.locator('li.row').all()) {
      const text = (await r.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
      const tag = /already imported/.test(text) ? 'already imported' : /matches something you logged/.test(text) ? 'matches your entry' : 'new';
      cardRows.push({ rect: await rectOf(r, card), tag, text });
    }
    const cardRect = await rectOf(card);
    const count = (t: string) => cardRows.filter((r) => r.tag === t).length;
    expectEqual('preview tags (skipped · linked · new)', [count('already imported'), count('matches your entry'), count('new')], [3, 5, 2]);
    await tp.getByRole('button', { name: 'Continue' }).click();
    const review = tp.locator('.card').filter({ has: tp.getByRole('heading', { name: 'Ready to import' }) }).last();
    await review.waitFor();
    const reviewText = (await review.textContent())?.replace(/\s+/g, ' ') ?? '';
    for (const want of ['2 new transactions', '5 already in the app', '3 already imported before — skipped']) {
      if (!reviewText.includes(want)) throw new Error(`"Ready to import" doesn't say "${want}": ${reviewText}`);
    }
    await tp.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
    await finishImportUntil(tp, tp.getByRole('heading', { name: 'Your bank and the app agree' }));
    const agree = tp.locator('.card').filter({ has: tp.getByRole('heading', { name: 'Your bank and the app agree' }) }).last();
    const both = ((await agree.textContent()) ?? '').match(/Both say (\$[\d,]+\.\d\d)/)?.[1];
    if (!both) throw new Error('The balance check doesn\'t say "Both say $…"');
    await settle(tp);
    await still(agree, 'import-balance');
    await tall.close();
    scenes.import = { dropZone, preview: { rect: cardRect, rows: cardRows }, counts: { skipped: 3, linked: 5, new: 2 }, both };
    void rows;
  }
  {
    // Today after the import: the number has moved (the statement's two new spends).
    const { ctx, page } = await phone(browser);
    const file = await importUpTo(page, server, closing);
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
    await finishImportUntil(page, page.getByRole('heading', { name: 'Your bank and the app agree' }));
    await page.getByRole('button', { name: 'Continue' }).click();
    await finishImportUntil(page, page.getByRole('button', { name: 'Done' }));
    await page.getByRole('button', { name: 'Done' }).click();
    await nav(page, 'Today').click();
    await hideExampleBanner(page);
    await page.locator('#main').evaluate((m) => m.scrollTo(0, 0));
    await settle(page);
    const after = await heroText(page);
    if (!after || after === '$380') throw new Error(`Today after the import should show a new number, shows ${after}`);
    await still(page, 'today-after-import');
    scenes.todayAfterImport = { before: '$380', after, heroNumber: await rectOf(hero(page)) };
    await ctx.close();
  }

  // ---------- The longer video: typing a quick log, and the listing's crops ----------
  {
    const { ctx, page } = await phone(browser, CLIP_SCALE);
    await openExampleApp(page, server, { coffee: false });
    await page.locator('#main').evaluate((m) => m.scrollTo(0, 0));
    await settle(page);
    const box = page.getByRole('textbox', { name: 'Log a spend' });
    const boxRect = await rectOf(box);
    const length = await clip(page, 'type-quick-log', async () => {
      await page.waitForTimeout(700);
      await box.click();
      await page.keyboard.type('12.50 lunch', { delay: 110 });
      await page.waitForTimeout(500);
      await box.press('Enter');
      await page.locator('#ql-preview').getByText('Saved').waitFor();
      await page.waitForTimeout(1300);
    });
    expectEqual('Today after the lunch', await heroText(page), '$368');
    scenes.typing = { box: boxRect, length, before: '$380', after: '$368' };
    await ctx.close();
  }
  await captureAll(browser, server); // envelopes, goals, debt, insights, away, partner… (listing/.build)
  for (const name of ['plan-envelopes', 'plan-goal', 'plan-debt', 'insights-donut', 'insights-flow', 'away-1', 'away-2', 'away-3', 'quick-log', 'bills-rows', 'partner-share']) {
    fs.copyFileSync(path.join(BUILD, `${name}.png`), path.join(OUT, `${name}.png`));
  }
  for (const d of ['desktop', 'tablet', 'phone']) fs.copyFileSync(path.join(ROOT, `docs/device-shots/${d}-light.png`), path.join(OUT, `device-${d}.png`));
} finally {
  await browser.close();
  await server.close();
}

// Brand files and fonts, from the app.
const brand = path.join(HERE, 'public', 'brand');
fs.mkdirSync(brand, { recursive: true });
for (const f of ['logo.svg', 'logo-reverse.svg', 'wordmark.svg', 'wordmark-reverse.svg']) fs.copyFileSync(path.join(ROOT, 'branding', f), path.join(brand, f));
const fonts = path.join(HERE, 'public', 'fonts');
fs.mkdirSync(fonts, { recursive: true });
for (const w of ['400', '600', '700']) fs.copyFileSync(path.join(ROOT, `node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`), path.join(fonts, `inter-${w}.woff2`));
fs.copyFileSync(path.join(ROOT, 'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2'), path.join(fonts, 'fraunces.woff2'));

scenes.capturedOn = SCENE_DAY.toISOString();
fs.writeFileSync(path.join(OUT, 'scenes.json'), JSON.stringify(scenes, null, 2));
console.log(`Captured to ${OUT}`);
