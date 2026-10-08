// Today's label: "Tight until payday" while still above zero but with little spare; "Short until
// payday" only once safe-to-spend is below zero.
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

async function setCushion(page: Page, amount: string) {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByLabel('Cushion').fill(amount);
  await page.getByRole('button', { name: 'Back to More' }).click();
  await nav(page, 'Today').click();
}

test('tight (above zero, little spare) and short (below zero) read differently on Today', async ({ page }) => {
  // Tue 6 Oct, 1,000.00 in the bank, no payday set → plans to 31 Oct (26 days).
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('Balance today').fill('1000');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  const hero = page.locator('.hero');
  await expect(hero.getByRole('heading', { name: 'Safe to spend today' })).toBeVisible();
  await expect(hero.locator('.status')).toHaveText('On track');

  // Cushion 960.00 → 40.00 left for the period (4% of 1,000) → tight, still a positive number.
  await setCushion(page, '960');
  await expect(hero.getByRole('heading', { name: 'Tight until payday' })).toBeVisible();
  await expect(hero.getByText('Short until payday')).toHaveCount(0);
  await expect(page.locator('.big-number')).toHaveText('$1'); // 40.00 ÷ 26 days = 1.53 → $1
  await expect(page.locator('.big-number')).not.toHaveClass(/big-number-tight/);
  await expect(hero.getByText('What you can spend today and still cover your bills until the end of the month.')).toBeVisible();
  await expect(hero.locator('.status')).toHaveText('Not much spare after bills');

  // Cushion 1,100.00 → 100.00 below zero → short, the number is the gap.
  await setCushion(page, '1100');
  await expect(hero.getByRole('heading', { name: 'Short until payday' })).toBeVisible();
  await expect(hero.getByText('Tight until payday')).toHaveCount(0);
  await expect(page.locator('.big-number')).toHaveText('$100');
  await expect(hero.getByText(/^What's missing to cover everything/)).toBeVisible();
  await expect(hero.locator('.status')).toHaveText('Bills come to more than you have');
});
