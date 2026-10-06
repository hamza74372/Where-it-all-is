// Quick log: "25 groceries", "12.50 coffee", "coffee 4", "+40 refund".
// Finds the amount (in the user's decimal format) and fuzzy-matches the rest to a category.

import { CATEGORY_KEYWORDS } from '../data/defaults';
import type { Category, Id } from '../db/types';
import { parseAmount, type DecimalMark, type Minor } from './money';

export type QuickLogParse =
  | { kind: 'empty' }
  | { kind: 'noAmount'; text: string }
  | {
      kind: 'ok';
      /** Positive minor units. */
      amount: Minor;
      direction: 'out' | 'in';
      categoryId?: Id;
      note: string;
      /** Set when the amount looked unusual: ask "Did you mean …?" before saving. */
      confirm?: { suggested: Minor; literal: Minor | null };
    };

export function parseQuickLog(input: string, categories: Category[], dec: DecimalMark): QuickLogParse {
  const text = input.trim();
  if (!text) return { kind: 'empty' };
  const tokens = text.split(/\s+/);

  for (let i = 0; i < tokens.length; i++) {
    let tok = tokens[i];
    let direction: 'out' | 'in' = 'out';
    if (tok.startsWith('+')) {
      direction = 'in';
      tok = tok.slice(1);
    }
    if (!/\d/.test(tok)) continue;
    const parsed = parseAmount(tok, dec);
    if (parsed.kind === 'invalid') continue;

    const note = [...tokens.slice(0, i), ...tokens.slice(i + 1)].join(' ');
    const categoryId = note ? matchCategory(note, categories)?.id : undefined;
    const base = { kind: 'ok' as const, direction, categoryId, note: tidyNote(note) };
    if (parsed.kind === 'ok') return { ...base, amount: Math.abs(parsed.value) };
    return {
      ...base,
      amount: Math.abs(parsed.suggested),
      confirm: {
        suggested: Math.abs(parsed.suggested),
        literal: parsed.literal == null ? null : Math.abs(parsed.literal),
      },
    };
  }
  return { kind: 'noAmount', text };
}

function tidyNote(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Best category for free text, or undefined when nothing is a confident match. */
export function matchCategory(text: string, categories: Category[]): Category | undefined {
  const q = text.toLowerCase().trim();
  const words = q.split(/\s+/);
  let best: { cat: Category; score: number } | undefined;

  for (const cat of categories) {
    if (cat.archived) continue;
    const name = cat.name.toLowerCase();
    const nameWords = name.split(/[\s&]+/).filter(Boolean);
    const keywords = CATEGORY_KEYWORDS[cat.name] ?? [];
    let score = 0;
    if (q === name) score = 100;
    else if (name.startsWith(q) && q.length >= 3) score = 85;
    else if (keywords.some((k) => (k.includes(' ') ? q.includes(k) : words.includes(k)))) score = 75;
    else if (words.some((w) => nameWords.includes(w))) score = 70;
    else if (words.some((w) => w.length >= 4 && keywords.some((k) => k.startsWith(w)))) score = 60;
    else if (words.some((w) => w.length >= 4 && nameWords.some((n) => editDistance(w, n) <= 1))) score = 55;
    else if (words.some((w) => w.length >= 5 && keywords.some((k) => editDistance(w, k) <= 1))) score = 50;
    if (score && (!best || score > best.score)) best = { cat, score };
  }
  return best?.cat;
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
