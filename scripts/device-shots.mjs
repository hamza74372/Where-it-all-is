import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const DEVICES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone', width: 390, height: 844 },
];
const THEMES = ['light', 'dark'];

const browser = await chromium.launch({ channel: 'chrome' });
fs.mkdirSync(path.resolve('docs/device-shots'), { recursive: true });

for (const theme of THEMES) {
  for (const device of DEVICES) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      colorScheme: theme,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(2026, 9, 13, 10, 0) });
    await page.goto(APP);
    await page.getByRole('button', { name: 'Try with example numbers' }).click();
    await page.locator('.big-number').waitFor();
    await page.evaluate(() => document.getElementById('main')?.scrollTo(0, 0));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error(`Horizontal overflow at ${device.width}px (${theme})`);
    await page.screenshot({ path: path.resolve('docs/device-shots', `${device.name}-${theme}.png`) });
    await context.close();
  }
}

await browser.close();
console.log('Wrote 6 device screenshots to docs/device-shots/');
