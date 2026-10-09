// Spec §7.1 — at most 4 steps, every step skippable, or try with example numbers.

import { useState } from 'preact/hooks';
import { COMMON_BILLS, nextDayOfMonth } from '../data/defaults';
import type { Schedule } from '../db/types';
import { addDays, endOfMonth, weekday } from '../lib/dates';
import { amountExample, CURRENCIES, CURRENCY_INFO, type Currency } from '../lib/money';
import { buildOnboarding, completeOnboarding, loadExampleData, type OnboardingInput } from '../state/actions';
import { computeSafeToSpend } from '../lib/safeToSpend';
import { nextOccurrence } from '../lib/schedule';
import { roundedHeroAmount } from './Today';
import { RestorePanel } from './Backup';
import { useData, useStore } from '../state/store';
import { checkMoney, MoneyInput, ScheduleFields, Select, TextInput, Toggle } from '../ui/fields';
import { useFmt, useToday } from '../ui/hooks';
import { Wordmark } from '../ui/Brand';
import { Icon } from '../ui/icons';

type Step = 'welcome' | 'restore' | 1 | 2 | 3 | 4;

interface BillRow {
  id: string;
  /** Added with "Add another bill": the name is typed by the user. */
  custom?: boolean;
  name: string;
  icon: string;
  amount: string;
  day: string;
}

export function Onboarding() {
  const store = useStore();
  const { settings } = useData();
  const today = useToday();
  const fmt = useFmt();
  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(settings.name);
  const [currency, setCurrency] = useState<Currency>(settings.currency);
  const [dec, setDec] = useState(settings.decimalSeparator);
  const [balance, setBalance] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payVaries, setPayVaries] = useState(false);
  const [noPay, setNoPay] = useState(false);
  const nextFriday = addDays(today, (5 - weekday(today) + 7) % 7 || 7);
  const [paySchedule, setPaySchedule] = useState<Schedule>({ kind: 'biweekly', anchorDate: nextFriday, weekendShift: 'before' });
  const [bills, setBills] = useState<BillRow[]>(COMMON_BILLS.map((b) => ({ id: b.name, name: b.name, icon: b.icon, amount: '', day: '' })));
  const [showErrors, setShowErrors] = useState(false);

  // The decimal choice applies while typing in onboarding, before settings are saved.
  const setDecimal = async (d: '.' | ',') => {
    setDec(d);
    await store.saveSettings({ decimalSeparator: d });
  };

  const balanceCheck = checkMoney(balance, dec);
  const payCheck = checkMoney(payAmount, dec);
  const billChecks = bills.map((b) => checkMoney(b.amount, dec));

  const stepValid = (s: Step): boolean => {
    if (s === 1) return balanceCheck.state === 'ok' || balanceCheck.state === 'empty';
    if (s === 2) return noPay || payCheck.state === 'ok' || payCheck.state === 'empty';
    if (s === 3) return billChecks.every((c, i) => (c.state === 'ok' && (!bills[i].custom || bills[i].name.trim())) || c.state === 'empty');
    return true;
  };

  const input = (): OnboardingInput => ({
        name,
        currency,
        decimalSeparator: dec,
        today,
        balance: balanceCheck.state === 'ok' ? balanceCheck.value : null,
        pay:
          !noPay && payCheck.state === 'ok'
            ? { amount: payCheck.value, variable: payVaries, schedule: paySchedule }
            : null,
        bills: bills.flatMap((b, i) => {
          const c = billChecks[i];
          if (c.state !== 'ok' || c.value <= 0) return [];
          const day = Math.min(31, Math.max(1, Number(b.day) || 1));
          const anchorDate = nextDayOfMonth(today, day);
          return [{ name: b.name.trim() || 'Bill', amount: c.value, schedule: { kind: 'monthly', anchorDate, dayOfMonth: day, weekendShift: 'none' } as Schedule }];
        }),
  });

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await completeOnboarding(store, input());
    } finally {
      setBusy(false);
    }
  };

  /** The day the money needs to last until: the next payday entered, else the end of the month. */
  const setupPayday = (): { date: string; isPay: boolean } => {
    const pay = !noPay && payCheck.state === 'ok' ? nextOccurrence(paySchedule, today) : null;
    return pay ? { date: pay, isPay: true } : { date: endOfMonth(today), isPay: false };
  };

  /** "Your number": the real calculation on exactly what setup is about to save. */
  const previewNumber = () => {
    const built = buildOnboarding(input(), store.data.categories);
    return computeSafeToSpend({
      today, accounts: [built.account], transactions: [], incomes: built.income ? [built.income] : [], bills: built.bills, goals: [],
      settings: { buffer: 0, setAsideGoals: false },
    });
  };

  // Currency applies straight away, so amounts during setup show the right symbol.
  const chooseCurrency = async (c: Currency) => {
    setCurrency(c);
    await store.saveSettings({ currency: c });
  };

  const next = async () => {
    if (!stepValid(step)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    if (step === 4) await finish();
    else setStep(typeof step === 'number' ? ((step + 1) as Step) : 1);
  };

  if (step === 'restore') {
    return (
      <main class="screen onboarding welcome-screen" id="main">
        <button type="button" class="link-btn back-btn" onClick={() => setStep('welcome')} aria-label="Back to welcome">
          <Icon name="back" small /> Back
        </button>
        <h1 class="screen-title">Restore a backup</h1>
        <p class="muted">Pick the backup file from your old phone or computer. Everything comes back exactly as it was.</p>
        <RestorePanel />
      </main>
    );
  }

  if (step === 'welcome') {
    return (
      <main class="screen onboarding" id="main">
        <div class="welcome welcome-grid">
          <h1>
            <Wordmark />
          </h1>
          <p class="welcome-headline">Money clarity, without the spreadsheet.</p>
          <p class="lead">A calm budget that answers one question: how much is safe to spend today?</p>
          <ul class="plain-list muted">
            <li>No account, no bank login, no subscription.</li>
            <li>Your numbers stay on this device.</li>
            <li>Rough numbers are fine — you can fix anything later.</li>
          </ul>
          <div class="stack">
            <button type="button" class="btn btn-primary btn-block" onClick={() => setStep(1)}>
              Set up mine — about 2 minutes
            </button>
            <button
              type="button"
              class="btn btn-block"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await loadExampleData(store, today);
              }}
            >
              Try with example numbers
            </button>
            <button type="button" class="link-btn" onClick={() => setStep('restore')}>
              Moving from another device? Restore a backup
            </button>
          </div>
          <WelcomePreview />
        </div>
      </main>
    );
  }

  const STEPS = ['Balance', 'Payday', 'Bills', 'Your number'] as const;
  const n = Number(step);
  const eg = (amount: string) => `e.g. ${dec === ',' ? amount.replace(/\./g, '#').replace(/,/g, '.').replace(/#/g, ',') : amount}`;
  const payday = setupPayday();
  const preview = step === 4 ? previewNumber() : null;

  return (
    <main class="screen onboarding" id="main">
      <div class="onb-top">
        <p class="muted" aria-live="polite">
          Step {step} of 4
        </p>
        <button type="button" class="link-btn" onClick={finish} disabled={busy}>
          Skip setup
        </button>
      </div>
      <div class="progress" aria-hidden="true">
        <span style={{ width: `${(n / 4) * 100}%` }} />
      </div>
      <ol class="setup-dots" aria-label={`Setup step ${step} of 4: ${STEPS[n - 1]}`}>
        {STEPS.map((label, index) => (
          <li key={label} class={index + 1 <= n ? 'is-active' : ''} aria-current={index + 1 === n ? 'step' : undefined}>
            <i aria-hidden="true" /><span>{label}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section class="onb-step">
          <h1 class="screen-title">How much is in your main account right now?</h1>
          <p class="muted why-we-ask">Why we ask: your number starts from what's in your account today — no bank login needed.</p>
          <MoneyInput
            label="Balance today"
            value={balance}
            onInput={setBalance}
            autoFocus
            placeholder={eg('1,250.00')}
            showErrors={showErrors}
            hint="Check your banking app, or use a rough number. You can add savings and cards later."
          />
          <div class="card card-quiet">
            <p>
              You'll type amounts like <strong class="money">{amountExample(dec)}</strong>
            </p>
            <button type="button" class="btn btn-small" onClick={() => setDecimal(dec === '.' ? ',' : '.')}>
              Switch to {amountExample(dec === '.' ? ',' : '.')}
            </button>
          </div>
          <Select
            label="Currency"
            value={currency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_INFO[c].label }))}
            onChange={chooseCurrency}
          />
          <TextInput label="What should we call you? (optional)" value={name} onInput={setName} placeholder="e.g. Sam" />
        </section>
      )}

      {step === 2 && (
        <section class="onb-step">
          <h1 class="screen-title">When do you get paid?</h1>
          <p class="muted why-we-ask">Why we ask: so we know how many days your money needs to last.</p>
          {noPay ? (
            <div class="card card-quiet">
              <p>No problem. We'll plan to the end of each month instead.</p>
              <button type="button" class="btn btn-small" onClick={() => setNoPay(false)}>
                Add pay after all
              </button>
            </div>
          ) : (
            <>
              <MoneyInput
                label={payVaries ? 'About how much, on average?' : 'How much lands in your account?'}
                value={payAmount}
                onInput={setPayAmount}
                placeholder={eg('1,800.00')}
                showErrors={showErrors}
                hint="After tax — the amount that actually arrives."
              />
              <Toggle
                label="My pay varies"
                checked={payVaries}
                onChange={setPayVaries}
                hint="We'll use your average. You confirm the real amount each payday."
              />
              <ScheduleFields value={paySchedule} onChange={setPaySchedule} dateLabel="Next payday" />
              <button type="button" class="link-btn" onClick={() => setNoPay(true)}>
                I don't have regular pay
              </button>
            </>
          )}
        </section>
      )}

      {step === 3 && (
        <section class="onb-step">
          <h1 class="screen-title">Your main monthly bills</h1>
          <p class="muted why-we-ask">Why we ask: so money for them is set aside before they're due.</p>
          <p>
            Only bills due before {payday.isPay ? 'your next payday' : 'the end of the month'} ({fmt.day(payday.date)}) are needed now.
            Leave the rest blank and add them any time.
          </p>
          <ul class="bill-quick-list">
            {bills.map((b, i) => {
              const update = (patch: Partial<BillRow>) => setBills(bills.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const day = Number(b.day);
              const afterPayday = day >= 1 && day <= 31 && nextDayOfMonth(today, Math.min(31, day)) >= payday.date;
              return (
                <li key={b.id} class="bill-quick-row">
                  {b.custom ? (
                    <>
                      <TextInput label="Bill name" value={b.name} onInput={(name) => update({ name })} placeholder="e.g. Gym" autoFocus />
                      {showErrors && !b.name.trim() && billChecks[i].state === 'ok' && <p class="field-error">Give this bill a name.</p>}
                    </>
                  ) : (
                    <span class="bill-quick-name">
                      <Icon name={b.icon} small /> {b.name}
                    </span>
                  )}
                  <BillRowInputs row={b} showErrors={showErrors} onChange={update} example={eg('45.00')} />
                  {afterPayday && <p class="field-hint">Due after {payday.isPay ? 'payday' : 'this month'} — this one can wait.</p>}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            class="btn"
            onClick={() => setBills([...bills, { id: `custom-${bills.length}`, custom: true, name: '', icon: 'receipt', amount: '', day: '' }])}
          >
            <Icon name="plus" /> Add another bill
          </button>
        </section>
      )}

      {step === 4 && preview && (
        <section class="onb-step" aria-labelledby="your-number">
          <h1 id="your-number" class="screen-title">Your number</h1>
          <p class="muted why-we-ask">This is what it all adds up to. It updates as you log, import and get paid.</p>
          <div class="card setup-number">
            <p class="hero-label">{preview.status === 'short' ? 'Short until payday' : 'Safe to spend today'}</p>
            <p class="big-number">{fmt.money(Math.abs(roundedHeroAmount(preview)), { wholeIfRound: true })}</p>
            <p>
              {preview.status === 'short'
                ? `What's missing to cover your bills ${preview.nextPaydaySource === 'income' ? 'until payday' : 'until the end of the month'}.`
                : `What you can spend today and still cover your bills ${preview.nextPaydaySource === 'income' ? 'until payday' : 'until the end of the month'}.`}
            </p>
          </div>
          <p class="muted">Rough numbers are fine. Change anything later in More.</p>
        </section>
      )}

      <div class="onb-actions">
        {step !== 1 && (
          <button type="button" class="btn" onClick={() => setStep((n - 1) as Step)}>
            Back
          </button>
        )}
        <button type="button" class="btn btn-primary btn-grow" onClick={next} disabled={busy}>
          {step === 4 ? 'Finish' : 'Next'}
        </button>
      </div>
    </main>
  );
}

function WelcomePreview() {
  return (
    <div class="welcome-preview" aria-label="Preview of the Today dashboard">
      <div class="preview-window">
        <div class="preview-top"><i /><i /><i /><span>Today</span></div>
        <div class="preview-content">
          <p class="preview-greeting">Good morning, Sam</p>
          <section class="preview-hero">
            <span>Safe to spend today</span>
            <strong class="money">$248</strong>
            <small>Until payday Friday</small>
          </section>
          <div class="preview-stats"><i /><i /><i /></div>
          <div class="preview-bars"><i /><i /><i /></div>
        </div>
      </div>
    </div>
  );
}

function BillRowInputs(props: { row: BillRow; showErrors: boolean; onChange: (p: Partial<BillRow>) => void; example?: string }) {
  const name = props.row.name.trim() || 'New bill';
  return (
    <div class="bill-quick-inputs">
      <div class="grow">
        <MoneyInput
          label="Amount"
          ariaLabel={`${name} amount`}
          value={props.row.amount}
          onInput={(amount) => props.onChange({ amount })}
          placeholder={props.example}
          showErrors={props.showErrors}
        />
      </div>
      <label class="day-field">
        <span class="field-label">Day of month</span>
        <input
          class="input input-narrow"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          placeholder="e.g. 1"
          aria-label={`${name} day of month`}
          value={props.row.day}
          onInput={(e) => props.onChange({ day: e.currentTarget.value })}
        />
      </label>
    </div>
  );
}
