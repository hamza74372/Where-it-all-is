// Brain dump per month (spec §7.6). Saves as you type; nothing to remember to press.

import { useEffect, useRef, useState } from 'preact/hooks';
import { addMonthsYM } from '../lib/dates';
import { currentMonth } from '../lib/insights';
import { useData, useStore } from '../state/store';
import { useFmt, useToday } from '../ui/hooks';
import { Icon } from '../ui/icons';

export function Notes() {
  const today = useToday();
  const [month, setMonth] = useState(currentMonth(today));
  const fmt = useFmt();
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const p = addMonthsYM(y, m, n);
    setMonth(`${p.y}-${String(p.m).padStart(2, '0')}`);
  };
  return (
    <>
      <div class="cal-head">
        <button type="button" class="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
          <Icon name="back" />
        </button>
        <h2 class="card-title" aria-live="polite">
          {fmt.month(`${month}-01`)}
        </h2>
        <button type="button" class="icon-btn" onClick={() => shift(1)} aria-label="Next month">
          <Icon name="forward" />
        </button>
      </div>
      <NoteEditor key={month} month={month} />
    </>
  );
}

function NoteEditor({ month }: { month: string }) {
  const store = useStore();
  const { notes } = useData();
  const existing = notes.find((n) => n.month === month);
  const [text, setText] = useState(existing?.text ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) return;
    setStatus('saving');
    const t = setTimeout(async () => {
      if (text.trim() || existing) await store.upsert('notes', [{ id: `note-${month}`, month, text }]);
      dirty.current = false;
      setStatus('saved');
    }, 600);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div class="card">
      <label for="note-text" class="card-title">
        Notes for this month
      </label>
      <p class="muted">Anything on your mind — a big expense coming, a reminder, how the month felt.</p>
      <textarea
        id="note-text"
        class="input note-area"
        value={text}
        placeholder="Type here. It saves by itself."
        onInput={(e) => {
          dirty.current = true;
          setText(e.currentTarget.value);
        }}
      />
      <p class="field-hint" aria-live="polite">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved on this device.' : ' '}
      </p>
    </div>
  );
}
