// Bottom sheet built on <dialog>: native focus trapping, Escape to close, screen-reader modal.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './icons';

export function Sheet(props: { open: boolean; onClose: () => void; title: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  // Close the native dialog in the same event as the user's tap. Waiting for the next
  // render leaves the page behind it inert for a moment, and input typed then is lost.
  const close = () => {
    if (ref.current?.open) ref.current.close();
    props.onClose();
  };

  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // Tap on the backdrop (the dialog element itself, outside the panel) closes.
        if (e.target === ref.current) close();
      }}
    >
      {props.open && (
        <div class="sheet-panel">
          <header class="sheet-head">
            <h2 id="sheet-title">{props.title}</h2>
            <button type="button" class="icon-btn" onClick={close} aria-label="Close">
              <Icon name="close" />
            </button>
          </header>
          <div class="sheet-body">{props.children}</div>
        </div>
      )}
    </dialog>
  );
}
