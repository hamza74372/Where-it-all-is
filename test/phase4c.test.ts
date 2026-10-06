// Phase 4c: opening-balance date, future-dated rows, big balance gaps.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import type { Account, Transaction } from '../src/db/types';
import { detectMapping } from '../src/lib/csv/detect';
import { parseCsv } from '../src/lib/csv/parse';
import { compareMonths } from '../src/lib/insights';
import { accountBalance, computeSafeToSpend, isBeforeStart } from '../src/lib/safeToSpend';
import { anchorBalance, completeOnboarding } from '../src/state/actions';
import { bankStyleBalance, commitImport, importNotes, isBigGap, prepareImport } from '../src/state/importActions';
import { Store } from '../src/state/store';

const acct = (extra: Partial<Account> = {}): Account => ({
  id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 120000, includeInSafeToSpend: true, archived: false, updatedAt: 0, ...extra,
});
const tx = (date: string, amount: number): Transaction => ({ id: date + amount, date, amount, accountId: 'chk', note: '', source: 'import', cleared: true, updatedAt: 0 });

// A statement covering 1–12 Oct. The 1,200 opening balance was entered on 6 Oct.
const STATEMENT = [
  'Date,Description,Amount',
  '10/01/2026,STARBUCKS STORE 12345,-5.75',
  '10/03/2026,WHOLE FOODS MARKET,-86.42',
  '10/05/2026,ACME CORP PAYROLL,1850.00',
  '10/05/2026,LANDLORD LTD RENT,-950.00',
  '10/06/2026,NETFLIX.COM,-15.49',
  '10/09/2026,SHELL OIL,-41.30',
  '10/12/2026,CHECK 1043,-120.00',
].join('\n');

async function storeWithAccount(account: Partial<Account> = {}) {
  const store = await Store.load(await DB.open('t-' + uid(), new IDBFactory()));
  await store.upsert('accounts', [acct(account)]);
  return store;
}

describe('opening-balance date', () => {
  it('rows before the opening date are kept but don’t move the balance', () => {
    const a = acct({ openingDate: '2026-10-06' });
    const txs = [tx('2026-10-05', 185000), tx('2026-10-05', -95000), tx('2026-10-06', -1549), tx('2026-10-09', -4130)];
    expect(accountBalance(a, txs, '2026-10-12')).toBe(120000 - 1549 - 4130);
    expect(isBeforeStart(a, txs[0])).toBe(true);
    expect(isBeforeStart(a, txs[2])).toBe(false); // the opening day itself counts
    // Without an opening date (older data), every row counts — unchanged behaviour.
    expect(accountBalance(acct(), txs, '2026-10-12')).toBe(120000 + 185000 - 95000 - 1549 - 4130);
  });

  it('opening balance 1,200 on Oct 6, import Oct 1–12: only the Oct 6–12 rows move the balance', async () => {
    const store = await storeWithAccount({ openingDate: '2026-10-06' });
    const rows = parseCsv(STATEMENT).rows;
    const p = prepareImport(store, rows, detectMapping(rows, 'MDY')!.mapping, 'chk');
    const account = store.data.accounts[0];
    expect(importNotes(p, account, '2026-10-12')).toEqual({ beforeStart: 4, future: 0 });

    await commitImport(store, { fileName: 's.csv', accountId: 'chk', items: p.items });
    expect(store.data.transactions).toHaveLength(7); // all kept for history
    // 1,200 − 15.49 − 41.30 − 120.00 = 1,023.21. The +1,850 payroll on Oct 5 is not added again.
    expect(bankStyleBalance(store, 'chk', '2026-10-12')).toBe(102321);
    const sts = computeSafeToSpend({
      today: '2026-10-12', accounts: store.data.accounts, transactions: store.data.transactions, incomes: [], bills: [], goals: [],
      settings: { buffer: 0, setAsideGoals: false },
    });
    expect(sts.available).toBe(102321);
    // …but they still count in Insights.
    const oct = compareMonths(store.data.transactions, store.data.categories, '2026-10');
    const total = oct.reduce((s, r) => s + r.thisMonth, 0);
    expect(total).toBe(575 + 8642 + 95000 + 1549 + 4130 + 12000);
  });

  it('onboarding stamps the opening date; editing the balance re-anchors it to today', async () => {
    const store = await Store.load(await DB.open('t-' + uid(), new IDBFactory()));
    await completeOnboarding(store, { name: '', currency: 'USD', decimalSeparator: '.', balance: 120000, pay: null, bills: [], today: '2026-10-06' });
    const main = store.data.accounts[0];
    expect(main).toMatchObject({ openingBalance: 120000, openingDate: '2026-10-06' });

    await store.upsert('transactions', [{ ...tx('2026-10-08', -2000), accountId: main.id, source: 'manual' }, { ...tx('2026-10-20', -500), accountId: main.id, source: 'manual' }]);
    // On Oct 20 the user says "my balance is 1,100 right now" (that already includes today's 5.00).
    const anchor = anchorBalance(main, 110000, store, '2026-10-20');
    expect(anchor).toEqual({ openingBalance: 110500, openingDate: '2026-10-20' });
    expect(accountBalance({ ...main, ...anchor }, store.data.transactions, '2026-10-20')).toBe(110000);
  });
});

describe('future-dated rows', () => {
  it('counts rows dated after today', async () => {
    const store = await storeWithAccount();
    const rows = parseCsv(STATEMENT).rows;
    const p = prepareImport(store, rows, detectMapping(rows, 'MDY')!.mapping, 'chk');
    expect(importNotes(p, store.data.accounts[0], '2026-10-06').future).toBe(2); // Oct 9 and Oct 12
  });

  it('day and month read the wrong way round shows up as future dates', async () => {
    const store = await storeWithAccount();
    const uk = 'Date,Description,Amount\n03/10/2026,COFFEE,-3.00\n04/10/2026,LUNCH,-9.00\n05/10/2026,SHOP,-20.00\n';
    const rows = parseCsv(uk).rows;
    const right = detectMapping(rows, 'MDY')!.mapping; // the date spread picks day-first: 3–5 Oct
    expect(importNotes(prepareImport(store, rows, right, 'chk'), undefined, '2026-10-16').future).toBe(0);
    // Read month-first instead, the rows become 10 Mar, 10 Apr and 10 May. Imported on 15 Apr,
    // the May row is "in the future" — the flag that tells the user the format is wrong.
    const wrong = { ...right, dateFormat: 'MDY' as const };
    const notes = importNotes(prepareImport(store, rows, wrong, 'chk'), undefined, '2026-04-15');
    expect(notes.future).toBe(1);
  });
});

describe('big balance gaps', () => {
  it('a gap bigger than any single imported transaction is "big"', () => {
    const amounts = [-575, -8642, 185000, -95000, -12000];
    expect(isBigGap(-5000, amounts)).toBe(false); // 50.00: a pending payment, say
    expect(isBigGap(185000, amounts)).toBe(false); // exactly the biggest row: not bigger
    expect(isBigGap(-185001, amounts)).toBe(true);
    expect(isBigGap(-88064, [-575, -8642, -1820])).toBe(true); // screenshot 09's gap vs that import
    expect(isBigGap(0, amounts)).toBe(false);
    expect(isBigGap(-100, [])).toBe(true); // nothing imported: any gap can't be explained by it
  });
});
