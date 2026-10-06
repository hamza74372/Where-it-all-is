// Envelopes (spec §7.5): monthly category limits, spending against them, and "move money".

import type { Category, EnvelopeMove, Id, ISODate, Transaction } from '../db/types';
import type { Minor } from './money';
import { isTransfer } from './transfers';

export const monthOf = (d: ISODate) => d.slice(0, 7);

/** Counts toward a category: spending out (refunds reduce it). Transfers and pay don't count. */
function countsAsSpending(t: Transaction): boolean {
  return !isTransfer(t) && t.source !== 'income' && !!t.categoryId;
}

/** Net spending per category in a month (positive = spent). */
export function spentByCategory(transactions: Transaction[], month: string): Map<Id, Minor> {
  const out = new Map<Id, Minor>();
  for (const t of transactions) {
    if (!t.date.startsWith(month) || !countsAsSpending(t)) continue;
    out.set(t.categoryId!, (out.get(t.categoryId!) ?? 0) - t.amount);
  }
  return out;
}

/** This month's limit after any money moved in or out. */
export function effectiveLimit(category: Category, moves: EnvelopeMove[], month: string): Minor {
  let limit = category.monthlyLimit ?? 0;
  for (const m of moves) {
    if (m.month !== month) continue;
    if (m.toCategoryId === category.id) limit += m.amount;
    if (m.fromCategoryId === category.id) limit -= m.amount;
  }
  return limit;
}

export type EnvelopeLevel = 'ok' | 'near' | 'over';

export interface EnvelopeRow {
  category: Category;
  limit: Minor;
  spent: Minor;
  remaining: Minor;
  /** 0–1+ share of the limit used. */
  used: number;
  level: EnvelopeLevel;
}

/** Soft green under 75%, amber up to the limit, coral past it. */
export function levelFor(spent: Minor, limit: Minor): EnvelopeLevel {
  if (spent > limit) return 'over';
  if (limit > 0 && spent / limit >= 0.75) return 'near';
  return 'ok';
}

/** Rows for categories that have a limit (or money moved in) this month, in the user's order. */
export function envelopeRows(categories: Category[], transactions: Transaction[], moves: EnvelopeMove[], month: string): EnvelopeRow[] {
  const spent = spentByCategory(transactions, month);
  return categories
    .filter((c) => !c.archived)
    .map((category) => {
      const limit = effectiveLimit(category, moves, month);
      const s = spent.get(category.id) ?? 0;
      return { category, limit, spent: s, remaining: limit - s, used: limit > 0 ? s / limit : s > 0 ? 1 : 0, level: levelFor(s, limit) };
    })
    .filter((r) => r.category.monthlyLimit != null || r.limit !== 0);
}

export interface MoveSuggestion {
  to: EnvelopeRow;
  from: EnvelopeRow;
  amount: Minor;
}

/**
 * For each envelope that's over, suggest covering it from the envelope with the most left.
 * Never suggests taking from an envelope that would then be over itself.
 */
export function moveSuggestions(rows: EnvelopeRow[]): MoveSuggestion[] {
  const spare = rows.filter((r) => r.remaining > 0).map((r) => ({ row: r, left: r.remaining }));
  const out: MoveSuggestion[] = [];
  for (const over of rows.filter((r) => r.level === 'over').sort((a, b) => a.remaining - b.remaining)) {
    spare.sort((a, b) => b.left - a.left);
    const src = spare[0];
    if (!src || src.left <= 0) break;
    const amount = Math.min(-over.remaining, src.left);
    src.left -= amount;
    out.push({ to: over, from: src.row, amount });
  }
  return out;
}
