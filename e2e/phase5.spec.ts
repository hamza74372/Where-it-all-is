import { expect, test, type Browser, type Page } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && problems.push(`network: ${r.url()}`));
  return problems;
}

/** No share sheet: files go through an ordinary download (what desktop browsers do). */
async function noShareSheet(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
}

async function start(page: Page, when = new Date(2026, 9, 6, 14, 30)) {
  await page.clock.install({ time: when });
  await page.goto(APP);
}

async function quickSetup(page: Page) {
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('What should we call you? (optional)').fill('Sam');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('1200');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('How much lands in your account?').fill('1500');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Rent or mortgage amount').fill('800');
  await page.getByLabel('Rent or mortgage day of month').fill('8');
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('textbox', { name: 'Log a spend' }).fill('23.40 groceries');
  await page.getByRole('textbox', { name: 'Log a spend' }).press('Enter');
  await expect(page.getByRole('status')).toContainText('Logged $23.40'); // let the number update first
}

async function openBackupPage(page: Page) {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Backup & restore/ }).click();
}

async function backUp(page: Page, passphrase?: string): Promise<string> {
  await openBackupPage(page);
  if (passphrase) {
    await page.getByRole('switch', { name: 'Lock it with a passphrase' }).click();
    await expect(page.getByText('If you forget this passphrase, this backup can’t be opened.')).toBeVisible();
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByLabel('Type it again').fill(passphrase);
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up now' }).click();
  const d = await download;
  const file = path.join(test.info().outputDir, d.suggestedFilename());
  await d.saveAs(file);
  await expect(page.getByRole('heading', { name: 'Last backup: today' })).toBeVisible();
  return file;
}

async function wipeAndReload(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.deleteDatabase('where-it-all-is');
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      }),
  );
  await page.reload();
}

test('back up, clear all data, restore — the same safe-to-spend', async ({ page }) => {
  const problems = guard(page);
  await noShareSheet(page);
  await start(page);
  await quickSetup(page);
  const before = await page.locator('.big-number').textContent();
  expect(before).toBe('$109'); // (1,176.60 + 23.40 − 800 rent) ÷ 3 days − 23.40 spent today
  const file = await backUp(page);
  expect(path.basename(file)).toBe('where-it-all-is-backup-2026-10-06.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json).toMatchObject({ format: 'wiai-backup', schemaVersion: 3 });
  expect(json.checksum).toMatch(/^sha256:/);

  await wipeAndReload(page);
  await expect(page.getByRole('button', { name: /Set up mine/ })).toBeVisible(); // everything gone
  await page.getByRole('button', { name: 'Moving from another device? Restore a backup' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText(/This backup has 1 transaction from/)).toBeVisible();
  await page.getByRole('button', { name: /Replace my data/ }).click();
  await expect(page.locator('.big-number')).toHaveText(before!);
  await expect(page.getByRole('heading', { name: 'Hi Sam' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('a locked backup: the warning, a wrong passphrase fails cleanly, the right one opens; merge can be undone', async ({ page }) => {
  const problems = guard(page);
  await noShareSheet(page);
  await start(page);
  await quickSetup(page);
  const file = await backUp(page, 'blue tulip seven');
  expect(path.basename(file)).toBe('where-it-all-is-backup-2026-10-06-locked.json');
  expect(fs.readFileSync(file, 'utf8')).not.toContain('Groceries');

  await page.locator('input[type=file]').setInputFiles(file);
  const restore = page.getByRole('region', { name: 'Restore from a backup' });
  await restore.getByLabel('Passphrase').fill('wrong guess');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText('That passphrase doesn’t open this file');
  await restore.getByLabel('Passphrase').fill('blue tulip seven');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('was locked with a passphrase')).toBeVisible();

  await page.getByRole('button', { name: /Merge with my data/ }).click();
  await expect(page.getByRole('status')).toContainText('Merged: 0 added, 0 updated, 0 removed');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status')).toContainText('Undone');
  expect(problems).toEqual([]);
});

test('a backup from a newer version is refused with a clear message', async ({ page }) => {
  await noShareSheet(page);
  await start(page);
  await quickSetup(page);
  await openBackupPage(page);
  const stores = { settings: [], accounts: [] };
  const newer = {
    format: 'wiai-backup', schemaVersion: 99, appVersion: '9.0.0', exportedAt: '2027-01-01T00:00:00.000Z',
    checksum: 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(stores)).digest('hex'), stores,
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
  await expect(page.getByRole('alert')).toContainText('made by a newer version of the app');
});

test('on a phone, Back up now uses the share sheet (Save to Files, AirDrop…)', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { shared: string[] }).shared = [];
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (d: ShareData) => void (window as unknown as { shared: string[] }).shared.push(d.files![0].name),
      configurable: true,
    });
  });
  await start(page);
  await quickSetup(page);
  await openBackupPage(page);
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByRole('heading', { name: 'Last backup: today' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { shared: string[] }).shared)).toEqual(['where-it-all-is-backup-2026-10-06.json']);
});

test('backup reminder after 7 days (gentle, dismissible) and the one-time storage note', async ({ page }) => {
  await noShareSheet(page);
  await start(page);
  await quickSetup(page);
  await expect(page.getByRole('heading', { name: 'Keep your budget safe' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('heading', { name: 'Time for a quick backup?' })).toHaveCount(0); // too soon
  await page.clock.setSystemTime(new Date(2026, 9, 15, 9, 0)); // 9 days later
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Keep your budget safe' })).toHaveCount(0); // one-time
  const reminder = page.getByRole('region', { name: 'Time for a quick backup?' });
  await expect(reminder).toContainText('No backup yet');
  await reminder.getByRole('button', { name: 'Not now' }).click();
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Time for a quick backup?' })).toHaveCount(0); // stays dismissed
});

async function makePartnerShareFile(browser: Browser): Promise<string> {
  const ctx = await browser.newContext({ ...test.info().project.use });
  const page = await ctx.newPage();
  await noShareSheet(page);
  await start(page);
  await quickSetup(page);
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Share with partner/ }).click();
  await expect(page.getByRole('switch', { name: 'Include recent transactions' })).toHaveAttribute('aria-checked', 'false');
  await page.getByLabel('Passphrase for this share').fill('our house 12');
  await page.getByLabel('Type it again').fill('our house 12');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Create share file' }).click();
  const d = await download;
  const file = path.join(test.info().outputDir, d.suggestedFilename());
  await d.saveAs(file);
  await expect(page.getByRole('button', { name: 'Show as a QR code' })).toBeVisible(); // small share → QR offered
  await ctx.close();
  return file;
}

test('partner share: opens as a separate read-only tab, never mixes with your data, removable in one tap', async ({ page, browser }) => {
  const shareFile = await makePartnerShareFile(browser);
  expect(path.extname(shareFile)).toBe('.wiai');
  expect(fs.readFileSync(shareFile, 'utf8')).not.toContain('Rent');

  // The partner's own device: their own (different) budget.
  const problems = guard(page);
  await noShareSheet(page);
  await start(page, new Date(2026, 9, 6, 18, 0));
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Balance today').fill('500');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  const ownNumber = await page.locator('.big-number').textContent();
  await expect(nav(page, 'Partner')).toHaveCount(0);

  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Share with partner/ }).click();
  await page.locator('input[type=file]').setInputFiles(shareFile);
  await page.getByLabel('Passphrase your partner gave you').fill('not it');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('alert')).toContainText('That passphrase doesn’t open this file');
  await page.getByLabel('Passphrase your partner gave you').fill('our house 12');
  await page.getByRole('button', { name: 'Open' }).click();

  const view = page.locator('.partner-view');
  await expect(page.getByRole('heading', { name: 'Sam’s budget' })).toBeVisible();
  await expect(view).toContainText('Read only');
  await expect(view).toContainText('As of Tue, Oct 6, 2:30 PM');
  await expect(view).toContainText('Rent');
  // Read-only: no inputs, and the only button is "Remove partner view".
  await expect(view.locator('input, textarea, select')).toHaveCount(0);
  await expect(view.getByRole('button')).toHaveText(['Remove partner view']);
  // Never mixes: the partner's own number and log are unchanged.
  await nav(page, 'Today').click();
  await expect(page.locator('.big-number')).toHaveText(ownNumber!);
  await nav(page, 'Log').click();
  await expect(page.locator('.log-day').getByText('Groceries')).toHaveCount(0);

  // A few days later it says how old it is.
  await page.clock.setSystemTime(new Date(2026, 9, 11, 9, 0));
  await page.reload();
  await nav(page, 'Partner').click();
  await expect(page.locator('.partner-view')).toContainText('This is 4 days old');

  // One tap removes it (with undo).
  await page.getByRole('button', { name: 'Remove partner view' }).click();
  await expect(nav(page, 'Partner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(nav(page, 'Partner')).toBeVisible();
  expect(problems).toEqual([]);
});

test('restoring a backup in another currency warns and offers to switch', async ({ page }) => {
  await noShareSheet(page);
  await start(page);
  await quickSetup(page); // this device: USD
  const setCurrency = async (code: string) => {
    await nav(page, 'Today').click(); // More reopens on its menu
    await nav(page, 'More').click();
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByLabel('Currency').selectOption(code);
    await nav(page, 'Today').click();
  };
  // A backup from a GBP device: switch to GBP, back up, switch back.
  await setCurrency('GBP');
  const file = await backUp(page);
  await setCurrency('USD');
  await openBackupPage(page);

  await page.locator('input[type=file][accept^=".json"]').setInputFiles(file);
  await page.getByRole('button', { name: /Merge with my data/ }).click();
  const guard = page.getByRole('group', { name: /This backup is in £/ });
  await expect(guard).toContainText('This device is set to $');
  await guard.getByRole('button', { name: 'Cancel' }).click();
  await expect(guard).toHaveCount(0);
  await page.getByRole('button', { name: /Merge with my data/ }).click();
  await page.getByRole('button', { name: 'Switch to £' }).click();
  await expect(page.getByRole('status')).toContainText('Merged');
  await nav(page, 'Today').click();
  await expect(page.locator('.big-number')).toContainText('£');
  // Undo puts the currency back too.
  await nav(page, 'More').click();
  await nav(page, 'Today').click();
});

test('partner view says which day the number is for once the snapshot isn’t from today', async ({ page, browser }) => {
  const shareFile = await makePartnerShareFile(browser); // made Tue 6 Oct
  await noShareSheet(page);
  await start(page, new Date(2026, 9, 6, 18, 0));
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Share with partner/ }).click();
  await expect(page.getByText('Tell your partner the passphrase separately, not in the same message as the file.')).toBeVisible();
  await page.locator('input[type=file][accept^=".wiai"]').setInputFiles(shareFile);
  await page.getByLabel('Passphrase your partner gave you').fill('our house 12');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.partner-view .hero-label')).toHaveText('Safe to spend today');
  await page.clock.setSystemTime(new Date(2026, 9, 7, 9, 0)); // next morning
  await page.reload();
  await nav(page, 'Partner').click();
  await expect(page.locator('.partner-view .hero-label')).toHaveText('Safe to spend on Tue, Oct 6');
});

test('passphrases need at least 8 characters', async ({ page }) => {
  await noShareSheet(page);
  await start(page);
  await quickSetup(page);
  await openBackupPage(page);
  await page.getByRole('switch', { name: 'Lock it with a passphrase' }).click();
  await page.getByLabel('Passphrase', { exact: true }).fill('seven77');
  await page.getByLabel('Type it again').fill('seven77');
  await expect(page.getByText('Use at least 8 characters')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back up now' })).toBeDisabled();
  await page.getByLabel('Passphrase', { exact: true }).fill('eight888');
  await page.getByLabel('Type it again').fill('eight888');
  await expect(page.getByRole('button', { name: 'Back up now' })).toBeEnabled();
});
