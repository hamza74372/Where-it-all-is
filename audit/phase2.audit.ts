// Realistic Phase 2 walkthrough with a layout/accessibility audit at every step.
// Screenshots + report.json go to screenshots/phase2/<project>/.

import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPage, type Finding } from './checks';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;

test('phase 2 walkthrough + audit', async ({ page }, info) => {
  const project = info.project.name;
  const dir = path.resolve('screenshots/phase2', project);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const consoleErrors: string[] = [];
  const network: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && consoleErrors.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(file|data|blob):/.test(u)) network.push(u);
  });

  const counts = { setupTaps: 0, setupFields: 0, taps: 0, fields: 0 };
  let inSetup = true;
  const tap = async (l: Locator) => {
    await l.tap();
    counts.taps++;
    if (inSetup) counts.setupTaps++;
  };
  const type = async (l: Locator, text: string) => {
    await l.fill(text);
    counts.fields++;
    if (inSetup) counts.setupFields++;
  };
  const key = async (l: Locator, k: string) => {
    await l.press(k);
    counts.taps++;
  };

  const steps: Array<{ step: string; findings: Finding }> = [];
  let n = 0;
  const snap = async (step: string) => {
    await page.waitForTimeout(250); // let toasts/animations settle
    const file = `${String(++n).padStart(2, '0')}-${step}`;
    const scroller = () => document.querySelector('dialog[open] .sheet-panel') ?? document.getElementById('main') ?? document.documentElement;
    await page.evaluate(`(${scroller.toString()})().scrollTop = 0`);
    await page.screenshot({ path: path.join(dir, `${file}.png`) });
    const tall = await page.evaluate(`(() => { const s = (${scroller.toString()})(); return s.scrollHeight > s.clientHeight + 4; })()`);
    if (tall) {
      await page.evaluate(`(() => { const s = (${scroller.toString()})(); s.scrollTop = s.scrollHeight; })()`);
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(dir, `${file}-scrolled.png`) });
      await page.evaluate(`(${scroller.toString()})().scrollTop = 0`);
    }
    steps.push({ step: file, findings: await page.evaluate(auditPage) });
  };
  const nav = (label: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label });

  // Tuesday 6 Oct 2026 → "next Friday" is 9 Oct.
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(APP);

  // ---------------- Setup ----------------
  await snap('welcome');
  await tap(page.getByRole('button', { name: /Set up mine/ }));
  await snap('setup-1-name-currency');
  await tap(page.getByRole('button', { name: 'Next' }));

  await type(page.getByLabel('Balance today'), '1200');
  await snap('setup-2-balance');
  await tap(page.getByRole('button', { name: 'Next' }));

  // Defaults are already "every 2 weeks, next Friday" — only the amount is needed.
  await type(page.getByLabel('How much lands in your account?'), '1500');
  await expect(page.getByLabel('How often')).toHaveValue('biweekly');
  await expect(page.getByLabel('Next payday')).toHaveValue('2026-10-09');
  await snap('setup-3-pay');
  await tap(page.getByRole('button', { name: 'Next' }));

  await type(page.getByLabel('Rent or mortgage amount'), '800');
  await type(page.getByLabel('Rent or mortgage day of month'), '1');
  await type(page.getByLabel('Phone amount'), '45');
  await type(page.getByLabel('Phone day of month'), '15');
  await snap('setup-4-bills');
  await tap(page.getByRole('button', { name: 'Finish' }));
  await expect(page.locator('.big-number')).toBeVisible();
  const afterOnboarding = { taps: counts.setupTaps, fields: counts.setupFields };
  await snap('today-after-setup');

  // Netflix isn't in the onboarding list, so it's added from Bills.
  await tap(nav('Bills'));
  await snap('bills-before-netflix');
  await tap(page.getByRole('button', { name: 'Add bill' }));
  await type(page.getByLabel('Name'), 'Netflix');
  await type(page.getByLabel('Amount'), '15');
  await type(page.getByLabel('Next due date'), '2026-10-20');
  await snap('bills-add-netflix-sheet');
  await tap(page.getByRole('button', { name: 'Save' }));
  await expect(page.getByText('Netflix', { exact: true })).toBeVisible();
  inSetup = false;
  const setupTotal = { taps: counts.setupTaps, fields: counts.setupFields };
  await snap('bills-after-netflix');

  // ---------------- Use ----------------
  await tap(nav('Today'));
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  await tap(box);
  await type(box, '4.50 coffee');
  await snap('today-quicklog-preview');
  await key(box, 'Enter');
  await snap('today-after-spend-1');
  await tap(page.getByRole('button', { name: /Lunch/ }));
  await snap('today-after-spend-2-chip');
  await tap(box);
  await type(box, '32 groceries');
  await key(box, 'Enter');
  await snap('today-after-spend-3');

  await tap(page.getByRole('button', { name: 'How is this worked out?' }).last());
  await expect(page.getByRole('dialog')).toBeVisible();
  await snap('today-explain-sheet');
  await tap(page.getByRole('button', { name: 'Close' }));

  await tap(nav('Bills'));
  await tap(page.getByRole('button', { name: /Mark Phone paid/ }));
  await expect(page.getByRole('status')).toContainText('Phone marked paid');
  await snap('bills-after-mark-paid');

  await tap(page.getByRole('radio', { name: 'Calendar' }));
  await snap('bills-calendar');
  await tap(page.getByRole('button', { name: /Oct 15/ }));
  await snap('bills-calendar-day-selected');

  // Remaining screens, for completeness.
  await tap(nav('Log'));
  await snap('log');
  await tap(page.getByRole('button', { name: /Coffee/ }).first());
  await snap('log-edit-sheet');
  await tap(page.getByRole('button', { name: 'Close' }));
  await tap(nav('Plan'));
  await tap(page.getByRole('radio', { name: 'Envelopes' }));
  await snap('plan-envelopes-empty');
  await tap(page.getByRole('button', { name: /Groceries/ }).last());
  await type(page.getByRole('dialog').getByLabel('Monthly amount (optional)'), '400');
  await tap(page.getByRole('dialog').getByRole('button', { name: 'Save' }));
  await snap('plan-envelopes');
  await tap(page.getByRole('radio', { name: 'Goals' }));
  await snap('plan-goals');
  await tap(page.getByRole('radio', { name: 'Debt' }));
  await tap(page.getByRole('button', { name: 'Add a debt' }));
  await type(page.getByRole('dialog').getByLabel('Name'), 'Visa card');
  await type(page.getByRole('dialog').getByLabel('Balance owed now'), '2400');
  await type(page.getByRole('dialog').getByLabel('Interest rate (APR %)'), '22.9');
  await type(page.getByRole('dialog').getByLabel('Minimum payment each month'), '60');
  await snap('plan-debt-add-sheet');
  await tap(page.getByRole('dialog').getByRole('button', { name: 'Save' }));
  await page.locator('#extra-slider').fill('5000');
  await snap('plan-debt');
  await tap(page.getByRole('radio', { name: 'Insights' }));
  await snap('plan-insights');
  await tap(nav('Today'));
  await snap('today-final');
  await tap(nav('More'));
  await snap('more');
  for (const [label, file] of [
    ['Accounts', 'more-accounts'],
    ['Paychecks', 'more-paychecks'],
    ['Quick-log chips', 'more-chips'],
    ['Settings', 'more-settings'],
    ['About & privacy', 'more-about'],
  ] as const) {
    await tap(page.getByRole('button', { name: new RegExp(`^${label.replace(/[&]/g, '\\&')}`) }));
    await snap(file);
    await tap(page.getByRole('button', { name: '‹ More' }));
  }

  const theme = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  fs.writeFileSync(
    path.join(dir, 'report.json'),
    JSON.stringify({ project, afterOnboarding, setupTotal, usage: { taps: counts.taps - setupTotal.taps, fields: counts.fields - setupTotal.fields }, bodyBackground: theme, consoleErrors, network, steps }, null, 2),
  );
});
