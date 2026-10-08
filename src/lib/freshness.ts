// How fresh the balance behind the number is. The calculation never changes with age; only the
// wording does: after a few days the number is "About $X" with a one-tap "Update balance".

import type { Account, ISODate } from '../db/types';
import { daysBetween } from './dates';

/** From this many days since the balance was last confirmed, Today says "About". */
export const STALE_AFTER_DAYS = 3;

export interface Freshness {
  /** The oldest "last confirmed" date among the accounts counted in safe to spend. */
  lastChecked: ISODate | null;
  daysAgo: number | null;
  stale: boolean;
}

/** When an account's balance was last confirmed: an explicit check, else the day it was set. */
export const lastCheckedOf = (a: Pick<Account, 'balanceCheckedAt' | 'openingDate'>): ISODate | null =>
  a.balanceCheckedAt ?? a.openingDate ?? null;

export function balanceFreshness(accounts: Account[], today: ISODate): Freshness {
  const dates = accounts
    .filter((a) => !a.archived && a.includeInSafeToSpend)
    .map(lastCheckedOf)
    .filter((d): d is ISODate => !!d)
    .sort();
  if (!dates.length) return { lastChecked: null, daysAgo: null, stale: false };
  const daysAgo = Math.max(0, daysBetween(dates[0], today));
  return { lastChecked: dates[0], daysAgo, stale: daysAgo >= STALE_AFTER_DAYS };
}

/** "Updated today" / "Balance last checked 4 days ago". */
export function freshnessText(f: Freshness): string | null {
  if (f.daysAgo === null) return null;
  if (f.daysAgo === 0) return 'Updated today';
  return `Balance last checked ${f.daysAgo} ${f.daysAgo === 1 ? 'day' : 'days'} ago`;
}
