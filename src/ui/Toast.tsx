// One toast at a time, bottom of screen, with an optional Undo for 8 seconds (spec §3.6).

import { useEffect, useState } from 'preact/hooks';

interface ToastMsg {
  id: number;
  text: string;
  undo?: () => Promise<void> | void;
}

let current: ToastMsg | null = null;
const listeners = new Set<() => void>();
let seq = 0;

export function toast(text: string, undo?: ToastMsg['undo']): void {
  current = { id: ++seq, text, undo };
  listeners.forEach((fn) => fn());
}

/** Clear any toast (used when the user moves to another screen). */
export function dismissToast(): void {
  if (current) {
    current = null;
    listeners.forEach((fn) => fn());
  }
}

function dismiss(id: number) {
  if (current?.id === id) {
    current = null;
    listeners.forEach((fn) => fn());
  }
}

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(current);
  useEffect(() => {
    const fn = () => setMsg(current);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => dismiss(msg.id), 8000);
    return () => clearTimeout(t);
  }, [msg?.id]);

  return (
    <div class="toast-region" role="status" aria-live="polite">
      {msg && (
        <div class="toast" key={msg.id}>
          <span>{msg.text}</span>
          {msg.undo && (
            <button
              type="button"
              class="toast-undo"
              onClick={async () => {
                dismiss(msg.id);
                await msg.undo!();
                toast('Undone');
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
