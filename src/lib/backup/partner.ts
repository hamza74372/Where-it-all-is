// Partner share: a read-only summary of where things stand. Encrypted with a passphrase you
// tell your partner; they open it in their own copy as a separate "Partner" tab.

import type { Currency } from '../money';
import type { AppData } from '../../state/store';
import { billsBetween, paydaysBetween } from '../bills';
import { addDays } from '../dates';
import { envelopeRows, monthOf } from '../envelopes';
import { computeSafeToSpend } from '../safeToSpend';
import { isTransfer } from '../transfers';
import { fromBase64, isEncryptedFile, NotOurFileError, PBKDF2_ITERATIONS, type EncryptedFile } from './crypto';

export interface PartnerSummary {
  format: 'wiai-partner';
  v: 1;
  createdAt: number;
  fromName: string;
  currency: Currency;
  locale: string;
  decimal: '.' | ',';
  safe: { today: number; period: number; nextPayday: string; untilPayday: boolean; /** Shares from before 'short' existed used 'tight' for below zero (shortfall > 0). */
    status: 'ok' | 'tight' | 'short'; shortfall: number };
  bills: Array<{ name: string; date: string; amount: number; autopay: boolean }>;
  paydays: Array<{ name: string; date: string; amount: number; variable: boolean }>;
  /** icon: a key (ui/icons.tsx); shares from before icons carry an emoji instead. */
  envelopes: Array<{ name: string; icon?: string; emoji?: string; limit: number; spent: number }>;
  goals: Array<{ name: string; icon?: string; emoji?: string; target: number; saved: number; targetDate?: string }>;
  transactions?: Array<{ date: string; note: string; amount: number; category?: string }>;
}

const DAYS_AHEAD = 45;

export function buildPartnerSummary(data: AppData, today: string, includeTransactions: boolean, now = Date.now()): PartnerSummary {
  const s = computeSafeToSpend({
    today, accounts: data.accounts, transactions: data.transactions, incomes: data.incomes, bills: data.bills, goals: data.goals, settings: data.settings,
  });
  const until = addDays(today, DAYS_AHEAD);
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const summary: PartnerSummary = {
    format: 'wiai-partner',
    v: 1,
    createdAt: now,
    fromName: data.settings.name || '',
    currency: data.settings.currency,
    locale: data.settings.locale,
    decimal: data.settings.decimalSeparator,
    safe: {
      today: s.safeToSpendToday, period: s.safeToSpendPeriod, nextPayday: s.nextPayday, untilPayday: s.nextPaydaySource === 'income',
      status: s.status, shortfall: s.shortfall,
    },
    bills: billsBetween(data.bills, today, until, data.transactions)
      .filter((b) => !b.paid)
      .map((b) => ({ name: b.bill.name, date: b.date, amount: b.bill.amount, autopay: b.bill.autopay })),
    paydays: paydaysBetween(data.incomes, today, until).map((p) => ({ name: p.income.name, date: p.date, amount: p.income.amount, variable: p.income.variable })),
    envelopes: envelopeRows(data.categories, data.transactions, data.envelopeMoves, monthOf(today)).map((r) => ({
      name: r.category.name, icon: r.category.icon, limit: r.limit, spent: r.spent,
    })),
    goals: data.goals.map((g) => ({ name: g.name, icon: g.icon, target: g.target, saved: g.saved, targetDate: g.targetDate })),
  };
  if (includeTransactions) {
    const from = addDays(today, -30);
    summary.transactions = data.transactions
      .filter((t) => t.date >= from && t.date <= today && !isTransfer(t) && t.source !== 'adjustment')
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((t) => ({ date: t.date, note: t.note, amount: t.amount, category: t.categoryId ? catName.get(t.categoryId) : undefined }));
  }
  return summary;
}

export function isPartnerSummary(x: unknown): x is PartnerSummary {
  const p = x as PartnerSummary;
  return !!p && p.format === 'wiai-partner' && p.v === 1 && !!p.safe && Array.isArray(p.bills);
}

// ---- Share code (for QR / copy and paste) ----

export const QR_MAX_CHARS = 2000; // ≈ 2 KB — beyond this a QR code gets too dense to scan reliably

// Compact form: "WIAI2." (compressed) or "WIAI1." + salt . iv . check . data, each base64url. Iterations and kind are
// implied (600,000 and "partner"), so nothing is encoded twice.
const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return b + '='.repeat((4 - (b.length % 4)) % 4);
};

export function toShareCode(file: EncryptedFile): string {
  const prefix = file.zip ? 'WIAI2' : 'WIAI1';
  return [prefix, file.kdf.salt, file.cipher.iv, file.check, file.data].map((p, i) => (i === 0 ? p : b64url(p))).join('.');
}

export function fromShareCode(code: string): EncryptedFile {
  const parts = code.replace(/\s+/g, '').split('.');
  if (parts[0] !== 'WIAI1' && parts[0] !== 'WIAI2') throw new NotOurFileError('That isn’t a share code from this app.');
  if (parts.length !== 5 || parts.slice(1).some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) {
    throw new NotOurFileError('That share code is incomplete — copy all of it and try again.');
  }
  const [, salt, iv, check, data] = parts.map(unb64url);
  try {
    fromBase64(salt);
    fromBase64(data);
  } catch {
    throw new NotOurFileError('That share code is incomplete — copy all of it and try again.');
  }
  const file: EncryptedFile = {
    format: 'wiai-encrypted',
    v: 1,
    kind: 'partner',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt },
    cipher: { name: 'AES-GCM', iv },
    ...(parts[0] === 'WIAI2' ? { zip: 'deflate-raw' as const } : {}),
    check,
    data,
  };
  if (!isEncryptedFile(file)) throw new NotOurFileError('That isn’t a partner share code.');
  return file;
}

export function partnerFileName(now = new Date()): string {
  return `partner-share-${now.toISOString().slice(0, 10)}.wiai`;
}
