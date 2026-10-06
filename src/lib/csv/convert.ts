// Turn CSV rows into transaction drafts using a mapping, then find duplicates.

import type { CsvMapping, ISODate, Transaction } from '../../db/types';
import { parseAmountStrict, type Minor } from '../money';
import { parseDateAs } from './dates';

export interface Draft {
  /** Index into the parsed rows (for error messages: "row N"). */
  rowIndex: number;
  date: ISODate;
  /** Signed: negative = money out. */
  amount: Minor;
  /** As written in the file (trimmed, spaces collapsed). */
  description: string;
  /** For a fee draft: index (in the drafts array) of the row it was charged on. */
  feeOf?: number;
  /** The bank's running balance after this row, when the file has a balance column. */
  balance?: Minor;
}

export interface Skipped {
  rowIndex: number;
  reason: string;
}

export interface Conversion {
  drafts: Draft[];
  skipped: Skipped[];
}

const OUT_WORDS = /^(debit|dr|withdrawal)$/i;
const COMPLETED = /^(completed|complete|posted)$/i;

export function convertRows(rows: string[][], m: Pick<CsvMapping, Exclude<keyof CsvMapping, 'id' | 'name' | 'updatedAt' | 'signature'>>): Conversion {
  const drafts: Draft[] = [];
  const skipped: Skipped[] = [];
  const start = m.headerRow + 1;
  for (let r = Math.max(0, start); r < rows.length; r++) {
    const row = rows[r];
    const rawDate = row[m.dateCol] ?? '';
    const date = parseDateAs(rawDate, m.dateFormat);
    if (!date) {
      skipped.push({ rowIndex: r, reason: rawDate ? `"${rawDate}" isn't a date in the chosen format` : 'No date' });
      continue;
    }
    if (m.stateCol !== undefined && row[m.stateCol] && !COMPLETED.test(row[m.stateCol])) {
      skipped.push({ rowIndex: r, reason: `Not completed (${row[m.stateCol].toLowerCase()})` });
      continue;
    }

    let amount: Minor | null = null;
    if (m.amountMode === 'debitCredit') {
      const out = parseAmountStrict(row[m.debitCol!] ?? '', m.decimal);
      const inn = parseAmountStrict(row[m.creditCol!] ?? '', m.decimal);
      if (out) amount = -Math.abs(out);
      else if (inn) amount = Math.abs(inn);
      else if (out === 0 || inn === 0) amount = 0;
    } else {
      const v = parseAmountStrict(row[m.amountCol!] ?? '', m.decimal);
      if (v !== null) {
        if (m.typeCol !== undefined) amount = OUT_WORDS.test(row[m.typeCol] ?? '') ? -Math.abs(v) : Math.abs(v);
        else amount = m.signConvention === 'positiveIsOut' ? -v : v;
      }
    }
    if (amount === null) {
      skipped.push({ rowIndex: r, reason: 'No amount (often a balance line)' });
      continue;
    }
    if (amount === 0) {
      skipped.push({ rowIndex: r, reason: 'Amount is zero' });
      continue;
    }
    const description = (row[m.descCol] ?? '').replace(/\s+/g, ' ').trim();
    const balance = m.balanceCol !== undefined ? parseAmountStrict(row[m.balanceCol] ?? '', m.decimal) : null;
    drafts.push({ rowIndex: r, date, amount, description, ...(balance !== null ? { balance } : {}) });
    // A fee on the row is money out on its own (the amount excludes it); keep the balance true.
    if (m.feeCol !== undefined) {
      const fee = parseAmountStrict(row[m.feeCol] ?? '', m.decimal);
      if (fee) drafts.push({ rowIndex: r, date, amount: -fee, description: `${description} (fee)`, feeOf: drafts.length - 1 });
    }
  }
  return { drafts, skipped };
}

/** For matching only: upper case, no card/ref numbers, no punctuation. */
export function normaliseDescription(s: string): string {
  return s
    .toUpperCase()
    .replace(/\d{3,}/g, ' ')
    .replace(/[^A-Z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Display text: collapse spaces, and turn SHOUTY BANK TEXT into Title Case. */
export function tidyDescription(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t || /[a-z]/.test(t)) return t;
  // Capitalise after spaces only, so "NETFLIX.COM" becomes "Netflix.com", not "Netflix.Com".
  return t.toLowerCase().replace(/(^|\s)([a-z])/g, (_, sp: string, c: string) => sp + c.toUpperCase());
}

const dupKey = (date: string, amount: number, desc: string) => `${date}|${amount}|${normaliseDescription(desc)}`;

/**
 * Drafts that are already in this account (same date + amount + normalised description): the id
 * of the existing transaction each one duplicates. Counts matter: two identical coffees in the
 * file and one already saved → one is new.
 */
export function findDuplicates(drafts: Draft[], existing: Transaction[], accountId: string): Array<string | undefined> {
  const have = new Map<string, string[]>();
  for (const t of existing) {
    if (t.accountId !== accountId) continue;
    const k = dupKey(t.importDate ?? t.date, t.amount, t.importDescription ?? t.note);
    have.set(k, [...(have.get(k) ?? []), t.id]);
  }
  return drafts.map((d) => have.get(dupKey(d.date, d.amount, d.description))?.shift());
}

export function markDuplicates(drafts: Draft[], existing: Transaction[], accountId: string): boolean[] {
  return findDuplicates(drafts, existing, accountId).map((id) => id !== undefined);
}

export const MATCH_WINDOW_DAYS = 3;

const dayNum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

/** One draft's match: linked to one existing entry, or several could fit and the user decides. */
export type Match = { id: string } | { candidates: string[] } | undefined;

/**
 * Match import rows to what's already on the account — anything not yet backed by a bank row:
 * typed spends, bills marked paid, confirmed paychecks, other money in, transfers, and earlier
 * imports. Same amount, within ±3 days.
 *
 *  • One possible entry → linked, never added again. If two rows want the same entry, the closest
 *    date wins (ties: file order) and the other row is new.
 *  • Several possible entries → { candidates }: the user chooses; the app doesn't guess.
 *  • Earlier imports only count inside this file's date range — the bank re-dated or re-worded a
 *    row it already sent. Outside the range the file can't contain them, so a same-amount row is
 *    a different payment (two coffees on different days).
 *  • Exact duplicates, fee rows, balance adjustments and entries already linked to a bank row are
 *    never matched.
 */
export function matchExistingEntries(drafts: Draft[], duplicateOf: Array<string | undefined>, existing: Transaction[], accountId: string): Match[] {
  const used = new Set(duplicateOf.filter((id): id is string => !!id));
  // The dates this file covers (every row, duplicates included).
  const dates = drafts.filter((d) => d.feeOf === undefined).map((d) => d.date).sort();
  const span = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  const pool = existing.filter(
    (t) =>
      t.accountId === accountId &&
      !used.has(t.id) &&
      !t.matchedBatchId &&
      t.source !== 'adjustment' &&
      (t.source !== 'import' || (span !== null && t.date >= span.from && t.date <= span.to)),
  );
  const out: Match[] = drafts.map(() => undefined);
  const single: Array<{ di: number; id: string; gap: number }> = [];
  drafts.forEach((d, di) => {
    if (duplicateOf[di] || d.feeOf !== undefined) return;
    const fits = pool.filter((t) => t.amount === d.amount && Math.abs(dayNum(t.date) - dayNum(d.date)) <= MATCH_WINDOW_DAYS);
    if (fits.length > 1) out[di] = { candidates: fits.map((t) => t.id) };
    else if (fits.length === 1) single.push({ di, id: fits[0].id, gap: Math.abs(dayNum(fits[0].date) - dayNum(d.date)) });
  });
  single.sort((a, b) => a.gap - b.gap || a.di - b.di);
  const taken = new Set<string>();
  for (const p of single) {
    if (taken.has(p.id)) continue;
    out[p.di] = { id: p.id };
    taken.add(p.id);
  }
  return out;
}

/**
 * The bank's closing balance from a balance column: the balance on the newest row. Files come
 * oldest-first or newest-first; on the newest day the closing row is the last one listed
 * (oldest-first) or the first (newest-first). Null when the file has no balances.
 */
export function statementEnd(drafts: Draft[]): { from: ISODate; date: ISODate; balance: Minor } | null {
  const rows = drafts.filter((d) => d.feeOf === undefined && d.balance !== undefined);
  if (!rows.length) return null;
  const newestFirst = rows[0].date > rows[rows.length - 1].date;
  const closing = newestFirst ? rows[0] : rows[rows.length - 1];
  const from = rows.map((d) => d.date).sort()[0];
  return { from, date: closing.date, balance: closing.balance! };
}

/**
 * Generic bank words: never offered as a rule on their own (a rule for "CHECK" would file every
 * cheque the same way). Includes the words of multi-word terms like DIRECT DEBIT, STANDING ORDER.
 */
export const GENERIC_BANK_WORDS = new Set([
  'CHECK', 'CHEQUE', 'POS', 'DEBIT', 'CREDIT', 'CARD', 'TRANSFER', 'PAYMENT', 'ACH', 'DIRECT', 'STANDING', 'ORDER', 'ATM',
  'BANK', 'BANKING', 'PURCHASE', 'AUTHORIZED', 'WITHDRAWAL', 'DEPOSIT', 'FASTER', 'BILL', 'RECURRING', 'CHECKCARD', 'CONTACTLESS', 'ONLINE', 'WEB',
  'BCC', 'VIS', 'DDR', 'DES', 'PPD', 'ZELLE', 'THE', 'AND', 'FOR', 'FROM', 'ON', 'TO', 'AT', 'BY', 'OF', 'IN', 'ID',
]);
/** Words that can follow a merchant name without being part of it. */
const MERCHANT_TAIL = new Set(['STORE', 'STORES', 'SHOP', 'MARKET', 'SUPERMARKET', 'INC', 'LTD', 'LLC', 'CO', 'CORP', 'PLC', 'GMBH']);

/**
 * The merchant part of a description, for "Always put X in this category" rules:
 *   "PURCHASE AUTHORIZED ON 10/13 STARBUCKS STORE 05555" → "STARBUCKS"
 *   "WHOLE FOODS MARKET #10234"                          → "WHOLE FOODS"
 * A store number ends the name ("KROGER #456 COLUMBUS" → "KROGER").
 * Returns "" when there's nothing safe to make a rule from ("CHECK 1043", ATM withdrawals).
 */
export function merchantKey(description: string): string {
  const raw = description.toUpperCase().split(/\s+/).filter(Boolean);
  if (raw.some((t) => t.replace(/[^A-Z]/g, '') === 'ATM')) return '';
  const word = (t: string) => {
    const w = t.replace(/^[^A-Z0-9&]+|[^A-Z0-9&]+$/g, '');
    return /^[A-Z][A-Z&']{2,}$/.test(w) && !GENERIC_BANK_WORDS.has(w) ? w : null;
  };
  const start = raw.findIndex((t) => word(t) !== null);
  if (start < 0) return '';
  const first = word(raw[start])!;
  const next = raw[start + 1] ? word(raw[start + 1]) : null;
  return next && !MERCHANT_TAIL.has(next) ? `${first} ${next}` : first;
}
