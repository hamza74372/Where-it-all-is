// Before/after shots for the design polish: the same states, same data, any build.
//   APP_HTML=path/to/app.html SHOT_SET=before npx playwright test -c playwright.audit.config.ts polish \
//     --project=webkit-iphone13-light --project=webkit-iphone13-dark
// Writes docs/polish/<set>/<theme>/<state>.png (the first screen a person sees, 390 × 844).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve(process.env.APP_HTML ?? 'dist/app.html')).href;
const SET = process.env.SHOT_SET ?? 'after';
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

test.beforeEach(({}, info) => test.skip(!info.project.name.startsWith('webkit-iphone13'), 'iPhone 13 light + dark only'));

function shooter(page: Page, theme: string) {
  const dir = path.resolve('docs/polish', SET, theme);
  fs.mkdirSync(dir, { recursive: true });
  return async (name: string) => {
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('main')?.scrollTo(0, 0));
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
  };
}
const themeOf = (name: string) => (name.endsWith('dark') ? 'dark' : 'light');

async function samsMonth(page: Page) {
  await page.clock.install({ time: new Date(2026, 8, 30, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('What should we call you? (optional)').fill('Sam');
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('How much lands in your account?').fill('1500');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Rent or mortgage amount').fill('800');
  await page.getByLabel('Rent or mortgage day of month').fill('1');
  await page.getByLabel('Phone amount').fill('45');
  await page.getByLabel('Phone day of month').fill('15');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0); // saved
  await expect(page.locator('.big-number')).toBeVisible();
  // Back on 13 Oct (not a payday): the catch-up is confirmed, a few spends logged.
  await page.clock.setSystemTime(new Date(2026, 9, 13, 10, 0));
  await page.reload();
  await page.getByRole('region', { name: 'While you were away' }).getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'They all happened' }).click();
  await page.getByRole('region', { name: 'While you were away' }).getByRole('button', { name: 'Done' }).click();
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  for (const t of ['4.50 coffee', '32.10 groceries', '12 lunch']) {
    await box.fill(t);
    await box.press('Enter');
    await expect(box).toHaveValue('');
  }
  await page.waitForTimeout(8500); // let the last Undo toast go
}

test('welcome and empty Today', async ({ page }, info) => {
  const shot = shooter(page, themeOf(info.project.name));
  await page.clock.install({ time: new Date(2026, 9, 13, 10, 0) });
  await page.goto(APP);
  await expect(page.getByRole('button', { name: /Set up mine/ })).toBeVisible();
  await shot('welcome');
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page.locator('.big-number')).toBeVisible();
  await shot('today-empty');
});

test('a realistic month', async ({ page }, info) => {
  const shot = shooter(page, themeOf(info.project.name));
  await samsMonth(page);
  await nav(page, 'Today').click();
  await shot('today-filled');

  await nav(page, 'Log').click();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('coffee');
  await shot('log-search');

  await nav(page, 'Bills').click();
  await shot('bills');

  await nav(page, 'Log').click();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('');
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(path.resolve('test/fixtures/csv/chase-checking.csv'));
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await shot('import-preview');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^Import \d+/ }).click();
  const done = page.getByRole('heading', { name: /^Imported/ });
  for (let i = 0; i < 10 && !(await done.isVisible()); i++) {
    const sort = page.locator('.sort-grid').getByRole('button', { name: /Home/ });
    const next = page.getByRole('button', { name: /^(Finish later|Skip|Continue|Leave it|Just this once)$/ });
    if (await sort.isVisible()) await sort.click();
    else if (await next.first().isVisible()) await next.first().click();
    await page.waitForTimeout(200);
  }
  await page.getByRole('button', { name: 'Done' }).click();
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Your data/ }).click();
  await shot('your-data');

  // Keep both constrained examples believable: $40 left, then exactly $85 short.
  await page.getByRole('button', { name: 'Back to More' }).click();
  await nav(page, 'Today').click();
  const periodText = await page.locator('.hero-sub .money').textContent();
  const periodLeft = Number((periodText ?? '').replace(/[^0-9.-]/g, ''));
  expect(periodLeft).toBeGreaterThan(0);
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByLabel('Cushion').fill(String(Math.max(0, periodLeft - 40)));
  await nav(page, 'Today').click();
  await expect(page.getByText('Tight until payday').first()).toBeVisible();
  await shot('today-tight');
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByLabel('Cushion').fill(String(periodLeft + 85));
  await nav(page, 'Today').click();
  await expect(page.getByText('Short until payday').first()).toBeVisible();
  await shot('today-short');
});

test('plan with example numbers', async ({ page }, info) => {
  const shot = shooter(page, themeOf(info.project.name));
  await page.clock.install({ time: new Date(2026, 9, 13, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await expect(page.locator('.big-number')).toBeVisible();
  await nav(page, 'Plan').click();
  await page.getByRole('radio', { name: 'Envelopes' }).click();
  const overflowing = await page.locator('.envelope-summary').evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    return [...card.querySelectorAll<HTMLElement>('.section-label, .summary-amount, small')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left < bounds.left || rect.right > bounds.right || node.scrollWidth > node.clientWidth + 1;
      })
      .map((node) => node.textContent?.trim());
  });
  expect(overflowing).toEqual([]);
  await shot('plan');
});
