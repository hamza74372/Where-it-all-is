// UX pass: setup in under 2 minutes (dots, examples, "why we ask"), balance freshness, the
// return flow, quick log in 3 taps, the checked backup, currency, and the import preview line.
import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });
const more = async (page: Page, item: string) => {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: new RegExp(`^${item}`) }).click();
};

function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && problems.push(`network: ${r.url()}`));
  return problems;
}

async function noShareSheet(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
}

async function start(page: Page, when = new Date(2026, 9, 6, 10, 0)) {
  await page.clock.install({ time: when });
  await page.goto(APP);
}

/** Balance only, then straight to Today. */
async function balanceOnly(page: Page, amount = '1200') {
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('Balance today').fill(amount);
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page.locator('.big-number')).toBeVisible();
}

/** Balance, pay (every 2nd Friday from 9 Oct) and rent on the 1st. */
async function fullSetup(page: Page) {
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

test('setup: four dots, an example in each field, a "why we ask" line, done in under 2 minutes of steps', async ({ page }) => {
  const problems = guard(page);
  await start(page);
  // A simple time model of a person doing it: reading a step, tapping, typing a field.
  const SECONDS = { read: 8, tap: 2, field: 7 };
  let seconds = 0;
  const tap = async (l: Locator) => {
    seconds += SECONDS.tap;
    await l.click();
  };
  const field = async (l: Locator, value: string) => {
    seconds += SECONDS.field;
    await l.fill(value);
  };
  const step = async (n: number, label: string) => {
    seconds += SECONDS.read;
    const dots = page.getByRole('list', { name: `Setup step ${n} of 4: ${label}` });
    await expect(dots).toBeVisible();
    await expect(dots.locator('li')).toHaveText(['Balance', 'Payday', 'Bills', 'Your number']);
    await expect(dots.locator('li[aria-current="step"]')).toHaveText(label);
    await expect(dots.locator('li.is-active')).toHaveCount(n);
    await expect(page.locator('.why-we-ask')).toHaveCount(1);
    await expect(page.locator('.why-we-ask')).toBeVisible();
  };

  await tap(page.getByRole('button', { name: /Set up mine/ }));
  await step(1, 'Balance');
  await expect(page.locator('.why-we-ask')).toContainText('Why we ask');
  await expect(page.getByLabel('Balance today')).toHaveAttribute('placeholder', 'e.g. 1,250.00');
  await expect(page.getByLabel('What should we call you? (optional)')).toHaveAttribute('placeholder', 'e.g. Sam');
  await field(page.getByLabel('Balance today'), '1200');
  await tap(page.getByRole('button', { name: 'Next' }));

  await step(2, 'Payday');
  await expect(page.locator('.why-we-ask')).toContainText('Why we ask');
  await expect(page.getByLabel('How much lands in your account?')).toHaveAttribute('placeholder', 'e.g. 1,800.00');
  await field(page.getByLabel('How much lands in your account?'), '1500');
  await tap(page.getByRole('button', { name: 'Next' }));

  await step(3, 'Bills');
  await expect(page.locator('.why-we-ask')).toContainText('Why we ask');
  // Only bills due before the next payday (Fri 9 Oct) are needed now.
  await expect(page.getByText(/Only bills due before your next payday \(.*\) are needed now/)).toBeVisible();
  await expect(page.getByLabel('Rent or mortgage amount')).toHaveAttribute('placeholder', 'e.g. 45.00');
  await expect(page.getByLabel('Rent or mortgage day of month')).toHaveAttribute('placeholder', 'e.g. 1');
  await field(page.getByLabel('Rent or mortgage amount'), '800');
  await field(page.getByLabel('Rent or mortgage day of month'), '1');
  await expect(page.getByText('Due after payday — this one can wait.')).toBeVisible(); // rent on the 1st is after the 9th
  await field(page.getByLabel('Phone amount'), '45');
  await field(page.getByLabel('Phone day of month'), '8');
  await tap(page.getByRole('button', { name: 'Next' }));

  await step(4, 'Your number');
  const preview = await page.locator('.setup-number .big-number').textContent();
  await tap(page.getByRole('button', { name: 'Finish' }));
  await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0); // saved
  await expect(page.locator('.big-number')).toHaveText(preview!);

  expect(seconds).toBeLessThan(120);
  test.info().annotations.push({ type: 'setup time model', description: `${seconds}s` });
  expect(problems).toEqual([]);
});

test('freshness: "Updated today", then "N days ago", then "About $X" with a one-tap Update balance', async ({ page }) => {
  const problems = guard(page);
  await start(page);
  await balanceOnly(page);
  const hero = page.locator('.hero');
  await expect(hero.locator('.hero-fresh')).toHaveText('Updated today');
  await expect(hero.locator('.hero-about')).toHaveCount(0);
  await expect(hero.getByRole('button', { name: 'Update balance' })).toHaveCount(0);

  await page.clock.setSystemTime(new Date(2026, 9, 8, 10, 0));
  await page.reload();
  await expect(hero.locator('.hero-fresh')).toHaveText('Balance last checked 2 days ago');
  await expect(hero.locator('.hero-about')).toHaveCount(0);

  await page.clock.setSystemTime(new Date(2026, 9, 9, 10, 0));
  await page.reload();
  await expect(hero.locator('.hero-fresh')).toHaveText('Balance last checked 3 days ago');
  await expect(hero.locator('.hero-about')).toHaveText('About');
  const number = (await hero.locator('.big-number').textContent())!;
  expect(number).toMatch(/^\$[\d,]+$/); // the same number, only the wording around it changes

  await hero.getByRole('button', { name: 'Update balance' }).click();
  const sheet = page.getByRole('dialog', { name: "What's your balance today?" });
  await sheet.getByLabel('Your balance today').fill('1100');
  await sheet.getByRole('button', { name: 'Save balance' }).click();
  await expect(hero.locator('.hero-fresh')).toHaveText('Updated today');
  await expect(hero.locator('.hero-about')).toHaveCount(0);
  await expect(page.getByText('Balance updated')).toBeVisible();
  expect(problems).toEqual([]);
});

test('return flow: balance today, confirm what passed, the new number, then an optional import', async ({ page }, info) => {
  const problems = guard(page);
  await start(page);
  await fullSetup(page);

  // Back 12 days later: payday 9 Oct passed.
  await page.clock.setSystemTime(new Date(2026, 9, 18, 9, 0));
  await page.reload();
  const card = page.getByRole('region', { name: 'While you were away' });
  await expect(card.locator('p').first()).toHaveText("Welcome back. What's your balance today?");
  await card.getByLabel('Your balance today').fill('2400');
  await card.getByRole('button', { name: 'Save balance' }).click();

  await expect(card).toContainText('Balance saved for today.');
  await expect(card).toContainText('Confirm what happened.');
  await card.getByRole('button', { name: 'It arrived' }).click();

  await expect(card.locator('.away-number')).toContainText(/Safe to spend today: \$/);
  await expect(card).toContainText("It's optional.");
  await expect(page.locator('.hero-fresh')).toHaveText('Updated today');
  for (const word of ['behind', 'missed']) await expect(page.locator('main')).not.toContainText(new RegExp(`\\b${word}\\b`, 'i'));

  await card.getByRole('button', { name: 'Import a statement' }).click();
  await expect(page.getByRole('heading', { name: 'Import a statement' })).toBeVisible();
  const file = path.join(info.outputDir, 'statement.csv');
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(file, 'Date,Description,Amount\n10/12/2026,CORNER SHOP,-8.40\n10/14/2026,BUS FARE,-2.75\n');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await expect(page.getByText('Nothing changes until you confirm.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await expect(page.getByText('Nothing changes until you confirm.')).toBeVisible();
  expect(problems).toEqual([]);
});

test('quick log: a chip saves in 1 tap, the box in 2, with a suggested (optional) category and Undo', async ({ page }) => {
  const problems = guard(page);
  await start(page);
  await balanceOnly(page);
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  const undo = page.getByRole('button', { name: 'Undo' });
  const number = page.locator('.big-number');
  const start0 = await number.textContent();

  // Chip: one tap.
  let taps = 0;
  await page.getByRole('group', { name: 'One-tap spends' }).getByRole('button').first().click();
  taps++;
  await expect(page.getByText(/^Logged \$/)).toBeVisible();
  expect(taps).toBeLessThanOrEqual(3);
  await undo.click();
  await expect(number).toHaveText(start0!);

  // Box: tap the box, type, tap Save.
  taps = 0;
  await box.click();
  taps++;
  await box.pressSequentially('4.50 coffee');
  await expect(page.locator('#ql-preview')).toHaveText(/\$4\.50 · (?!No category)/); // a category from the merchant text
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  taps++;
  expect(taps).toBeLessThanOrEqual(3);
  await expect(page.getByText(/^Logged \$4\.50 · /)).toBeVisible();
  await expect(box).toHaveValue('');

  // No match: logs with no category, and says that's fine.
  await box.fill('3 zzqx');
  await expect(page.locator('#ql-preview')).toHaveText('$3.00 · No category (that’s fine — it’s optional)');
  await box.press('Enter');
  await expect(page.getByText('Logged $3.00', { exact: true })).toBeVisible();
  await undo.click();
  await nav(page, 'Log').click();
  await expect(page.getByText('Zzqx')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('backup: first-backup prompt after setup, "Backup checked" after saving, the date on Your data', async ({ page }) => {
  const problems = guard(page);
  await noShareSheet(page);
  await start(page);
  await fullSetup(page);

  const prompt = page.getByRole('region', { name: 'Make your first backup' });
  await expect(prompt).toContainText('Your information stays on this device. Clearing browser data deletes it, so back up occasionally.');
  await prompt.getByRole('button', { name: 'Back up now' }).click();

  await expect(page.getByText('Your information stays on this device. Clearing browser data deletes it, so back up occasionally.')).toBeVisible();
  await page.getByRole('switch', { name: 'Lock it with a passphrase' }).click();
  await page.getByLabel('Passphrase', { exact: true }).fill('tulip sky 42');
  await page.getByLabel('Type it again').fill('tulip sky 42');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up now' }).click();
  await download;
  await expect(page.locator('.backup-checked')).toContainText('Backup checked — where-it-all-is-backup-2026-10-06');
  await expect(page.locator('.backup-checked')).toContainText('opens correctly with your passphrase.');

  await nav(page, 'Today').click();
  await more(page, 'Your data');
  const backups = page.getByRole('region', { name: 'Backups' });
  await expect(backups.locator('p').first()).toHaveText(/^Last backup: (Tue, )?(Oct 6|6 Oct) \(today\)$/);
  await expect(page.getByText('Your information stays on this device. Clearing browser data deletes it, so back up occasionally.')).toBeVisible();

  // Today no longer asks for a first backup.
  await nav(page, 'Today').click();
  await expect(page.getByRole('region', { name: 'Make your first backup' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test.describe('currency from the device locale', () => {
  test.use({ locale: 'en-GB' });

  test('a UK device starts in pounds; switching currency in More changes the symbol, not the amounts', async ({ page }) => {
    const problems = guard(page);
    await start(page);
    await page.getByRole('button', { name: /Set up mine/ }).click();
    await expect(page.getByLabel('Currency')).toHaveValue('GBP');
    await page.getByLabel('Balance today').fill('1200');
    await page.getByRole('button', { name: 'Skip setup' }).click();
    const number = page.locator('.big-number');
    await expect(number).toHaveText(/^£[\d,]+$/);
    const digits = (await number.textContent())!.replace(/\D/g, '');

    await more(page, 'Settings');
    const options = await page.getByLabel('Currency').locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(options).toEqual(expect.arrayContaining(['USD', 'GBP', 'EUR', 'CAD', 'AUD']));
    await page.getByLabel('Currency').selectOption('EUR');
    await nav(page, 'Today').click();
    await expect(number).toHaveText(/^€[\d,]+$/);
    expect((await number.textContent())!.replace(/\D/g, '')).toBe(digits);
    expect(problems).toEqual([]);
  });
});

test('the breakdown sheet opened from the hero uses normal text colours (not the pale hero ones)', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
  const note = page.locator('.sheet-body .muted').first();
  await expect(note).toBeVisible();
  const [text, bg] = await note.evaluate((el) => {
    const panel = el.closest('.sheet-panel')!;
    return [getComputedStyle(el).color, getComputedStyle(panel).backgroundColor];
  });
  const muted = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim());
  const rgb = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number);
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  expect(rgb(text)).toEqual(hex(muted));
  expect(rgb(text)).not.toEqual(rgb(bg));
});
