// Start-Here PDF (2 pages) for the Etsy download, generated from HTML with values from
// site.config.json — in Letter and A4 (dist/Start-Here-Letter.pdf, dist/Start-Here-A4.pdf).
// The app link, its QR code and the file name all come from the config at build time.
// Also copies the single-file app to its customer-facing name.
// Run after `npm run build`: node scripts/build-pdf.mjs   (or `npm run package` for everything)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import qrcode from 'qrcode-generator';

const cfg = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
const APP_URL = `${cfg.siteUrl.replace(/\/$/, '')}/${cfg.appPath}/`;
const DEMO_URL = `${cfg.siteUrl.replace(/\/$/, '')}/demo/`;
const PAPERS = { Letter: { w: '8.5in', h: '11in' }, A4: { w: '210mm', h: '297mm' } };
// Long links may wrap only after a slash (never at the hyphens in "where-it-all-is").
const wrapUrl = (u) =>
  u.split(/(?<=\/)(?=[^/])/).map((part) => `<span style="white-space:nowrap">${esc(part)}</span>`).join('<wbr>');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

// QR code for the app link, drawn as SVG squares (crisp at any print size). 'M' error correction
// survives a slightly smudged printout; 4-module quiet zone as the standard asks.
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${esc(text)}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
const APP_QR = qrSvg(APP_URL);

if (!fs.existsSync('dist/app.html')) throw new Error('Build the app first: npm run build');
fs.copyFileSync('dist/app.html', path.join('dist', cfg.downloadFileName));

const browser = await chromium.launch();

// 1. Real screenshots of the app (example numbers) for the guide.
async function appShot(steps) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(pathToFileURL(path.resolve('dist/app.html')).href);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.locator('.big-number').waitFor();
  await steps(page);
  await page.waitForTimeout(250);
  const buf = await page.screenshot();
  await ctx.close();
  return `data:image/png;base64,${buf.toString('base64')}`;
}
const todayShot = await appShot(async (page) => {
  await page.getByRole('button', { name: 'Clear examples' }).waitFor();
  await page.addStyleTag({ content: '.card-note { display: none !important; }' }); // hide the example-numbers banner
});
const backupShot = await appShot(async (page) => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: /^Backup & restore/ }).click();
  await page.locator('#bk-now').evaluate((el) => el.scrollIntoView({ block: 'start' }));
});

// Drawn step illustrations (used unless real device screenshots are set in the config).
const iosShare = `<svg viewBox="0 0 40 40" class="glyph" aria-hidden="true"><rect x="9" y="15" width="22" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 4v20M13 11l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const dotsMenu = `<svg viewBox="0 0 40 40" class="glyph" aria-hidden="true"><circle cx="20" cy="9" r="3" fill="currentColor"/><circle cx="20" cy="20" r="3" fill="currentColor"/><circle cx="20" cy="31" r="3" fill="currentColor"/></svg>`;
const addSquare = `<svg viewBox="0 0 40 40" class="glyph" aria-hidden="true"><rect x="6" y="6" width="28" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 13v14M13 20h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const realOr = (file, fallback) => (file && fs.existsSync(file) ? `<img class="device-shot" src="${dataUri(file)}" alt="" />` : fallback);

const iphoneSteps = realOr(
  cfg.startHere?.iphoneAddToHomeScreenImage,
  `<ol class="mini"><li><span class="pill">${iosShare}</span><span>Tap <b>Share</b></span></li><li><span class="pill">${addSquare}</span><span><b>Add to Home Screen</b></span></li><li><span class="pill pill-text">Add</span><span>Tap <b>Add</b></span></li></ol>`,
);
const androidSteps = realOr(
  cfg.startHere?.androidInstallImage,
  `<ol class="mini"><li><span class="pill">${dotsMenu}</span><span>Tap the <b>⋮</b> menu</span></li><li><span class="pill pill-text">Install</span><span>Tap <b>Install app</b> (or <b>Add to Home screen</b>)</span></li><li><span class="pill pill-text">OK</span><span>Confirm</span></li></ol>`,
);

// 2. The two pages.
const makeHtml = (PAPER, PAGE) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(cfg.productName)} — Start here</title>
<style>
  @page { size: ${PAPER}; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.42 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: ${PAGE.w}; height: ${PAGE.h}; padding: 0.55in 0.6in 0.8in; overflow: hidden; page-break-after: always; position: relative; background: #fff; }
  .page:last-child { page-break-after: auto; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  header img { width: 52px; height: 52px; border-radius: 13px; }
  h1 { font-size: 22pt; margin: 0; letter-spacing: -0.01em; }
  .sub { margin: 2px 0 0; color: #5a6070; font-size: 11pt; }
  h2 { font-size: 13.5pt; margin: 12px 0 6px; color: #2f6f62; }
  h2 .n { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: #2f6f62; color: #fff; font-size: 11pt; align-items: center; justify-content: center; margin-right: 6px; vertical-align: 1px; }
  p { margin: 4px 0; }
  .url { display: block; margin: 6px 0; padding: 9px 12px; border: 1.5px solid #2f6f62; border-radius: 10px; font: 600 10.5pt ui-monospace, Menlo, Consolas, monospace; overflow-wrap: anywhere; background: #f1f7f5; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .box { border: 1px solid #dcd8ce; border-radius: 12px; padding: 10px 12px; background: #fbfaf7; }
  .box h3 { margin: 0 0 6px; font-size: 11pt; }
  .warn { border: 1.5px solid #e8b54a; background: #fff8e8; border-radius: 12px; padding: 9px 12px; margin: 10px 0; }
  .note { border-left: 4px solid #2f6f62; background: #f1f7f5; padding: 8px 12px; border-radius: 0 10px 10px 0; margin: 10px 0; }
  ol, ul { margin: 4px 0; padding-left: 1.2em; }
  li { margin: 3px 0; }
  ol.mini { list-style: none; padding: 0; margin: 0; }
  ol.mini li { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 10pt; }
  .pill { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 30px; padding: 0 6px; border-radius: 8px; background: #fff; border: 1px solid #c9c4b8; color: #1d5fd1; flex: none; }
  .pill-text { font-weight: 700; font-size: 9pt; }
  .glyph { width: 20px; height: 20px; }
  .shots { display: flex; gap: 14px; align-items: flex-start; }
  .phone { width: 1.75in; border-radius: 18px; border: 6px solid #1f2430; overflow: hidden; flex: none; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
  .phone img { display: block; width: 100%; }
  .device-shot { width: 100%; border-radius: 10px; border: 1px solid #dcd8ce; }
  .cap { font-size: 9pt; color: #5a6070; margin-top: 4px; text-align: center; }
  footer { position: absolute; left: 0.6in; right: 0.6in; bottom: 0.38in; font-size: 8.5pt; color: #5a6070; display: flex; justify-content: space-between; border-top: 1px solid #e6e2d8; padding-top: 6px; }
  b { font-weight: 700; }
  a { color: inherit; text-decoration: none; }
  .qr-row { display: flex; align-items: center; gap: 12px; margin: 8px 0 2px; }
  .qr { width: 1.05in; height: 1.05in; flex: none; display: block; }
  .qr-cap { font-size: 10pt; font-weight: 600; margin: 0; }
  .week { margin-top: 8px; border: 1px solid #b9d8cf; background: #f1f7f5; border-radius: 12px; padding: 10px 14px; }
  .week h3 { margin: 0 0 4px; font-size: 12pt; color: #2f6f62; }
  .week ul { list-style: none; padding: 0; margin: 0; }
  .week li { margin: 3px 0; }
</style></head><body>

<section class="page">
  <header>
    <img src="${dataUri(cfg.icons.icon192)}" alt="" />
    <div>
      <h1>${esc(cfg.productName)} — start here</h1>
      <p class="sub">Your calm budget app. Thank you for your order — this page gets you going in a few minutes.</p>
    </div>
  </header>

  <h2><span class="n">1</span>Open the app</h2>
  <div class="two">
    <div class="box">
      <h3>On your phone (best)</h3>
      <p>Open this link in <b>Safari</b> (iPhone) or <b>Chrome</b> (Android):</p>
      <a class="url" href="${esc(APP_URL)}">${wrapUrl(APP_URL)}</a>
      <div class="qr-row">
        <a href="${esc(APP_URL)}">${APP_QR}</a>
        <div>
          <p class="qr-cap">Scan with your phone camera</p>
          <p>It’s your personal copy’s address — bookmark it, but please don’t post it publicly.</p>
        </div>
      </div>
    </div>
    <div class="box">
      <h3>On a computer</h3>
      <p>Open the file you downloaded, <b>${esc(cfg.downloadFileName)}</b>. Double-click it and it opens in your browser. It works with no internet connection.</p>
      <p>You can use the link above on a computer too.</p>
      <div class="note"><b>Etsy’s app can’t download digital files.</b> Open Etsy in a web browser (Safari, Chrome, Edge) → Purchases → Download files. Or simply use the link.</div>
    </div>
  </div>

  <h2><span class="n">2</span>Put it on your Home Screen</h2>
  <div class="shots">
    <div>
      <div class="phone"><img src="${todayShot}" alt="The app’s Today screen" /></div>
      <p class="cap">Today: your safe-to-spend number</p>
    </div>
    <div style="flex:1">
      <div class="three">
        <div class="box"><h3>iPhone / iPad (Safari)</h3>${iphoneSteps}</div>
        <div class="box"><h3>Android (Chrome)</h3>${androidSteps}</div>
        <div class="box"><h3>Computer</h3><ol class="mini"><li><span>Chrome / Edge: click the <b>install</b> icon at the right of the address bar</span></li><li><span>Mac Safari: <b>File → Add to Dock</b> (macOS 14 or later)</span></li></ol></div>
      </div>
      <div class="warn"><b>iPhone and iPad:</b> Safari can delete a website’s data if you don’t open it for 7 days. Adding the app to your Home Screen prevents that. Back up weekly too (see page 2).</div>
      <p>Then open it from its icon. It works offline, like any other app.</p>
    </div>
  </div>

  <div class="week">
    <h3>Your first week</h3>
    <ul>
      <li><b>Day 1:</b> set up and log one spend.</li>
      <li><b>Each day:</b> check your number, and log or import.</li>
      <li><b>Day 7:</b> back up (More → Backup &amp; restore).</li>
    </ul>
  </div>

  <footer><span>${esc(cfg.productName)} · Start here · page 1 of 2</span><span>Not financial advice · ADHD-friendly design, not a medical product</span></footer>
</section>

<section class="page">
  <h2><span class="n">3</span>Set up in about 2 minutes</h2>
  <ol>
    <li><b>Your balance</b> — what’s in your main account today. A rough number is fine.</li>
    <li><b>Your pay</b> — how much lands and when. Pay varies? Use an average and confirm each payday.</li>
    <li><b>Your main monthly bills</b> — rent, phone, subscriptions: an amount and the day of the month.</li>
    <li><b>Log as you go</b> — type “12.50 coffee” on Today, or import your bank’s CSV statement (Log → Import statement).</li>
  </ol>
  <p>Not ready to type your own numbers? Tap <b>Try with example numbers</b> first, then <b>Clear examples</b>.</p>

  <h2><span class="n">4</span>Your data, and backups</h2>
  <div class="two">
    <div>
      <ul>
        <li>No account, no bank login, no cloud. Your budget is saved <b>only on your device</b>, and the app sends nothing anywhere.</li>
        <li>That means a backup is your safety net — for a lost phone, a new phone, or cleared browser data.</li>
        <li><b>Back up weekly:</b> More → Backup &amp; restore → <b>Back up now</b>. On iPhone choose <b>Save to Files</b>. You can lock it with a passphrase — if you forget it, the backup can’t be opened.</li>
        <li><b>New phone?</b> On the welcome screen tap “Restore a backup”.</li>
      </ul>
    </div>
    <div>
      <div class="phone" style="margin: 0 auto"><img src="${backupShot}" alt="The Back up now screen" /></div>
      <p class="cap">More → Backup &amp; restore</p>
    </div>
  </div>

  <h2><span class="n">5</span>Try the free demo — and share it</h2>
  <p>Want to show a friend? The demo is free to share: <a class="url" style="display:inline-block; padding:3px 8px; margin:0" href="${esc(DEMO_URL)}">${wrapUrl(DEMO_URL)}</a></p>
  <p>It starts with example numbers, holds up to 30 entries and resets when the tab is closed.</p>

  <h2><span class="n">6</span>Help and support</h2>
  <p>Short guides are built in: <b>More → Help</b>. Questions or problems? <b>Message the shop through Etsy</b> (your Purchases page → Message seller). Please include your phone model and what you were trying to do.</p>

  <h2><span class="n">7</span>Licence</h2>
  <p>For personal and household use. Please don’t resell or redistribute the app or this guide, or post your app link publicly. Thank you for supporting a small shop.</p>

  <footer><span>${esc(cfg.productName)} v${esc(version)} · Start here · page 2 of 2</span><span>A budgeting and organising tool. Not financial advice.</span></footer>
</section>
</body></html>`;

// 3. Print each paper size, check it's exactly two full pages with nothing cut off, and save page previews.
const previews = path.resolve('screenshots/phase6');
fs.mkdirSync(previews, { recursive: true });
fs.mkdirSync('dist', { recursive: true });
fs.rmSync('dist/Start-Here.pdf', { force: true }); // the old single-size name
const done = [];
for (const [paper, size] of Object.entries(PAPERS)) {
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(makeHtml(paper, size), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const overflow = await page.$$eval('.page', (pages) => pages.map((p) => p.scrollHeight - p.clientHeight));
  if (overflow.some((o) => o > 1)) throw new Error(`Start-Here (${paper}) content doesn't fit its page (overflow px: ${overflow.join(', ')})`);
  const out = `dist/Start-Here-${paper}.pdf`;
  await page.pdf({ path: out, format: paper, printBackground: true, preferCSSPageSize: true });
  const pageCount = (fs.readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pageCount !== 2) throw new Error(`${out} has ${pageCount} pages, expected 2`);
  const sections = await page.$$('.page');
  for (let i = 0; i < sections.length; i++) await sections[i].screenshot({ path: path.join(previews, `start-here-${paper}-page-${i + 1}.png`) });
  await ctx.close();
  done.push(`${out} (${pageCount} pages)`);
}
await browser.close();

console.log(`${done.join('\n')}
app link ${APP_URL}
dist/${cfg.downloadFileName}
previews in screenshots/phase6/`);
