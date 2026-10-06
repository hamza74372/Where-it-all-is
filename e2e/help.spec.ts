// More → Help: all 8 articles open, and the setup article names the download file from the config.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cfg = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
const APP = pathToFileURL(path.resolve('dist/app.html')).href;

test('help articles open, with the right file name and Home Screen wording', async ({ page }) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: /^Help/ }).click();
  const list = page.getByRole('list', { name: 'Help articles' });
  await expect(list.getByRole('button')).toHaveCount(8);

  await list.getByRole('button', { name: /^Set up in 4 steps/ }).click();
  const article = page.getByRole('article');
  await expect(article).toContainText(cfg.downloadFileName);
  expect(cfg.downloadFileName).toBe('Where-It-All-Is-Budget-App.html');
  await expect(article).toContainText('Install app (or Add to Home screen)');
  await expect(article).toContainText('Add to Dock (macOS 14 or later)');
  await expect(article).toContainText('7 days');
  await page.getByRole('button', { name: '‹ All help' }).click();

  await list.getByRole('button', { name: /^Safe to spend, explained/ }).click();
  await expect(page.getByRole('heading', { name: 'Safe to spend, explained' })).toBeVisible();
});
