// Date formats seen in bank exports, and detection across a whole column.
// Numeric day/month order is decided from the data (a value over 12 settles it); when every
// value is ambiguous we fall back to the user's region and flag it so the preview can ask.

import type { ISODate } from '../../db/types';
import { daysInMonth, ymd } from '../dates';

export type DateFormat = 'YMD' | 'DMY' | 'MDY' | 'D MON Y' | 'MON D Y';

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  YMD: '2026-10-31 (year-month-day)',
  DMY: '31/10/2026 (day/month/year)',
  MDY: '10/31/2026 (month/day/year)',
  'D MON Y': '31 Oct 2026',
  'MON D Y': 'Oct 31, 2026',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthIndex = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

function valid(y: number, m: number, d: number): ISODate | null {
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m))) return null;
  return ymd(y, m, d);
}

const NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T].*)?$/;
const ISO = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[ T].*)?$/;
const D_MON_Y = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ -,]*(\d{2}|\d{4})$/;
const MON_D_Y = /^([A-Za-z]{3,9})[ -](\d{1,2}),?[ -](\d{4})$/;

export function parseDateAs(value: string, format: DateFormat): ISODate | null {
  const s = value.trim();
  let m: RegExpMatchArray | null;
  switch (format) {
    case 'YMD':
      return (m = s.match(ISO)) ? valid(Number(m[1]), Number(m[2]), Number(m[3])) : null;
    case 'DMY':
      return (m = s.match(NUMERIC)) ? valid(fullYear(m[3]), Number(m[2]), Number(m[1])) : null;
    case 'MDY':
      return (m = s.match(NUMERIC)) ? valid(fullYear(m[3]), Number(m[1]), Number(m[2])) : null;
    case 'D MON Y':
      return (m = s.match(D_MON_Y)) && monthIndex(m[2]) ? valid(fullYear(m[3]), monthIndex(m[2]), Number(m[1])) : null;
    case 'MON D Y':
      return (m = s.match(MON_D_Y)) && monthIndex(m[1]) ? valid(Number(m[3]), monthIndex(m[1]), Number(m[2])) : null;
  }
}

/** True if the value parses as a date in any supported format. */
export function looksLikeDate(value: string): boolean {
  return (['YMD', 'DMY', 'MDY', 'D MON Y', 'MON D Y'] as DateFormat[]).some((f) => parseDateAs(value, f) !== null);
}

/** Days between the earliest and latest date when read in `order` (Infinity if any don't parse). */
function spanDays(matches: RegExpMatchArray[], order: 'DMY' | 'MDY'): number {
  const days: number[] = [];
  for (const m of matches) {
    const iso = parseDateAs(m[0], order);
    if (!iso) return Infinity;
    days.push(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
  }
  return days.length ? Math.max(...days) - Math.min(...days) : Infinity;
}

export interface DateDetection {
  format: DateFormat;
  /** Share of non-empty values that parse with this format (0–1). */
  coverage: number;
  /** Day/month order couldn't be told from the data; `format` came from the region hint. */
  ambiguous: boolean;
}

export function detectDateFormat(values: string[], regionOrder: 'DMY' | 'MDY'): DateDetection | null {
  const vals = values.map((v) => v.trim()).filter(Boolean);
  if (!vals.length) return null;
  const cover = (f: DateFormat) => vals.filter((v) => parseDateAs(v, f) !== null).length / vals.length;

  const candidates: Array<[DateFormat, number]> = (['YMD', 'D MON Y', 'MON D Y'] as DateFormat[]).map((f) => [f, cover(f)]);
  const numeric = vals.map((v) => v.match(NUMERIC)).filter(Boolean) as RegExpMatchArray[];
  let ambiguous = false;
  if (numeric.length) {
    const firstOver12 = numeric.some((m) => Number(m[1]) > 12);
    const secondOver12 = numeric.some((m) => Number(m[2]) > 12);
    let order: 'DMY' | 'MDY';
    if (firstOver12 && !secondOver12) order = 'DMY';
    else if (secondOver12 && !firstOver12) order = 'MDY';
    else {
      // Every value fits both ways. A statement covers weeks, not most of a year, so if one
      // reading is a tight run of dates and the other is spread over months, the tight one wins.
      const dmy = spanDays(numeric, 'DMY');
      const mdy = spanDays(numeric, 'MDY');
      if (dmy <= 62 && mdy > dmy * 3) order = 'DMY';
      else if (mdy <= 62 && dmy > mdy * 3) order = 'MDY';
      else {
        order = regionOrder;
        ambiguous = !firstOver12 && !secondOver12;
      }
    }
    candidates.push([order, cover(order)]);
  }
  const [format, coverage] = candidates.sort((a, b) => b[1] - a[1])[0];
  if (coverage < 0.6) return null;
  return { format, coverage, ambiguous: ambiguous && (format === 'DMY' || format === 'MDY') };
}
