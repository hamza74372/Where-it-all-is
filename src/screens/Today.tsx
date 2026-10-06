// Spec §7.2 — one big number, a 3-second log box, and one gentle next action.

import { useMemo, useRef, useState } from 'preact/hooks';
import type { Bill, Income } from '../db/types';
import { catchUp, type CatchUp } from '../lib/away';
import { getPref, setPref } from '../lib/prefs';
import { addDays } from '../lib/dates';
import { nextBills, overdueOccurrences } from '../lib/bills';
import { parseQuickLog } from '../lib/quickLog';
import { computeSafeToSpend, type SafeToSpendResult } from '../lib/safeToSpend';
import {
  billPaymentAmount, categoryByName, clearExampleData, confirmPay, logTransaction, markBillPaid, type Undo,
} from '../state/actions';
import { useNav } from '../state/nav';
import { useData, useStore, type AppData } from '../state/store';
import { checkMoney, MoneyInput, moneyText } from '../ui/fields';
import { useFmt, useToday, type Fmt } from '../ui/hooks';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';

export function useSafeToSpend(data: AppData, today: string): SafeToSpendResult {
  return useMemo(
    () =>
      computeSafeToSpend({
        today,
        accounts: data.accounts,
        transactions: data.transactions,
        incomes: data.incomes,
        bills: data.bills,
        goals: data.goals,
        settings: data.settings,
      }),
    [data, today],
  );
}

export function Today() {
  const data = useData();
  const today = useToday();
  const fmt = useFmt();
  const result = useSafeToSpend(data, today);
  const store = useStore();
  const logRef = useRef<HTMLInputElement>(null);
  const greeting = data.settings.name ? `Hi ${data.settings.name}` : 'Today';
  const [focus, setFocus] = useState(() => getPref('focus', false));
  const [awayDismissed, setAwayDismissed] = useState(false);
  const away = awayDismissed ? null : catchUp(store.previousOpenedAt, today, data.bills, data.incomes, data.transactions);
  const showAway = !!away && away.bills.length + away.paydays.length > 0;
  const toggleFocus = () => {
    setFocus(!focus);
    setPref('focus', !focus);
  };

  return (
    <>
      {data.settings.exampleData && !focus && <ExampleBanner />}
      <div class="title-row">
        <h1 class="screen-title">{greeting}</h1>
        <button type="button" class="btn btn-small focus-btn" aria-pressed={focus} onClick={toggleFocus}>
          {focus ? 'Show everything' : 'Focus'}
        </button>
      </div>
      {/* The payday card stays in focus mode: without it the number would look wrong on payday. */}
      {result.unconfirmedPaydaysToday.map((p) => {
        const income = data.incomes.find((i) => i.id === p.incomeId);
        return income ? <PaydayCard key={income.id} income={income} today={today} /> : null;
      })}
      {!focus && showAway && <AwayCard away={away!} today={today} onDismiss={() => setAwayDismissed(true)} />}
      <SafeNumber result={result} fmt={fmt} />
      <QuickLog inputRef={logRef} />
      {!focus && (
        <>
          <RightNow today={today} skipOverdue={showAway} onLogFocus={() => logRef.current?.focus()} />
          <NextBillsCard today={today} />
        </>
      )}
    </>
  );
}

function AwayCard({ away, today, onDismiss }: { away: CatchUp; today: string; onDismiss: () => void }) {
  const store = useStore();
  const fmt = useFmt();
  const confirmable = away.paydays.filter((p) => !p.income.variable);
  const variable = away.paydays.filter((p) => p.income.variable);

  const payBill = (bill: Bill, date: string) => markBillPaid(store, bill, date, date, billPaymentAmount(store, bill, today));
  const confirmAll = async () => {
    const undos: Undo[] = [];
    for (const b of away.bills) undos.push(await payBill(b.bill, b.date));
    for (const p of confirmable) undos.push(await confirmPay(store, p.income, p.date, p.income.amount));
    toast(`Caught up: ${undos.length} ${undos.length === 1 ? 'item' : 'items'} confirmed`, async () => {
      for (const u of undos.reverse()) await u();
    });
  };

  return (
    <section class="card card-accent" aria-labelledby="away-title">
      <h2 id="away-title" class="card-title">
        While you were away
      </h2>
      <p class="muted">Welcome back. Since {fmt.day(away.since)}, these were due. Confirm what happened and your number catches up.</p>
      <ul class="rows">
        {away.paydays.map((p) => (
          <li key={`p-${p.income.id}-${p.date}`} class="row">
            <span class="row-main">
              <span>💰 {p.income.name}</span>
              <span class="row-sub">
                {fmt.day(p.date)} · {p.income.variable ? 'amount varies' : fmt.money(p.income.amount)}
              </span>
            </span>
            {p.income.variable ? (
              <span class="row-sub">Confirm on its own below</span>
            ) : (
              <button
                type="button"
                class="btn btn-small"
                onClick={async () => toast(`${p.income.name} confirmed`, await confirmPay(store, p.income, p.date, p.income.amount))}
              >
                It arrived
              </button>
            )}
          </li>
        ))}
        {away.bills.map((b) => (
          <li key={`b-${b.bill.id}-${b.date}`} class="row">
            <span class="row-main">
              <span>{b.bill.name}</span>
              <span class="row-sub">
                {fmt.day(b.date)} · {fmt.money(billPaymentAmount(store, b.bill, today))}
                {b.bill.autopay ? ' · autopay' : ''}
              </span>
            </span>
            <button type="button" class="btn btn-small" onClick={async () => toast(`${b.bill.name} marked paid`, await payBill(b.bill, b.date))}>
              Paid
            </button>
          </li>
        ))}
      </ul>
      {variable.map((p) => (
        <PaydayCard key={`v-${p.income.id}-${p.date}`} income={p.income} today={p.date} />
      ))}
      <div class="row-gap">
        {away.bills.length + confirmable.length > 1 && (
          <button type="button" class="btn btn-primary" onClick={confirmAll}>
            They all happened
          </button>
        )}
        <button type="button" class="btn btn-quiet" onClick={onDismiss}>
          Later
        </button>
      </div>
    </section>
  );
}

function ExampleBanner() {
  const store = useStore();
  const [confirming, setConfirming] = useState(false);
  return (
    <div class="card card-note" role="note">
      <p>You're looking at example numbers. Nothing here is real.</p>
      {confirming ? (
        <div class="row-gap">
          <button type="button" class="btn btn-small btn-primary" onClick={() => clearExampleData(store)}>
            Yes, clear and set up mine
          </button>
          <button type="button" class="btn btn-small" onClick={() => setConfirming(false)}>
            Keep exploring
          </button>
        </div>
      ) : (
        <button type="button" class="btn btn-small" onClick={() => setConfirming(true)}>
          Clear examples
        </button>
      )}
    </div>
  );
}

function PaydayCard({ income, today }: { income: Income; today: string }) {
  const store = useStore();
  const fmt = useFmt();
  const dec = store.data.settings.decimalSeparator;
  const [mode, setMode] = useState<'ask' | 'edit' | 'later'>('ask');
  const [text, setText] = useState(moneyText(income.amount, dec));
  const [showErrors, setShowErrors] = useState(false);
  if (mode === 'later') return null;

  const confirm = async (amount: number) => {
    const undo = await confirmPay(store, income, today, amount);
    toast(`Pay confirmed: ${fmt.money(amount)}`, undo);
  };

  return (
    <section class="card card-accent" aria-labelledby={`payday-${income.id}`}>
      <h2 id={`payday-${income.id}`} class="card-title">
        Payday — confirm your pay
      </h2>
      {mode === 'ask' ? (
        <>
          <p>
            Has your {income.name.toLowerCase()} {income.variable ? 'arrived' : `of ${fmt.money(income.amount)} arrived`}?
            Your number updates once it's in.
          </p>
          <div class="row-gap">
            {!income.variable && (
              <button type="button" class="btn btn-primary" onClick={() => confirm(income.amount)}>
                Yes, it's in
              </button>
            )}
            <button type="button" class={income.variable ? 'btn btn-primary' : 'btn'} onClick={() => setMode('edit')}>
              {income.variable ? 'Enter amount' : 'Different amount'}
            </button>
            <button type="button" class="btn btn-quiet" onClick={() => setMode('later')}>
              Not yet
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = checkMoney(text, dec);
            if (c.state !== 'ok' || c.value <= 0) return setShowErrors(true);
            confirm(c.value);
          }}
        >
          <MoneyInput label="Amount that arrived" value={text} onInput={setText} autoFocus showErrors={showErrors} />
          <div class="row-gap">
            <button type="submit" class="btn btn-primary">
              Confirm
            </button>
            <button type="button" class="btn btn-quiet" onClick={() => setMode('ask')}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function SafeNumber({ result, fmt }: { result: SafeToSpendResult; fmt: Fmt }) {
  const [open, setOpen] = useState(false);
  const nav = useNav();
  const until =
    result.nextPaydaySource === 'income' ? `until payday ${fmt.day(result.nextPayday)}` : 'until the end of the month';
  // The big number is whole units: safe-to-spend rounds down, a shortfall rounds up — both
  // err on the careful side. Everything else keeps its cents.
  const whole = { wholeIfRound: true };
  const UNIT = 100;
  const downToWhole = (n: number) => Math.floor(n / UNIT) * UNIT;
  const upToWhole = (n: number) => Math.ceil(n / UNIT) * UNIT;

  return (
    <section class="card hero" aria-labelledby="safe-label">
      {result.status === 'ok' ? (
        <>
          <h2 id="safe-label" class="hero-label">
            Safe to spend today
          </h2>
          <button type="button" class="hero-number" onClick={() => setOpen(true)} aria-describedby="safe-sub">
            <span class="big-number">{fmt.money(downToWhole(Math.max(0, result.safeToSpendToday)), whole)}</span>
            <span class="sr-only">. How is this worked out?</span>
          </button>
          <p id="safe-sub" class="muted">
            {result.safeToSpendToday < 0
              ? `You've gone ${fmt.money(-result.safeToSpendToday)} past today's share — that's fine, the days ahead adjust. `
              : ''}
            {capital(until)}: {fmt.money(result.safeToSpendPeriod)}
          </p>
        </>
      ) : (
        <>
          <h2 id="safe-label" class="hero-label">
            Tight until payday
          </h2>
          <button type="button" class="hero-number" onClick={() => setOpen(true)}>
            <span class="big-number big-number-tight">{fmt.money(upToWhole(result.shortfall), whole)}</span>
            <span class="sr-only">. How is this worked out?</span>
          </button>
          <p class="muted">short of covering everything {until}.</p>
          {result.unconfirmedPaydaysToday.length > 0 ? (
            <p>Your pay isn't counted until you confirm it above — this will update then.</p>
          ) : (
            <>
              <p>One idea: check whether a bill can move to after payday.</p>
              <button type="button" class="btn btn-small" onClick={() => nav('bills')}>
                Look at bills
              </button>
            </>
          )}
        </>
      )}
      <button type="button" class="link-btn how-link block-center" onClick={() => setOpen(true)}>
        How is this worked out?
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="How this is worked out">
        <Explain result={result} fmt={fmt} />
      </Sheet>
    </section>
  );
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

function Explain({ result: r, fmt }: { result: SafeToSpendResult; fmt: Fmt }) {
  const lastDay = addDays(r.nextPayday, -1);
  const line = (label: string, amount: number, sign: '+' | '−' | '=' | '', sub?: string) => (
    <li class={`explain-line ${sign === '=' ? 'explain-total' : ''}`}>
      <span>
        {label}
        {sub && <span class="explain-sub">{sub}</span>}
      </span>
      <span class="mono">
        {sign && sign !== '=' ? `${sign} ` : ''}
        {fmt.money(amount)}
      </span>
    </li>
  );
  return (
    <div class="explain">
      <p class="muted">
        This covers today to {fmt.dayLong(lastDay)} — {r.daysLeft} {r.daysLeft === 1 ? 'day' : 'days'}
        {r.nextPaydaySource === 'income' ? ', the day before your next pay.' : '. No payday is set, so we plan to the end of the month.'}
      </p>
      <ul class="explain-list">
        {r.accountLines.map((a) => line(a.name, a.balance, '', 'Balance now'))}
        {r.spentToday > 0 && line('Spent today (counted separately below)', r.spentToday, '+')}
        {r.billLines.map((b) =>
          line(b.name, b.amount, '−', `Due ${fmt.day(b.date)}${b.amountSource === 'cardBalance' ? ' · what you owe on the card' : ''}`),
        )}
        {r.lookAhead && r.lookAhead.setAside > 0 &&
          line(
            'Set aside for next period’s bills',
            r.lookAhead.setAside,
            '−',
            `Bills ${fmt.day(r.lookAhead.periodStart)} – ${fmt.day(r.lookAhead.periodEnd)}: ${fmt.money(r.lookAhead.billsTotal)} · next pay: ${fmt.money(r.lookAhead.expectedPay)}`,
          )}
        {r.goalLines.map((g) => line(`Goal: ${g.name}`, g.amount, '−', 'Set aside this payday'))}
        {r.buffer > 0 && line('Cushion you keep back', r.buffer, '−')}
        {line('Left for the period', r.startOfDay, '=')}
        {line(`Shared over ${r.daysLeft} ${r.daysLeft === 1 ? 'day' : 'days'}`, r.dailyAllowance, '=', 'Rounded down')}
        {r.spentToday > 0 && line('Already spent today', r.spentToday, '−')}
        {line('Safe to spend today', r.safeToSpendToday, '=', 'Shown on Today rounded down to a whole amount')}
      </ul>
      {r.billLines.length === 0 && <p class="muted">No bills are due before your next pay.</p>}
      {r.lookAhead && (
        <p class="muted">
          {r.lookAhead.setAside > 0
            ? `Looking ahead: bills from ${fmt.day(r.lookAhead.periodStart)} to ${fmt.day(r.lookAhead.periodEnd)} come to ${fmt.money(r.lookAhead.billsTotal)}, but your next pay is about ${fmt.money(r.lookAhead.expectedPay)}. The ${fmt.money(r.lookAhead.setAside)} gap is kept back now so those bills are covered.`
            : `Looking ahead: your next pay (about ${fmt.money(r.lookAhead.expectedPay)}) covers the ${fmt.money(r.lookAhead.billsTotal)} of bills due ${fmt.day(r.lookAhead.periodStart)} – ${fmt.day(r.lookAhead.periodEnd)}.`}
        </p>
      )}
      {r.cardsToPay.length > 0 && (
        <p class="muted">
          Card spending isn't taken off straight away. You owe{' '}
          {r.cardsToPay.map((c) => `${fmt.money(c.amount)} on ${c.name}`).join(', ')}; it's set aside when the card bill
          is due.
        </p>
      )}
      <p class="muted">Savings and accounts you've left out of safe-to-spend aren't counted.</p>
    </div>
  );
}

function QuickLog({ inputRef }: { inputRef: { current: HTMLInputElement | null } }) {
  const store = useStore();
  const { categories, settings } = useData();
  const fmt = useFmt();
  const today = useToday();
  const [text, setText] = useState('');
  const dec = settings.decimalSeparator;
  const parsed = parseQuickLog(text, categories, dec);
  const cat = parsed.kind === 'ok' ? categories.find((c) => c.id === parsed.categoryId) : undefined;

  const save = async (amount: number, override?: { categoryId?: string; note?: string; direction?: 'in' | 'out' }) => {
    if (parsed.kind !== 'ok' && !override) return;
    const p = parsed.kind === 'ok' ? parsed : null;
    const direction = override?.direction ?? p?.direction ?? 'out';
    const categoryId = override?.categoryId ?? p?.categoryId;
    const { undo } = await logTransaction(store, {
      amount, direction, date: today, categoryId, note: override?.note ?? p?.note ?? '',
    });
    const catName = categories.find((c) => c.id === categoryId)?.name;
    toast(`${direction === 'in' ? 'Added' : 'Logged'} ${fmt.money(amount)}${catName ? ` · ${catName}` : ''}`, undo);
    setText('');
  };

  return (
    <section class="card" aria-labelledby="ql-label">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.kind === 'ok' && !parsed.confirm) save(parsed.amount);
        }}
      >
        <label id="ql-label" for="quick-log" class="card-title">
          Log a spend
        </label>
        <div class="ql-row">
          <input
            id="quick-log"
            ref={inputRef}
            class="input"
            type="text"
            enterKeyHint="done"
            autoComplete="off"
            placeholder={`Try "${dec === ',' ? '12,50' : '12.50'} coffee"`}
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            aria-describedby="ql-preview"
          />
          <button type="submit" class="btn btn-primary" disabled={parsed.kind !== 'ok' || !!parsed.confirm}>
            Save
          </button>
        </div>
        <p id="ql-preview" class="ql-preview" aria-live="polite">
          {parsed.kind === 'ok' && !parsed.confirm && (
            <>
              {parsed.direction === 'in' ? 'Money in: ' : ''}
              {fmt.money(parsed.amount)} · {cat ? `${cat.emoji} ${cat.name}` : 'No category yet'}
            </>
          )}
          {parsed.kind === 'noAmount' && <>Add an amount, like "{dec === ',' ? '4,50' : '4.50'} {parsed.text}".</>}
        </p>
        {parsed.kind === 'ok' && parsed.confirm && (
          <div class="did-you-mean" role="alert">
            <span>Did you mean {fmt.money(parsed.confirm.suggested)}?</span>
            <div class="row-gap">
              <button type="button" class="btn btn-small btn-primary" onClick={() => save(parsed.confirm!.suggested)}>
                Yes
              </button>
              {parsed.confirm.literal != null && (
                <button type="button" class="btn btn-small" onClick={() => save(parsed.confirm!.literal!)}>
                  No, {fmt.money(parsed.confirm.literal)}
                </button>
              )}
            </div>
          </div>
        )}
      </form>
      {settings.presets.length > 0 && (
        <div class="chips" role="group" aria-label="One-tap spends">
          {settings.presets.map((p) => (
            <button
              key={p.id}
              type="button"
              class="chip"
              onClick={() =>
                save(p.amount, { categoryId: categoryByName(categories, p.categoryName)?.id, note: p.label, direction: 'out' })
              }
            >
              <span aria-hidden="true">{p.emoji}</span> {p.label} {fmt.money(p.amount, { wholeIfRound: true })}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function RightNow({ today, skipOverdue, onLogFocus }: { today: string; skipOverdue: boolean; onLogFocus: () => void }) {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const [dismissed, setDismissed] = useState<string[]>([]);

  type Item = { key: string; text: string; action: string; run: () => void | Promise<void> };
  const items: Item[] = [];

  for (const bill of skipOverdue ? [] : data.bills) {
    for (const due of overdueOccurrences(bill, today, data.transactions)) {
      items.push({
        key: `overdue-${bill.id}-${due}`,
        text: `Did ${bill.name} get paid on ${fmt.day(due)}?`,
        action: 'Yes, mark paid',
        run: async () => {
          const undo = await markBillPaid(store, bill, due, due, billPaymentAmount(store, bill, today));
          toast(`${bill.name} marked paid`, undo);
        },
      });
    }
  }
  for (const item of nextBills(data.bills, today, data.transactions, 10).filter((i) => i.date === today)) {
    items.push({
      key: `today-${item.bill.id}`,
      text: `${item.bill.name} is due today${item.bill.autopay ? ' (autopay)' : ''}.`,
      action: 'Mark paid',
      run: async () => {
        const undo = await markBillPaid(store, item.bill, today, today, billPaymentAmount(store, item.bill, today));
        toast(`${item.bill.name} marked paid`, undo);
      },
    });
  }
  const yesterday = addDays(today, -1);
  const spends = data.transactions.filter((t) => t.source === 'manual' || t.source === 'import');
  const loggedRecently = spends.some((t) => t.date >= yesterday);
  if (data.accounts.length && spends.length === 0) {
    items.push({ key: 'first-log', text: 'Log your first spend — even a coffee counts. Type it in the box above.', action: 'Log a spend', run: onLogFocus });
  } else if (!loggedRecently && data.accounts.length) {
    items.push({ key: `log-${today}`, text: 'Anything to log from yesterday? Even one thing helps.', action: 'Log something', run: onLogFocus });
  }

  const item = items.find((i) => !dismissed.includes(i.key));
  return (
    <section class="card" aria-labelledby="rn-title">
      <h2 id="rn-title" class="card-title">
        Right now — one thing
      </h2>
      {item ? (
        <>
          <p>{item.text}</p>
          <div class="row-gap">
            <button type="button" class="btn btn-primary btn-small" onClick={item.run}>
              {item.action}
            </button>
            <button type="button" class="btn btn-quiet btn-small" onClick={() => setDismissed([...dismissed, item.key])}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <p class="muted">Nothing needs you right now.</p>
      )}
    </section>
  );
}

function NextBillsCard({ today }: { today: string }) {
  const data = useData();
  const fmt = useFmt();
  const nav = useNav();
  const store = useStore();
  const items = nextBills(data.bills, today, data.transactions, 3);
  return (
    <section class="card" aria-labelledby="nb-title">
      <h2 id="nb-title" class="card-title">
        Next bills
      </h2>
      {items.length === 0 ? (
        <p class="muted">No bills coming up. Add your regular bills so they're set aside automatically.</p>
      ) : (
        <ul class="rows">
          {items.map((i) => (
            <li key={`${i.bill.id}-${i.date}`} class="row">
              <span class="row-main">
                <span>{i.bill.name}</span>
                <span class="row-sub">
                  {capital(fmt.relative(i.date, today))} · {fmt.day(i.date)}
                </span>
              </span>
              <span class="mono">{fmt.money(billPaymentAmount(store, i.bill, today))}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="link-btn" onClick={() => nav('bills')}>
        {items.length ? 'See all bills' : 'Add a bill'}
      </button>
    </section>
  );
}
