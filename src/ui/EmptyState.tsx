// Every empty list says one calm line and offers one action — never a blank space.

import { Icon, type IconName } from './icons';

export function EmptyState(props: { line: string; action?: string; onAction?: () => void; icon?: IconName }) {
  return (
    <div class="empty">
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
