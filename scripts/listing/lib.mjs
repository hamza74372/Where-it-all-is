// Shared helpers for the Etsy listing images and videos (scripts/listing/*).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import * as lucide from 'lucide';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
export const OUT = path.join(ROOT, 'listing');
export const BUILD = path.join(OUT, '.build'); // intermediate screenshots (not committed)
export const COPY = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/listing/copy.json'), 'utf8'));

/** The day every scene is set on (a Tuesday): the example numbers are built around it. */
export const SCENE_DAY = new Date(2026, 9, 13, 10, 0);

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.csv': 'text/csv' };

/** Serves the repo on localhost so the app, the templates, tokens, fonts and screenshots share one origin. */
export function startServer() {
  const pages = new Map(); // in-memory pages: /__page/<name>
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pages.has(url)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pages.get(url));
    }
    const file = path.join(ROOT, url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({
        base,
        app: `${base}/dist/app.html`,
        /** Host an HTML string and get its URL. */
        page(name, html) {
          pages.set(`/__page/${name}`, html);
          return `${base}/__page/${name}`;
        },
        close: () => new Promise((r) => server.close(r)),
      });
    }),
  );
}

/** A Lucide icon ("shield-check") as inline SVG, drawn like the app's icons. */
export function icon(name, size = 64, stroke = 1.75) {
  const key = name.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  const node = lucide[key];
  if (!node) throw new Error(`No Lucide icon "${name}"`);
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export const nav = (page, label) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

/** Phone-sized browser, light theme, US English — what most Etsy buyers see. */
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light', locale: 'en-US' };

/** Let entrance animations finish so nothing is caught half-faded. */
export async function settle(page) {
  await page.waitForTimeout(120);
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
}

/**
 * The real app with its example numbers, on SCENE_DAY. The "these are example numbers" banner is
 * hidden for pictures, and the Coffee chip is set to 4.50 through the app's own chip editor.
 */
export async function openExampleApp(page, server, { coffee = true, navigate = true } = {}) {
  // navigate: false when the app is already loaded (the video stage's iframe; its clock is the page's).
  if (navigate) {
    await page.clock.install({ time: SCENE_DAY });
    await page.goto(server.app);
  }
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.locator('.big-number').waitFor();
  await hideExampleBanner(page);
  if (coffee) {
    await nav(page, 'More').click();
    await page.getByRole('button', { name: /^Quick-log chips/ }).click();
    await page.getByRole('button', { name: /^Coffee/ }).click();
    await page.getByLabel('Amount').fill('4.50');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Back to More' }).click();
    await nav(page, 'Today').click();
    await page.locator('.big-number').waitFor();
  }
  await settle(page);
}

export async function hideExampleBanner(page) {
  await page.addStyleTag({ content: '.screen-today .card.card-note[role="note"] { display: none !important; }' });
}

/**
 * Two statements for the import scenes (generic merchant names only — no brands in listing photos).
 * A is imported first (off camera). B overlaps it, so A's rows come back as "already imported"; five of
 * B's rows are spends the example numbers already logged; two are new. A's rows and B's new rows net to
 * zero, so the import ends on the same balance every other image shows ($1,221.56). B's closing
 * figure is read from the app's own balance check, so the app can agree.
 */
export const STATEMENT_A = ['Date,Description,Amount', '10/02/2026,CORNER SHOP,-6.20', '10/03/2026,FUEL STATION,-40.00', '10/05/2026,PHARMACY,-9.80'].join('\n') + '\n';
const B_ROWS = [
  ['10/02/2026', 'CORNER SHOP', -620],
  ['10/03/2026', 'FUEL STATION', -4000],
  ['10/05/2026', 'PHARMACY', -980],
  ['10/08/2026', 'GROCERY MARKET', -2875],
  ['10/09/2026', 'BOOKSHOP', -1299],
  ['10/10/2026', 'MUSIC SUBSCRIPTION', -1099],
  ['10/11/2026', 'TRANSIT CARD', -1800],
  ['10/12/2026', 'SUPERMARKET', -3420],
  ['10/12/2026', 'COFFEE SHOP', -450],
  ['10/13/2026', 'REFUND ONLINE ORDER', 6699],
];
/** The balance every scene shows (the example numbers' Everyday account on SCENE_DAY). */
export const SCENE_BALANCE = 122156;
export function statementB(closing) {
  let after = closing;
  const balances = [];
  for (let i = B_ROWS.length - 1; i >= 0; i--) {
    balances[i] = after;
    after -= B_ROWS[i][2];
  }
  const money = (m) => (m < 0 ? '-' : '') + (Math.abs(m) / 100).toFixed(2);
  return ['Date,Description,Amount,Balance', ...B_ROWS.map(([d, desc, a], i) => `${d},${desc},${money(a)},${money(balances[i])}`)].join('\n') + '\n';
}

export async function importFile(page, file) {
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('heading', { name: 'Preview' }).waitFor();
}

/** After "Import N": step through sorting/choices until the balance check (or the summary). */
export async function finishImportUntil(page, done) {
  for (let i = 0; i < 25; i++) {
    if (await done.isVisible()) return;
    const step = page.getByRole('button', { name: /^(Finish later|Skip|Leave it)$/ });
    if (await step.first().isVisible()) await step.first().click();
    await page.waitForTimeout(150);
  }
  await done.waitFor();
}

/** Import statement A quietly, ending back on Today. */
export async function importStatementA(page, dir) {
  const file = path.join(dir, 'statement-september-october.csv');
  fs.writeFileSync(file, STATEMENT_A);
  await importFile(page, file);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
  const summary = page.getByRole('heading', { name: /^Imported|^Linked/ });
  await finishImportUntil(page, summary);
  await page.getByRole('button', { name: 'Done' }).click();
}
