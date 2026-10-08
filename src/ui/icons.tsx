// One line-icon set for the whole interface: Lucide (ISC licence, lucide.dev), inlined as SVG —
// no icon font, no network. One stroke width (--stroke), drawn at 24 px (or 20 px with small).
// Categories, goals and quick-log chips store one of these keys; text the user types is free.

import {
  ArrowLeftRight, Baby, Banknote, Bike, Book, Building2, Bus, CalendarDays, Car, Cat, ChartNoAxesColumn, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleCheck, Coffee, Dog, Droplet, Dumbbell, Ellipsis, Flame, Fuel, Gamepad2, Gift, GraduationCap,
  Focus, HandCoins, Heart, House, Inbox, Info, Landmark, LifeBuoy, Lightbulb, List, Music, Package, PartyPopper, PawPrint, PiggyBank, Pill,
  Plane, Plus, Popcorn, Receipt, ReceiptText, Sandwich, Scissors, Search, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles,
  Sprout, Star, Stethoscope, Sun, TrainFront, TriangleAlert, Tv, Users, Utensils, Wallet, Wifi, X, Zap,
  type IconNode,
} from 'lucide';
import { iconKeyFrom } from '../lib/iconKeys';

/** Interface icons (navigation, actions). */
const UI = {
  today: Sun,
  log: List,
  bills: ReceiptText,
  plan: ChartNoAxesColumn,
  more: Ellipsis,
  partner: Users,
  plus: Plus,
  close: X,
  info: Info,
  back: ChevronLeft,
  forward: ChevronRight,
  down: ChevronDown,
  check: Check,
  done: CircleCheck,
  warn: TriangleAlert,
  transfer: ArrowLeftRight,
  pay: HandCoins,
  calendar: CalendarDays,
  search: Search,
  focus: Focus,
  inbox: Inbox,
  wallet: Wallet,
} satisfies Record<string, IconNode>;

/** Icons a person can give a category, goal or quick-log chip (same set, same style). */
export const CHOICE_ICONS = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  coffee: Coffee,
  sandwich: Sandwich,
  bus: Bus,
  train: TrainFront,
  car: Car,
  fuel: Fuel,
  bike: Bike,
  'shopping-bag': ShoppingBag,
  shirt: Shirt,
  'party-popper': PartyPopper,
  popcorn: Popcorn,
  music: Music,
  gamepad: Gamepad2,
  pill: Pill,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  house: House,
  lightbulb: Lightbulb,
  zap: Zap,
  droplet: Droplet,
  flame: Flame,
  wifi: Wifi,
  smartphone: Smartphone,
  receipt: Receipt,
  tv: Tv,
  gift: Gift,
  heart: Heart,
  baby: Baby,
  'paw-print': PawPrint,
  cat: Cat,
  dog: Dog,
  book: Book,
  'graduation-cap': GraduationCap,
  scissors: Scissors,
  sparkles: Sparkles,
  sprout: Sprout,
  landmark: Landmark,
  building: Building2,
  banknote: Banknote,
  'piggy-bank': PiggyBank,
  'life-buoy': LifeBuoy,
  plane: Plane,
  star: Star,
  package: Package,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof UI | keyof typeof CHOICE_ICONS;
const ALL: Record<string, IconNode> = { ...UI, ...CHOICE_ICONS };

/** A valid icon key for anything stored: a key, an old emoji (data from before icons), or nothing. */
export function iconFor(key: string | undefined): IconName {
  const k = iconKeyFrom(key);
  return (k in ALL ? k : 'package') as IconName;
}

export function Icon({ name, label, small }: { name: IconName | string | undefined; label?: string; small?: boolean }) {
  const node = (name && ALL[name]) || ALL[iconFor(name)];
  return (
    <svg
      class={small ? 'icon icon-sm' : 'icon'}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {node.map(([tag, attrs], i) => {
        const Tag = tag as 'path';
        return <Tag key={i} {...(attrs as Record<string, string>)} />;
      })}
    </svg>
  );
}

/** A category/goal/chip icon in a small tinted circle, for list rows. */
export function RowIcon({ name }: { name: string | undefined }) {
  return (
    <span class="row-icon" aria-hidden="true">
      <Icon name={iconFor(name)} small />
    </span>
  );
}

const iconLabel = (key: string) => (key.charAt(0).toUpperCase() + key.slice(1)).replace(/-/g, ' ');

/** Pick an icon for a category, goal or chip (radio group; arrow keys move, like any radio set). */
export function IconPicker({ value, onChange, label = 'Icon' }: { value: string; onChange: (key: string) => void; label?: string }) {
  const current = iconFor(value);
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="icon-grid" role="radiogroup" aria-label={label}>
        {(Object.keys(CHOICE_ICONS) as Array<keyof typeof CHOICE_ICONS>).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={current === key}
            aria-label={iconLabel(key)}
            class="icon-choice"
            onClick={() => onChange(key)}
          >
            <Icon name={key} />
          </button>
        ))}
      </div>
    </div>
  );
}
