/**
 * The reasons the platform gives are written by the backend in English (they are also logged and returned by the API). The
 * pages show them in Chinese: a known sentence is translated, one that is not known is shown as it is, so nothing is lost.
 */
const MODE: Record<string, string> = { observe: '仅观察', recommend: '仅推荐', admission: '准入', auto: '自动' };
const METRIC: Record<string, string> = { cpu: 'CPU', memory: '内存', gpu: 'GPU', replicas: '副本数', rps: '请求量' };

type Rule = [RegExp, (m: RegExpMatchArray) => string];

const RULES: Rule[] = [
  [
    /^insufficient history: (\S+) needs (\d+) samples, got (\d+)$/,
    m => `历史不足：${m[1]} 至少需要 ${m[2]} 个样本，只有 ${m[3]} 个`
  ],
  [
    /^insufficient history: formula needs (\d+) samples, got (\d+)$/,
    m => `历史不足：公式至少需要 ${m[1]} 个样本，只有 ${m[2]} 个`
  ],
  [
    /^insufficient or low quality history: only (\d+)% of the observed (\S+) history is one contiguous usable run \(minimum (\d+)%\)$/,
    m => `历史不足或质量太差：${METRIC[m[2]] || m[2]}历史里只有 ${m[1]}% 是连续可用的一段，至少需要 ${m[3]}%`
  ],
  [
    /^(?:\S+: )?(?:not eligible: )?candidate skipped: insufficient history: need (\d+) training and (\d+) test steps, have (\d+)$/,
    m => `历史不足：回放评分需要 ${m[1]} 个训练步和 ${m[2]} 个测试步，只有 ${m[3]} 步`
  ],
  [/^parameter "(\w+)" is required$/, m => `必填参数 "${m[1]}" 没有设置`],
  [/^cannot enable (\S+): parameter "(\w+)" is required$/, m => `不能启用 ${m[1]}：必填参数 "${m[2]}" 没有设置`],
  [/^(?:\S+: )?no prediction yet$/, () => '还没有预测'],
  [/^no recommendation has been made yet$/, () => '还没有生成推荐'],
  [/^the latest recommendation has expired$/, () => '最新一次推荐已过期'],
  [/^no module manages this workload$/, () => '没有模块管理这个工作负载'],
  [
    /^module "?(.+?)"? is in (\w+) mode, not admission$/,
    m => `模块 ${m[1]} 处于「${MODE[m[2]] || m[2]}」模式，不是准入模式`
  ],
  [/^module "?(.+?)"? is in bypass$/, m => `模块 ${m[1]} 在旁路中`],
  [/^admission mode is switched off by an administrator \((\S+)\)$/, m => `管理员已关闭准入模式（${m[1]}）`],
  [/^auto mode is switched off by an administrator \((\S+)\)$/, m => `管理员已关闭自动模式（${m[1]}）`],
  [/^the recommendation keeps the original requests.*$/, () => '推荐值保持原请求值不变'],
  [/^cpu is outside the module's current bounds$/, () => 'CPU 推荐值超出模块当前的上下限'],
  [/^memory is outside the module's current bounds$/, () => '内存推荐值超出模块当前的上下限'],
  [/^gpu is outside the module's current bounds$/, () => 'GPU 推荐值超出模块当前的上下限'],
  [/^cpu request would exceed the container's limit$/, () => 'CPU 请求值会超过容器的上限'],
  [/^memory request would exceed the container's limit$/, () => '内存请求值会超过容器的上限'],
  [/^decision from platform:(\S+)$/, m => `决策来自平台（${m[1]}）`],
  [
    /^enabled, but no training run is recorded for this module and metric yet$/,
    () => '已启用，但这个模块和指标还没有训练记录'
  ],
  [/^it ran, but made no forecast with a target time between .*$/, () => '运行过，但所选时间范围内没有预测'],
  [/^it ran, but has made no forecast for this metric$/, () => '运行过，但没有为这个指标产生过预测'],
  [
    /^it forecast, but no forecast has met its actual values yet.*$/,
    () => '已有预测，但还没有预测遇到对应的实际值，无法评估'
  ],
  [/^it ran, but has not been scored yet.*$/, () => '运行过，但还没有评分：评分要回放历史，需要足够多的完整窗口'],
  [
    /^no window of the recent history could be replayed with (\S+)$/,
    m => `${m[1]} 在最近的历史里没有可回放的窗口，所以没有评分`
  ]
];

export function reasonText(text: string | null | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  for (const [pattern, translate] of RULES) {
    const match = trimmed.match(pattern);
    if (match) return translate(match);
  }
  return trimmed;
}

/** The actions an operator reports, in Chinese. */
export function scalingActionText(action: string): string {
  return (
    ({ ScaleUp: '扩容', ScaleDown: '缩容', None: '无动作', none: '无动作' } as Record<string, string>)[action] || action
  );
}
