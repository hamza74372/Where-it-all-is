// Log filters and all-month search, "Erase all my data", and undoing a past import.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import type { Category, Transaction } from '../src/db/types';
import { detectMapping } from '../src/lib/csv/detect';
import { parseCsv } from '../src/lib/csv/parse';
import { filterLog, groupBy, matchesQuery, type LogFilter } from '../src/lib/logFilter';
import { eraseEverything, logTransaction } from '../src/state/actions';
import { commitImport, prepareImport, undoImport } from '../src/state/importActions';
import { Store } from '../src/state/store';

const tx = (id: string, date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, date, amount, accountId: 'chk', note: '', source: 'manual', cleared: false, updatedAt: 0, ...extra,
});
const cats: Category[] = [
  { id: 'cof', name: 'Coffee', emoji: '☕', color: '', order: 0, archived: false, updatedAt: 0 },
  { id: 'gro', name: 'Groceries', emoji: '🛒', color: '', order: 1, archived: false, updatedAt: 0 },
];
const rows: Transaction[] = [
  tx('a', '2026-08-03', -450, { note: 'Flat white', categoryId: 'cof' }),
  tx('b', '2026-09-12', -4500, { note: 'Big shop', categoryId: 'gro', accountId: 'card' }),
  tx('c', '2026-10-01', -460, { note: 'Latte', categoryId: 'cof' }),
  tx('d', '2026-10-05', -1299, { note: 'Book' }),
  tx('e', '2026-10-06', 150000, { note: 'Paycheck', source: 'income', importDescription: 'ACME CORP PAYROLL' }),
];
const base: LogFilter = { month: '2026-10', query: '', accountId: '', categoryId: '' };
const ids = (f: Partial<LogFilter>) => filterLog(rows, { ...base, ...f }, cats).map((t) => t.id);

describe('Log filters and search', () => {
  it('without a search: one month, newest first', () => {
    expect(ids({})).toEqual(['e', 'd', 'c']);
  });

  it('filters by account and by category (and "No category")', () => {
    expect(ids({ month: '2026-09', accountId: 'card' })).toEqual(['b']);
    expect(ids({ month: '2026-09', accountId: 'chk' })).toEqual([]);
    expect(ids({ categoryId: 'cof' })).toEqual(['c']);
    expect(ids({ categoryId: 'none' })).toEqual(['e', 'd']);
  });

  it('search covers every month, and still respects the filters', () => {
    expect(ids({ query: 'coffee' })).toEqual(['c', 'a']); // by category name, across Aug and Oct
    expect(ids({ query: 'shop' })).toEqual(['b']); // September, though October is showing
    expect(ids({ query: 'coffee', accountId: 'card' })).toEqual([]);
    expect(ids({ query: 'acme' })).toEqual(['e']); // the bank's original wording
  });

  it('search by amount: "45" finds 45.xx; "4.5" finds 4.50–4.59; comma decimals work', () => {
    expect(matchesQuery(rows[1], '45')).toBe(true);
    expect(matchesQuery(rows[0], '45')).toBe(false); // 4.50 is not 45
    expect(matchesQuery(rows[0], '4.5')).toBe(true);
    expect(matchesQuery(rows[2], '4,6')).toBe(true);
    expect(matchesQuery(rows[3], '12.99')).toBe(true);
    expect(ids({ query: '4.' })).toEqual(['c', 'a']);
  });

  it('results group by month (search) or by day (month view), keeping order', () => {
    const found = filterLog(rows, { ...base, query: 'e' }, cats);
    expect(groupBy(found, 'month').map(([k, list]) => [k, list.length])).toEqual([['2026-10', 2], ['2026-09', 1], ['2026-08', 1]]);
    expect(groupBy(filterLog(rows, base, cats), 'day').map(([k]) => k)).toEqual(['2026-10-06', '2026-10-05', '2026-10-01']);
  });
});

async function freshStore() {
  const store = await Store.load(await DB.open('t-' + uid(), new IDBFactory()));
  await store.upsert('accounts', [{ id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 100000, includeInSafeToSpend: true, archived: false }]);
  return store;
}

describe('Erase all my data', () => {
  it('removes everything, resets settings, keeps default categories and rules, and returns to the welcome screen', async () => {
    const store = await freshStore();
    await logTransaction(store, { amount: 450, direction: 'out', date: '2026-10-06', note: 'Coffee', accountId: 'chk' });
    await store.upsert('goals', [{ id: 'g', name: 'Holiday', emoji: '✈️', target: 1000, saved: 0 }]);
    await store.upsert('notes', [{ id: 'n', month: '2026-10', text: 'secret' }]);
    await store.saveSettings({ name: 'Sam', onboarded: true, buffer: 5000, lastBackupAt: 1, defaultAccountId: 'chk', storageNoteSeen: true });
    await store.setPartner({ id: 'partner', receivedAt: 1, summary: {} as never });

    await eraseEverything(store);

    const d = store.data;
    for (const s of ['accounts', 'transactions', 'goals', 'notes', 'bills', 'incomes', 'debts', 'importBatches', 'csvMappings', 'envelopeMoves'] as const) {
      expect(d[s], s).toEqual([]);
    }
    expect(d.partner).toBeNull();
    expect(d.categories.length).toBeGreaterThan(5);
    expect(d.rules.length).toBe(20);
    expect(d.settings).toMatchObject({ name: '', onboarded: false, buffer: 0 });
    expect(d.settings.lastBackupAt).toBeUndefined();
    expect(d.settings.defaultAccountId).toBeUndefined();
    expect(d.settings.storageNoteSeen).toBeUndefined();

    // And it's really gone from the database, not just from memory.
    await store.reload();
    expect(store.data.transactions).toEqual([]);
    expect(store.data.settings.name).toBe('');
  });
});

describe('Import history: undo a past import', () => {
  it('removes only the rows that import added; entries it linked to stay; other imports are untouched', async () => {
    const store = await freshStore();
    await logTransaction(store, { amount: 450, direction: 'out', date: '2026-10-05', note: 'Coffee', accountId: 'chk' });
    const file1 = parseCsv('Date,Description,Amount\n10/05/2026,STARBUCKS,-4.50\n10/06/2026,TESCO,-12.00\n').rows;
    const file2 = parseCsv('Date,Description,Amount\n10/20/2026,SHELL,-40.00\n').rows;
    const first = await commitImport(store, { fileName: 'oct-1.csv', accountId: 'chk', items: prepareImport(store, file1, detectMapping(file1, 'MDY')!.mapping, 'chk').items });
    await commitImport(store, { fileName: 'oct-2.csv', accountId: 'chk', items: prepareImport(store, file2, detectMapping(file2, 'MDY')!.mapping, 'chk').items });
    expect(first.batch.rowCount).toBe(1); // TESCO added; STARBUCKS linked to the typed coffee
    expect(store.data.importBatches.map((b) => b.fileName).sort()).toEqual(['oct-1.csv', 'oct-2.csv']);

    await undoImport(store, first.batch.id);
    const notes = store.data.transactions.map((t) => t.note).sort();
    expect(notes).toEqual(['Coffee', 'Shell']);
    expect(store.data.importBatches.map((b) => b.fileName)).toEqual(['oct-2.csv']);
  });
});
