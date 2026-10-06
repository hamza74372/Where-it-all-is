// Schedule engine: turns a Schedule into concrete due dates.
// Rules:
//  • The anchor date is the first occurrence; nothing is generated before it.
//  • Month-based kinds clamp to the month's last day (31st → 30th, Feb 29 → Feb 28).
//  • weekendShift moves Sat/Sun occurrences to the Friday before or Monday after.

import type { ISODate, Schedule } from '../db/types';
import { addDays, addMonthsYM, clampedDate, daysBetween, parts, weekday } from './dates';

/** Widest shift a weekend adjustment can apply, used to pad search windows. */
const SHIFT_PAD = 3;

function applyShift(d: ISODate, shift: Schedule['weekendShift']): ISODate {
  if (shift === 'none') return d;
  const wd = weekday(d);
  if (wd === 6) return addDays(d, shift === 'before' ? -1 : 2);
  if (wd === 0) return addDays(d, shift === 'before' ? -2 : 1);
  return d;
}

/** Unshifted occurrences in [from, to] (inclusive), in order. */
function nominal(s: Schedule, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (to < s.anchorDate) return out;
  const start = from > s.anchorDate ? from : s.anchorDate;
  const a = parts(s.anchorDate);

  const everyDays = (step: number) => {
    const offset = Math.max(0, daysBetween(s.anchorDate, start));
    let k = Math.ceil(offset / step);
    for (let d = addDays(s.anchorDate, k * step); d <= to; d = addDays(s.anchorDate, ++k * step)) out.push(d);
  };

  const everyMonths = (step: number, days: number[]) => {
    const st = parts(start);
    // First month index (relative to anchor month) that could contain `start`.
    const monthsFromAnchor = (st.y - a.y) * 12 + (st.m - a.m);
    let k = Math.max(0, Math.floor(monthsFromAnchor / step));
    for (;;) {
      const ym = addMonthsYM(a.y, a.m, k * step);
      const first = clampedDate(ym.y, ym.m, 1);
      if (first > to) break;
      const dates = [...new Set(days.map((day) => clampedDate(ym.y, ym.m, day)))].sort();
      for (const d of dates) if (d >= start && d <= to) out.push(d);
      k++;
    }
  };

  switch (s.kind) {
    case 'once':
      if (s.anchorDate >= from && s.anchorDate <= to) out.push(s.anchorDate);
      break;
    case 'weekly':
      everyDays(7);
      break;
    case 'biweekly':
      everyDays(14);
      break;
    case 'monthly':
      everyMonths(1, [s.dayOfMonth ?? a.d]);
      break;
    case 'everyNMonths':
      everyMonths(Math.max(1, s.n ?? 1), [s.dayOfMonth ?? a.d]);
      break;
    case 'yearly':
      everyMonths(12, [s.dayOfMonth ?? a.d]);
      break;
    case 'semimonthly':
      everyMonths(1, [s.dayOfMonth ?? 1, s.secondDayOfMonth ?? 15]);
      break;
  }
  return out;
}

/** All (weekend-shifted) occurrences falling in [from, to], inclusive and sorted. */
export function occurrences(s: Schedule, from: ISODate, to: ISODate): ISODate[] {
  if (to < from) return [];
  const pad = s.weekendShift === 'none' ? 0 : SHIFT_PAD;
  const raw = nominal(s, addDays(from, -pad), addDays(to, pad));
  const shifted = raw.map((d) => applyShift(d, s.weekendShift)).filter((d) => d >= from && d <= to);
  return [...new Set(shifted)].sort();
}

/** First occurrence on or after `onOrAfter`, or null if the schedule has ended. */
export function nextOccurrence(s: Schedule, onOrAfter: ISODate): ISODate | null {
  // The longest gap between occurrences is one period (≤ a year, or n months).
  const lead = Math.max(0, daysBetween(onOrAfter, s.anchorDate));
  const found = occurrences(s, onOrAfter, addDays(onOrAfter, lead + maxSpanDays(s)));
  return found[0] ?? null;
}

function maxSpanDays(s: Schedule): number {
  return (s.kind === 'everyNMonths' ? 31 * Math.max(1, s.n ?? 1) : 366) + 2 * SHIFT_PAD;
}

/** Most recent occurrence on or before `onOrBefore`, or null. */
export function previousOccurrence(s: Schedule, onOrBefore: ISODate): ISODate | null {
  if (onOrBefore < addDays(s.anchorDate, -SHIFT_PAD)) return null;
  const found = occurrences(s, addDays(onOrBefore, -maxSpanDays(s)), onOrBefore);
  return found.length ? found[found.length - 1] : null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** Plain-language description, e.g. "every 2nd Friday", "monthly on the 31st (or last day)". */
export function describeSchedule(s: Schedule): string {
  const a = parts(s.anchorDate);
  const day = s.dayOfMonth ?? a.d;
  const dayText = day >= 29 ? `the ${ordinal(day)} (or last day)` : `the ${ordinal(day)}`;
  let text: string;
  switch (s.kind) {
    case 'once':
      text = `once, on ${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
      break;
    case 'weekly':
      text = `every ${WEEKDAYS[weekday(s.anchorDate)]}`;
      break;
    case 'biweekly':
      text = `every 2nd ${WEEKDAYS[weekday(s.anchorDate)]}`;
      break;
    case 'semimonthly':
      text = `twice a month, on the ${ordinal(s.dayOfMonth ?? 1)} and ${ordinal(s.secondDayOfMonth ?? 15)}`;
      break;
    case 'monthly':
      text = `monthly on ${dayText}`;
      break;
    case 'everyNMonths':
      text = (s.n ?? 1) === 1 ? `monthly on ${dayText}` : `every ${s.n} months on ${dayText}`;
      break;
    case 'yearly':
      text = `every year on ${day} ${MONTHS[a.m - 1]}`;
      break;
  }
  if (s.weekendShift === 'before') text += ', or the Friday before if it lands on a weekend';
  if (s.weekendShift === 'after') text += ', or the Monday after if it lands on a weekend';
  return text;
}
