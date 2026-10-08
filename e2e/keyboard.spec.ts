// Keyboard only: every main action can be reached with Tab and used with Enter / Space / Escape,
// focus is always visible, and dialogs hand focus back where it was.
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;

/** Press Tab until the focused element's accessible name matches (or give up). */
async function tabTo(page: Page, name: RegExp, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return '';
      const byId = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : '';
      return (el.getAttribute('aria-label') || byId || el.closest('label')?.textContent || el.textContent || '').replace(/\s+/g, ' ').trim();
    });
    if (name.test(label)) return label;
  }
  throw new Error(`Never reached ${name} with Tab`);
}
const focusedName = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.replace(/\s+/g, ' ').trim() ?? '');

async function examples(page: Page) {
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).waitFor(); // tab once the screen is there
  await tabTo(page, /^Try with example numbers$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.big-number')).toBeVisible();
}

test('setup by keyboard: Tab to "Set up mine", fill each step, Enter moves on', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: /^Set up mine/ }).waitFor();
  await tabTo(page, /^Set up mine/);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Balance today')).toBeFocused(); // step 1 puts the cursor in the field
  await page.keyboard.type('1200');
  await tabTo(page, /^Skip setup$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.big-number')).toBeVisible();
});

test('quick log by keyboard: type, Enter saves, and the cursor stays in the box', async ({ page }) => {
  await examples(page);
  await tabTo(page, /^Log a spend$/);
  await page.keyboard.type('3.20 coffee');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Logged $3.20');
  await expect(page.getByRole('textbox', { name: 'Log a spend' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Log a spend' })).toHaveValue('');
});

test('the main tabs work from the keyboard, and focus is visible', async ({ page }) => {
  await examples(page);
  await tabTo(page, /^Bills$/);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Bills', level: 1 })).toBeVisible();
  await tabTo(page, /^Plan$/);
  await page.keyboard.press(' ');
  await expect(page.getByRole('heading', { name: 'Plan', level: 1 })).toBeVisible();
});

test('a sheet opens with Enter, keeps focus off the page behind, closes with Escape and returns focus to its button', async ({ page }) => {
  await examples(page);
  await tabTo(page, /^How is this worked out\?$/);
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'How this is worked out' });
  await expect(sheet).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);
  // The page behind is inert: Tab cycles through the sheet (and the browser's own toolbar,
  // which shows up as <body>), never the screen underneath.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      return !el || el === document.body ? 'browser' : el.closest('dialog[open]') ? 'sheet' : 'page';
    });
    expect(where).not.toBe('page');
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(await focusedName(page)).toBe('How is this worked out?');
});

test('add to the Log by keyboard only: open the sheet, fill it with Tab, Enter saves', async ({ page }) => {
  await examples(page);
  await tabTo(page, /^Log$/);
  await page.keyboard.press('Enter');
  await tabTo(page, /^Add$/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Add to log' }).getByLabel('Amount')).toBeFocused();
  await page.keyboard.type('7.50');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Keyboard lunch');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Added');
  await expect(page.locator('.log-day .row').filter({ hasText: 'Keyboard lunch' })).toContainText('-$7.50');
});

test('a confirm dialog by keyboard: Escape cancels and nothing happens', async ({ page }) => {
  await examples(page);
  await tabTo(page, /^More$/);
  await page.keyboard.press('Enter');
  await tabTo(page, /^Your data/);
  await page.keyboard.press('Enter');
  await tabTo(page, /^Erase everything…$/);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await focusedName(page)).toBe('Erase everything…');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
  await expect(page.locator('.big-number')).toBeVisible(); // still there
});
