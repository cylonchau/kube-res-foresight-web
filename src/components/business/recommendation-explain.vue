<script setup lang="ts">
import { computed } from 'vue';
import { NDataTable, NEmpty, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ReplicaExplain from '@/components/business/replica-explain.vue';

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
  considered?: Array<{ metric: string; algorithm_id: string; eligible: boolean; reason: string; peak?: number }>;
  active_periods?: string[];
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
}

interface Props {
  /** Recommendation detail JSON (forecastsvc.RecommendDetail). */
  detail: string | Record<string, any> | null | undefined;
}

const props = defineProps<Props>();
const { t } = useI18n();
const MIB = 1024 * 1024;

const parsed = computed<Detail | null>(() => {
  try {
    return typeof props.detail === 'string' ? JSON.parse(props.detail) : (props.detail as Detail);
  } catch {
    return null;
  }
});

function valueText(name: string, field: Field) {
  if (!field.set) return t('page.forecast.recommendations.keepOriginal');
  if (name === 'cpu') return `${field.value} m`;
  if (name === 'memory') return `${Math.round(field.value / MIB)} MiB`;
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
  { title: '#', key: 'rank', width: 50, render: (row: Api.Forecast.SelectionRow) => row.rank || '-' },
  { title: t('page.forecast.modules.algorithm'), key: 'algorithm', width: 150 },
  { title: t('page.forecast.modules.algorithm'), key: 'catalog', width: 130 },
  {
    title: t('page.forecast.scores.score'),
    key: 'score',
    width: 80,
    render: (row: Api.Forecast.SelectionRow) => (row.scored ? row.score.toFixed(1) : '-')
  },
  { title: t('page.forecast.algorithms.columns.weight'), key: 'weight', width: 70 },
  {
    title: t('page.forecast.scores.weighted'),
    key: 'value',
    width: 90,
    render: (row: Api.Forecast.SelectionRow) => (row.scored ? row.value.toFixed(1) : '-')
  },
  {
    title: t('page.forecast.explain.eligible'),
    key: 'eligible',
    width: 80,
    render: (row: Api.Forecast.SelectionRow) =>
      row.chosen ? t('page.forecast.scores.inUse') : t(row.eligible ? 'common.yesOrNo.yes' : 'common.yesOrNo.no')
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

const bytes = (value?: number) => (value ? `${Math.round(value / MIB)} MiB` : '-');
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
      <span v-if="parsed.score !== undefined">{{ t('page.forecast.scores.score') }} {{ parsed.score.toFixed(1) }}</span>
    </div>

    <NDataTable
      size="small"
      :columns="fieldColumns"
      :data="fieldRows"
      :row-key="(row: any) => row.name"
      :scroll-x="760"
    />

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

    <ReplicaExplain :detail="parsed" />
  </div>
</template>
