import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
];
const THEMES = ['light', 'dark'];
const nav = (page, name) => page.locator('.app-nav button').filter({ hasText: name }).first();
const settle = (page) => page.waitForTimeout(300);

const browser = await chromium.launch({ channel: 'chrome' });

for (const theme of THEMES) {
  for (const viewport of WIDTHS) {
    const dir = path.resolve('docs/visual', theme, String(viewport.width));
    fs.mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(2026, 9, 13, 10, 0) });
    await page.goto(APP);
    await page.getByRole('button', { name: /Set up mine/ }).waitFor();
    await page.screenshot({ path: path.join(dir, 'welcome.png') });
    await page.getByRole('button', { name: 'Try with example numbers' }).click();
    await page.locator('.big-number').waitFor();

    const shot = async (name) => {
      await page.evaluate(() => document.getElementById('main')?.scrollTo(0, 0));
      await settle(page);
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > window.innerWidth + 1,
        main: (() => {
          const main = document.getElementById('main');
          return !!main && main.scrollWidth > main.clientWidth + 1;
        })(),
      }));
      if (overflow.page || overflow.main) throw new Error(`Horizontal overflow on ${name} at ${viewport.width}px (${theme})`);
      await page.screenshot({ path: path.join(dir, `${name}.png`) });
    };

    await shot('today');
    await nav(page, 'Log').click();
    await shot('log');
    await nav(page, 'Bills').click();
    await shot('bills');
    await nav(page, 'Plan').click();
    await page.getByRole('radio', { name: 'Envelopes' }).click();
    await shot('plan-envelopes');
    await page.getByRole('radio', { name: 'Insights' }).click();
    await shot('insights');
    await page.getByRole('radio', { name: 'Debt' }).click();
    await shot('debt');
    await context.close();
  }
}

await browser.close();
console.log('Wrote 42 visual screenshots to docs/visual/');
