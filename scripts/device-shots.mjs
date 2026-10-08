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
const settle = async (page) => {
  await page.waitForTimeout(50);
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
};

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
    await settle(page);
    const heroOpacity = await page.locator('.hero-number').evaluate((element) => Number(getComputedStyle(element).opacity));
    if (heroOpacity !== 1) throw new Error(`Hero number did not finish at full opacity (${heroOpacity})`);
    const ringValue = Number(await page.locator('.hero .progress-ring').getAttribute('aria-valuenow'));
    if (ringValue <= 0 || ringValue >= 100) throw new Error(`Payday ring is not a partial arc (${ringValue}%)`);
    const ringOffset = Number(await page.locator('.hero .ring-value').getAttribute('stroke-dashoffset'));
    if (ringOffset <= 0 || ringOffset >= 100) throw new Error(`Payday ring stroke is not visibly partial (offset ${ringOffset})`);
    if (device.width >= 1100) {
      const hero = (await page.locator('.big-number').textContent())?.trim();
      const sidebar = (await page.locator('.nav-summary > strong').textContent())?.trim();
      if (hero !== sidebar) throw new Error(`Sidebar value ${sidebar} does not match hero ${hero}`);
    }
    await page.evaluate(() => document.getElementById('main')?.scrollTo(0, 0));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error(`Horizontal overflow at ${device.width}px (${theme})`);
    await page.screenshot({ path: path.resolve('docs/device-shots', `${device.name}-${theme}.png`) });
    await context.close();
  }
}

await browser.close();
console.log('Wrote 6 device screenshots to docs/device-shots/');
