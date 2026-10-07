// Screen inventory for the polish audit: every screen and state at 390px, empty and filled,
// light and dark. Full-length screenshots → docs/screens/<theme>/, plus the layout checks per shot.
// Run: npx playwright test -c playwright.audit.config.ts screens --project=webkit-iphone13-light --project=webkit-iphone13-dark
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPage, type Finding } from './checks';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const DEMO = pathToFileURL(path.resolve('dist/demo.html')).href;
const W = 390;
const H = 844;

function harness(page: Page, theme: string, state: 'empty' | 'filled' | 'demo') {
  const dir = path.resolve('docs/screens', theme);
  fs.mkdirSync(dir, { recursive: true });
  const shots: Array<{ file: string; findings: Finding }> = [];
  const failures: string[] = [];
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  let n = 0;

  const shot = async (name: string) => {
    await page.waitForTimeout(350);
    await page.setViewportSize({ width: W, height: H });
    const findings = await page.evaluate(auditPage);
    // Grow the window to the content so one picture shows the whole screen (or the whole sheet).
    const h = await page.evaluate(() => {
      const panel = document.querySelector('dialog[open] .sheet-panel') as HTMLElement | null;
      if (panel) return panel.scrollHeight + 160;
      const main = document.getElementById('main');
      return (main ? main.scrollHeight : document.documentElement.scrollHeight) + 140;
    });
    if (h > H) await page.setViewportSize({ width: W, height: Math.min(h, 7000) });
    await page.evaluate(() => {
      document.getElementById('main')?.scrollTo(0, 0);
      (document.querySelector('dialog[open] .sheet-panel') as HTMLElement | null)?.scrollTo(0, 0);
    });
    await page.waitForTimeout(150);
    const file = `${state}-${String(++n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(dir, file) });
    await page.setViewportSize({ width: W, height: H });
    shots.push({ file, findings });
  };
  /** One screen/state; a failure is recorded and the walk carries on. */
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      failures.push(`${name}: ${(e as Error).message.split('\n')[0]}`);
      await page.keyboard.press('Escape').catch(() => {});
    }
  };
  const save = () =>
    fs.writeFileSync(path.join(dir, `${state}-report.json`), JSON.stringify({ shots, failures, errors }, null, 2));
  return { shot, step, save, failures };
}

test.beforeEach(({ page }) => page.setDefaultTimeout(8000));

const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });
const closeSheet = (page: Page) => page.keyboard.press('Escape');

async function morePages(page: Page, h: ReturnType<typeof harness>) {
  const pages: Array<[string, string]> = [
    ['Accounts', 'more-accounts'], ['Paychecks', 'more-paychecks'], ['Categories', 'more-categories'], ['Rules', 'more-rules'],
    ['Notes', 'more-notes'], ['Backup & restore', 'more-backup'], ['Share with partner', 'more-share'], ['Your data', 'more-data'], ['Quick-log chips', 'more-chips'],
    ['Settings', 'more-settings'], ['Help', 'more-help'], ['About & privacy', 'more-about'],
  ];
  await nav(page, 'More').click();
  await h.shot('more-menu');
  for (const [label, file] of pages) {
    await h.step(file, async () => {
      await page.getByRole('button', { name: new RegExp(`^${label.replace(/[&]/g, '\\&')}`) }).click();
      await h.shot(file);
      if (label === 'Your data') {
        await page.getByRole('button', { name: 'Erase everything…' }).click();
        await h.shot('more-data-erase-confirm');
        await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
      }
      if (label === 'Help') {
        await page.getByRole('button', { name: /^Safe to spend, explained/ }).click();
        await h.shot('more-help-article');
        await page.getByRole('button', { name: 'Back to all help' }).click();
      }
      await page.getByRole('button', { name: 'Back to More' }).click();
    });
  }
}

test.beforeEach(({}, info) => {
  test.skip(!info.project.name.startsWith('webkit-iphone13'), 'iPhone 13 (390px) light + dark only');
});

test('empty data', async ({ page }, info) => {
  const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  const h = harness(page, theme, 'empty');
  await page.setViewportSize({ width: W, height: H });
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(APP);
  await expect(page.getByRole('button', { name: /Set up mine/ })).toBeVisible();
  await h.shot('onboarding-welcome');
  await h.step('restore', async () => {
    await page.getByRole('button', { name: /Restore a backup/ }).click();
    await h.shot('onboarding-restore');
    await page.getByRole('button', { name: 'Back to welcome' }).click();
  });
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await h.shot('onboarding-1-name');
  await page.getByRole('button', { name: 'Next' }).click();
  await h.shot('onboarding-2-balance');
  await h.step('balance-error', async () => {
    await page.getByLabel('Balance today').fill('abc'); // not a number → the error state
    await page.getByRole('button', { name: 'Next' }).click();
    await h.shot('onboarding-2-balance-error');
  });
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Next' }).click();
  await h.shot('onboarding-3-pay');
  await page.getByRole('button', { name: 'Next' }).click();
  await h.shot('onboarding-4-bills');
  await page.getByRole('button', { name: 'Skip setup' }).click();

  // Empty app: only a balance.
  await expect(page.locator('.big-number')).toBeVisible();
  await h.shot('today');
  await h.step('today-explain', async () => {
    await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
    await h.shot('today-explain');
    await closeSheet(page);
  });
  await h.step('today-focus', async () => {
    await page.getByRole('button', { name: 'Focus' }).click();
    await h.shot('today-focus');
    await page.getByRole('button', { name: 'Show everything' }).click();
  });
  await nav(page, 'Log').click();
  await h.shot('log');
  await h.step('log-add', async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await h.shot('log-add-sheet');
    await closeSheet(page);
  });
  await h.step('import-pick', async () => {
    await page.getByRole('button', { name: 'Import statement' }).click();
    await h.shot('import-pick');
    const junk = path.join(info.outputDir, 'not-a-statement.csv');
    fs.mkdirSync(info.outputDir, { recursive: true });
    fs.writeFileSync(junk, 'hello\nthis is not a bank statement\n');
    await page.locator('input[type=file]').setInputFiles(junk);
    await h.shot('import-bad-file');
    await nav(page, 'Today').click();
  });
  await nav(page, 'Bills').click();
  await h.shot('bills');
  await h.step('bills-calendar', async () => {
    await page.getByRole('radio', { name: 'Calendar' }).click();
    await h.shot('bills-calendar');
    await page.getByRole('radio', { name: 'List' }).click();
  });
  await h.step('bill-add', async () => {
    await page.getByRole('button', { name: /Add bill/ }).click();
    await h.shot('bill-add-sheet');
    await closeSheet(page);
  });
  await nav(page, 'Plan').click();
  for (const section of ['Envelopes', 'Goals', 'Debt', 'Insights']) {
    await h.step(`plan-${section}`, async () => {
      await page.getByRole('radio', { name: section }).click();
      await h.shot(`plan-${section.toLowerCase()}`);
    });
  }
  await h.step('goal-add', async () => {
    await page.getByRole('radio', { name: 'Goals' }).click();
    await page.getByRole('button', { name: /New goal/ }).click();
    await h.shot('plan-goal-add-sheet');
    await closeSheet(page);
  });
  await h.step('debt-add', async () => {
    await page.getByRole('radio', { name: 'Debt' }).click();
    await page.getByRole('button', { name: /Add a debt/ }).click();
    await h.shot('plan-debt-add-sheet');
    await closeSheet(page);
  });
  await h.step('envelope-add', async () => {
    await page.getByRole('radio', { name: 'Envelopes' }).click();
    await page.getByRole('button', { name: /New envelope/ }).click();
    await h.shot('plan-envelope-add-sheet');
    await closeSheet(page);
  });
  await morePages(page, h);
  h.save();
});

test('filled data', async ({ page }, info) => {
  const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  const h = harness(page, theme, 'filled');
  await page.setViewportSize({ width: W, height: H });
  await page.addInitScript(() => {
    // Desktop-style download instead of the share sheet, so the partner file can be opened here.
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  // Set up on Wed 30 Sep, then come back on Fri 16 Oct (a payday, after a gap).
  await page.clock.install({ time: new Date(2026, 8, 30, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('What should we call you? (optional)').fill('Sam');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('How much lands in your account?').fill('1500');
  await h.shot('onboarding-3-pay');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Rent or mortgage amount').fill('800');
  await page.getByLabel('Rent or mortgage day of month').fill('1');
  await page.getByLabel('Phone amount').fill('45');
  await page.getByLabel('Phone day of month').fill('15');
  await page.getByRole('button', { name: 'Add another bill' }).click();
  await page.getByLabel('Bill name').fill('Netflix');
  await page.getByLabel('Netflix amount').fill('15.49');
  await page.getByLabel('Netflix day of month').fill('20');
  await h.shot('onboarding-4-bills');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('.big-number')).toBeVisible();
  await h.shot('today-first-day');

  // Two weeks later.
  await page.clock.setSystemTime(new Date(2026, 9, 16, 10, 0));
  await page.reload();
  await expect(page.locator('.hero')).toBeVisible();
  await h.shot('today-away-and-payday');
  await h.step('catch-up', async () => {
    await page.getByRole('button', { name: 'They all happened' }).click();
    await h.shot('today-toast-undo');
  });
  await h.step('payday', async () => {
    await page.getByRole('button', { name: "Yes, it's in" }).click();
  });

  // A bank statement.
  await nav(page, 'Log').click();
  await h.step('import', async () => {
    await page.getByRole('button', { name: 'Import statement' }).click();
    await page.locator('input[type=file]').setInputFiles(path.resolve('test/fixtures/csv/chase-checking.csv'));
    await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
    await h.shot('import-map');
    await page.getByLabel('Remember these settings as').fill('Chase checking');
    await page.getByRole('button', { name: 'Continue' }).click();
    await h.shot('import-review');
    await page.getByRole('button', { name: /^Import \d+/ }).click();
    const sortHeading = page.getByRole('heading', { name: 'Check 1043' });
    const balance = page.getByRole('heading', { name: /balance is…\?|^Your bank says|^Your bank and the app agree/ });
    await expect(sortHeading.or(balance)).toBeVisible();
    if (await sortHeading.isVisible()) {
      await h.shot('import-sort');
      await page.getByRole('button', { name: /Home/ }).click();
    }
    await expect(balance).toBeVisible();
    await h.shot('import-balance-check');
    await page.getByRole('button', { name: /^(Skip|Leave it|Continue)$/ }).click();
    await h.shot('import-done');
    await page.getByRole('button', { name: 'Done' }).click();
  });

  // A few spends today, by typing and by chip.
  await nav(page, 'Today').click();
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  for (const t of ['4.50 coffee', '32.10 groceries', '12 lunch', '2.75 bus']) {
    await box.fill(t);
    await box.press('Enter');
    await expect(box).toHaveValue('');
  }
  await h.step('quicklog-preview', async () => {
    await box.fill('1.234 books');
    await h.shot('today-did-you-mean');
    await box.fill('');
  });

  // Envelopes, a goal, a debt.
  await nav(page, 'Plan').click();
  await page.getByRole('radio', { name: 'Envelopes' }).click();
  for (const [name, amount] of [['Groceries', '400'], ['Eating out', '150'], ['Coffee', '40'], ['Transport', '120']]) {
    await h.step(`limit-${name}`, async () => {
      await page.locator('.card-quiet .chip').filter({ hasText: name }).click();
      await page.getByLabel('Monthly amount (optional)').fill(amount);
      await page.getByRole('button', { name: 'Save' }).click();
    });
  }
  await h.step('goal', async () => {
    await page.getByRole('radio', { name: 'Goals' }).click();
    await page.getByRole('button', { name: /New goal/ }).click();
    await page.getByLabel('What are you saving for?').fill('Holiday');
    await page.getByLabel('Target').fill('1200');
    await page.getByLabel('Saved so far').fill('350');
    await page.getByRole('button', { name: 'Save' }).click();
  });
  await h.step('debt', async () => {
    await page.getByRole('radio', { name: 'Debt' }).click();
    for (const [name, bal, apr, min] of [['Store card', '850', '29.9', '25'], ['Car loan', '6200', '7.9', '210']]) {
      await page.getByRole('button', { name: /Add a debt/ }).click();
      await page.getByLabel('Name').fill(name);
      await page.getByLabel('Balance owed now').fill(bal);
      await page.getByLabel('Interest rate (APR %)').fill(apr);
      await page.getByLabel('Minimum payment each month').fill(min);
      await page.getByRole('button', { name: 'Save' }).click();
      await page.waitForTimeout(200);
    }
  });
  await h.step('note', async () => {
    await nav(page, 'More').click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.locator('textarea').fill('Car insurance renews in March — about 600.\nAsk landlord about the boiler.');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Back to More' }).click();
  });
  await h.step('partner', async () => {
    await page.getByRole('button', { name: /^Share with partner/ }).click();
    await page.getByLabel('Passphrase for this share').fill('our house 12');
    await page.getByLabel('Type it again').fill('our house 12');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Create share file' }).click();
    const file = path.join(info.outputDir, (await dl).suggestedFilename());
    await (await dl).saveAs(file);
    await h.shot('more-share-made');
    await page.locator('input[type=file][accept^=".wiai"]').setInputFiles(file);
    await page.getByLabel('Passphrase your partner gave you').fill('our house 12');
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(nav(page, 'Partner')).toBeVisible();
  });

  // The filled screens.
  await nav(page, 'Today').click();
  await h.shot('today');
  await h.step('today-explain', async () => {
    await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
    await h.shot('today-explain');
    await closeSheet(page);
  });
  await h.step('today-focus', async () => {
    await page.getByRole('button', { name: 'Focus' }).click();
    await h.shot('today-focus');
    await page.getByRole('button', { name: 'Show everything' }).click();
  });
  await nav(page, 'Log').click();
  await h.shot('log');
  await h.step('log-search', async () => {
    await page.getByRole('searchbox', { name: 'Search transactions' }).fill('zzz');
    await h.shot('log-search-no-results');
    await page.getByRole('searchbox', { name: 'Search transactions' }).fill('');
  });
  await h.step('log-edit', async () => {
    await page.locator('.log-day .row-button').first().click();
    await h.shot('log-edit-sheet');
    await closeSheet(page);
  });
  await nav(page, 'Bills').click();
  await h.shot('bills');
  await h.step('bills-calendar', async () => {
    await page.getByRole('radio', { name: 'Calendar' }).click();
    await h.shot('bills-calendar');
    await page.getByRole('radio', { name: 'List' }).click();
  });
  await h.step('bill-edit', async () => {
    await page.getByRole('button', { name: 'Edit Rent' }).click();
    await h.shot('bill-edit-sheet');
    await closeSheet(page);
  });
  await nav(page, 'Plan').click();
  for (const section of ['Envelopes', 'Goals', 'Debt', 'Insights']) {
    await h.step(`plan-${section}`, async () => {
      await page.getByRole('radio', { name: section }).click();
      await h.shot(`plan-${section.toLowerCase()}`);
    });
  }
  await h.step('move-money', async () => {
    await page.getByRole('radio', { name: 'Envelopes' }).click();
    await page.getByRole('button', { name: 'Move money' }).click();
    await h.shot('plan-move-money-sheet');
    await closeSheet(page);
  });
  await h.step('partner-tab', async () => {
    await nav(page, 'Partner').click();
    await h.shot('partner');
  });
  await h.step('tight', async () => {
    await nav(page, 'Today').click();
    const periodText = await page.locator('.hero-sub .money').textContent();
    const periodLeft = Number((periodText ?? '').replace(/[^0-9.-]/g, ''));
    expect(periodLeft).toBeGreaterThan(0);
    await nav(page, 'More').click();
    await page.getByRole('button', { name: /^Settings/ }).click();
    // Calm, realistic constrained examples: $40 left, then $85 short.
    await page.getByLabel('Cushion').fill(String(Math.max(0, periodLeft - 40)));
    await page.getByRole('button', { name: 'Back to More' }).click();
    await nav(page, 'Today').click();
    await expect(page.getByText('Tight until payday').first()).toBeVisible();
    await h.shot('today-tight');
    await nav(page, 'More').click();
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByLabel('Cushion').fill(String(periodLeft + 85));
    await page.getByRole('button', { name: 'Back to More' }).click();
    await nav(page, 'Today').click();
    await expect(page.getByText('Short until payday').first()).toBeVisible();
    await h.shot('today-short');
    await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
    await h.shot('today-short-explain');
    await closeSheet(page);
    await nav(page, 'More').click();
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByLabel('Cushion').fill('');
    await page.getByRole('button', { name: 'Back to More' }).click();
  });
  await morePages(page, h);
  h.save();
});

test('demo', async ({ page }, info) => {
  const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  const h = harness(page, theme, 'demo');
  await page.setViewportSize({ width: W, height: H });
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(DEMO);
  await expect(page.locator('.big-number')).toBeVisible();
  await h.shot('today');
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Backup & restore/ }).click();
  await h.shot('backup-off');
  h.save();
});
