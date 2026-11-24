import { reactive, watch } from 'vue';

/**
 * The groups of the curves of a chart of the resource dashboard: what was measured (actual), what is configured (Requests, Limits), what is recommended and the percentiles of
 * the use. One choice holds for every chart of the page, one Pod or all the replicas alike, and is kept in the browser; the percentiles are off until asked for, so a chart starts
 * with the curves that are compared most: the use, the Requests and the Limits, and the recommended ones.
 */
export type ChartGroup = 'actual' | 'config' | 'recommend' | 'percentile';
export const CHART_GROUPS: ChartGroup[] = ['actual', 'config', 'recommend', 'percentile'];

const KEY = 'overprovision.chartGroups';
const DEFAULTS: Record<ChartGroup, boolean> = { actual: true, config: true, recommend: true, percentile: false };

function read(): Record<ChartGroup, boolean> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Record<ChartGroup, boolean>>;
    return {
      ...DEFAULTS,
      ...Object.fromEntries(CHART_GROUPS.filter(g => typeof stored[g] === 'boolean').map(g => [g, stored[g]]))
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const chartGroups = reactive<Record<ChartGroup, boolean>>(read());

watch(
  chartGroups,
  value => {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      // a browser without storage keeps the choice for the session only
    }
  },
  { deep: true }
);

export function resetChartGroups() {
  Object.assign(chartGroups, DEFAULTS);
}

/** whether a curve of the group is shown (a curve with no group always is) */
export const groupShown = (group?: ChartGroup) => !group || chartGroups[group];
