// The app's one delete rule: single items go straight away with an Undo toast. Bulk actions
// (erase everything, undo a whole import, clear the examples) ask first, here.

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Sheet } from './Sheet';

export function Confirm(props: {
  open: boolean;
  title: string;
  children: ComponentChildren;
  confirmLabel: string;
  /** The user must type this word (e.g. ERASE) before the button works. */
  typeToConfirm?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const word = props.typeToConfirm;
  const ready = !word || typed.trim().toUpperCase() === word;
  const cancel = () => {
    setTyped('');
    props.onCancel();
  };
  return (
    <Sheet open={props.open} onClose={cancel} title={props.title} role="alertdialog">
      <form
        class="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready || busy) return;
          setBusy(true);
          try {
            await props.onConfirm();
          } finally {
            setBusy(false);
            setTyped('');
          }
        }}
      >
        <div class="confirm-body">{props.children}</div>
        {word && (
          <label class="field">
            <span class="field-label">Type {word} to confirm</span>
            <input
              class="input"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellcheck={false}
              value={typed}
              onInput={(e) => setTyped(e.currentTarget.value)}
            />
          </label>
        )}
        <div class="form-actions">
          <button type="button" class="btn" onClick={cancel}>
            Cancel
          </button>
          <button type="submit" class="btn btn-danger btn-grow" disabled={!ready || busy}>
            {props.confirmLabel}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
