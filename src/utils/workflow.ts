import { $t } from '@/locales';

/**
 * Resolves the caption for a pipeline transition: the transition's own
 * `label` if the pipeline JSON sets one, otherwise the label of a matching
 * entry_actions button (event-matched) so a transition doesn't need its own
 * `label` duplicated when a notification button already names it, and
 * finally the raw event key as a last-resort fallback so something always
 * renders.
 */
export function resolveTransitionLabel(stateDef: any, event: string, tr: any): string {
  const label = tr?.label;
  if (typeof label === 'string' && label.trim()) return label;
  for (const entryAction of stateDef?.entry_actions ?? []) {
    for (const button of entryAction?.buttons ?? []) {
      if (button?.event === event && typeof button?.label === 'string' && button.label.trim()) {
        return button.label;
      }
    }
  }
  return event;
}

/** Transitions whose event name reads as reject/fail render as a destructive (red) action. */
export function isDestructiveTransition(event: string): boolean {
  return event.includes('reject') || event.includes('fail');
}

/**
 * Translates a workflow transition's guard_role code (e.g. "APPROVER",
 * "OPS") into a localized label. Falls back to the raw code for any role
 * not in page.workflow.roles, so a newly added role still renders something
 * (in its raw form) instead of disappearing, while every known role gets a
 * real translated label instead of a bare English/uppercase code sitting
 * next to localized text.
 */
export function guardRoleLabel(code?: string | null): string {
  if (!code) return '';
  const key = `page.workflow.roles.${code}` as App.I18n.I18nKey;
  const translated = $t(key as any);
  return translated === key ? code : translated;
}
