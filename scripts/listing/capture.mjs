// Screens for the listing images, captured from the real app with its example numbers.
// Writes PNGs to listing/.build/. Run via render.mjs (npm run listing).
import fs from 'node:fs';
import path from 'node:path';
import {
  BUILD, PHONE, SCENE_DAY, finishImportUntil, hideExampleBanner, importFile, importStatementA, nav, openExampleApp, settle, statementB,
} from './lib.mjs';

const card = (page, heading) => page.locator('.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }).last();

async function shot(target, name) {
  // Toasts are for the moment; still pictures leave them out.
  const page = typeof target.page === 'function' ? target.page() : target;
  await page.addStyleTag({ content: '.toast-region { display: none !important; }' });
  await target.screenshot({ path: path.join(BUILD, `${name}.png`), animations: 'disabled' });
}

/** Hide the bottom nav for element/full screenshots where it would float over content. */
const quietNav = (page) => page.addStyleTag({ content: '.app-nav, .bottom-nav, nav[aria-label="Main"] { visibility: hidden !important; }' });

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
  return Math.round(Number(m[1].replace(/,/g, '')) * 100);
}

export async function captureAll(browser, server) {
  fs.mkdirSync(BUILD, { recursive: true });
  const fresh = async (height = PHONE.viewport.height) => {
    const ctx = await browser.newContext({ ...PHONE, viewport: { width: PHONE.viewport.width, height } });
    return { ctx, page: await ctx.newPage() };
  };

  // Today: the hero, the breakdown sheet, the quick log.
  {
    const { ctx, page } = await fresh();
    await openExampleApp(page, server, { coffee: false }); // default chips, as in the device shots
    await shot(page, 'today');
    await shot(page.locator('.hero'), 'today-hero');
    const box = page.getByRole('textbox', { name: 'Log a spend' });
    await box.fill('4.50 coffee');
    await page.locator('#ql-preview').getByText('Coffee').waitFor();
    await box.fill('');
    await page.getByRole('button', { name: 'How is this worked out?' }).last().click();
    const sheet = page.locator('.sheet-panel');
    await sheet.waitFor();
    await settle(page);
    await page.waitForTimeout(1200);
    await page.addStyleTag({ content: '.sheet-panel { border-radius: 0 !important; }' }); // square crop: no page at the corners
    await shot(sheet, 'explain');
    await ctx.close();
  }

  // Quick log, shown large: captured at 4x so it stays sharp.
  {
    const ctx = await browser.newContext({ ...PHONE, deviceScaleFactor: 4 });
    const page = await ctx.newPage();
    await openExampleApp(page, server, { coffee: false });
    await page.getByRole('textbox', { name: 'Log a spend' }).fill('4.50 coffee');
    await page.locator('#ql-preview').getByText('Coffee').waitFor();
    await shot(page.locator('.card:has(#ql-label)'), 'quick-log');
    await ctx.close();
  }

  // Bills: list and calendar.
  {
    const { ctx, page } = await fresh();
    await openExampleApp(page, server, { coffee: false });
    await nav(page, 'Bills').click();
    await settle(page);
    await shot(page, 'bills-list');
    await page.getByRole('radio', { name: 'Calendar' }).or(page.getByRole('button', { name: 'Calendar' })).first().click();
    await settle(page);
    await shot(page, 'bills-calendar');
    await ctx.close();
  }

  // Plan: envelopes, goals, debt, insights.
  {
    const { ctx, page } = await fresh();
    await openExampleApp(page, server, { coffee: false });
    await nav(page, 'Plan').click();
    for (const tab of ['Envelopes', 'Goals', 'Debt', 'Insights']) {
      await page.getByRole('radio', { name: tab }).or(page.getByRole('button', { name: tab, exact: true })).first().click();
      await settle(page);
      await shot(page, `plan-${tab.toLowerCase()}`);
    }
    await quietNav(page);
    await shot(card(page, 'Spending by category'), 'insights-donut');
    await shot(card(page, 'Six-month flow'), 'insights-flow');
    await ctx.close();
  }

  // Welcome back: away eight days, then the three steps.
  {
    const { ctx, page } = await fresh();
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
    await page.waitForTimeout(400);
    // The toast sits over the page; capture once it has gone.
    await page.locator('.toast').waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
    await shot(away, 'away-3');
    await ctx.close();
  }

  // Import: preview, review, balance check.
  const closing = await calibrateClosing(browser, server);
  {
    const { ctx, page } = await fresh(1900); // tall enough for the whole preview card
    await importScene(page, server, closing, 'preview');
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

  // Partner: create a share on one "phone", open it on another.
  {
    const share = await fresh();
    await share.page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    });
    await openExampleApp(share.page, server, { coffee: false });
    await nav(share.page, 'More').click();
    await share.page.getByRole('button', { name: /^Share with partner/ }).click();
    await share.page.getByLabel('Passphrase for this share').fill('our house 12');
    await share.page.getByLabel('Type it again').fill('our house 12');
    await settle(share.page);
    await shot(share.page, 'partner-share');
    const download = share.page.waitForEvent('download');
    await share.page.getByRole('button', { name: 'Create share file' }).click();
    const file = path.join(BUILD, (await download).suggestedFilename());
    await (await download).saveAs(file);
    await share.ctx.close();

    const view = await fresh();
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
    await shot(view.page, 'partner-view');
    await view.ctx.close();
  }
  return { closing };
}
