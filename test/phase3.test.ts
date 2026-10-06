import { describe, expect, it } from 'vitest';
import type { Bill, Category, Debt, EnvelopeMove, Goal, Income, Schedule, Transaction } from '../src/db/types';
import { catchUp } from '../src/lib/away';
import { effectiveLimit, envelopeRows, levelFor, moveSuggestions, spentByCategory } from '../src/lib/envelopes';
import { compareMonths, milestones, previousMonth, topPlaces } from '../src/lib/insights';

const cat = (id: string, monthlyLimit?: number): Category => ({ id, name: id, emoji: '•', color: '#ccc', order: 0, archived: false, monthlyLimit, updatedAt: 0 });
let n = 0;
const tx = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, date, amount, accountId: 'chk', note: '', source: 'manual', cleared: false, updatedAt: 0, ...extra,
});
const move = (from: string, to: string, amount: number, month = '2026-10'): EnvelopeMove => ({ id: `m${n++}`, month, fromCategoryId: from, toCategoryId: to, amount, updatedAt: 0 });
const sched = (kind: Schedule['kind'], anchorDate: string): Schedule => ({ kind, anchorDate, weekendShift: 'none' });

describe('envelopes', () => {
  const txs = [
    tx('2026-10-02', -3000, { categoryId: 'groc' }),
    tx('2026-10-05', -2500, { categoryId: 'groc' }),
    tx('2026-10-06', 500, { categoryId: 'groc' }), // refund
    tx('2026-09-30', -9999, { categoryId: 'groc' }), // last month
    tx('2026-10-03', -1000, { categoryId: 'fun' }),
    tx('2026-10-03', -5000, { categoryId: 'groc', source: 'transfer' }), // ignored
    tx('2026-10-04', -95000, { categoryId: 'home', source: 'bill' }), // bills count
  ];

  it('spent per category this month, net of refunds, ignoring transfers', () => {
    const s = spentByCategory(txs, '2026-10');
    expect(s.get('groc')).toBe(5000);
    expect(s.get('fun')).toBe(1000);
    expect(s.get('home')).toBe(95000);
  });

  it('moves adjust this month only', () => {
    const moves = [move('fun', 'groc', 1200), move('fun', 'groc', 999, '2026-09')];
    expect(effectiveLimit(cat('groc', 4000), moves, '2026-10')).toBe(5200);
    expect(effectiveLimit(cat('fun', 5000), moves, '2026-10')).toBe(3800);
  });

  it('levels: green under 75%, amber to 100%, coral over', () => {
    expect(levelFor(7499, 10000)).toBe('ok');
    expect(levelFor(7500, 10000)).toBe('near');
    expect(levelFor(10000, 10000)).toBe('near');
    expect(levelFor(10001, 10000)).toBe('over');
    expect(levelFor(1, 0)).toBe('over');
  });

  it('rows only for envelopes with a limit; suggestion covers overspend from the roomiest', () => {
    const cats = [cat('groc', 4000), cat('fun', 5000), cat('home'), cat('gifts', 2000)];
    const rows = envelopeRows(cats, txs, [], '2026-10');
    expect(rows.map((r) => r.category.id)).toEqual(['groc', 'fun', 'gifts']);
    const groc = rows.find((r) => r.category.id === 'groc')!;
    expect(groc).toMatchObject({ spent: 5000, remaining: -1000, level: 'over' });
    const [s] = moveSuggestions(rows);
    expect(s.from.category.id).toBe('fun'); // 4,000 left vs gifts 2,000
    expect(s.amount).toBe(1000);
  });

  it('never suggests more than the source has', () => {
    const rows = envelopeRows([cat('groc', 1000), cat('fun', 300)], [tx('2026-10-02', -5000, { categoryId: 'groc' })], [], '2026-10');
    expect(moveSuggestions(rows)[0].amount).toBe(300);
  });
});

describe('insights', () => {
  const cats = [cat('groc'), cat('fun')];
  const txs = [
    tx('2026-10-02', -3000, { categoryId: 'groc', note: 'Tesco' }),
    tx('2026-10-09', -2000, { categoryId: 'groc', note: 'tesco ' }),
    tx('2026-09-12', -4000, { categoryId: 'groc', note: 'Tesco' }),
    tx('2026-10-03', -1500, { categoryId: 'fun', note: 'Cinema' }),
    tx('2026-10-04', -700, { note: 'Coffee' }),
    tx('2026-10-05', -9000, { source: 'transfer', note: 'Card payment' }),
  ];

  it('previousMonth wraps the year', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('this month vs last by category, plus uncategorised', () => {
    expect(compareMonths(txs, cats, '2026-10').map((r) => [r.name, r.thisMonth, r.lastMonth])).toEqual([
      ['groc', 5000, 4000],
      ['fun', 1500, 0],
      ['No category', 700, 0],
    ]);
  });

  it('top places group by note, ignore transfers', () => {
    expect(topPlaces(txs, '2026-10')).toEqual([
      { label: 'tesco', total: 5000, times: 2 },
      { label: 'Cinema', total: 1500, times: 1 },
      { label: 'Coffee', total: 700, times: 1 },
    ]);
  });

  it('milestones: first finished month in the black, debts paid, goals reached', () => {
    const history = [
      tx('2026-08-01', 100000, { source: 'income' }),
      tx('2026-08-10', -120000),
      tx('2026-09-01', 100000, { source: 'income' }),
      tx('2026-09-10', -60000),
      tx('2026-10-01', 500000, { source: 'income' }), // current month: not finished
    ];
    const debts: Debt[] = [{ id: 'd', name: 'Store card', balance: 0, apr: 20, minPayment: 0, createdAt: 0, updatedAt: 0 }];
    const goals: Goal[] = [{ id: 'g', name: 'Trip', target: 50000, saved: 50000, emoji: '✈️', updatedAt: 0 }];
    expect(milestones(history, debts, goals, '2026-10-06')).toEqual([
      { kind: 'inTheBlack', month: '2026-09' },
      { kind: 'debtPaid', name: 'Store card' },
      { kind: 'goalReached', name: 'Trip' },
    ]);
  });
});

describe('while you were away', () => {
  const rent: Bill = { id: 'rent', name: 'Rent', amount: 95000, accountId: 'chk', schedule: sched('monthly', '2026-01-01'), autopay: true, isDebtMinimum: false, active: true, updatedAt: 0 };
  const pay: Income = { id: 'pay', name: 'Pay', amount: 185000, accountId: 'chk', schedule: sched('biweekly', '2026-09-25'), variable: false, active: true, updatedAt: 0 };
  const opened = (y: number, m: number, d: number) => new Date(y, m - 1, d, 20, 0).getTime();

  it('nothing after a short gap or on first run', () => {
    expect(catchUp(null, '2026-10-06', [rent], [pay], [])).toBeNull();
    expect(catchUp(opened(2026, 10, 4), '2026-10-06', [rent], [pay], [])).toBeNull();
  });

  it('lists bills and paydays that passed since the last visit', () => {
    // Last opened 28 Sep; rent due 1 Oct, pay 25 Sep (before) and 9 Oct (after today) → only rent.
    const r = catchUp(opened(2026, 9, 28), '2026-10-06', [rent], [pay], [])!;
    expect(r.since).toBe('2026-09-28');
    expect(r.bills.map((b) => b.date)).toEqual(['2026-10-01']);
    expect(r.paydays).toEqual([]);
  });

  it('includes unconfirmed paydays, skips confirmed ones and paid bills', () => {
    const r = catchUp(opened(2026, 9, 20), '2026-10-12', [rent], [pay], [
      tx('2026-10-01', -95000, { source: 'bill', billId: 'rent', billDueDate: '2026-10-01' }),
      tx('2026-09-25', 185000, { source: 'income', incomeId: 'pay', incomeDate: '2026-09-25' }),
    ])!;
    expect(r.bills).toEqual([]);
    expect(r.paydays.map((p) => p.date)).toEqual(['2026-10-09']);
  });
});
