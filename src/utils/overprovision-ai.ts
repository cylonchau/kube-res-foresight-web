import { formatBytes, formatCores, formatDecimal, formatPercent } from './format.ts';

/**
 * The question of the AI analysis of a module: the figures of the analysis the page shows, written out, so the answer rests on them and
 * on nothing the model makes up. It asks for an analysis only; the assistant has no tool that changes anything.
 */
export type AiLang = 'zh-CN' | 'en-US';

/** the assistant refuses a message longer than 4000 characters */
const MAX_CHARS = 3900;

const amount = (resource: string, value: number) =>
  resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 3);

function limitText(r: Api.Overprovision.Result, zh: boolean) {
  if (!(r.limit > 0)) return zh ? '未知' : 'unknown';
  const note =
    r.limit_from === 'module'
      ? zh
        ? '（模块配置的上限系数算出，不是实测）'
        : ' (from the limit ratio of the module, not measured)'
      : '';
  return `${amount(r.resource, r.limit)}${note}`;
}

function resourceLines(r: Api.Overprovision.Result, zh: boolean) {
  const name = r.resource === 'cpu' ? 'CPU' : zh ? '内存' : 'Memory';
  const u = r.usage;
  const a = (v: number) => amount(r.resource, v);
  const lines = [
    zh
      ? `${name}：请求 ${a(r.request)}，上限 ${limitText(r, zh)}；单 Pod 使用 P50 ${a(u.p50)}、P90 ${a(u.p90)}、P95 ${a(u.p95)}、P99 ${a(u.p99)}、最大 ${a(u.max)}`
      : `${name}: request ${a(r.request)}, limit ${limitText(r, zh)}; use of one Pod P50 ${a(u.p50)}, P90 ${a(u.p90)}, P95 ${a(u.p95)}, P99 ${a(u.p99)}, max ${a(u.max)}`
  ];
  if (r.total)
    lines.push(
      zh
        ? `  全副本总和使用 P90 ${a(r.total.p90)}、P95 ${a(r.total.p95)}、P99 ${a(r.total.p99)}`
        : `  all replicas together: P90 ${a(r.total.p90)}, P95 ${a(r.total.p95)}, P99 ${a(r.total.p99)}`
    );
  const suggested = r.suggested > 0 ? a(r.suggested) : zh ? '不给' : 'none';
  const ratio = r.suggested > 0 ? formatPercent(r.ratio, 1) : '-';
  lines.push(
    zh
      ? `  平台的判定：${r.status}（${r.grade || '-'}），建议值 ${suggested}，超配比例 ${ratio}，可信度 ${r.confidence}，风险 ${r.risk}，数据覆盖 ${formatPercent(r.coverage, 0)}`
      : `  verdict of the platform: ${r.status} (${r.grade || '-'}), suggested ${suggested}, over-provision ${ratio}, confidence ${r.confidence}, risk ${r.risk}, data coverage ${formatPercent(r.coverage, 0)}`
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
  const win = detail.windows[0];
  const who = `${detail.name} (${detail.namespace}/${detail.workload}, ${detail.replicas || '?'})`;
  const head = zh
    ? [
        `分析模块 ${who} 在最近 ${windowLabel} 的资源使用情况（括号里最后一项是副本数）。数据全部来自 Prometheus 的实测。`,
        '输出要求：',
        '1. 只输出 HTML，不要 Markdown、不要代码围栏、不要前后说明。',
        '2. 用表格展示：表一“配置与使用”（CPU、内存的请求、上限、P50/P90/P95/P99/最大、利用率）；表二“判定与优化”（每个资源一行：当前状态、建议值、可释放量、风险）；表三“限流、OOM、JVM”（只写有数据的项）。',
        '3. 状态和风险的单元格加 class：lv-bad（有风险或欠配）、lv-warn（超配或需要关注）、lv-ok（正常）、lv-info（仅信息），例如 <td class="lv-warn">超配</td>。',
        '4. 直接写当前的实际情况和优化后的数值；不写“下一步先核对”之类的引导语，不写“可能、大概、视情况”之类含糊的话，不写额外推荐，不写数据以外的内容。',
        '5. 数字必须来自下面的数据，不要自己算新的数字；数据里没有的写“无数据”。这是只读分析，不要执行任何改动。'
      ].join('\n')
    : [
        `Analyse the resource use of the module ${who} over the last ${windowLabel} (the last item in the brackets is the replicas). All the data is measured by Prometheus.`,
        'Output rules:',
        '1. Output HTML only: no Markdown, no code fence, no text before or after.',
        '2. Use tables: table 1 "Configuration and use" (requests, limits, P50/P90/P95/P99/max and utilization of CPU and memory); table 2 "Verdict and optimisation" (one row per resource: status, suggested value, what can be released, risk); table 3 "Throttling, OOM, JVM" (only what has data).',
        '3. Give the status and risk cells a class: lv-bad (at risk or under-provisioned), lv-warn (over-provisioned or to watch), lv-ok (fine), lv-info (information only), for example <td class="lv-warn">over-provisioned</td>.',
        '4. State the actual situation and the optimised values directly; no lead-ins such as "first check", no vague words (maybe, probably, depends), no extra recommendations, nothing beyond the data.',
        '5. Take every number from the data below and work out no new ones; write "no data" for what is missing. This is a read-only analysis: change nothing.'
      ].join('\n');
  const lines: string[] = [head, zh ? '数据：' : 'Data:'];
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
