/**
 * What decides a module: one of the forecast, the recommendation mode (the fixed formula), or one strategy (the time periods, the metric triggers, a fixed count); or nothing.
 * The platform holds the same rule (ForecastModule.ValidateDecisionMode): at most one strategy is on, and the forecast and the recommendation mode are on only while no
 * strategy is, and not both. The form makes it impossible to break it: a mode that conflicts with the one that is on cannot be switched on until that one is switched off.
 */

export type DecisionMode = 'algorithm' | 'recommend' | 'periods' | 'triggers' | 'fixed' | 'none';

/** the modes in the order the form lists them */
export const DECISION_MODES: DecisionMode[] = ['algorithm', 'recommend', 'periods', 'triggers', 'fixed'];

/** the strategies: they rank above the forecast and the recommendation mode */
export const STRATEGY_MODES: DecisionMode[] = ['periods', 'triggers', 'fixed'];

export interface DecisionFlags {
  fixed_replicas_enabled?: boolean;
  periods_enabled?: boolean;
  triggers_enabled?: boolean;
  decision_source?: string;
  predict_enabled?: boolean;
  predict_mode?: string;
}

/** the mode a module runs in, by the platform's own order: a strategy (a fixed count, then the periods, then the triggers), else the recommendation mode, else the forecast */
export function decisionModeOf(m: DecisionFlags): DecisionMode {
  if (m.fixed_replicas_enabled) return 'fixed';
  if (m.periods_enabled) return 'periods';
  if (m.triggers_enabled) return 'triggers';
  if (m.decision_source === 'rule') return 'recommend';
  if (m.predict_enabled && m.predict_mode !== 'none') return 'algorithm';
  return 'none';
}

/** the flags of a module that runs in a mode (the forecast mode of a module is kept as it is: the form sets it) */
export function flagsOfMode(
  mode: DecisionMode
): Required<
  Pick<
    DecisionFlags,
    'fixed_replicas_enabled' | 'periods_enabled' | 'triggers_enabled' | 'decision_source' | 'predict_enabled'
  >
> {
  return {
    fixed_replicas_enabled: mode === 'fixed',
    periods_enabled: mode === 'periods',
    triggers_enabled: mode === 'triggers',
    decision_source: mode === 'recommend' ? 'rule' : 'algorithm',
    predict_enabled: mode === 'algorithm'
  };
}

/** the mode that has to be switched off before `target` can be switched on, or null when `target` can be switched on now (nothing else is on) */
export function modeBlocking(current: DecisionMode, target: DecisionMode): DecisionMode | null {
  if (current === 'none' || current === target) return null;
  return current;
}
