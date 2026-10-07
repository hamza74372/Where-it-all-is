// Icon keys for categories, goals and quick-log chips (names from the Lucide set in ui/icons.tsx).
// Data from before icons (schema < 4, older backups, older partner shares) stored an emoji; this
// turns it into the matching key so nothing shows an emoji any more.

export const LEGACY_EMOJI: Record<string, string> = {
  '🛒': 'shopping-cart', '🍔': 'utensils', '🍽️': 'utensils', '☕': 'coffee', '🥪': 'sandwich', '🚌': 'bus', '🚗': 'car', '⛽': 'fuel',
  '🛍️': 'shopping-bag', '🎉': 'party-popper', '💊': 'pill', '🏠': 'house', '🧾': 'receipt', '📺': 'tv', '🎁': 'gift', '🧸': 'baby',
  '🐾': 'paw-print', '📦': 'package', '💡': 'lightbulb', '✂️': 'scissors', '🏦': 'landmark', '✈️': 'plane', '🛟': 'life-buoy', '⭐': 'star',
  '📱': 'smartphone', '🌐': 'wifi', '⚡': 'zap', '💧': 'droplet', '🔥': 'flame', '📚': 'book', '🎓': 'graduation-cap', '💰': 'piggy-bank',
};

// Emoji are compared without the variation selector (U+FE0F), which some devices add and some don't.
const bare = (s: string) => s.replace(/️/g, '');
const BY_BARE_EMOJI = new Map(Object.entries(LEGACY_EMOJI).map(([emoji, key]) => [bare(emoji), key]));

/** An icon key from whatever was stored: a key already, an old emoji, or nothing. */
export function iconKeyFrom(value: string | undefined): string {
  if (!value) return 'package';
  if (/^[a-z][a-z-]*$/.test(value)) return value;
  return BY_BARE_EMOJI.get(bare(value)) ?? 'package';
}

/** Move a record's old `emoji` field to `icon`. */
export function withIcon<T extends { icon?: string; emoji?: string }>(row: T): Omit<T, 'emoji'> & { icon: string } {
  const { emoji, ...rest } = row;
  return { ...rest, icon: iconKeyFrom(row.icon ?? emoji) };
}
