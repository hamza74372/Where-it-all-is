// Debt: list, total, snowball vs avalanche, extra payment slider, debt-free date. Labelled "estimate".

import { useMemo, useState } from 'preact/hooks';
import { nextDayOfMonth } from '../../data/defaults';
import { uid } from '../../db/db';
import type { Debt } from '../../db/types';
import { comparePayoff, debtFreeDate, type PayoffResult } from '../../lib/debt';
import { categoryByName, defaultAccount, removeWithUndo, saveWithUndo } from '../../state/actions';
import { useData, useStore } from '../../state/store';
import { checkMoney, Field, MoneyInput, moneyText, TextInput, Toggle } from '../../ui/fields';
import { useFmt, useToday, type Fmt } from '../../ui/hooks';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/Toast';
import { EmptyState } from '../../ui/EmptyState';
import { DebtLine } from '../../ui/Visual';

export function DebtPlan() {
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const [editing, setEditing] = useState<Debt | 'new' | null>(null);
  const [extra, setExtra] = useState(0);
  const open = data.debts.filter((d) => d.balance > 0);
  const total = open.reduce((s, d) => s + d.balance, 0);
  const mins = open.reduce((s, d) => s + d.minPayment, 0);
  const sliderMax = Math.max(50000, Math.ceil((mins * 2) / 5000) * 5000);
  const cmp = useMemo(() => comparePayoff(open, extra), [data.debts, extra]);

  return (
    <>
      {data.debts.length === 0 ? (
        <div class="card">
          <EmptyState line="Add a card or loan to see your debt-free date." action="Add a debt" onAction={() => setEditing('new')} icon="wallet" />
        </div>
      ) : (
        <>
          <ul class="card rows" aria-label="Debts">
            {data.debts.map((d) => (
              <li key={d.id} class="row">
                <button type="button" class="row-main row-button" onClick={() => setEditing(d)}>
                  <span>
                    {d.name}
                    {d.balance <= 0 && <span class="badge">Paid off</span>}
                  </span>
                  <span class="row-sub">
                    {d.apr}% APR · minimum {fmt.money(d.minPayment)}
                  </span>
                </button>
                <span class="money">{fmt.money(d.balance)}</span>
              </li>
            ))}
          </ul>
          <p class="muted">
            Total owed: <strong>{fmt.money(total)}</strong> · Minimums: {fmt.money(mins)}/month
          </p>
        </>
      )}
      {data.debts.length > 0 && (
        <button type="button" class="btn" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Add a debt
        </button>
      )}

      {open.length > 0 && (
        <section class="card" aria-labelledby="payoff-title">
          <h2 id="payoff-title" class="card-title">
            Your debt-free date <span class="badge">Estimate</span>
          </h2>
          <Field label={`Extra each month: ${fmt.money(extra, { wholeIfRound: true })}`} htmlFor="extra-slider">
            <input
              id="extra-slider"
              class="slider"
              type="range"
              min={0}
              max={sliderMax}
              step={500}
              value={extra}
              style={{ '--slider-progress': `${(extra / sliderMax) * 100}%` }}
              aria-valuetext={fmt.money(extra)}
              onInput={(e) => setExtra(Number(e.currentTarget.value))}
            />
          </Field>
          {open.length === 1 ? (
            // One debt: snowball and avalanche are the same plan, so don't show a comparison.
            <div class="compare">
              <PlanCard title="Your plan" sub={`Minimum plus extra, every month`} r={cmp.snowball} today={today} fmt={fmt} debts={open} single />
            </div>
          ) : (
            <>
              <div class="compare">
                <PlanCard title="Snowball" sub="Smallest balance first — quick wins keep you going" r={cmp.snowball} today={today} fmt={fmt} debts={open} />
                <PlanCard title="Avalanche" sub="Highest interest first — usually costs the least" r={cmp.avalanche} today={today} fmt={fmt} debts={open} />
              </div>
              {cmp.snowball.months != null && cmp.avalanche.months != null && <Verdict snowball={cmp.snowball} avalanche={cmp.avalanche} diff={cmp.interestDifference} fmt={fmt} />}
            </>
          )}
          {cmp.avalanche.months != null && (
            <DebtLine
              start={total}
              months={cmp.avalanche.months}
              startText={fmt.money(total)}
              endLabel={fmt.month(debtFreeDate(today, cmp.avalanche.months))}
            />
          )}
          <details class="assumptions">
            <summary>How this is estimated</summary>
            <ul>
              <li>Interest is added monthly (balance × APR ÷ 12).</li>
              <li>You pay every minimum plus the extra amount each month. When a debt is paid off, its minimum moves to the next one.</li>
              <li>No new spending on these debts, and rates stay the same.</li>
              <li>Real statements will differ a little. This is a planning estimate, not financial advice.</li>
            </ul>
          </details>
        </section>
      )}

      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a debt' : 'Edit debt'}>
        {editing != null && <DebtForm key={editing === 'new' ? 'new' : editing.id} debt={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function PlanCard(props: { title: string; sub: string; r: PayoffResult; today: string; fmt: Fmt; debts: Debt[]; single?: boolean }) {
  const { r, fmt } = props;
  const first = r.order.find((id) => r.paidOffMonth[id] != null);
  const firstName = props.debts.find((d) => d.id === r.order[0])?.name;
  return (
    <div class="plan-card">
      <h3>{props.title}</h3>
      <p class="row-sub">{props.sub}</p>
      {r.months == null ? (
        <p>With these payments the balance doesn't go down. Try adding a little extra.</p>
      ) : (
        <>
          <p class="plan-date">{fmt.month(debtFreeDate(props.today, r.months))}</p>
          <p class="row-sub">
            {r.months} {r.months === 1 ? 'month' : 'months'} · {fmt.money(r.totalInterest)} interest
          </p>
          {!props.single && first && firstName && (
            <p class="row-sub">
              Starts with {firstName} — gone in {r.paidOffMonth[r.order[0]]} {r.paidOffMonth[r.order[0]] === 1 ? 'month' : 'months'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Verdict({ snowball, avalanche, diff, fmt }: { snowball: PayoffResult; avalanche: PayoffResult; diff: number; fmt: Fmt }) {
  const firstWin = (r: PayoffResult) => Math.min(...Object.values(r.paidOffMonth));
  const sooner = firstWin(avalanche) - firstWin(snowball);
  if (diff === 0 && snowball.months === avalanche.months) return <p class="muted">Both ways come out the same for you.</p>;
  return (
    <p class="muted">
      {diff > 0 ? `Avalanche saves about ${fmt.money(diff)} in interest. ` : ''}
      {sooner > 0 ? `Snowball clears your first debt ${sooner} ${sooner === 1 ? 'month' : 'months'} sooner. ` : ''}
      Either way works — the best plan is the one you'll stick with.
    </p>
  );
}

function DebtForm({ debt, onDone }: { debt: Debt | null; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const today = useToday();
  const dec = data.settings.decimalSeparator;
  const linkedBill = debt ? data.bills.find((b) => b.debtId === debt.id) : undefined;
  const [name, setName] = useState(debt?.name ?? '');
  const [balance, setBalance] = useState(moneyText(debt?.balance ?? null, dec));
  const [apr, setApr] = useState(debt ? String(debt.apr).replace('.', dec) : '');
  const [min, setMin] = useState(moneyText(debt?.minPayment, dec));
  const [addBill, setAddBill] = useState(!debt);
  const [day, setDay] = useState('1');
  const [showErrors, setShowErrors] = useState(false);
  const aprValue = Number(apr.trim().replace(',', '.'));
  const aprOk = apr.trim() !== '' && Number.isFinite(aprValue) && aprValue >= 0 && aprValue <= 100;

  const save = async (e: Event) => {
    e.preventDefault();
    const b = checkMoney(balance, dec);
    const m = checkMoney(min, dec);
    if (!name.trim() || (b.state !== 'ok' && b.state !== 'empty') || m.state !== 'ok' || !aprOk) return setShowErrors(true);
    const id = debt?.id ?? uid();
    const minPayment = Math.abs(m.value);
    const undoDebt = await saveWithUndo(store, 'debts', {
      id, name: name.trim(), balance: b.state === 'ok' ? Math.abs(b.value) : 0, apr: aprValue, minPayment, createdAt: debt?.createdAt ?? Date.now(),
    });
    let undoBill: (() => Promise<void>) | undefined;
    if (linkedBill && linkedBill.amount !== minPayment) {
      undoBill = await saveWithUndo(store, 'bills', { ...linkedBill, amount: minPayment });
    } else if (!debt && addBill) {
      const account = defaultAccount(store);
      if (account) {
        const d = Math.min(31, Math.max(1, Number(day) || 1));
        undoBill = await saveWithUndo(store, 'bills', {
          id: uid(), name: `${name.trim()} minimum`, amount: minPayment, accountId: account.id,
          categoryId: categoryByName(data.categories, 'Bills')?.id,
          schedule: { kind: 'monthly', anchorDate: nextDayOfMonth(today, d), dayOfMonth: d, weekendShift: 'none' },
          autopay: false, isDebtMinimum: true, debtId: id, active: true,
        });
      }
    }
    toast(debt ? 'Debt saved' : `${name.trim()} added`, async () => {
      await undoBill?.();
      await undoDebt();
    });
    onDone();
  };

  return (
    <form class="form" onSubmit={save}>
      <TextInput label="Name" value={name} onInput={setName} placeholder="e.g. Visa card" autoFocus={!debt} />
      {showErrors && !name.trim() && <p class="field-error">Give it a name.</p>}
      <MoneyInput label="Balance owed now" value={balance} onInput={setBalance} showErrors={showErrors} />
      <Field label="Interest rate (APR %)" hint="On your statement, often called APR. Use 0 for interest-free." htmlFor="apr">
        <input id="apr" class="input input-narrow-wide" type="text" inputMode="decimal" value={apr} placeholder={`e.g. 22${dec}9`} onInput={(e) => setApr(e.currentTarget.value)} />
      </Field>
      {showErrors && !aprOk && <p class="field-error">Enter a rate between 0 and 100.</p>}
      <MoneyInput label="Minimum payment each month" value={min} onInput={setMin} showErrors={showErrors} />
      {!debt && (
        <>
          <Toggle label="Also add the minimum as a monthly bill" checked={addBill} onChange={setAddBill} hint="So it's set aside before payday." />
          {addBill && (
            <Field label="Due on day of the month" htmlFor="debt-day">
              <input id="debt-day" class="input input-narrow" type="number" inputMode="numeric" min={1} max={31} value={day} onInput={(e) => setDay(e.currentTarget.value)} />
            </Field>
          )}
        </>
      )}
      {linkedBill && <p class="field-hint">Changing the minimum also updates the "{linkedBill.name}" bill.</p>}
      <p class="field-hint">Update the balance now and then (from your statement) to keep the estimate honest.</p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
      {debt && (
        <button
          type="button"
          class="btn btn-danger"
          onClick={async () => {
            const undo = await removeWithUndo(store, 'debts', debt);
            toast(`${debt.name} deleted${linkedBill ? ' (its bill stays — delete it in Bills if you like)' : ''}`, undo);
            onDone();
          }}
        >
          Delete this debt
        </button>
      )}
    </form>
  );
}
