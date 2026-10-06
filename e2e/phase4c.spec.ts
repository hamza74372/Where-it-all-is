import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const FIX = (f: string) => path.resolve('test/fixtures/csv', f);
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && problems.push(`network: ${r.url()}`));
  return problems;
}

/** Start on Tue 6 Oct with 1,200 in the bank, then come back on Fri 16 Oct to import. */
async function startedOct6ImportOct16(page: Page) {
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page.locator('.big-number')).toBeVisible(); // saved before the reload below
  await page.clock.setSystemTime(new Date(2026, 9, 16, 9, 0));
  await page.reload();
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
}

test('rows from before you started: shown in the review, kept, but not added to the balance', async ({ page }, info) => {
  const problems = guard(page);
  await startedOct6ImportOct16(page);
  // Without the balance column, so this exercises the "type your bank's balance" check and its
  // big-gap guidance (files with a balance column are checked automatically — reconcile.spec.ts).
  const noBalance = path.join(info.outputDir, 'chase-no-balance.csv');
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(
    noBalance,
    fs
      .readFileSync(FIX('chase-checking.csv'), 'utf8')
      .split('\n')
      .map((l) => l.replace(/^(([^,"]*|"[^"]*"),){5}([^,]*),/, (m) => m.slice(0, m.lastIndexOf(',', m.length - 2) + 1)))
      .join('\n'),
  );
  await page.locator('input[type=file]').setInputFiles(noBalance); // 1–15 Oct
  await page.getByRole('button', { name: 'Continue' }).click();
  // 10/01, 10/02, 10/03 and the two 10/05 rows are before 6 Oct.
  await expect(page.getByText("5 are from before you started on Tue, Oct 6. They're kept for your history but don't change your balance.")).toBeVisible();
  const dir = path.resolve('screenshots/phase4c');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, 'review-before-you-started.png') });

  await page.getByRole('button', { name: 'Import 10' }).click();
  await page.getByRole('button', { name: /Home/ }).click(); // sort CHECK 1043 — no rule offer for a generic word
  // Balance: 1,200 + the 6–15 Oct rows only (−15.49 −32.99 −120.00 −41.30 −5.75) = 984.47.
  await expect(page.getByText('The app says $984.47')).toBeVisible();

  // A small gap leads with the adjustment.
  await page.getByLabel('Balance in your bank app').fill('980');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('button', { name: 'Add a balance adjustment' })).toHaveClass(/btn-primary/);
  await expect(page.getByText("That's a big gap")).toHaveCount(0);
  await page.getByRole('button', { name: 'Re-enter' }).click();

  // A gap bigger than any imported row (biggest here is 1,850): check the rows first.
  await page.getByLabel('Balance in your bank app').fill('5000');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText("That's a big gap — check the imported rows first.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check the imported rows' })).toHaveClass(/btn-primary/);
  const adjust = page.getByRole('button', { name: 'Add a balance adjustment anyway' });
  await expect(adjust).not.toHaveClass(/btn-primary/);
  await page.getByRole('button', { name: 'Check the imported rows' }).click();
  await expect(page.getByRole('list', { name: 'Rows from this import' }).locator('.row')).toHaveCount(10);
  await expect(page.getByText('before you started (doesn’t change the balance)').first()).toBeVisible();
  await page.getByRole('button', { name: 'Leave it' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // The Log shows them, tagged.
  await expect(page.locator('.row').filter({ hasText: 'Acme Corp Payroll' })).toContainText('Before you started');
  expect(problems).toEqual([]);
});

test('a future-dated row is flagged in the preview', async ({ page }) => {
  await startedOct6ImportOct16(page);
  // One row, can't tell day from month; a US user's default reads it as 10 Nov — in the future.
  await page.locator('input[type=file]').setInputFiles({ name: 'one.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n11/10/2026,Corner shop,-6.20\n') });
  await expect(page.getByText('1 row is dated in the future — check the date format.')).toBeVisible();
  await expect(page.locator('.row').filter({ hasText: 'Corner Shop' })).toContainText('Dated in the future — check the date format');
  // Reading it day-first (11 Oct) clears the flag.
  await page.getByRole('group', { name: /Quick check/ }).getByRole('button', { name: 'Sunday, October 11' }).click();
  await expect(page.getByText('Dated in the future')).toHaveCount(0);
});

test('after picking a category: "Always put … in …?  Yes / Just this once" — and the rule works next time', async ({ page }) => {
  const problems = guard(page);
  await startedOct6ImportOct16(page);
  const file = 'Date,Description,Amount\n10/12/2026,BLUE BOTTLE COFFEE #22 OAKLAND,-6.50\n10/14/2026,BLUE BOTTLE COFFEE #22 OAKLAND,-4.25\n10/15/2026,MOONLIGHT BOOKS,-18.00\n';
  await page.locator('input[type=file]').setInputFiles({ name: 'small.csv', mimeType: 'text/csv', buffer: Buffer.from(file) });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Import 3' }).click();

  // No toggle to remember beforehand: pick first, then answer.
  await expect(page.getByRole('switch')).toHaveCount(0);
  await page.getByRole('button', { name: /Coffee/ }).click();
  await expect(page.getByRole('heading', { name: 'Always put “Blue Bottle” in Coffee?' })).toBeVisible();
  await page.getByRole('button', { name: 'Yes, always' }).click();
  // The second Blue Bottle row was sorted by the new rule; next up is the bookshop.
  await expect(page.getByRole('heading', { name: 'Moonlight Books' })).toBeVisible();
  await page.getByRole('button', { name: /Fun/ }).click();
  await page.getByRole('button', { name: 'Just this once' }).click();
  await page.getByRole('button', { name: 'Skip' }).click(); // balance check
  await page.getByRole('button', { name: 'Done' }).click();

  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Rules/ }).click();
  await expect(page.locator('.row').filter({ hasText: 'contains "BLUE BOTTLE"' })).toContainText('Coffee');
  await expect(page.locator('.row').filter({ hasText: 'MOONLIGHT' })).toHaveCount(0);
  expect(problems).toEqual([]);
});
