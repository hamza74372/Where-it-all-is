// Spec §7.2 — one big number, a 3-second log box, and one gentle next action.

import { useMemo, useRef, useState } from 'preact/hooks';
import type { Bill, Income } from '../db/types';
import { catchUp, type CatchUp } from '../lib/away';
import { getPref, setPref } from '../lib/prefs';
import { lastBackupText } from './Backup';
import { addDays, daysBetween } from '../lib/dates';
import { nextBills, overdueOccurrences } from '../lib/bills';
import { occurrences } from '../lib/schedule';
import { parseQuickLog } from '../lib/quickLog';
import { envelopeRows, monthOf } from '../lib/envelopes';
import { computeSafeToSpend, type SafeToSpendResult } from '../lib/safeToSpend';
import {
  billPaymentAmount, categoryByName, clearExampleData, confirmPay, logTransaction, markBillPaid, type Undo,
} from '../state/actions';
import { useNav } from '../state/nav';
import { useData, useStore, type AppData } from '../state/store';
import { checkMoney, MoneyInput, moneyText } from '../ui/fields';
import { useFmt, useToday, type Fmt } from '../ui/hooks';
import { Confirm } from '../ui/Confirm';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/icons';
import { DonutChart, MiniSparkline, ProgressRing, StatTile } from '../ui/Visual';
import { Progress } from '../ui/Progress';

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

/** The cautious whole-unit figure used by both the hero and desktop sidebar. */
export function roundedHeroAmount(result: SafeToSpendResult): number {
  const unit = 100;
  return result.status === 'short'
    ? -Math.ceil(result.shortfall / unit) * unit
    : Math.floor(Math.max(0, result.safeToSpendToday) / unit) * unit;
}

function incomesOnPayday(data: AppData, result: SafeToSpendResult) {
  if (result.nextPaydaySource !== 'income') return [];
  return data.incomes.filter(
    (income) => income.active && occurrences(income.schedule, result.nextPayday, result.nextPayday).length > 0,
  );
}

function payPeriodProgress(data: AppData, today: string, result: SafeToSpendResult): number {
  const income = incomesOnPayday(data, result)[0];
  const foundPrevious = income
    ? occurrences(income.schedule, addDays(result.nextPayday, -370), addDays(result.nextPayday, -1)).at(-1)
    : `${today.slice(0, 8)}01`;
  const fallbackDays = income
    ? income.schedule.kind === 'weekly'
      ? 7
      : income.schedule.kind === 'biweekly'
        ? 14
        : income.schedule.kind === 'semimonthly'
          ? 15
          : income.schedule.kind === 'yearly'
            ? 365
            : income.schedule.kind === 'everyNMonths'
              ? 30 * Math.max(1, income.schedule.n ?? 1)
              : income.schedule.kind === 'monthly'
                ? 30
                : Math.max(1, result.daysLeft)
    : Math.max(1, result.daysLeft);
  const previous = foundPrevious ?? addDays(result.nextPayday, -fallbackDays);
  const total = Math.max(1, daysBetween(previous, result.nextPayday));
  return Math.max(0, Math.min(1, daysBetween(previous, today) / total));
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
  const periodProgress = payPeriodProgress(data, today, result);
  const toggleFocus = () => {
    setFocus(!focus);
    setPref('focus', !focus);
  };

  const paydayCards = result.unconfirmedPaydaysToday.map((p) => {
    const income = data.incomes.find((i) => i.id === p.incomeId);
    return income ? <PaydayCard key={income.id} income={income} today={today} /> : null;
  });

  // Order: the number first (always, whatever the day), then what's next, then the log box.
  // Everything else sits below with less weight.
  return (
    <>
      <div class="title-row">
        <div class="greeting-block">
          <h1 class="screen-title">{greeting}</h1>
          <p class="greeting-date">{fmt.dayLong(today)}</p>
        </div>
        <button type="button" class="btn btn-small focus-btn" aria-pressed={focus} onClick={toggleFocus}>
          <Icon name="focus" small /> {focus ? 'Exit focus mode' : 'Focus mode'}
        </button>
      </div>
      <div class="dashboard-hero-grid">
        <div class="dashboard-hero-primary">
          <SafeNumber result={result} fmt={fmt} periodProgress={periodProgress} />
          {paydayCards.some(Boolean) ? paydayCards : !focus && <NextUp result={result} />}
          <QuickLog inputRef={logRef} />
        </div>
        <section class="card desktop-breakdown" aria-labelledby="desktop-breakdown-title">
          <h2 id="desktop-breakdown-title" class="card-title">How this number is made</h2>
          <Explain result={result} fmt={fmt} collapseDetail />
        </section>
      </div>
      {!focus && (
        <>
          <TodayStats result={result} />
          <TodayOverview today={today} />
          <TodayPlanPreview today={today} />
          {data.settings.exampleData && <ExampleBanner />}
          {showAway && <AwayCard away={away!} today={today} onDismiss={() => setAwayDismissed(true)} />}
          <RightNow today={today} skipOverdue={showAway} onLogFocus={() => logRef.current?.focus()} />
          <NextBillsCard today={today} />
          {!data.settings.exampleData && <StorageNote />}
          {!data.settings.exampleData && <BackupReminder />}
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
    <section class="card card-quiet" aria-labelledby="away-title">
      <h2 id="away-title" class="card-title">
        While you were away
      </h2>
      <p class="muted">Welcome back. Since {fmt.day(away.since)}, these were due. Confirm what happened and your number catches up.</p>
      <ul class="rows">
        {away.paydays.map((p) => (
          <li key={`p-${p.income.id}-${p.date}`} class="row">
            <span class="row-main">
              <span>
                <Icon name="pay" small /> {p.income.name}
              </span>
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
        <button type="button" class="link-btn" onClick={onDismiss}>
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
      <button type="button" class="btn btn-small" onClick={() => setConfirming(true)}>
        Clear examples
      </button>
      <ClearExamplesConfirm open={confirming} onCancel={() => setConfirming(false)} onConfirm={() => clearExampleData(store)} />
    </div>
  );
}

/** "Clear examples" removes everything (a bulk action), so it asks first. */
export function ClearExamplesConfirm(props: { open: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return (
    <Confirm open={props.open} title="Clear the example numbers?" confirmLabel="Clear and set up mine" onCancel={props.onCancel} onConfirm={props.onConfirm}>
      <p>Everything here is made up, so nothing real is lost. You'll go back to setup to add your own numbers.</p>
    </Confirm>
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
    <section class="card next-up" aria-labelledby={`payday-${income.id}`}>
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
            <button type="button" class="link-btn" onClick={() => setMode('later')}>
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
            <button type="button" class="link-btn" onClick={() => setMode('ask')}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function SafeNumber({ result, fmt, periodProgress }: { result: SafeToSpendResult; fmt: Fmt; periodProgress: number }) {
  const [open, setOpen] = useState(false);
  const nav = useNav();
  const toPayday = result.nextPaydaySource === 'income';
  const until = toPayday ? `until payday ${fmt.day(result.nextPayday)}` : 'until the end of the month';
  // The big number is whole units: safe-to-spend rounds down, a shortfall rounds up — both
  // err on the careful side. Everything else keeps its cents.
  const whole = { wholeIfRound: true };
  const short = result.status === 'short';
  const tight = result.status === 'tight';
  const LABEL = { ok: 'Safe to spend today', tight: 'Tight until payday', short: 'Short until payday' } as const;
  const STATUS = { ok: 'On track', tight: 'Not much spare after bills', short: 'Bills come to more than you have' } as const;

  // The number always comes first; then what it means; then a status. No card frame: it's the screen's one big thing.
  return (
    <section class="hero" aria-labelledby="safe-label">
      <h2 id="safe-label" class="hero-label">
        {LABEL[result.status]}
      </h2>
      <div class="hero-amount-row">
        <button type="button" class="hero-number" onClick={() => setOpen(true)} aria-describedby="safe-what">
          <span class={short ? 'big-number big-number-tight' : 'big-number'}>
            {fmt.money(Math.abs(roundedHeroAmount(result)), whole)}
          </span>
          <span class="sr-only">. How is this worked out?</span>
        </button>
        <ProgressRing
          value={periodProgress}
          label="Days until payday"
          valueText={`${result.daysLeft} ${result.daysLeft === 1 ? 'day' : 'days'} left`}
        >
          <strong>{result.daysLeft}</strong><span>{result.daysLeft === 1 ? 'day' : 'days'}</span>
        </ProgressRing>
      </div>
      <p id="safe-what" class="hero-what">
        {short
          ? `What's missing to cover everything ${until}.`
          : `What you can spend today and still cover your bills ${toPayday ? 'until payday' : 'until the end of the month'}.`}
      </p>
      <p class={result.status === 'ok' ? 'status' : 'status status-tight'}>
        <span class="status-dot" aria-hidden="true" />
        {STATUS[result.status]}
      </p>
      {!short ? (
        <p id="safe-sub" class="hero-sub">
          {result.safeToSpendToday < 0
            ? `You've gone ${fmt.money(-result.safeToSpendToday)} past today's share — that's fine, the days ahead adjust. `
            : ''}
          {capital(until)}: <span class="money">{fmt.money(result.safeToSpendPeriod)}</span>
          {tight ? ' — a little each day keeps every bill covered.' : ''}
        </p>
      ) : result.unconfirmedPaydaysToday.length > 0 ? (
        <p class="hero-sub">Your pay isn't counted until you confirm it below — this will update then.</p>
      ) : (
        <>
          <p class="hero-sub">One idea: check whether a bill can move to after payday.</p>
          <button type="button" class="btn btn-small" onClick={() => nav('bills')}>
            Look at bills
          </button>
        </>
      )}
      <button type="button" class="link-btn" onClick={() => setOpen(true)}>
        How is this worked out?
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="How this is worked out">
        <Explain result={result} fmt={fmt} />
      </Sheet>
    </section>
  );
}

function TodayStats({ result }: { result: SafeToSpendResult }) {
  const data = useData();
  const store = useStore();
  const fmt = useFmt();
  const today = useToday();
  const month = today.slice(0, 7);
  const spends = data.transactions.filter((t) => t.date.startsWith(month) && t.amount < 0 && t.source !== 'transfer' && t.source !== 'adjustment');
  const spent = spends.reduce((sum, tx) => sum - tx.amount, 0);
  const upcoming = nextBills(data.bills, today, data.transactions, 40).filter((item) => item.date.slice(0, 7) === month);
  const billTotal = upcoming.reduce((sum, item) => sum + billPaymentAmount(store, item.bill, today), 0);
  const nextPay = incomesOnPayday(data, result).reduce((sum, income) => sum + income.amount, 0);
  const daily = Array.from({ length: 7 }, (_, offset) =>
    spends.filter((tx) => tx.date === addDays(today, offset - 6)).reduce((sum, tx) => sum - tx.amount, 0),
  );
  return (
    <div class="stat-grid" aria-label="This month at a glance">
      <StatTile
        label="Next pay"
        value={result.nextPaydaySource === 'income' ? fmt.money(nextPay) : 'Not set'}
        sub={result.nextPaydaySource === 'income' ? fmt.day(result.nextPayday) : 'Add a payday in More'}
      />
      <StatTile label="Spent this month" value={fmt.money(spent)} sub="Trend: last 7 days">
        <MiniSparkline values={daily} label="Spending over the last seven days" />
      </StatTile>
      <StatTile label="Bills left this month" value={fmt.money(billTotal)} sub={`${upcoming.length} ${upcoming.length === 1 ? 'bill' : 'bills'}`} />
    </div>
  );
}

function TodayOverview({ today }: { today: string }) {
  const data = useData();
  const fmt = useFmt();
  const store = useStore();
  const upcoming = nextBills(data.bills, today, data.transactions, 8).filter((item) => item.date <= addDays(today, 14));
  const month = today.slice(0, 7);
  const spentByCategory = data.categories
    .map((category) => ({
      label: category.name,
      tone: category.order,
      value: data.transactions
        .filter((tx) => tx.date.startsWith(month) && tx.categoryId === category.id && tx.amount < 0 && tx.source !== 'transfer')
        .reduce((sum, tx) => sum - tx.amount, 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = spentByCategory.reduce((sum, item) => sum + item.value, 0);
  return (
    <div class="overview-grid">
      <section class="card timeline-card" aria-labelledby="timeline-title">
        <h2 id="timeline-title" class="card-title">Upcoming</h2>
        {upcoming.length ? (
          <ol class="timeline">
            {upcoming.map((item, index) => (
              <li key={`${item.bill.id}-${item.date}`} class={`tone-${index % 8}`}>
                <i aria-hidden="true" />
                <span><strong>{item.bill.name}</strong><small>{fmt.relative(item.date, today)} · {fmt.day(item.date)}</small></span>
                <strong class="money">{fmt.money(billPaymentAmount(store, item.bill, today))}</strong>
              </li>
            ))}
          </ol>
        ) : <p class="muted">Nothing due in the next 14 days.</p>}
      </section>
      <section class="card spending-card" aria-labelledby="spending-title">
        <h2 id="spending-title" class="card-title">Spending this month</h2>
        {spentByCategory.length ? (
          <DonutChart
            title="Spending by category"
            total={fmt.money(total, { wholeIfRound: true })}
            data={spentByCategory.map((item) => ({ ...item, display: fmt.money(item.value, { wholeIfRound: true }) }))}
          />
        ) : <p class="muted">Your spending mix will appear here.</p>}
      </section>
    </div>
  );
}

function TodayPlanPreview({ today }: { today: string }) {
  const data = useData();
  const fmt = useFmt();
  const envelopes = envelopeRows(data.categories, data.transactions, data.envelopeMoves, monthOf(today)).slice(0, 3);
  const goals = data.goals.slice(0, 3);
  if (!envelopes.length && !goals.length) return null;
  return (
    <div class="plan-preview-grid">
      {envelopes.length > 0 && (
        <section class="card" aria-labelledby="today-envelopes-title">
          <h2 id="today-envelopes-title" class="card-title">Envelopes</h2>
          <ul class="mini-progress-list">
            {envelopes.map((row) => (
              <li key={row.category.id} class={`tone-${row.category.order % 8}`}>
                <span><strong>{row.category.name}</strong><small class="money">{fmt.money(row.remaining)} left</small></span>
                <Progress value={row.used} level={row.level} label={row.category.name} valueText={`${fmt.money(row.spent)} of ${fmt.money(row.limit)}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {goals.length > 0 && (
        <section class="card" aria-labelledby="today-goals-title">
          <h2 id="today-goals-title" class="card-title">Goals</h2>
          <div class="mini-rings">
            {goals.map((goal) => (
              <div key={goal.id}>
                <ProgressRing value={goal.target ? goal.saved / goal.target : 0} label={goal.name} valueText={`${fmt.money(goal.saved)} of ${fmt.money(goal.target)}`} />
                <strong>{goal.name}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** One card for whatever comes next: a bill, or pay — whichever is sooner. */
function NextUp({ result }: { result: SafeToSpendResult }) {
  const data = useData();
  const store = useStore();
  const fmt = useFmt();
  const today = useToday();
  const nav = useNav();
  const bill = nextBills(data.bills, today, data.transactions, 1)[0];
  const pay = result.nextPaydaySource === 'income' ? data.incomes.find((i) => i.active) : undefined;
  const payFirst = pay && (!bill || result.nextPayday < bill.date);
  if (!bill && !pay) {
    return (
      <section class="card next-up" aria-labelledby="next-up-title">
        <h2 id="next-up-title" class="card-title">
          Next up
        </h2>
        <EmptyState line="No bills or paydays yet." action="Add a bill" onAction={() => nav('bills')} />
      </section>
    );
  }
  const when = (d: string) => `${capital(fmt.relative(d, today))} · ${fmt.day(d)}`;
  return (
    <section class="card next-up" aria-labelledby="next-up-title">
      <h2 id="next-up-title" class="card-title">
        Next up
      </h2>
      <div class="next-up-row">
        <span class="next-up-icon" aria-hidden="true">
          <Icon name={payFirst ? 'pay' : 'receipt'} />
        </span>
        <span class="next-up-main">
          <strong>{payFirst ? pay!.name : bill!.bill.name}</strong>
          <span class="next-up-when">{payFirst ? `Pay · ${when(result.nextPayday)}` : `Bill · ${when(bill!.date)}`}</span>
        </span>
        <span class={payFirst ? 'money amount-in' : 'money'}>
          {payFirst ? `${pay!.variable ? '~' : '+'}${fmt.money(pay!.amount)}` : fmt.money(billPaymentAmount(store, bill!.bill, today))}
        </span>
      </div>
    </section>
  );
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

function Explain({ result: r, fmt, collapseDetail = false }: { result: SafeToSpendResult; fmt: Fmt; collapseDetail?: boolean }) {
  const lastDay = addDays(r.nextPayday, -1);
  const line = (label: string, amount: number, sign: '+' | '−' | '=' | '', sub?: string) => (
    <li class={`explain-line ${sign === '=' ? 'explain-total' : ''}`}>
      <span>
        {label}
        {sub && <span class="explain-sub">{sub}</span>}
      </span>
      <span class="money">
        {sign && sign !== '=' ? sign : ''}
        {fmt.money(amount)}
      </span>
    </li>
  );
  const detail = (
    <>
      {r.billLines.length === 0 && <p class="muted">No bills are due before your next pay.</p>}
      {r.lookAhead && (
        <p class="muted">
          {r.lookAhead.setAside > 0
            ? `Looking ahead: bills from ${fmt.day(r.lookAhead.periodStart)} to ${fmt.day(r.lookAhead.periodEnd)} come to ${fmt.money(r.lookAhead.billsTotal)}, but your next pay is about ${fmt.money(r.lookAhead.expectedPay)}. The ${fmt.money(r.lookAhead.setAside)} gap is kept back now so those bills are covered.`
            : `Looking ahead: your next pay (about ${fmt.money(r.lookAhead.expectedPay)}) covers the ${fmt.money(r.lookAhead.billsTotal)} of bills due ${fmt.day(r.lookAhead.periodStart)} – ${fmt.day(r.lookAhead.periodEnd)}.`}{' '}
          This looks one pay period ahead only — big bills further out (like a yearly renewal) aren't set aside yet.
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
    </>
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
      {collapseDetail ? (
        <details class="explain-more">
          <summary>More detail</summary>
          <div class="explain-more-content">{detail}</div>
        </details>
      ) : detail}
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
        class="quick-log-form"
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
              {fmt.money(parsed.amount)} · {cat ? cat.name : 'No category yet'}
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
              <Icon name={p.icon} small /> {p.label} {fmt.money(p.amount, { wholeIfRound: true })}
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
    <section class="card card-quiet" aria-labelledby="rn-title">
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
            <button type="button" class="link-btn" onClick={() => setDismissed([...dismissed, item.key])}>
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
    <section class="card card-quiet" aria-labelledby="nb-title">
      <h2 id="nb-title" class="card-title">
        Next bills
      </h2>
      {items.length === 0 ? (
        <EmptyState line="No bills coming up." action="Add a bill" onAction={() => nav('bills')} />
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
              <span class="money">{fmt.money(billPaymentAmount(store, i.bill, today))}</span>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <button type="button" class="link-btn" onClick={() => nav('bills')}>
          See all bills
        </button>
      )}
    </section>
  );
}

/** True when running as an installed Home Screen app (then Safari won't clear the data after 7 days). */
function isInstalled(): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || (navigator as { standalone?: boolean }).standalone === true;
}

/** One-time note about Safari clearing website data. */
function StorageNote() {
  const store = useStore();
  const { settings } = useData();
  if (settings.storageNoteSeen || isInstalled()) return null;
  return (
    <section class="card card-quiet" aria-labelledby="storage-note">
      <h2 id="storage-note" class="card-title">
        Keep your budget safe
      </h2>
      <p>
        Your budget is saved only on this device. On iPhone and iPad, Safari can delete a website’s data after 7 days without use — unless
        you add the app to your Home Screen. Add it there, and back up once a week.
      </p>
      <button type="button" class="btn btn-small" onClick={() => store.saveSettings({ storageNoteSeen: true })}>
        Got it
      </button>
    </section>
  );
}

/** Gentle, dismissible reminder every N days without a backup. */
function BackupReminder() {
  const { settings } = useData();
  const nav = useNav();
  const [dismissedAt, setDismissedAt] = useState(() => getPref<number>('backupReminderDismissedAt', 0));
  const every = settings.backupRemindDays;
  if (!every) return null;
  const now = Date.now();
  const sinceBackup = settings.lastBackupAt ? now - settings.lastBackupAt : now - settings.createdAt;
  const dueMs = every * 86_400_000;
  if (sinceBackup < dueMs || now - dismissedAt < dueMs) return null;
  return (
    <section class="card card-quiet backup-reminder" aria-labelledby="backup-rem">
      <h2 id="backup-rem" class="card-title">
        Time for a quick backup?
      </h2>
      <p class="muted">{lastBackupText(settings.lastBackupAt)}. It takes a few seconds and keeps your budget safe.</p>
      <div class="row-gap">
        <button
          type="button"
          class="btn btn-small btn-primary"
          onClick={() => {
            setPref('openMorePage', 'backup'); // land on Backup & restore, not the More menu
            nav('more');
          }}
        >
          Back up now
        </button>
        <button
          type="button"
          class="link-btn"
          onClick={() => {
            setPref('backupReminderDismissedAt', Date.now());
            setDismissedAt(Date.now());
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
