import { allText, amountText, podsOf, totalText } from './amount.ts';
import { formatBytes, formatCores, formatDecimal, formatPercent } from './format.ts';
import {
  type Level,
  type ReplicaView,
  directionLevel,
  replicaDeltaParts,
  replicaView,
  schemeGroups,
  statusLevel
} from './overprovision-replicas.ts';
import { adjustmentOf, adjustmentText } from './overprovision-verdict.ts';

/**
 * The question of the AI analysis of a module. It gives the assistant what was measured (the use of one Pod and of all the replicas, the Requests and Limits and the replicas
 * the cluster has now, the throttling, the OOM kills, the JVM) and asks for its own conclusion: its own recommended configuration and replicas, the way it got them, and where it
 * differs from the platform and why. The recommendation of the platform is given as a figure to compare with, not as an answer to write out again. The question asks for an
 * analysis only; the assistant has no tool that changes anything.
 */
export type AiLang = 'zh-CN' | 'en-US';

/** the assistant refuses a message longer than 4000 characters */
const MAX_CHARS = 3900;

const amount = (resource: string, value: number) =>
  resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 3);

const asAmountResource = (resource: string) => (resource === 'memory' ? 'memory' : 'cpu');

/** the Limits now, as written in the spec of one Pod (from Prometheus; none says so) */
function limitText(r: Api.Overprovision.Result, zh: boolean) {
  if (!(r.limit > 0)) return zh ? 'Prometheus 无数据' : 'no data in Prometheus';
  return amountText(asAmountResource(r.resource), r.limit);
}

function requestText(r: Api.Overprovision.Result, zh: boolean) {
  return r.request > 0
    ? amountText(asAmountResource(r.resource), r.request)
    : zh
      ? 'Prometheus 无数据'
      : 'no data in Prometheus';
}

/** one row of the platform's own comparison: the figure now and the one the platform worked out, for one Pod and for all the replicas, as the table of the page writes them */
export interface RecommendedFigure {
  label: string;
  /** the figure now of one Pod and of all the replicas; "-" when Prometheus gave none */
  nowPod: string;
  nowTotal: string;
  /** what the platform recommends, for one Pod and for all the replicas; "-" when no recommendation could be made */
  pod: string;
  total: string;
  /** how the figure now stands against the platform's recommendation: over-provisioned, under-provisioned or reasonable, with the amount of one Pod and its share; "-" when it cannot be said */
  adjust: string;
  /** the colour of that: one colour for one meaning (see utils/overprovision-replicas) */
  level: Level;
}

/** the analysis the verdict and the recommendation are of: the one of the recommendation period, or (an older answer of the platform) the one of the window */
export const recommendationOf = (detail: Api.Overprovision.Detail) => detail.recommend ?? detail.windows[0];

/** the words of how a figure stands against the recommended one, and its colour */
function adjustWords(
  resource: 'cpu' | 'memory',
  now: number,
  recommended: number,
  status: string | null,
  zh: boolean
): { text: string; level: Level } {
  const a = adjustmentOf(now, recommended);
  if (!a) return { text: '-', level: 'info' };
  const delta = adjustmentText(resource, a);
  if (status === 'limited')
    return { text: zh ? '受限（OOM 或限流），不下调' : 'limited (OOM or throttling), not lowered', level: 'info' };
  if (a.direction === 'same') return { text: zh ? '合理，无需调整' : 'reasonable, no change', level: 'ok' };
  if (status === null)
    // a Limits has no verdict of its own: it is told how far it is from the recommended one
    return a.direction === 'over'
      ? { text: zh ? `可降低 ${delta}` : `could be lowered by ${delta}`, level: 'warn' }
      : { text: zh ? `需提高 ${delta}` : `needs raising by ${delta}`, level: 'bad' };
  if (status === 'ok')
    return a.direction === 'over'
      ? { text: zh ? `合理，可优化 ${delta}` : `reasonable, could give back ${delta}`, level: 'ok' }
      : {
          text: zh ? `合理，推荐高出当前 ${delta}` : `reasonable, recommended is above now by ${delta}`,
          level: 'ok'
        };
  return a.direction === 'over'
    ? { text: zh ? `超配 ${delta}` : `over-provisioned by ${delta}`, level: statusLevel('over') }
    : { text: zh ? `欠配 ${delta}` : `under-provisioned by ${delta}`, level: statusLevel('under') };
}

/** the four rows of the platform's comparison, as the table of the page has them: the recommendation is the platform's (rounded up to a figure a spec can say), and its total is that figure times the Pods the total now is of. */
export function recommendedFigures(detail: Api.Overprovision.Detail, zh = true): RecommendedFigure[] {
  const win = recommendationOf(detail);
  const replicas = Math.max(detail.replicas ?? 0, 0);
  const rows: RecommendedFigure[] = [];
  for (const [r, name] of [
    [win?.cpu, 'CPU'],
    [win?.memory, 'Memory']
  ] as const) {
    if (!r) continue;
    const resource = asAmountResource(r.resource);
    for (const [label, now, nowTotal, recommended, status] of [
      [`${name} Requests`, r.request, r.request_total, r.suggested, r.status],
      [`${name} Limits`, r.limit, r.limit_total, r.suggested_limit, null]
    ] as const) {
      const adjust = adjustWords(resource, now, recommended, status, zh);
      rows.push({
        label,
        nowPod: amountText(resource, now),
        nowTotal: allText(resource, now, nowTotal, replicas),
        pod: amountText(resource, recommended),
        // the total of the recommendation is of the Pods the total now is of, as the table of the page has it
        total: totalText(resource, recommended, podsOf(now, nowTotal, replicas)),
        adjust: adjust.text,
        level: adjust.level
      });
    }
  }
  return rows;
}

/** the words of what the replica plan of the platform says, and its colour */
export function replicaWords(view: ReplicaView | null, zh: boolean): { text: string; level: Level } {
  if (!view || view.recommended <= 0)
    return {
      text: zh ? '无推荐（没有全副本使用量）' : 'none (the use of all the replicas is not known)',
      level: 'info'
    };
  if (view.direction === 'unknown' || view.current <= 0)
    return { text: zh ? '没有当前副本数，不判断增减' : 'the replicas now are not known', level: 'info' };
  const level = directionLevel(view.direction);
  const { n, share } = replicaDeltaParts(view);
  if (view.direction === 'out')
    return { text: zh ? `增加 ${n} 个副本（${share}）` : `add ${n} replicas (${share})`, level };
  if (view.direction === 'in')
    return { text: zh ? `减少 ${n} 个副本（${share}）` : `remove ${n} replicas (${share})`, level };
  return { text: zh ? '副本数合适，无需调整' : 'replicas are right, no change', level };
}

const source: Record<string, [string, string]> = {
  kubernetes: ['Kubernetes 的 spec.replicas，operator 读取', 'spec.replicas of Kubernetes, read by the operator'],
  prometheus: ['Prometheus 实测的就绪副本数', 'the ready replicas measured by Prometheus'],
  stored: ['平台保存的最近一次实测采样', 'the newest measured sample stored']
};

/** the constraints of the module on its replicas, in words (module management has them; unset is said so, not made up) */
function limitWords(view: ReplicaView | null, zh: boolean): string {
  const l = view?.limits;
  const parts: string[] = [];
  if (l?.min) parts.push(zh ? `最少 ${l.min} 个` : `at least ${l.min}`);
  if (l?.max) parts.push(zh ? `最多 ${l.max} 个` : `at most ${l.max}`);
  if (l?.scale_up_step)
    parts.push(zh ? `每次最多增加 ${l.scale_up_step} 个` : `at most ${l.scale_up_step} added at a time`);
  if (l?.scale_down_step)
    parts.push(zh ? `每次最多减少 ${l.scale_down_step} 个` : `at most ${l.scale_down_step} removed at a time`);
  if (!parts.length) return zh ? '模块没有配置副本数约束' : 'the module sets no replica constraint';
  return parts.join(zh ? '，' : ', ');
}

/** the coefficients of the module in module management, and the target shares the dashboard divides the use by (the module's own, else the system's) */
function coefficientWords(detail: Api.Overprovision.Detail, zh: boolean): string {
  const c = detail.coefficients;
  const p = detail.params;
  const share = (v?: number) => (v && v > 0 ? formatDecimal(v, 4) : '-');
  const parts: string[] = [];
  if (c)
    parts.push(
      zh
        ? `容量保留系数 ${c.capacity_reserve_set ? formatDecimal(c.capacity_reserve, 4) : '未配置（按 1）'}、推荐值系数 ${formatDecimal(c.headroom, 4)}、OOM 保护系数 ${formatDecimal(c.oom_uplift, 4)}`
        : `capacity reserve coefficient ${c.capacity_reserve_set ? formatDecimal(c.capacity_reserve, 4) : 'not set (1)'}, recommendation coefficient ${formatDecimal(c.headroom, 4)}, OOM protection coefficient ${formatDecimal(c.oom_uplift, 4)}`
    );
  if (p)
    parts.push(
      zh
        ? `Requests 目标占比 P90 ${share(p.p90.target)}、P95 ${share(p.p95.target)}、P99 ${share(p.p99.target)}；Requests 余量 CPU ${formatDecimal(p.cpu_request_headroom ?? 0, 4)}、内存 ${formatDecimal(p.memory_request_headroom ?? 0, 4)}；Limits 系数（P99 的倍数）CPU ${formatDecimal(p.cpu_limit_factor || p.limit_factor, 4)}、内存 ${formatDecimal(p.memory_limit_factor || p.limit_factor, 4)}；Limits 峰值占比上限 ${share(p.peak_near_limit)}`
        : `Requests target share P90 ${share(p.p90.target)}, P95 ${share(p.p95.target)}, P99 ${share(p.p99.target)}; Requests margin CPU ${formatDecimal(p.cpu_request_headroom ?? 0, 4)}, memory ${formatDecimal(p.memory_request_headroom ?? 0, 4)}; Limits coefficient (multiple of P99) CPU ${formatDecimal(p.cpu_limit_factor || p.limit_factor, 4)}, memory ${formatDecimal(p.memory_limit_factor || p.limit_factor, 4)}; Limits peak share ${share(p.peak_near_limit)}`
    );
  return (zh ? '模块的计算系数：' : 'coefficients of the module: ') + (parts.join(zh ? '；' : '; ') || '-');
}

/** what the question tells the model of the replicas the cluster has now */
function replicaFacts(view: ReplicaView | null, zh: boolean): string {
  if (!view || view.current <= 0)
    return zh
      ? '当前副本数：Prometheus 无数据（不要用预测或推荐值代替）'
      : 'replicas now: no data in Prometheus (do not stand in a forecast or a recommendation)';
  const range =
    view.max > 0
      ? zh
        ? `，推荐周期内最少 ${view.min}、最多 ${view.max}`
        : `, fewest ${view.min} and most ${view.max} in the period`
      : '';
  return zh
    ? `当前副本数 ${view.current}（${source[view.from]?.[0] ?? 'Prometheus'}${view.ready > 0 ? `，其中就绪 ${view.ready}` : ''}）${range}`
    : `replicas now ${view.current} (${source[view.from]?.[1] ?? 'by Prometheus'}${view.ready > 0 ? `, ${view.ready} of them ready` : ''})${range}`;
}

function resourceLines(r: Api.Overprovision.Result, zh: boolean) {
  const name = r.resource === 'cpu' ? 'CPU' : zh ? '内存' : 'Memory';
  const u = r.usage;
  const a = (v: number) => amount(r.resource, v);
  const lines = [
    zh
      ? `${name}：Requests ${requestText(r, zh)}，Limits ${limitText(r, zh)}（单 Pod）；单 Pod 使用 P50 ${a(u.p50)}、P90 ${a(u.p90)}、P95 ${a(u.p95)}、P99 ${a(u.p99)}、最大 ${a(u.max)}`
      : `${name}: Requests ${requestText(r, zh)}, Limits ${limitText(r, zh)} (one Pod); use of one Pod P50 ${a(u.p50)}, P90 ${a(u.p90)}, P95 ${a(u.p95)}, P99 ${a(u.p99)}, max ${a(u.max)}`
  ];
  if (r.total)
    lines.push(
      zh
        ? `  全副本总和使用 P50 ${a(r.total.p50)}、P90 ${a(r.total.p90)}、P95 ${a(r.total.p95)}、P99 ${a(r.total.p99)}、最大 ${a(r.total.max)}`
        : `  all replicas together: P50 ${a(r.total.p50)}, P90 ${a(r.total.p90)}, P95 ${a(r.total.p95)}, P99 ${a(r.total.p99)}, max ${a(r.total.max)}`
    );
  const sh = r.shares;
  if (sh)
    lines.push(
      zh
        ? `  使用量占 Requests：P90 ${formatPercent(sh.p90, 1)}、P95 ${formatPercent(sh.p95, 1)}、P99 ${formatPercent(sh.p99, 1)}`
        : `  use as a share of the Requests: P90 ${formatPercent(sh.p90, 1)}, P95 ${formatPercent(sh.p95, 1)}, P99 ${formatPercent(sh.p99, 1)}`
    );
  lines.push(
    zh
      ? `  数据覆盖 ${formatPercent(r.coverage, 0)}，采样 ${r.usage.points} 个`
      : `  data coverage ${formatPercent(r.coverage, 0)}, ${r.usage.points} samples`
  );
  if (r.resource === 'cpu' && r.throttle > 0)
    lines.push(`  ${zh ? '被限流的时间占比' : 'share of time throttled'}: ${formatPercent(r.throttle, 1)}`);
  if (r.resource === 'memory' && r.oom_kills > 0)
    lines.push(`  ${zh ? 'OOM 次数' : 'OOM kills'}: ${formatDecimal(r.oom_kills, 0)}`);
  return lines;
}

export function buildAnalysisQuestion(detail: Api.Overprovision.Detail, windowLabel: string, lang: AiLang): string {
  const zh = lang === 'zh-CN';
  const win = recommendationOf(detail);
  const view = replicaView(detail);
  const who = `${detail.name} (${detail.namespace}/${detail.workload}, ${detail.replicas || '?'})`;
  const bands = detail.params
    ? `P90 ${formatPercent(detail.params.p90.target, 0)}、P95 ${formatPercent(detail.params.p95.target, 0)}、P99 ${formatPercent(detail.params.p99.target, 0)}`
    : '';
  const head = zh
    ? [
        `独立分析模块 ${who} 最近 ${windowLabel} 的资源使用，给出你自己的推荐配置和推荐副本数（括号里最后一项是当前副本数；周期是平台的推荐分析周期，不随图表窗口变）。数据全部来自 Prometheus 实测。`,
        '要求：',
        '1. 只输出 HTML，不要 Markdown、代码围栏、前后说明。这是只读分析，不执行任何改动。',
        '2. 独立判断：根据“实测数据”（使用量分位数、峰值、OOM、限流、JVM、副本变化）自己得出结论并写出算式。“平台推荐”只用来对照，不得照抄或原样转写；你的数值可以和它不同，但要说明原因。',
        `3. 两种方案都给：①Pod 配置不变，需要几个副本（全副本使用量总和 ÷ 每个 Pod 的 Requests ÷ 目标比例）；②副本数不变，每个 Pod 的 Requests 和 Limits 应是多少。优先推荐调整副本数，副本数调不动时才改 Pod 配置并说明为什么。${bands ? `目标比例（使用量占 Requests）可参考 ${bands}，可依据数据另作判断。` : ''}`,
        '4. 安全边界，避免不合理缩容：推荐的副本数必须在模块管理里这个模块配置的约束内（见下面“副本数约束”：最少、最多、每次最多增减的个数），没有约束时自行把握，不得缩到只剩一个；有 OOM 或 CPU 被限流时不减副本也不降配置；缩容后单 Pod 的 P99 不能接近 Limits；偶发的最大值不作依据；内存比 CPU 更保守。',
        '5. 第一张表“当前配置与 AI 推荐配置对比”，五行，每个单元格只写一个数：“副本数（方案①）”写你推荐几个副本（Pod 配置不变）；“CPU Requests（方案②）”“CPU Limits（方案②）”“Memory Requests（方案②）”“Memory Limits（方案②）”写副本数不变时每个 Pod 的推荐值。七列：资源项、当前值（单 Pod）、当前值（全副本总和）、推荐值（单 Pod）、推荐值（全副本总和）、调整（超配、欠配或合理，副本数写增加或减少，带数量和比例）、依据（引用数据里的数字，每行从不同角度写：分位数、趋势或波动、约束、风险）。副本数行的当前值写当前副本数。没有当前值写“Prometheus 无数据”。表要窄，单元格写短句。',
        '6. 第二张表“AI 与平台推荐的差异”：行与第一张表一一对应，“项”写和第一张表同样的名称（带方案）；“平台推荐”写平台同一方案同一项的数（见最后一节），“AI 推荐”写第一张表同一行的推荐值，各只写一个数；不要写“主方案”“备选”，不要拿不同方案的数相比。一致写“一致”；不一致写明差异和原因。',
        '7. 其后用表格写“使用情况”和“判定”（状态、风险）；限流、OOM、JVM 只写有数据的项。状态单元格加 class：lv-bad（有风险或欠配）、lv-warn（超配或需要关注）、lv-ok（正常）、lv-info（仅信息），例如 <td class="lv-warn">超配</td>。',
        '8. 直接写当前情况和数值，不写“下一步先核对”之类的引导语，不写“可能、大概、视情况”之类含糊的话，不写数据以外的内容。',
        '9. 公式和推导要排版，不要写成一段文字：每个公式放进 <div class="fx">，一步一行（每行一个 <div>），系数用 <span class="fx-c">0.8</span>、结果用 <span class="fx-r">3.76 cores</span> 标出，运算符两边留空格。推荐值是计算结果除以系数（÷ 0.8），不是乘。系数用下面“模块的计算系数”里的值，不要自己编。'
      ].join('\n')
    : [
        `Analyse the resource use of the module ${who} over the last ${windowLabel} on your own and give your own recommended configuration and replicas (the last item in the brackets is the replicas now; the period is the recommendation period of the platform, not the chart window). All data is measured by Prometheus.`,
        'Rules:',
        '1. HTML only: no Markdown, code fence or text around it. Read-only: change nothing.',
        '2. Judge on your own from the measured data (quantiles, peaks, OOM, throttling, JVM, replica changes) and show the arithmetic. The platform recommendation is only to compare with: do not copy it; differ from it where the data says so, and say why.',
        `3. Give two ways: 1) the Pod stays, how many replicas (use of all replicas / Requests of a Pod / target share); 2) the replicas stay, the Requests and Limits of one Pod. Replicas first; change the Pod only when the replicas cannot move, and say why.${bands ? ` The target share of the use of the Requests may be taken from ${bands} and changed on the data.` : ''}`,
        '4. No unreasonable scale-in: keep within the replica constraints below (the least, the most, the most per action; with none never go down to one); with OOM or throttling remove no replica and lower nothing; after a scale-in the P99 of a Pod must stay clear of its Limits; a peak that came once is no basis; be more careful with memory than CPU.',
        '5. Table 1 "Current configuration vs AI recommended configuration", five rows, one figure to a cell: "Replicas (way 1)" = the replicas you recommend; "CPU Requests (way 2)", "CPU Limits (way 2)", "Memory Requests (way 2)", "Memory Limits (way 2)" = one Pod with the replicas kept. Seven columns: item, now (one Pod), now (all replicas), recommended (one Pod), recommended (all replicas), adjustment (over, under or reasonable; for replicas add or remove; amount and share), basis (quote the data; each row from another side). The Replicas row has the replicas now. No current figure: "no data in Prometheus". Short phrases.',
        '6. Table 2 "AI vs platform recommendation": the rows of table 1, named alike; columns item, platform, AI, difference, reason; platform = the platform figure of the same way and item (last section), AI = the figure of the same row of table 1; never "main" or "alternative", never compare different ways. Agree: "same"; differ: the difference and the reason.',
        '7. Then tables "Use" and "Verdict" (status, risk); throttling, OOM and JVM only with data. Status cells get a class lv-bad, lv-warn, lv-ok or lv-info, for example <td class="lv-warn">over-provisioned</td>.',
        '8. State facts and figures directly; no lead-ins, no vague words, nothing beyond the data.',
        '9. Typeset formulas: each in a <div class="fx">, one step to a <div>, a coefficient as <span class="fx-c">0.8</span>, a result as <span class="fx-r">3.76 cores</span>, spaces round the operators. A recommendation is the result divided by the coefficient (/ 0.8), never multiplied. Use only the coefficients under "coefficients of the module".'
      ].join('\n');
  const lines: string[] = [
    head,
    zh ? '实测数据：' : 'Measured data:',
    replicaFacts(view, zh),
    zh
      ? `模块管理里这个模块的副本数约束：${limitWords(view, zh)}`
      : `replica constraints of this module (module management): ${limitWords(view, zh)}`,
    coefficientWords(detail, zh)
  ];
  for (const r of [win?.cpu, win?.memory]) if (r) lines.push(...resourceLines(r, zh));
  const extra: string[] = [];
  const metrics = detail.metrics ?? [];
  if (metrics.length) {
    extra.push(zh ? '其他已配置的指标：' : 'Other metrics set up:');
    for (const m of metrics) {
      const fmt = (v: number) => (m.unit === 'bytes' ? formatBytes(v, 2) : formatDecimal(v, 3));
      extra.push(
        m.points
          ? `  ${m.name} (${m.group}): ${zh ? '最新' : 'latest'} ${fmt(m.latest)}, P90 ${fmt(m.p90)}, P95 ${fmt(m.p95)}, P99 ${fmt(m.p99)}, ${zh ? '最大' : 'max'} ${fmt(m.max)}`
          : `  ${m.name}: ${zh ? '已配置但窗口内没有数据' : 'set up but no data in the window'}`
      );
    }
  }
  if (detail.jvm?.hints.length) extra.push(`${zh ? 'JVM 提示' : 'JVM hints'}: ${detail.jvm.hints.join(', ')}`);
  // the platform's own figures go last and short: they are what the answer is compared with, and if the message is cut it is the comparison that is cut, not the data
  const platformHeader = zh
    ? '平台推荐（仅供对照，不要照抄）：'
    : 'Platform recommendation (to compare with, do not copy):';
  lines.push(platformHeader);
  lines.push(
    zh
      ? `  方案①（Pod 配置不变）副本数：当前 ${view?.current || '-'}；平台推荐 ${view?.recommended || '-'}（${replicaWords(view, zh).text}）`
      : `  Way 1 (the Pod stays) Replicas: now ${view?.current || '-'}; platform ${view?.recommended || '-'} (${replicaWords(view, zh).text})`
  );
  for (const row of recommendedFigures(detail, zh))
    lines.push(
      zh
        ? `  方案②（副本数不变）${row.label}：当前 单 Pod ${row.nowPod}；平台推荐 单 Pod ${row.pod}，全副本 ${row.total}；${row.adjust}`
        : `  Way 2 (the replicas stay) ${row.label}: now one Pod ${row.nowPod}; platform one Pod ${row.pod}, all replicas ${row.total}; ${row.adjust}`
    );
  const withExtra = [
    ...lines.slice(0, lines.indexOf(platformHeader)),
    ...extra,
    ...lines.slice(lines.indexOf(platformHeader))
  ];
  const full = withExtra.join('\n');
  // too long: the other metrics go first (they are the least of it), the rules and the platform figures stay whole
  return (full.length <= MAX_CHARS ? full : lines.join('\n')).slice(0, MAX_CHARS);
}

/** the rows the answer has to compare, current against recommended */
const COMPARISON_ROWS = ['cpu requests', 'cpu limits', 'memory requests', 'memory limits'];

/** whether an answer holds the comparison of the configurations (CPU and memory, Requests and Limits, and the replicas); one that does not is told so and asked again */
export function hasComparisonTable(answer: string): boolean {
  const text = answer.replace(/&nbsp;/g, ' ').toLowerCase();
  return COMPARISON_ROWS.every(row => new RegExp(row.replace(' ', '\\s*')).test(text)) && /replicas|副本/.test(text);
}

/** one cell of a table written into the mail */
export interface MailCell {
  text: string;
  level?: Level | '';
}
/** a table written into the mail by the platform from its own figures, so the mail has the tables whatever the answer of the model holds */
export interface MailTable {
  caption: string;
  columns: string[];
  rows: MailCell[][];
}

/**
 * The tables of the mail: the two ways with one row for each of their items (the replicas, the CPU and the memory Requests of one Pod, now and recommended), and the current
 * and the recommended configuration of the platform. The colours are the ones of the page.
 */
export function mailTables(detail: Api.Overprovision.Detail, zh = true): MailTable[] {
  const tables: MailTable[] = [];
  const view = replicaView(detail);
  const rep = replicaWords(view, zh);
  const groups = schemeGroups(detail);
  const figures = recommendedFigures(detail, zh);
  const itemName = (item: string) =>
    item === 'replicas' ? (zh ? '副本数' : 'Replicas') : item === 'cpu' ? 'CPU Requests' : 'Memory Requests';
  if (groups.length) {
    const rows: MailCell[][] = [];
    for (const group of groups) {
      const way =
        group.key === 'replicas'
          ? zh
            ? '① 调整副本数（Pod 配置不变）'
            : '1. Change the replicas (the Pod stays)'
          : zh
            ? '② 调整单 Pod 配置（副本数不变）'
            : '2. Change the Pod (the replicas stay)';
      const first = group.first ? (zh ? '（优先）' : ' (first)') : '';
      for (const item of group.items) {
        let adjust = '';
        let level: Level = item.level;
        if (item.item === 'replicas' && group.key === 'replicas') [adjust, level] = [rep.text, rep.level];
        else if (item.item === 'replicas') [adjust, level] = [zh ? '副本数不变' : 'replicas stay', 'ok'];
        else if (group.key === 'replicas') [adjust, level] = [zh ? 'Pod 配置不变' : 'Pod configuration stays', 'ok'];
        else adjust = figures.find(f => f.label === itemName(item.item))?.adjust ?? '-';
        rows.push([
          { text: way + first },
          { text: itemName(item.item) },
          { text: item.now },
          { text: item.rec, level: item.now === item.rec ? '' : level },
          { text: adjust, level }
        ]);
      }
    }
    tables.push({
      caption: zh ? '副本数与推荐方案（平台）' : 'Replicas and the two ways (platform)',
      columns: zh ? ['方案', '项目', '当前', '推荐', '调整'] : ['Way', 'Item', 'Now', 'Recommended', 'Adjustment'],
      rows
    });
  }
  if (figures.length)
    tables.push({
      caption: zh ? '当前配置与平台推荐配置' : 'Current and platform recommended configuration',
      columns: zh
        ? ['资源项', '当前值（单 Pod）', '当前值（全副本总和）', '推荐值（单 Pod）', '推荐值（全副本总和）', '调整']
        : [
            'Item',
            'Now (one Pod)',
            'Now (all replicas)',
            'Recommended (one Pod)',
            'Recommended (all replicas)',
            'Adjustment'
          ],
      rows: figures.map(f => [
        { text: f.label },
        { text: f.nowPod },
        { text: f.nowTotal },
        { text: f.pod },
        { text: f.total },
        { text: f.adjust, level: f.level }
      ])
    });
  return tables;
}
