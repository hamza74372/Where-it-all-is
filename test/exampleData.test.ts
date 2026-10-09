// The example numbers carry five months of history (for Insights and charts). That history must never
// move a current number: the example account has no opening date, so every past row counts toward its
// balance, and the history months are chosen to net to exactly zero. These tests keep it that way.
import { describe, expect, it } from 'vitest';
import { buildDefaultCategories, buildExampleData } from '../src/data/defaults';
import { addDays } from '../src/lib/dates';
import { nextBills, overdueOccurrences } from '../src/lib/bills';
import { envelopeRows, monthOf, spentByCategory } from '../src/lib/envelopes';
import { accountBalance, computeSafeToSpend } from '../src/lib/safeToSpend';

type Example = ReturnType<typeof buildExampleData>;

/** Every current-month number Today, Plan and Bills show, with ids replaced by names. */
function currentNumbers(ex: Example, today: string) {
  const names = new Map<string, string>();
  for (const r of [...ex.accounts, ...ex.bills, ...ex.incomes, ...ex.goals, ...ex.debts, ...ex.categories]) names.set(r.id, r.name);
  const month = monthOf(today);
  const out = {
    balances: ex.accounts.map((a) => [a.name, accountBalance(a, ex.transactions, today)]),
    safeToSpend: computeSafeToSpend({
      today, accounts: ex.accounts, transactions: ex.transactions, incomes: ex.incomes, bills: ex.bills, goals: ex.goals,
      settings: { buffer: 0, setAsideGoals: false },
    }),
    envelopes: envelopeRows(ex.categories, ex.transactions, [], month).map((r) => [r.category.name, r.spent, r.limit, r.remaining, r.level]),
    spentThisMonth: [...spentByCategory(ex.transactions, month)].map(([k, v]) => [names.get(k) ?? k, v]).sort(),
    overdue: ex.bills.map((b) => [b.name, overdueOccurrences(b, today, ex.transactions)]),
    nextBills: nextBills(ex.bills, today, ex.transactions, 10).map((d) => [d.bill.name, d.date]),
    lastSevenDays: Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) =>
      ex.transactions.filter((t) => t.date === d && t.amount < 0).reduce((n, t) => n + t.amount, 0)),
  };
  return JSON.parse(JSON.stringify(out, (_k, v) => (typeof v === 'string' && names.has(v) ? names.get(v) : v)));
}

describe('example history', () => {
  it('exists: several earlier months of rows for Insights', () => {
    const ex = buildExampleData('2026-10-06', buildDefaultCategories());
    const months = new Set(ex.transactions.map((t) => monthOf(t.date)).filter((m) => m < '2026-10'));
    expect(months.size).toBeGreaterThanOrEqual(5);
  });

  it('nets to zero, so it never moves a balance', () => {
    const today = '2026-10-06';
    const ex = buildExampleData(today, buildDefaultCategories());
    const history = ex.transactions.filter((t) => t.date < addDays(today, -5));
    expect(history.length).toBeGreaterThan(0);
    expect(history.reduce((n, t) => n + t.amount, 0)).toBe(0);
  });

  it('changes no current-month number on any day of the year (balances, safe to spend, envelopes, bills)', () => {
    const cats = buildDefaultCategories();
    const diffs: string[] = [];
    for (let i = 0; i < 366; i++) {
      const today = addDays('2026-10-01', i);
      const ex = buildExampleData(today, cats);
      // The current example spends are 1–5 days back; everything older is the history.
      const withoutHistory = { ...ex, transactions: ex.transactions.filter((t) => t.date >= addDays(today, -5)) };
      const a = JSON.stringify(currentNumbers(withoutHistory, today));
      const b = JSON.stringify(currentNumbers(ex, today));
      if (a !== b) diffs.push(today);
    }
    expect(diffs).toEqual([]);
  });
});

describe('partner view of the example numbers', () => {
  it('a card bill shows what is owed on the card, as the Bills screen does (not the stored 0)', async () => {
    const { buildPartnerSummary } = await import('../src/lib/backup/partner');
    const { defaultSettings } = await import('../src/db/settings');
    const today = '2026-10-13';
    const ex = buildExampleData(today, buildDefaultCategories());
    const data = { ...ex, settings: defaultSettings('en-US'), rules: [], envelopeMoves: [], notes: [], importBatches: [], tombstones: [] } as unknown as Parameters<typeof buildPartnerSummary>[0];
    const card = buildPartnerSummary(data, today, false).bills.find((b) => b.name === 'Credit card');
    expect(card?.amount).toBe(8650); // card opened owing 64.00, plus a 22.50 takeaway on it
  });

  it('uses no brand names', () => {
    const ex = buildExampleData('2026-10-13', buildDefaultCategories());
    const names = [...ex.bills.map((b) => b.name), ...ex.transactions.map((t) => t.note), ...ex.accounts.map((a) => a.name), ...ex.goals.map((g) => g.name), ...ex.debts.map((d) => d.name)];
    expect(names.filter((n) => /netflix|spotify|starbucks|amazon|walmart|tesco|chase/i.test(n))).toEqual([]);
  });
});
