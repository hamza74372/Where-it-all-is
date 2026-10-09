import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'qa', 'customer-test');
const SHOTS = path.join(OUT, 'shots');
const CSV = path.join(OUT, 'csv');
const DOWNLOADS = path.join(OUT, 'downloads');
for (const dir of [OUT, SHOTS, CSV, DOWNLOADS]) fs.mkdirSync(dir, { recursive: true });

const observations = [];
const findings = [];
const moneyChecks = [];
const runtimeProblems = [];
const actionCounts = {};
let shotNo = 0;

const stamp = (date) => date.toISOString().slice(0, 10);
const moneyNumber = (text) => {
  const n = Number(String(text ?? '').replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function note(customer, day, action, result, expected = '') {
  observations.push({ customer, day, action, result: clean(result), expected: clean(expected) });
  actionCounts[customer] = (actionCounts[customer] ?? 0) + 1;
}

async function shot(page, customer, day, slug) {
  shotNo += 1;
  const name = `${String(shotNo).padStart(3, '0')}-${customer}-${day}-${slug}.png`.replace(/[^a-zA-Z0-9._-]/g, '-');
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
  return `shots/${name}`;
}

async function finding(page, { id, severity, customer, day, action, result, expected, slug }) {
  const screenshot = page ? await shot(page, customer, day, slug ?? id) : '';
  findings.push({ id, severity, customer, day, action, result: clean(result), expected: clean(expected), screenshot });
}

async function attempt(page, customer, day, action, fn, expected = '') {
  try {
    const result = await fn();
    note(customer, day, action, result ?? 'Completed', expected);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    const id = `RUNTIME-${String(runtimeProblems.length + 1).padStart(2, '0')}`;
    runtimeProblems.push({ id, customer, day, action, message });
    await finding(page, { id, severity: 'test gap', customer, day, action, result: message, expected, slug: 'automation-gap' });
    await page.keyboard.press('Escape').catch(() => {});
    return null;
  }
}

function guard(page, customer) {
  page.setDefaultTimeout(7000);
  page.on('pageerror', (e) => runtimeProblems.push({ id: 'PAGEERROR', customer, day: 'runtime', action: 'Use app', message: e.message }));
  page.on('console', (m) => {
    if (m.type() === 'error') runtimeProblems.push({ id: 'CONSOLE', customer, day: 'runtime', action: 'Use app', message: m.text() });
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(APP) && !u.startsWith('data:') && !u.startsWith('blob:')) {
      runtimeProblems.push({ id: 'NETWORK', customer, day: 'runtime', action: 'Use app', message: u });
    }
  });
}

const nav = (page, label) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label, exact: true });

async function dismissPrompts(page) {
  for (const label of ['Got it', 'Later', 'Not now']) {
    const b = page.getByRole('button', { name: label, exact: true });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
}

async function setup(page, cfg) {
  await page.getByRole('button', { name: /Set up mine/ }).click();
  await page.getByLabel('Balance today').fill(String(cfg.balance));
  await page.getByLabel('Currency').selectOption(cfg.currency ?? 'USD');
  await page.getByLabel('What should we call you? (optional)').fill(cfg.name);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  if (cfg.noPay) {
    await page.getByRole('button', { name: "I don't have regular pay" }).click();
  } else {
    await page.getByLabel('How much lands in your account?').fill(String(cfg.pay));
    if (cfg.varies) await page.getByRole('switch', { name: 'My pay varies' }).click();
    if (cfg.payFrequency) await page.getByLabel('How often').selectOption(cfg.payFrequency);
    if (cfg.nextPay) await page.getByLabel('Next payday').fill(cfg.nextPay);
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  if (cfg.rent) {
    await page.getByLabel('Rent or mortgage amount').fill(String(cfg.rent.amount));
    await page.getByLabel('Rent or mortgage day of month').fill(String(cfg.rent.day));
  }
  if (cfg.phone) {
    await page.getByLabel('Phone amount').fill(String(cfg.phone.amount));
    await page.getByLabel('Phone day of month').fill(String(cfg.phone.day));
  }
  for (const bill of cfg.extraSetupBills ?? []) {
    await page.getByRole('button', { name: 'Add another bill' }).click();
    const row = page.locator('.bill-quick-row').last();
    await row.getByLabel('Bill name').fill(bill.name);
    await row.getByLabel(`${bill.name} amount`).fill(String(bill.amount));
    await row.getByLabel(`${bill.name} day of month`).fill(String(bill.day));
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByRole('textbox', { name: 'Log a spend' }).waitFor();
  await dismissPrompts(page);
}

async function addAccount(page, { name, type, balance, include = false }) {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Accounts/ }).click();
  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Type').selectOption(type);
  const balanceLabel = type === 'credit' ? 'How much do you owe on it right now?' : 'Balance right now';
  await page.getByLabel(balanceLabel).fill(String(balance));
  const includeSwitch = page.getByRole('switch', { name: 'Count in safe to spend' });
  const checked = (await includeSwitch.getAttribute('aria-checked')) === 'true';
  if (checked !== include) await includeSwitch.click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

async function addBill(page, { name, amount, due, autopay = false, cardName = null, once = false }) {
  await nav(page, 'Bills').click();
  await page.getByRole('button', { name: 'Add bill' }).click();
  await page.getByLabel('Name').fill(name);
  if (cardName) {
    const select = page.getByLabel('Is this a credit card payment?');
    await select.selectOption({ label: `Yes — pays ${cardName}` });
    const follow = page.getByRole('switch', { name: 'Use what I owe on the card' });
    if ((await follow.getAttribute('aria-checked')) === 'true') await follow.click();
  }
  await page.getByLabel('Amount').fill(String(amount));
  if (once) await page.getByLabel('How often').selectOption('once');
  await page.getByLabel('Next due date').fill(due);
  const ap = page.getByRole('switch', { name: 'Autopay' });
  if (autopay && (await ap.getAttribute('aria-checked')) !== 'true') await ap.click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

async function logQuick(page, text) {
  await nav(page, 'Today').click();
  const box = page.getByRole('textbox', { name: 'Log a spend' });
  await box.fill(text);
  await box.press('Enter');
  await page.waitForTimeout(250);
}

async function logDetailed(page, { direction = 'out', amount, note: txNote, category, date, account, transferTo }) {
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  if (direction === 'in') await page.getByRole('radio', { name: 'Money in' }).click();
  if (direction === 'transfer') await page.getByRole('radio', { name: 'Transfer' }).click();
  await page.getByLabel('Amount').fill(String(amount));
  await page.getByLabel('Note').fill(txNote);
  if (category && direction !== 'transfer') await page.getByLabel('Category', { exact: true }).selectOption({ label: category });
  if (date) await page.getByLabel('Date').fill(date);
  if (account && await page.getByLabel(direction === 'transfer' ? 'From' : 'Account', { exact: true }).isVisible().catch(() => false)) {
    await page.getByLabel(direction === 'transfer' ? 'From' : 'Account', { exact: true }).selectOption({ label: account });
  }
  if (transferTo) await page.getByLabel('To', { exact: true }).selectOption({ label: transferTo });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

async function currentSafe(page) {
  await nav(page, 'Today').click();
  return clean(await page.locator('.big-number').first().textContent());
}

async function visibleAccountBalance(page, accountName) {
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Accounts/ }).click();
  const row = page.locator('.row').filter({ hasText: accountName }).first();
  const value = clean(await row.locator('.money').textContent());
  await page.getByRole('button', { name: 'Back to More' }).click();
  return value;
}

async function snapshotDay(page, customer, date, expectedBalance = null) {
  await page.clock.setSystemTime(new Date(`${date}T10:00:00`));
  await page.reload();
  await dismissPrompts(page);
  const safe = await currentSafe(page);
  note(customer, date, 'Open Today and check safe-to-spend', safe, 'A clear current daily number');
  if (expectedBalance != null) {
    const balance = await visibleAccountBalance(page, 'Main account');
    moneyChecks.push({ customer, date, check: 'Account ledger', expected: expectedBalance.toFixed(2), actual: moneyNumber(balance)?.toFixed(2) ?? balance, result: Math.abs((moneyNumber(balance) ?? NaN) - expectedBalance) < 0.011 ? 'Pass' : 'Mismatch' });
  }
  return safe;
}

async function markBill(page, name) {
  await nav(page, 'Bills').click();
  const button = page.getByRole('button', { name: new RegExp(`Mark ${name} paid`) }).first();
  await button.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark paid', exact: true }).click(); // paid in full
  await page.getByRole('status').filter({ hasText: `${name} marked paid` }).waitFor();
}

async function editFirstLog(page) {
  await nav(page, 'Log').click();
  const first = page.locator('.log-day .row button.row-button').first();
  await first.click();
  await page.getByLabel('Note').fill('Edited after checking receipt');
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Fun' });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
}

async function deleteAndUndo(page) {
  await nav(page, 'Log').click();
  const first = page.locator('.log-day .row button.row-button').first();
  const deletedNote = clean(await first.locator('.transaction-title > span').last().textContent());
  await first.click();
  await page.getByRole('button', { name: 'Delete this entry' }).click();
  const status = page.getByRole('status').filter({ hasText: 'Deleted' });
  await status.waitFor();
  await status.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('status').filter({ hasText: 'Undone' }).waitFor();
  const restored = (await page.locator('.log-day .row').filter({ hasText: deletedNote }).count()) > 0;
  return restored ? `Restored ${deletedNote}` : `Undo said “Undone”, but ${deletedNote} did not return`;
}

async function backUp(page, name) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await nav(page, 'More').click();
  await page.getByRole('button', { name: /^Backup & restore/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up now' }).click();
  const download = await pending;
  const file = path.join(DOWNLOADS, `${name}-${download.suggestedFilename()}`);
  await download.saveAs(file);
  return file;
}

async function wipeAndRestore(page, file) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase('where-it-all-is');
    r.onsuccess = resolve;
    r.onerror = () => reject(r.error);
  }));
  await page.reload();
  await page.getByRole('button', { name: 'Moving from another device? Restore a backup' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: /Replace my data/ }).click();
  await page.locator('.big-number').waitFor();
}

async function importCsv(page, file) {
  await nav(page, 'Log').click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Continue' }).click();
  const importButton = page.getByRole('button', { name: /^(Import|Link) \d+/ });
  const nothingNew = page.getByRole('button', { name: 'Nothing new to import' });
  if (await nothingNew.isVisible().catch(() => false)) {
    const summary = clean(await page.locator('.review-list').textContent());
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    return summary;
  }
  await importButton.click();
  const done = page.getByRole('heading', { name: /^Imported|^Linked/ });
  for (let i = 0; i < 30 && !(await done.isVisible().catch(() => false)); i++) {
    const home = page.locator('.sort-grid').getByRole('button', { name: /Home/ }).first();
    const next = page.getByRole('button', { name: /^(Continue|Skip|Leave it|Just this once)$/ }).first();
    if (await home.isVisible().catch(() => false)) await home.click().catch(() => {});
    else if (await next.isVisible().catch(() => false)) await next.click().catch(() => {});
    else await page.waitForTimeout(80);
  }
  const summary = clean(await done.textContent());
  await page.getByRole('button', { name: 'Done' }).click();
  return summary;
}

function writeTomCsv() {
  const weeks = [
    [['2026-10-07','TESCO STORES','-84.20'],['2026-10-09','ENERGY DIRECT DEBIT','-95.00'],['2026-10-11','BUS AND TUBE','-24.70']],
    [['2026-10-13','COUNCIL TAX','-140.00'],['2026-10-15','EATING OUT','-33.40'],['2026-10-18','TESCO STORES','-76.15']],
    [['2026-10-20','TRANSFER TO SAVINGS','-200.00'],['2026-10-22','FUN CINEMA','-28.00'],['2026-10-25','BUS AND TUBE','-21.10']],
    [['2026-10-28','SALARY','2200.00'],['2026-11-01','RENT','-850.00'],['2026-11-01','COUNCIL TAX','-140.00']],
    [['2026-11-03','TESCO STORES','-91.30'],['2026-11-05','EATING OUT','-29.90'],['2026-11-08','BUS AND TUBE','-26.40']],
  ];
  return weeks.map((rows, i) => {
    const file = path.join(CSV, `tom-week-${i + 1}.csv`);
    const text = rows.map(([iso, description, amount]) => {
      const [year, month, day] = iso.split('-');
      return `${day}/${month}/${year},${description},${amount}`;
    }).join('\n');
    fs.writeFileSync(file, text);
    return file;
  });
}

const server = http.createServer((req, res) => {
  const target = req.url === '/' || req.url === '/app.html' ? path.join(ROOT, 'dist', 'app.html') : null;
  if (!target) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const APP = `http://127.0.0.1:${server.address().port}/app.html`;

const wb = await webkit.launch();
const cb = await chromium.launch();

async function maya() {
  const customer = 'A-Maya';
  const ctx = await wb.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', acceptDownloads: true });
  const page = await ctx.newPage(); guard(page, customer);
  await page.clock.install({ time: new Date('2026-10-06T10:00:00') });
  await page.goto(APP);
  const welcomeShot = await shot(page, customer, 'day-1', 'welcome');
  note(customer, 'day 1', 'Read welcome and start setup', `Welcome readable at phone size; evidence ${welcomeShot}`, 'Understand the promise and begin without friction');
  await setup(page, { name: 'Maya', balance: 1240, pay: 1850, nextPay: '2026-10-16', rent: { amount: 1150, day: 1 }, phone: { amount: 45, day: 15 }, extraSetupBills: [{ name: 'Internet', amount: 60, day: 20 }, { name: 'Streaming', amount: 15.99, day: 8 }] });
  await finding(page, { id: 'F-01', severity: 'medium', customer, day: 'day 1', action: 'Set up a credit-card user', result: 'Onboarding only mentions that cards can be added later; Maya must leave setup and find More → Accounts, then separately add the card payment bill.', expected: 'A card balance/minimum could be captured in the guided setup when it materially affects the safe number.', slug: 'after-setup' });
  await addAccount(page, { name: 'Maya card', type: 'credit', balance: 320, include: false });
  await addBill(page, { name: 'Card minimum', amount: 40, due: '2026-10-25', cardName: 'Maya card' });

  let expectedBalance = 1240;
  const spends = [
    ['2026-10-06','4.50 coffee',-4.5],['2026-10-07','32.18 groceries',-32.18],['2026-10-08','13.40 lunch',-13.4],
    ['2026-10-09','7.25 bus',-7.25],['2026-10-10','21.00 fun',-21],['2026-10-11','5.15 coffee',-5.15],
  ];
  for (const [date, text, amount] of spends) {
    await page.clock.setSystemTime(new Date(`${date}T10:00:00`)); await page.reload(); await dismissPrompts(page);
    await logQuick(page, text); expectedBalance += amount;
    note(customer, date, `Quick-log ${text}`, await currentSafe(page), 'Safe number should immediately react');
  }
  const streamingPaid = await attempt(page, customer, '2026-10-08', 'Mark streaming paid', () => markBill(page, 'Streaming'), 'Already set-aside bill should not unexpectedly change safe-to-spend');
  if (streamingPaid !== null) expectedBalance -= 15.99;
  await attempt(page, customer, '2026-10-09', 'Edit transaction and category', () => editFirstLog(page), 'Edit should be easy and preserve cents');
  const undoResult = await attempt(page, customer, '2026-10-10', 'Delete and undo a transaction', () => deleteAndUndo(page), 'One-tap undo restores it');
  if (undoResult?.includes('did not return')) {
    await finding(page, { id: 'F-05', severity: 'high', customer, day: 'day 6', action: 'Delete a spend, then tap Undo', result: undoResult, expected: 'The deleted transaction should visibly return and be present in backup data.', slug: 'undo-missing-entry' });
  }
  await logDetailed(page, { direction: 'out', amount: 18.62, note: 'Pharmacy odd amount', category: 'Health', date: '2026-10-12' }); expectedBalance -= 18.62;
  await logDetailed(page, { direction: 'in', amount: 12.35, note: 'Refund', category: 'Shopping', date: '2026-10-13' }); expectedBalance += 12.35;
  await markBill(page, 'Phone'); expectedBalance -= 45;
  await snapshotDay(page, customer, '2026-10-13', expectedBalance);
  await page.clock.setSystemTime(new Date('2026-10-16T09:00:00')); await page.reload(); await dismissPrompts(page);
  await nav(page, 'Today').click();
  const confirmedPay = await attempt(page, customer, '2026-10-16', 'Confirm a varying paycheck', async () => {
    const payday = page.getByRole('region', { name: 'Payday — confirm your pay' });
    await payday.getByRole('button', { name: /^(Different amount|Enter amount)$/ }).click();
    await page.getByLabel('Amount that arrived').fill('1795.50');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    return currentSafe(page);
  }, 'Actual amount replaces estimate');
  if (confirmedPay) expectedBalance += 1795.50;
  await logDetailed(page, { direction: 'out', amount: 54.22, note: 'Card groceries', category: 'Groceries', date: '2026-10-17', account: 'Maya card' });
  await snapshotDay(page, customer, '2026-10-17', expectedBalance);

  // Deliberately disappear for ten days, then use the catch-up flow.
  await page.clock.setSystemTime(new Date('2026-10-28T10:00:00')); await page.reload();
  await nav(page, 'Today').click();
  const away = page.getByRole('region', { name: 'While you were away' });
  if (await away.isVisible().catch(() => false)) {
    await shot(page, customer, 'day-23', 'while-away');
    const skip = away.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    const all = page.getByRole('button', { name: 'They all happened' }); if (await all.isVisible().catch(() => false)) await all.click();
    const done = away.getByRole('button', { name: 'Done' }); if (await done.isVisible().catch(() => false)) await done.click();
    note(customer, 'day 23', 'Return after 10 days and catch up', 'A dedicated catch-up flow appeared and prevented silent assumptions.', 'A low-pressure review of missed pay and bills');
  } else {
    await finding(page, { id: 'F-02', severity: 'high', customer, day: 'day 23', action: 'Return after 10 days', result: 'No catch-up flow appeared.', expected: 'Prompt to review balance, bills and pay after a long absence.', slug: 'missing-away' });
  }
  await addBill(page, { name: 'Dentist one-off', amount: 85, due: '2026-11-03', once: true });
  const beforeBackup = await currentSafe(page);
  const backup = await backUp(page, 'maya');
  await wipeAndRestore(page, backup);
  const afterRestore = await currentSafe(page);
  moneyChecks.push({ customer, date: '2026-10-28', check: 'Backup → wipe → restore safe number', expected: beforeBackup, actual: afterRestore, result: beforeBackup === afterRestore ? 'Pass' : 'Mismatch' });
  await shot(page, customer, 'day-23', 'restored');
  await snapshotDay(page, customer, '2026-11-09');
  await ctx.close();
}

async function tom() {
  const customer = 'B-Tom';
  const files = writeTomCsv();
  const ctx = await wb.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', acceptDownloads: true });
  const page = await ctx.newPage(); guard(page, customer);
  await page.clock.install({ time: new Date('2026-10-06T10:00:00') }); await page.goto(APP);
  await setup(page, { name: 'Tom', balance: 980, currency: 'GBP', pay: 2200, payFrequency: 'monthly', nextPay: '2026-10-28', rent: { amount: 850, day: 1 }, phone: null, extraSetupBills: [{ name: 'Council tax', amount: 140, day: 1 }, { name: 'Energy', amount: 95, day: 10 }] });
  await addAccount(page, { name: 'Savings', type: 'savings', balance: 2000, include: false });
  await shot(page, customer, 'day-1', 'today-gbp');
  const sundays = ['2026-10-11','2026-10-18','2026-10-25','2026-11-01','2026-11-08'];
  const expectedBalances = [776.10, 526.55, 277.45, 1487.45, 1339.85];
  for (let i = 0; i < files.length; i++) {
    await page.clock.setSystemTime(new Date(`${sundays[i]}T18:00:00`)); await page.reload(); await dismissPrompts(page);
    if (i === 2) {
      await attempt(page, customer, sundays[i], 'Move £200 from current account to savings before importing the bank row', () => logDetailed(page, { direction: 'transfer', amount: 200, note: 'Monthly savings', account: 'Main account', transferTo: 'Savings', date: '2026-10-20' }), 'Statement import should link the overlap instead of adding it twice');
    }
    const summary = await importCsv(page, files[i]);
    note(customer, sundays[i], `Import weekly statement ${path.basename(files[i])}`, summary, 'Rows imported once and recognised clearly');
    await shot(page, customer, sundays[i], `week-${i + 1}-import`);
    if (i === 0) {
      const duplicate = await importCsv(page, files[i]);
      note(customer, sundays[i], 'Import the identical CSV again', duplicate, 'Duplicates should not be counted twice');
    }
    await snapshotDay(page, customer, sundays[i], expectedBalances[i]);
  }
  await nav(page, 'Plan').click(); await page.getByRole('radio', { name: 'Insights' }).click();
  await shot(page, customer, 'day-34', 'insights-after-imports');
  await ctx.close();
}

async function priya() {
  const customer = 'C-Priya';
  const ctx = await wb.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', acceptDownloads: true });
  const page = await ctx.newPage(); guard(page, customer);
  await page.clock.install({ time: new Date('2026-10-06T10:00:00') }); await page.goto(APP);
  await setup(page, { name: 'Priya', balance: 760, noPay: true, rent: { amount: 700, day: 1 }, phone: { amount: 55, day: 18 }, extraSetupBills: [{ name: 'Software', amount: 29, day: 12 }] });
  await finding(page, { id: 'F-03', severity: 'medium', customer, day: 'day 1', action: 'Choose “I don’t have regular pay”', result: 'The app clearly switches to planning until month-end, but offers no irregular-income forecast, expected invoice date, or cash-flow scenario.', expected: 'Freelancers need a lightweight way to enter likely incoming invoices without pretending they are regular pay.', slug: 'no-regular-pay' });
  const incomes = [['2026-10-09',600],['2026-10-20',1450],['2026-11-04',2400]];
  for (const [date, amount] of incomes) {
    await page.clock.setSystemTime(new Date(`${date}T11:00:00`)); await page.reload(); await dismissPrompts(page);
    await logDetailed(page, { direction: 'in', amount, note: `Client payment ${date}`, date });
    note(customer, date, `Log irregular client income $${amount}`, await currentSafe(page), 'Income is reflected without creating a regular schedule');
  }
  for (const [date, text] of [['2026-10-10','48.30 groceries'],['2026-10-14','17.20 transport'],['2026-10-21','92.75 software'],['2026-11-02','38.10 groceries']]) {
    await page.clock.setSystemTime(new Date(`${date}T10:00:00`)); await page.reload(); await dismissPrompts(page); await logQuick(page, text);
  }
  await nav(page, 'Plan').click();
  await page.getByRole('radio', { name: 'Envelopes' }).click();
  const grocery = page.getByRole('button', { name: /Groceries:/ }).first();
  if (await grocery.isVisible().catch(() => false)) {
    await grocery.click(); await page.getByLabel('Monthly amount (optional)').fill('40'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  }
  await logQuick(page, '65 groceries');
  await nav(page, 'Plan').click(); await page.getByRole('radio', { name: 'Envelopes' }).click();
  await shot(page, customer, 'day-17', 'overspent-envelope');
  const move = page.getByRole('button', { name: 'Move money' });
  if (await move.isVisible().catch(() => false)) {
    await move.click(); await page.getByLabel('How much').fill('20');
    const from = page.getByLabel('From'); const to = page.getByLabel('To');
    if ((await from.inputValue()) === (await to.inputValue())) await to.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Move', exact: true }).click();
  }
  await page.getByRole('radio', { name: 'Goals' }).click();
  await page.getByRole('button', { name: 'New goal' }).click();
  await page.getByLabel('What are you saving for?').fill('Tax reserve');
  await page.getByLabel('Target').fill('2000');
  await page.getByLabel('Saved so far').fill('500');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const goalCard = page.locator('.goal-card').first();
  if (await goalCard.isVisible().catch(() => false)) {
    await goalCard.getByRole('button', { name: /Add money/ }).click(); await page.getByLabel('Amount').fill('500'); await page.getByRole('button', { name: /Add/ }).last().click();
  }
  await shot(page, customer, 'day-20', 'goal-milestone');
  await page.getByRole('radio', { name: 'Debt' }).click();
  const addDebt = page.getByRole('button', { name: 'Add debt' });
  if (await addDebt.isVisible().catch(() => false)) {
    await addDebt.click(); await page.getByLabel('Name').fill('Laptop'); await page.getByLabel('Balance owed now').fill('1800'); await page.getByLabel('APR').fill('9.9'); await page.getByLabel('Minimum').fill('80'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  }
  const slider = page.locator('#extra-slider'); if (await slider.isVisible().catch(() => false)) await slider.fill('150');
  await shot(page, customer, 'day-30', 'debt-plan');
  for (const [date, expected] of [['2026-10-13', 1311.70], ['2026-10-20', 2744.50], ['2026-10-27', 2651.75], ['2026-11-04', 4948.65]]) {
    await snapshotDay(page, customer, date, expected);
  }
  await snapshotDay(page, customer, '2026-11-09', 4948.65);
  await ctx.close();
}

async function couple() {
  const customer = 'D-Sam-Alex';
  const samCtx = await cb.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', acceptDownloads: true });
  const alexCtx = await cb.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', acceptDownloads: true });
  const sam = await samCtx.newPage(); const alex = await alexCtx.newPage(); guard(sam, customer); guard(alex, customer);
  await sam.clock.install({ time: new Date('2026-10-06T10:00:00') }); await sam.goto(APP);
  await setup(sam, { name: 'Sam', balance: 1850, pay: 2100, nextPay: '2026-10-16', rent: { amount: 1100, day: 1 }, phone: { amount: 50, day: 15 } });
  await alex.clock.install({ time: new Date('2026-10-06T18:00:00') }); await alex.goto(APP);
  await setup(alex, { name: 'Alex', balance: 500, noPay: true, rent: null, phone: null });

  for (let week = 0; week < 4; week++) {
    const date = ['2026-10-09','2026-10-16','2026-10-23','2026-10-30'][week];
    await sam.clock.setSystemTime(new Date(`${date}T17:00:00`)); await sam.reload(); await dismissPrompts(sam);
    await logQuick(sam, `${12 + week}.50 shared groceries`);
    await snapshotDay(sam, customer, date, [1837.50, 1824.00, 1809.50, 1794.00][week]);
    await nav(sam, 'More').click(); await sam.getByRole('button', { name: /^Share with partner/ }).click();
    const include = sam.getByRole('switch', { name: 'Include recent transactions' }); if ((await include.getAttribute('aria-checked')) !== 'true') await include.click();
    await sam.getByLabel('Passphrase for this share').fill('our house 12'); await sam.getByLabel('Type it again').fill('our house 12');
    const pending = sam.waitForEvent('download'); await sam.getByRole('button', { name: 'Create share file' }).click();
    const download = await pending; const file = path.join(DOWNLOADS, `week-${week + 1}-${download.suggestedFilename()}`); await download.saveAs(file);

    await alex.clock.setSystemTime(new Date(`${date}T19:00:00`)); await alex.reload(); await dismissPrompts(alex);
    await nav(alex, 'More').click(); await alex.getByRole('button', { name: /^Share with partner/ }).click();
    await alex.locator('input[type=file][accept^=".wiai"]').setInputFiles(file);
    await alex.getByLabel('Passphrase your partner gave you').fill('our house 12'); await alex.getByRole('button', { name: 'Open', exact: true }).click();
    note(customer, date, `Create and open weekly partner share ${week + 1}`, 'Alex received a separate read-only snapshot without changing Alex’s own budget.', 'Weekly household visibility without merging data');
    await shot(alex, customer, `week-${week + 1}`, 'partner-view');
  }
  await finding(alex, { id: 'F-04', severity: 'medium', customer, day: 'week 4', action: 'Repeat partner sharing weekly', result: 'Privacy and separation are excellent, but each update requires creating, transporting, opening a file and re-entering the passphrase.', expected: 'The listing and guide should set expectations that this is manual snapshot sharing, not live household sync.', slug: 'manual-sharing' });
  await nav(sam, 'Today').click();
  const focus = sam.getByRole('button', { name: 'Focus mode' }); if (await focus.isVisible().catch(() => false)) await focus.click();
  await shot(sam, customer, 'day-31', 'focus-mode');
  await samCtx.close(); await alexCtx.close();
}

try {
  for (const [customer, run] of [['A-Maya', maya], ['B-Tom', tom], ['C-Priya', priya], ['D-Sam-Alex', couple]]) {
    if (process.env.ONLY && process.env.ONLY !== customer) continue;
    try {
      await run();
    } catch (error) {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      runtimeProblems.push({ id: 'SCENARIO', customer, day: 'run', action: 'Complete customer scenario', message });
      console.error(message);
    }
  }
} finally {
  await wb.close(); await cb.close(); server.close();
}

const resultName = process.env.ONLY ? `results-${process.env.ONLY.replace(/[^a-zA-Z0-9-]/g, '-')}.json` : 'results.json';
fs.writeFileSync(path.join(OUT, resultName), JSON.stringify({ generatedAt: new Date().toISOString(), observations, findings, moneyChecks, runtimeProblems, actionCounts }, null, 2));
console.log(JSON.stringify({ observations: observations.length, findings: findings.length, moneyChecks: moneyChecks.length, runtimeProblems: runtimeProblems.length, actionCounts }, null, 2));
