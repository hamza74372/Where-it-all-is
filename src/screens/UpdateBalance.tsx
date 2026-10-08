// "What's your balance today?" — one field per account counted in safe to spend. Used by the
// hero's "Update balance" button and the "While you were away" card.

import { useState } from 'preact/hooks';
import { accountBalance } from '../lib/safeToSpend';
import { updateBalances } from '../state/actions';
import { useData, useStore } from '../state/store';
import { checkMoney, MoneyInput } from '../ui/fields';
import { useFmt, useToday } from '../ui/hooks';
import { toast } from '../ui/Toast';

export function UpdateBalanceForm(props: { onSaved: () => void; onSkip?: () => void; saveLabel?: string }) {
  const store = useStore();
  const data = useData();
  const today = useToday();
  const fmt = useFmt();
  const dec = data.settings.decimalSeparator;
  const accounts = data.accounts.filter((a) => !a.archived && a.includeInSafeToSpend);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  if (!accounts.length) return null;
  const single = accounts.length === 1;

  const save = async (e: Event) => {
    e.preventDefault();
    const checks = accounts.map((a) => ({ a, c: checkMoney(values[a.id] ?? '', dec) }));
    if (checks.some(({ c }) => c.state !== 'ok')) return setShowErrors(true);
    const undo = await updateBalances(
      store,
      checks.map(({ a, c }) => ({ accountId: a.id, balance: (c as { value: number }).value })),
      today,
    );
    props.onSaved(); // first: a step change clears toasts, and this one carries the Undo
    toast('Balance updated', undo);
  };

  return (
    <form class="form" onSubmit={save}>
      {accounts.map((a) => {
        const now = accountBalance(a, data.transactions, today);
        return (
          <MoneyInput
            key={a.id}
            label={single ? 'Balance today' : `${a.name} balance today`}
            ariaLabel={single ? 'Your balance today' : `${a.name} balance today`}
            value={values[a.id] ?? ''}
            onInput={(v) => setValues({ ...values, [a.id]: v })}
            showErrors={showErrors}
            hint={`Check your banking app. The app has ${fmt.money(a.type === 'credit' ? -now : now)}${a.type === 'credit' ? ' owed' : ''}.`}
          />
        );
      })}
      <div class="form-actions">
        {props.onSkip && (
          <button type="button" class="btn" onClick={props.onSkip}>
            Skip
          </button>
        )}
        <button type="submit" class="btn btn-primary btn-grow">
          {props.saveLabel ?? 'Save balance'}
        </button>
      </div>
    </form>
  );
}
