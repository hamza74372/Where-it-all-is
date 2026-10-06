// Calendar-date maths on 'YYYY-MM-DD' strings. Internally uses a day number
// (days since 1970-01-01 in UTC) so DST and time zones can never shift a date.

import type { ISODate } from '../db/types';

const MS_PER_DAY = 86_400_000;

export function toDayNum(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / MS_PER_DAY);
}

export function fromDayNum(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function ymd(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parts(d: ISODate): { y: number; m: number; d: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, d: day };
}

/** Today's local calendar date. */
export function todayISO(now: Date = new Date()): ISODate {
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromDayNum(toDayNum(d) + n);
}

/** b − a in whole days. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toDayNum(b) - toDayNum(a);
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Date in month (y, m) on `day`, clamped to the month's length (31st → 30th/28th). */
export function clampedDate(y: number, m: number, day: number): ISODate {
  return ymd(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Shift a (year, month) pair by n months. */
export function addMonthsYM(y: number, m: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(d: ISODate): number {
  return (((toDayNum(d) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function endOfMonth(d: ISODate): ISODate {
  const { y, m } = parts(d);
  return ymd(y, m, daysInMonth(y, m));
}

export function startOfNextMonth(d: ISODate): ISODate {
  const { y, m } = parts(d);
  const n = addMonthsYM(y, m, 1);
  return ymd(n.y, n.m, 1);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}
