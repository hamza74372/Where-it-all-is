import { describe, expect, it } from 'vitest';
import type { Account, Bill, Goal, Income, Schedule, Transaction } from '../src/db/types';
import { computeSafeToSpend, type SafeToSpendInput } from '../src/lib/safeToSpend';

// Base world: Tuesday 6 Oct 2026, checking holds 1,000.00, paid every 2nd Friday from Fri 9 Oct.
const TODAY = '2026-10-06';

const sched = (kind: Schedule['kind'], anchorDate: string, extra: Partial<Schedule> = {}): Schedule => ({
  kind, anchorDate, weekendShift: 'none', ...extra,
});
const account = (id: string, extra: Partial<Account> = {}): Account => ({
  id, name: id, type: 'checking', openingBalance: 0, includeInSafeToSpend: true, archived: false, updatedAt: 0, ...extra,
});
const income = (id: string, schedule: Schedule, extra: Partial<Income> = {}): Income => ({
  id, name: id, amount: 200000, accountId: 'chk', schedule, variable: false, active: true, updatedAt: 0, ...extra,
});
const bill = (id: string, amount: number, schedule: Schedule, extra: Partial<Bill> = {}): Bill => ({
  id, name: id, amount, accountId: 'chk', schedule, autopay: false, isDebtMinimum: false, active: true, updatedAt: 0, ...extra,
});
let n = 0;
const tx = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, date, amount, accountId: 'chk', note: '', source: 'manual', cleared: false, updatedAt: 0, ...extra,
});

function run(over: Partial<SafeToSpendInput> = {}) {
  return computeSafeToSpend({
    today: TODAY,
    accounts: [account('chk', { openingBalance: 100000 })],
    transactions: [],
    incomes: [income('pay', sched('biweekly', '2026-10-09'))],
    bills: [],
    goals: [],
    settings: { buffer: 0, setAsideGoals: false },
    ...over,
  });
}

describe('safe to spend', () => {
  it('1. basic: splits balance across days until payday', () => {
    const r = run();
    expect(r.nextPayday).toBe('2026-10-09');
    expect(r.daysLeft).toBe(3); // Tue, Wed, Thu
    expect(r.available).toBe(100000);
    expect(r.dailyAllowance).toBe(33333);
    expect(r.safeToSpendToday).toBe(33333);
    expect(r.safeToSpendPeriod).toBe(100000);
    expect(r.status).toBe('ok');
  });

  it('2. reserves a bill due before payday', () => {
    const r = run({ bills: [bill('rent', 50000, sched('monthly', '2026-01-07'))] });
    expect(r.billLines).toEqual([{ billId: 'rent', name: 'rent', date: '2026-10-07', amount: 50000, amountSource: 'fixed' }]);
    expect(r.safeToSpendPeriod).toBe(50000);
    expect(r.safeToSpendToday).toBe(16666);
  });

  it('3. a bill due on payday is covered by the new pay', () => {
    const r = run({ bills: [bill('phone', 4000, sched('monthly', '2026-01-09'))] });
    expect(r.upcomingBills).toBe(0);
  });

  it('4. bill due today: reserved until paid; paying it leaves the number unchanged', () => {
    const b = bill('net', 6000, sched('monthly', '2026-01-06'));
    const unpaid = run({ bills: [b] });
    expect(unpaid.upcomingBills).toBe(6000);
    const paid = run({
      bills: [b],
      transactions: [tx(TODAY, -6000, { source: 'bill', billId: 'net', billDueDate: TODAY })],
    });
    expect(paid.upcomingBills).toBe(0);
    expect(paid.spentToday).toBe(0);
    expect(paid.safeToSpendPeriod).toBe(unpaid.safeToSpendPeriod);
    expect(paid.safeToSpendToday).toBe(unpaid.safeToSpendToday);
  });

  it('5. overdue (yesterday) bills are not in the period — handled by catch-up', () => {
    const r = run({ bills: [bill('gym', 3000, sched('monthly', '2026-01-05'))] });
    expect(r.upcomingBills).toBe(0);
  });

  it('6. spending today comes off today only, not the daily allowance', () => {
    const r = run({ transactions: [tx(TODAY, -3000)] });
    expect(r.available).toBe(97000);
    expect(r.spentToday).toBe(3000);
    expect(r.dailyAllowance).toBe(33333);
    expect(r.safeToSpendToday).toBe(30333);
    expect(r.safeToSpendPeriod).toBe(97000);
  });

  it('7. yesterday’s spending lowers the balance, not spentToday', () => {
    const r = run({ transactions: [tx('2026-10-05', -3000)] });
    expect(r.spentToday).toBe(0);
    expect(r.dailyAllowance).toBe(32333);
  });

  it('8. future-dated transactions are ignored', () => {
    const r = run({ transactions: [tx('2026-10-08', -50000)] });
    expect(r.available).toBe(100000);
  });

  it('9. payday today: period runs to the following payday', () => {
    const r = run({ incomes: [income('pay', sched('biweekly', '2026-10-06'))] });
    expect(r.nextPayday).toBe('2026-10-20');
    expect(r.daysLeft).toBe(14);
  });

  it('10. multiple paychecks: earliest next one wins', () => {
    const a = run({
      incomes: [income('pay', sched('biweekly', '2026-10-09')), income('side', sched('monthly', '2026-01-15'))],
    });
    expect(a.nextPayday).toBe('2026-10-09');
    const b = run({
      incomes: [income('pay', sched('biweekly', '2026-10-09')), income('side', sched('monthly', '2026-01-08'))],
    });
    expect(b.nextPayday).toBe('2026-10-08');
    expect(b.daysLeft).toBe(2);
  });

  it('11. no income: period runs to the end of the month', () => {
    const r = run({ incomes: [] });
    expect(r.nextPayday).toBe('2026-11-01');
    expect(r.nextPaydaySource).toBe('monthEnd');
    expect(r.daysLeft).toBe(26);
  });

  it('12. inactive income is ignored', () => {
    const r = run({ incomes: [income('old', sched('weekly', '2026-10-07'), { active: false })] });
    expect(r.nextPaydaySource).toBe('monthEnd');
  });

  it('13. payday on a weekend shifts per setting', () => {
    // 10 Oct 2026 is a Saturday.
    const before = run({ incomes: [income('pay', sched('monthly', '2026-01-10', { weekendShift: 'before' }))] });
    expect(before.nextPayday).toBe('2026-10-09');
    expect(before.daysLeft).toBe(3);
    const after = run({ incomes: [income('pay', sched('monthly', '2026-01-10', { weekendShift: 'after' }))] });
    expect(after.nextPayday).toBe('2026-10-12');
    expect(after.daysLeft).toBe(6);
  });

  it('14. today on a weekend', () => {
    const r = run({ today: '2026-10-10', incomes: [income('pay', sched('weekly', '2026-10-02'))] });
    expect(r.nextPayday).toBe('2026-10-16');
    expect(r.daysLeft).toBe(6);
  });

  it('15. credit card spending does not reduce available; shows as card to pay', () => {
    const r = run({
      accounts: [account('chk', { openingBalance: 100000 }), account('card', { type: 'credit', includeInSafeToSpend: false })],
      transactions: [tx(TODAY, -5000, { accountId: 'card' })],
    });
    expect(r.available).toBe(100000);
    expect(r.spentToday).toBe(0);
    expect(r.cardsToPay).toEqual([{ accountId: 'card', name: 'card', amount: 5000 }]);
  });

  it('16. card payment bill: reserved, then paid as a transfer — no double counting', () => {
    const accounts = [account('chk', { openingBalance: 100000 }), account('card', { type: 'credit', includeInSafeToSpend: false })];
    const cardBill = bill('card bill', 5000, sched('monthly', '2026-01-08'), { payToAccountId: 'card' });
    const spend = tx('2026-10-01', -5000, { accountId: 'card' });
    const before = run({ accounts, bills: [cardBill], transactions: [spend] });
    expect(before.upcomingBills).toBe(5000);
    expect(before.safeToSpendPeriod).toBe(95000);
    expect(before.cardsToPay[0].amount).toBe(5000);

    const after = run({
      accounts,
      bills: [cardBill],
      transactions: [
        spend,
        tx(TODAY, -5000, { source: 'transfer', billId: 'card bill', billDueDate: '2026-10-08', transferId: 'x' }),
        tx(TODAY, 5000, { source: 'transfer', accountId: 'card', transferId: 'x' }),
      ],
    });
    expect(after.available).toBe(95000);
    expect(after.upcomingBills).toBe(0);
    expect(after.spentToday).toBe(0);
    expect(after.safeToSpendPeriod).toBe(95000);
    expect(after.cardsToPay).toEqual([]);
  });

  it('17. pay-in-full card included: spending counts now, its bill is not reserved again', () => {
    const r = run({
      accounts: [account('chk', { openingBalance: 100000 }), account('card', { type: 'credit', includeInSafeToSpend: true })],
      bills: [bill('card bill', 5000, sched('monthly', '2026-01-08'), { payToAccountId: 'card' })],
      transactions: [tx(TODAY, -5000, { accountId: 'card' })],
    });
    expect(r.available).toBe(95000);
    expect(r.spentToday).toBe(5000);
    expect(r.upcomingBills).toBe(0);
    expect(r.safeToSpendPeriod).toBe(95000);
    expect(r.cardsToPay).toEqual([]);
  });

  it('18. savings excluded from safe to spend', () => {
    const r = run({
      accounts: [account('chk', { openingBalance: 100000 }), account('sav', { type: 'savings', openingBalance: 500000, includeInSafeToSpend: false })],
    });
    expect(r.available).toBe(100000);
    expect(r.accountLines.map((l) => l.accountId)).toEqual(['chk']);
  });

  it('19. archived accounts are excluded', () => {
    const r = run({
      accounts: [account('chk', { openingBalance: 100000 }), account('old', { openingBalance: 999, archived: true })],
    });
    expect(r.available).toBe(100000);
  });

  it('20. buffer is held back', () => {
    const r = run({ settings: { buffer: 10000, setAsideGoals: false } });
    expect(r.safeToSpendPeriod).toBe(90000);
    expect(r.safeToSpendToday).toBe(30000);
  });

  it('21. tight until payday: negative with shortfall', () => {
    const r = run({ bills: [bill('rent', 130000, sched('monthly', '2026-01-07'))] });
    expect(r.status).toBe('tight');
    expect(r.shortfall).toBe(30000);
    expect(r.safeToSpendPeriod).toBe(-30000);
    expect(r.safeToSpendToday).toBe(-10000);
  });

  it('22. goal set-aside: one contribution per goal when switched on', () => {
    const goal: Goal = { id: 'g', name: 'Trip', target: 60000, saved: 0, targetDate: '2026-11-20', emoji: '✈️', updatedAt: 0 };
    // Paydays after today through 20 Nov: 9 Oct, 23 Oct, 6 Nov, 20 Nov → 4 → 150.00 each.
    const on = run({ goals: [goal], settings: { buffer: 0, setAsideGoals: true } });
    expect(on.goalLines).toEqual([{ goalId: 'g', name: 'Trip', amount: 15000 }]);
    expect(on.safeToSpendPeriod).toBe(85000);
    const off = run({ goals: [goal] });
    expect(off.goalSetAside).toBe(0);
    const reached = run({ goals: [{ ...goal, saved: 60000 }], settings: { buffer: 0, setAsideGoals: true } });
    expect(reached.goalSetAside).toBe(0);
  });

  it('23. leap year month end', () => {
    expect(run({ today: '2028-02-27', incomes: [] }).daysLeft).toBe(3);
    expect(run({ today: '2026-02-27', incomes: [] }).daysLeft).toBe(2);
  });

  it('24. bill on the 31st lands on the 30th in September', () => {
    const r = run({
      today: '2026-09-28',
      incomes: [income('pay', sched('monthly', '2026-01-01'))],
      bills: [bill('loan', 20000, sched('monthly', '2026-01-31'))],
    });
    expect(r.nextPayday).toBe('2026-10-01');
    expect(r.billLines.map((l) => l.date)).toEqual(['2026-09-30']);
  });

  it('25. weekly bill counted for every occurrence in the period', () => {
    const r = run({ incomes: [], bills: [bill('lunch club', 1000, sched('weekly', '2026-10-07'))] });
    expect(r.billLines.map((l) => l.date)).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']);
    expect(r.upcomingBills).toBe(4000);
  });

  it('26. bills paid from an excluded account are not reserved', () => {
    const r = run({
      accounts: [account('chk', { openingBalance: 100000 }), account('sav', { type: 'savings', includeInSafeToSpend: false })],
      bills: [bill('insurance', 30000, sched('monthly', '2026-01-07'), { accountId: 'sav' })],
    });
    expect(r.upcomingBills).toBe(0);
  });

  it('27. pay that arrived today raises available and is not spending', () => {
    const r = run({ transactions: [tx(TODAY, 200000, { source: 'income', incomeId: 'pay' })] });
    expect(r.available).toBe(300000);
    expect(r.spentToday).toBe(0);
  });

  it('28. refunds today raise available without touching spentToday', () => {
    const r = run({ transactions: [tx(TODAY, -3000), tx(TODAY, 1000)] });
    expect(r.available).toBe(98000);
    expect(r.spentToday).toBe(3000);
    expect(r.safeToSpendToday).toBe(Math.floor(101000 / 3) - 3000);
  });

  it('29. day before payday: daysLeft is 1', () => {
    const r = run({ today: '2026-10-08' });
    expect(r.daysLeft).toBe(1);
    expect(r.safeToSpendToday).toBe(100000);
  });

  it('30. a payment for a different occurrence does not clear this one', () => {
    const r = run({
      bills: [bill('rent', 50000, sched('monthly', '2026-01-07'))],
      transactions: [tx('2026-09-07', -50000, { source: 'bill', billId: 'rent', billDueDate: '2026-09-07' })],
    });
    expect(r.upcomingBills).toBe(50000);
  });

  it('31. inactive bills are ignored', () => {
    const r = run({ bills: [bill('old', 9999, sched('monthly', '2026-01-07'), { active: false })] });
    expect(r.upcomingBills).toBe(0);
  });

  it('32. negative daily share rounds down (conservative)', () => {
    const r = run({ bills: [bill('rent', 100001, sched('monthly', '2026-01-07'))] });
    expect(r.dailyAllowance).toBe(-1);
  });

  describe('payday and bills on the same day', () => {
    const payToday = income('pay', sched('biweekly', TODAY));
    const rentToday = bill('rent', 50000, sched('monthly', '2026-01-06'));

    it('33a. payday + rent today, pay not confirmed: rent reserved, pay not counted', () => {
      const r = run({ incomes: [payToday], bills: [rentToday] });
      expect(r.nextPayday).toBe('2026-10-20');
      expect(r.available).toBe(100000);
      expect(r.upcomingBills).toBe(50000);
      expect(r.safeToSpendPeriod).toBe(50000);
      expect(r.unconfirmedPaydaysToday).toEqual([{ incomeId: 'pay', name: 'pay', amount: 200000 }]);
    });

    it('33b. payday + rent today, pay confirmed: rent still comes out of the new money', () => {
      const r = run({
        incomes: [payToday],
        bills: [rentToday],
        transactions: [tx(TODAY, 200000, { source: 'income', incomeId: 'pay', incomeDate: TODAY })],
      });
      expect(r.available).toBe(300000);
      expect(r.upcomingBills).toBe(50000);
      expect(r.safeToSpendPeriod).toBe(250000);
      expect(r.daysLeft).toBe(14);
      expect(r.unconfirmedPaydaysToday).toEqual([]);
    });

    it('34. "bills come out before pay" setting reserves bills due on the next payday', () => {
      const phone = bill('phone', 4000, sched('monthly', '2026-01-09')); // due on payday, 9 Oct
      expect(run({ bills: [phone] }).upcomingBills).toBe(0);
      const on = run({ bills: [phone], settings: { buffer: 0, setAsideGoals: false, billsBeforePayOnPayday: true } });
      expect(on.upcomingBills).toBe(4000);
      expect(on.daysLeft).toBe(3);
    });

    it('35. that setting does nothing without a payday (month-end period)', () => {
      const r = run({
        incomes: [],
        bills: [bill('rent', 50000, sched('monthly', '2026-01-01'))], // due 1 Nov = period end
        settings: { buffer: 0, setAsideGoals: false, billsBeforePayOnPayday: true },
      });
      expect(r.upcomingBills).toBe(0);
    });
  });

  describe('card bills follow the card balance', () => {
    const accounts = [account('chk', { openingBalance: 100000 }), account('card', { type: 'credit', includeInSafeToSpend: false })];

    it('36. spend 200 on the card → card bill before payday sets aside 200', () => {
      const r = run({
        accounts,
        bills: [bill('card bill', 2500, sched('monthly', '2026-01-08'), { payToAccountId: 'card' })],
        transactions: [tx('2026-10-02', -20000, { accountId: 'card' })],
      });
      expect(r.billLines).toEqual([
        { billId: 'card bill', name: 'card bill', date: '2026-10-08', amount: 20000, amountSource: 'cardBalance' },
      ]);
      expect(r.safeToSpendPeriod).toBe(80000);
    });

    it('37. fixed override uses the bill amount', () => {
      const r = run({
        accounts,
        bills: [bill('card bill', 2500, sched('monthly', '2026-01-08'), { payToAccountId: 'card', amountSource: 'fixed' })],
        transactions: [tx('2026-10-02', -20000, { accountId: 'card' })],
      });
      expect(r.upcomingBills).toBe(2500);
      expect(r.billLines[0].amountSource).toBe('fixed');
    });

    it('38. nothing owed → nothing set aside', () => {
      const r = run({ accounts, bills: [bill('card bill', 2500, sched('monthly', '2026-01-08'), { payToAccountId: 'card' })] });
      expect(r.upcomingBills).toBe(0);
    });

    it('39. two card due dates in one period reserve the balance once', () => {
      const r = run({
        accounts,
        incomes: [],
        bills: [bill('card bill', 0, sched('weekly', '2026-10-07'), { payToAccountId: 'card' })],
        transactions: [tx('2026-10-02', -20000, { accountId: 'card' })],
      });
      expect(r.upcomingBills).toBe(20000);
    });
  });
});
