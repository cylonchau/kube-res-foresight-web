export type ConfigCategory =
  | 'auth'
  | 'ldap'
  | 'forecast'
  | 'analysis'
  | 'operator'
  | 'assistant'
  | 'ui'
  | 'http'
  | 'notify';
export const CONFIG_CATEGORIES: ConfigCategory[] = [
  'auth',
  'ldap',
  'forecast',
  'analysis',
  'operator',
  'assistant',
  'ui',
  'http',
  'notify'
];
export function categoryOf(key: string): ConfigCategory {
  if (key.startsWith('ldap.')) return 'ldap';
  if (key.startsWith('forecast.')) return 'forecast';
  if (key.startsWith('analysis.')) return 'analysis';
  if (key.startsWith('operator.')) return 'operator';
  if (key.startsWith('assistant.')) return 'assistant';
  if (key.startsWith('ui.')) return 'ui';
  if (key.startsWith('http.')) return 'http';
  if (key.startsWith('notify.')) return 'notify';
  return 'auth';
}
export interface ConfigNote {
  name: string;
  purpose: string;
}

const band = (p: string, name: string) => ({
  [`analysis.rec_${p}_target_percent`]: {
    name: `推荐：${name} 目标比例（占 Requests 的百分比）`,
    purpose: `推荐 Requests 时，${name} 使用量应该只占 Requests 的这么多。推荐的 Requests 是 P90、P95、P99 各自（使用量 ÷ 目标比例）里最大的一个。`
  },
  [`analysis.rec_${p}_low_percent`]: {
    name: `推荐：${name} 合理区间下限（占 Requests 的百分比）`,
    purpose: `${name} 使用量低于 Requests 的这个比例，说明 Requests 配多了（超配）。要小于上限。`
  },
  [`analysis.rec_${p}_high_percent`]: {
    name: `推荐：${name} 合理区间上限（占 Requests 的百分比）`,
    purpose:
      p === 'p99'
        ? 'P99 使用量高于 Requests 的这个比例时，尾部超出了合理区间：平时使用量是真实的就判欠配；平时使用量很低则是偶发高峰，不判超配也不下调。'
        : `${name} 使用量高于 Requests 的这个比例，说明 Requests 配少了（欠配）。`
  }
});

/** the Chinese name and purpose of the parameters of the recommendation; the database holds the English ones */
const NOTES: Record<string, ConfigNote> = {
  ...band('p90', 'P90'),
  ...band('p95', 'P95'),
  ...band('p99', 'P99'),
  'analysis.rec_limit_headroom_percent': {
    name: '推荐：Limits 余量（百分比）',
    purpose: '推荐的 Limits = P99 使用量加上这个余量，并且不低于推荐的 Requests（0-300）。'
  },
  'analysis.baseline_window_days': {
    name: '推荐分析周期（天）',
    purpose:
      '判定超配/欠配和算出推荐 Requests、Limits 用的周期，取 1、7、15、30 天之一。它不随资源大盘选的图表窗口变化：30 天里只有一天的高峰不会决定推荐值。周期比这短的结果可信度降一级。'
  },
  'analysis.grade_severe_percent': {
    name: '严重超配起点（百分比）',
    purpose:
      '超配的 Requests 里，比推荐值多出的部分占 Requests 的这个比例及以上为严重超配（10-100），要大于中度的比例。'
  },
  'analysis.grade_moderate_percent': {
    name: '中度超配起点（百分比）',
    purpose: '超配的 Requests 里，多出的部分达到这个比例为中度超配，低于它为轻度超配（5-99）。'
  }
};
export function noteOf(key: string): ConfigNote | undefined {
  return NOTES[key];
}
