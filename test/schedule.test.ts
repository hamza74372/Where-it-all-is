import { describe, expect, it } from 'vitest';
import type { Schedule } from '../src/db/types';
import { addDays, daysBetween, daysInMonth, todayISO, weekday } from '../src/lib/dates';
import { describeSchedule, nextOccurrence, occurrences, previousOccurrence } from '../src/lib/schedule';

const sch = (kind: Schedule['kind'], anchorDate: string, extra: Partial<Schedule> = {}): Schedule => ({
  kind,
  anchorDate,
  weekendShift: 'none',
  ...extra,
});

describe('dates', () => {
  it('weekday', () => {
    expect(weekday('2026-10-06')).toBe(2); // Tuesday
    expect(weekday('2024-02-29')).toBe(4); // Thursday
    expect(weekday('2026-11-01')).toBe(0); // Sunday
    expect(weekday('1969-12-31')).toBe(3); // before epoch
  });
  it('day maths ignores DST', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US DST start
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // UK DST start
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
  it('todayISO uses local date', () => {
    expect(todayISO(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
  });
});

describe('occurrences', () => {
  it('weekly', () => {
    expect(occurrences(sch('weekly', '2026-10-02'), '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30',
    ]);
  });
  it('biweekly, continuing across months', () => {
    const s = sch('biweekly', '2026-10-02');
    expect(occurrences(s, '2026-10-01', '2026-10-31')).toEqual(['2026-10-02', '2026-10-16', '2026-10-30']);
    expect(occurrences(s, '2026-11-01', '2026-11-30')).toEqual(['2026-11-13', '2026-11-27']);
  });
  it('nothing before the anchor', () => {
    expect(occurrences(sch('weekly', '2026-10-15'), '2026-10-01', '2026-10-20')).toEqual(['2026-10-15']);
    expect(occurrences(sch('monthly', '2026-10-15'), '2026-01-01', '2026-10-14')).toEqual([]);
  });
  it('monthly on the 31st clamps to short months, incl. leap Feb', () => {
    const s = sch('monthly', '2026-01-31');
    expect(occurrences(s, '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(occurrences(s, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });
  it('monthly with explicit dayOfMonth', () => {
    expect(occurrences(sch('monthly', '2026-01-15', { dayOfMonth: 15 }), '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15',
    ]);
  });
  it('semimonthly 15th + 31st clamps', () => {
    const s = sch('semimonthly', '2026-01-15', { dayOfMonth: 15, secondDayOfMonth: 31 });
    expect(occurrences(s, '2026-02-01', '2026-02-28')).toEqual(['2026-02-15', '2026-02-28']);
    expect(occurrences(s, '2026-09-01', '2026-09-30')).toEqual(['2026-09-15', '2026-09-30']);
  });
  it('semimonthly starting mid-month', () => {
    const s = sch('semimonthly', '2026-10-10', { dayOfMonth: 1, secondDayOfMonth: 15 });
    expect(occurrences(s, '2026-10-01', '2026-11-30')).toEqual(['2026-10-15', '2026-11-01', '2026-11-15']);
  });
  it('every 3 months', () => {
    expect(occurrences(sch('everyNMonths', '2026-01-10', { n: 3 }), '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10',
    ]);
  });
  it('yearly on Feb 29 falls back to Feb 28', () => {
    const s = sch('yearly', '2024-02-29');
    expect(occurrences(s, '2025-01-01', '2025-12-31')).toEqual(['2025-02-28']);
    expect(occurrences(s, '2028-01-01', '2028-12-31')).toEqual(['2028-02-29']);
  });
  it('once', () => {
    const s = sch('once', '2026-10-20');
    expect(occurrences(s, '2026-10-01', '2026-10-31')).toEqual(['2026-10-20']);
    expect(occurrences(s, '2026-11-01', '2026-11-30')).toEqual([]);
  });
  it('weekend shift before/after', () => {
    // 1 Nov 2026 is a Sunday; 1 Aug 2026 is a Saturday.
    const before = sch('monthly', '2026-01-01', { weekendShift: 'before' });
    const after = sch('monthly', '2026-01-01', { weekendShift: 'after' });
    expect(occurrences(before, '2026-10-25', '2026-11-05')).toEqual(['2026-10-30']);
    expect(occurrences(after, '2026-10-25', '2026-11-05')).toEqual(['2026-11-02']);
    expect(occurrences(before, '2026-07-25', '2026-08-05')).toEqual(['2026-07-31']);
    expect(occurrences(after, '2026-07-25', '2026-08-05')).toEqual(['2026-08-03']);
  });
  it('shifted date can leave the window', () => {
    const before = sch('monthly', '2026-01-01', { weekendShift: 'before' });
    expect(occurrences(before, '2026-11-01', '2026-11-29')).toEqual([]);
  });
  it('empty when to < from', () => {
    expect(occurrences(sch('weekly', '2026-01-01'), '2026-02-01', '2026-01-01')).toEqual([]);
  });
});

describe('next / previous occurrence', () => {
  it('next', () => {
    expect(nextOccurrence(sch('monthly', '2026-01-31'), '2026-02-01')).toBe('2026-02-28');
    expect(nextOccurrence(sch('everyNMonths', '2026-01-10', { n: 6 }), '2026-01-11')).toBe('2026-07-10');
    expect(nextOccurrence(sch('yearly', '2026-03-05'), '2026-03-06')).toBe('2027-03-05');
    expect(nextOccurrence(sch('weekly', '2027-01-01'), '2026-10-06')).toBe('2027-01-01');
    expect(nextOccurrence(sch('once', '2026-10-01'), '2026-10-06')).toBeNull();
  });
  it('previous', () => {
    expect(previousOccurrence(sch('biweekly', '2026-10-02'), '2026-10-15')).toBe('2026-10-02');
    expect(previousOccurrence(sch('monthly', '2026-10-15'), '2026-10-14')).toBeNull();
  });
});

describe('describeSchedule', () => {
  it('reads like plain English', () => {
    expect(describeSchedule(sch('biweekly', '2026-10-09'))).toBe('every 2nd Friday');
    expect(describeSchedule(sch('weekly', '2026-10-06'))).toBe('every Tuesday');
    expect(describeSchedule(sch('monthly', '2026-01-31'))).toBe('monthly on the 31st (or last day)');
    expect(describeSchedule(sch('monthly', '2026-01-01', { weekendShift: 'before' }))).toBe(
      'monthly on the 1st, or the Friday before if it lands on a weekend',
    );
    expect(describeSchedule(sch('semimonthly', '2026-01-01', { dayOfMonth: 1, secondDayOfMonth: 15 }))).toBe(
      'twice a month, on the 1st and 15th',
    );
    expect(describeSchedule(sch('everyNMonths', '2026-01-22', { n: 3 }))).toBe('every 3 months on the 22nd');
  });
});
