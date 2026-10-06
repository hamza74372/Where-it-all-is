// Import correctness: no double counting against bills paid / pay confirmed / logged spends,
// "needs sorting" for unclear matches, the statement balance check, and transfers.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import type { Bill, Income, Schedule } from '../src/db/types';
import { convertRows, statementEnd } from '../src/lib/csv/convert';
import { detectMapping } from '../src/lib/csv/detect';
import { parseCsv } from '../src/lib/csv/parse';
import { spentByCategory } from '../src/lib/envelopes';
import { compareMonths, milestones, topPlaces } from '../src/lib/insights';
import { computeSafeToSpend } from '../src/lib/safeToSpend';
import { isTransfer } from '../src/lib/transfers';
import { addTransfer, confirmPay, deleteTransactions, logTransaction, markBillPaid } from '../src/state/actions';
import {
  addStatementAdjustment, balanceReport, bankStyleBalance, commitImport, countsOf, prepareImport, undoImport, type Prepared,
} from '../src/state/importActions';
import { Store } from '../src/state/store';

const fixture = (f: string) => fs.readFileSync(path.join(__dirname, 'fixtures/csv', f), 'utf8');
const rowsOf = (text: string) => parseCsv(text).rows;
const mappingOf = (rows: string[][]) => detectMapping(rows, 'MDY')!.mapping;
const monthly = (anchorDate: string, dayOfMonth: number): Schedule => ({ kind: 'monthly', anchorDate, dayOfMonth, weekendShift: 'none' });

async function freshStore() {
  return Store.load(await DB.open('t-' + uid(), new IDBFactory()));
}

/**
 * Sam from the audit's realistic run: set up on 30 Sep with 1,200.00, pay 1,500 every other
 * Friday, rent 800 on the 1st, phone 45 on the 15th. Back on 16 Oct: "They all happened" (rent,
 * phone, 2 Oct pay), today's pay confirmed, four spends typed in.
 */
async function samsMonth(opts: { lunch?: boolean } = {}) {
  const store = await freshStore();
  await store.upsert('accounts', [
    { id: 'chk', name: 'Main account', type: 'checking', openingBalance: 120000, openingDate: '2026-09-30', includeInSafeToSpend: true, archived: false },
  ]);
  const [pay] = (await store.upsert('incomes', [
    { id: 'pay', name: 'Paycheck', amount: 150000, accountId: 'chk', variable: false, active: true, schedule: { kind: 'biweekly', anchorDate: '2026-10-02', weekendShift: 'before' } },
  ])) as Income[];
  const [rent, phone] = (await store.upsert('bills', [
    { id: 'rent', name: 'Rent or mortgage', amount: 80000, accountId: 'chk', schedule: monthly('2026-10-01', 1), autopay: false, isDebtMinimum: false, active: true },
    { id: 'phone', name: 'Phone', amount: 4500, accountId: 'chk', schedule: monthly('2026-10-15', 15), autopay: false, isDebtMinimum: false, active: true },
  ])) as Bill[];
  await markBillPaid(store, rent, '2026-10-01', '2026-10-01', 80000);
  await markBillPaid(store, phone, '2026-10-15', '2026-10-15', 4500);
  await confirmPay(store, pay, '2026-10-02', 150000);
  await confirmPay(store, pay, '2026-10-16', 150000);
  const spends: Array<[number, string]> = [[450, 'Coffee'], [3210, 'Groceries'], [275, 'Bus']];
  if (opts.lunch !== false) spends.push([1200, 'Lunch']);
  for (const [amount, note] of spends) await logTransaction(store, { amount, direction: 'out', date: '2026-10-16', note, accountId: 'chk' });
  return store;
}

describe('the filled-16-log case: no double counting', () => {
  it('after importing the statement, the app balance equals the bank\'s real ending balance (2,998.99)', async () => {
    const store = await samsMonth();
    const rows = rowsOf(fixture('sam-checking.csv'));
    const p = prepareImport(store, rows, mappingOf(rows), 'chk');

    // Rent, phone, both paychecks and the 4 typed spends are already in the app: linked, not added.
    expect(countsOf(p)).toMatchObject({ matchedCount: 8, newCount: 6, undecidedCount: 0, duplicateCount: 0 });
    expect(p.statement).toEqual({ from: '2026-10-01', date: '2026-10-16', balance: 299899 });

    await commitImport(store, { fileName: 'sam-checking.csv', accountId: 'chk', items: p.items });
    expect(bankStyleBalance(store, 'chk', '2026-10-16')).toBe(299899);
    const txs = store.data.transactions;
    expect(txs.filter((t) => t.amount === 150000)).toHaveLength(2); // was 4
    expect(txs.filter((t) => t.amount === -80000)).toHaveLength(1); // was 2
    expect(txs.filter((t) => t.amount === -4500)).toHaveLength(1);
    expect(txs).toHaveLength(14); // one per bank row

    const sts = computeSafeToSpend({
      today: '2026-10-16', accounts: store.data.accounts, transactions: txs, incomes: store.data.incomes, bills: store.data.bills, goals: [],
      settings: { buffer: 0, setAsideGoals: false },
    });
    expect(sts.available).toBe(299899);

    // The balance check agrees, and re-importing the same file changes nothing.
    expect(balanceReport(store, 'chk', p)).toMatchObject({ bank: 299899, app: 299899, notOnStatement: [] });
    const again = prepareImport(store, rows, mappingOf(rows), 'chk');
    expect(countsOf(again)).toMatchObject({ newCount: 0, matchedCount: 0, duplicateCount: 14 });
  });

  it('undoing the import puts the bills, pay and spends back exactly as they were', async () => {
    const store = await samsMonth();
    const before = JSON.stringify(store.data.transactions.map(({ updatedAt: _u, ...t }) => t).sort((a, b) => a.id.localeCompare(b.id)));
    const rows = rowsOf(fixture('sam-checking.csv'));
    const { batch } = await commitImport(store, { fileName: 'f', accountId: 'chk', items: prepareImport(store, rows, mappingOf(rows), 'chk').items });
    await undoImport(store, batch.id);
    const after = store.data.transactions.map(({ updatedAt: _u, cleared: _c, ...t }) => t).sort((a, b) => a.id.localeCompare(b.id));
    expect(JSON.stringify(after)).toBe(before.replace(/,"cleared":(true|false)/g, ''));
  });
});

describe('needs sorting: a row that could be more than one entry', () => {
  const FILE = 'Date,Description,Amount\n10/06/2026,STARBUCKS #1234,-4.50\n10/08/2026,WHOLE FOODS,-62.10\n';
  async function twoCoffees() {
    const store = await freshStore();
    await store.upsert('accounts', [{ id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 100000, includeInSafeToSpend: true, archived: false }]);
    await store.upsert('transactions', [
      { id: 'c1', date: '2026-10-04', amount: -450, accountId: 'chk', note: 'Coffee', source: 'manual', cleared: false },
      { id: 'c2', date: '2026-10-07', amount: -450, accountId: 'chk', note: 'Coffee with Jo', source: 'manual', cleared: false },
    ]);
    return store;
  }

  it('is counted as undecided and left out (not guessed, not added) if the user never chooses', async () => {
    const store = await twoCoffees();
    const rows = rowsOf(FILE);
    const p = prepareImport(store, rows, mappingOf(rows), 'chk');
    expect(p.items[0].candidates).toEqual(['c1', 'c2']);
    expect(countsOf(p)).toMatchObject({ undecidedCount: 1, newCount: 1, matchedCount: 0 });
    await commitImport(store, { fileName: 'f', accountId: 'chk', items: p.items });
    expect(store.data.transactions.filter((t) => t.amount === -450)).toHaveLength(2); // still just the two typed coffees
    expect(store.data.transactions.every((t) => !t.matchedBatchId)).toBe(true);
  });

  it('the user\'s pick links to that entry; "something else" adds it; "leave it out" skips it', async () => {
    for (const [choice, expectCoffees, linked] of [['c2', 2, 'c2'], ['new', 3, null], ['skip', 2, null]] as const) {
      const store = await twoCoffees();
      const rows = rowsOf(FILE);
      const p = prepareImport(store, rows, mappingOf(rows), 'chk');
      p.items[0] = { ...p.items[0], choice };
      expect(countsOf(p).undecidedCount).toBe(0);
      await commitImport(store, { fileName: 'f', accountId: 'chk', items: p.items });
      expect(store.data.transactions.filter((t) => t.amount === -450)).toHaveLength(expectCoffees);
      if (linked) expect(store.data.transactions.find((t) => t.id === linked)!.importDescription).toBe('STARBUCKS #1234');
    }
  });
});

describe('balance check from the file\'s balance column', () => {
  it('finds the balance column in bank exports that have one', () => {
    for (const [f, col] of [['chase-checking.csv', 5], ['capital-one-360.csv', 5], ['revolut.csv', 9], ['sam-checking.csv', 5]] as const) {
      expect(detectMapping(rowsOf(fixture(f)), 'MDY')!.mapping.balanceCol, f).toBe(col);
    }
    expect(detectMapping(rowsOf(fixture('barclays.csv')), 'DMY')!.mapping.balanceCol).toBeUndefined();
  });

  it('reads the closing balance whether the file is oldest-first or newest-first', () => {
    const text = fixture('sam-checking.csv');
    const rows = rowsOf(text);
    const m = mappingOf(rows);
    expect(statementEnd(convertRows(rows, m).drafts)).toMatchObject({ date: '2026-10-16', balance: 299899 });
    const reversed = [rows[0], ...rows.slice(1).filter((r) => r.length > 1).reverse()];
    expect(statementEnd(convertRows(reversed, m).drafts)).toMatchObject({ date: '2026-10-16', balance: 299899, from: '2026-10-01' });
  });

  it('when they differ: says what the bank and app say, and lists what might be missing', async () => {
    // Lunch was typed in the app, but the bank hasn't got it (drop the Pret row from the file).
    const store = await samsMonth();
    const text = fixture('sam-checking.csv')
      .split('\n')
      .filter((l) => !l.includes('PRET A MANGER'))
      .map((l) => (l.includes('MTA*NYCT') ? l.replace('2998.99', '3010.99') : l))
      .join('\n');
    const rows = rowsOf(text);
    const p: Prepared = prepareImport(store, rows, mappingOf(rows), 'chk');
    await commitImport(store, { fileName: 'f', accountId: 'chk', items: p.items });
    const report = balanceReport(store, 'chk', p)!;
    expect(report.bank).toBe(301099);
    expect(report.app).toBe(299899);
    expect(report.notOnStatement.map((t) => t.note)).toEqual(['Lunch']);

    // Choosing the adjustment lines the app up with the bank on the statement date.
    await addStatementAdjustment(store, 'chk', report);
    expect(bankStyleBalance(store, 'chk', '2026-10-16')).toBe(301099);
    expect(balanceReport(store, 'chk', p)).toMatchObject({ bank: 301099, app: 301099 });
  });

  it('a linked entry counts on the bank\'s date (typed on the 16th, posted on the 15th → in both)', async () => {
    const store = await freshStore();
    await store.upsert('accounts', [{ id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 100000, openingDate: '2026-10-01', includeInSafeToSpend: true, archived: false }]);
    await logTransaction(store, { amount: 575, direction: 'out', date: '2026-10-16', note: 'Coffee', accountId: 'chk' });
    const rows = rowsOf('Date,Description,Amount,Balance\n10/02/2026,TESCO,-20.00,980.00\n10/15/2026,STARBUCKS,-5.75,974.25\n');
    const p = prepareImport(store, rows, mappingOf(rows), 'chk');
    expect(countsOf(p)).toMatchObject({ matchedCount: 1, newCount: 1 });
    await commitImport(store, { fileName: 'f', accountId: 'chk', items: p.items });
    expect(balanceReport(store, 'chk', p)).toMatchObject({ bank: 97425, app: 97425, date: '2026-10-15', notOnStatement: [] });
  });

  it('when you started after the statement ends, it compares on your start day, and an adjustment there really moves the balance', async () => {
    const store = await freshStore();
    await store.upsert('accounts', [{ id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 200000, openingDate: '2026-10-16', includeInSafeToSpend: true, archived: false }]);
    const rows = rowsOf('Date,Description,Amount,Balance\n10/14/2026,TESCO,-20.00,1964.25\n10/15/2026,STARBUCKS,-20.00,1944.25\n');
    const p = prepareImport(store, rows, mappingOf(rows), 'chk');
    await commitImport(store, { fileName: 'f', accountId: 'chk', items: p.items });
    const report = balanceReport(store, 'chk', p)!;
    expect(report).toMatchObject({ bank: 194425, app: 200000, date: '2026-10-16', beforeStart: 2 });
    const { difference } = await addStatementAdjustment(store, 'chk', report);
    expect(difference).toBe(-5575);
    expect(bankStyleBalance(store, 'chk', '2026-10-16')).toBe(194425);
  });

  it('no balance column → no automatic check', async () => {
    const store = await samsMonth();
    const rows = rowsOf('Date,Description,Amount\n10/16/2026,STARBUCKS,-4.50\n');
    expect(prepareImport(store, rows, mappingOf(rows), 'chk').statement).toBeNull();
  });
});

describe('transfers between your own accounts', () => {
  async function twoAccounts() {
    const store = await freshStore();
    await store.upsert('accounts', [
      { id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 100000, includeInSafeToSpend: true, archived: false },
      { id: 'sav', name: 'Rainy day savings', type: 'savings', openingBalance: 50000, includeInSafeToSpend: false, archived: false },
    ]);
    return store;
  }
  const sts = (store: Store, today = '2026-10-06') =>
    computeSafeToSpend({
      today, accounts: store.data.accounts, transactions: store.data.transactions, incomes: [], bills: [], goals: [],
      settings: { buffer: 0, setAsideGoals: false },
    });

  it('has two linked sides, moves both balances, and is never spending or income', async () => {
    const store = await twoAccounts();
    await store.upsert('transactions', [{ id: 'past', date: '2026-09-10', amount: -1000, accountId: 'chk', note: 'Lunch', source: 'manual', cleared: false }]);
    const { txs } = await addTransfer(store, { fromAccountId: 'chk', toAccountId: 'sav', amount: 20000, date: '2026-10-06', note: 'To savings' });
    expect(txs).toHaveLength(2);
    expect(txs[0].transferId).toBe(txs[1].transferId);
    expect(txs.map((t) => [t.accountId, t.amount])).toEqual([['chk', -20000], ['sav', 20000]]);

    // Safe to spend: the money left the counted account, but nothing was "spent" today.
    expect(sts(store).available).toBe(100000 - 1000 - 20000);
    expect(sts(store).spentToday).toBe(0);
    expect(bankStyleBalance(store, 'sav', '2026-10-06')).toBe(70000);

    // Reports: not in envelopes, month comparison, top places or the "money in vs out" milestone.
    expect(spentByCategory(store.data.transactions, '2026-10').size).toBe(0);
    expect(compareMonths(store.data.transactions, store.data.categories, '2026-10').map((r) => r.thisMonth)).toEqual([0]); // only September's lunch
    expect(topPlaces(store.data.transactions, '2026-10')).toEqual([]);
    expect(milestones(store.data.transactions, [], [], '2026-11-02')).toEqual([]);

    // Deleting either side removes both.
    await deleteTransactions(store, [txs[1]]);
    expect(store.data.transactions.map((t) => t.id)).toEqual(['past']);
  });

  it('on import: suggests a pair (same amount, opposite sign, other account, within 3 days); only confirmed pairs are linked', async () => {
    const store = await twoAccounts();
    // The savings side is already here (say, from the savings statement).
    await store.upsert('transactions', [{ id: 'sav-in', date: '2026-10-05', amount: 20000, accountId: 'sav', note: 'Deposit', source: 'import', importBatchId: 'b0', cleared: true }]);
    const rows = rowsOf('Date,Description,Amount\n10/06/2026,ONLINE BANKING PAYMENT REF 88,-200.00\n10/07/2026,TESCO,-12.00\n');

    const unconfirmed = prepareImport(store, rows, mappingOf(rows), 'chk');
    expect(unconfirmed.items[0].transfer).toEqual({ partnerId: 'sav-in', accountId: 'sav', confirmed: false });
    expect(unconfirmed.items[1].transfer).toBeUndefined();
    expect(countsOf(unconfirmed).transferCount).toBe(0);

    const p = prepareImport(store, rows, mappingOf(rows), 'chk');
    p.items[0] = { ...p.items[0], transfer: { ...p.items[0].transfer!, confirmed: true } };
    expect(countsOf(p)).toMatchObject({ transferCount: 1, newCount: 2 });
    const { batch, transfers } = await commitImport(store, { fileName: 'f', accountId: 'chk', items: p.items });
    expect(transfers).toBe(1);
    const out = store.data.transactions.find((t) => t.accountId === 'chk' && t.amount === -20000)!;
    const inn = store.data.transactions.find((t) => t.id === 'sav-in')!;
    expect(out.transferId).toBeDefined();
    expect(inn.transferId).toBe(out.transferId);
    expect(isTransfer(out) && isTransfer(inn)).toBe(true);
    expect(out.categoryId).toBeUndefined();
    expect(store.data.transactions).toHaveLength(3); // nothing extra created: the other side already existed

    // Undo: the import goes, and the savings deposit is an ordinary entry again.
    await undoImport(store, batch.id);
    expect(store.data.transactions.map((t) => t.id)).toEqual(['sav-in']);
    expect(store.data.transactions[0].transferId).toBeUndefined();
  });

  it('on import: "transfer to savings" wording with no other side yet → creates it on the chosen account once confirmed', async () => {
    const store = await twoAccounts();
    const rows = rowsOf('Date,Description,Amount\n10/06/2026,ONLINE TRANSFER TO SAV XXXX1234,-150.00\n');
    const p = prepareImport(store, rows, mappingOf(rows), 'chk');
    expect(p.items[0].transfer).toEqual({ accountId: 'sav', confirmed: false }); // guessed from "SAV"
    p.items[0] = { ...p.items[0], transfer: { ...p.items[0].transfer!, confirmed: true } };
    const { batch } = await commitImport(store, { fileName: 'f', accountId: 'chk', items: p.items });

    expect(bankStyleBalance(store, 'chk', '2026-10-06')).toBe(85000);
    expect(bankStyleBalance(store, 'sav', '2026-10-06')).toBe(65000);
    expect(sts(store).spentToday).toBe(0);
    const sides = store.data.transactions;
    expect(sides).toHaveLength(2);
    expect(new Set(sides.map((t) => t.transferId)).size).toBe(1);

    // The created savings side comes out with the import.
    await undoImport(store, batch.id);
    expect(store.data.transactions).toEqual([]);
  });

  it('a row that matches an existing entry on the same account is never offered as a transfer; one account → no suggestions', async () => {
    const store = await twoAccounts();
    await store.upsert('transactions', [
      { id: 'mine', date: '2026-10-06', amount: -20000, accountId: 'chk', note: 'Moved to savings', source: 'manual', cleared: false },
      { id: 'sav-in', date: '2026-10-06', amount: 20000, accountId: 'sav', note: 'Deposit', source: 'manual', cleared: false },
    ]);
    const rows = rowsOf('Date,Description,Amount\n10/06/2026,TRANSFER TO SAVINGS,-200.00\n');
    const p = prepareImport(store, rows, mappingOf(rows), 'chk');
    expect(p.items[0]).toMatchObject({ matchId: 'mine' });
    expect(p.items[0].transfer).toBeUndefined();

    const solo = await freshStore();
    await solo.upsert('accounts', [{ id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 0, includeInSafeToSpend: true, archived: false }]);
    expect(prepareImport(solo, rows, mappingOf(rows), 'chk').items[0].transfer).toBeUndefined();
  });
});
