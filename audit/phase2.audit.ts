// Realistic Phase 2 walkthrough with a layout/accessibility audit at every step.
// Screenshots + report.json go to screenshots/phase2/<project>/.

import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;

interface Finding {
  smallText: Array<{ text: string; px: number; where: string }>;
  smallTargets: Array<{ label: string; w: number; h: number }>;
  clipped: Array<{ text: string; why: string }>;
  overlaps: Array<{ a: string; b: string }>;
  horizontalScroll: boolean;
  theme: string;
  bg: string;
}

/** Runs inside the page. Audits the open dialog if there is one, otherwise the page. */
function auditPage(): Finding {
  const vw = window.innerWidth;
  const dialog = document.querySelector('dialog[open]');
  const root: Element = dialog ?? document.body;
  const isVisible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const name = (el: Element) =>
    (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || el.tagName)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 48);
  const where = (el: Element) => {
    const c = el.closest('[class]');
    return `${el.tagName.toLowerCase()}${c ? '.' + String(c.className).split(' ')[0] : ''}`;
  };
  const inFixed = (el: Element) => !!el.closest('.bottom-nav, .toast-region');

  const out: Finding = {
    smallText: [], smallTargets: [], clipped: [], overlaps: [],
    horizontalScroll: document.documentElement.scrollWidth > vw + 1,
    theme: document.documentElement.dataset.theme ?? '',
    bg: getComputedStyle(document.body).backgroundColor,
  };

  // Text under 14px (elements that directly contain visible text).
  const seenText = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!own || !isVisible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 14) {
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const key = `${where(el)}|${px}`;
      if (!seenText.has(key)) {
        seenText.add(key);
        out.smallText.push({ text, px, where: where(el) });
      }
    }
  }
  if (!dialog) {
    for (const el of Array.from(document.querySelectorAll('.bottom-nav span'))) {
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 14 && !seenText.has(`nav|${px}`)) {
        seenText.add(`nav|${px}`);
        out.smallText.push({ text: (el.textContent ?? '').trim(), px, where: 'bottom-nav label' });
      }
    }
  }

  // Tap targets under 44×44.
  const targets = Array.from(
    (dialog ?? document).querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=switch], [role=radio]'),
  ).filter(isVisible);
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (r.width < 44 - 0.5 || r.height < 44 - 0.5) {
      out.smallTargets.push({ label: name(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  // Clipped text / content off the side of the screen.
  for (const el of Array.from(root.querySelectorAll('*')).filter(isVisible)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
    // Screen-reader-only text is deliberately 1px and clipped.
    if (r.width <= 1 || r.height <= 1 || (cs.clip && cs.clip !== 'auto')) continue;
    if (hasText && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && el.clientWidth > 0) {
      out.clipped.push({ text: name(el), why: `content ${el.scrollWidth}px in a ${el.clientWidth}px box` });
    }
    if (hasText && (r.right > vw + 1 || r.left < -1)) {
      out.clipped.push({ text: name(el), why: `runs off screen (${Math.round(r.left)}–${Math.round(r.right)} of ${vw}px)` });
    }
  }

  // Overlaps between separate pieces of content (not nested, not the fixed nav/toast).
  const boxes = Array.from(
    root.querySelectorAll('button, input, select, h1, h2, h3, p, label, .mono, .row-sub, .badge, .chip, .big-number'),
  )
    .filter((el) => isVisible(el) && !inFixed(el))
    .map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 2 && h > 2) out.overlaps.push({ a: name(a.el), b: name(b.el) });
    }
  }
  return out;
}

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
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(dir, `${file}.png`) });
    const tall = await page.evaluate(() => {
      const d = document.querySelector('dialog[open] .sheet-panel');
      if (d) return d.scrollHeight > d.clientHeight + 4;
      return document.documentElement.scrollHeight > window.innerHeight + 4;
    });
    if (tall) {
      await page.evaluate(() => {
        const d = document.querySelector('dialog[open] .sheet-panel');
        if (d) d.scrollTop = d.scrollHeight;
        else window.scrollTo(0, document.documentElement.scrollHeight);
      });
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(dir, `${file}-scrolled.png`) });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const d = document.querySelector('dialog[open] .sheet-panel');
        if (d) d.scrollTop = 0;
      });
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
  await snap('plan');
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
