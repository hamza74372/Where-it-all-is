import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { ISODate, Schedule, ScheduleKind } from '../db/types';
import { daysInMonth, parts } from '../lib/dates';
import { parseAmount, toInputString, type DecimalMark, type Minor } from '../lib/money';
import { describeSchedule } from '../lib/schedule';
import { useData } from '../state/store';
import { useFmt, useToday } from './hooks';

export const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

let fieldSeq = 0;
const useId = (prefix: string) => useState(() => `${prefix}-${++fieldSeq}`)[0];

export function Field(props: { label: string; hint?: string; htmlFor?: string; children: ComponentChildren }) {
  return (
    <div class="field">
      <label class="field-label" for={props.htmlFor}>
        {props.label}
      </label>
      {props.children}
      {props.hint && <p class="field-hint">{props.hint}</p>}
    </div>
  );
}

export function TextInput(props: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId('txt');
  return (
    <Field label={props.label} hint={props.hint} htmlFor={id}>
      <input
        id={id}
        class="input"
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </Field>
  );
}

export type MoneyCheck =
  | { state: 'ok'; value: Minor }
  | { state: 'empty' }
  | { state: 'confirm' }
  | { state: 'invalid' };

/** Validate a money input's text. Only 'ok' may be saved; 'confirm' means the prompt is showing. */
export function checkMoney(text: string, dec: DecimalMark): MoneyCheck {
  if (!text.trim()) return { state: 'empty' };
  const p = parseAmount(text, dec);
  if (p.kind === 'ok') return { state: 'ok', value: p.value };
  return { state: p.kind };
}

export function moneyText(amount: Minor | undefined | null, dec: DecimalMark): string {
  return amount == null ? '' : toInputString(amount, dec).replace(/[.,]00$/, '');
}

export function MoneyInput(props: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  hint?: string;
  autoFocus?: boolean;
  /** Force the "did you mean" prompt / error to show (e.g. after a save attempt). */
  showErrors?: boolean;
  /** Fuller name for screen readers when the visible label is short (e.g. "Rent amount"). */
  ariaLabel?: string;
}) {
  const id = useId('money');
  const { settings } = useData();
  const fmt = useFmt();
  const dec = settings.decimalSeparator;
  const [touched, setTouched] = useState(false);
  const parsed = props.value.trim() ? parseAmount(props.value, dec) : null;
  const show = touched || props.showErrors;

  return (
    <Field label={props.label} hint={props.hint} htmlFor={id}>
      <input
        id={id}
        class="input input-money"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={dec === ',' ? '0,00' : '0.00'}
        value={props.value}
        autoFocus={props.autoFocus}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onBlur={() => setTouched(true)}
        aria-label={props.ariaLabel}
        aria-invalid={show && parsed?.kind === 'invalid' ? 'true' : undefined}
      />
      {show && parsed?.kind === 'confirm' && (
        <div class="did-you-mean" role="alert">
          <span>Did you mean {fmt.money(parsed.suggested)}?</span>
          <div class="row-gap">
            <button type="button" class="btn btn-small btn-primary" onClick={() => props.onInput(moneyText(parsed.suggested, dec))}>
              Yes
            </button>
            {parsed.literal != null && (
              <button type="button" class="btn btn-small" onClick={() => props.onInput(toInputString(parsed.literal!, dec))}>
                No, {fmt.money(parsed.literal)}
              </button>
            )}
          </div>
        </div>
      )}
      {show && parsed?.kind === 'invalid' && (
        <p class="field-error" role="alert">
          That doesn't look like an amount. Try something like {dec === ',' ? '12,50' : '12.50'}.
        </p>
      )}
    </Field>
  );
}

export function DateInput(props: { label: string; value: ISODate; onInput: (v: ISODate) => void; hint?: string }) {
  const id = useId('date');
  const fmt = useFmt();
  const today = useToday();
  // "10/09" means different days in the US and UK, so always spell the date out.
  const words = fmt.dayLong(props.value) + (props.value.slice(0, 4) !== today.slice(0, 4) ? ` ${props.value.slice(0, 4)}` : '');
  return (
    <Field label={props.label} hint={props.hint} htmlFor={id}>
      <input
        id={id}
        class="input"
        type="date"
        value={props.value}
        required
        aria-describedby={`${id}-words`}
        onInput={(e) => e.currentTarget.value && props.onInput(e.currentTarget.value)}
      />
      <p id={`${id}-words`} class="date-words" aria-live="polite">
        {words}
      </p>
    </Field>
  );
}

export function Select<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  hint?: string;
}) {
  const id = useId('sel');
  return (
    <Field label={props.label} hint={props.hint} htmlFor={id}>
      <select id={id} class="input" value={props.value} onChange={(e) => props.onChange(e.currentTarget.value as T)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div class="toggle-row">
      <div>
        <div class="toggle-label">{props.label}</div>
        {props.hint && <p class="field-hint">{props.hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        class="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        onClick={() => props.onChange(!props.checked)}
      >
        <span class="switch-track">
          <span class="switch-knob" />
        </span>
      </button>
    </div>
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const KIND_OPTIONS: Array<{ value: ScheduleKind; label: string }> = [
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Every month' },
  { value: 'everyNMonths', label: 'Every few months' },
  { value: 'yearly', label: 'Every year' },
  { value: 'once', label: 'Just once' },
];

/** Keep dayOfMonth in step with the chosen date for month-based schedules. */
export function normaliseSchedule(s: Schedule, lastDay = false): Schedule {
  const d = parts(s.anchorDate).d;
  switch (s.kind) {
    case 'monthly':
    case 'everyNMonths':
    case 'yearly':
      return { ...s, dayOfMonth: lastDay ? 31 : d, n: s.kind === 'everyNMonths' ? s.n ?? 3 : undefined, secondDayOfMonth: undefined };
    case 'semimonthly':
      return { ...s, dayOfMonth: s.dayOfMonth ?? 1, secondDayOfMonth: s.secondDayOfMonth ?? 15, n: undefined };
    default:
      return { ...s, dayOfMonth: undefined, secondDayOfMonth: undefined, n: undefined };
  }
}

export function ScheduleFields(props: { value: Schedule; onChange: (s: Schedule) => void; dateLabel: string }) {
  const s = props.value;
  const { y, m, d } = parts(s.anchorDate);
  const isLastDay = (s.kind === 'monthly' || s.kind === 'everyNMonths') && (s.dayOfMonth ?? d) >= 31;
  const set = (patch: Partial<Schedule>, lastDay = isLastDay) => props.onChange(normaliseSchedule({ ...s, ...patch }, lastDay));
  const dayNum = (label: string, value: number, onChange: (n: number) => void) => (
    <label class="inline-num">
      <span>{label}</span>
      <input
        class="input input-narrow"
        type="number"
        inputMode="numeric"
        min={1}
        max={31}
        value={value}
        onInput={(e) => {
          const n = Math.min(31, Math.max(1, Number(e.currentTarget.value) || 1));
          onChange(n);
        }}
      />
    </label>
  );

  return (
    <div class="schedule-fields">
      <Select label="How often" value={s.kind} options={KIND_OPTIONS} onChange={(kind) => set({ kind }, false)} />
      {s.kind === 'semimonthly' ? (
        <Field label="On these days of the month">
          <div class="row-gap">
            {dayNum('First', s.dayOfMonth ?? 1, (n) => set({ dayOfMonth: n }))}
            {dayNum('Second', s.secondDayOfMonth ?? 15, (n) => set({ secondDayOfMonth: n }))}
          </div>
        </Field>
      ) : (
        <DateInput label={props.dateLabel} value={s.anchorDate} onInput={(anchorDate) => set({ anchorDate })} />
      )}
      {s.kind === 'everyNMonths' && (
        <Field label="Every how many months?">
          <input
            class="input input-narrow"
            type="number"
            inputMode="numeric"
            min={2}
            max={24}
            value={s.n ?? 3}
            onInput={(e) => set({ n: Math.min(24, Math.max(2, Number(e.currentTarget.value) || 2)) })}
          />
        </Field>
      )}
      {(s.kind === 'monthly' || s.kind === 'everyNMonths') && d >= daysInMonth(y, m) - 3 && (
        <Toggle
          label="Always the last day of the month"
          checked={isLastDay}
          onChange={(v) => props.onChange(normaliseSchedule(s, v))}
        />
      )}
      {s.kind !== 'once' && (
        <Select
          label="If it lands on a weekend"
          value={s.weekendShift}
          options={[
            { value: 'none', label: 'Keep the date' },
            { value: 'before', label: 'Move to the Friday before' },
            { value: 'after', label: 'Move to the Monday after' },
          ]}
          onChange={(weekendShift) => set({ weekendShift })}
        />
      )}
      <p class="field-hint schedule-summary">{capitalise(describeSchedule(s))}.</p>
    </div>
  );
}
