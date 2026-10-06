// Envelopes: a monthly amount for each kind of spending, with gentle "move money" help.

import { useState } from 'preact/hooks';
import { uid } from '../../db/db';
import type { Category } from '../../db/types';
import { envelopeRows, moveSuggestions, monthOf, type EnvelopeRow } from '../../lib/envelopes';
import { saveWithUndo } from '../../state/actions';
import { useData, useStore } from '../../state/store';
import { checkMoney, MoneyInput, moneyText, Select, TextInput } from '../../ui/fields';
import { useFmt, useToday } from '../../ui/hooks';
import { Icon } from '../../ui/icons';
import { Progress } from '../../ui/Progress';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/Toast';

export function Envelopes() {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const month = monthOf(today);
  const rows = envelopeRows(data.categories, data.transactions, data.envelopeMoves, month);
  const suggestions = moveSuggestions(rows);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [moving, setMoving] = useState(false);
  const withoutLimit = data.categories.filter((c) => !c.archived && c.monthlyLimit == null);
  const totalLimit = rows.reduce((s, r) => s + Math.max(0, r.limit), 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  const doMove = async (fromId: string, toId: string, amount: number) => {
    const undo = await saveWithUndo(store, 'envelopeMoves', { id: uid(), month, fromCategoryId: fromId, toCategoryId: toId, amount });
    const name = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '';
    toast(`Moved ${fmt.money(amount)} from ${name(fromId)} to ${name(toId)}`, undo);
  };

  return (
    <>
      {rows.length > 0 && (
        <p class="muted">
          {fmt.month(`${month}-01`)}: {fmt.money(totalSpent)} spent of {fmt.money(totalLimit)} across your envelopes.
        </p>
      )}

      {suggestions.map((s) => (
        <div key={s.to.category.id} class="card card-note" role="note">
          <p>
            You're {fmt.money(-s.to.remaining)} over in {s.to.category.name} — want to move {fmt.money(s.amount)} from{' '}
            {s.from.category.name}?
          </p>
          <button type="button" class="btn btn-small btn-primary" onClick={() => doMove(s.from.category.id, s.to.category.id, s.amount)}>
            Move {fmt.money(s.amount)}
          </button>
        </div>
      ))}

      {rows.length === 0 ? (
        <div class="card">
          <p>
            Envelopes give each kind of spending a monthly amount, so you can see what's left at a glance. Start with one —
            groceries is a good first.
          </p>
        </div>
      ) : (
        <ul class="card rows" aria-label="Envelopes">
          {rows.map((r) => (
            <EnvelopeItem key={r.category.id} row={r} onEdit={() => setEditing(r.category)} />
          ))}
        </ul>
      )}

      <div class="row-gap">
        <button type="button" class="btn" onClick={() => setEditing('new')}>
          <Icon name="plus" /> New envelope
        </button>
        {rows.length > 1 && (
          <button type="button" class="btn" onClick={() => setMoving(true)}>
            Move money
          </button>
        )}
      </div>

      {withoutLimit.length > 0 && (
        <section class="card card-quiet" aria-labelledby="no-limit">
          <h2 id="no-limit" class="card-title">
            Give a category a monthly amount
          </h2>
          <div class="chips">
            {withoutLimit.map((c) => (
              <button key={c.id} type="button" class="chip" onClick={() => setEditing(c)}>
                <span aria-hidden="true">{c.emoji}</span> {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New envelope' : 'Envelope'}>
        {editing != null && (
          <CategoryForm key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
      <Sheet open={moving} onClose={() => setMoving(false)} title="Move money">
        {moving && (
          <MoveForm
            rows={rows}
            onMove={async (f, t, a) => {
              await doMove(f, t, a);
              setMoving(false);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function EnvelopeItem({ row, onEdit }: { row: EnvelopeRow; onEdit: () => void }) {
  const fmt = useFmt();
  const status = row.remaining >= 0 ? `${fmt.money(row.remaining)} left` : `${fmt.money(-row.remaining)} over`;
  return (
    <li class="row row-envelope">
      <button type="button" class="row-main row-button" onClick={onEdit} aria-label={`${row.category.name}: ${status}. Edit`}>
        <span class="env-head">
          <span>
            <span aria-hidden="true">{row.category.emoji}</span> {row.category.name}
          </span>
          <span class={`mono env-status env-${row.level}`}>{status}</span>
        </span>
        <Progress
          value={row.used}
          level={row.level}
          label={row.category.name}
          valueText={`${fmt.money(row.spent)} of ${fmt.money(row.limit)}`}
        />
        <span class="row-sub">
          {fmt.money(row.spent)} of {fmt.money(row.limit)}
        </span>
      </button>
    </li>
  );
}

function MoveForm({ rows, onMove }: { rows: EnvelopeRow[]; onMove: (from: string, to: string, amount: number) => void }) {
  const { settings } = useData();
  const fmt = useFmt();
  const dec = settings.decimalSeparator;
  const roomiest = [...rows].sort((a, b) => b.remaining - a.remaining)[0];
  const neediest = [...rows].sort((a, b) => a.remaining - b.remaining)[0];
  const [from, setFrom] = useState(roomiest?.category.id ?? '');
  const [to, setTo] = useState((neediest?.category.id !== roomiest?.category.id ? neediest : rows[1])?.category.id ?? '');
  const [amount, setAmount] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const options = rows.map((r) => ({ value: r.category.id, label: `${r.category.emoji} ${r.category.name} (${fmt.money(r.remaining)} left)` }));
  return (
    <form
      class="form"
      onSubmit={(e) => {
        e.preventDefault();
        const c = checkMoney(amount, dec);
        if (c.state !== 'ok' || c.value <= 0 || from === to) return setShowErrors(true);
        onMove(from, to, Math.abs(c.value));
      }}
    >
      <p class="muted">Moves money for this month only. Next month starts fresh.</p>
      <Select label="From" value={from} onChange={setFrom} options={options} />
      <Select label="To" value={to} onChange={setTo} options={options} />
      {showErrors && from === to && <p class="field-error">Pick two different envelopes.</p>}
      <MoneyInput label="How much" value={amount} onInput={setAmount} showErrors={showErrors} />
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Move
        </button>
      </div>
    </form>
  );
}

const EMOJI_CHOICES = ['🛒', '🍔', '🚌', '🛍️', '🎉', '💊', '🏠', '🧾', '📺', '🎁', '🧸', '📦', '☕', '🐾', '💡', '✂️'];

export function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const dec = data.settings.decimalSeparator;
  const [name, setName] = useState(category?.name ?? '');
  const [emoji, setEmoji] = useState(category?.emoji ?? '📦');
  const [limit, setLimit] = useState(moneyText(category?.monthlyLimit, dec));
  const [showErrors, setShowErrors] = useState(false);

  const save = async (e: Event) => {
    e.preventDefault();
    const c = checkMoney(limit, dec);
    if (!name.trim() || c.state === 'invalid' || c.state === 'confirm') return setShowErrors(true);
    const undo = await saveWithUndo(store, 'categories', {
      id: category?.id ?? uid(),
      name: name.trim(),
      emoji: emoji.trim() || '📦',
      color: category?.color ?? '#c4c4c4',
      order: category?.order ?? data.categories.length,
      archived: false,
      monthlyLimit: c.state === 'ok' ? Math.abs(c.value) : undefined,
    });
    toast(category ? 'Saved' : `${name.trim()} added`, undo);
    onDone();
  };

  const archive = async () => {
    if (!category) return;
    const undo = await saveWithUndo(store, 'categories', { ...category, archived: true });
    toast(`${category.name} hidden — past spending keeps its category`, undo);
    onDone();
  };

  return (
    <form class="form" onSubmit={save}>
      <TextInput label="Name" value={name} onInput={setName} placeholder="e.g. Groceries" autoFocus={!category} />
      {showErrors && !name.trim() && <p class="field-error">Give it a name.</p>}
      <div class="field">
        <span class="field-label">Emoji</span>
        <div class="emoji-grid" role="radiogroup" aria-label="Emoji">
          {EMOJI_CHOICES.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={emoji === e} aria-label={e} class="emoji-choice" onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <MoneyInput
        label="Monthly amount (optional)"
        value={limit}
        onInput={setLimit}
        showErrors={showErrors}
        hint="Leave blank to track spending without a limit."
      />
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
      {category && (
        <button type="button" class="link-btn" onClick={archive}>
          Hide this category
        </button>
      )}
    </form>
  );
}
