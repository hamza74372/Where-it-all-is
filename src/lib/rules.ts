// Auto-categorising rules: applied in priority order (lowest number first); first match wins.
// Matching is case-insensitive and runs on the bank's description.

import type { Category, Id, Rule } from '../db/types';

export function ruleMatches(rule: Pick<Rule, 'matchType' | 'pattern'>, description: string): boolean {
  const text = description.toUpperCase();
  const p = rule.pattern.toUpperCase();
  switch (rule.matchType) {
    case 'contains':
      return p !== '' && text.includes(p);
    case 'startsWith':
      return p !== '' && text.startsWith(p);
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(description);
      } catch {
        return false; // a broken pattern never matches (and never crashes an import)
      }
  }
}

export function applyRules(description: string, rules: Rule[]): { categoryId?: Id; renameTo?: string; ruleId?: Id } {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    if (ruleMatches(r, description)) return { categoryId: r.categoryId, renameTo: r.renameTo, ruleId: r.id };
  }
  return {};
}

/** 20 starter rules (spec §7.8), keyed by category name; resolved to ids when seeded. */
export const STARTER_RULES: Array<{ pattern: string; category: string; renameTo?: string }> = [
  { pattern: 'UBER\\s*\\*?\\s*EATS|DOORDASH|DELIVEROO|JUST EAT|GRUBHUB', category: 'Eating out' },
  { pattern: '\\bUBER\\b|\\bLYFT\\b|\\bTFL\\b|\\bBOLT\\b', category: 'Transport' },
  { pattern: 'TESCO|WALMART|\\bALDI\\b|\\bLIDL\\b|SAINSBURY|\\bASDA\\b|KROGER|COSTCO|WHOLE FOODS|TRADER JOE|SAFEWAY|WOOLWORTHS|\\bCOLES\\b|MORRISONS|WAITROSE|\\bREWE\\b', category: 'Groceries' },
  { pattern: 'NETFLIX|SPOTIFY|DISNEY\\s*PLUS|DISNEYPLUS|\\bHULU\\b|YOUTUBE ?PREMIUM|APPLE\\.COM/BILL|ICLOUD|AUDIBLE|PRIME VIDEO', category: 'Subscriptions' },
  { pattern: 'STARBUCKS|COSTA COFFEE|\\bCOSTA\\b|\\bPRET\\b|DUNKIN|TIM HORTONS|CAFFE NERO', category: 'Coffee' },
  { pattern: 'MCDONALD|BURGER KING|\\bKFC\\b|CHIPOTLE|\\bSUBWAY\\b|NANDO|GREGGS|DOMINO|PIZZA', category: 'Eating out' },
  { pattern: '\\bSHELL\\b|\\bBP\\b|EXXON|CHEVRON|\\bESSO\\b|TEXACO|PETROL|\\bFUEL\\b', category: 'Transport' },
  { pattern: 'AMAZON|\\bAMZN\\b|\\bEBAY\\b|\\bTARGET\\b|\\bETSY\\b|\\bARGOS\\b', category: 'Shopping' },
  { pattern: '\\bCVS\\b|WALGREENS|\\bBOOTS\\b|PHARMACY|SUPERDRUG', category: 'Health' },
  { pattern: '\\bGYM\\b|PUREGYM|PLANET FITNESS|PELOTON', category: 'Health' },
  { pattern: 'AT&T|VERIZON|T-MOBILE|VODAFONE|\\bO2\\b|EE LIMITED|GIFFGAFF', category: 'Bills' },
  { pattern: 'COMCAST|XFINITY|SPECTRUM|BT GROUP|VIRGIN MEDIA|SKY DIGITAL', category: 'Bills' },
  { pattern: 'ELECTRIC|BRITISH GAS|OCTOPUS ENERGY|\\bEDF\\b|CON ED|PG&E|DUKE ENERGY|\\bWATER\\b', category: 'Bills' },
  { pattern: '\\bRENT\\b|MORTGAGE|LANDLORD|\\bMIETE\\b', category: 'Home' },
  { pattern: '\\bIKEA\\b|HOME DEPOT|LOWE\'?S|\\bB&Q\\b|WICKES', category: 'Home' },
  { pattern: 'CINEMA|\\bAMC\\b|ODEON|\\bVUE\\b|STEAM|PLAYSTATION|\\bXBOX\\b|NINTENDO|TICKETMASTER', category: 'Fun' },
  { pattern: 'TRAINLINE|AMTRAK|NATIONAL RAIL|GREYHOUND|PARKING|RINGGO|PAYBYPHONE|DB VERTRIEB', category: 'Transport' },
  { pattern: 'PETSMART|PETCO|PETS AT HOME|\\bVETS?\\b', category: 'Kids & pets' },
  { pattern: 'COUNCIL TAX|\\bIRS\\b|\\bHMRC\\b', category: 'Bills' },
  { pattern: 'INSURANCE|GEICO|PROGRESSIVE|ADMIRAL|AVIVA|DIRECT LINE', category: 'Bills' },
];

export function buildStarterRules(categories: Category[], makeId: () => string): Omit<Rule, 'updatedAt'>[] {
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  return STARTER_RULES.flatMap((r, i) => {
    const categoryId = byName.get(r.category.toLowerCase());
    return categoryId ? [{ id: makeId(), matchType: 'regex' as const, pattern: r.pattern, categoryId, renameTo: r.renameTo, priority: 1000 + i * 10 }] : [];
  });
}
