// Insights (spec §7.7): month vs last month by category, top places, milestones. No streaks.

import type { Category, Debt, Goal, Id, ISODate, Transaction } from '../db/types';
import { addMonthsYM, parts } from './dates';
import { spentByCategory } from './envelopes';
import type { Minor } from './money';
import { isTransfer } from './transfers';

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const p = addMonthsYM(y, m, -1);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

export interface CategoryCompare {
  categoryId: Id | null;
  name: string;
  emoji: string;
  thisMonth: Minor;
  lastMonth: Minor;
}

/** Spending by category this month vs last, biggest first. Uncategorised spending is grouped. */
export function compareMonths(transactions: Transaction[], categories: Category[], month: string): CategoryCompare[] {
  const now = spentByCategory(transactions, month);
  const before = spentByCategory(transactions, previousMonth(month));
  const rows: CategoryCompare[] = categories
    .filter((c) => (now.get(c.id) ?? 0) > 0 || (before.get(c.id) ?? 0) > 0)
    .map((c) => ({ categoryId: c.id, name: c.name, emoji: c.emoji, thisMonth: now.get(c.id) ?? 0, lastMonth: before.get(c.id) ?? 0 }));
  const uncategorised = (m: string) =>
    transactions
      .filter((t) => t.date.startsWith(m) && !t.categoryId && t.amount < 0 && (t.source === 'manual' || t.source === 'import') && !isTransfer(t))
      .reduce((s, t) => s - t.amount, 0);
  const u = { now: uncategorised(month), before: uncategorised(previousMonth(month)) };
  if (u.now || u.before) rows.push({ categoryId: null, name: 'No category', emoji: '•', thisMonth: u.now, lastMonth: u.before });
  return rows.sort((a, b) => b.thisMonth - a.thisMonth || b.lastMonth - a.lastMonth);
}

/** "Where it all went": top places by note text, e.g. "Tesco", "Coffee". */
export function topPlaces(transactions: Transaction[], month: string, count = 5): Array<{ label: string; total: Minor; times: number }> {
  const groups = new Map<string, { label: string; total: Minor; times: number; latest: string }>();
  for (const t of transactions) {
    if (!t.date.startsWith(month) || t.amount >= 0 || isTransfer(t) || t.source === 'adjustment' || !t.note.trim()) continue;
    const key = t.note.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!key) continue;
    const g = groups.get(key) ?? { label: t.note.trim(), total: 0, times: 0, latest: '' };
    g.total -= t.amount;
    g.times++;
    if (t.date >= g.latest) {
      g.latest = t.date;
      g.label = t.note.trim();
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, count)
    .map(({ label, total, times }) => ({ label, total, times }));
}

export type Milestone =
  | { kind: 'inTheBlack'; month: string }
  | { kind: 'debtPaid'; name: string }
  | { kind: 'goalReached'; name: string };

/** Celebrations that can't be "broken" — things that happened, not streaks. */
export function milestones(transactions: Transaction[], debts: Debt[], goals: Goal[], today: ISODate): Milestone[] {
  const out: Milestone[] = [];
  const current = today.slice(0, 7);
  // First finished month where money in beat money out (transfers ignored).
  const byMonth = new Map<string, { inn: Minor; out: Minor }>();
  for (const t of transactions) {
    if (isTransfer(t) || t.source === 'adjustment') continue;
    const m = t.date.slice(0, 7);
    if (m >= current) continue;
    const b = byMonth.get(m) ?? { inn: 0, out: 0 };
    if (t.amount > 0) b.inn += t.amount;
    else b.out -= t.amount;
    byMonth.set(m, b);
  }
  const firstBlack = [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).find(([, v]) => v.inn > 0 && v.inn > v.out);
  if (firstBlack) out.push({ kind: 'inTheBlack', month: firstBlack[0] });
  for (const d of debts) if (d.balance <= 0) out.push({ kind: 'debtPaid', name: d.name });
  for (const g of goals) if (g.target > 0 && g.saved >= g.target) out.push({ kind: 'goalReached', name: g.name });
  return out;
}

/** "October 2026" style month label helper input: first day of the month. */
export const monthStart = (month: string): ISODate => `${month}-01`;
export const currentMonth = (today: ISODate) => `${parts(today).y}-${String(parts(today).m).padStart(2, '0')}`;
