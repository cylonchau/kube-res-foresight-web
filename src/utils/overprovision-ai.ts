import { formatBytes, formatCores, formatDecimal, formatPercent } from './format.ts';

/**
 * The question of the one-click AI analysis of a module: the figures of the analysis the page shows, written out, so the answer rests on them and
 * on nothing the model makes up. It asks for an analysis only; the assistant has no tool that changes anything.
 */
export type AiLang = 'zh-CN' | 'en-US';

const MAX_HISTORY = 6;
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
    ? `请分析模块 ${who} 在最近 ${windowLabel} 的资源使用情况（括号里最后一项是副本数），回答：1）请求是超配、欠配还是合理，依据是什么；2）CPU 和内存的请求建议改成多少、风险是什么；3）限流、OOM、JVM 等需要留意什么；4）下一步建议。只根据下面的数据回答，数字必须来自这些数据，不要自己算新的数字，数据里没有的写“不知道”。这是只读分析，不要执行任何改动。`
    : `Analyse the resource use of the module ${who} over the last ${windowLabel} (the last item in the brackets is the replicas) and answer: 1) is the request over-provisioned, under-provisioned or reasonable, and on what grounds; 2) what the CPU and memory requests should be changed to and what the risk is; 3) what to watch about throttling, OOM and the JVM; 4) the next step. Answer only from the data below, take every number from it, do not work out new ones, and say "unknown" for what it does not hold. This is a read-only analysis: change nothing.`;
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
  const history = (detail.history ?? []).filter(row => row.resource === 'cpu').slice(0, MAX_HISTORY);
  if (history.length) {
    lines.push(zh ? '最近几次分析的 CPU（新到旧）：' : 'CPU of the last analyses (newest first):');
    for (const row of history)
      lines.push(
        `  ${row.created_at}: P95 ${formatCores(row.p95, 3)}, ${zh ? '建议' : 'suggested'} ${row.suggested > 0 ? formatCores(row.suggested, 3) : '-'}, ${row.status}`
      );
  }
  return lines.join('\n').slice(0, MAX_CHARS);
}
