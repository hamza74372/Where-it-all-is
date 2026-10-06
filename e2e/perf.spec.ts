// Speed with a big history: 5,000 transactions over 13 months. Today and Log must each be on
// screen within 1 second (spec §10). Timings are measured from the test side, so they include
// Playwright's own overhead — the real numbers are a little better.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;
const COUNT = 5000;
const LIMIT_MS = 1000;

test(`${COUNT} transactions: Today and Log render in under 1 second`, async ({ page }, info) => {
  // Seeding isn't timed. Playwright's WebKit on Windows writes IndexedDB ~15 ms per row (Chrome:
  // 0.07 ms), so writing 5,000 rows takes over a minute there; rendering is what's measured.
  test.setTimeout(info.project.name === 'webkit' ? 240_000 : 60_000);
  await page.clock.install({ time: new Date(2026, 9, 6, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await expect(page.locator('.big-number')).toBeVisible();

  // Write 5,000 transactions straight into the app's database, then reload.
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      const r = indexedDB.open('where-it-all-is');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
      r.onblocked = () => fail(new Error('blocked'));
    });
    const all = <T,>(store: string) =>
      new Promise<T[]>((ok) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => ok(r.result as T[]);
      });
    const accounts = await all<{ id: string; type: string }>('accounts');
    const categories = await all<{ id: string; name: string }>('categories');
    const account = accounts.find((a) => a.type === 'checking')!.id;
    const notes = ['Coffee', 'Groceries', 'Lunch', 'Bus', 'Pharmacy', 'Books', 'Takeaway', 'Petrol', 'Cinema', 'Hardware store'];
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const start = Date.UTC(2025, 8, 1);
    for (let i = 0; i < count; i++) {
      const day = new Date(start + Math.floor((i / count) * 400) * 86_400_000).toISOString().slice(0, 10);
      const note = notes[i % notes.length];
      store.put({
        id: `perf-${i}`, date: day, amount: -((i * 137) % 9000 + 99), accountId: account,
        categoryId: categories[i % categories.length].id, note: `${note} ${i}`,
        source: i % 3 === 0 ? 'import' : 'manual', cleared: i % 3 === 0, updatedAt: i,
      });
    }
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
  }, COUNT);

  // Today: from reload to the number on screen. Median of 3, so one hiccup on a busy machine
  // doesn't decide it.
  const runs: number[] = [];
  let t = 0;
  for (let i = 0; i < 3; i++) {
    t = Date.now();
    await page.reload();
    await expect(page.locator('.big-number')).toBeVisible();
    runs.push(Date.now() - t);
  }
  const today = [...runs].sort((a, b) => a - b)[1];

  // Log: from the tap to the month's entries on screen.
  t = Date.now();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Log' }).click();
  await expect(page.locator('.log-day').first()).toBeVisible();
  const log = Date.now() - t;
  const monthRows = await page.locator('.log-day .row').count();

  // Search across every month: results capped per page, "Show more" adds the next page.
  t = Date.now();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('coffee');
  const summary = page.getByText(/^\d+ results across all months/);
  await expect(summary).toBeVisible();
  const search = Date.now() - t;
  const found = Number((await summary.textContent())!.match(/^(\d+)/)![1]);
  expect(found).toBeGreaterThan(500);
  await expect(page.locator('.log-day .row')).toHaveCount(150);
  await page.getByRole('button', { name: `Show more (${found - 150} left)` }).click();
  await expect(page.locator('.log-day .row')).toHaveCount(300);

  const result = { browser: info.project.name, transactions: COUNT, todayMs: today, todayRunsMs: runs, logMs: log, logRowsThisMonth: monthRows, searchResults: found, searchMs: search };
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(path.join('test-results', `perf-${info.project.name}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  expect(today).toBeLessThan(LIMIT_MS);
  expect(log).toBeLessThan(LIMIT_MS);
  expect(search).toBeLessThan(LIMIT_MS);
});
