// Transfers between your own accounts: two linked sides (same transferId), never spending or
// income. They still move each account's balance, so safe-to-spend stays right.

import type { Account, Id, Transaction } from '../db/types';

/**
 * True for either side of a transfer. A side can be any source: a card-bill payment, a manual
 * transfer, or an imported bank row the user confirmed as a transfer (it keeps source 'import').
 */
export function isTransfer(t: Pick<Transaction, 'source' | 'transferId'>): boolean {
  return t.source === 'transfer' || !!t.transferId;
}

/** Bank wording that usually means money moved between your own accounts. */
export const TRANSFER_WORDS = /\b(transfer|xfer|trf|tfr)\b.*\b(to|from)\b|\b(to|from)\b.*\b(savings?|checking|current account)\b|\bonline transfer\b|\binternal transfer\b|\bsweep\b/i;

export const TRANSFER_WINDOW_DAYS = 3;

const dayNum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

/**
 * Entries on the user's *other* accounts that look like the other side of a bank row: the same
 * amount with the opposite sign, within 3 days, not already part of a transfer. Closest first.
 */
export function transferPartners(
  row: { date: string; amount: number },
  accountId: Id,
  existing: Transaction[],
  accounts: Account[],
  exclude: Set<Id> = new Set(),
): Transaction[] {
  const live = new Set(accounts.filter((a) => !a.archived && a.id !== accountId).map((a) => a.id));
  return existing
    .filter(
      (t) =>
        live.has(t.accountId) &&
        !exclude.has(t.id) &&
        !isTransfer(t) &&
        t.source !== 'adjustment' &&
        t.amount === -row.amount &&
        Math.abs(dayNum(t.date) - dayNum(row.date)) <= TRANSFER_WINDOW_DAYS,
    )
    .sort((a, b) => Math.abs(dayNum(a.date) - dayNum(row.date)) - Math.abs(dayNum(b.date) - dayNum(row.date)));
}

/** For a "transfer to/from" row with no partner yet: the account it most likely went to. */
export function guessTransferAccount(description: string, accountId: Id, accounts: Account[]): Id | undefined {
  const others = accounts.filter((a) => !a.archived && a.id !== accountId);
  if (others.length === 1) return others[0].id;
  const d = description.toLowerCase();
  const byName = others.find((a) => a.name.toLowerCase().split(/\s+/).some((w) => w.length > 2 && d.includes(w)));
  if (byName) return byName.id;
  if (/sav/.test(d)) return others.find((a) => a.type === 'savings')?.id;
  if (/card|visa|mastercard|amex/.test(d)) return others.find((a) => a.type === 'credit')?.id;
  return undefined;
}
