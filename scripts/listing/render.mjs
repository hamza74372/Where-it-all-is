// Etsy listing images: captures the real app (example numbers), then renders the 12 templates at
// 2400×1800 to listing/*.jpg (each under 1 MB) plus a contact sheet.
// Run after `npm run build`:  npm run listing          (add --skip-capture to reuse listing/.build)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { captureAll } from './capture.mjs';
import { BUILD, COPY, OUT, ROOT, startServer } from './lib.mjs';
import { contactSheet, templates } from './templates.mjs';

const W = 2400;
const H = 1800;
const MAX_BYTES = 1024 * 1024;
const args = new Set(process.argv.slice(2));

if (!fs.existsSync(path.join(ROOT, 'dist/app.html'))) throw new Error('Build the app first: npm run build');
fs.mkdirSync(OUT, { recursive: true });

// The device shots (laptop, tablet, phone) for image 1 come from the existing script.
if (!args.has('--skip-capture')) execFileSync(process.execPath, [path.join(ROOT, 'scripts/device-shots.mjs')], { cwd: ROOT, stdio: 'inherit' });

const server = await startServer();
const browser = await chromium.launch();
try {
  if (!args.has('--skip-capture')) await captureAll(browser, server);

  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await ctx.newPage();
  const made = [];
  for (const [i, spec] of COPY.images.entries()) {
    const html = templates[i](spec, server, i);
    await page.goto(server.page(`image-${i + 1}`, html));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    // Nothing important may sit outside the centred 1800×1800 square (square/portrait crops).
    const outside = await page.evaluate(() => {
      const left = (window.innerWidth - window.innerHeight) / 2;
      const right = left + window.innerHeight;
      return [...document.querySelectorAll('[data-safe]')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width && (r.left < left - 0.5 || r.right > right + 0.5 || r.top < -0.5 || r.bottom > window.innerHeight + 0.5))
        .map(({ el, r }) => `${el.getAttribute('data-safe')} (${Math.round(r.left)}–${Math.round(r.right)})`);
    });
    if (outside.length) throw new Error(`${spec.file}: outside the safe area: ${outside.join(', ')}`);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('h1')].map((h) => parseFloat(getComputedStyle(h).fontSize)).filter((s) => s < 110),
    );
    if (small.length) throw new Error(`${spec.file}: headline under 110 px (${small.join(', ')})`);

    const file = path.join(OUT, spec.file);
    let quality = 90;
    for (;;) {
      await page.screenshot({ path: file, type: 'jpeg', quality });
      if (fs.statSync(file).size < MAX_BYTES || quality <= 50) break;
      quality -= 5;
    }
    const size = fs.statSync(file).size;
    if (size >= MAX_BYTES) throw new Error(`${spec.file} is ${size} bytes (limit 1 MB)`);
    made.push(`${spec.file}  ${(size / 1024).toFixed(0)} KB  (q${quality})`);
  }

  // A contact sheet of all twelve, small.
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto(server.page('contact', contactSheet(COPY.images, server)));
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, 'contact-sheet.jpg'), type: 'jpeg', quality: 85 });
  await ctx.close();
  console.log(made.join('\n') + '\ncontact-sheet.jpg');
} finally {
  await browser.close();
  await server.close();
}
