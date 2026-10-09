// Screens for the listing images, captured from the real app with its example numbers.
// Writes PNGs to listing/.build/. Run via render.mjs (npm run listing).
// Pieces shown large are cropped from the screen and captured at 3–4× so their text stays sharp.
import fs from 'node:fs';
import path from 'node:path';
import {
  BUILD, PHONE, SCENE_BALANCE, SCENE_DAY, finishImportUntil, hideExampleBanner, importFile, importStatementA, nav, openExampleApp, settle, statementB,
} from './lib.mjs';

const card = (page, heading) => page.locator('.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }).last();

async function shot(target, name, options = {}) {
  // Toasts are for the moment; still pictures leave them out.
  const page = typeof target.page === 'function' ? target.page() : target;
  await page.addStyleTag({ content: '.toast-region { display: none !important; }' });
  await target.screenshot({ path: path.join(BUILD, `${name}.png`), animations: 'disabled', ...options });
}

/** Hide the bottom nav for element screenshots where it would float over content. */
const quietNav = (page) => page.addStyleTag({ content: 'nav[aria-label="Main"] { visibility: hidden !important; }' });
const tab = (page, name) => page.getByRole('radio', { name }).or(page.getByRole('button', { name, exact: true })).first();

/** The import scenes: statement A quietly, then B up to `until` ('preview' | 'review' | 'balance'). */
export async function importScene(page, server, closing, until) {
  await openExampleApp(page, server, { coffee: false });
  await importStatementA(page, BUILD);
  const file = path.join(BUILD, 'statement-october.csv');
  fs.writeFileSync(file, statementB(closing));
  await importFile(page, file);
  if (until === 'preview') return;
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Ready to import' }).waitFor();
  if (until === 'review') return;
  await page.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
  await finishImportUntil(page, page.getByRole('heading', { name: /^Your bank (and the app agree|says)/ }));
}

/** What the app's balance is at the end of statement B (read from its own balance check). */
export async function calibrateClosing(browser, server) {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await importScene(page, server, 0, 'balance');
  const heading = (await page.getByRole('heading', { name: /^Your bank/ }).textContent()) ?? '';
  await ctx.close();
  const m = heading.match(/the app says \$([\d,]+\.\d\d)/);
  if (!m) throw new Error(`Couldn't read the app's balance from: ${heading}`);
  const closing = Math.round(Number(m[1].replace(/,/g, '')) * 100);
  // One scenario everywhere: the import must end on the balance the other images show.
  if (closing !== SCENE_BALANCE) throw new Error(`Import ends on ${closing}, other images show ${SCENE_BALANCE}`);
  return closing;
}

export async function captureAll(browser, server) {
  fs.mkdirSync(BUILD, { recursive: true });
  const fresh = async ({ height = PHONE.viewport.height, width = PHONE.viewport.width, scale = PHONE.deviceScaleFactor } = {}) => {
    const ctx = await browser.newContext({ ...PHONE, viewport: { width, height }, deviceScaleFactor: scale });
    return { ctx, page: await ctx.newPage() };
  };

  // 02 — Today on a phone, and the breakdown's key rows.
  {
    const { ctx, page } = await fresh({ scale: 3 });
    await openExampleApp(page, server, { coffee: false }); // default chips, as in the device shots
    await shot(page, 'today');
    await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
    await page.locator('.sheet-panel').waitFor();
    await settle(page);
    await page.waitForTimeout(1200);
    await shot(page.locator('.sheet-body ul:has(.explain-line)').first(), 'explain-rows');
    await ctx.close();
  }

  // 05 — the quick log, shown large: captured at 4×.
  {
    const { ctx, page } = await fresh({ scale: 4 });
    await openExampleApp(page, server, { coffee: false });
    await page.getByRole('textbox', { name: 'Log a spend' }).fill('4.50 coffee');
    await page.locator('#ql-preview').getByText('Coffee').waitFor();
    await shot(page.locator('.card:has(#ql-label)'), 'quick-log');
    await ctx.close();
  }

  // 04 — the bill rows and the calendar, cropped.
  {
    const { ctx, page } = await fresh({ height: 1500, scale: 3 });
    await openExampleApp(page, server, { coffee: false });
    await nav(page, 'Bills').click();
    await quietNav(page);
    await settle(page);
    await shot(page.locator('.bills-layout'), 'bills-rows');
    await tab(page, 'Calendar').click();
    await settle(page);
    await shot(page.locator('.bills-layout'), 'bills-calendar');
    await ctx.close();
  }

  // 06, 07 — Plan: the envelope bars, one goal, the debt-free date, and the insights charts.
  {
    const { ctx, page } = await fresh({ height: 1500, scale: 3 });
    await openExampleApp(page, server, { coffee: false });
    await nav(page, 'Plan').click();
    await quietNav(page);
    await settle(page);
    await shot(page.locator('ul.card.rows').first(), 'plan-envelopes');
    await tab(page, 'Goals').click();
    await settle(page);
    await shot(page.locator('li.row-envelope').filter({ hasText: 'Holiday' }), 'plan-goal');
    await tab(page, 'Debt').click();
    await settle(page);
    await shot(page.locator('.plan-card').filter({ hasText: /\d{4}/ }).first(), 'plan-debt');
    await tab(page, 'Insights').click();
    await settle(page);
    await shot(card(page, 'Spending by category'), 'insights-donut');
    await shot(card(page, 'Six-month flow'), 'insights-flow');
    await ctx.close();
  }

  // 08 — Welcome back: away eight days, then the three steps (narrow phone so the cards read large).
  {
    const { ctx, page } = await fresh({ width: 320, height: 900, scale: 3 });
    await openExampleApp(page, server, { coffee: false });
    await page.clock.setSystemTime(new Date(SCENE_DAY.getTime() + 8 * 86400000));
    await page.reload();
    await hideExampleBanner(page);
    const away = page.getByRole('region', { name: 'While you were away' });
    await away.waitFor();
    await settle(page);
    await shot(away, 'away-1');
    await away.getByRole('button', { name: 'Skip' }).click();
    await settle(page);
    await shot(away, 'away-2');
    await away.getByRole('button', { name: 'They all happened' }).click();
    await away.locator('.away-number').waitFor();
    await settle(page);
    await shot(away, 'away-3');
    await ctx.close();
  }

  // 03 — Import: preview, review, balance check (same balance as everywhere else).
  const closing = await calibrateClosing(browser, server);
  {
    const { ctx, page } = await fresh({ height: 1900, scale: 3 }); // tall enough for the whole preview card
    await importScene(page, server, closing, 'preview');
    await quietNav(page);
    await settle(page);
    await shot(card(page, 'Preview'), 'import-preview');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Ready to import' }).waitFor();
    await settle(page);
    await shot(card(page, 'Ready to import'), 'import-review');
    await page.getByRole('button', { name: /^(Import|Link) \d+/ }).click();
    await finishImportUntil(page, page.getByRole('heading', { name: 'Your bank and the app agree' }));
    await settle(page);
    await shot(card(page, 'Your bank and the app agree'), 'import-balance');
    await ctx.close();
  }

  // 10 — Partner: the share card on one phone, the read-only view (top part) on another.
  {
    const share = await fresh({ height: 1200, scale: 3 });
    await share.page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    });
    await openExampleApp(share.page, server, { coffee: false });
    await nav(share.page, 'More').click();
    await share.page.getByRole('button', { name: /^Share with partner/ }).click();
    await share.page.getByLabel('Passphrase for this share').fill('our house 12');
    await share.page.getByLabel('Type it again').fill('our house 12');
    await share.page.getByLabel('Type it again').blur();
    await quietNav(share.page);
    await settle(share.page);
    await shot(card(share.page, 'Share with your partner'), 'partner-share');
    const download = share.page.waitForEvent('download');
    await share.page.getByRole('button', { name: 'Create share file' }).click();
    const file = path.join(BUILD, (await download).suggestedFilename());
    await (await download).saveAs(file);
    await share.ctx.close();

    const view = await fresh({ scale: 3 });
    await view.page.clock.install({ time: new Date(SCENE_DAY.getTime() + 3600000) });
    await view.page.goto(server.app);
    await view.page.getByRole('button', { name: /Set up mine/ }).click();
    await view.page.getByLabel('Balance today').fill('640');
    await view.page.getByRole('button', { name: 'Skip setup' }).click();
    await nav(view.page, 'More').click();
    await view.page.getByRole('button', { name: /^Share with partner/ }).click();
    await view.page.locator('input[type=file]').setInputFiles(file);
    await view.page.getByLabel('Passphrase your partner gave you').fill('our house 12');
    await view.page.getByRole('button', { name: 'Open' }).click();
    await view.page.locator('.partner-view').waitFor();
    await settle(view.page);
    await shot(view.page, 'partner-view', { clip: { x: 0, y: 0, width: 390, height: 560 } });
    await view.ctx.close();
  }
  return { closing };
}
