/**
 * Which strategies of a module are in force, in the order they decide, from the settings of its form. The rules are those of the platform's decision (see the order list of the
 * module form): a bypass and a "fixed" period come first, then the fixed count of the module, then whatever gives the replicas (the forecast, or the fixed formula), then the
 * metric triggers, then the floors and caps of the periods, then the minimum and the maximum. A fixed count is exact: nothing after it scales it.
 */

export type StrategyKey = 'bypass' | 'fixedCount' | 'source' | 'triggers' | 'periods';

/** in force: it decides or changes the replicas; off: nothing is set; overridden: it is set and a stronger strategy keeps it from changing them */
export type StrategyState = 'active' | 'off' | 'overridden';

export interface StrategyInput {
  bypass: boolean;
  fixedEnabled: boolean;
  fixedReplicas: number;
  /** the forecast is on and its mode is not "none" */
  predicts: boolean;
  /** what the replicas and the Pod follow: the forecasts of the algorithms or the fixed formula */
  decisionSource: 'algorithm' | 'rule';
  /** the metric triggers that are switched on */
  triggers: number;
  /** the periods that are switched on, and how many of them give a count of their own (the "fixed" ones) or only a floor or a cap */
  periods: number;
  periodsFixing: number;
  periodsBounding: number;
}

export interface StrategyRow {
  key: StrategyKey;
  state: StrategyState;
  /** how many there are, for the triggers and the periods; the count for the fixed one */
  count: number;
}

export interface StrategySummary {
  rows: StrategyRow[];
  /** the one that gives the replicas now: bypass, a fixed count, the formula, the forecast, or the default the platform falls back to */
  decides: 'bypass' | 'fixedCount' | 'rule' | 'forecast' | 'fallback';
}

export function strategySummary(input: StrategyInput): StrategySummary {
  const fixed = input.fixedEnabled && input.fixedReplicas > 0;
  const heldByFixed = input.bypass || fixed;
  const source = input.decisionSource === 'rule' ? 'rule' : input.predicts ? 'forecast' : 'fallback';
  const decides: StrategySummary['decides'] = input.bypass ? 'bypass' : fixed ? 'fixedCount' : source;

  const rows: StrategyRow[] = [
    { key: 'bypass', state: input.bypass ? 'active' : 'off', count: 0 },
    { key: 'fixedCount', state: fixed ? (input.bypass ? 'overridden' : 'active') : 'off', count: input.fixedReplicas },
    {
      key: 'source',
      state: input.bypass || fixed ? 'overridden' : source === 'fallback' ? 'off' : 'active',
      count: 0
    },
    {
      key: 'triggers',
      state: input.triggers === 0 ? 'off' : heldByFixed ? 'overridden' : 'active',
      count: input.triggers
    },
    {
      // a period that fixes the count outranks even a fixed count; one that only gives a floor or a cap does not scale a fixed count
      key: 'periods',
      state:
        input.periods === 0
          ? 'off'
          : input.bypass
            ? 'overridden'
            : fixed && input.periodsFixing === 0
              ? 'overridden'
              : 'active',
      count: input.periods
    }
  ];
  return { rows, decides };
}
