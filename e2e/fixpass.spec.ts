import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) }); // Tue 6 Oct 2026
});

test('onboarding: monthly bills step, "Add another bill", first-day prompt, look-ahead line', async ({ page }) => {
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('How much lands in your account?').fill('1000');
  // Date fields spell the date out.
  await expect(page.locator('.date-words').first()).toHaveText('Friday, October 9');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Your main monthly bills' })).toBeVisible();
  await expect(page.getByText('Day of month').first()).toBeVisible();
  await page.getByLabel('Rent or mortgage amount').fill('1200');
  await page.getByLabel('Rent or mortgage day of month').fill('15');
  await page.getByRole('button', { name: '+ Add another bill' }).click();
  await page.getByLabel('Bill name').fill('Netflix');
  await page.getByLabel('Netflix amount').fill('15');
  await page.getByLabel('Netflix day of month').fill('20');
  await page.getByRole('button', { name: 'Finish' }).click();

  // Pay 1,000 on 9 Oct; 9–22 Oct holds rent 1,200 + Netflix 15 → 215 set aside now.
  // 1,200 − 215 = 985 over 3 days → 328.33 → shown as $328.
  await expect(page.locator('.big-number')).toHaveText('$328');
  await expect(page.getByText('Log your first spend')).toBeVisible();
  await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Set aside for next period’s bills');
  await expect(sheet).toContainText('$215.00');
  await expect(sheet).toContainText('next pay: $1,000.00');
  await page.getByRole('button', { name: 'Close' }).click();

  await nav(page, 'Bills').click();
  await expect(page.getByText('Netflix', { exact: true })).toBeVisible();
});

test('toasts never cover the screen and clear when you move to another screen', async ({ page }) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.getByRole('textbox', { name: 'Log a spend' }).fill('4.50 coffee');
  await page.getByRole('textbox', { name: 'Log a spend' }).press('Enter');
  const toastBox = await page.locator('.toast').boundingBox();
  const mainBox = await page.locator('#main').boundingBox();
  expect(toastBox && mainBox).toBeTruthy();
  expect(mainBox!.y + mainBox!.height).toBeLessThanOrEqual(toastBox!.y + 0.5); // screen area ends above the toast

  await nav(page, 'Plan').click();
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('every button and switch is at least 44×44 on Today, Bills and Settings', async ({ page }) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  const small = async () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('button, select, input, [role=switch]'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 1 && (r.width < 43.5 || r.height < 43.5))
        .map(({ el, r }) => `${(el as HTMLElement).innerText || el.getAttribute('aria-label')} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
  expect(await small()).toEqual([]);
  await nav(page, 'Bills').click();
  await page.getByRole('radio', { name: 'Calendar' }).click();
  expect(await small()).toEqual([]);
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  expect(await small()).toEqual([]);
});
