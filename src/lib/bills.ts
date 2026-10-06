// Bill helpers for the Bills screen, Today's "Next 3 bills" and the calendar.

import type { Bill, Income, ISODate, Transaction } from '../db/types';
import { addDays, maxDate } from './dates';
import { divFloor, type Minor } from './money';
import { isBillPaid } from './safeToSpend';
import { occurrences } from './schedule';

/** How far back we look for missed bills (anything older is surely sorted already). */
const OVERDUE_LOOKBACK_DAYS = 45;

export interface DueItem {
  bill: Bill;
  date: ISODate;
  paid: boolean;
}

/** Unpaid occurrences before today (since the bill started, within the lookback). */
export function overdueOccurrences(bill: Bill, today: ISODate, transactions: Transaction[]): ISODate[] {
  if (!bill.active) return [];
  const from = maxDate(bill.schedule.anchorDate, addDays(today, -OVERDUE_LOOKBACK_DAYS));
  return occurrences(bill.schedule, from, addDays(today, -1)).filter((d) => !isBillPaid(bill, d, transactions));
}

/** The occurrence "Mark paid" should cover: the oldest unpaid one, overdue first, else the next due. */
export function nextUnpaid(bill: Bill, today: ISODate, transactions: Transaction[]): ISODate | null {
  const overdue = overdueOccurrences(bill, today, transactions);
  if (overdue.length) return overdue[0];
  const ahead = occurrences(bill.schedule, today, addDays(today, 400));
  return ahead.find((d) => !isBillPaid(bill, d, transactions)) ?? null;
}

/** All bill occurrences in [from, to], with paid status, sorted by date then name. */
export function billsBetween(bills: Bill[], from: ISODate, to: ISODate, transactions: Transaction[]): DueItem[] {
  const out: DueItem[] = [];
  for (const bill of bills) {
    if (!bill.active) continue;
    for (const date of occurrences(bill.schedule, from, to)) {
      out.push({ bill, date, paid: isBillPaid(bill, date, transactions) });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.bill.name.localeCompare(b.bill.name)));
}

/** The next `count` different bills that are still to pay, soonest first (Today screen card). */
export function nextBills(bills: Bill[], today: ISODate, transactions: Transaction[], count = 3): DueItem[] {
  const seen = new Set<string>();
  return billsBetween(bills, today, addDays(today, 400), transactions)
    .filter((i) => !i.paid && !seen.has(i.bill.id) && seen.add(i.bill.id))
    .slice(0, count);
}

export function paydaysBetween(incomes: Income[], from: ISODate, to: ISODate): Array<{ income: Income; date: ISODate }> {
  return incomes
    .filter((i) => i.active)
    .flatMap((income) => occurrences(income.schedule, from, to).map((date) => ({ income, date })))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * "Big yearly bills" helper: what to put aside each month so bills that come
 * less often than monthly are covered. Rounded up to whole minor units.
 */
export function monthlySetAside(bill: Bill): Minor {
  const s = bill.schedule;
  const months = s.kind === 'yearly' ? 12 : s.kind === 'everyNMonths' ? Math.max(1, s.n ?? 1) : 0;
  if (months <= 1) return 0;
  return -divFloor(-bill.amount, months); // ceil for positive amounts
}
