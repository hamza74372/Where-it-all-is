// Spec §7.1 — at most 4 steps, every step skippable, or try with example numbers.

import { useState } from 'preact/hooks';
import { COMMON_BILLS, nextDayOfMonth } from '../data/defaults';
import type { Schedule } from '../db/types';
import { addDays, weekday } from '../lib/dates';
import { amountExample, CURRENCIES, CURRENCY_INFO, type Currency } from '../lib/money';
import { completeOnboarding, loadExampleData } from '../state/actions';
import { RestorePanel } from './Backup';
import { useData, useStore } from '../state/store';
import { checkMoney, MoneyInput, ScheduleFields, Select, TextInput, Toggle } from '../ui/fields';
import { useToday } from '../ui/hooks';

type Step = 'welcome' | 'restore' | 1 | 2 | 3 | 4;

interface BillRow {
  id: string;
  /** Added with "Add another bill": the name is typed by the user. */
  custom?: boolean;
  name: string;
  emoji: string;
  amount: string;
  day: string;
}

export function Onboarding() {
  const store = useStore();
  const { settings } = useData();
  const today = useToday();
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
  const [bills, setBills] = useState<BillRow[]>(COMMON_BILLS.map((b) => ({ id: b.name, name: b.name, emoji: b.emoji, amount: '', day: '' })));
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
    if (s === 2) return balanceCheck.state === 'ok' || balanceCheck.state === 'empty';
    if (s === 3) return noPay || payCheck.state === 'ok' || payCheck.state === 'empty';
    if (s === 4) return billChecks.every((c, i) => (c.state === 'ok' && (!bills[i].custom || bills[i].name.trim())) || c.state === 'empty');
    return true;
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await completeOnboarding(store, {
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
    } finally {
      setBusy(false);
    }
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
      <main class="screen onboarding" id="main">
        <button type="button" class="link-btn back-btn" onClick={() => setStep('welcome')}>
          ‹ Back
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
        <div class="welcome">
          <p class="welcome-mark" aria-hidden="true">
            ◎
          </p>
          <h1 class="screen-title">Where It All Is</h1>
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
        </div>
      </main>
    );
  }

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
        <span style={{ width: `${(Number(step) / 4) * 100}%` }} />
      </div>

      {step === 1 && (
        <section>
          <h1 class="screen-title">Hello. Let's start simple.</h1>
          <TextInput label="What should we call you? (optional)" value={name} onInput={setName} placeholder="Your name" />
          <Select
            label="Currency"
            value={currency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_INFO[c].label }))}
            onChange={setCurrency}
          />
          <div class="card card-quiet">
            <p>
              You'll type amounts like <strong class="mono">{amountExample(dec)}</strong>
            </p>
            <button type="button" class="btn btn-small" onClick={() => setDecimal(dec === '.' ? ',' : '.')}>
              Switch to {amountExample(dec === '.' ? ',' : '.')}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 class="screen-title">How much is in your main account right now?</h1>
          <MoneyInput
            label="Balance today"
            value={balance}
            onInput={setBalance}
            autoFocus
            showErrors={showErrors}
            hint="Check your banking app, or use a rough number. You can add savings and cards later."
          />
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 class="screen-title">When do you get paid?</h1>
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

      {step === 4 && (
        <section>
          <h1 class="screen-title">Your main monthly bills</h1>
          <p class="muted">Fill in the ones you have. Leave the rest blank. You can add more, or other schedules, any time.</p>
          <ul class="bill-quick-list">
            {bills.map((b, i) => {
              const update = (patch: Partial<BillRow>) => setBills(bills.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <li key={b.id} class="bill-quick-row">
                  {b.custom ? (
                    <>
                      <TextInput label="Bill name" value={b.name} onInput={(name) => update({ name })} placeholder="e.g. Netflix" autoFocus />
                      {showErrors && !b.name.trim() && billChecks[i].state === 'ok' && <p class="field-error">Give this bill a name.</p>}
                    </>
                  ) : (
                    <span class="bill-quick-name">
                      <span aria-hidden="true">{b.emoji}</span> {b.name}
                    </span>
                  )}
                  <BillRowInputs row={b} showErrors={showErrors} onChange={update} />
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            class="btn"
            onClick={() => setBills([...bills, { id: `custom-${bills.length}`, custom: true, name: '', emoji: '🧾', amount: '', day: '' }])}
          >
            + Add another bill
          </button>
        </section>
      )}

      <div class="onb-actions">
        {step !== 1 && (
          <button type="button" class="btn" onClick={() => setStep((Number(step) - 1) as Step)}>
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

function BillRowInputs(props: { row: BillRow; showErrors: boolean; onChange: (p: Partial<BillRow>) => void }) {
  const name = props.row.name.trim() || 'New bill';
  return (
    <div class="bill-quick-inputs">
      <div class="grow">
        <MoneyInput
          label="Amount"
          ariaLabel={`${name} amount`}
          value={props.row.amount}
          onInput={(amount) => props.onChange({ amount })}
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
          placeholder="Day"
          aria-label={`${name} day of month`}
          value={props.row.day}
          onInput={(e) => props.onChange({ day: e.currentTarget.value })}
        />
      </label>
    </div>
  );
}
