// Import reconciliation in the UI: the statement balance check, "needs sorting" for unclear
// matches, and transfers (typed in the Log, and suggested on import).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => SHOTS && page.screenshot({ path: path.join(SHOTS, `reconcile-${name}.png`), fullPage: true });
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

async function setup(page: Page) {
  await page.clock.install({ time: new Date(2026, 9, 16, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('Balance today').fill('1000');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page.locator('.big-number')).toBeVisible();
}

async function importText(page: Page, text: string, info: { outputDir: string }, name = 'statement.csv') {
  const file = path.join(info.outputDir, name);
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(file, text);
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function addSavings(page: Page) {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Accounts/ }).click();
  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByLabel('Name').fill('Savings');
  await page.getByLabel('Type').selectOption('savings');
  await page.getByLabel('Balance right now').fill('500');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Back to More' }).click();
}

async function balanceOf(page: Page, account: string) {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Accounts/ }).click();
  const text = (await page.locator('.row').filter({ hasText: account }).locator('.money').textContent())!.trim();
  await page.getByRole('button', { name: 'Back to More' }).click();
  return text;
}

test('balance column: when the bank and app differ, it says so plainly and lists what might be missing', async ({ page }, info) => {
  await setup(page);
  // Something typed in the app that the bank doesn't have yet.
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  await box.fill('12 lunch');
  await box.press('Enter');
  await expect(box).toHaveValue('');
  // Bank: 1,000.00 − 40.00 = 960.00 at the close of the 16th; the app has the lunch too (948.00).
  await importText(page, 'Date,Description,Amount,Balance\n10/16/2026,SHELL OIL,-40.00,960.00\n', info);
  await page.getByRole('button', { name: 'Import 1' }).click();
  const heading = page.getByRole('heading', { name: "Your bank says $960.00, the app says $948.00. Here's what might be missing." });
  await expect(heading).toBeVisible();
  await expect(page.getByText(/Lunch.*something you logged, not on this statement/)).toBeVisible();
  await shot(page, 'balance-differs');
  await page.getByRole('button', { name: 'Add a balance adjustment of +$12.00' }).click();
  await expect(page.getByRole('heading', { name: /^Imported 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  expect(await balanceOf(page, 'Main account')).toBe('$960.00');
});

test('balance column: when they agree, it says so', async ({ page }, info) => {
  await setup(page);
  await importText(page, 'Date,Description,Amount,Balance\n10/15/2026,SHELL OIL,-40.00,960.00\n', info);
  await page.getByRole('button', { name: 'Import 1' }).click();
  // Opening balance was set today, so the 15 Oct row is "before you started" and the app still says 1,000.00.
  await expect(page.getByRole('heading', { name: /Your bank says \$960\.00, the app says \$1,000\.00/ })).toBeVisible();
  await expect(page.getByText(/from before you started/)).toBeVisible();
  await page.getByRole('button', { name: 'Leave it' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await importText(page, 'Date,Description,Amount,Balance\n10/16/2026,TESCO,-25.00,975.00\n', info, 'second.csv');
  await page.getByRole('button', { name: 'Import 1' }).click();
  const sort = page.locator('.sort-grid');
  if (await sort.isVisible()) await page.getByRole('button', { name: 'Finish later' }).click();
  await expect(page.getByRole('heading', { name: 'Your bank and the app agree' })).toBeVisible();
  await expect(page.getByText('Both say $975.00')).toBeVisible();
});

test('needs sorting: a row that could be two entries asks which one, and is never added twice', async ({ page }, info) => {
  await setup(page);
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  for (const t of ['4.50 coffee', '4.50 coffee with Jo']) {
    await box.fill(t);
    await box.press('Enter');
    await expect(box).toHaveValue('');
  }
  await importText(page, 'Date,Description,Amount\n10/16/2026,STARBUCKS #1234,-4.50\n10/16/2026,WHOLE FOODS,-20.00\n', info);
  await expect(page.getByText(/could be more than one thing already in the app/)).toBeVisible();
  await page.getByRole('button', { name: 'Next: sort the unclear ones' }).click();
  await expect(page.getByText('Needs sorting · 1 of 1')).toBeVisible();
  await shot(page, 'needs-sorting');
  await page.getByRole('button', { name: /^Coffee with Jo/ }).click();
  const done = page.getByRole('heading', { name: /^Imported 1/ });
  for (let i = 0; i < 5 && !(await done.isVisible()); i++) {
    const skip = page.getByRole('button', { name: /^(Finish later|Skip|Continue|Leave it)$/ });
    if (await skip.first().isVisible()) await skip.first().click();
    await page.waitForTimeout(150);
  }
  await expect(done).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await nav(page, 'Log').click();
  await expect(page.locator('.log-day .row').filter({ hasText: '-$4.50' })).toHaveCount(2); // still just the two typed coffees
});

test('transfers: typed in the Log, and suggested on import — never spending, both balances move', async ({ page }, info) => {
  await setup(page);
  await addSavings(page);

  // Typed transfer.
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('radio', { name: 'Transfer' }).click();
  await page.getByLabel('Amount').fill('100');
  await page.getByLabel('To', { exact: true }).selectOption({ label: 'Savings' });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Moved $100.00 to Savings');
  await expect(page.getByText('Money out this month: $0.00')).toBeVisible();

  // Imported "transfer to savings": suggested, confirmed by the user, the savings side created.
  await importText(page, 'Date,Description,Amount\n10/16/2026,ONLINE TRANSFER TO SAV XXXX1234,-150.00\n10/16/2026,TESCO,-25.00\n', info);
  await expect(page.getByRole('heading', { name: 'Moves between your accounts?' })).toBeVisible();
  await page.getByRole('button', { name: "Yes, it's a transfer" }).click();
  await expect(page.getByRole('button', { name: "It's a transfer", exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'transfer-suggested');
  await page.getByRole('button', { name: 'Import 2' }).click();
  const done = page.getByRole('heading', { name: /^Imported 2/ });
  for (let i = 0; i < 5 && !(await done.isVisible()); i++) {
    const skip = page.getByRole('button', { name: /^(Finish later|Skip|Continue|Leave it)$/ });
    if (await skip.first().isVisible()) await skip.first().click();
    await page.waitForTimeout(150);
  }
  await expect(page.getByText('1 marked as moves between your accounts (not spending or income)')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  expect(await balanceOf(page, 'Main account')).toBe('$725.00'); // 1,000 − 100 − 150 − 25
  expect(await balanceOf(page, 'Savings')).toBe('$750.00'); // 500 + 100 + 150
  await nav(page, 'Log').click();
  await expect(page.getByText('Money out this month: $25.00')).toBeVisible(); // only Tesco is spending
});
