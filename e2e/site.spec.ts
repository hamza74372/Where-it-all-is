// The hosted site/ build, served over HTTP like Cloudflare Pages: landing, PWA offline, demo.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const cfg = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
const ROOT = path.resolve('site');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain',
};
let server: http.Server;
let base = '';

test.beforeAll(async () => {
  test.skip(!fs.existsSync(path.join(ROOT, 'index.html')), 'run `npm run build:site` first');
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => server?.close());

const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

test('landing page links only to the demo (never the private app path)', async ({ page }) => {
  await page.goto(base + '/');
  await expect(page.getByRole('heading', { name: cfg.productName })).toBeVisible();
  const hrefs = await page.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs).toEqual(['demo/', cfg.etsyUrl]);
  expect(await page.content()).not.toContain(cfg.appPath);
});

test('full app: installable manifest, works offline after the first visit', async ({ page, context }) => {
  await page.goto(`${base}/${cfg.appPath}/`);
  await expect(page.getByRole('button', { name: /Set up mine/ })).toBeVisible();
  const manifest = await (await page.request.get(`${base}/${cfg.appPath}/manifest.webmanifest`)).json();
  expect(manifest).toMatchObject({ name: cfg.productName, display: 'standalone', start_url: './', scope: './' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
  expect(await page.locator('meta[name=robots]').getAttribute('content')).toContain('noindex');

  // Wait for the service worker to take control, then go offline.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await expect(page.locator('.big-number')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.big-number')).toBeVisible(); // opened with no connection
  await context.setOffline(false);
});

test('demo: banner, 30-entry limit, export off — and it never touches the real app’s data', async ({ page }) => {
  // Real app on the same site first: set up with a known balance.
  await page.goto(`${base}/${cfg.appPath}/`);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('777');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  const realNumber = await page.locator('.big-number').textContent();

  // The demo: starts with example numbers, shows the banner and the full-version link.
  await page.goto(`${base}/demo/`);
  const banner = page.getByRole('note').filter({ hasText: 'Demo — data resets' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Get the full version' })).toHaveAttribute('href', cfg.etsyUrl);
  await expect(banner).toContainText('This is a demo. It isn’t meant to be installed.');
  await expect(page.locator('.big-number')).toBeVisible(); // seeded, no setup needed

  // Export is off.
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Backup & restore/ }).click();
  await expect(page.getByRole('heading', { name: /turned off in the demo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back up now' })).toHaveCount(0);

  // 30 entries: example data has 6; log until the limit, then a friendly message.
  await nav(page, 'Today').click();
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  for (let i = 0; i < 24; i++) {
    await box.fill(`${i + 1} coffee`);
    await box.press('Enter');
    await expect(box).toHaveValue('');
  }
  await box.fill('5 one too many');
  await box.press('Enter');
  await expect(page.getByRole('status')).toContainText('The demo holds up to 30 entries');

  // A new tab starts the demo fresh ("data resets").
  const fresh = await page.context().newPage();
  await fresh.goto(`${base}/demo/`);
  await nav(fresh, 'Log').click();
  await expect(fresh.getByText('one too many')).toHaveCount(0);
  await expect(fresh.getByText('24 coffee')).toHaveCount(0);

  // The real app is untouched.
  await page.goto(`${base}/${cfg.appPath}/`);
  await expect(page.locator('.big-number')).toHaveText(realNumber!);
  await expect(page.getByText("You're looking at example numbers")).toHaveCount(0);
});
