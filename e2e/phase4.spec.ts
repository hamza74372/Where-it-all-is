import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const FIX = (f: string) => path.resolve('test/fixtures/csv', f);
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => SHOTS && page.screenshot({ path: path.join(SHOTS, `p4-${name}.png`) });
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && problems.push(`network: ${r.url()}`));
  return problems;
}

async function setup(page: Page) {
  await page.clock.install({ time: new Date(2026, 9, 16, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('2000');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await nav(page, 'Log').click();
}

/** After "Import N": finish any sorting later, skip the balance check, land on the summary. */
async function finishImport(page: Page) {
  const finish = page.getByRole('button', { name: 'Finish later' });
  // Files with a balance column get the automatic check; others ask you to type the balance.
  const balance = page.getByRole('heading', { name: /balance is…\?|say you owe\?|^Your bank says|^Your bank and the app agree/ });
  await expect(finish.or(balance)).toBeVisible();
  if (await finish.isVisible()) await finish.click();
  await expect(balance).toBeVisible();
  await page.getByRole('button', { name: /^(Skip|Leave it|Continue)$/ }).click();
}

async function pickFile(page: Page, file: string) {
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(FIX(file));
}

test('import a Chase-style CSV: rules sort most rows, sort the rest, re-import skips everything, undo', async ({ page }) => {
  const problems = guard(page);
  await setup(page);
  await pickFile(page, 'chase-checking.csv');

  // Map step: preview shows tidied descriptions and signed amounts.
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await expect(page.locator('.row').filter({ hasText: 'Starbucks Store 12345 Seattle Wa' }).first()).toContainText('-$5.75');
  await expect(page.locator('.row').filter({ hasText: 'Acme Corp Payroll' })).toContainText('+$1,850.00');
  await shot(page, 'map');
  await page.getByLabel('Remember these settings as').fill('Chase checking');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Review: 10 new; only "CHECK 1043" has no rule.
  await expect(page.getByText('10 new transactions')).toBeVisible();
  await expect(page.getByText('1 will need a category')).toBeVisible();
  await shot(page, 'review');
  await page.getByRole('button', { name: 'Import 10' }).click();

  // Sort: one row, with "always" on.
  await expect(page.getByRole('heading', { name: 'Check 1043' })).toBeVisible();
  await shot(page, 'sort');
  await page.getByRole('button', { name: /Home/ }).click();
  // "CHECK" is a generic bank word, so no "always put…" offer.
  // Chase files have a balance column, so the app checks itself against the bank. They differ:
  // the app started at 2,000.00 today, so every row here is from before you started.
  await expect(page.getByRole('heading', { name: /^Your bank says \$[\d,.]+, the app says \$2,000\.00\. Here's what might be missing\.$/ })).toBeVisible();
  await expect(page.getByText(/rows are from before you started/)).toBeVisible();
  await page.getByRole('button', { name: 'Leave it' }).click();
  await expect(page.getByRole('heading', { name: 'Imported 10 transactions' })).toBeVisible();
  await shot(page, 'done');
  await page.getByRole('button', { name: 'Done' }).click();

  // Log shows them, categorised.
  await nav(page, 'Log').click();
  await expect(page.getByText('Netflix.com Netflix.com Ca')).toBeVisible();

  // Re-import: saved settings are recognised and everything is a duplicate.
  await pickFile(page, 'chase-checking.csv');
  await expect(page.getByText('Using your saved settings for "Chase checking"')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('10 already imported before — skipped')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nothing new to import' })).toBeDisabled();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();

  // Undo the whole import from "Recent imports".
  await page.getByRole('button', { name: 'Undo import' }).click();
  await expect(page.getByRole('status')).toContainText('Removed 10 imported transactions');
  await page.getByRole('button', { name: '‹ Log' }).click();
  await expect(page.getByText('Netflix.com Netflix.com Ca')).toHaveCount(0);

  expect(problems).toEqual([]);
});

test('ambiguous dates: HSBC-style file is worked out without asking', async ({ page }) => {
  const problems = guard(page);
  await setup(page); // a US user, so the region guess would be month-first
  await pickFile(page, 'hsbc-uk.csv');
  await expect(page.getByRole('group', { name: /Quick check/ })).toHaveCount(0);
  await expect(page.locator('.row').filter({ hasText: 'Landlord Ltd Rent' })).toContainText('Thu, Oct 1');
  await expect(page.locator('.row').filter({ hasText: 'Amazon.co.uk' })).toContainText('-$1,099.99');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('7 new transactions')).toBeVisible();
  await page.getByRole('button', { name: 'Import 7' }).click();
  await finishImport(page);
  await expect(page.getByRole('heading', { name: 'Imported 7 transactions' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('a file that is not a bank export gets a clear message', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.csv', mimeType: 'text/csv', buffer: Buffer.from('hello\n') });
  await expect(page.getByRole('alert')).toContainText("couldn't find any transactions");
});

test('all 11 sample bank exports import through the UI with the expected counts', async ({ page }) => {
  const problems = guard(page);
  await setup(page);
  const expected: Array<[string, number]> = [
    ['chase-checking.csv', 10], ['bofa-checking.csv', 7], ['wells-fargo-checking.csv', 7], ['capital-one-credit.csv', 7],
    ['capital-one-360.csv', 6], ['barclays.csv', 7], ['hsbc-uk.csv', 7], ['monzo.csv', 6], ['revolut.csv', 6],
    ['generic-parentheses.csv', 6], ['generic-eu-semicolon.csv', 6],
  ];
  for (const [file, n] of expected) {
    await pickFile(page, file);
    const q = page.getByRole('group', { name: /Quick check/ });
    if (await q.isVisible().catch(() => false)) await q.getByRole('button').first().click(); // day/month order
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(`${n} new transaction`), file).toBeVisible();
    await page.getByRole('button', { name: `Import ${n}` }).click();
    await finishImport(page);
    await expect(page.getByRole('heading', { name: `Imported ${n} transaction` }), file).toBeVisible();
    // Each file stands alone: these are different banks' statements for the same dates, so in one
    // account their same-amount rows would (rightly) be linked to each other.
    await page.getByRole('button', { name: 'Undo this import' }).click();
  }
  expect(problems).toEqual([]);
});

test('a file that genuinely can’t tell day from month asks — neutrally — and uses the answer', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'two-rows.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n05/06/2026,Coffee,-3.00\n06/05/2026,Tea,-2.00\n'),
  });
  const q = page.getByRole('group', { name: /Quick check/ });
  await expect(q).toContainText('"05/06/2026"');
  // Neither answer is pre-selected as the main button.
  await expect(q.locator('.btn-primary')).toHaveCount(0);
  await shot(page, 'date-question');
  await q.getByRole('button', { name: 'Friday, June 5' }).click();
  await expect(page.locator('.row').filter({ hasText: 'Coffee' })).toContainText('Fri, Jun 5');
});

test('manual logs are matched, unlinking works, the balance check fixes the number, undo leaves your entry', async ({ page }) => {
  const problems = guard(page);
  await setup(page); // 16 Oct 2026, balance 2,000
  await nav(page, 'Today').click();
  await page.getByRole('textbox', { name: 'Log a spend' }).fill('5.75 coffee'); // bank row: STARBUCKS 10/15, -5.75
  await page.getByRole('textbox', { name: 'Log a spend' }).press('Enter');
  await nav(page, 'Log').click();
  await pickFile(page, 'chase-checking.csv');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('9 new transactions')).toBeVisible();
  await expect(page.getByText('1 already in the app — linked, not added twice')).toBeVisible();
  // Unlink → it becomes new; going back and forward re-matches.
  await page.getByRole('button', { name: /^Unlink/ }).click();
  await expect(page.getByText('10 new transactions')).toBeVisible();
  await expect(page.getByText('already in the app — linked, not added twice')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('1 already in the app — linked, not added twice')).toBeVisible();
  await page.getByRole('button', { name: 'Import 9' }).click();
  await page.getByRole('button', { name: 'Finish later' }).click();

  // Onboarded today (16 Oct) with 2,000, so every statement row (1–15 Oct) is from before you
  // started and doesn't move the balance. App: 2,000 − 5.75 (today's coffee) = 1,994.25. The file's
  // balance column says 2,824.10 at the close of 15 Oct, so the check is automatic.
  await expect(page.getByRole('heading', { name: "Your bank says $2,824.10, the app says $1,994.25. Here's what might be missing." })).toBeVisible();
  await expect(page.getByText(/That's \$829\.85 more at the bank/)).toBeVisible();
  await page.getByRole('button', { name: 'Add a balance adjustment of +$829.85' }).click();
  await expect(page.getByRole('status')).toContainText('Balance adjustment of +$829.85 added');
  await expect(page.getByRole('heading', { name: 'Imported 9 transactions' })).toContainText('9');
  await expect(page.getByText('1 already in the app, so linked instead of added twice')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // Corrected balance 2,824.10; the coffee was spent today: (2,824.10 + 5.75) ÷ 16 days = 176.86, minus 5.75 = 171.11 → $171.
  await nav(page, 'Today').click();
  await expect(page.locator('.big-number')).toHaveText('$171');

  // Undo the import: the 9 rows go; the manual coffee stays.
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.getByRole('button', { name: 'Undo import' }).click();
  await page.getByRole('button', { name: '‹ Log' }).click();
  await expect(page.locator('.row').filter({ hasText: 'Coffee' })).toHaveCount(1);
  await expect(page.getByText('Whole Foods Market', { exact: false })).toHaveCount(0);
  expect(problems).toEqual([]);
});
