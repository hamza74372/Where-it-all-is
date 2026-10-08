import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => SHOTS && page.screenshot({ path: path.join(SHOTS, `p3-${name}.png`) });

function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && problems.push(`network: ${r.url()}`));
  return problems;
}
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

async function quickSetup(page: Page) {
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('How much lands in your account?').fill('1500');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Rent or mortgage amount').fill('800');
  await page.getByLabel('Rent or mortgage day of month').fill('1');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0); // saved
  await expect(page.locator('.big-number')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) }); // Tue 6 Oct 2026
});

test('debt plan in the UI matches the spreadsheet (24 months, 686.93 interest)', async ({ page }) => {
  const problems = guard(page);
  await page.goto(APP);
  await quickSetup(page);
  await nav(page, 'Plan').click();
  await page.getByRole('radio', { name: 'Debt' }).click();

  for (const [name, bal, apr, min] of [['Target', '1000', '24', '50'], ['Other', '3000', '15', '90']]) {
    await page.getByRole('button', { name: 'Add a debt' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Name').fill(name);
    await sheet.getByLabel('Balance owed now').fill(bal);
    await sheet.getByLabel('Interest rate (APR %)').fill(apr);
    await sheet.getByLabel('Minimum payment each month').fill(min);
    await sheet.getByRole('switch', { name: 'Also add the minimum as a monthly bill' }).click(); // off for this check
    await sheet.getByRole('button', { name: 'Save' }).click();
  }
  await page.locator('#extra-slider').fill('6000'); // 60.00 extra → budget 200
  const snowball = page.locator('.plan-card').filter({ hasText: 'Snowball' });
  await expect(snowball).toContainText('24 months · $686.93 interest');
  await expect(snowball).toContainText('October 2028');
  await shot(page, 'debt');
  expect(problems).toEqual([]);
});

test('envelopes: overspend → suggestion → move money → undo; goals; insights', async ({ page }) => {
  const problems = guard(page);
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.getByRole('textbox', { name: 'Log a spend' }).fill('400 groceries');
  await page.getByRole('textbox', { name: 'Log a spend' }).press('Enter');

  await nav(page, 'Plan').click();
  await page.getByRole('radio', { name: 'Envelopes' }).click();
  const note = page.getByRole('note').filter({ hasText: 'over in Groceries' });
  await expect(note).toBeVisible();
  await expect(note).toContainText(/want to move .* from (Eating out|Transport|Fun)\?/);
  await shot(page, 'envelopes-over');
  await note.getByRole('button', { name: /^Move/ }).click();
  await expect(page.getByRole('status')).toContainText('Moved');
  await expect(page.getByRole('note').filter({ hasText: 'over in Groceries' })).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('note').filter({ hasText: 'over in Groceries' })).toBeVisible();

  await page.getByRole('radio', { name: 'Goals' }).click();
  await expect(page.getByText('Holiday')).toBeVisible();
  await expect(page.getByText(/each payday to reach it by/)).toBeVisible();
  await page.getByRole('button', { name: 'Add money' }).first().click();
  await page.getByRole('dialog').getByLabel('Amount').fill('50');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('$400 of $1,200')).toBeVisible();
  await shot(page, 'goals');

  await page.getByRole('radio', { name: 'Debt' }).click();
  await expect(page.locator('.plan-card')).toHaveCount(2);
  await shot(page, 'debt-example');

  await page.getByRole('radio', { name: 'Insights' }).click();
  await expect(page.getByRole('heading', { name: 'This month vs last month' })).toBeVisible();
  await expect(page.locator('.bar-row').first()).toContainText('Groceries');
  await shot(page, 'insights');
  expect(problems).toEqual([]);
});

test('while you were away: balance first, then what passed, then the number; undo restores', async ({ page }) => {
  const problems = guard(page);
  await page.goto(APP);
  await quickSetup(page); // pay every 2nd Friday from 9 Oct, rent on the 1st (next: 1 Nov)

  // Come back 12 days later (Sun 18 Oct): payday 9 Oct passed, unconfirmed.
  await page.clock.setSystemTime(new Date(2026, 9, 18, 9, 0));
  await page.reload();
  const card = page.getByRole('region', { name: 'While you were away' });
  await expect(card).toBeVisible();
  await expect(card.locator('p').first()).toHaveText("Welcome back. What's your balance today?");
  await shot(page, 'away');
  await card.getByRole('button', { name: 'Skip' }).click();
  await expect(card).toContainText('Paycheck');
  const before = await page.locator('.big-number').textContent();
  await card.getByRole('button', { name: 'It arrived' }).click();
  // Nothing left to confirm: the card shows the new number and offers an optional import.
  await expect(card.locator('.away-number')).toContainText(/Safe to spend today: \$\d/);
  await expect(card).toContainText("It's optional.");
  const after = await page.locator('.big-number').textContent();
  expect(after).not.toBe(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.big-number')).toHaveText(before!);
  await card.getByRole('button', { name: 'Done' }).click();
  await expect(card).toBeHidden();
  expect(problems).toEqual([]);
});

test('focus mode hides everything but the number and log box, and is remembered', async ({ page }) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.getByRole('button', { name: 'Focus mode' }).click();
  await expect(page.getByRole('heading', { name: 'Next bills' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Right now — one thing' })).toBeHidden();
  await expect(page.locator('.big-number')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Log a spend' })).toBeVisible();
  await shot(page, 'focus');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exit focus mode' })).toHaveAttribute('aria-pressed', 'true');
});

test('notes save by themselves; edits can be undone', async ({ page }) => {
  const problems = guard(page);
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Notes/ }).click();
  await page.getByLabel('Notes for this month').fill('Car MOT due in November — about 60.');
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  await page.reload();
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Notes/ }).click();
  await expect(page.getByLabel('Notes for this month')).toHaveValue('Car MOT due in November — about 60.');

  // Edit a bill amount, then undo.
  await nav(page, 'Bills').click();
  await page.getByRole('button', { name: 'Edit Phone' }).click();
  await page.getByRole('dialog').getByLabel('Amount').fill('99');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.row-bill').filter({ hasText: 'Phone' })).toContainText('$99.00');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.row-bill').filter({ hasText: 'Phone' })).toContainText('$45.00');
  expect(problems).toEqual([]);
});
