// Phase 5 screenshots (iPhone 13 / WebKit / light) + layout & accessibility checks on each screen.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPage, type Finding } from './checks';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

test('phase 5 screens', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit-iphone13-light', 'screenshots are for iPhone / WebKit / light');
  const dir = path.resolve('screenshots/phase5');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const findings: Array<{ step: string; f: Finding }> = [];
  const shot = async (name: string, focus?: string) => {
    await page.waitForTimeout(200);
    if (focus) await page.locator(focus).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
    else await page.evaluate(() => document.getElementById('main')?.scrollTo(0, 0));
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
    findings.push({ step: name, f: await page.evaluate(auditPage) });
  };
  // Downloads instead of the share sheet, so the test can pick the files back up.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.clock.install({ time: new Date(2026, 9, 6, 14, 30) });
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByLabel('Your name').fill('Sam');
  await page.getByRole('button', { name: 'Back to More' }).click();

  // 1. Backup screen (with the passphrase option open, showing the warning).
  await page.getByRole('button', { name: /^Backup & restore/ }).click();
  await page.getByRole('switch', { name: 'Lock it with a passphrase' }).click();
  await page.getByLabel('Passphrase', { exact: true }).fill('blue tulip seven');
  await page.getByLabel('Type it again').fill('blue tulip seven');
  await shot('01-backup');
  await shot('01-backup-scrolled', '#bk-now');
  await page.getByRole('switch', { name: 'Lock it with a passphrase' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up now' }).click();
  const backupFile = path.join(info.outputDir, (await dl).suggestedFilename());
  await (await dl).saveAs(backupFile);
  await expect(page.getByRole('heading', { name: 'Last backup: today' })).toBeVisible();

  // 2–3. Restore preview, then the replace / merge choice.
  await page.locator('input[type=file][accept^=".json"]').setInputFiles(backupFile);
  await expect(page.getByText(/This backup has \d+ transactions/)).toBeVisible();
  await shot('02-restore-preview', '#restore-title');
  await shot('03-replace-or-merge', '.choice-grid');
  await page.getByRole('button', { name: 'Cancel' }).click();

  // 4. Share with partner (made, with the QR option open).
  await page.getByRole('button', { name: 'Back to More' }).click();
  await page.getByRole('button', { name: /^Share with partner/ }).click();
  await page.getByLabel('Passphrase for this share').fill('our house 12');
  await page.getByLabel('Type it again').fill('our house 12');
  await shot('04-share-with-partner');
  const dl2 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Create share file' }).click();
  const shareFile = path.join(info.outputDir, (await dl2).suggestedFilename());
  await (await dl2).saveAs(shareFile);
  const qrButton = page.getByRole('button', { name: 'Show as a QR code' });
  if (await qrButton.isVisible().catch(() => false)) {
    await qrButton.click();
    await shot('04b-share-qr', '.qr-svg');
  } else {
    await shot('04b-share-made', '.share-made');
  }

  // 5. Partner tab (opening the share on this device, as the partner would on theirs).
  await page.locator('input[type=file][accept^=".wiai"]').setInputFiles(shareFile);
  await page.getByLabel('Passphrase your partner gave you').fill('our house 12');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'Sam’s budget' })).toBeVisible();
  await shot('05-partner-tab');
  await shot('05-partner-tab-scrolled', '#pv-env');

  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(findings, null, 2));
  for (const { step, f } of findings) {
    expect({ step, smallText: f.smallText, smallTargets: f.smallTargets, lowContrast: f.lowContrast, clipped: f.clipped, overlaps: f.overlaps, hScroll: f.horizontalScroll })
      .toEqual({ step, smallText: [], smallTargets: [], lowContrast: [], clipped: [], overlaps: [], hScroll: false });
  }
});
