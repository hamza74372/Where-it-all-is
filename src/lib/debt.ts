// Debt payoff estimate — snowball vs avalanche (spec §7.5).
//
// Assumptions (shown to the user, labelled "estimate"):
//  • Interest is charged monthly: balance × APR ÷ 12, rounded to the cent.
//  • The monthly budget stays the same: all minimums + extra. When a debt is paid off,
//    its minimum rolls on to the next target ("rollover").
//  • Each month: interest is added, minimums are paid on every debt, then everything left
//    goes to the target debt (snowball: smallest balance first; avalanche: highest APR first).
//  • No new spending on these debts; APRs don't change.

import type { ISODate } from '../db/types';
import { addMonthsYM, clampedDate, parts } from './dates';
import { mulRound, sum, type Minor } from './money';

export interface DebtInput {
  id: string;
  name: string;
  balance: Minor;
  apr: number; // percent
  minPayment: Minor;
}

export type Strategy = 'snowball' | 'avalanche';

export interface PayoffResult {
  strategy: Strategy;
  /** Months until everything is paid, or null if the payments never catch up with interest. */
  months: number | null;
  totalInterest: Minor;
  totalPaid: Minor;
  /** Order debts are targeted in. */
  order: string[];
  /** Month (1-based) each debt is cleared. */
  paidOffMonth: Record<string, number>;
}

export const MAX_MONTHS = 600; // 50 years — anything longer is reported as "not with these payments"

export function targetOrder(debts: DebtInput[], strategy: Strategy): DebtInput[] {
  return [...debts].sort((a, b) =>
    strategy === 'snowball'
      ? a.balance - b.balance || b.apr - a.apr || a.name.localeCompare(b.name)
      : b.apr - a.apr || a.balance - b.balance || a.name.localeCompare(b.name),
  );
}

export function simulatePayoff(debts: DebtInput[], strategy: Strategy, extraPerMonth: Minor = 0): PayoffResult {
  const ordered = targetOrder(debts.filter((d) => d.balance > 0), strategy);
  const bal = new Map(ordered.map((d) => [d.id, d.balance]));
  const budget = sum(ordered.map((d) => d.minPayment)) + Math.max(0, extraPerMonth);
  const paidOffMonth: Record<string, number> = {};
  let totalInterest = 0;
  let totalPaid = 0;

  for (let month = 1; month <= MAX_MONTHS; month++) {
    const open = ordered.filter((d) => bal.get(d.id)! > 0);
    if (!open.length) return done(month - 1);

    let interestThisMonth = 0;
    for (const d of open) {
      const i = mulRound(bal.get(d.id)!, d.apr / 100 / 12);
      bal.set(d.id, bal.get(d.id)! + i);
      interestThisMonth += i;
    }
    totalInterest += interestThisMonth;
    // Payments can't even cover the interest: it will never be paid off.
    if (month === 1 && budget <= interestThisMonth) return done(null);

    let left = budget;
    for (const d of open) {
      const pay = Math.min(d.minPayment, bal.get(d.id)!, left);
      bal.set(d.id, bal.get(d.id)! - pay);
      left -= pay;
    }
    for (const d of open) {
      if (left <= 0) break;
      const pay = Math.min(left, bal.get(d.id)!);
      bal.set(d.id, bal.get(d.id)! - pay);
      left -= pay;
    }
    totalPaid += budget - left;
    for (const d of open) if (bal.get(d.id) === 0 && !(d.id in paidOffMonth)) paidOffMonth[d.id] = month;
  }
  return done(ordered.every((d) => bal.get(d.id) === 0) ? MAX_MONTHS : null);

  function done(months: number | null): PayoffResult {
    return { strategy, months, totalInterest, totalPaid, order: ordered.map((d) => d.id), paidOffMonth };
  }
}

/** The month a plan finishes: `months` after the current month, on the same day (clamped). */
export function debtFreeDate(today: ISODate, months: number): ISODate {
  const p = parts(today);
  const ym = addMonthsYM(p.y, p.m, months);
  return clampedDate(ym.y, ym.m, p.d);
}

export interface Comparison {
  snowball: PayoffResult;
  avalanche: PayoffResult;
  /** Interest saved by avalanche vs snowball (≥ 0 when avalanche is cheaper). */
  interestDifference: Minor;
}

export function comparePayoff(debts: DebtInput[], extraPerMonth: Minor): Comparison {
  const snowball = simulatePayoff(debts, 'snowball', extraPerMonth);
  const avalanche = simulatePayoff(debts, 'avalanche', extraPerMonth);
  return { snowball, avalanche, interestDifference: snowball.totalInterest - avalanche.totalInterest };
}
