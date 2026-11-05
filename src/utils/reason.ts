/**
 * The reasons the platform gives are written by the backend in English (they are also logged and returned by the API). The
 * pages show them in Chinese: a known sentence is translated, one that is not known is shown as it is, so nothing is lost.
 */
import { formatDateTime } from '@/utils/date';

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
    // the tail after the semicolon says what the run is and what ends it (see runDetail in the backend)
    /^insufficient or low quality history: only (\d+)% of the observed (\S+) history is one contiguous usable run \(minimum (\d+)%\)(?:; observed ([\d.]+)h, the run is ([\d.]+)h from (\S+?)(?:, the gap before it is (\d+) steps \(fill limit (\d+)\)|, nothing is stored before it))?$/,
    m => {
      const head = `历史不足或质量太差：${METRIC[m[2]] || m[2]}历史里只有 ${m[1]}% 是连续可用的一段，至少需要 ${m[3]}%`;
      if (!m[4]) return head;
      const span = (hours: string) => (Number(hours) >= 48 ? `${(Number(hours) / 24).toFixed(1)} 天` : `${hours} 小时`);
      const run = `。已存的数据跨度 ${span(m[4])}，其中连续的一段是 ${span(m[5])}，从 ${formatDateTime(m[6])} 起`;
      return m[7] === undefined
        ? `${head}${run}，它之前没有数据`
        : `${head}${run}；它前面有一段 ${m[7]} 步的缺口没有被补上（最大补缺步数 ${m[8]}）`;
    }
  ],
  [
    /^(?:\S+: )?(?:not eligible: )?candidate skipped: insufficient history: need (\d+) training and (\d+) test steps, have (\d+)$/,
    m => `历史不足：回放评分需要 ${m[1]} 个训练步和 ${m[2]} 个测试步，只有 ${m[3]} 步`
  ],
  [
    /^lagging: its forecasts of the last (\d+) steps missed the actual values by (\d+)% \(limit (\d+)%\), (above|below) them$/,
    m =>
      `落后：最近 ${m[1]} 步的预测与实际值相差 ${m[2]}%（上限 ${m[3]}%），预测${m[4] === 'above' ? '高于' : '低于'}实际值，本轮不参与选择`
  ],
  [/^parameter "(\w+)" is required$/, m => `必填参数 "${m[1]}" 没有设置`],
  [/^cannot enable (\S+): parameter "(\w+)" is required$/, m => `不能启用 ${m[1]}：必填参数 "${m[2]}" 没有设置`],
  [
    /^this metric's source is disabled, so no algorithm runs on it$/,
    () => '这个指标的来源已停用，所以没有算法在它上面运行'
  ],
  [
    /^this metric is read as measured history, not forecast, so no algorithm runs on it$/,
    () => '这个指标按实测历史取值（用于 OOM 等保护），不做预测，所以没有算法曲线'
  ],
  [
    /^the module has no enabled replicas metric, so there is no actual replica count to draw$/,
    () => '模块里没有已启用的「副本数」指标，所以没有实际副本数可画'
  ],
  [/^Prometheus returned no replica sample in the range$/, () => 'Prometheus 在这个时间范围内没有返回副本数样本'],
  [
    /^.*the dataset step \((\S+)\) is finer than the step of the query \((\S+)\).*$/,
    m =>
      `模块的步长（${m[1]}）比这个指标查询的步长（${m[2]}）更细，粗粒度的样本无法拆成更细的网格：请把模块步长改成不小于查询步长，或把该指标模板的查询步长改小`
  ],
  [
    /^.*the dataset step \((\S+)\) is not a whole multiple of the step of the query \((\S+)\).*$/,
    m => `模块的步长（${m[1]}）不是这个指标查询步长（${m[2]}）的整数倍：请改成整数倍`
  ],
  // the replica count of a fixed count and of the floors and caps of the time windows (see decision.ApplyReplicaWindows)
  [/^the module keeps a fixed (\d+) replicas$/, m => `模块固定为 ${m[1]} 个副本，不由算法决定`],
  [/^raised to (\d+) by the window "(.+)" \(at least\)$/, m => `被时间段「${m[2]}」（至少）抬高到 ${m[1]}`],
  [/^capped at (\d+) by the window "(.+)" \(at most\)$/, m => `被时间段「${m[2]}」（至多）压低到 ${m[1]}`],
  [
    /^a cap window is below the floor window "(.+)": the floor wins$/,
    m => `有「至多」时间段低于「至少」时间段「${m[1]}」，以至少为准`
  ],
  [/^capped at the maximum (\d+) of the module$/, m => `被模块的上限 ${m[1]} 压住`],
  [/^raised to the minimum (\d+) of the module$/, m => `被模块的下限 ${m[1]} 抬高`],
  [/^raised to the minimum (\d+)$/, m => `被抬高到模块下限 ${m[1]}`],
  [/^capped at the maximum (\d+)$/, m => `被压到模块上限 ${m[1]}`],
  // why a field fell back to the default (see degradeReason in the backend)
  [
    /^no algorithm is baseline or promoted for its current parameters$/,
    () => '没有算法具备资格：基线算法永远有资格，其余算法要在回测里胜过基线并晋升；当前参数下还没有算法满足'
  ],
  [
    /^every algorithm with a forecast scored below the module minimum, or has not been scored yet$/,
    () => '所有已有预测的算法评分都低于模块要求的最低分，或还没有评分'
  ],
  [/^the newest forecast is older than the module TTL$/, () => '最新的预测已超过模块的有效期'],
  [/^no forecast has been made yet$/, () => '还没有产生预测'],
  [/^no usable forecast$/, () => '没有可用的预测'],
  [
    /^the forecast is stale and the last (\d+) cycle\(s\) failed: (.*)$/,
    m => `预测已过期，且最近 ${m[1]} 个周期都失败了：${reasonText(m[2])}`
  ],
  [
    // the history holds too few repeats of the cycle a seasonal algorithm learns (see seasonCoverage in the backend)
    /^not eligible: its cycle is (\S+) and the history holds ([\d.]+) of them \((\S+)\), (\d+) are needed \((\S+)\) before it may decide$/,
    m =>
      `不具备资格：它学习的周期是 ${m[1]}，历史只有 ${m[2]} 个周期（${m[3]}），至少需要 ${m[4]} 个（${m[5]}）才能参与决策`
  ],
  [
    /^the module does not state the (CPU|memory) capacity of one Pod \(dynamic replicas with a Pod (?:CPU|memory) request\)$/,
    m =>
      `模块没有写明单个 Pod 的${m[1] === 'CPU' ? 'CPU' : '内存'}（要在模块里选动态副本并填 Pod ${m[1] === 'CPU' ? 'CPU' : '内存'}请求），所以预测值换算不出副本数`
  ],
  [/^only a CPU or memory forecast has a replica count$/, () => '只有 CPU 或内存的预测能换算成副本数'],
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

function translateWhole(text: string): string | null {
  for (const [pattern, translate] of RULES) {
    const match = text.match(pattern);
    if (match) return translate(match);
  }
  return null;
}

export function reasonText(text: string | null | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  const whole = translateWhole(trimmed);
  if (whole !== null) return whole;
  // a reason is often several sentences joined by "; ": translate the ones that are known and keep the rest as they are
  const parts = trimmed.split('; ');
  if (parts.length > 1) {
    const translated = parts.map(translateWhole);
    if (translated.some(item => item !== null)) return parts.map((part, i) => translated[i] ?? part).join('；');
  }
  return trimmed;
}

/** The actions an operator reports, in Chinese. */
export function scalingActionText(action: string): string {
  return (
    ({ ScaleUp: '扩容', ScaleDown: '缩容', None: '无动作', none: '无动作' } as Record<string, string>)[action] || action
  );
}
