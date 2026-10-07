// The audit's realistic run, with a bank statement that matches Sam's real month
// (test/fixtures/csv/sam-checking.csv, ending balance 2,998.99). Records the headline numbers in
// test-results/realistic-numbers.json and checks the app agrees with the bank.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

test('realistic month: bills paid, pay confirmed, spends logged, then the bank statement — no double counting', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));

  // Set up on Wed 30 Sep.
  await page.clock.install({ time: new Date(2026, 8, 30, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('What should we call you? (optional)').fill('Sam');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('How much lands in your account?').fill('1500');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Rent or mortgage amount').fill('800');
  await page.getByLabel('Rent or mortgage day of month').fill('1');
  await page.getByLabel('Phone amount').fill('45');
  await page.getByLabel('Phone day of month').fill('15');
  await page.getByRole('button', { name: 'Add another bill' }).click();
  await page.getByLabel('Bill name').fill('Netflix');
  await page.getByLabel('Netflix amount').fill('15.49');
  await page.getByLabel('Netflix day of month').fill('20');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('.big-number')).toBeVisible();

  // Back on Fri 16 Oct (payday): catch up, confirm today's pay, log four spends.
  await page.clock.setSystemTime(new Date(2026, 9, 16, 10, 0));
  await page.reload();
  await page.getByRole('button', { name: 'They all happened' }).click();
  await page.getByRole('button', { name: "Yes, it's in" }).click();
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  for (const t of ['4.50 coffee', '32.10 groceries', '12 lunch', '2.75 bus']) {
    await box.fill(t);
    await box.press('Enter');
    await expect(box).toHaveValue('');
  }

  // Import the statement.
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(path.resolve('test/fixtures/csv/sam-checking.csv'));
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
  // Sort / balance steps until the summary.
  const done = page.getByRole('heading', { name: /^Imported|^Linked/ });
  for (let i = 0; i < 20 && !(await done.isVisible()); i++) {
    const sortHome = page.locator('.sort-grid').getByRole('button', { name: /Home/ });
    const advance = page.getByRole('button', { name: /^(Continue|Skip|Leave it|Just this once)$/ });
    if (await sortHome.isVisible()) await sortHome.click();
    else if (await advance.first().isVisible()) await advance.first().click();
    await page.waitForTimeout(150);
  }
  await expect(done).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // The numbers.
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Accounts/ }).click();
  const balance = (await page.locator('.row').filter({ hasText: 'Main account' }).locator('.money').textContent())!.trim();
  await page.getByRole('button', { name: 'Back to More' }).click();
  await nav(page, 'Today').click();
  const safe = (await page.locator('.big-number').textContent())!.trim();
  const period = (await page.locator('#safe-sub').textContent())!.trim();
  await nav(page, 'Log').click();
  const payRows = await page.locator('.log-day .row').filter({ hasText: '+$1,500.00' }).count();
  const rentRows = await page.locator('.log-day .row').filter({ hasText: '-$800.00' }).count();
  const logRows = await page.locator('.log-day .row').count();
  const moneyOut = (await page.getByText(/^Money out this month/).textContent())!.trim();
  await nav(page, 'Plan').click();
  await page.getByRole('radio', { name: 'Insights' }).click();
  const compare = (await page.locator('section').filter({ hasText: 'This month vs last month' }).first().textContent())!.replace(/\s+/g, ' ');
  const home = compare.match(/Home ?(\$[\d,.]+)/)?.[1] ?? 'none';

  const numbers = { balance, safe, period, payRows, rentRows, logRows, moneyOut, home };
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(path.join('test-results', `realistic-numbers${process.env.TAG ? '-' + process.env.TAG : ''}.json`), JSON.stringify(numbers, null, 2));
  console.log(JSON.stringify(numbers));

  expect(balance).toBe('$2,998.99'); // the bank's ending balance
  expect(payRows).toBe(2);
  expect(rentRows).toBe(1);
  expect(problems).toEqual([]);
});
