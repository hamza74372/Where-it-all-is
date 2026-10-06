// Safe to Spend — SPEC §6. Pure function: same inputs, same answer, every line explainable.
//
// Period = today → the day before the next payday.
//
//   available        = balances of accounts marked "include in safe to spend"
//   upcomingBills    = unpaid bill occurrences due today … day before next payday
//   goalSetAside     = one planned contribution per goal (if the user turned this on)
//   buffer           = user cushion
//   startOfDay       = available + spentToday − upcomingBills − goalSetAside − buffer
//   dailyAllowance   = floor(startOfDay / daysLeft)
//   safeToSpendToday = dailyAllowance − spentToday
//   safeToSpendPeriod= startOfDay − spentToday   (what's left for the rest of the period)
//
// Decisions where the spec left room (kept conservative):
//  • Payday today: the period runs to the *following* payday. Pay only counts once it's
//    in a balance (confirmed/imported), so an unconfirmed payday never inflates the number.
//  • Bills due *today* and not yet paid are reserved (they're still coming out).
//    Bills due *on* the next payday are not — the new pay covers them.
//  • spentToday is added back before dividing, so today's spending isn't counted twice
//    (it is already inside the balance) and the daily allowance stays stable all day.
//  • Credit cards: a card excluded from safe-to-spend never touches `available`; its
//    unpaid charges show as "card to pay". Its payment bill is reserved like any bill, and
//    paying it is a transfer (bank −X, card +X), so nothing is counted twice.
//    A card *included* in safe-to-spend (pay-in-full users) reduces `available` as you spend,
//    so bills that pay it are not reserved again.

import type { Account, Bill, Goal, ISODate, Id, Income, Settings, Transaction } from '../db/types';
import { addDays, daysBetween, startOfNextMonth } from './dates';
import { divFloor, sum, type Minor } from './money';
import { nextOccurrence, occurrences } from './schedule';

export interface SafeToSpendInput {
  today: ISODate;
  accounts: Account[];
  transactions: Transaction[];
  incomes: Income[];
  bills: Bill[];
  goals: Goal[];
  settings: Pick<Settings, 'buffer' | 'setAsideGoals'>;
}

export interface BillLine {
  billId: Id;
  name: string;
  date: ISODate;
  amount: Minor;
}

export interface GoalLine {
  goalId: Id;
  name: string;
  amount: Minor;
}

export interface SafeToSpendResult {
  today: ISODate;
  /** First day of the next period (the next payday, or the 1st of next month). */
  nextPayday: ISODate;
  nextPaydaySource: 'income' | 'monthEnd';
  daysLeft: number;
  accountLines: Array<{ accountId: Id; name: string; balance: Minor }>;
  available: Minor;
  billLines: BillLine[];
  upcomingBills: Minor;
  goalLines: GoalLine[];
  goalSetAside: Minor;
  buffer: Minor;
  spentToday: Minor;
  startOfDay: Minor;
  dailyAllowance: Minor;
  safeToSpendToday: Minor;
  safeToSpendPeriod: Minor;
  /** Positive amount short for the period, when tight; otherwise 0. */
  shortfall: Minor;
  status: 'ok' | 'tight';
  cardsToPay: Array<{ accountId: Id; name: string; amount: Minor }>;
}

/** Balance as of the end of `asOf` (future-dated transactions are ignored). */
export function accountBalance(account: Account, transactions: Transaction[], asOf: ISODate): Minor {
  return (
    account.openingBalance +
    sum(transactions.filter((t) => t.accountId === account.id && t.date <= asOf).map((t) => t.amount))
  );
}

/** True when a payment for this bill's occurrence on `dueDate` has been recorded. */
export function isBillPaid(bill: Bill, dueDate: ISODate, transactions: Transaction[]): boolean {
  return transactions.some((t) => t.billId === bill.id && t.billDueDate === dueDate);
}

/** Earliest payday strictly after `today` across active incomes, or null if none. */
export function nextPaydayAfter(today: ISODate, incomes: Income[]): ISODate | null {
  let best: ISODate | null = null;
  for (const inc of incomes) {
    if (!inc.active) continue;
    const d = nextOccurrence(inc.schedule, addDays(today, 1));
    if (d && (!best || d < best)) best = d;
  }
  return best;
}

/** Spending that counts against today's allowance (not bills, transfers or income). */
function isDiscretionaryOutflow(t: Transaction): boolean {
  return t.amount < 0 && (t.source === 'manual' || t.source === 'import');
}

export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const { today, accounts, transactions, incomes, bills, goals, settings } = input;

  const payday = nextPaydayAfter(today, incomes);
  const nextPayday = payday ?? startOfNextMonth(today);
  const lastDay = addDays(nextPayday, -1);
  const daysLeft = Math.max(1, daysBetween(today, nextPayday));

  const included = accounts.filter((a) => !a.archived && a.includeInSafeToSpend);
  const includedIds = new Set(included.map((a) => a.id));

  const accountLines = included.map((a) => ({
    accountId: a.id,
    name: a.name,
    balance: accountBalance(a, transactions, today),
  }));
  const available = sum(accountLines.map((l) => l.balance));

  // Bills that pay an included card are already reflected in `available` as you spend.
  const billLines: BillLine[] = [];
  for (const bill of bills) {
    if (!bill.active) continue;
    if (bill.payToAccountId && includedIds.has(bill.payToAccountId)) continue;
    if (!includedIds.has(bill.accountId)) continue; // paid from money outside safe-to-spend
    for (const date of occurrences(bill.schedule, today, lastDay)) {
      if (!isBillPaid(bill, date, transactions)) {
        billLines.push({ billId: bill.id, name: bill.name, date, amount: bill.amount });
      }
    }
  }
  billLines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
  const upcomingBills = sum(billLines.map((l) => l.amount));

  const goalLines: GoalLine[] = settings.setAsideGoals
    ? goals.flatMap((g) => {
        const amount = goalContributionPerPayday(g, today, incomes);
        return amount > 0 ? [{ goalId: g.id, name: g.name, amount }] : [];
      })
    : [];
  const goalSetAside = sum(goalLines.map((l) => l.amount));

  const spentToday = sum(
    transactions
      .filter((t) => t.date === today && includedIds.has(t.accountId) && isDiscretionaryOutflow(t))
      .map((t) => -t.amount),
  );

  const buffer = Math.max(0, settings.buffer);
  const startOfDay = available + spentToday - upcomingBills - goalSetAside - buffer;
  const dailyAllowance = divFloor(startOfDay, daysLeft);
  const safeToSpendToday = dailyAllowance - spentToday;
  const safeToSpendPeriod = startOfDay - spentToday;

  const cardsToPay = accounts
    .filter((a) => !a.archived && a.type === 'credit' && !a.includeInSafeToSpend)
    .map((a) => ({ accountId: a.id, name: a.name, amount: Math.max(0, -accountBalance(a, transactions, today)) }))
    .filter((c) => c.amount > 0);

  return {
    today,
    nextPayday,
    nextPaydaySource: payday ? 'income' : 'monthEnd',
    daysLeft,
    accountLines,
    available,
    billLines,
    upcomingBills,
    goalLines,
    goalSetAside,
    buffer,
    spentToday,
    startOfDay,
    dailyAllowance,
    safeToSpendToday,
    safeToSpendPeriod,
    shortfall: safeToSpendPeriod < 0 ? -safeToSpendPeriod : 0,
    status: safeToSpendPeriod < 0 ? 'tight' : 'ok',
    cardsToPay,
  };
}

/**
 * What to put toward a goal each payday to reach it by its target date:
 * remaining ÷ paydays left (today excluded, target date included), rounded up.
 * No target date, already reached, or date passed → 0 (nothing reserved).
 */
export function goalContributionPerPayday(goal: Goal, today: ISODate, incomes: Income[]): Minor {
  const remaining = goal.target - goal.saved;
  if (remaining <= 0 || !goal.targetDate || goal.targetDate <= today) return 0;
  const paydays = new Set<ISODate>();
  for (const inc of incomes) {
    if (!inc.active) continue;
    for (const d of occurrences(inc.schedule, addDays(today, 1), goal.targetDate)) paydays.add(d);
  }
  const count = Math.max(1, paydays.size);
  return Math.ceil(remaining / count);
}
