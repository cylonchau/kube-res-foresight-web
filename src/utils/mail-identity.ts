import { amountText } from './amount.ts';
import { formatPercent } from './format.ts';
import type { MailCell, MailTable } from './overprovision-ai.ts';

/**
 * Which module a mail is about, and how it has been running: the cluster, the namespace, the workload, the module and its Pods by name, then the last period of the module (the
 * replicas, the use of the CPU and the memory against the Requests, OOM kills, throttling, what the platform concluded). They go before the figures of the analysis, so a mail
 * of one module is never taken for another's.
 */

const MAX_PODS = 40;

/** the cluster the operator reports for the workload, else the data source the figures were read from (said as such) */
export function clusterOf(detail: Api.Overprovision.Detail, zh: boolean): string {
  const reported = detail.identity?.cluster;
  if (reported) return reported;
  const source = detail.datasource?.name;
  if (source)
    return zh
      ? `${source}（数据源，operator 没有上报集群名）`
      : `${source} (the data source; the operator reports no cluster name)`;
  return zh ? '未知' : 'unknown';
}

/** the subject part that names the module: cluster, namespace/module, and the period the figures are of */
export function mailTitle(
  detail: Api.Overprovision.Detail | null | undefined,
  moduleName: string,
  window: string
): string {
  const cluster = detail?.identity?.cluster || detail?.datasource?.name || '';
  const where = detail?.namespace ? `${detail.namespace}/${moduleName || detail.name}` : moduleName;
  return [cluster, where, window].filter(Boolean).join(' · ');
}

const kindOf = (detail: Api.Overprovision.Detail) => [detail.workload_kind, detail.workload].filter(Boolean).join('/');

/** the module and the workload it is: the rows that say which one this is */
export function identityTable(detail: Api.Overprovision.Detail, zh: boolean): MailTable {
  const id = detail.identity;
  const pods = id?.pods ?? [];
  const notReady = pods.filter(pod => !pod.ready).length;
  const podSummary = !id
    ? zh
      ? '没有 Pod 信息（operator 没有上报这个工作负载）'
      : 'no Pod information (the operator has not reported this workload)'
    : zh
      ? `${pods.length} 个，其中未就绪 ${notReady} 个${pods.length ? '（明细见下表）' : ''}`
      : `${pods.length}, ${notReady} not ready${pods.length ? ' (listed below)' : ''}`;
  const rows: MailCell[][] = [
    [{ text: zh ? '集群' : 'Cluster' }, { text: clusterOf(detail, zh) }],
    [{ text: zh ? '命名空间' : 'Namespace' }, { text: detail.namespace || '-' }],
    [{ text: zh ? '模块' : 'Module' }, { text: detail.name || '-' }],
    [{ text: zh ? '工作负载' : 'Workload' }, { text: kindOf(detail) || '-' }],
    [{ text: zh ? 'Pod' : 'Pods' }, { text: podSummary, level: id && notReady ? 'warn' : '' }],
    [{ text: zh ? '数据源' : 'Data source' }, { text: detail.datasource?.name || '-' }]
  ];
  return {
    caption: zh ? '模块与工作负载' : 'Module and workload',
    columns: zh ? ['项目', '内容'] : ['Item', 'Value'],
    rows
  };
}

/** the Pods of the workload by name (the operator's report), at most MAX_PODS of them */
export function podsTable(detail: Api.Overprovision.Detail, zh: boolean): MailTable | null {
  const pods = detail.identity?.pods ?? [];
  if (!pods.length) return null;
  const rows: MailCell[][] = pods
    .slice(0, MAX_PODS)
    .map(pod => [
      { text: pod.name },
      { text: pod.node || '-' },
      { text: pod.phase || '-' },
      { text: pod.ready ? (zh ? '就绪' : 'ready') : zh ? '未就绪' : 'not ready', level: pod.ready ? 'ok' : 'warn' },
      { text: String(pod.restarts ?? 0) }
    ]);
  const more = pods.length - rows.length;
  return {
    caption:
      (zh ? 'Pod（operator 上报）' : 'Pods (reported by the operator)') +
      (more > 0 ? (zh ? `，只列前 ${MAX_PODS} 个，另有 ${more} 个` : `, the first ${MAX_PODS}; ${more} more`) : ''),
    columns: zh ? ['Pod', '节点', '阶段', '状态', '重启'] : ['Pod', 'Node', 'Phase', 'State', 'Restarts'],
    rows
  };
}

const STATUS: Record<string, [string, string]> = {
  over: ['超配', 'over-provisioned'],
  under: ['欠配', 'under-provisioned'],
  ok: ['合理', 'reasonable'],
  limited: ['受限（OOM 或限流）', 'limited (OOM or throttling)'],
  unknown: ['数据不足', 'not enough data']
};

/** how the module has been running over the recommendation period: replicas, the use of one Pod against its Requests, OOM kills, throttling and the verdict */
export function runningTable(detail: Api.Overprovision.Detail, zh: boolean): MailTable {
  const rec = detail.recommend ?? detail.windows?.[0] ?? null;
  const rows: MailCell[][] = [];
  const add = (item: string, text: string, level: MailCell['level'] = '') =>
    rows.push([{ text: item }, { text, level }]);
  add(zh ? '分析周期' : 'Period', rec?.label ?? '-');
  const ready = detail.replicas_ready ?? 0;
  const replicaParts = [zh ? `现在 ${detail.replicas || '-'} 个` : `${detail.replicas || '-'} now`];
  if (ready > 0) replicaParts.push(zh ? `就绪 ${ready} 个` : `${ready} ready`);
  if (detail.replicas_abnormal)
    replicaParts.push(zh ? `异常 ${detail.replicas_abnormal} 个` : `${detail.replicas_abnormal} abnormal`);
  if (detail.replicas_updating) replicaParts.push(zh ? '正在发布' : 'a rollout is under way');
  if (detail.replicas_max)
    replicaParts.push(
      zh
        ? `周期内最少 ${detail.replicas_min}、最多 ${detail.replicas_max}`
        : `${detail.replicas_min} to ${detail.replicas_max} in the period`
    );
  add(zh ? '副本数' : 'Replicas', replicaParts.join(zh ? '，' : ', '), detail.replicas_abnormal ? 'warn' : '');
  for (const resource of ['cpu', 'memory'] as const) {
    const r = rec?.[resource];
    const name = resource === 'cpu' ? 'CPU' : zh ? '内存' : 'Memory';
    if (!r || !r.usage?.points) {
      add(zh ? `${name} 使用（单 Pod）` : `${name} use (one Pod)`, zh ? '没有使用量数据' : 'no use data', 'info');
      continue;
    }
    const u = r.usage;
    const f = (v: number) => amountText(resource, v);
    const part = zh
      ? `P50 ${f(u.p50)}、P95 ${f(u.p95)}、P99 ${f(u.p99)}、最高 ${f(u.max)}；Requests ${r.request > 0 ? f(r.request) : '-'}${r.shares?.p95 ? `，P95 占 ${formatPercent(r.shares.p95, 1)}` : ''}`
      : `P50 ${f(u.p50)}, P95 ${f(u.p95)}, P99 ${f(u.p99)}, max ${f(u.max)}; Requests ${r.request > 0 ? f(r.request) : '-'}${r.shares?.p95 ? `, P95 is ${formatPercent(r.shares.p95, 1)} of it` : ''}`;
    add(zh ? `${name} 使用（单 Pod）` : `${name} use (one Pod)`, part);
    const verdict = STATUS[r.status]?.[zh ? 0 : 1] ?? r.status;
    add(
      zh ? `${name} 判断` : `${name} verdict`,
      verdict,
      r.status === 'ok' ? 'ok' : r.status === 'limited' || r.status === 'unknown' ? 'info' : 'warn'
    );
  }
  const oom = detail.oom?.kills ?? rec?.memory?.oom_kills ?? 0;
  add(
    zh ? 'OOM' : 'OOM',
    zh
      ? `${oom} 次被杀${detail.oom?.lookback_days ? `（追溯 ${detail.oom.lookback_days} 天）` : ''}`
      : `${oom} kills${detail.oom?.lookback_days ? ` (looking back ${detail.oom.lookback_days} days)` : ''}`,
    oom > 0 ? 'warn' : 'ok'
  );
  const throttle = rec?.cpu?.throttle ?? -1;
  if (throttle >= 0)
    add(
      zh ? 'CPU 限流' : 'CPU throttling',
      zh ? `${formatPercent(throttle, 1)} 的时间被限流` : `throttled ${formatPercent(throttle, 1)} of the time`,
      throttle > 0.05 ? 'warn' : 'ok'
    );
  return {
    caption: zh ? '模块近期运行情况' : 'How the module has been running',
    columns: zh ? ['项目', '内容'] : ['Item', 'Value'],
    rows
  };
}

/** the tables that say which module a mail is about, first in the mail */
export function identityTables(detail: Api.Overprovision.Detail, zh: boolean): MailTable[] {
  const tables = [identityTable(detail, zh)];
  const pods = podsTable(detail, zh);
  if (pods) tables.push(pods);
  tables.push(runningTable(detail, zh));
  return tables;
}
