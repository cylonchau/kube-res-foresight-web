<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NModal, NSelect, NSpace, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import RecommendationExplain from '@/components/business/recommendation-explain.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchGetFallbacks, fetchGetSnapshot } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatCpuMilli, formatMemoryBytes } from '@/utils/format';
import { helpTitle } from '@/utils/help-title';

defineOptions({ name: 'ForecastActionsFallbacks' });

/**
 * Two different things, kept apart. A degradation is the system switching to a safe preset because the forecast, the data or the
 * decision service is not usable. A rollback is a change that was decided and not applied, so the workload stays on the configuration
 * that was valid before. Each record says why, from which configuration to which, what became of it, and when.
 */
const REASONS: Api.Forecast.DegradeReason[] = [
  'no_data',
  'stale_data',
  'insufficient_history',
  'predictor_failed',
  'no_prediction',
  'stale_prediction',
  'no_eligible_model',
  'recovering',
  'low_score',
  'short_history',
  'predict_timeout',
  'oom_floor'
];

const { t } = useI18n();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  kind: null as string | null,
  reason: null as string | null,
  range: lastHours(24 * 7) as [number, number] | null
});
const detail = ref<Api.Forecast.FallbackRecord | null>(null);
const snapshot = ref<Api.Forecast.Snapshot | null>(null);

const kindOptions = computed(() =>
  (['degrade', 'rollback'] as const).map(value => ({ label: t(`page.forecast.fallbacks.kind_${value}`), value }))
);
const reasonOptions = computed(() =>
  [...REASONS, 'decision_unavailable'].map(value => ({ label: t(`page.forecast.fallbacks.reason_${value}`), value }))
);

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.FallbackRecord>(async (page, pageSize) => {
  const { data } = await fetchGetFallbacks({
    module_id: search.moduleId ?? undefined,
    kind: (search.kind as Api.Forecast.FallbackKind) ?? undefined,
    reason: search.reason ?? undefined,
    ...rangeParams(search.range),
    page,
    page_size: pageSize,
    ...sortParams()
  });
  return data;
});
searchList = () => {
  list.search();
};

function resetSearch() {
  Object.assign(search, { moduleId: null, kind: null, reason: null, range: lastHours(24 * 7) });
}

async function openDetail(row: Api.Forecast.FallbackRecord) {
  detail.value = row;
  snapshot.value = null;
  if (row.snapshot_id) {
    const { data } = await fetchGetSnapshot(row.snapshot_id);
    snapshot.value = data ?? null;
  }
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  return `${(seconds / 3600).toFixed(1)} 小时`;
}

/** a configuration value in the unit it is set in */
function pointText(field: string, point: Api.Forecast.ConfigPoint) {
  if (!point.set) return t('page.forecast.fallbacks.keptOriginal');
  switch (field) {
    case 'cpu':
      return formatCpuMilli(point.value);
    case 'memory':
    case 'memory_floor':
      return formatMemoryBytes(point.value);
    case 'gpu':
      return `${point.value} GPU`;
    default:
      return String(point.value);
  }
}
const sourceText = (point: Api.Forecast.ConfigPoint) =>
  point.set && point.source ? t(`page.forecast.recommendations.source_${point.source}`, point.source) : '';

const kindType = (kind: Api.Forecast.FallbackKind) => (kind === 'rollback' ? 'error' : 'warning');
const resultTypes: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  applied: 'success',
  failed: 'error',
  not_applied: 'error',
  held: 'warning',
  pending: 'info',
  advisory: 'warning'
};
const resultType = (state: string) => resultTypes[state] ?? 'default';

/** the sentence of the result, built from the figures of the record in Chinese */
function resultText(row: Api.Forecast.FallbackRecord) {
  const change = row.changes[0];
  if (row.execution_id && change) {
    const key = row.result_state === 'held' ? 'resultHeld' : 'resultNotApplied';
    return t(`page.forecast.fallbacks.${key}`, {
      current: change.target.value,
      desired: change.original.value,
      reason: change.note || ''
    });
  }
  return t(`page.forecast.snapshots.state_${row.result_state}`, row.result_state);
}

const columnMap: Record<string, any> = {
  at: {
    title: t('page.forecast.fallbacks.at'),
    key: 'at',
    width: 170,
    sorter: true,
    render: (row: Api.Forecast.FallbackRecord) => formatDateTime(row.at)
  },
  kind: {
    title: () => helpTitle(t('page.forecast.fallbacks.kind'), t('page.forecast.fallbacks.kindHelp')),
    key: 'kind',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.FallbackRecord) =>
      h(NTag, { size: 'small', bordered: false, type: kindType(row.kind) }, () =>
        t(`page.forecast.fallbacks.kind_${row.kind}`)
      )
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 130,
    resizable: true,
    render: (row: Api.Forecast.FallbackRecord) => moduleName(row.module_id)
  },
  trigger: {
    title: () => helpTitle(t('page.forecast.fallbacks.trigger'), t('page.forecast.fallbacks.kindHelp')),
    key: 'trigger',
    minWidth: 260,
    render: (row: Api.Forecast.FallbackRecord) =>
      h(NSpace, { size: 4, wrap: true }, () => [
        h(NTag, { size: 'small', bordered: false, type: kindType(row.kind), strong: true }, () =>
          t(`page.forecast.fallbacks.kind_${row.kind}`)
        ),
        ...row.changes.map(change =>
          h(
            NTag,
            {
              size: 'small',
              bordered: false,
              type: change.trigger === 'oom_floor' ? 'error' : 'warning',
              title: change.note || ''
            },
            () =>
              `${t(`page.forecast.fallbacks.field_${change.field}`)}: ${t(`page.forecast.fallbacks.reason_${change.trigger}`, change.trigger)}`
          )
        )
      ])
  },
  change: {
    title: () =>
      helpTitle(
        t('page.forecast.fallbacks.change'),
        `${t('page.forecast.fallbacks.originalHelp')} ${t('page.forecast.fallbacks.targetHelp')}`
      ),
    key: 'change',
    minWidth: 260,
    render: (row: Api.Forecast.FallbackRecord) =>
      h(
        'div',
        { class: 'leading-20px' },
        row.changes.map(change =>
          h('div', [
            `${t(`page.forecast.fallbacks.field_${change.field}`)} `,
            pointText(change.field, change.original),
            ' → ',
            pointText(change.field, change.target),
            sourceText(change.target) ? ` (${sourceText(change.target)})` : ''
          ])
        )
      )
  },
  original: {
    title: () => helpTitle(t('page.forecast.fallbacks.original'), t('page.forecast.fallbacks.originalHelp')),
    key: 'original',
    minWidth: 150,
    render: (row: Api.Forecast.FallbackRecord) =>
      h(
        'div',
        { class: 'leading-20px' },
        row.changes.map(change => h('div', pointText(change.field, change.original)))
      )
  },
  target: {
    title: () => helpTitle(t('page.forecast.fallbacks.target'), t('page.forecast.fallbacks.targetHelp')),
    key: 'target',
    minWidth: 190,
    render: (row: Api.Forecast.FallbackRecord) =>
      h(
        'div',
        { class: 'leading-20px' },
        row.changes.map(change =>
          h('div', [
            pointText(change.field, change.target),
            sourceText(change.target) ? ` (${sourceText(change.target)})` : ''
          ])
        )
      )
  },
  result: {
    title: t('page.forecast.fallbacks.result'),
    key: 'result',
    minWidth: 260,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.FallbackRecord) =>
      h('span', [
        h(NTag, { size: 'small', bordered: false, type: resultType(row.result_state), class: 'mr-6px' }, () =>
          t(
            `page.forecast.snapshots.state_${row.result_state}`,
            t(`page.forecast.fallbacks.state_${row.result_state}`, row.result_state)
          )
        ),
        resultText(row)
      ])
  },
  duration: {
    title: t('page.forecast.fallbacks.duration'),
    key: 'duration',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.FallbackRecord) => duration(row.duration_seconds)
  },
  recovered_at: {
    title: () => helpTitle(t('page.forecast.fallbacks.recoveredAt'), t('page.forecast.fallbacks.recoveredHelp')),
    key: 'recovered_at',
    width: 170,
    render: (row: Api.Forecast.FallbackRecord) =>
      row.recovered_at
        ? formatDateTime(row.recovered_at)
        : h(NTag, { size: 'small', bordered: false, type: 'error' }, () => t('page.forecast.fallbacks.ongoing'))
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 100,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.FallbackRecord) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => openDetail(row) }, () =>
          t('page.forecast.recommendations.explain')
        )
      ])
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_fallback',
  columnMap,
  defaultKeys: ['at', 'module', 'trigger', 'change', 'result', 'kind', 'original', 'target', 'recovered_at', 'operate']
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  list.search();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="list.search" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="6" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          clearable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.fallbacks.kind')"
      >
        <NSelect
          v-model:value="search.kind"
          clearable
          :options="kindOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.fallbacks.kind') })"
        />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.forecast.fallbacks.reason')">
        <NSelect
          v-model:value="search.reason"
          clearable
          :options="reasonOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.fallbacks.reason') })"
        />
      </NFormItemGi>
      <NFormItemGi :span="6" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.fallbacks.title')"
      :help="t('page.forecast.fallbacks.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.fallbacks.empty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    ></ListTablePanel>
    <NModal
      :show="detail !== null"
      preset="card"
      :title="t('page.forecast.fallbacks.detailTitle')"
      class="edit-modal-wide"
      @update:show="value => !value && (detail = null)"
    >
      <div v-if="detail" class="max-h-60vh flex flex-col gap-12px overflow-auto">
        <div class="flex flex-wrap items-center gap-8px text-13px">
          <NTag size="small" :bordered="false" :type="kindType(detail.kind)">
            {{ t(`page.forecast.fallbacks.kind_${detail.kind}`) }}
          </NTag>
          <span>{{ formatDateTime(detail.at) }}</span>
          <span>{{ resultText(detail) }}</span>
        </div>
        <div v-for="change in detail.changes" :key="change.field" class="text-13px leading-22px">
          <b>{{ t(`page.forecast.fallbacks.field_${change.field}`) }}</b>
          · {{ t(`page.forecast.fallbacks.reason_${change.trigger}`, change.trigger) }} ·
          {{ pointText(change.field, change.original) }} → {{ pointText(change.field, change.target) }}
          <span v-if="change.note" class="opacity-70">· {{ change.note }}</span>
        </div>
        <RecommendationExplain v-if="snapshot" :detail="snapshot.detail" />
      </div>
    </NModal>
  </div>
</template>
