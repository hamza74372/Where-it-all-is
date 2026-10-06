// Log filtering: one month at a time, or a search across every month; both narrow by account
// and category. Pure functions so the screen stays simple and the rules are tested.

import type { Category, Id, Transaction } from '../db/types';

export interface LogFilter {
  /** 'YYYY-MM' — ignored while searching (search covers every month). */
  month: string;
  query: string;
  /** '' = every account. */
  accountId: Id | '';
  /** '' = every category, 'none' = no category. */
  categoryId: Id | 'none' | '';
}

/** "45" finds 45.00–45.99; "45.5" finds 45.50–45.59; "12,50" works with comma decimals too. */
function amountMatches(amount: number, q: string): boolean {
  if (!/^\d+([.,]\d{0,2})?$/.test(q)) return false;
  const text = (Math.abs(amount) / 100).toFixed(2);
  const norm = q.replace(',', '.');
  return norm.includes('.') ? text.startsWith(norm) : text.split('.')[0] === norm;
}

export function matchesQuery(t: Transaction, q: string, categoryName?: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    t.note.toLowerCase().includes(needle) ||
    (t.importDescription ?? '').toLowerCase().includes(needle) ||
    (categoryName ?? '').toLowerCase().includes(needle) ||
    amountMatches(t.amount, needle)
  );
}

/** Newest first (same day: most recently changed first). */
export function filterLog(transactions: Transaction[], f: LogFilter, categories: Category[]): Transaction[] {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const searching = f.query.trim() !== '';
  return transactions
    .filter((t) => searching || t.date.startsWith(f.month))
    .filter((t) => !f.accountId || t.accountId === f.accountId)
    .filter((t) => !f.categoryId || (f.categoryId === 'none' ? !t.categoryId : t.categoryId === f.categoryId))
    .filter((t) => matchesQuery(t, f.query, catName.get(t.categoryId ?? '')))
    .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : a.date < b.date ? 1 : -1));
}

/** Group sorted rows by a key (day 'YYYY-MM-DD' or month 'YYYY-MM'), keeping order. */
export function groupBy(rows: Transaction[], by: 'day' | 'month'): Array<[string, Transaction[]]> {
  const out = new Map<string, Transaction[]>();
  for (const r of rows) {
    const k = by === 'day' ? r.date : r.date.slice(0, 7);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return [...out.entries()];
}

/** Rows shown at once; "Show more" adds this many again (keeps 5,000-row logs fast). */
export const LOG_PAGE = 150;
