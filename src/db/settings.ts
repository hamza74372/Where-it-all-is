import type { Currency } from '../lib/money';
import { CURRENCY_INFO } from '../lib/money';
import type { DB } from './db';
import { SCHEMA_VERSION } from './schema';
import type { Settings } from './types';

const REGION_CURRENCY: Record<string, Currency> = {
  US: 'USD', GB: 'GBP', UK: 'GBP', CA: 'CAD', AU: 'AUD',
  IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR',
};

/** Best guess from the browser language, e.g. 'en-GB' → GBP. Defaults to USD. */
export function guessCurrency(lang: string): Currency {
  const region = lang.split('-')[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || 'USD';
}

export function defaultSettings(lang = navigator.language || 'en-US', now = Date.now()): Settings {
  const currency = guessCurrency(lang);
  const locale = lang.includes('-') ? lang : CURRENCY_INFO[currency].defaultLocale;
  return {
    id: 'main',
    name: '',
    currency,
    locale,
    theme: 'auto',
    mode: 'simple',
    weekStart: locale.endsWith('US') || locale.endsWith('CA') ? 0 : 1,
    createdAt: now,
    schemaVersion: SCHEMA_VERSION,
    lastOpenedAt: now,
    backupRemindDays: 7,
    buffer: 0,
    setAsideGoals: false,
    onboarded: false,
    updatedAt: now,
  };
}

/** Load settings, creating defaults on first run. Returns previous lastOpenedAt for "while you were away". */
export async function loadSettings(db: DB): Promise<{ settings: Settings; previousOpenedAt: number | null }> {
  const existing = await db.get('settings', 'main');
  if (!existing) {
    const s = await db.put('settings', defaultSettings());
    return { settings: s, previousOpenedAt: null };
  }
  const previousOpenedAt = existing.lastOpenedAt;
  // Fill any fields added in later versions so old records stay valid.
  const merged: Settings = { ...defaultSettings(), ...existing, schemaVersion: SCHEMA_VERSION, lastOpenedAt: Date.now() };
  const settings = await db.put('settings', merged);
  return { settings, previousOpenedAt };
}
