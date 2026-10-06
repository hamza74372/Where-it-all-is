import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const SHOTS = process.env.SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/** Fail on console errors and on any request that isn't the file itself or inline data. */
function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) problems.push(`network: ${u}`);
  });
  return problems;
}

test.beforeEach(async ({ page }) => {
  // Tuesday 6 Oct 2026, 10:00 local.
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
});

test('onboarding → log → undo → mark bill paid → calendar', async ({ page }) => {
  const problems = guard(page);
  await page.goto(APP);

  await shot(page, '01-welcome');
  await page.getByRole('button', { name: /Set up mine/ }).click();

  // Step 1: name, currency, decimal switch
  await page.getByLabel('What should we call you? (optional)').fill('Sam');
  await page.getByLabel('Currency').selectOption('USD');
  await expect(page.getByText("You'll type amounts like")).toContainText('12.50');
  await shot(page, '02-step1');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: balance (typing an unusual amount shows the prompt and blocks Next)
  await page.getByLabel('Balance today').fill('1.240');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Did you mean $1,240.00?')).toBeVisible();
  await shot(page, '03-did-you-mean');
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByLabel('Balance today')).toHaveValue('1240');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3: pay — default is every 2 weeks from next Friday (9 Oct)
  await page.getByLabel('How much lands in your account?').fill('1850');
  await shot(page, '04-pay');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 4: bills
  await page.getByLabel('Rent or mortgage amount').fill('950');
  await page.getByLabel('Rent or mortgage day of month').fill('1');
  await page.getByLabel('Phone amount').fill('45');
  await page.getByLabel('Phone day of month').fill('8');
  await shot(page, '05-bills');
  await page.getByRole('button', { name: 'Finish' }).click();

  // Today: 1,240 − phone 45 (due 8 Oct, before payday 9 Oct) = 1,195 over 3 days → 398.33
  await expect(page.getByRole('heading', { name: 'Hi Sam' })).toBeVisible();
  await expect(page.locator('.big-number')).toHaveText('$398');
  await expect(page.getByText(/Until payday .*: \$1,195/)).toBeVisible();
  await shot(page, '06-today');

  // How is this worked out?
  await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
  await expect(page.getByRole('dialog')).toContainText('Phone');
  await shot(page, '07-explain');
  await page.getByRole('button', { name: 'Close' }).click();

  // Quick log + undo
  await page.getByRole('textbox', { name: 'Log a spend' }).fill('12.50 coffee');
  await expect(page.locator('#ql-preview')).toContainText('Coffee');
  await page.getByRole('textbox', { name: 'Log a spend' }).press('Enter');
  await expect(page.getByRole('status')).toContainText('Logged $12.50 · Coffee');
  await expect(page.locator('.big-number')).toHaveText('$385');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.big-number')).toHaveText('$398');

  // One-tap chip
  await page.getByRole('button', { name: /Coffee \$5/ }).click();
  await expect(page.locator('.big-number')).toHaveText('$393');
  await shot(page, '08-today-after-chip');

  // Bills: mark phone paid → number unchanged (it was already set aside)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Bills' }).click();
  await shot(page, '09-bills');
  await page.getByRole('button', { name: /Mark Phone paid/ }).click();
  await expect(page.getByRole('status')).toContainText('Phone marked paid');

  await page.getByRole('radio', { name: 'Calendar' }).click();
  await shot(page, '10-calendar');
  await page.getByRole('button', { name: /Oct 9.*payday/ }).click();
  await expect(page.locator('.cal-sel-title')).toContainText('October 9');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
  await expect(page.locator('.big-number')).toHaveText('$393');

  // Log tab shows the entries
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Log' }).click();
  await expect(page.locator('.log-day').getByText('Coffee').first()).toBeVisible();
  await shot(page, '11-log');

  // Data survives a reload (IndexedDB over file://)
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
  await expect(page.locator('.big-number')).toHaveText('$393');

  expect(problems).toEqual([]);
});

test('payday: confirm-your-pay card leads Today, rent today still set aside', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 9, 9, 0) }); // Friday 9 Oct = payday
  const problems = guard(page);
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('300');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('How much lands in your account?').fill('1850');
  await page.getByLabel('Next payday').fill('2026-10-09');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Rent or mortgage amount').fill('950');
  await page.getByLabel('Rent or mortgage day of month').fill('9');
  await page.getByRole('button', { name: 'Finish' }).click();

  const card = page.getByRole('region', { name: 'Payday — confirm your pay' });
  await expect(card).toBeVisible();
  // Before pay: 300 − 950 rent = tight by 650
  await expect(page.getByRole('heading', { name: 'Tight until payday' })).toBeVisible();
  await expect(page.locator('.big-number')).toHaveText('$650');
  await shot(page, '12-payday-before');

  await card.getByRole('button', { name: "Yes, it's in" }).click();
  await expect(card).toBeHidden();
  // After: 300 + 1850 − 950 = 1,200 over 14 days → 85.71
  await expect(page.locator('.big-number')).toHaveText('$85');
  await shot(page, '13-payday-after');
  expect(problems).toEqual([]);
});

test('example numbers, then clear examples', async ({ page }) => {
  const problems = guard(page);
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await expect(page.getByText("You're looking at example numbers")).toBeVisible();
  await expect(page.locator('.big-number')).toBeVisible();
  await shot(page, '14-example-today');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Bills' }).click();
  await shot(page, '15-example-bills');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Clear examples' }).click();
  await page.getByRole('button', { name: 'Clear and set up mine' }).click();
  await expect(page.getByRole('button', { name: /Set up mine/ })).toBeVisible();
  expect(problems).toEqual([]);
});

test('comma-decimal user: switch in onboarding, amounts shown to match', async ({ page }) => {
  const problems = guard(page);
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByRole('button', { name: 'Switch to 12,50' }).click();
  await expect(page.getByText("You'll type amounts like")).toContainText('12,50');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('1.240,50');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(page.locator('.row .mono').first()).toHaveText('$1.240,50');
  expect(problems).toEqual([]);
});
