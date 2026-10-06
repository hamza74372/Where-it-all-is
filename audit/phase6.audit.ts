// Phase 6: demo banner and every help article — screenshots plus the layout checks, in all 4 projects.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPage, type Finding } from './checks';

const DEMO = pathToFileURL(path.resolve('dist/demo.html')).href;
const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });
const HELP = ['Set up in 4 steps', 'Safe to spend, explained', 'Logging in 3 seconds', 'Importing your bank CSV', 'Bills & paydays', 'Debt payoff', 'Sharing with a partner', 'Backups'];

test('demo banner and help articles', async ({ page }, info) => {
  const dir = path.resolve('screenshots/phase6', info.project.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(2026, 9, 6, 14, 30) });

  const findings: Array<{ step: string; f: Finding }> = [];
  const check = async (step: string, full = false) => {
    await page.waitForTimeout(250);
    if (full) {
      // Grow the window to the content so the whole article is in one picture.
      const h = await page.evaluate(() => document.getElementById('main')!.scrollHeight + 200);
      await page.setViewportSize({ width: page.viewportSize()!.width, height: Math.max(h, 844) });
    }
    await page.evaluate(() => document.getElementById('main')?.scrollTo(0, 0));
    await page.screenshot({ path: path.join(dir, `${step}.png`) });
    findings.push({ step, f: await page.evaluate(auditPage) });
  };

  // Demo: seeded with example numbers, banner on top.
  await page.goto(DEMO);
  const banner = page.getByRole('note').filter({ hasText: 'Demo — data resets' });
  await expect(banner).toBeVisible();
  await expect(page.locator('.big-number')).toBeVisible();
  await check('demo-today');
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Backup & restore/ }).click();
  await check('demo-backup-off');

  // Help, in the full app.
  const size = page.viewportSize()!;
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Help/ }).click();
  await expect(page.getByRole('list', { name: 'Help articles' }).getByRole('button')).toHaveCount(8);
  await check('help-list');
  for (const [i, title] of HELP.entries()) {
    await page.getByRole('button', { name: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await check(`help-${i + 1}`, true);
    await page.setViewportSize(size);
    await page.getByRole('button', { name: '‹ All help' }).click();
  }

  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ findings, errors }, null, 2));
  const problems = findings.flatMap(({ step, f }) => [
    ...f.smallText.map((x) => `${step}: small text ${x.px}px "${x.text}"`),
    ...f.smallTargets.map((x) => `${step}: small target ${x.w}x${x.h} "${x.label}"`),
    ...f.clipped.map((x) => `${step}: clipped "${x.text}" (${x.why})`),
    ...f.overlaps.map((x) => `${step}: overlap "${x.a}" × "${x.b}"`),
    ...f.lowContrast.map((x) => `${step}: contrast ${x.ratio} "${x.text}"`),
    ...(f.horizontalScroll ? [`${step}: horizontal scroll`] : []),
  ]);
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});
