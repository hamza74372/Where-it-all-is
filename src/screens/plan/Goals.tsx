// Goals: progress, target date, and what to put aside each payday.

import { useState } from 'preact/hooks';
import { uid } from '../../db/db';
import type { Goal } from '../../db/types';
import { goalContributionPerPayday } from '../../lib/safeToSpend';
import { saveWithUndo, removeWithUndo } from '../../state/actions';
import { useData, useStore } from '../../state/store';
import { checkMoney, DateInput, MoneyInput, moneyText, Segmented, TextInput, Toggle } from '../../ui/fields';
import { useFmt, useToday } from '../../ui/hooks';
import { Icon, IconPicker } from '../../ui/icons';
import { Progress } from '../../ui/Progress';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/Toast';
import { EmptyState } from '../../ui/EmptyState';

export function Goals() {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [adding, setAdding] = useState<Goal | null>(null);

  return (
    <>
      {data.goals.length === 0 ? (
        <div class="card">
          <EmptyState line="Saving for something? A goal shows how much to put aside each payday." action="New goal" onAction={() => setEditing('new')} icon="piggy-bank" />
        </div>
      ) : (
        <ul class="card rows" aria-label="Goals">
          {data.goals.map((g) => {
            const perPay = goalContributionPerPayday(g, today, data.incomes);
            const reached = g.saved >= g.target;
            return (
              <li key={g.id} class="row row-envelope">
                <div class="row-main">
                  <button type="button" class="row-button env-head" onClick={() => setEditing(g)} aria-label={`Edit ${g.name}`}>
                    <span>
                      <Icon name={g.icon} small /> {g.name}
                      {reached && <span class="badge">Reached</span>}
                    </span>
                    <span class="money">
                      {fmt.money(g.saved, { wholeIfRound: true })} of {fmt.money(g.target, { wholeIfRound: true })}
                    </span>
                  </button>
                  <Progress value={g.target ? g.saved / g.target : 0} level="goal" label={g.name} valueText={`${fmt.money(g.saved)} of ${fmt.money(g.target)}`} />
                  <span class="row-sub">
                    {reached
                      ? 'You did it.'
                      : g.targetDate
                        ? perPay > 0
                          ? `About ${fmt.money(perPay)} each payday to reach it by ${fmt.day(g.targetDate)}`
                          : `Target date ${fmt.day(g.targetDate)} has passed — pick a new one any time`
                        : 'No date — add one to see a per-payday amount'}
                  </span>
                  {!reached && (
                    <button type="button" class="btn btn-small goal-add" onClick={() => setAdding(g)}>
                      Add money
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data.goals.length > 0 && (
        <button type="button" class="btn" onClick={() => setEditing('new')}>
          <Icon name="plus" /> New goal
        </button>
      )}
      {data.goals.some((g) => g.targetDate) && (
        <div class="card card-quiet goal-toggle">
          <Toggle
            label="Set goal money aside in safe to spend"
            checked={data.settings.setAsideGoals}
            onChange={(v) => store.saveSettings({ setAsideGoals: v })}
            hint="Takes each goal's per-payday amount off your safe-to-spend number, so it's not spent by accident."
          />
        </div>
      )}
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New goal' : 'Edit goal'}>
        {editing != null && <GoalForm key={editing === 'new' ? 'new' : editing.id} goal={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={adding != null} onClose={() => setAdding(null)} title={adding ? `Add to ${adding.name}` : ''}>
        {adding && <AddMoneyForm key={adding.id} goal={adding} onDone={() => setAdding(null)} />}
      </Sheet>
    </>
  );
}

function AddMoneyForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const store = useStore();
  const { settings } = useData();
  const fmt = useFmt();
  const [dir, setDir] = useState<'add' | 'take'>('add');
  const [amount, setAmount] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  return (
    <form
      class="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const c = checkMoney(amount, settings.decimalSeparator);
        if (c.state !== 'ok' || c.value <= 0) return setShowErrors(true);
        const delta = dir === 'add' ? Math.abs(c.value) : -Math.abs(c.value);
        const undo = await saveWithUndo(store, 'goals', { ...goal, saved: Math.max(0, goal.saved + delta) });
        toast(`${dir === 'add' ? 'Added' : 'Took out'} ${fmt.money(Math.abs(delta))}`, undo);
        onDone();
      }}
    >
      <Segmented
        label="Add or take out"
        value={dir}
        onChange={setDir}
        options={[
          { value: 'add', label: 'Add' },
          { value: 'take', label: 'Take out' },
        ]}
      />
      <MoneyInput label="Amount" value={amount} onInput={setAmount} autoFocus showErrors={showErrors} />
      <p class="muted">This just tracks your goal. Move the actual money in your banking app.</p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
    </form>
  );
}

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const store = useStore();
  const { settings } = useData();
  const today = useToday();
  const dec = settings.decimalSeparator;
  const [name, setName] = useState(goal?.name ?? '');
  const [icon, setIcon] = useState(goal?.icon ?? 'piggy-bank');
  const [target, setTarget] = useState(moneyText(goal?.target, dec));
  const [saved, setSaved] = useState(moneyText(goal?.saved ?? null, dec));
  const [hasDate, setHasDate] = useState(!!goal?.targetDate);
  const [date, setDate] = useState(goal?.targetDate ?? `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`);
  const [showErrors, setShowErrors] = useState(false);

  const save = async (e: Event) => {
    e.preventDefault();
    const t = checkMoney(target, dec);
    const s = checkMoney(saved, dec);
    if (!name.trim() || t.state !== 'ok' || t.value <= 0 || (s.state !== 'ok' && s.state !== 'empty')) return setShowErrors(true);
    const undo = await saveWithUndo(store, 'goals', {
      id: goal?.id ?? uid(),
      name: name.trim(),
      icon,
      target: Math.abs(t.value),
      saved: s.state === 'ok' ? Math.abs(s.value) : 0,
      targetDate: hasDate ? date : undefined,
    });
    toast(goal ? 'Goal saved' : `${name.trim()} added`, undo);
    onDone();
  };

  return (
    <form class="form" onSubmit={save}>
      <TextInput label="What are you saving for?" value={name} onInput={setName} placeholder="e.g. Trip to see family" autoFocus={!goal} />
      {showErrors && !name.trim() && <p class="field-error">Give it a name.</p>}
      <IconPicker value={icon} onChange={setIcon} />
      <MoneyInput label="Target" value={target} onInput={setTarget} showErrors={showErrors} />
      <MoneyInput label="Saved so far" value={saved} onInput={setSaved} showErrors={showErrors} />
      <Toggle label="I have a date in mind" checked={hasDate} onChange={setHasDate} />
      {hasDate && <DateInput label="Reach it by" value={date} onInput={setDate} />}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
      {goal && (
        <button
          type="button"
          class="btn btn-danger"
          onClick={async () => {
            const undo = await removeWithUndo(store, 'goals', goal);
            toast(`${goal.name} deleted`, undo);
            onDone();
          }}
        >
          Delete this goal
        </button>
      )}
    </form>
  );
}
