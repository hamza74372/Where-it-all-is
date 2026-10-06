// Safe to Spend — SPEC §6. Pure function: same inputs, same answer, every line explainable.
//
// Period = today → the day before the next payday.
//
//   available        = balances of accounts marked "include in safe to spend"
//   upcomingBills    = unpaid bill occurrences due today … day before next payday
//   lookAheadSetAside= max(0, next period's bills − pay expected on the next payday)
//   goalSetAside     = one planned contribution per goal (if the user turned this on)
//   buffer           = user cushion
//   startOfDay       = available + spentToday − upcomingBills − lookAheadSetAside − goalSetAside − buffer
//   dailyAllowance   = floor(startOfDay / daysLeft)
//   safeToSpendToday = dailyAllowance − spentToday
//   safeToSpendPeriod= startOfDay − spentToday   (what's left for the rest of the period)
//
// Rules (confirmed with the owner, 6 Oct 2026):
//  • Payday today: the period runs to the *following* payday. Pay only counts once it's
//    in a balance (confirmed/imported), so an unconfirmed payday never inflates the number.
//    `unconfirmedPaydaysToday` lists pay due today with no recorded income, for the
//    "Payday — confirm your pay" card.
//  • Bills due *today* and not yet paid are always reserved — even when today is payday,
//    because today's bills come out of the new period's money.
//  • Bills due *on* the next payday are not reserved — the new pay covers them — unless
//    the user turns on `billsBeforePayOnPayday` ("Some bills come out before my pay
//    arrives on payday"). Month-end periods with no income have no payday, so the
//    setting doesn't apply there.
//  • Look-ahead: if the bills due in the *next* pay period add up to more than the pay
//    expected on the next payday, the difference is set aside now, so today's money isn't
//    spent on what next period's rent will need. One period ahead; no income → no look-ahead.
//  • spentToday is added back before dividing, so today's spending isn't counted twice
//    (it is already inside the balance) and the daily allowance stays stable all day.
//  • Credit cards: a card excluded from safe-to-spend never touches `available`; its
//    unpaid charges show as "card to pay". Its payment bill reserves the current card-to-pay
//    balance (or a fixed amount if the user set `amountSource: 'fixed'`), once per period.
//    Paying it is a transfer (bank −X, card +X), so nothing is counted twice.
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
  settings: Pick<Settings, 'buffer' | 'setAsideGoals'> & Partial<Pick<Settings, 'billsBeforePayOnPayday'>>;
}

export interface BillLine {
  billId: Id;
  name: string;
  date: ISODate;
  amount: Minor;
  /** 'cardBalance' = amount is what's currently owed on the card, not the bill's set amount. */
  amountSource: 'fixed' | 'cardBalance';
}

export interface LookAhead {
  /** The next pay period: next payday … day before the payday after it. */
  periodStart: ISODate;
  periodEnd: ISODate;
  billLines: BillLine[];
  billsTotal: Minor;
  /** Pay due on the next payday (average for pay that varies). */
  expectedPay: Minor;
  /** max(0, billsTotal − expectedPay). */
  setAside: Minor;
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
  /** Next pay period's bills vs the pay expected on the next payday (null without a following payday). */
  lookAhead: LookAhead | null;
  /** Shortfall for the next period, set aside from today's money. */
  lookAheadSetAside: Minor;
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
  /** Pay due today with no income recorded for it yet — drives the "confirm your pay" card. */
  unconfirmedPaydaysToday: Array<{ incomeId: Id; name: string; amount: Minor }>;
}

/** Incomes due on `day` that have no income transaction recorded for that date. */
export function unconfirmedPaydays(
  day: ISODate,
  incomes: Income[],
  transactions: Transaction[],
): Array<{ incomeId: Id; name: string; amount: Minor }> {
  return incomes
    .filter((inc) => inc.active && occurrences(inc.schedule, day, day).length > 0)
    .filter((inc) => !transactions.some((t) => t.incomeId === inc.id && t.incomeDate === day))
    .map((inc) => ({ incomeId: inc.id, name: inc.name, amount: inc.amount }));
}

/** Balance as of the end of `asOf` (future-dated transactions are ignored). */
export function accountBalance(account: Account, transactions: Transaction[], asOf: ISODate): Minor {
  return (
    account.openingBalance +
    sum(transactions.filter((t) => t.accountId === account.id && t.date <= asOf && !isBeforeStart(account, t)).map((t) => t.amount))
  );
}

/**
 * True for a transaction dated before the account's opening-balance date: it's already inside
 * that balance, so it's kept for history and Insights but doesn't move the balance again.
 */
export function isBeforeStart(account: Pick<Account, 'openingDate'> | undefined, t: Pick<Transaction, 'date'>): boolean {
  return !!account?.openingDate && t.date < account.openingDate;
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

  const cardsToPay = accounts
    .filter((a) => !a.archived && a.type === 'credit' && !a.includeInSafeToSpend)
    .map((a) => ({ accountId: a.id, name: a.name, amount: Math.max(0, -accountBalance(a, transactions, today)) }))
    .filter((c) => c.amount > 0);
  const cardOwed = new Map(cardsToPay.map((c) => [c.accountId, c.amount]));
  const excludedCards = new Set(
    accounts.filter((a) => !a.archived && a.type === 'credit' && !a.includeInSafeToSpend).map((a) => a.id),
  );

  const paydayIsReal = payday !== null;
  const early = paydayIsReal && !!settings.billsBeforePayOnPayday;
  const billWindowEnd = early ? nextPayday : lastDay;

  // Card balances are reserved once, in whichever window their bill falls first.
  const cardsReserved = new Set<Id>();
  const reserveBills = (from: ISODate, to: ISODate): BillLine[] => {
    const lines: BillLine[] = [];
    for (const bill of bills) {
      if (!bill.active) continue;
      // Bills that pay an included card are already reflected in `available` as you spend.
      if (bill.payToAccountId && includedIds.has(bill.payToAccountId)) continue;
      if (!includedIds.has(bill.accountId)) continue; // paid from money outside safe-to-spend
      const followsCard =
        !!bill.payToAccountId && excludedCards.has(bill.payToAccountId) && bill.amountSource !== 'fixed';
      for (const date of occurrences(bill.schedule, from, to)) {
        if (isBillPaid(bill, date, transactions)) continue;
        if (followsCard) {
          // What's owed on the card is reserved once; a later due date owes nothing new yet.
          if (cardsReserved.has(bill.payToAccountId!)) continue;
          cardsReserved.add(bill.payToAccountId!);
          const owed = cardOwed.get(bill.payToAccountId!) ?? 0;
          if (owed > 0) lines.push({ billId: bill.id, name: bill.name, date, amount: owed, amountSource: 'cardBalance' });
        } else {
          lines.push({ billId: bill.id, name: bill.name, date, amount: bill.amount, amountSource: 'fixed' });
        }
      }
    }
    return lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
  };

  const billLines = reserveBills(today, billWindowEnd);
  const upcomingBills = sum(billLines.map((l) => l.amount));

  // Look-ahead: if the bills in the next pay period come to more than the pay expected on
  // the next payday, the gap has to come out of today's money — set it aside now.
  let lookAhead: LookAhead | null = null;
  if (paydayIsReal) {
    const following = nextPaydayAfter(nextPayday, incomes);
    if (following) {
      const from = addDays(billWindowEnd, 1);
      const to = early ? following : addDays(following, -1);
      const nextBills = reserveBills(from, to);
      const expectedPay = sum(
        incomes.filter((i) => i.active && occurrences(i.schedule, nextPayday, nextPayday).length > 0).map((i) => i.amount),
      );
      const billsTotal = sum(nextBills.map((l) => l.amount));
      lookAhead = {
        periodStart: nextPayday,
        periodEnd: addDays(following, -1),
        billLines: nextBills,
        billsTotal,
        expectedPay,
        setAside: Math.max(0, billsTotal - expectedPay),
      };
    }
  }
  const lookAheadSetAside = lookAhead?.setAside ?? 0;

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
  const startOfDay = available + spentToday - upcomingBills - lookAheadSetAside - goalSetAside - buffer;
  const dailyAllowance = divFloor(startOfDay, daysLeft);
  const safeToSpendToday = dailyAllowance - spentToday;
  const safeToSpendPeriod = startOfDay - spentToday;

  return {
    unconfirmedPaydaysToday: unconfirmedPaydays(today, incomes, transactions),
    today,
    nextPayday,
    nextPaydaySource: payday ? 'income' : 'monthEnd',
    daysLeft,
    accountLines,
    available,
    billLines,
    upcomingBills,
    lookAhead,
    lookAheadSetAside,
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
