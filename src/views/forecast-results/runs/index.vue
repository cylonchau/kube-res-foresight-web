<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NDescriptions, NDescriptionsItem, NFormItemGi, NInput, NModal, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import {
  sourceMetricOptions,
  useForecastModules,
  useWindowOptions,
  windowStart
} from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetTrainingRuns, fetchGetTrainingSummary } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastRuns' });

const { t } = useI18n();
const { modules, moduleOptions, moduleName, loadModules } = useForecastModules();
const hoursOptions = useWindowOptions();

const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  algorithm: '',
  status: null as string | null,
  hours: 24 as number | null
});
const metricOptions = computed(() => sourceMetricOptions(modules.value, search.moduleId));
const statusOptions = computed(() =>
  ['ok', 'skipped', 'failed'].map(value => ({ label: t(`page.forecast.runs.status_${value}`), value }))
);

const list = usePagedList<Api.Forecast.TrainingRun>(async (page, pageSize) => {
  const { data } = await fetchGetTrainingRuns({
    module_id: search.moduleId ?? undefined,
    metric: search.metric ?? undefined,
    algorithm_id: search.algorithm.trim() || undefined,
    status: search.status ?? undefined,
    from: windowStart(search.hours),
    page,
    page_size: pageSize
  });
  return data;
});

// ---- the overview: what the records say at a glance
const summary = ref<Api.Forecast.TrainingSummary | null>(null);

async function loadSummary() {
  const { data } = await fetchGetTrainingSummary({
    module_id: search.moduleId ?? undefined,
    metric: search.metric ?? undefined,
    algorithm_id: search.algorithm.trim() || undefined,
    status: search.status ?? undefined,
    from: windowStart(search.hours)
  });
  summary.value = data || null;
}
const successRate = computed(() => (summary.value?.total ? (summary.value.ok / summary.value.total) * 100 : null));

function run() {
  list.search();
  loadSummary();
}

function refresh() {
  list.reload();
  loadSummary();
}

const stepLabel = (seconds: number) => {
  if (!seconds) return '-';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
};
const statusType = (status: string) => (status === 'ok' ? 'success' : status === 'failed' ? 'error' : 'warning');
const duration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

const detail = ref<Api.Forecast.TrainingRun | null>(null);
const pretty = (raw: string) => {
  if (!raw) return '-';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

const columnMap: Record<string, any> = {
  prediction_time: {
    title: t('page.forecast.runs.time'),
    key: 'prediction_time',
    width: 170,
    render: (row: Api.Forecast.TrainingRun) => formatDateTime(row.prediction_time)
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 150,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.TrainingRun) => moduleName(row.module_id)
  },
  metric: { title: t('page.forecast.sources.key'), key: 'metric', width: 120 },
  algorithm: { title: t('page.forecast.modules.algorithm'), key: 'algorithm_id', width: 160, resizable: true },
  status: {
    title: t('common.status'),
    key: 'status',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.TrainingRun) =>
      h(NTag, { size: 'small', bordered: false, type: statusType(row.status) }, () =>
        t(`page.forecast.runs.status_${row.status}`)
      )
  },
  samples: { title: t('page.forecast.runs.samples'), key: 'samples', width: 90, align: 'center' },
  step: {
    title: t('page.monitoring.datasets.step'),
    key: 'step',
    width: 80,
    align: 'center',
    render: (row: Api.Forecast.TrainingRun) => stepLabel(row.step_seconds)
  },
  horizon: { title: t('page.forecast.runs.horizonSteps'), key: 'horizon_steps', width: 100, align: 'center' },
  points: { title: t('page.forecast.runs.points'), key: 'points', width: 90, align: 'center' },
  window: {
    title: t('page.forecast.runs.window'),
    key: 'window',
    width: 340,
    render: (row: Api.Forecast.TrainingRun) =>
      row.window_start && row.window_end
        ? `${formatDateTime(row.window_start)} ~ ${formatDateTime(row.window_end)}`
        : '-'
  },
  duration: {
    title: t('page.forecast.runs.duration'),
    key: 'duration_ms',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.TrainingRun) => duration(row.duration_ms)
  },
  version: {
    title: t('page.forecast.runs.modelVersion'),
    key: 'model_version',
    width: 220,
    ellipsis: { tooltip: true }
  },
  covariates: { title: t('page.forecast.runs.covariates'), key: 'covariates', width: 160, ellipsis: { tooltip: true } },
  reason: { title: t('page.forecast.runs.reason'), key: 'reason', minWidth: 260, ellipsis: { tooltip: true } },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 100,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.TrainingRun) =>
      h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_runs',
  columnMap,
  defaultKeys: [
    'prediction_time',
    'module',
    'metric',
    'algorithm',
    'status',
    'samples',
    'step',
    'points',
    'duration',
    'version',
    'reason',
    'operate'
  ]
});

function resetSearch() {
  Object.assign(search, { moduleId: null, metric: null, algorithm: '', status: null, hours: 24 });
  run();
}

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  run();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="run" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="6" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          clearable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
          @update:value="search.metric = null"
        />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="4" :label="t('page.forecast.sources.key')">
        <NSelect v-model:value="search.metric" clearable filterable :options="metricOptions" />
      </NFormItemGi>
      <NFormItemGi :span="4" :label="t('page.forecast.modules.algorithm')">
        <NInput v-model:value="search.algorithm" clearable @keyup.enter="run" />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field list-search-short-field" :span="3" :label="t('common.status')">
        <NSelect v-model:value="search.status" clearable :options="statusOptions" />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
      </NFormItemGi>
    </ListSearchCard>
    <NCard :bordered="false" size="small" class="flex-shrink-0 card-wrapper rounded-16px shadow-sm">
      <div class="mb-8px flex items-center gap-6px text-14px font-medium">
        {{ t('page.forecast.runs.overview') }}
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-360px leading-22px">{{ t('page.forecast.runs.overviewHelp') }}</div>
        </IconTooltip>
      </div>
      <div class="overview">
        <div class="overview__stats">
          <div>
            <div class="overview__label">{{ t('page.forecast.runs.total') }}</div>
            <div class="overview__value">{{ summary?.total ?? '-' }}</div>
          </div>
          <div>
            <div class="overview__label">{{ t('page.forecast.runs.successRate') }}</div>
            <div class="overview__value">{{ successRate === null ? '-' : `${successRate.toFixed(1)}%` }}</div>
          </div>
          <div>
            <div class="overview__label">
              {{ t('page.forecast.runs.status_skipped') }} / {{ t('page.forecast.runs.status_failed') }}
            </div>
            <div class="overview__value">{{ summary ? `${summary.skipped} / ${summary.failed}` : '-' }}</div>
          </div>
          <div>
            <div class="overview__label">{{ t('page.forecast.runs.avgDuration') }}</div>
            <div class="overview__value">{{ summary ? duration(Math.round(summary.avg_duration_ms)) : '-' }}</div>
          </div>
          <div class="col-span-2">
            <div class="overview__label">{{ t('page.forecast.runs.lastRun') }}</div>
            <div class="overview__text">{{ summary?.last_at ? formatDateTime(summary.last_at) : '-' }}</div>
          </div>
        </div>
        <div class="overview__panel">
          <div class="overview__label">{{ t('page.forecast.runs.byAlgorithm') }}</div>
          <div class="overview__scroll">
            <div v-for="item in summary?.algorithms || []" :key="item.algorithm_id" class="mix">
              <span class="mix__name" :title="item.algorithm_id">{{ item.algorithm_id }}</span>
              <div class="mix__bar">
                <div class="mix__ok" :style="{ flexGrow: item.ok }" />
                <div class="mix__skipped" :style="{ flexGrow: item.skipped }" />
                <div class="mix__failed" :style="{ flexGrow: item.failed }" />
              </div>
              <span class="mix__count">{{ item.ok }}/{{ item.skipped }}/{{ item.failed }}</span>
            </div>
          </div>
        </div>
        <div class="overview__panel">
          <div class="overview__label">{{ t('page.forecast.runs.reasons') }}</div>
          <div class="overview__scroll">
            <div v-for="item in summary?.reasons || []" :key="item.status + item.reason" class="reason">
              <NTag size="small" :bordered="false" :type="statusType(item.status)">
                {{ t(`page.forecast.runs.status_${item.status}`) }}
              </NTag>
              <span class="reason__text" :title="item.reason">{{ item.reason }}</span>
              <span class="reason__count">{{ t('page.forecast.runs.times', { count: item.count }) }}</span>
            </div>
            <div v-if="summary && !summary.reasons.length" class="text-13px opacity-60">
              {{ t('page.forecast.runs.noReasons') }}
            </div>
          </div>
        </div>
      </div>
    </NCard>
    <ListTablePanel
      :title="t('page.forecast.runs.title')"
      :help="t('page.forecast.runs.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.runs.empty')"
      @refresh="refresh"
    />

    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="`${detail?.algorithm_id || ''} · ${detail ? moduleName(detail.module_id) : ''} · ${detail?.metric || ''}`"
      class="w-820px max-w-95vw"
      @update:show="value => !value && (detail = null)"
    >
      <div v-if="detail" class="max-h-70vh overflow-y-auto pr-8px">
        <NDescriptions :column="2" size="small" label-placement="left" bordered>
          <NDescriptionsItem :label="t('common.status')">
            <NTag size="small" :bordered="false" :type="statusType(detail.status)">
              {{ t(`page.forecast.runs.status_${detail.status}`) }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.time')">
            {{ formatDateTime(detail.prediction_time) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.modelVersion')" :span="2">
            {{ detail.model_version || '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.implVersion')">
            {{ detail.impl_version || '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.duration')">
            {{ duration(detail.duration_ms) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.samples')">{{ detail.samples }}</NDescriptionsItem>
          <NDescriptionsItem :label="t('page.monitoring.datasets.step')">
            {{ stepLabel(detail.step_seconds) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.horizonSteps')">
            {{ detail.horizon_steps }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.points')">{{ detail.points }}</NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.window')" :span="2">
            {{
              detail.window_start && detail.window_end
                ? `${formatDateTime(detail.window_start)} ~ ${formatDateTime(detail.window_end)}`
                : '-'
            }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.runs.covariates')" :span="2">
            {{ detail.covariates || '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.dropped_covariates" :label="t('page.forecast.runs.dropped')" :span="2">
            <pre class="m-0 whitespace-pre-wrap text-12px">{{ pretty(detail.dropped_covariates) }}</pre>
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.reason" :label="t('page.forecast.runs.reason')" :span="2">
            {{ detail.reason }}
          </NDescriptionsItem>
        </NDescriptions>
        <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.runs.params') }}</div>
        <pre class="run-pre">{{ pretty(detail.params) }}</pre>
        <template v-if="detail.formula">
          <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.algorithms.formula.sectionFormula') }}</div>
          <pre class="run-pre">{{ detail.formula }}</pre>
          <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.algorithms.formula.sectionSchema') }}</div>
          <pre class="run-pre">{{ pretty(detail.param_schema) }}</pre>
        </template>
        <p class="mt-12px text-12px opacity-70">{{ t('page.forecast.runs.reproduceHint') }}</p>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.overview {
  display: grid;
  grid-template-columns: minmax(300px, 1.1fr) minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 16px;
}
.overview__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 14px;
}
.overview__label {
  font-size: 12px;
  opacity: 0.65;
}
.overview__value {
  font-size: 20px;
  font-weight: 600;
}
.overview__text {
  font-size: 13px;
  font-weight: 500;
}
.overview__panel {
  min-width: 0;
}
.overview__scroll {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 96px;
  margin-top: 4px;
  overflow-y: auto;
}
.mix {
  display: grid;
  grid-template-columns: 110px 1fr 70px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.mix__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mix__bar {
  display: flex;
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: rgb(var(--base-text-color) / 0.08);
}
.mix__ok {
  flex-basis: 0;
  background: rgb(var(--success-color) / 0.75);
}
.mix__skipped {
  flex-basis: 0;
  background: rgb(var(--warning-color) / 0.8);
}
.mix__failed {
  flex-basis: 0;
  background: rgb(var(--error-color) / 0.75);
}
.mix__count {
  text-align: right;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
.reason {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.reason__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reason__count {
  opacity: 0.65;
  white-space: nowrap;
}
@media (max-width: 1100px) {
  .overview {
    grid-template-columns: 1fr;
  }
}
.run-pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgb(127 127 127 / 12%);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
