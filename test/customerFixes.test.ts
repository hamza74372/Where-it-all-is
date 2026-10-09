// Fixes from the one-month customer test (qa/customer-test/REPORT.md): bill "Mark paid" options and
// the cases the test didn't reach (late, autopay at a different amount, editing an amount), the card
// in guided setup, and the plain-words import summary.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import type { Bill, Transaction } from '../src/db/types';
import { nextUnpaid } from '../src/lib/bills';
import { detectMapping } from '../src/lib/csv/detect';
import { parseCsv } from '../src/lib/csv/parse';
import { accountBalance, computeSafeToSpend, isBillPaid } from '../src/lib/safeToSpend';
import { buildOnboarding, markBillPaid, markBillSkipped, saveWithUndo } from '../src/state/actions';
import { commitImport, countsOf, describeImport, prepareImport, undoImport } from '../src/state/importActions';
import { Store } from '../src/state/store';

const monthly = (anchorDate: string, dayOfMonth: number) => ({ kind: 'monthly' as const, anchorDate, dayOfMonth, weekendShift: 'none' as const });

async function storeWith(bills: Array<Partial<Bill> & { id: string; name: string; amount: number; day: number; anchor: string }>, opening = { balance: 150000, date: '2026-10-01' }) {
  const store = await Store.load(await DB.open('t-' + uid(), new IDBFactory()));
  await store.upsert('accounts', [
    { id: 'chk', name: 'Everyday', type: 'checking', openingBalance: opening.balance, openingDate: opening.date, includeInSafeToSpend: true, archived: false },
    { id: 'sav', name: 'Savings', type: 'savings', openingBalance: 50000, openingDate: opening.date, includeInSafeToSpend: false, archived: false },
  ]);
  await store.upsert('bills', bills.map(({ day, anchor, ...b }) => ({ accountId: 'chk', autopay: false, isDebtMinimum: false, active: true, schedule: monthly(anchor, day), ...b })));
  return store;
}
const bill = (store: Store, id: string) => store.data.bills.find((b) => b.id === id)!;
const balance = (store: Store, today: string) => accountBalance(store.data.accounts.find((a) => a.id === 'chk')!, store.data.transactions, today);
const sts = (store: Store, today: string) => computeSafeToSpend({ today, ...store.data, settings: { ...store.data.settings, buffer: 0 } });
const csv = (text: string) => parseCsv(text).rows;
const mappingFor = (rows: string[][]) => detectMapping(rows, 'MDY')!.mapping;

describe('Mark paid: in full, a different amount, or skip this time', () => {
  it('a different amount changes only this occurrence', async () => {
    const store = await storeWith([{ id: 'el', name: 'Electric', amount: 8000, day: 15, anchor: '2026-10-15' }]);
    await markBillPaid(store, bill(store, 'el'), '2026-10-15', '2026-10-15', 9240);
    expect(store.data.transactions.map((t) => t.amount)).toEqual([-9240]);
    expect(isBillPaid(bill(store, 'el'), '2026-10-15', store.data.transactions)).toBe(true);
    // Next month is back to the usual amount.
    expect(sts(store, '2026-11-02').billLines.find((l) => l.billId === 'el')?.amount).toBe(8000);
    expect(bill(store, 'el').amount).toBe(8000);
  });

  it('skip this time: settled with no money moved, the next due date comes up, undo puts it back', async () => {
    const store = await storeWith([{ id: 'gym', name: 'Gym', amount: 3500, day: 10, anchor: '2026-10-10' }]);
    const before = balance(store, '2026-10-12');
    const undo = await markBillSkipped(store, bill(store, 'gym'), '2026-10-10');
    expect(store.data.transactions).toHaveLength(0);
    expect(balance(store, '2026-10-12')).toBe(before);
    expect(isBillPaid(bill(store, 'gym'), '2026-10-10', store.data.transactions)).toBe(true);
    expect(nextUnpaid(bill(store, 'gym'), '2026-10-12', store.data.transactions)).toBe('2026-11-10');
    // Skipping on the day it's due also stops it being set aside today.
    const fresh = await storeWith([{ id: 'gym', name: 'Gym', amount: 3500, day: 10, anchor: '2026-10-10' }]);
    expect(sts(fresh, '2026-10-10').billLines.some((l) => l.billId === 'gym')).toBe(true);
    await markBillSkipped(fresh, bill(fresh, 'gym'), '2026-10-10');
    expect(sts(fresh, '2026-10-10').billLines.some((l) => l.billId === 'gym')).toBe(false);
    await undo();
    expect(nextUnpaid(bill(store, 'gym'), '2026-10-12', store.data.transactions)).toBe('2026-10-10');
  });

  it('paid late: recorded on the day it was paid, so the balance moves then (even if it was due before you started)', async () => {
    // Opening balance set on 5 Oct; the phone bill was due on the 3rd and is paid on the 8th.
    const store = await storeWith([{ id: 'ph', name: 'Phone', amount: 4500, day: 3, anchor: '2026-10-03' }], { balance: 120000, date: '2026-10-05' });
    expect(nextUnpaid(bill(store, 'ph'), '2026-10-08', store.data.transactions)).toBe('2026-10-03'); // overdue
    await markBillPaid(store, bill(store, 'ph'), '2026-10-03', '2026-10-08', 4500);
    expect(balance(store, '2026-10-08')).toBe(120000 - 4500);
    expect(store.data.transactions[0]).toMatchObject({ date: '2026-10-08', billDueDate: '2026-10-03' });
    expect(nextUnpaid(bill(store, 'ph'), '2026-10-08', store.data.transactions)).toBe('2026-11-03');
  });

  it('editing a bill amount applies going forward; past payments keep what was paid', async () => {
    const store = await storeWith([{ id: 'net', name: 'Internet', amount: 5500, day: 20, anchor: '2026-10-20' }]);
    await markBillPaid(store, bill(store, 'net'), '2026-10-20', '2026-10-20', 5500);
    await saveWithUndo(store, 'bills', { ...bill(store, 'net'), amount: 6200 });
    expect(store.data.transactions.map((t) => t.amount)).toEqual([-5500]);
    expect(sts(store, '2026-11-02').billLines.find((l) => l.billId === 'net')?.amount).toBe(6200);
  });
});

describe('an autopay bill the bank took at a different amount', () => {
  const FILE = 'Date,Description,Amount\n10/15/2026,ELECTRIC CO DIRECT DEBIT,-83.20\n';

  it('the bank row pays the bill at its real amount; nothing counted twice', async () => {
    const store = await storeWith([{ id: 'el', name: 'Electric', amount: 8000, day: 15, anchor: '2026-10-15', autopay: true }]);
    const rows = csv(FILE);
    const p = prepareImport(store, rows, mappingFor(rows), 'chk');
    expect(p.items[0].bill).toMatchObject({ billId: 'el', dueDate: '2026-10-15', name: 'Electric' });
    expect(countsOf(p)).toMatchObject({ newCount: 1, billCount: 1 });
    expect(describeImport(store, p)).toEqual(['1 matched to your Electric bill']);
    await commitImport(store, { fileName: 'oct.csv', accountId: 'chk', items: p.items });
    expect(store.data.transactions).toHaveLength(1);
    expect(store.data.transactions[0]).toMatchObject({ amount: -8320, billId: 'el', billDueDate: '2026-10-15' });
    expect(isBillPaid(bill(store, 'el'), '2026-10-15', store.data.transactions)).toBe(true);
    expect(balance(store, '2026-10-16')).toBe(150000 - 8320);
  });

  it('already marked paid at the bill amount: the bank row corrects it instead of adding again; undo restores', async () => {
    const store = await storeWith([{ id: 'el', name: 'Electric', amount: 8000, day: 15, anchor: '2026-10-15', autopay: true }]);
    await markBillPaid(store, bill(store, 'el'), '2026-10-15', '2026-10-15', 8000);
    const rows = csv(FILE);
    const p = prepareImport(store, rows, mappingFor(rows), 'chk');
    expect(p.items[0].bill).toMatchObject({ billId: 'el', adoptAmount: true });
    const { batch } = await commitImport(store, { fileName: 'oct.csv', accountId: 'chk', items: p.items });
    expect(store.data.transactions).toHaveLength(1); // the same payment, not a second one
    expect(store.data.transactions[0]).toMatchObject({ amount: -8320, amountBeforeImport: -8000, matchedBatchId: batch.id });
    expect(balance(store, '2026-10-16')).toBe(150000 - 8320);
    await undoImport(store, batch.id);
    expect(store.data.transactions[0].amount).toBe(-8000);
    expect(store.data.transactions[0].matchedBatchId).toBeUndefined();
  });

  it('an unrelated row with a similar amount is not taken for the bill', async () => {
    const store = await storeWith([{ id: 'el', name: 'Electric', amount: 8000, day: 15, anchor: '2026-10-15' }]);
    const rows = csv('Date,Description,Amount\n10/15/2026,GARDEN CENTRE,-79.99\n');
    expect(prepareImport(store, rows, mappingFor(rows), 'chk').items[0].bill).toBeUndefined();
  });
});

describe('the import summary in plain words', () => {
  it('says what happened to each row', async () => {
    const store = await storeWith([{ id: 'el', name: 'Electric', amount: 8000, day: 15, anchor: '2026-10-15' }]);
    // Three rows imported last week, a savings transfer logged by hand.
    await store.upsert('transactions', [
      ...(['10/02/2026,CORNER SHOP,-6.20', '10/03/2026,FUEL STATION,-40.00', '10/05/2026,PHARMACY,-9.80'].map((line, i) => {
        const [d, desc, a] = line.split(',');
        const [m, day, y] = d.split('/');
        return { id: `old${i}`, date: `${y}-${m}-${day}`, amount: Math.round(Number(a) * 100), accountId: 'chk', note: desc, importDescription: desc, source: 'import', importBatchId: 'b0', cleared: true } as Transaction;
      })),
      { id: 'tx-out', date: '2026-10-10', amount: -20000, accountId: 'chk', note: 'To savings', source: 'transfer', transferId: 'tr1', cleared: false, updatedAt: 0 },
      { id: 'tx-in', date: '2026-10-10', amount: 20000, accountId: 'sav', note: 'To savings', source: 'transfer', transferId: 'tr1', cleared: false, updatedAt: 0 },
    ]);
    await store.upsert('importBatches', [{ id: 'b0', fileName: 'week1.csv', importedAt: 0, rowCount: 3, accountId: 'chk' }]);
    const rows = csv(
      [
        'Date,Description,Amount',
        '10/02/2026,CORNER SHOP,-6.20',
        '10/03/2026,FUEL STATION,-40.00',
        '10/05/2026,PHARMACY,-9.80',
        '10/09/2026,BOOKSHOP,-12.99',
        '10/10/2026,TRANSFER TO SAVINGS,-200.00',
        '10/12/2026,GROCERY MARKET,-28.75',
        '10/15/2026,ELECTRIC CO,-80.00',
      ].join('\n'),
    );
    const p = prepareImport(store, rows, mappingFor(rows), 'chk');
    expect(describeImport(store, p)).toEqual(['2 imported', '1 linked to your Savings transfer', '1 matched to your Electric bill', '3 already imported']);
  });
});

describe('a credit card in guided setup', () => {
  const base = { name: '', currency: 'USD' as const, decimalSeparator: '.' as const, today: '2026-10-06', balance: 124000, pay: null, bills: [] };

  it('pay in full: a card account for what is owed, and a payment bill that follows the balance', () => {
    const built = buildOnboarding({ ...base, hasCard: 'yes', card: { name: 'Visa', owed: 32000, dueDay: 25, pay: 'full' } }, []);
    expect(built.card).toMatchObject({ name: 'Visa', type: 'credit', openingBalance: -32000, openingDate: '2026-10-06', includeInSafeToSpend: false });
    const payment = built.bills.find((b) => b.payToAccountId === built.card!.id)!;
    expect(payment).toMatchObject({ name: 'Visa payment', amountSource: 'cardBalance', accountId: built.account.id, schedule: { dayOfMonth: 25, anchorDate: '2026-10-25' } });
    // Safe to spend sets the card balance aside before the 25th.
    const s = computeSafeToSpend({ today: '2026-10-06', accounts: [built.account, built.card!], transactions: [], incomes: [], bills: built.bills, goals: [], settings: { buffer: 0, setAsideGoals: false } });
    expect(s.billLines).toEqual([expect.objectContaining({ name: 'Visa payment', amount: 32000 })]);
  });

  it('minimum: a fixed payment of the minimum', () => {
    const built = buildOnboarding({ ...base, card: { name: '', owed: 32000, dueDay: 12, pay: 'minimum', minimum: 2500 } }, []);
    expect(built.card!.name).toBe('Credit card');
    expect(built.bills[0]).toMatchObject({ name: 'Credit card payment', amountSource: 'fixed', amount: 2500 });
  });

  it('no card: nothing extra', () => {
    const built = buildOnboarding({ ...base, hasCard: 'no', card: null }, []);
    expect(built.card).toBeNull();
    expect(built.bills).toEqual([]);
  });
});
