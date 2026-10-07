// Rules (spec §7.6): how imported transactions get their category. Yours first, then starters.

import { useState } from 'preact/hooks';
import { uid } from '../db/db';
import type { Rule } from '../db/types';
import { ruleMatches } from '../lib/rules';
import { removeWithUndo, saveWithUndo } from '../state/actions';
import { useData, useStore } from '../state/store';
import { Select, TextInput } from '../ui/fields';
import { Icon } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { EmptyState } from '../ui/EmptyState';

const MATCH_LABEL: Record<Rule['matchType'], string> = {
  contains: 'contains',
  startsWith: 'starts with',
  regex: 'matches pattern',
};

export function Rules() {
  const data = useData();
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const catName = (id: string) => {
    const c = data.categories.find((x) => x.id === id);
    return c ? c.name : 'a hidden category';
  };
  const sorted = [...data.rules].sort((a, b) => a.priority - b.priority);
  const mine = sorted.filter((r) => r.priority < 1000);
  const starters = sorted.filter((r) => r.priority >= 1000);
  const row = (r: Rule) => (
    <li key={r.id} class="row">
      <button type="button" class="row-main row-button" onClick={() => setEditing(r)}>
        <span>
          {MATCH_LABEL[r.matchType]} "{r.matchType === 'regex' ? shortPattern(r.pattern) : r.pattern}"
        </span>
        <span class="row-sub">
          → {catName(r.categoryId)}
          {r.renameTo ? ` · shown as "${r.renameTo}"` : ''}
        </span>
      </button>
    </li>
  );

  return (
    <>
      <p class="muted">When you import a statement, each transaction gets the category of the first rule that matches its description.</p>
      <h2 class="log-day-title">Your rules</h2>
      {mine.length === 0 ? (
        <div class="card">
          <EmptyState line="No rules of your own yet. Sorting an import offers to make them." action="Add a rule" onAction={() => setEditing('new')} />
        </div>
      ) : (
        <ul class="card rows">{mine.map(row)}</ul>
      )}
      {mine.length > 0 && (
        <button type="button" class="btn" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Add a rule
        </button>
      )}
      <details class="card mapping-details">
        <summary class="card-title">Starter rules ({starters.length})</summary>
        <ul class="rows">{starters.map(row)}</ul>
      </details>
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a rule' : 'Edit rule'}>
        {editing != null && <RuleForm key={editing === 'new' ? 'new' : editing.id} rule={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function shortPattern(p: string): string {
  const plain = p.replace(/\\b|\\s\*|\\\*|\?|\\\.|\(\?!.*?\)/g, '').replace(/\|/g, ', ');
  return plain.length > 40 ? plain.slice(0, 40) + '…' : plain;
}

function RuleForm({ rule, onDone }: { rule: Rule | null; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const cats = data.categories.filter((c) => !c.archived);
  const [matchType, setMatchType] = useState<Rule['matchType']>(rule?.matchType ?? 'contains');
  const [pattern, setPattern] = useState(rule?.pattern ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? cats[0]?.id ?? '');
  const [renameTo, setRenameTo] = useState(rule?.renameTo ?? '');
  const [test, setTest] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  let patternOk = pattern.trim() !== '';
  if (matchType === 'regex') {
    try {
      new RegExp(pattern);
    } catch {
      patternOk = false;
    }
  }

  return (
    <form
      class="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!patternOk || !categoryId) return setShowErrors(true);
        const mineCount = data.rules.filter((r) => r.priority < 1000).length;
        const undo = await saveWithUndo(store, 'rules', {
          id: rule?.id ?? uid(),
          matchType,
          pattern: pattern.trim(),
          categoryId,
          renameTo: renameTo.trim() || undefined,
          priority: rule?.priority ?? 100 + mineCount,
        });
        toast(rule ? 'Rule saved' : 'Rule added', undo);
        onDone();
      }}
    >
      <Select
        label="When the description"
        value={matchType}
        onChange={setMatchType}
        options={[
          { value: 'contains', label: 'contains' },
          { value: 'startsWith', label: 'starts with' },
          { value: 'regex', label: 'matches a pattern (advanced)' },
        ]}
      />
      <TextInput label="This text" value={pattern} onInput={setPattern} placeholder="e.g. TESCO" />
      {showErrors && !patternOk && <p class="field-error">{matchType === 'regex' ? "That pattern isn't valid." : 'Type some text to match.'}</p>}
      <Select label="Put it in" value={categoryId} onChange={setCategoryId} options={cats.map((c) => ({ value: c.id, label: c.name }))} />
      <TextInput label="Show it as (optional)" value={renameTo} onInput={setRenameTo} placeholder="e.g. Tesco" hint="Replaces the bank's description in your log." />
      <TextInput label="Try it on a description" value={test} onInput={setTest} placeholder="Paste a line from your statement" />
      {test && patternOk && (
        <p class="field-hint" aria-live="polite">
          {ruleMatches({ matchType, pattern }, test) ? (
            <>
              <Icon name="check" small /> This rule would match.
            </>
          ) : (
            'This rule would not match.'
          )}
        </p>
      )}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
      {rule && (
        <button
          type="button"
          class="btn btn-danger"
          onClick={async () => {
            const undo = await removeWithUndo(store, 'rules', rule);
            toast('Rule deleted', undo);
            onDone();
          }}
        >
          Delete this rule
        </button>
      )}
    </form>
  );
}
