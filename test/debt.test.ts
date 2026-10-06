import { describe, expect, it } from 'vitest';
import { comparePayoff, debtFreeDate, simulatePayoff, type DebtInput } from '../src/lib/debt';

const debt = (id: string, balance: number, apr: number, minPayment: number): DebtInput => ({ id, name: id, balance, apr, minPayment });

/** Excel ROUND(x, 2) on cents: round half away from zero. */
const roundCents = (x: number) => Math.sign(x) * Math.round(Math.abs(x));

/**
 * Independent replica of docs/debt-payoff-check.csv — the same cell formulas, evaluated row by row.
 * Single debt:   Interest = ROUND(Start*APR/12, 2), Payment = MIN(Pay, Start+Interest), End = Start+Interest-Payment.
 */
function spreadsheetSingle(balance: number, apr: number, pay: number) {
  let start = balance, months = 0, interest = 0;
  while (start > 0 && months < 600) {
    const i = roundCents((start * apr) / 100 / 12);
    const p = Math.min(pay, start + i);
    start = start + i - p;
    interest += i;
    months++;
  }
  return { months, interest };
}

/**
 * Two-debt replica (sheet 2 of the CSV). Target T gets everything except the other's minimum:
 *   T_pay = MIN(T_start+T_int, Budget - MIN(O_min, O_start+O_int))
 *   O_pay = MIN(O_start+O_int, Budget - T_pay)
 */
function spreadsheetTwo(t: DebtInput, o: DebtInput, budget: number) {
  let tb = t.balance, ob = o.balance, months = 0, interest = 0;
  const off: Record<string, number> = {};
  while ((tb > 0 || ob > 0) && months < 600) {
    months++;
    const ti = roundCents((tb * t.apr) / 100 / 12);
    const oi = roundCents((ob * o.apr) / 100 / 12);
    const tp = Math.min(tb + ti, budget - Math.min(o.minPayment, ob + oi));
    const op = Math.min(ob + oi, budget - tp);
    tb = tb + ti - tp;
    ob = ob + oi - op;
    interest += ti + oi;
    if (tb === 0 && !off[t.id]) off[t.id] = months;
    if (ob === 0 && !off[o.id]) off[o.id] = months;
  }
  return { months, interest, off };
}

describe('debt payoff — single debt', () => {
  it('5,000 at 18% paying 200/month: 32 months, matches the spreadsheet and NPER', () => {
    const r = simulatePayoff([debt('card', 500000, 18, 20000)], 'snowball');
    const sheet = spreadsheetSingle(500000, 18, 20000);
    expect(r.months).toBe(sheet.months);
    expect(r.totalInterest).toBe(sheet.interest);
    // Excel: =NPER(18%/12, -200, 5000) = 31.57… → 32 payments.
    const nper = -Math.log(1 - (0.015 * 5000) / 200) / Math.log(1.015);
    expect(nper).toBeCloseTo(31.57, 2);
    expect(r.months).toBe(Math.ceil(nper));
    // Interest ≈ 31.57 × 200 − 5000 = 1,313.82 (closed form, unrounded).
    expect(Math.abs(r.totalInterest - (nper * 20000 - 500000))).toBeLessThan(100);
    expect(r.totalPaid).toBe(500000 + r.totalInterest);
  });

  it('0% APR divides evenly', () => {
    const r = simulatePayoff([debt('loan', 120000, 0, 10000)], 'avalanche');
    expect(r.months).toBe(12);
    expect(r.totalInterest).toBe(0);
  });

  it('payments that never beat interest → null, not an endless loop', () => {
    // 5,000 at 24% = 100/month interest; paying 100 goes nowhere.
    expect(simulatePayoff([debt('card', 500000, 24, 10000)], 'snowball').months).toBeNull();
  });

  it('extra payment shortens the time and the interest', () => {
    const base = simulatePayoff([debt('card', 500000, 18, 20000)], 'snowball');
    const more = simulatePayoff([debt('card', 500000, 18, 20000)], 'snowball', 10000);
    expect(more.months!).toBeLessThan(base.months!);
    expect(more.totalInterest).toBeLessThan(base.totalInterest);
  });

  it('already paid off', () => {
    expect(simulatePayoff([debt('x', 0, 20, 5000)], 'snowball')).toMatchObject({ months: 0, totalInterest: 0 });
    expect(simulatePayoff([], 'avalanche').months).toBe(0);
  });
});

describe('debt payoff — snowball vs avalanche (matches the two-debt spreadsheet)', () => {
  // Card A: 1,000 at 24%, min 50.  Card B: 3,000 at 15%, min 90.  Extra 60 → budget 200/month.
  const a = debt('A', 100000, 24, 5000);
  const b = debt('B', 300000, 15, 9000);

  it('snowball targets the smaller balance (A) and matches the sheet', () => {
    const r = simulatePayoff([b, a], 'snowball', 6000);
    const sheet = spreadsheetTwo(a, b, 20000);
    expect(r.order).toEqual(['A', 'B']);
    expect(r.months).toBe(sheet.months);
    expect(r.totalInterest).toBe(sheet.interest);
    expect(r.paidOffMonth).toEqual(sheet.off);
  });

  it('avalanche targets the higher APR and matches the sheet', () => {
    const cheapBig = debt('Big', 300000, 25, 9000);
    const dearSmall = debt('Small', 100000, 12, 5000);
    const r = simulatePayoff([dearSmall, cheapBig], 'avalanche', 6000);
    const sheet = spreadsheetTwo(cheapBig, dearSmall, 20000);
    expect(r.order).toEqual(['Big', 'Small']);
    expect(r.months).toBe(sheet.months);
    expect(r.totalInterest).toBe(sheet.interest);
  });

  it('avalanche never costs more interest than snowball (100 random households)', () => {
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * n;
    for (let k = 0; k < 100; k++) {
      const debts = Array.from({ length: 2 + Math.floor(rand(4)) }, (_, i) => {
        const balance = 20000 + Math.floor(rand(800000));
        return debt(`d${i}`, balance, Math.round(rand(30) * 10) / 10, Math.max(2500, Math.floor(balance * 0.03)));
      });
      const c = comparePayoff(debts, Math.floor(rand(20000)));
      if (c.snowball.months == null || c.avalanche.months == null) continue;
      expect(c.interestDifference).toBeGreaterThanOrEqual(0);
    }
  });

  it('every debt gets a payoff month, in target order for snowball', () => {
    const r = simulatePayoff([debt('x', 50000, 20, 2500), debt('y', 20000, 10, 2500), debt('z', 90000, 5, 3000)], 'snowball', 5000);
    expect(Object.keys(r.paidOffMonth).sort()).toEqual(['x', 'y', 'z']);
    expect(r.paidOffMonth.y).toBeLessThanOrEqual(r.paidOffMonth.x);
  });
});

describe('debtFreeDate', () => {
  it('adds months, clamping the day', () => {
    expect(debtFreeDate('2026-10-06', 32)).toBe('2029-06-06');
    expect(debtFreeDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(debtFreeDate('2026-10-06', 0)).toBe('2026-10-06');
  });
});
