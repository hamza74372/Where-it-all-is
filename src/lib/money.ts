// Money is always stored and computed as integer minor units (cents/pence).
// Floats never touch a stored amount: parsing works on the digit string.

export type Minor = number;

export const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_INFO: Record<Currency, { label: string; defaultLocale: string }> = {
  USD: { label: 'US dollar ($)', defaultLocale: 'en-US' },
  GBP: { label: 'British pound (£)', defaultLocale: 'en-GB' },
  EUR: { label: 'Euro (€)', defaultLocale: 'en-IE' },
  CAD: { label: 'Canadian dollar ($)', defaultLocale: 'en-CA' },
  AUD: { label: 'Australian dollar ($)', defaultLocale: 'en-AU' },
};

/** Number of minor-unit digits for a currency (2 for all launch currencies). */
export function fractionDigits(currency: Currency): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

function assertSafe(n: number): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Not a safe integer amount: ${n}`);
  return n;
}

/** Sum integer minor-unit amounts. */
export function sum(values: Iterable<Minor>): Minor {
  let total = 0;
  for (const v of values) total += v;
  return assertSafe(total);
}

/** Floor division that rounds toward −∞ (so negative budgets stay conservative). */
export function divFloor(a: Minor, b: number): Minor {
  if (!Number.isInteger(b) || b === 0) throw new RangeError('Divisor must be a non-zero integer');
  return Math.floor(a / b);
}

/**
 * Split an amount into `parts` integer pieces that add back to exactly `amount`.
 * Remainder goes to the first pieces.
 */
export function allocate(amount: Minor, parts: number): Minor[] {
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError('parts must be a positive integer');
  const base = divFloor(amount, parts);
  let rest = amount - base * parts;
  return Array.from({ length: parts }, () => (rest-- > 0 ? base + 1 : base));
}

/** Multiply by a rate (e.g. APR/12), rounding half away from zero to whole minor units. */
export function mulRound(amount: Minor, rate: number): Minor {
  const r = amount * rate;
  return assertSafe(Math.sign(r) * Math.round(Math.abs(r)));
}

/**
 * Parse a human-typed amount into minor units. Accepts:
 *   "12", "12.5", "12.50", "1,234.56", "1.234,56", "12,50", "£12.50", "-3", "(12.50)", "12.50-"
 * Separator rule: if both `.` and `,` appear, the last one is the decimal point.
 * If only one kind appears and it is followed by 1–2 trailing digits once, it is decimal;
 * otherwise it is a thousands separator.
 * Returns null when the text isn't a recognisable amount.
 */
export function parseAmount(input: string, digits = 2): Minor | null {
  let s = input.trim().replace(/[\s  ']/g, '');
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  // Strip currency symbols/codes anywhere around the number.
  s = s.replace(/^[+]/, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/^(?:[A-Z]{3}|[$£€]|A\$|C\$|CA\$|AU\$|US\$)/i, '').replace(/(?:[A-Z]{3}|[$£€])$/i, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  let intPart = s;
  let fracPart = '';
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    intPart = s.slice(0, dec);
    fracPart = s.slice(dec + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const count = s.split(sep).length - 1;
    const after = s.slice(s.lastIndexOf(sep) + 1);
    const isDecimal = count === 1 && (after.length <= 2 || (sep === '.' && after.length !== 3));
    if (isDecimal) {
      intPart = s.slice(0, s.lastIndexOf(sep));
      fracPart = after;
    } else if (!s.split(sep).slice(1).every((g) => g.length === 3)) {
      return null; // e.g. "1,23,4" — not a valid grouping
    }
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (/[.,]/.test(fracPart)) return null;
  if (fracPart.length > digits) {
    // Round half up on the digit string (e.g. 3 decimals from a bank export).
    const keep = fracPart.slice(0, digits);
    const roundUp = Number(fracPart[digits]) >= 5;
    const n = Number(intPart || '0') * 10 ** digits + Number(keep || '0') + (roundUp ? 1 : 0);
    return assertSafe(negative ? -n : n) || 0;
  }
  const n = Number(intPart || '0') * 10 ** digits + Number(fracPart.padEnd(digits, '0') || '0');
  if (!Number.isSafeInteger(n)) return null;
  return negative && n !== 0 ? -n : n;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function formatter(currency: Currency, locale: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${locale}|${compact}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      ...(compact ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    });
    fmtCache.set(key, f);
  }
  return f;
}

export interface FormatOptions {
  /** Drop the pennies when the amount is whole (e.g. "$214" rather than "$214.00"). */
  wholeIfRound?: boolean;
  /** Always show a leading + for positive amounts. */
  signed?: boolean;
}

/** Format minor units for display via Intl.NumberFormat. */
export function formatMoney(
  amount: Minor,
  currency: Currency,
  locale: string,
  opts: FormatOptions = {},
): string {
  const digits = fractionDigits(currency);
  const major = amount / 10 ** digits; // display only — never stored
  const whole = opts.wholeIfRound && amount % 10 ** digits === 0;
  const text = formatter(currency, locale, !!whole).format(major);
  return opts.signed && amount > 0 ? `+${text}` : text;
}

/** Plain decimal string for editing inputs and CSV export ("1234.50", "-3.00"). */
export function toDecimalString(amount: Minor, digits = 2): string {
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const unit = 10 ** digits;
  const whole = Math.floor(abs / unit);
  const frac = String(abs % unit).padStart(digits, '0');
  return `${neg ? '-' : ''}${whole}${digits ? '.' + frac : ''}`;
}
