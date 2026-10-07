// Every empty list says one calm line and offers one action — never a blank space.

import { Icon, type IconName } from './icons';

export function EmptyState(props: { line: string; action?: string; onAction?: () => void; icon?: IconName }) {
  return (
    <div class="empty">
      <svg class="empty-illustration" viewBox="0 0 120 72" aria-hidden="true" focusable="false">
        <path class="empty-ground" d="M18 58h84" />
        <path class="empty-shape" d="M38 54V28c0-5 4-9 9-9h26c5 0 9 4 9 9v26" />
        <path class="empty-accent" d="M48 39h24M48 47h16" />
        <circle class="empty-sun" cx="91" cy="19" r="7" />
        <path class="empty-leaf" d="M31 57c-1-10-6-15-13-16 1 8 5 14 13 16Zm0 0c2-9 7-13 14-13-2 7-6 12-14 13Z" />
      </svg>
      <p class="empty-line">
        <Icon name={props.icon ?? 'inbox'} small />
        <span>{props.line}</span>
      </p>
      {props.action && props.onAction && (
        <button type="button" class="btn btn-small" onClick={props.onAction}>
          {props.action}
        </button>
      )}
    </div>
  );
}
