// "While you were away" (spec §3.5): after a gap of more than 2 days, list the bills and
// paydays that passed so they can be confirmed in one tap. No judgement, just catch-up.

import type { Bill, Income, ISODate, Transaction } from '../db/types';
import { addDays, daysBetween, maxDate, todayISO } from './dates';
import { isBillPaid } from './safeToSpend';
import { occurrences } from './schedule';

const GAP_DAYS = 2;
const LOOKBACK_DAYS = 45;

export interface CatchUp {
  since: ISODate;
  bills: Array<{ bill: Bill; date: ISODate }>;
  paydays: Array<{ income: Income; date: ISODate }>;
}

export function catchUp(
  previousOpenedAt: number | null,
  today: ISODate,
  bills: Bill[],
  incomes: Income[],
  transactions: Transaction[],
): CatchUp | null {
  if (previousOpenedAt == null) return null;
  const since = todayISO(new Date(previousOpenedAt));
  if (daysBetween(since, today) <= GAP_DAYS) return null;
  const from = maxDate(since, addDays(today, -LOOKBACK_DAYS));
  const to = addDays(today, -1);

  const billItems = bills
    .filter((b) => b.active)
    .flatMap((bill) => occurrences(bill.schedule, from, to).filter((d) => !isBillPaid(bill, d, transactions)).map((date) => ({ bill, date })));
  const payItems = incomes
    .filter((i) => i.active)
    .flatMap((income) =>
      occurrences(income.schedule, from, to)
        .filter((d) => !transactions.some((t) => t.incomeId === income.id && t.incomeDate === d))
        .map((date) => ({ income, date })),
    );
  const byDate = <T extends { date: ISODate }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return { since, bills: billItems.sort(byDate), paydays: payItems.sort(byDate) };
}
