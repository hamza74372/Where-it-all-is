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

export type DecimalMark = '.' | ',';

/**
 * How a user with this decimal mark types amounts, for onboarding/Settings copy:
 * "." → "12.50", "," → "12,50".
 */
export function amountExample(dec: DecimalMark): string {
  return `12${dec}50`;
}

/**
 * The decimal mark a locale uses ("en-US" → ".", "de-DE" → ",").
 * Only used to pick the default for `settings.decimalSeparator`; after that, read the setting.
 */
export function decimalMarkFor(locale: string): DecimalMark {
  let mark = markCache.get(locale);
  if (!mark) {
    const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal');
    mark = part?.value === ',' ? ',' : '.';
    markCache.set(locale, mark);
  }
  return mark;
}
const markCache = new Map<string, DecimalMark>();

export type AmountParse =
  | { kind: 'ok'; value: Minor }
  /**
   * Unusual for the user's format — ask "Did you mean {suggested}?".
   * `literal` is the strict reading in the user's format, or null if there isn't one.
   */
  | { kind: 'confirm'; suggested: Minor; literal: Minor | null }
  | { kind: 'invalid' };

/** Strip spaces, signs and currency symbols. Returns the bare digits/separators and the sign. */
function normalise(input: string): { s: string; negative: boolean } | null {
  let s = input.trim().replace(/[\s  ']/g, '');
  let negative = false;
  const flip = () => {
    negative = !negative;
    s = s.slice(1);
  };
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  s = s.replace(/^\+/, '');
  if (s.startsWith('-')) flip();
  s = s.replace(/^(?:[A-Z]{3}|[$£€]|A\$|C\$|CA\$|AU\$|US\$)/i, '').replace(/(?:[A-Z]{3}|[$£€])$/i, '');
  if (s.startsWith('-')) flip();
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
  return { s, negative };
}

/**
 * Strict reading of `s` with `dec` as the decimal mark and the other mark as the
 * thousands separator (groups of exactly 3). Returns integer + fraction digit strings,
 * or null if the text isn't valid in this format.
 */
function readStrict(s: string, dec: DecimalMark): { int: string; frac: string; grouped: boolean } | null {
  const grp = dec === '.' ? ',' : '.';
  const pieces = s.split(dec);
  if (pieces.length > 2) return null;
  const [intRaw, frac = ''] = pieces;
  if (frac.includes(grp)) return null;
  const groups = intRaw.split(grp);
  if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]) || !groups.slice(1).every((g) => /^\d{3}$/.test(g)))) {
    return null;
  }
  const int = groups.join('');
  if (!int && !frac) return null;
  return { int, frac, grouped: groups.length > 1 };
}

function toMinorDigits(int: string, frac: string, digits: number, negative: boolean): Minor {
  // Round half up on the digit string when there are more decimals than the currency has.
  const keep = frac.slice(0, digits).padEnd(digits, '0');
  const roundUp = frac.length > digits && Number(frac[digits]) >= 5;
  const n = assertSafe(Number(int || '0') * 10 ** digits + Number(keep || '0') + (roundUp ? 1 : 0));
  return negative && n !== 0 ? -n : n;
}

/**
 * Parse a typed amount using the user's decimal mark — never guessing from the digits.
 *   "." locales (USD/GBP/CAD/AUD, en-IE EUR):  "1,234.56" ok · "12,50" → confirm 12.50 ·
 *        "1.234" → confirm 1,234.00 (literal 1.23)
 *   "," locales (most EUR):  "1.234,56" ok · "1.234" ok (1,234) · "12.50" → confirm 12,50
 * Also accepts currency symbols/codes, "-3", "(12.50)", "12.50-".
 */
export function parseAmount(input: string, dec: DecimalMark = '.', digits = 2): AmountParse {
  const norm = normalise(input);
  if (!norm) return { kind: 'invalid' };
  const { s, negative } = norm;
  const other: DecimalMark = dec === '.' ? ',' : '.';

  const strict = readStrict(s, dec);
  if (strict) {
    const value = toMinorDigits(strict.int, strict.frac, digits, negative);
    // Exactly 3 decimals with no grouping looks like a thousands separator from the other format.
    if (strict.frac.length === 3 && !strict.grouped && /^[1-9]\d{0,2}$/.test(strict.int)) {
      return { kind: 'confirm', suggested: toMinorDigits(strict.int + strict.frac, '', digits, negative), literal: value };
    }
    return { kind: 'ok', value };
  }
  const alt = readStrict(s, other);
  if (alt) return { kind: 'confirm', suggested: toMinorDigits(alt.int, alt.frac, digits, negative), literal: null };
  return { kind: 'invalid' };
}

/**
 * Non-interactive parse for a known format (e.g. a bank CSV whose format was detected
 * for that file): takes the strict reading only. Returns null if invalid in that format.
 */
export function parseAmountStrict(input: string, dec: DecimalMark, digits = 2): Minor | null {
  const norm = normalise(input);
  if (!norm) return null;
  const strict = readStrict(norm.s, dec);
  return strict ? toMinorDigits(strict.int, strict.frac, digits, norm.negative) : null;
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
  /**
   * The user's decimal mark. When it differs from the locale's, decimal and grouping marks
   * are swapped so displayed amounts match how the user types them.
   */
  decimal?: DecimalMark;
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
  const f = formatter(currency, locale, !!whole);
  let text: string;
  if (opts.decimal && opts.decimal !== decimalMarkFor(locale)) {
    const group = opts.decimal === '.' ? ',' : '.';
    text = f
      .formatToParts(major)
      .map((p) => (p.type === 'decimal' ? opts.decimal : p.type === 'group' ? group : p.value))
      .join('');
  } else {
    text = f.format(major);
  }
  return opts.signed && amount > 0 ? `+${text}` : text;
}

/** Amount as the user would type it in an input ("1234.50" or "1234,50"), no symbol or grouping. */
export function toInputString(amount: Minor, dec: DecimalMark = '.', digits = 2): string {
  const s = toDecimalString(amount, digits);
  return dec === ',' ? s.replace('.', ',') : s;
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
