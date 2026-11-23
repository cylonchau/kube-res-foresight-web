import { allText, amountText, podsOf, totalText } from './amount.ts';
import { formatBytes, formatCores, formatDecimal, formatPercent } from './format.ts';
import { adjustmentOf, adjustmentText } from './overprovision-verdict.ts';

/**
 * The question of the AI analysis of a module: the figures of the analysis the page shows, written out, so the answer rests on them and
 * on nothing the model makes up. It asks for an analysis only; the assistant has no tool that changes anything.
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

/** one row of the comparison: the figure now and the one the platform worked out, for one Pod and for all the replicas, as the table of the page writes them */
export interface RecommendedFigure {
  label: string;
  /** the figure now of one Pod and of all the replicas; "-" when Prometheus gave none */
  nowPod: string;
  nowTotal: string;
  /** what the use supports, for one Pod and for all the replicas; "-" when no recommendation could be made */
  pod: string;
  total: string;
  /** how the figure now stands against the recommendation: over-provisioned, under-provisioned or reasonable, with the amount of one Pod and its share; "-" when it cannot be said */
  adjust: string;
}

/** the analysis the verdict and the recommendation are of: the one of the recommendation period, or (an older answer of the platform) the one of the window */
export const recommendationOf = (detail: Api.Overprovision.Detail) => detail.recommend ?? detail.windows[0];

/** the words of how a figure stands against the recommended one */
function adjustWords(
  resource: 'cpu' | 'memory',
  now: number,
  recommended: number,
  status: string | null,
  zh: boolean
): string {
  const a = adjustmentOf(now, recommended);
  if (!a) return '-';
  const delta = adjustmentText(resource, a);
  if (status === 'limited') return zh ? '受限（OOM 或限流），不下调' : 'limited (OOM or throttling), not lowered';
  if (a.direction === 'same') return zh ? '合理，无需调整' : 'reasonable, no change';
  if (status === null)
    // a Limits has no verdict of its own: it is told how far it is from the recommended one
    return a.direction === 'over'
      ? zh
        ? `可降低 ${delta}`
        : `could be lowered by ${delta}`
      : zh
        ? `需提高 ${delta}`
        : `needs raising by ${delta}`;
  if (status === 'ok')
    return a.direction === 'over'
      ? zh
        ? `合理，可优化 ${delta}`
        : `reasonable, could give back ${delta}`
      : zh
        ? `合理，推荐高出当前 ${delta}`
        : `reasonable, recommended is above now by ${delta}`;
  return a.direction === 'over'
    ? zh
      ? `超配 ${delta}`
      : `over-provisioned by ${delta}`
    : zh
      ? `欠配 ${delta}`
      : `under-provisioned by ${delta}`;
}

/** the four rows of the comparison, as the table of the page has them: the recommendation is the platform's (rounded up to a figure a spec can say), and its total is that figure times the replicas. */
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
      rows.push({
        label,
        nowPod: amountText(resource, now),
        nowTotal: allText(resource, now, nowTotal, replicas),
        pod: amountText(resource, recommended),
        // the total of the recommendation is of the Pods the total now is of, as the table of the page has it
        total: totalText(resource, recommended, podsOf(now, nowTotal, replicas)),
        adjust: adjustWords(resource, now, recommended, status, zh)
      });
    }
  }
  return rows;
}

/** the labels of the rows whose recommended figures are not in the answer: the answer has to write the figures of the platform as they are */
export function missingRecommendations(answer: string, detail: Api.Overprovision.Detail): string[] {
  const text = answer.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return recommendedFigures(detail)
    .filter(row => (row.pod !== '-' && !text.includes(row.pod)) || (row.total !== '-' && !text.includes(row.total)))
    .map(row => row.label);
}

function resourceLines(r: Api.Overprovision.Result, zh: boolean) {
  const name = r.resource === 'cpu' ? 'CPU' : zh ? '内存' : 'Memory';
  const u = r.usage;
  const a = (v: number) => amount(r.resource, v);
  const lines = [
    zh
      ? `${name}：Requests ${requestText(r, zh)}，Limits ${limitText(r, zh)}；单 Pod 使用 P50 ${a(u.p50)}、P90 ${a(u.p90)}、P95 ${a(u.p95)}、P99 ${a(u.p99)}、最大 ${a(u.max)}`
      : `${name}: Requests ${requestText(r, zh)}, Limits ${limitText(r, zh)}; use of one Pod P50 ${a(u.p50)}, P90 ${a(u.p90)}, P95 ${a(u.p95)}, P99 ${a(u.p99)}, max ${a(u.max)}`
  ];
  if (r.total)
    lines.push(
      zh
        ? `  全副本总和使用 P90 ${a(r.total.p90)}、P95 ${a(r.total.p95)}、P99 ${a(r.total.p99)}`
        : `  all replicas together: P90 ${a(r.total.p90)}, P95 ${a(r.total.p95)}, P99 ${a(r.total.p99)}`
    );
  const sh = r.shares;
  if (sh)
    lines.push(
      zh
        ? `  使用量占 Requests 的比例：P90 ${formatPercent(sh.p90, 1)}、P95 ${formatPercent(sh.p95, 1)}、P99 ${formatPercent(sh.p99, 1)}`
        : `  use as a share of the Requests: P90 ${formatPercent(sh.p90, 1)}, P95 ${formatPercent(sh.p95, 1)}, P99 ${formatPercent(sh.p99, 1)}`
    );
  const ratio = r.suggested > 0 && r.request > 0 ? formatPercent(r.ratio, 1) : '-';
  lines.push(
    zh
      ? `  平台的判定：${r.status}（${r.grade || '-'}），超配比例（负数是欠配）${ratio}，可信度 ${r.confidence}，风险 ${r.risk}，数据覆盖 ${formatPercent(r.coverage, 0)}；推荐值见上面“平台推荐值”`
      : `  verdict of the platform: ${r.status} (${r.grade || '-'}), over-provision (negative is under) ${ratio}, confidence ${r.confidence}, risk ${r.risk}, data coverage ${formatPercent(r.coverage, 0)}; the recommended figures are in "platform recommendation" above`
  );
  if (r.formula) lines.push(`  ${zh ? '算法' : 'formula'}: ${r.formula}`);
  if (r.reasons.length) lines.push(`  ${zh ? '依据代码' : 'reason codes'}: ${r.reasons.join(', ')}`);
  if (r.resource === 'cpu' && r.throttle > 0)
    lines.push(`  ${zh ? '被限流的时间占比' : 'share of time throttled'}: ${formatPercent(r.throttle, 1)}`);
  if (r.resource === 'memory' && r.oom_kills > 0)
    lines.push(`  ${zh ? 'OOM 次数' : 'OOM kills'}: ${formatDecimal(r.oom_kills, 0)}`);
  return lines;
}

export function buildAnalysisQuestion(detail: Api.Overprovision.Detail, windowLabel: string, lang: AiLang): string {
  const zh = lang === 'zh-CN';
  const win = recommendationOf(detail);
  const who = `${detail.name} (${detail.namespace}/${detail.workload}, ${detail.replicas || '?'})`;
  const head = zh
    ? [
        `分析模块 ${who} 在最近 ${windowLabel} 的资源使用情况（括号里最后一项是副本数；这是平台的推荐分析周期，不随图表窗口变化）。数据全部来自 Prometheus 的实测，Requests 和 Limits 也是 Prometheus 查到的当前配置。`,
        '输出要求：',
        '1. 只输出 HTML，不要 Markdown、不要代码围栏、不要前后说明。',
        '2. 第一张表必须是“当前配置与 AI 推荐配置对比”，固定四行：CPU Requests、CPU Limits、Memory Requests、Memory Limits；七列：资源项、当前值（单 Pod）、当前值（全副本总和）、推荐值（单 Pod）、推荐值（全副本总和）、调整（超配、欠配或合理，带具体数量和比例）、依据（一句话，引用数据里的数字，例如 P95 使用量占 Requests 的比例）。当前值、推荐值和调整都逐字抄“平台推荐值”一节的“当前”“推荐”“调整”，不得自己重新计算、换算或改动；没有当前值写“Prometheus 无数据”，那里写“-”的推荐列写“无推荐”。Requests 是调度时预留（Reserved）的量，Limits 是上限。不能只写“合理”：有数量和比例就写出来。',
        '3. 其后用表格写“使用情况”（P50/P90/P95/P99/最大、利用率）和“判定”（状态、风险）；限流、OOM、JVM 只写有数据的项。',
        '4. 推荐值是平台按分位数算好的（P90、P95、P99 各自要求的 Requests 取最大者；Limits 为 P99 加余量且不低于推荐的 Requests；有 OOM 或限流时只升不降；偶发的最大值不参与）：你只写依据，不改数值。',
        '5. 状态和风险的单元格加 class：lv-bad（有风险或欠配）、lv-warn（超配或需要关注）、lv-ok（正常）、lv-info（仅信息），例如 <td class="lv-warn">超配</td>。',
        '6. 直接写当前情况和优化后的数值；不写“下一步先核对”之类的引导语，不写“可能、大概、视情况”之类含糊的话，不写额外推荐，不写数据以外的内容。这是只读分析，不要执行任何改动。'
      ].join('\n')
    : [
        `Analyse the resource use of the module ${who} over the last ${windowLabel} (the last item in the brackets is the replicas; this is the recommendation period of the platform, it does not follow the window of the charts). All the data is measured by Prometheus, and so are the current Requests and Limits.`,
        'Output rules:',
        '1. Output HTML only: no Markdown, no code fence, no text before or after.',
        '2. The first table must be "Current configuration vs AI recommended configuration" with exactly four rows: CPU Requests, CPU Limits, Memory Requests, Memory Limits; and seven columns: item, now (one Pod), now (all replicas), recommended (one Pod), recommended (all replicas), adjustment (over-provisioned, under-provisioned or reasonable, with the amount and the share), basis (one sentence quoting a number of the data, for example the P95 use as a share of the Requests). Copy the now, recommended and adjustment figures from the "platform recommendation" section word for word: never recalculate, convert or change them; write "no data in Prometheus" where there is no current figure and "no recommendation" where it says "-". Requests is what is reserved for the Pod when it is scheduled, Limits is the cap. Never write only "reasonable": give the amount and the share when there is one.',
        '3. Then tables for "Use" (P50/P90/P95/P99/max, utilization) and "Verdict" (status, risk); throttling, OOM and JVM only where there is data.',
        '4. The platform has worked the recommendation out from the percentiles (the largest of what P90, P95 and P99 each ask of the Requests; Limits is the P99 plus a margin and never below the recommended Requests; with OOM or throttling it is only raised; a peak that came once takes no part): you write the basis only and change no number.',
        '5. Give the status and risk cells a class: lv-bad (at risk or under-provisioned), lv-warn (over-provisioned or to watch), lv-ok (fine), lv-info (information only), for example <td class="lv-warn">over-provisioned</td>.',
        '6. State the actual situation and the optimised values directly; no lead-ins such as "first check", no vague words (maybe, probably, depends), no extra recommendations, nothing beyond the data. This is a read-only analysis: change nothing.'
      ].join('\n');
  const lines: string[] = [
    head,
    zh ? '平台推荐值（表里要原样使用）：' : 'Platform recommendation (use as it is in the table):'
  ];
  for (const row of recommendedFigures(detail, zh))
    lines.push(
      zh
        ? `  ${row.label}：当前 单 Pod ${row.nowPod}，全副本总和 ${row.nowTotal}；推荐 单 Pod ${row.pod}，全副本总和 ${row.total}；调整 ${row.adjust}`
        : `  ${row.label}: now one Pod ${row.nowPod}, all replicas ${row.nowTotal}; recommended one Pod ${row.pod}, all replicas ${row.total}; adjustment ${row.adjust}`
    );
  lines.push(zh ? '数据：' : 'Data:');
  for (const r of [win?.cpu, win?.memory]) if (r) lines.push(...resourceLines(r, zh));
  const metrics = detail.metrics ?? [];
  if (metrics.length) {
    lines.push(zh ? '其他已配置的指标：' : 'Other metrics set up:');
    for (const m of metrics) {
      const fmt = (v: number) => (m.unit === 'bytes' ? formatBytes(v, 2) : formatDecimal(v, 3));
      lines.push(
        m.points
          ? `  ${m.name} (${m.group}): ${zh ? '最新' : 'latest'} ${fmt(m.latest)}, P90 ${fmt(m.p90)}, P95 ${fmt(m.p95)}, P99 ${fmt(m.p99)}, ${zh ? '最大' : 'max'} ${fmt(m.max)}`
          : `  ${m.name}: ${zh ? '已配置但窗口内没有数据' : 'set up but no data in the window'}`
      );
    }
  }
  if (detail.jvm?.hints.length) lines.push(`${zh ? 'JVM 提示' : 'JVM hints'}: ${detail.jvm.hints.join(', ')}`);
  return lines.join('\n').slice(0, MAX_CHARS);
}

/** the four rows the answer has to compare, current against recommended */
const COMPARISON_ROWS = ['cpu requests', 'cpu limits', 'memory requests', 'memory limits'];

/** whether an answer holds the comparison of the four configurations (CPU and memory, Requests and Limits); one that does not is told so and asked again */
export function hasComparisonTable(answer: string): boolean {
  const text = answer.replace(/&nbsp;/g, ' ').toLowerCase();
  return COMPARISON_ROWS.every(row => new RegExp(row.replace(' ', '\\s*')).test(text));
}
