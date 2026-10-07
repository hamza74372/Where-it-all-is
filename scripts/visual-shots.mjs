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
const settle = async (page) => {
  await page.waitForTimeout(50);
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
};

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
      if (name === 'today') {
        const heroOpacity = await page.locator('.hero-number').evaluate((element) => Number(getComputedStyle(element).opacity));
        if (heroOpacity !== 1) throw new Error(`Hero number did not finish at full opacity (${heroOpacity})`);
        const ringValue = Number(await page.locator('.hero .progress-ring').getAttribute('aria-valuenow'));
        if (ringValue <= 0 || ringValue >= 100) throw new Error(`Payday ring is not a partial arc (${ringValue}%)`);
        const ringOffset = Number(await page.locator('.hero .ring-value').getAttribute('stroke-dashoffset'));
        if (ringOffset <= 0 || ringOffset >= 100) throw new Error(`Payday ring stroke is not visibly partial (offset ${ringOffset})`);
        if (viewport.width >= 1100) {
          const hero = (await page.locator('.big-number').textContent())?.trim();
          const sidebar = (await page.locator('.nav-summary > strong').textContent())?.trim();
          if (hero !== sidebar) throw new Error(`Sidebar value ${sidebar} does not match hero ${hero}`);
        }
      }
      if (name === 'plan-envelopes') {
        const overflowed = await page.locator('.envelope-summary').evaluate((card) => {
          const bounds = card.getBoundingClientRect();
          return [...card.querySelectorAll('.section-label, .summary-amount, small')].some((node) => {
            const rect = node.getBoundingClientRect();
            return rect.left < bounds.left || rect.right > bounds.right || node.scrollWidth > node.clientWidth + 1;
          });
        });
        if (overflowed) throw new Error(`Envelope summary text overflow at ${viewport.width}px (${theme})`);
      }
      if (name === 'insights') {
        const chart = await page.evaluate(() => {
          const segments = [...document.querySelectorAll('.donut-segment')];
          const strokes = segments.map((segment) => getComputedStyle(segment).stroke);
          const months = [...document.querySelectorAll('.inout-month')];
          const heights = months.map((month) => [...month.querySelectorAll('.inout-bars i')].map((bar) => Number.parseFloat(bar.style.height)));
          return { segmentCount: segments.length, uniqueStrokes: new Set(strokes).size, heights };
        });
        if (chart.segmentCount < 5 || chart.uniqueStrokes !== chart.segmentCount) {
          throw new Error(`Donut segments are not distinct (${chart.uniqueStrokes}/${chart.segmentCount})`);
        }
        if (chart.heights.length !== 6 || !chart.heights.slice(0, 5).every((month) => month.length === 2 && month.every((height) => height > 0))) {
          throw new Error('The five historical months do not all contain money in and money out');
        }
      }
      if (name === 'debt') {
        const contained = await page.locator('.debt-chart').evaluate((chart) => {
          const parent = chart.parentElement?.getBoundingClientRect();
          const rect = chart.getBoundingClientRect();
          return !!parent && rect.left >= parent.left && rect.right <= parent.right && rect.right <= window.innerWidth;
        });
        if (!contained) throw new Error(`Debt chart overflow at ${viewport.width}px (${theme})`);
      }
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
