// Auto-detect how to read a bank CSV: header row, columns, date format, decimal mark, signs.
// Header names are used when present; otherwise the column contents decide.

import type { CsvMapping } from '../../db/types';
import { parseAmountStrict, type DecimalMark } from '../money';
import { detectDateFormat, looksLikeDate } from './dates';

export type MappingDraft = Omit<CsvMapping, 'id' | 'name' | 'updatedAt'>;

export interface Detection {
  mapping: MappingDraft;
  /** Header cells, or generated "Column 1…" names when the file has none. */
  headers: string[];
  /** Day/month order was a guess from the user's region — ask them to check. */
  ambiguousDate: boolean;
  columnCount: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();

// Header names in priority order (first match wins).
const DATE_NAMES = ['transaction date', 'date', 'started date', 'posting date', 'posted date', 'booking date', 'buchungstag', 'datum', 'value date', 'completed date'];
const DESC_NAMES = ['name', 'payee', 'merchant', 'description', 'transaction description', 'narrative', 'memo', 'details', 'particulars', 'reference', 'verwendungszweck', 'beschreibung', 'transaction'];
const AMOUNT_NAMES = ['amount', 'transaction amount', 'betrag', 'value', 'amount gbp', 'amount usd', 'amount eur'];
const DEBIT_NAMES = ['debit', 'money out', 'paid out', 'withdrawal', 'withdrawals', 'debit amount', 'out', 'spent'];
const CREDIT_NAMES = ['credit', 'money in', 'paid in', 'deposit', 'deposits', 'credit amount', 'in', 'received'];
const STATE_NAMES = ['state', 'status'];
const NOT_AMOUNT = /balance|running|local amount|fee|bal$/;

const TYPE_WORDS = /^(debit|credit|dr|cr|withdrawal|deposit)$/i;
const STATE_WORDS = /^(completed|complete|posted|pending|reverted|declined|failed|cancelled|canceled)$/i;

export function signatureOf(headers: string[] | null, columnCount: number): string {
  return headers ? headers.map(norm).join('|') : `no-header:${columnCount}`;
}

function findHeaderRow(rows: string[][]): { headerRow: number; dataStart: number } {
  const limit = Math.min(rows.length, 25);
  for (let r = 0; r < limit; r++) {
    if (!rows[r].some(looksLikeDate)) continue;
    // First row with a date cell. If the row above is text-only with about as many cells, it's the header.
    const prev = rows[r - 1];
    if (prev && !prev.some(looksLikeDate) && Math.abs(prev.length - rows[r].length) <= 1) {
      const textual = prev.filter((c) => c && !/^[-+()$£€\d.,\s]+$/.test(c)).length;
      if (textual >= Math.min(2, prev.length)) return { headerRow: r - 1, dataStart: r };
    }
    return { headerRow: -1, dataStart: r };
  }
  return { headerRow: rows.length > 1 ? 0 : -1, dataStart: rows.length > 1 ? 1 : 0 };
}

function decimalOf(values: string[]): DecimalMark {
  let comma = 0, dot = 0;
  for (const v of values) {
    if (/\d,\d{2}\)?$/.test(v)) comma++;
    if (/\d\.\d{2}\)?$/.test(v)) dot++;
  }
  return comma > dot ? ',' : '.';
}

export function detectMapping(rows: string[][], regionOrder: 'DMY' | 'MDY'): Detection | null {
  if (!rows.length) return null;
  const { headerRow, dataStart } = findHeaderRow(rows);
  const data = rows.slice(dataStart);
  const columnCount = Math.max(...rows.slice(Math.max(0, headerRow)).map((r) => r.length));
  const rawHeaders = headerRow >= 0 ? rows[headerRow] : null;
  const headers = Array.from({ length: columnCount }, (_, i) => rawHeaders?.[i]?.trim() || `Column ${i + 1}`);
  const names = headers.map(norm);
  const col = (i: number) => data.map((r) => r[i] ?? '');

  const byName = (list: string[], ok: (i: number) => boolean = () => true) => {
    for (const n of list) {
      const i = names.findIndex((h, idx) => rawHeaders && h === n && ok(idx));
      if (i >= 0) return i;
    }
    return -1;
  };

  // ---- Date column: by name if it really holds dates, else the column with most dates.
  const dateShare = (i: number) => {
    const vals = col(i).filter(Boolean);
    return vals.length ? vals.filter(looksLikeDate).length / vals.length : 0;
  };
  let dateCol = byName(DATE_NAMES, (i) => dateShare(i) >= 0.6);
  if (dateCol < 0) {
    const scored = headers.map((_, i) => [i, dateShare(i)] as const).sort((a, b) => b[1] - a[1]);
    dateCol = scored[0][1] >= 0.6 ? scored[0][0] : 0;
  }
  const dd = detectDateFormat(col(dateCol), regionOrder);

  // ---- Amount columns.
  const decimal = decimalOf(data.flat());
  const numericShare = (i: number) => {
    const vals = col(i).filter(Boolean);
    return vals.length ? vals.filter((v) => parseAmountStrict(v, decimal) !== null).length / vals.length : 0;
  };
  const isAmountish = (i: number) => i !== dateCol && !NOT_AMOUNT.test(names[i]) && numericShare(i) >= 0.8;
  let amountMode: CsvMapping['amountMode'] = 'single';
  let amountCol = byName(AMOUNT_NAMES, isAmountish);
  let debitCol = -1, creditCol = -1;
  if (amountCol < 0) {
    debitCol = byName(DEBIT_NAMES, (i) => i !== dateCol && numericShare(i) >= 0.8);
    creditCol = byName(CREDIT_NAMES, (i) => i !== dateCol && numericShare(i) >= 0.8);
    if (debitCol >= 0 && creditCol >= 0) amountMode = 'debitCredit';
  }
  if (amountMode === 'single' && amountCol < 0) {
    // No usable header: prefer a numeric column with negative values (balances rarely go negative),
    // skipping long ID-like numbers.
    const candidates = headers
      .map((_, i) => i)
      .filter((i) => isAmountish(i) && !col(i).some((v) => /^\d{7,}$/.test(v)));
    amountCol = candidates.find((i) => col(i).some((v) => (parseAmountStrict(v, decimal) ?? 0) < 0)) ?? candidates[0] ?? -1;
  }

  // ---- Description: by name, else the longest-text column that isn't a date or amount.
  const used = new Set([dateCol, amountCol, debitCol, creditCol]);
  const avgLen = (i: number) => {
    const vals = col(i).filter((v) => v && parseAmountStrict(v, decimal) === null && !looksLikeDate(v));
    return vals.length ? vals.reduce((s, v) => s + v.length, 0) / data.length : 0;
  };
  let descCol = byName(DESC_NAMES, (i) => !used.has(i) && avgLen(i) > 0);
  if (descCol < 0) {
    descCol = headers.map((_, i) => i).filter((i) => !used.has(i)).sort((a, b) => avgLen(b) - avgLen(a))[0] ?? 0;
  }

  // ---- Type column (Debit/Credit words) — only matters when amounts are never negative.
  let typeCol: number | undefined;
  const amountsAllPositive =
    amountMode === 'single' && amountCol >= 0 && col(amountCol).every((v) => !v || (parseAmountStrict(v, decimal) ?? 0) >= 0);
  if (amountsAllPositive) {
    const t = headers.map((_, i) => i).find((i) => {
      const vals = col(i).filter(Boolean);
      // Values decide it; a known header name isn't required (some exports label it oddly).
      return i !== descCol && vals.length > 0 && vals.every((v) => TYPE_WORDS.test(v));
    });
    if (t !== undefined) typeCol = t;
  }

  // ---- State column (Revolut-style COMPLETED / REVERTED).
  let stateCol: number | undefined;
  const s = headers.map((_, i) => i).find((i) => {
    const vals = col(i).filter(Boolean);
    return vals.length > 0 && vals.every((v) => STATE_WORDS.test(v)) && (!rawHeaders || STATE_NAMES.includes(names[i]));
  });
  if (s !== undefined) stateCol = s;

  // ---- Sign: card exports sometimes show purchases as positive and payments as negative.
  let signConvention: CsvMapping['signConvention'] = 'negativeIsOut';
  if (amountMode === 'single' && amountCol >= 0 && typeCol === undefined) {
    const parsed = data.map((r) => ({ v: parseAmountStrict(r[amountCol] ?? '', decimal), d: (r[descCol] ?? '').toUpperCase() })).filter((x) => x.v !== null);
    const negatives = parsed.filter((x) => x.v! < 0);
    const positives = parsed.filter((x) => x.v! > 0);
    if (negatives.length && positives.length / parsed.length >= 0.7 && negatives.every((x) => /PAYMENT|THANK YOU|REFUND|CREDIT/.test(x.d))) {
      signConvention = 'positiveIsOut';
    }
  }

  const mapping: MappingDraft = {
    signature: signatureOf(rawHeaders, columnCount),
    headerRow,
    dateCol,
    descCol,
    amountMode,
    ...(amountMode === 'single' ? { amountCol } : { debitCol, creditCol }),
    ...(typeCol !== undefined ? { typeCol } : {}),
    ...(stateCol !== undefined ? { stateCol } : {}),
    dateFormat: dd?.format ?? regionOrder,
    decimal,
    signConvention,
  };
  return { mapping, headers, ambiguousDate: !!dd?.ambiguous, columnCount };
}
