import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ISODate, Settings } from '../db/types';
import { daysBetween, todayISO, toDayNum } from '../lib/dates';
import { formatMoney, type FormatOptions, type Minor } from '../lib/money';
import { useData } from '../state/store';

/** Today's date, refreshed when the app returns to the foreground or passes midnight. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const now = new Date();
    const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 500;
    const timer = setTimeout(refresh, msToMidnight);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [today]);
  return today;
}

export interface Fmt {
  money: (amount: Minor, opts?: FormatOptions) => string;
  /** "Fri 9 Oct" / "Fri, Oct 9" depending on locale. */
  day: (d: ISODate) => string;
  /** "Friday 9 October". */
  dayLong: (d: ISODate) => string;
  /** "October 2026". */
  month: (d: ISODate) => string;
  /** "today", "tomorrow", "in 3 days", "2 days ago". */
  relative: (d: ISODate, today: ISODate) => string;
}

export function makeFmt(settings: Pick<Settings, 'currency' | 'locale' | 'decimalSeparator'>): Fmt {
  const { currency, locale, decimalSeparator } = settings;
  const dateFmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' });
  const short = dateFmt({ weekday: 'short', day: 'numeric', month: 'short' });
  const long = dateFmt({ weekday: 'long', day: 'numeric', month: 'long' });
  const month = dateFmt({ month: 'long', year: 'numeric' });
  const asDate = (d: ISODate) => new Date(toDayNum(d) * 86_400_000);
  return {
    money: (amount, opts) => formatMoney(amount, currency, locale, { decimal: decimalSeparator, ...opts }),
    day: (d) => short.format(asDate(d)),
    dayLong: (d) => long.format(asDate(d)),
    month: (d) => month.format(asDate(d)),
    relative: (d, today) => {
      const n = daysBetween(today, d);
      if (n === 0) return 'today';
      if (n === 1) return 'tomorrow';
      if (n === -1) return 'yesterday';
      return n > 0 ? `in ${n} days` : `${-n} days ago`;
    },
  };
}

export function useFmt(): Fmt {
  const { settings } = useData();
  return useMemo(() => makeFmt(settings), [settings.currency, settings.locale, settings.decimalSeparator]);
}
