// Import behaviour against a real Store (in-memory IndexedDB): manual-log matching, undo,
// bank fees, and the balance check.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import type { Transaction } from '../src/db/types';
import { matchManualEntries, type Draft } from '../src/lib/csv/convert';
import { detectMapping } from '../src/lib/csv/detect';
import { parseCsv } from '../src/lib/csv/parse';
import { computeSafeToSpend } from '../src/lib/safeToSpend';
import { addBalanceAdjustment, BANK_FEES, bankStyleBalance, commitImport, countsOf, prepareImport, undoImport } from '../src/state/importActions';
import { Store } from '../src/state/store';

const draft = (date: string, amount: number, description = 'STARBUCKS #1234', extra: Partial<Draft> = {}): Draft => ({ rowIndex: 0, date, amount, description, ...extra });
const manual = (id: string, date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, date, amount, accountId: 'chk', note: 'Coffee', source: 'manual', cleared: false, updatedAt: 0, ...extra,
});

describe('matching imported rows to manual logs', () => {
  const match = (drafts: Draft[], existing: Transaction[], dup = drafts.map(() => false)) => matchManualEntries(drafts, dup, existing, 'chk');

  it('the same amount 2 days apart matches', () => {
    expect(match([draft('2026-10-07', -450)], [manual('m1', '2026-10-05', -450)])).toEqual(['m1']);
  });

  it('the same amount 5 days apart does not', () => {
    expect(match([draft('2026-10-10', -450)], [manual('m1', '2026-10-05', -450)])).toEqual([undefined]);
  });

  it('two coffees of the same amount on the same day match one-to-one', () => {
    const r = match([draft('2026-10-05', -450), draft('2026-10-05', -450)], [manual('m1', '2026-10-05', -450), manual('m2', '2026-10-05', -450)]);
    expect(r).toHaveLength(2);
    expect(new Set(r)).toEqual(new Set(['m1', 'm2']));
  });

  it('picks the closest date when several could match', () => {
    expect(match([draft('2026-10-06', -450)], [manual('far', '2026-10-03', -450), manual('near', '2026-10-07', -450)])).toEqual(['near']);
  });

  it('never matches one manual entry to two rows', () => {
    expect(match([draft('2026-10-05', -450), draft('2026-10-06', -450)], [manual('m1', '2026-10-05', -450)])).toEqual(['m1', undefined]);
  });

  it('needs the same account and the exact amount; skips duplicates, fees and already-matched entries', () => {
    expect(match([draft('2026-10-05', -451)], [manual('m1', '2026-10-05', -450)])).toEqual([undefined]);
    expect(match([draft('2026-10-05', -450)], [manual('m1', '2026-10-05', -450, { accountId: 'other' })])).toEqual([undefined]);
    expect(match([draft('2026-10-05', -450)], [manual('m1', '2026-10-05', -450)], [true])).toEqual([undefined]);
    expect(match([draft('2026-10-05', -450, 'X (fee)', { feeOf: 0 })], [manual('m1', '2026-10-05', -450)])).toEqual([undefined]);
    expect(match([draft('2026-10-05', -450)], [manual('m1', '2026-10-05', -450, { matchedBatchId: 'b0' })])).toEqual([undefined]);
    expect(match([draft('2026-10-05', -450)], [manual('m1', '2026-10-05', -450, { source: 'import' })])).toEqual([undefined]);
  });
});

async function freshStore(openingBalance = 100000) {
  const store = await Store.load(await DB.open('t-' + uid(), new IDBFactory()));
  await store.upsert('accounts', [{ id: 'chk', name: 'Everyday', type: 'checking', openingBalance, includeInSafeToSpend: true, archived: false }]);
  return store;
}
const csvRows = (text: string) => parseCsv(text).rows;
const mappingFor = (rows: string[][]) => detectMapping(rows, 'MDY')!.mapping;

describe('import with matching, end to end on the store', () => {
  const FILE = 'Date,Description,Amount\n10/07/2026,STARBUCKS #1234,-4.50\n10/08/2026,WHOLE FOODS,-62.10\n';

  it('links the manual entry instead of adding the row; undo restores it unlinked; re-import sees it as done', async () => {
    const store = await freshStore();
    await store.upsert('transactions', [{ ...manual('coffee', '2026-10-05', -450), note: 'Coffee' }]);
    const rows = csvRows(FILE);
    const prepared = prepareImport(store, rows, mappingFor(rows), 'chk');
    expect(countsOf(prepared)).toMatchObject({ newCount: 1, matchedCount: 1, duplicateCount: 0 });

    const { batch, transactions, matched } = await commitImport(store, { fileName: 'f.csv', accountId: 'chk', items: prepared.items });
    expect(transactions.map((t) => t.note)).toEqual(['Whole Foods']);
    expect(matched).toHaveLength(1);
    const linked = store.data.transactions.find((t) => t.id === 'coffee')!;
    expect(linked).toMatchObject({ matchedBatchId: batch.id, importDate: '2026-10-07', importDescription: 'STARBUCKS #1234', note: 'Coffee', date: '2026-10-05', cleared: true });
    expect(store.data.transactions.filter((t) => t.amount === -450)).toHaveLength(1); // not added twice

    // Importing the same file again: the matched row is recognised as already there.
    const again = prepareImport(store, rows, mappingFor(rows), 'chk');
    expect(countsOf(again)).toMatchObject({ newCount: 0, matchedCount: 0, duplicateCount: 2 });

    // Undo the import: the imported row goes, the manual entry stays, unlinked.
    await undoImport(store, batch.id);
    const restored = store.data.transactions.find((t) => t.id === 'coffee')!;
    expect(restored).toBeDefined();
    expect(restored.matchedBatchId).toBeUndefined();
    expect(restored.importDescription).toBeUndefined();
    expect(restored.importDate).toBeUndefined();
    expect(restored.cleared).toBe(false);
    expect(store.data.transactions.map((t) => t.id)).toEqual(['coffee']);
    expect(store.data.importBatches).toEqual([]);
  });

  it('an unlinked match is imported as a new row', async () => {
    const store = await freshStore();
    await store.upsert('transactions', [manual('coffee', '2026-10-05', -450)]);
    const rows = csvRows(FILE);
    const p = prepareImport(store, rows, mappingFor(rows), 'chk');
    p.items = p.items.map((it) => ({ ...it, matchId: undefined })); // "Unlink"
    expect(countsOf(p)).toMatchObject({ newCount: 2, matchedCount: 0 });
    const { transactions } = await commitImport(store, { fileName: 'f.csv', accountId: 'chk', items: p.items });
    expect(transactions).toHaveLength(2);
  });
});

describe('bank fees (Revolut-style)', () => {
  it('each non-zero fee becomes its own "Bank fees" transaction linked to its row', async () => {
    const store = await freshStore(50000);
    const rows = csvRows(fs.readFileSync(path.join(__dirname, 'fixtures/csv/revolut.csv'), 'utf8'));
    const p = prepareImport(store, rows, detectMapping(rows, 'DMY')!.mapping, 'chk');
    expect(countsOf(p)).toMatchObject({ newCount: 6, feeCount: 1 });
    const { transactions } = await commitImport(store, { fileName: 'revolut.csv', accountId: 'chk', items: p.items });
    const fee = transactions.find((t) => t.importDescription === 'Exchanged to EUR (fee)')!;
    const parent = transactions.find((t) => t.importDescription === 'Exchanged to EUR')!;
    const feesCat = store.data.categories.find((c) => c.name === BANK_FEES)!;
    expect(fee).toMatchObject({ amount: -50, categoryId: feesCat.id, linkedTxId: parent.id, note: 'Fee: Exchanged to EUR' });
    // The app's balance now equals Revolut's closing balance.
    expect(bankStyleBalance(store, 'chk', '2026-10-31')).toBe(50817);
  });
});

describe('balance check', () => {
  it('a balance adjustment brings safe-to-spend in line with the bank, and can be undone', async () => {
    const store = await freshStore(100000); // app thinks 1,000.00
    const sts = () =>
      computeSafeToSpend({
        today: '2026-10-06', accounts: store.data.accounts, transactions: store.data.transactions, incomes: [], bills: [], goals: [],
        settings: { buffer: 0, setAsideGoals: false },
      });
    expect(sts().available).toBe(100000);

    // The bank says 962.40.
    const { difference, undo } = await addBalanceAdjustment(store, 'chk', 96240, '2026-10-06');
    expect(difference).toBe(-3760);
    expect(sts().available).toBe(96240);
    expect(bankStyleBalance(store, 'chk', '2026-10-06')).toBe(96240);
    const adj = store.data.transactions.find((t) => t.source === 'adjustment')!;
    expect(adj).toMatchObject({ amount: -3760, note: 'Balance adjustment' });
    expect(sts().spentToday).toBe(0); // an adjustment isn't spending

    await undo();
    expect(sts().available).toBe(100000);
  });

  it('credit cards are checked by what you owe', async () => {
    const store = await freshStore();
    await store.upsert('accounts', [{ id: 'card', name: 'Visa', type: 'credit', openingBalance: -20000, includeInSafeToSpend: false, archived: false }]);
    expect(bankStyleBalance(store, 'card', '2026-10-06')).toBe(20000);
    const { difference } = await addBalanceAdjustment(store, 'card', 23500, '2026-10-06'); // statement says 235.00 owed
    expect(difference).toBe(-3500);
    expect(bankStyleBalance(store, 'card', '2026-10-06')).toBe(23500);
  });

  it('no adjustment when they already agree', async () => {
    const store = await freshStore();
    const { difference } = await addBalanceAdjustment(store, 'chk', 100000, '2026-10-06');
    expect(difference).toBe(0);
    expect(store.data.transactions).toEqual([]);
  });
});
