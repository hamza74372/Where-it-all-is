// Fixes from the one-month customer test (qa/customer-test/REPORT.md).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

async function setup(page: Page, opts: { card?: boolean; noPay?: boolean } = {}) {
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('Balance today').fill('1850');
  if (opts.card) await page.getByRole('radio', { name: 'Yes, I use a card' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  if (opts.card) {
    await expect(page.getByRole('heading', { name: 'Your credit card' })).toBeVisible();
    await expect(page.getByText('Step 1 of 4')).toBeVisible(); // still under the Balance dot
    await page.getByLabel('Card name').fill('Visa');
    await page.getByLabel('What you owe on it now').fill('320');
    await page.getByLabel('Payment due day (day of month)').fill('25');
    await page.getByRole('radio', { name: 'Minimum' }).click();
    await page.getByLabel('Minimum payment').fill('25');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  if (opts.noPay) {
    await page.getByRole('button', { name: "I don't have regular pay" }).click();
    await expect(page.getByText('Safe to spend plans until the end of the month using money you already have. Log money when it arrives.')).toBeVisible();
  } else {
    await page.getByLabel('How much lands in your account?').fill('2100');
    await page.getByLabel('Next payday').fill('2026-10-16');
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Phone amount').fill('50');
  await page.getByLabel('Phone day of month').fill('8');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0);
}

async function mainBalance(page: Page) {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Accounts/ }).click();
  return (await page.locator('.row').filter({ hasText: 'Main account' }).first().locator('.money').textContent())?.trim();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-06T10:00:00') });
  await page.goto(APP);
});

test.describe('CT-01: the first entry after setup is never lost', () => {
  test('setup → quick-log at once → navigate away → reload: the balance includes it', async ({ page }) => {
    await setup(page);
    const box = page.getByRole('textbox', { name: 'Log a spend' });
    await box.fill('12.50 shared groceries');
    await box.press('Enter');
    await nav(page, 'More').click(); // straight away, no waiting
    await page.getByRole('button', { name: /^Share with partner/ }).click();
    await page.reload();
    expect(await mainBalance(page)).toBe('$1,837.50');
  });

  test('with the first-backup prompt open: "Saved" shows once it is stored, and it survives a reload', async ({ page }) => {
    await setup(page);
    await expect(page.getByRole('region', { name: 'Make your first backup' })).toBeVisible();
    const box = page.getByRole('textbox', { name: 'Log a spend' });
    await box.fill('12.50 shared groceries');
    await box.press('Enter');
    await expect(page.locator('#ql-preview')).toHaveText('Saved');
    await expect(box).toHaveValue('');
    await page.reload();
    expect(await mainBalance(page)).toBe('$1,837.50');
  });

  test('with the "while you were away" card showing', async ({ page }) => {
    await setup(page);
    await page.clock.setSystemTime(new Date('2026-10-16T17:00:00')); // phone (8th) and payday (16th) have passed
    await page.reload();
    await expect(page.getByRole('region', { name: 'While you were away' })).toBeVisible();
    const box = page.getByRole('textbox', { name: 'Log a spend' });
    await box.fill('12.50 shared groceries');
    await box.press('Enter');
    await expect(page.locator('#ql-preview')).toHaveText('Saved');
    await page.reload();
    expect(await mainBalance(page)).toBe('$1,837.50');
  });
});

test('Mark paid: a different amount, then skip the next one', async ({ page }) => {
  await setup(page);
  await nav(page, 'Bills').click();
  await page.getByRole('button', { name: /Mark Phone paid/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: 'Different amount' }).click();
  await sheet.getByLabel('Amount paid').fill('62.40');
  await sheet.getByRole('button', { name: 'Mark paid', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Phone marked paid · $62.40');
  expect(await mainBalance(page)).toBe('$1,787.60');
  await page.getByRole('button', { name: 'Back to More' }).click();

  await nav(page, 'Bills').click();
  await expect(page.getByRole('button', { name: /Mark Phone paid for Sun, Nov 8/ })).toBeVisible();
  await expect(page.locator('.row-bill').filter({ hasText: 'Phone' }).locator('.money')).toHaveText('$50.00'); // back to usual
  await page.getByRole('button', { name: /Mark Phone paid/ }).click();
  await sheet.getByRole('radio', { name: 'Skip this time' }).click();
  await expect(sheet).toContainText('No money moves, and the next due date comes up.');
  await sheet.getByRole('button', { name: 'Skip this time' }).last().click();
  await expect(page.getByRole('status')).toContainText('Phone skipped this time');
  await expect(page.getByRole('button', { name: /Mark Phone paid for Tue, Dec 8/ })).toBeVisible();
  expect(await mainBalance(page)).toBe('$1,787.60'); // no money moved
});

test('credit card in guided setup: the card and its payment are created', async ({ page }) => {
  await setup(page, { card: true });
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Accounts/ }).click();
  await expect(page.locator('.row').filter({ hasText: 'Visa' })).toContainText('$320.00');
  await page.getByRole('button', { name: 'Back to More' }).click();
  await nav(page, 'Bills').click();
  await expect(page.locator('.row-bill').filter({ hasText: 'Visa payment' })).toContainText('$25.00');
  // The checklist doesn't ask for a card that's already there.
  await nav(page, 'Today').click();
  await expect(page.getByRole('region', { name: 'When you have a minute' })).not.toContainText('Add your credit card');
});

test('the "when you have a minute" card lists only what was skipped, links to it, and can be hidden', async ({ page }) => {
  await setup(page);
  const card = page.getByRole('region', { name: 'When you have a minute' });
  await expect(card.getByRole('button')).toHaveText(['Add your credit card', 'Add savings', 'Add another bill', 'Try an import', 'Hide this']);
  for (const word of ['behind', 'missed', 'should', 'forgot']) await expect(card).not.toContainText(new RegExp(`\\b${word}\\b`, 'i'));
  await card.getByRole('button', { name: 'Add another bill' }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); // the add-bill form, open
  await page.getByRole('button', { name: 'Close' }).click();
  await nav(page, 'Today').click();
  await card.getByRole('button', { name: 'Try an import' }).click();
  await expect(page.getByRole('heading', { name: 'Import a statement' })).toBeVisible();
  await nav(page, 'Today').click();
  await card.getByRole('button', { name: 'Hide this' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'When you have a minute' })).toHaveCount(0);
});

test('import results say what happened to each row; a bill the bank took is linked to it', async ({ page }, info) => {
  await setup(page);
  await page.clock.setSystemTime(new Date('2026-10-09T10:00:00'));
  await page.reload();
  const file = path.join(info.outputDir, 'oct.csv');
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(file, 'Date,Description,Amount\n10/07/2026,BOOKSHOP,-12.99\n10/08/2026,PHONE CO DIRECT DEBIT,-52.10\n');
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^Import \d+/ }).click();
  const done = page.getByRole('heading', { name: /^Imported/ });
  for (let i = 0; i < 10 && !(await done.isVisible()); i++) {
    const step = page.getByRole('button', { name: /^(Finish later|Skip|Leave it)$/ });
    if (await step.first().isVisible()) await step.first().click();
    await page.waitForTimeout(150);
  }
  await expect(page.locator('.import-summary')).toHaveText('1 imported · 1 matched to your Phone bill');
  await page.getByRole('button', { name: 'Done' }).click();
  await nav(page, 'Bills').click();
  await expect(page.getByRole('button', { name: /Mark Phone paid for Sun, Nov 8/ })).toBeVisible(); // October's is paid
});

test('partner sharing says snapshot; help says so too', async ({ page }) => {
  await setup(page, { noPay: true });
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Share with partner/ }).click();
  const line = "This is a read-only snapshot. It doesn't update by itself. Send a new one whenever you want your partner to see the latest.";
  await expect(page.getByText(line).first()).toBeVisible();
  await page.getByRole('button', { name: 'Back to More' }).click();
  await page.getByRole('button', { name: /^Help/ }).click();
  await page.getByRole('button', { name: /Sharing with a partner/ }).click();
  await expect(page.getByText(line)).toBeVisible();
});

test('choosing "No card" in setup keeps the card off the checklist', async ({ page }) => {
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('Balance today').fill('900');
  await page.getByRole('radio', { name: 'Yes, I use a card' }).click();
  await page.getByRole('radio', { name: 'No card' }).click();
  await page.getByRole('button', { name: 'Skip setup' }).click();
  const card = page.getByRole('region', { name: 'When you have a minute' });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText('Add your credit card');
  await expect(card).toContainText('Add savings');
});

// The root cause of CT-01: tapping a tab moved focus to the screen a frame later, which could pull it
// out of the log box while someone was already typing — the text went nowhere and Enter saved nothing.
test('CT-01 root cause: tap Today, then type and press Enter straight away — every entry is stored', async ({ page }) => {
  await setup(page);
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  const stored = () =>
    page.evaluate(
      () =>
        new Promise<number>((res) => {
          const r = indexedDB.open('where-it-all-is');
          r.onsuccess = () => {
            const c = r.result.transaction('transactions').objectStore('transactions').count();
            c.onsuccess = () => {
              res(c.result);
              r.result.close();
            };
          };
        }),
    );
  for (let i = 0; i < 20; i++) {
    await nav(page, 'Today').click(); // no pause between the tap and the typing
    await box.fill(`${i + 1}.25 lunch`);
    await box.press('Enter');
    await expect(box).toHaveValue('');
  }
  await expect.poll(stored).toBe(20);
});
