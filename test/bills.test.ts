import { describe, expect, it } from 'vitest';
import type { Bill, Income, Schedule, Transaction } from '../src/db/types';
import { nextDayOfMonth } from '../src/data/defaults';
import { billsBetween, monthlySetAside, nextBills, nextUnpaid, overdueOccurrences, paydaysBetween } from '../src/lib/bills';

const sched = (kind: Schedule['kind'], anchorDate: string, extra: Partial<Schedule> = {}): Schedule => ({
  kind, anchorDate, weekendShift: 'none', ...extra,
});
const bill = (id: string, amount: number, schedule: Schedule, extra: Partial<Bill> = {}): Bill => ({
  id, name: id, amount, accountId: 'chk', schedule, autopay: false, isDebtMinimum: false, active: true, updatedAt: 0, ...extra,
});
const paid = (billId: string, due: string): Transaction => ({
  id: `${billId}-${due}`, date: due, amount: -1, accountId: 'chk', note: '', source: 'bill', billId, billDueDate: due,
  cleared: true, updatedAt: 0,
});

const TODAY = '2026-10-06';

describe('bills helpers', () => {
  const rent = bill('rent', 95000, sched('monthly', '2026-08-01'));

  it('overdue: unpaid past occurrences since the bill started', () => {
    expect(overdueOccurrences(rent, TODAY, [paid('rent', '2026-08-01')])).toEqual(['2026-09-01', '2026-10-01']);
    expect(overdueOccurrences(rent, TODAY, [paid('rent', '2026-09-01'), paid('rent', '2026-10-01')])).toEqual([]);
  });

  it('nextUnpaid prefers the oldest overdue, else the next due', () => {
    expect(nextUnpaid(rent, TODAY, [paid('rent', '2026-08-01')])).toBe('2026-09-01');
    const all = [paid('rent', '2026-08-01'), paid('rent', '2026-09-01'), paid('rent', '2026-10-01')];
    expect(nextUnpaid(rent, TODAY, all)).toBe('2026-11-01');
  });

  it('a bill starting in the future has nothing overdue', () => {
    expect(overdueOccurrences(bill('new', 1, sched('monthly', '2026-10-20')), TODAY, [])).toEqual([]);
  });

  it('billsBetween and nextBills', () => {
    const phone = bill('phone', 4500, sched('monthly', '2026-10-12'));
    const net = bill('net', 5500, sched('monthly', '2026-10-06'));
    const items = billsBetween([phone, net], '2026-10-01', '2026-10-31', [paid('net', '2026-10-06')]);
    expect(items.map((i) => [i.bill.id, i.date, i.paid])).toEqual([
      ['net', '2026-10-06', true],
      ['phone', '2026-10-12', false],
    ]);
    expect(nextBills([phone, net], TODAY, [paid('net', '2026-10-06')], 2).map((i) => i.date)).toEqual([
      '2026-10-12', '2026-11-06',
    ]);
  });

  it('nextBills lists different bills, not repeats of one', () => {
    const weekly = bill('gym', 1000, sched('weekly', '2026-10-07'));
    const phone = bill('phone', 4500, sched('monthly', '2026-10-30'));
    expect(nextBills([weekly, phone], TODAY, [], 3).map((i) => [i.bill.id, i.date])).toEqual([
      ['gym', '2026-10-07'],
      ['phone', '2026-10-30'],
    ]);
  });

  it('paydaysBetween', () => {
    const pay: Income = {
      id: 'p', name: 'Pay', amount: 1, accountId: 'chk', variable: false, active: true, updatedAt: 0,
      schedule: sched('biweekly', '2026-10-09'),
    };
    expect(paydaysBetween([pay], '2026-10-01', '2026-10-31').map((p) => p.date)).toEqual(['2026-10-09', '2026-10-23']);
  });

  it('monthly set-aside for big yearly bills', () => {
    expect(monthlySetAside(bill('car tax', 18000, sched('yearly', '2027-03-01')))).toBe(1500);
    expect(monthlySetAside(bill('water', 10001, sched('everyNMonths', '2026-12-01', { n: 3 })))).toBe(3334);
    expect(monthlySetAside(rent)).toBe(0);
  });

  it('nextDayOfMonth clamps and rolls over', () => {
    expect(nextDayOfMonth('2026-10-06', 12)).toBe('2026-10-12');
    expect(nextDayOfMonth('2026-10-06', 1)).toBe('2026-11-01');
    expect(nextDayOfMonth('2026-10-06', 6)).toBe('2026-10-06');
    expect(nextDayOfMonth('2026-02-10', 31)).toBe('2026-02-28');
  });
});
