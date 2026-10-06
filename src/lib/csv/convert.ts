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
    drafts.push({ rowIndex: r, date, amount, description });
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
 * Mark drafts that are already in this account (same date + amount + normalised description).
 * Counts matter: two identical coffees in the file and one already saved → one is new.
 */
export function markDuplicates(drafts: Draft[], existing: Transaction[], accountId: string): boolean[] {
  const have = new Map<string, number>();
  for (const t of existing) {
    if (t.accountId !== accountId) continue;
    const k = dupKey(t.date, t.amount, t.importDescription ?? t.note);
    have.set(k, (have.get(k) ?? 0) + 1);
  }
  return drafts.map((d) => {
    const k = dupKey(d.date, d.amount, d.description);
    const n = have.get(k) ?? 0;
    if (n > 0) {
      have.set(k, n - 1);
      return true;
    }
    return false;
  });
}

const NOISE = new Set([
  'POS', 'PURCHASE', 'AUTHORIZED', 'ON', 'CARD', 'DEBIT', 'CREDIT', 'PAYMENT', 'TO', 'FROM', 'DD', 'SO', 'BCC', 'VIS', 'CONTACTLESS',
  'THE', 'AND', 'OF', 'IN', 'AT', 'BY', 'FOR', 'ONLINE', 'WEB', 'DES', 'ID', 'PPD', 'ACH', 'CHECKCARD', 'RECURRING', 'TRANSFER', 'ZELLE',
]);

/** The word a rule should look for: "PURCHASE AUTHORIZED ON 10/13 STARBUCKS STORE 05555" → "STARBUCKS". */
export function merchantKey(description: string): string {
  const words = normaliseDescription(description).split(' ').filter((w) => w.length >= 3 && !NOISE.has(w) && !/^\d+$/.test(w));
  return words[0] ?? normaliseDescription(description).split(' ')[0] ?? '';
}
