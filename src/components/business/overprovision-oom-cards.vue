<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import HelpLabel from '@/components/common/help-label.vue';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatDecimal, formatPercent } from '@/utils/format';

defineOptions({ name: 'OverprovisionOomCards' });

/**
 * What the module says about running out of memory, as cards at the top of the dashboard: how many times a container was killed for it in the window, the
 * working set it was killed at, how close the memory is to its limit, when the analysis last saw a kill, and the OOM metrics the module has set up. A
 * card turns red when there is something to look at.
 */
interface MetricItem {
  key: string;
  name: string;
  group: string;
  unit: string;
  points: number;
  latest: number;
  max: number;
}
interface Props {
  detail: Api.Overprovision.Detail;
  /** the other metrics of the module with their figures (the ones of the group oom are drawn) */
  metrics: MetricItem[];
}
const props = defineProps<Props>();
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

interface Card {
  key: string;
  label: string;
  help?: string;
  value: string;
  sub?: string;
  tone?: 'bad' | 'warn' | 'good';
}

const memory = computed(() => props.detail.windows[0]?.memory ?? null);
const memoryHistory = computed(() =>
  props.detail.history
    .filter(row => row.resource === 'memory')
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
);

const cards = computed<Card[]>(() => {
  const m = memory.value;
  const out: Card[] = [];
  if (m) {
    const kills = m.oom_kills;
    out.push({
      key: 'kills',
      label: p('oomKills'),
      help: p('oomKillsHelp'),
      value: formatDecimal(kills, 0),
      sub: kills > 0 ? p('oomKillsSub') : p('oomNone'),
      tone: kills > 0 ? 'bad' : 'good'
    });
    out.push({
      key: 'workingSet',
      label: p('oomWorkingSet'),
      help: p('oomWorkingSetHelp'),
      value: m.oom_working_set > 0 ? formatBytes(m.oom_working_set, 2) : '-',
      sub:
        m.limit > 0 && m.oom_working_set > 0
          ? `${formatPercent(m.oom_working_set / m.limit, 0)} ${p('oomOfLimit')}`
          : undefined,
      tone: m.oom_working_set > 0 ? 'warn' : undefined
    });
    const ratio = m.limit > 0 ? m.usage.p99 / m.limit : null;
    out.push({
      key: 'nearLimit',
      label: p('oomNearLimit'),
      help: p('oomNearLimitHelp'),
      value: ratio === null ? p('limitUnknown') : formatPercent(ratio, 0),
      sub: m.limit > 0 ? `P99 ${formatBytes(m.usage.p99, 2)} / ${formatBytes(m.limit, 2)}` : undefined,
      tone: ratio !== null && ratio >= 0.9 ? 'bad' : ratio !== null && ratio >= 0.8 ? 'warn' : undefined
    });
    out.push({
      key: 'headroom',
      label: p('oomHeadroom'),
      help: p('oomHeadroomHelp'),
      value: m.limit > 0 ? formatBytes(Math.max(m.limit - m.usage.max, 0), 2) : '-',
      sub: m.limit > 0 && m.usage.max > m.limit ? p('oomOverLimit') : undefined,
      tone: m.limit > 0 && m.usage.max >= m.limit ? 'bad' : undefined
    });
  }
  const seen = memoryHistory.value.find(row => row.oom_kills > 0);
  out.push({
    key: 'last',
    label: p('oomLastSeen'),
    help: p('oomLastSeenHelp'),
    value: seen ? formatDateTime(seen.created_at) : '-',
    sub: memoryHistory.value.length
      ? p('oomResultsCount', {
          n: memoryHistory.value.filter(row => row.oom_kills > 0).length,
          all: memoryHistory.value.length
        })
      : undefined,
    tone: seen ? 'warn' : undefined
  });
  for (const metric of props.metrics.filter(item => item.group === 'oom')) {
    const bytes = metric.unit.toLowerCase() === 'bytes';
    out.push({
      key: `m-${metric.key}`,
      label: metric.name,
      value: metric.points ? (bytes ? formatBytes(metric.latest, 2) : formatDecimal(metric.latest, 0)) : '-',
      sub: metric.points
        ? `max ${bytes ? formatBytes(metric.max, 2) : formatDecimal(metric.max, 0)}`
        : p('metricEmpty'),
      tone: !bytes && metric.points && metric.max > 0 ? 'bad' : undefined
    });
  }
  return out;
});
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-8px">
    <div v-for="card in cards" :key="card.key" class="oom-card" :class="card.tone ? `is-${card.tone}` : ''">
      <div class="oom-label">
        <HelpLabel v-if="card.help" :label="card.label" :help="card.help" />
        <span v-else>{{ card.label }}</span>
      </div>
      <div class="oom-value">{{ card.value }}</div>
      <div v-if="card.sub" class="oom-sub">{{ card.sub }}</div>
    </div>
  </div>
</template>

<style scoped>
.oom-card {
  min-width: 0;
  padding: 8px 12px;
  border-left: 3px solid rgba(128, 128, 128, 0.35);
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.07);
}
.oom-card.is-bad {
  border-left-color: #d03050;
  background: rgba(208, 48, 80, 0.1);
}
.oom-card.is-warn {
  border-left-color: #f0a020;
  background: rgba(240, 160, 32, 0.12);
}
.oom-card.is-good {
  border-left-color: #18a058;
}
.oom-label {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.75;
}
.oom-value {
  font-size: 18px;
  line-height: 26px;
  white-space: nowrap;
}
.oom-sub {
  font-size: 11px;
  line-height: 16px;
  opacity: 0.7;
  overflow-wrap: anywhere;
}
</style>
