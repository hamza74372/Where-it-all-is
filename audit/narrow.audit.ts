// 320px-wide audit (iPhone SE 1st gen / small Android) with the 6th "Partner" tab showing.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPage, type Finding } from './checks';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

test('320px wide, Partner tab showing', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit-iphone13-light', 'one project is enough');
  const dir = path.resolve('screenshots/phase5b-320');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.clock.install({ time: new Date(2026, 9, 6, 14, 30) });
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();

  // Make a partner share and open it here, so the 6th tab appears.
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Share with partner/ }).click();
  await page.getByLabel('Passphrase for this share').fill('our house 12');
  await page.getByLabel('Type it again').fill('our house 12');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Create share file' }).click();
  const shareFile = path.join(info.outputDir, (await dl).suggestedFilename());
  await (await dl).saveAs(shareFile);
  await page.locator('input[type=file][accept^=".wiai"]').setInputFiles(shareFile);
  await page.getByLabel('Passphrase your partner gave you').fill('our house 12');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(nav(page, 'Partner')).toBeVisible();

  const findings: Array<{ step: string; f: Finding }> = [];
  const check = async (step: string) => {
    await page.waitForTimeout(250);
    await page.evaluate(() => document.getElementById('main')?.scrollTo(0, 0));
    await page.screenshot({ path: path.join(dir, `${step}.png`) });
    findings.push({ step, f: await page.evaluate(auditPage) });
  };

  for (const tab of ['Today', 'Log', 'Bills', 'Partner'] as const) {
    await nav(page, tab).click();
    await check(tab.toLowerCase());
  }
  await nav(page, 'Bills').click();
  await page.getByRole('radio', { name: 'Calendar' }).click();
  await check('bills-calendar');
  await nav(page, 'Plan').click();
  for (const section of ['Envelopes', 'Goals', 'Debt', 'Insights']) {
    await page.getByRole('radio', { name: section }).click();
    await check(`plan-${section.toLowerCase()}`);
  }
  await nav(page, 'More').click();
  await check('more');
  for (const [label, file] of [['Backup & restore', 'more-backup'], ['Share with partner', 'more-share'], ['Settings', 'more-settings']] as const) {
    await page.getByRole('button', { name: new RegExp(`^${label.replace('&', '\\&')}`) }).click();
    await check(file);
    await page.getByRole('button', { name: '‹ More' }).click();
  }
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await check('import');

  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(findings, null, 2));
  const problems = findings.flatMap(({ step, f }) => [
    ...f.smallText.map((x) => `${step}: small text ${x.px}px "${x.text}"`),
    ...f.smallTargets.map((x) => `${step}: small target ${x.w}x${x.h} "${x.label}"`),
    ...f.clipped.map((x) => `${step}: clipped "${x.text}" (${x.why})`),
    ...f.overlaps.map((x) => `${step}: overlap "${x.a}" × "${x.b}"`),
    ...f.lowContrast.map((x) => `${step}: contrast ${x.ratio} "${x.text}"`),
    ...(f.horizontalScroll ? [`${step}: horizontal scroll`] : []),
  ]);
  expect(problems).toEqual([]);
});
