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
  await page.getByRole('switch', { name: /Always put "CHECK" in this category/ }).click();
  await shot(page, 'sort');
  await page.getByRole('button', { name: /Home/ }).click();
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
  await expect(page.getByText('10 already in your log')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nothing new to import' })).toBeDisabled();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();

  // Undo the whole import from "Recent imports".
  await page.getByRole('button', { name: 'Undo import' }).click();
  await expect(page.getByRole('status')).toContainText('Removed 10 imported transactions');
  await page.getByRole('button', { name: '‹ Log' }).click();
  await expect(page.getByText('Netflix.com Netflix.com Ca')).toHaveCount(0);

  // The rule made while sorting is listed under More → Rules.
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Rules/ }).click();
  await expect(page.locator('.row').filter({ hasText: 'contains "CHECK"' })).toContainText('Home');
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
  // Rules cover most; finish sorting later.
  const finish = page.getByRole('button', { name: 'Finish later' });
  if (await finish.isVisible().catch(() => false)) await finish.click();
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
    ['capital-one-360.csv', 6], ['barclays.csv', 7], ['hsbc-uk.csv', 7], ['monzo.csv', 6], ['revolut.csv', 5],
    ['generic-parentheses.csv', 6], ['generic-eu-semicolon.csv', 6],
  ];
  for (const [file, n] of expected) {
    await pickFile(page, file);
    const q = page.getByRole('group', { name: /Quick check/ });
    if (await q.isVisible().catch(() => false)) await q.getByRole('button').first().click(); // day/month order
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(`${n} new transaction`), file).toBeVisible();
    await page.getByRole('button', { name: `Import ${n}` }).click();
    const finish = page.getByRole('button', { name: 'Finish later' });
    const done = page.getByRole('heading', { name: /^Imported / });
    await expect(finish.or(done)).toBeVisible(); // sort screen or done screen, whichever comes
    if (await finish.isVisible()) await finish.click();
    await expect(page.getByRole('heading', { name: `Imported ${n} transaction` }), file).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
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
