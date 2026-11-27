/**
 * The colour of a button of a row, by what the button does, so the same action looks the same on every page: a person finds the delete of any list by its red and the edit of any list by its
 * solid blue. A page spreads the result into the props of its `NButton` (`{ size: 'tiny', ...operateProps('edit'), onClick }`) instead of choosing a colour of its own.
 *
 * - edit: the solid main colour (a change of the row)
 * - detail: the main colour on a light ground (look at the row, change nothing)
 * - view: the info colour on a light ground (look at what hangs on the row: its records, history, events)
 * - copy: the info colour, solid (make another one like it)
 * - run: the success colour on a light ground (do the work now: analyse, calculate, run)
 * - enable: the success colour, solid (switch on, restore, resume)
 * - pause: the warning colour (switch off, bypass, reset, rotate: it can be undone, but it changes how the thing behaves)
 * - delete: the error colour, solid (it cannot be undone)
 */
export type OperateKind = 'edit' | 'detail' | 'view' | 'copy' | 'run' | 'enable' | 'pause' | 'delete';

export interface OperateProps {
  type: 'primary' | 'info' | 'success' | 'warning' | 'error';
  secondary?: boolean;
}

const KINDS: Record<OperateKind, OperateProps> = {
  edit: { type: 'primary' },
  detail: { type: 'primary', secondary: true },
  view: { type: 'info', secondary: true },
  copy: { type: 'info' },
  run: { type: 'success', secondary: true },
  enable: { type: 'success' },
  pause: { type: 'warning' },
  delete: { type: 'error' }
};

export function operateProps(kind: OperateKind): OperateProps {
  return { ...KINDS[kind] };
}
