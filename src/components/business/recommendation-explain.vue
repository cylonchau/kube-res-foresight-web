<script setup lang="ts">
import { computed, h } from 'vue';
import { NDataTable, NEmpty, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import AheadExplain from '@/components/business/ahead-explain.vue';
import NeedCompare from '@/components/business/need-compare.vue';
import ReplicaExplain from '@/components/business/replica-explain.vue';
import { formatDateTime } from '@/utils/date';
import { formatCpuMilli, formatMemoryBytes, formatPercent } from '@/utils/format';

defineOptions({ name: 'RecommendationExplain' });

interface Field {
  set: boolean;
  value: number;
  source: string;
  detail?: string;
  reason: string;
  clamped?: boolean;
  floored?: boolean;
  floor_capped?: boolean;
}

interface Detail {
  bypass?: boolean;
  bypass_reason?: string;
  cpu?: Field;
  memory?: Field;
  gpu?: Field;
  replicas?: Field;
  algorithm?: string;
  score?: number;
  selection?: Api.Forecast.SelectionRow[];
  multi?: Api.Forecast.CalcResult;
  borrowed?: Record<string, string>;
  expansion?: Api.Forecast.Expansion;
  ahead?: Api.Forecast.Ahead;
  /** what the forecast needs before the bounds of the module, next to the recommendation */
  need?: Api.Forecast.NeedDetail;
  considered?: Array<{ metric: string; algorithm_id: string; eligible: boolean; reason: string; peak?: number }>;
  active_periods?: string[];
  periods?: Array<{
    name: string;
    enabled: boolean;
    active: boolean;
    priority: number;
    weekly: boolean;
    start?: string;
    end?: string;
    replicas: number;
    replica_mode?: string;
    cpu_milli: number;
    memory_bytes: number;
  }>;
  sources?: Array<{
    key: string;
    name: string;
    kind: string;
    resource: string;
    enabled: boolean;
    datasource?: string;
    query?: string;
    level?: string;
    unit?: string;
    step_seconds?: number;
    stat: string;
    basis: string;
    scale: number;
  }>;
  degraded?: Record<string, string>;
  degrade_notes?: Record<string, string>;
  oom?: {
    active: boolean;
    events: number;
    last_event?: string;
    working_set_bytes?: number;
    limit_bytes?: number;
    uplift: number;
    floor_bytes?: number;
    reason: string;
  };
  heap?: { ratio?: number; threshold: number; over: boolean; reason: string };
  /** how the Pod CPU and memory of the snapshot were decided apart from the replicas */
  resource_spec?: {
    version: number;
    changed_at?: string;
    held: boolean;
    changed: boolean;
    computed: { cpu_milli: number; memory_bytes: number };
    pinned: { cpu_milli: number; memory_bytes: number };
    change_percent: number;
    hold_hours: number;
  };
}

interface Props {
  /** Recommendation detail JSON (forecastsvc.RecommendDetail). */
  detail: string | Record<string, any> | null | undefined;
  /** the module, so the bounds the need advises changing can be changed from here */
  moduleId?: number;
}

const props = withDefaults(defineProps<Props>(), { moduleId: undefined });
const { t } = useI18n();

const parsed = computed<Detail | null>(() => {
  try {
    return typeof props.detail === 'string' ? JSON.parse(props.detail) : (props.detail as Detail);
  } catch {
    return null;
  }
});

function valueText(name: string, field: Field) {
  if (!field.set) return t('page.forecast.recommendations.keepOriginal');
  if (name === 'cpu') return formatCpuMilli(field.value);
  if (name === 'memory') return formatMemoryBytes(field.value);
  if (name === 'gpu') return `${field.value} GPU`;
  return String(field.value);
}

const fieldRows = computed(() =>
  (['cpu', 'memory', 'gpu', 'replicas'] as const)
    .filter(name => parsed.value?.[name]?.set || parsed.value?.degraded?.[name] || name !== 'gpu')
    .map(name => {
      const field = parsed.value![name]!;
      const flags: string[] = [];
      if (field.clamped) flags.push(t('page.forecast.explain.clamped'));
      if (field.floored) flags.push(t('page.forecast.explain.floored'));
      if (field.floor_capped) flags.push(t('page.forecast.explain.floorCapped'));
      return {
        name,
        value: valueText(name, field),
        source: t(`page.forecast.recommendations.source_${field.source}`, field.source),
        algorithm: field.detail || '-',
        flags: flags.join(' / '),
        reason: field.reason,
        code: parsed.value?.degraded?.[name]
      };
    })
);

const fieldColumns = computed(() => [
  {
    title: t('page.forecast.explain.field'),
    key: 'name',
    width: 90,
    render: (row: { name: string }) => t(`page.forecast.explain.field_${row.name}`)
  },
  { title: t('page.forecast.explain.value'), key: 'value', width: 110 },
  { title: t('page.forecast.explain.source'), key: 'source', width: 100 },
  { title: t('page.forecast.modules.algorithm'), key: 'algorithm', width: 130 },
  { title: t('page.forecast.explain.flags'), key: 'flags', width: 170, ellipsis: { tooltip: true } },
  { title: t('page.forecast.evaluation.reason'), key: 'reason', minWidth: 260, ellipsis: { tooltip: true } }
]);

const consideredColumns = computed(() => [
  { title: t('page.forecast.sources.key'), key: 'metric', width: 110 },
  { title: t('page.forecast.modules.algorithm'), key: 'algorithm_id', width: 150 },
  {
    title: t('page.forecast.explain.eligible'),
    key: 'eligible',
    width: 90,
    render: (row: { eligible: boolean }) => t(row.eligible ? 'common.yesOrNo.yes' : 'common.yesOrNo.no')
  },
  { title: t('page.forecast.evaluation.reason'), key: 'reason', minWidth: 260, ellipsis: { tooltip: true } }
]);

const selectionColumns = computed(() => [
  {
    title: t('page.forecast.evaluation.rank'),
    key: 'rank',
    width: 64,
    render: (row: Api.Forecast.SelectionRow) => row.rank || '-'
  },
  { title: t('page.forecast.modules.algorithm'), key: 'algorithm', width: 150 },
  { title: t('page.forecast.modules.algorithm'), key: 'catalog', width: 130 },
  {
    title: t('page.forecast.scores.score'),
    key: 'score',
    width: 80,
    render: (row: Api.Forecast.SelectionRow) => (row.scored ? row.score.toFixed(2) : '-')
  },
  { title: t('page.forecast.algorithms.columns.weight'), key: 'weight', width: 70 },
  {
    title: t('page.forecast.scores.weighted'),
    key: 'value',
    width: 90,
    render: (row: Api.Forecast.SelectionRow) => (row.scored ? row.value.toFixed(2) : '-')
  },
  {
    title: t('page.forecast.explain.eligible'),
    key: 'eligible',
    width: 80,
    render: (row: Api.Forecast.SelectionRow) =>
      row.chosen ? t('page.forecast.scores.inUse') : t(row.eligible ? 'common.yesOrNo.yes' : 'common.yesOrNo.no')
  },
  {
    title: t('page.forecast.explain.tracking'),
    key: 'tracking',
    width: 150,
    render: (row: Api.Forecast.SelectionRow) => {
      if (!row.tracked) return '-';
      const text = `${formatPercent(row.tracking_wape ?? 0)} · ${row.tracking_points}${t('page.forecast.explain.trackingSteps')}`;
      return row.lagging ? h(NTag, { size: 'small', bordered: false, type: 'error' }, () => text) : text;
    }
  },
  { title: t('page.forecast.evaluation.reason'), key: 'reason', minWidth: 220, ellipsis: { tooltip: true } }
]);

const num = (value?: number) => (value === undefined ? '-' : Number(value.toPrecision(4)).toString());
const calcColumns = computed(() => [
  {
    title: t('page.forecast.sources.name'),
    key: 'name',
    width: 150,
    render: (row: Api.Forecast.CalcRow) => `${row.name} (${row.key})`
  },
  {
    title: t('page.forecast.sources.resource'),
    key: 'resource',
    width: 90,
    render: (row: Api.Forecast.CalcRow) => t(`page.forecast.modules.resource_${row.resource}`)
  },
  { title: t('page.forecast.sources.stat'), key: 'stat', width: 70 },
  { title: t('page.forecast.sources.weight'), key: 'weight', width: 70 },
  {
    title: t('page.forecast.explain.share'),
    key: 'share',
    width: 80,
    render: (row: Api.Forecast.CalcRow) => (row.used ? `${(row.share * 100).toFixed(0)}%` : '-')
  },
  {
    title: t('page.forecast.explain.demand'),
    key: 'demand',
    width: 110,
    render: (row: Api.Forecast.CalcRow) => num(row.demand)
  },
  {
    title: t('page.forecast.sources.threshold'),
    key: 'threshold',
    width: 100,
    render: (row: Api.Forecast.CalcRow) => (row.threshold ? num(row.threshold) : '-')
  },
  {
    title: t('page.forecast.explain.ratio'),
    key: 'ratio',
    width: 80,
    render: (row: Api.Forecast.CalcRow) => (row.threshold ? row.ratio?.toFixed(2) : '-')
  },
  {
    title: t('page.forecast.explain.state'),
    key: 'triggered',
    width: 120,
    render: (row: Api.Forecast.CalcRow) =>
      !row.used ? t('page.forecast.explain.notUsed') : row.triggered ? t('page.forecast.explain.triggered') : '-'
  },
  { title: t('page.forecast.explain.note'), key: 'note', minWidth: 200, ellipsis: { tooltip: true } }
]);

const bytes = (value?: number) => (value ? formatMemoryBytes(value) : '-');

/** the rows of the spec table: what the forecast computed and what the snapshot carries, for CPU and memory */
const specRows = computed(() => {
  const spec = parsed.value?.resource_spec;
  if (!spec) return [];
  return [
    {
      name: 'cpu',
      computed: spec.computed.cpu_milli ? formatCpuMilli(spec.computed.cpu_milli) : '-',
      pinned: spec.pinned.cpu_milli ? formatCpuMilli(spec.pinned.cpu_milli) : '-',
      kept: spec.computed.cpu_milli !== spec.pinned.cpu_milli
    },
    {
      name: 'memory',
      computed: spec.computed.memory_bytes ? formatMemoryBytes(spec.computed.memory_bytes) : '-',
      pinned: spec.pinned.memory_bytes ? formatMemoryBytes(spec.pinned.memory_bytes) : '-',
      kept: spec.computed.memory_bytes !== spec.pinned.memory_bytes
    }
  ];
});
const specColumns = computed(() => [
  {
    title: t('page.forecast.explain.field'),
    key: 'name',
    width: 90,
    render: (row: { name: string }) => t(`page.forecast.explain.field_${row.name}`)
  },
  { title: t('page.forecast.explain.specComputed'), key: 'computed', width: 130 },
  { title: t('page.forecast.explain.specPinned'), key: 'pinned', width: 130 },
  {
    title: t('page.forecast.explain.state'),
    key: 'kept',
    width: 130,
    render: (row: { kept: boolean }) =>
      h(NTag, { size: 'small', bordered: false, type: row.kept ? 'info' : 'success' }, () =>
        t(row.kept ? 'page.forecast.recommendations.specHeld' : 'page.forecast.recommendations.specChanged')
      )
  }
]);

// ---- the fixed periods of the module and whether they decided, and the metrics the figures are calculated from
const when = (iso?: string) => formatDateTime(iso);
const periodColumns = computed(() => [
  { title: t('page.forecast.periods.col_name'), key: 'name', width: 140, ellipsis: { tooltip: true } },
  {
    title: t('page.forecast.periods.col_enabled'),
    key: 'state',
    width: 100,
    render: (row: NonNullable<Detail['periods']>[number]) =>
      h(NTag, { size: 'small', bordered: false, type: row.active ? 'success' : 'default' }, () =>
        t(`page.forecast.explain.period_${!row.enabled ? 'disabled' : row.active ? 'active' : 'idle'}`)
      )
  },
  {
    title: t('page.forecast.periods.col_range'),
    key: 'range',
    minWidth: 260,
    render: (row: NonNullable<Detail['periods']>[number]) =>
      row.weekly ? t('page.forecast.explain.period_weekly') : `${when(row.start)} → ${when(row.end)}`
  },
  {
    title: t('page.forecast.explain.period_values'),
    key: 'values',
    minWidth: 220,
    render: (row: NonNullable<Detail['periods']>[number]) =>
      [
        row.replicas
          ? `${t('page.forecast.periods.col_replicas')} ${row.replica_mode && row.replica_mode !== 'fixed' ? t(`page.forecast.periods.mode_${row.replica_mode}`) : ''}${row.replicas}`
          : '',
        row.cpu_milli ? `CPU ${formatCpuMilli(row.cpu_milli)}` : '',
        row.memory_bytes ? `${t('page.forecast.explain.memory')} ${formatMemoryBytes(row.memory_bytes)}` : ''
      ]
        .filter(Boolean)
        .join(' · ') || '-'
  },
  { title: t('page.forecast.periods.col_priority'), key: 'priority', width: 80 }
]);

const sourceColumns = computed(() => [
  { title: t('page.forecast.sources.name'), key: 'name', width: 130, ellipsis: { tooltip: true } },
  {
    title: t('page.forecast.explain.sourceFeeds'),
    key: 'resource',
    width: 90,
    render: (row: NonNullable<Detail['sources']>[number]) =>
      t(`page.forecast.modules.resource_${row.resource}`, row.resource)
  },
  { title: t('page.datasource.connections.name'), key: 'datasource', width: 120, ellipsis: { tooltip: true } },
  {
    title: 'PromQL',
    key: 'query',
    minWidth: 320,
    ellipsis: { tooltip: true },
    render: (row: NonNullable<Detail['sources']>[number]) => row.query || '-'
  },
  {
    title: t('page.forecast.explain.sourceShape'),
    key: 'shape',
    minWidth: 200,
    render: (row: NonNullable<Detail['sources']>[number]) =>
      [
        row.level,
        row.unit,
        row.step_seconds ? `${row.step_seconds}s` : '',
        `${row.stat}`,
        row.basis === 'history' ? t('page.forecast.sources.basis_history') : t('page.forecast.sources.basis_forecast')
      ]
        .filter(Boolean)
        .join(' · ')
  }
]);
</script>

<template>
  <div v-if="parsed" class="flex flex-col gap-12px">
    <div v-if="parsed.bypass" class="text-13px">
      <NTag size="small" :bordered="false" type="warning">{{ t('page.forecast.modules.bypass') }}</NTag>
      {{ parsed.bypass_reason }}
    </div>

    <div
      v-if="parsed.degraded && Object.keys(parsed.degraded).length"
      class="flex flex-wrap items-center gap-8px text-13px"
    >
      <template v-for="(code, field) in parsed.degraded" :key="field">
        <NTag size="small" :bordered="false" type="warning">
          {{ t(`page.forecast.explain.field_${field}`) }}:
          {{ t(`page.forecast.fallbacks.reason_${code}`, String(code)) }}
        </NTag>
        <span class="opacity-70">{{ parsed.degrade_notes?.[field as string] }}</span>
      </template>
    </div>

    <div v-if="parsed.algorithm" class="flex flex-wrap items-center gap-8px text-13px">
      <span class="font-medium">{{ t('page.forecast.explain.decidedBy') }}</span>
      <NTag size="small" :bordered="false" type="success">{{ parsed.algorithm }}</NTag>
      <span v-if="parsed.score !== undefined">{{ t('page.forecast.scores.score') }} {{ parsed.score.toFixed(2) }}</span>
    </div>

    <NeedCompare v-if="parsed.need" :need="parsed.need" :module-id="moduleId" />

    <div v-if="parsed.resource_spec" class="flex flex-col gap-6px">
      <div class="flex flex-wrap items-center gap-8px text-13px">
        <span class="font-medium">{{ t('page.forecast.explain.spec') }}</span>
        <NTag size="small" :bordered="false" type="info">
          {{ t('page.forecast.explain.specVersion', { version: parsed.resource_spec.version }) }}
        </NTag>
        <NTag v-if="parsed.resource_spec.held" size="small" :bordered="false" type="default">
          {{ t('page.forecast.recommendations.specHeld') }}
        </NTag>
        <span v-if="parsed.resource_spec.changed_at" class="opacity-70">
          {{ t('page.forecast.explain.specChangedAt', { time: when(parsed.resource_spec.changed_at) }) }}
        </span>
      </div>
      <NDataTable size="small" :columns="specColumns" :data="specRows" :row-key="(row: any) => row.name" />
      <div class="text-12px leading-20px opacity-70">
        {{
          t('page.forecast.explain.specHelp', {
            percent: parsed.resource_spec.change_percent,
            hours: parsed.resource_spec.hold_hours
          })
        }}
      </div>
    </div>

    <NDataTable
      size="small"
      :columns="fieldColumns"
      :data="fieldRows"
      :row-key="(row: any) => row.name"
      :scroll-x="760"
    />
    <div class="text-12px leading-20px opacity-70">{{ t('page.forecast.explain.precedence') }}</div>

    <div v-if="parsed.periods?.length">
      <div class="mb-4px text-13px font-medium">{{ t('page.forecast.periods.title') }}</div>
      <NDataTable
        size="small"
        :columns="periodColumns"
        :data="parsed.periods"
        :row-key="(row: any) => row.name"
        :scroll-x="820"
      />
    </div>

    <div v-if="parsed.sources?.length">
      <div class="mb-4px text-13px font-medium">{{ t('page.forecast.explain.sources') }}</div>
      <NDataTable
        size="small"
        :columns="sourceColumns"
        :data="parsed.sources"
        :row-key="(row: any) => row.key"
        :scroll-x="900"
      />
    </div>

    <div v-if="parsed.multi?.rows?.length">
      <div class="mb-4px text-13px font-medium">{{ t('page.forecast.explain.multi') }}</div>
      <NDataTable
        size="small"
        :columns="calcColumns"
        :data="parsed.multi.rows"
        :row-key="(row: any) => row.key"
        :scroll-x="1000"
      />
      <div class="mt-6px flex flex-wrap items-center gap-8px text-13px">
        <span v-for="(value, resource) in parsed.multi.resources" :key="resource">
          <NTag size="small" :bordered="false" type="info">
            {{ t(`page.forecast.modules.resource_${resource}`) }}: {{ num(value.value) }} ({{
              t(`page.forecast.modules.combine_${value.combine}`)
            }})
          </NTag>
        </span>
        <span v-if="parsed.multi.max_ratio > 0" class="opacity-80">
          {{
            t('page.forecast.explain.pressure', {
              pressure: parsed.multi.pressure.toFixed(2),
              max: parsed.multi.max_ratio.toFixed(2)
            })
          }}
        </span>
        <span v-for="note in parsed.multi.notes || []" :key="note" class="opacity-70">{{ note }}</span>
      </div>
      <div v-if="parsed.borrowed && Object.keys(parsed.borrowed).length" class="mt-4px text-13px opacity-70">
        <span v-for="(from, key) in parsed.borrowed" :key="key" class="mr-12px">
          {{ t('page.forecast.explain.borrowed', { source: key, from }) }}
        </span>
      </div>
    </div>

    <div v-if="parsed.selection?.length">
      <div class="mb-4px text-13px font-medium">{{ t('page.forecast.explain.selection') }}</div>
      <NDataTable
        size="small"
        :columns="selectionColumns"
        :data="parsed.selection"
        :row-key="(row: any) => row.algorithm"
        :scroll-x="820"
      />
    </div>

    <div v-if="parsed.expansion && parsed.expansion.mode === 'dynamic'" class="text-13px">
      <div class="mb-4px font-medium">{{ t('page.forecast.explain.expansion') }}</div>
      <div class="flex flex-wrap items-center gap-8px">
        <NTag size="small" :bordered="false" :type="parsed.expansion.expanded ? 'warning' : 'default'">
          {{
            t('page.forecast.explain.expansionCeiling', {
              base: parsed.expansion.base,
              effective: parsed.expansion.effective,
              hard: parsed.expansion.hard
            })
          }}
        </NTag>
        <span class="opacity-70">{{ parsed.expansion.reason }}</span>
      </div>
    </div>

    <div v-if="parsed.oom" class="text-13px">
      <div class="mb-4px font-medium">{{ t('page.forecast.explain.oom') }}</div>
      <div class="flex flex-wrap items-center gap-8px">
        <NTag size="small" :bordered="false" :type="parsed.oom.active ? 'error' : 'default'">
          {{ parsed.oom.active ? t('page.forecast.explain.oomActive') : t('page.forecast.explain.oomInactive') }}
        </NTag>
        <span v-if="parsed.oom.events">
          {{
            t('page.forecast.explain.oomDetail', {
              events: parsed.oom.events,
              workingSet: bytes(parsed.oom.working_set_bytes),
              limit: bytes(parsed.oom.limit_bytes),
              floor: bytes(parsed.oom.floor_bytes)
            })
          }}
        </span>
        <span class="opacity-70">{{ parsed.oom.reason }}</span>
      </div>
    </div>

    <div v-if="parsed.heap" class="text-13px">
      <div class="mb-4px font-medium">{{ t('page.forecast.explain.heap') }}</div>
      <div class="flex flex-wrap items-center gap-8px">
        <NTag size="small" :bordered="false" :type="parsed.heap.over ? 'warning' : 'default'">
          {{ parsed.heap.over ? t('page.forecast.explain.heapOver') : t('page.forecast.explain.heapOk') }}
        </NTag>
        <span class="opacity-70">{{ parsed.heap.reason }}</span>
      </div>
    </div>

    <div>
      <div class="mb-4px text-13px font-medium">{{ t('page.forecast.explain.considered') }}</div>
      <NDataTable
        v-if="parsed.considered?.length"
        size="small"
        :columns="consideredColumns"
        :data="parsed.considered"
        :row-key="(row: any) => `${row.metric}/${row.algorithm_id}`"
        :scroll-x="640"
      />
      <NEmpty v-else size="small" :description="t('page.forecast.explain.noConsidered')" />
    </div>

    <AheadExplain v-if="parsed.ahead" :ahead="parsed.ahead" />

    <ReplicaExplain :detail="parsed" />
  </div>
</template>
