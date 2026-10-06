// Log filters + all-month search, hidden accounts, More → Your data (import history, erase), the
// one delete rule, the line under Today's number, and the import's 10-row preview + final counts.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });
const more = async (page: Page, item: string) => {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: new RegExp(`^${item}`) }).click();
};

async function examples(page: Page) {
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await expect(page.locator('.big-number')).toBeVisible();
}

async function writeCsv(info: { outputDir: string }, name: string, text: string) {
  fs.mkdirSync(info.outputDir, { recursive: true });
  const file = path.join(info.outputDir, name);
  fs.writeFileSync(file, text);
  return file;
}

test('Today: one plain line under the big number says what it means', async ({ page }) => {
  await examples(page);
  const hero = page.locator('.hero');
  await expect(hero.getByText('What you can spend today and still cover your bills until payday.')).toBeVisible();
});

test('Log: filter by account and category; search covers every month, grouped by month', async ({ page }) => {
  await examples(page);
  await nav(page, 'Log').click();
  // An older entry, back in August.
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Amount').fill('4.20');
  await sheet.getByLabel('Note').fill('Summer coffee');
  await sheet.getByLabel('Category').selectOption({ label: '☕ Coffee' });
  await sheet.getByLabel('Date').fill('2026-08-14');
  await sheet.getByRole('button', { name: 'Save' }).click();
  const rows = page.locator('.log-day .row');
  await expect(rows.filter({ hasText: 'Summer coffee' })).toHaveCount(0); // not in October

  // Account filter: the takeaway was on the credit card.
  await page.getByLabel('Show account').selectOption({ label: 'Credit card' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Takeaway');
  await page.getByLabel('Show account').selectOption({ label: 'All accounts' });

  // Category filter.
  await page.getByLabel('Show category').selectOption({ label: '🛒 Groceries' });
  await expect(rows).toHaveCount(2);
  await expect(page.getByText(/Money out this month \(filtered\): \$62\.95/)).toBeVisible();
  await page.getByLabel('Show category').selectOption({ label: 'All categories' });

  // Search: every month, grouped by month, with the date on each row.
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('coffee');
  await expect(page.getByText(/^2 results across all months/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'October 2026', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'August 2026', level: 3 })).toBeVisible();
  await expect(rows.filter({ hasText: 'Summer coffee' })).toContainText('Fri, Aug 14');
  // By amount.
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('34.20');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Big shop');
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('zzz');
  await expect(page.getByText('Nothing matches that search in any month.')).toBeVisible();
});

test('Accounts: a hidden account is listed under "Hidden accounts" and comes back with Show', async ({ page }) => {
  await examples(page);
  await more(page, 'Accounts');
  await page.getByRole('button', { name: /^Savings/ }).click();
  await page.getByRole('button', { name: 'Hide this account' }).click(); // single item: straight away, with Undo
  await expect(page.getByRole('status')).toContainText('Savings hidden');
  const hidden = page.getByRole('list', { name: 'Hidden accounts' });
  await expect(hidden.getByText('Savings', { exact: true })).toBeVisible();
  await hidden.getByRole('button', { name: 'Show Savings' }).click();
  await expect(page.getByRole('status')).toContainText('Savings is back');
  await expect(page.getByRole('list', { name: 'Hidden accounts' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Savings/ })).toBeVisible();
});

test('one delete rule: a single bill goes straight away with Undo — no confirm', async ({ page }) => {
  await examples(page);
  await nav(page, 'Bills').click();
  await page.getByRole('button', { name: 'Edit Netflix' }).click();
  await page.getByRole('button', { name: 'Delete this bill' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Netflix' })).toHaveCount(0);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Edit Netflix' })).toBeVisible();
});

test('Your data: import history lists past imports; undoing one asks first and removes only its rows', async ({ page }, info) => {
  await examples(page);
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  await box.fill('9.99 lunch');
  await box.press('Enter');
  await expect(box).toHaveValue('');
  const file = await writeCsv(info, 'october.csv', 'Date,Description,Amount\n10/06/2026,PRET A MANGER,-9.99\n10/06/2026,SHELL OIL,-40.00\n');
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Import 1' }).click();
  const done = page.getByRole('heading', { name: /^Imported 1/ });
  for (let i = 0; i < 5 && !(await done.isVisible()); i++) {
    const next = page.getByRole('button', { name: /^(Finish later|Skip|Continue|Leave it)$/ });
    if (await next.first().isVisible()) await next.first().click();
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: 'Done' }).click();

  await more(page, 'Your data');
  const history = page.getByRole('list', { name: 'Past imports' });
  await expect(history.getByText('october.csv')).toBeVisible();
  await expect(history).toContainText('Tue, Oct 6 · 1 row added · Everyday account');
  await history.getByRole('button', { name: 'Undo import of october.csv' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('This removes the 1 row that october.csv added.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(history.getByText('october.csv')).toBeVisible(); // nothing happened
  await history.getByRole('button', { name: 'Undo import of october.csv' }).click();
  await page.getByRole('button', { name: 'Remove 1 row' }).click();
  await expect(page.getByRole('status')).toContainText('Import undone — 1 row removed');
  await expect(page.getByText('No imports yet.')).toBeVisible();

  await nav(page, 'Log').click();
  await expect(page.locator('.row').filter({ hasText: 'Shell Oil' })).toHaveCount(0);
  await expect(page.locator('.row').filter({ hasText: 'Lunch' })).toHaveCount(1); // the typed lunch stays
});

test('Your data: erase needs ERASE typed, offers a backup first, then starts fresh', async ({ page }) => {
  await examples(page);
  await more(page, 'Your data');
  // "Back up first" goes to Backup & restore.
  await page.getByRole('button', { name: 'Back up first' }).click();
  await expect(page.getByRole('heading', { name: 'Backup & restore', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '‹ More' }).click();
  await page.getByRole('button', { name: /^Your data/ }).click();

  await page.getByRole('button', { name: 'Erase everything…' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText("You haven't made a backup yet.");
  const go = dialog.getByRole('button', { name: 'Erase everything' });
  await expect(go).toBeDisabled();
  await dialog.getByLabel('Type ERASE to confirm').fill('erase it');
  await expect(go).toBeDisabled();
  await dialog.getByLabel('Type ERASE to confirm').fill('ERASE');
  await expect(go).toBeEnabled();
  await go.click();
  await expect(page.getByRole('button', { name: /Set up mine/ })).toBeVisible();

  // Nothing comes back on reload.
  await page.reload();
  await expect(page.getByRole('button', { name: /Set up mine/ })).toBeVisible();
});

test('import: 10 preview rows; the final screen repeats the skipped and needs-sorting counts', async ({ page }, info) => {
  await page.clock.install({ time: new Date(2026, 9, 16, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('2000');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  const lines = Array.from({ length: 12 }, (_, i) => `10/${String(i + 1).padStart(2, '0')}/2026,SHOP ${i + 1},-${i + 1}.00`);
  const file = await writeCsv(info, 'twelve.csv', ['Date,Description,Amount', ...lines, 'Total,,'].join('\n') + '\n');
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  const preview = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Preview' }) });
  await expect(preview.locator('.row')).toHaveCount(10);
  await expect(preview.getByText('…and 2 more.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Import 12' }).click();
  // Sort one, then leave the rest for later.
  await page.locator('.sort-grid').getByRole('button', { name: /Shopping/ }).click();
  // "SHOP" is a merchant name, so the rule question always follows.
  await page.getByRole('button', { name: 'Just this once' }).click();
  await expect(page.getByText('2 of 12')).toBeVisible();
  await page.getByRole('button', { name: 'Finish later' }).click();
  const skip = page.getByRole('button', { name: /^(Skip|Leave it|Continue)$/ });
  if (await skip.first().isVisible()) await skip.first().click();
  await expect(page.getByRole('heading', { name: 'Imported 12 transactions' })).toBeVisible();
  await expect(page.getByText(/^1 skipped — a row that isn’t a transaction/)).toBeVisible();
  await expect(page.getByText('12 needed sorting — 1 sorted, 11 still without a category (find them in the Log)')).toBeVisible();
});
