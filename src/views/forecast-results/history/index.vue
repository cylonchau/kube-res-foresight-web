<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { NCard, NEmpty, NFormItemGi, NSelect, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useForecastModules, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { fetchGetModuleHistory } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'ForecastResultsHistory' });

const { t } = useI18n();
const message = useMessage();
const { modules, moduleOptions, loadModules } = useForecastModules();
const search = reactive({ moduleId: null as number | null, metric: null as string | null, hours: 24 });
const loading = ref(false);
const history = ref<Api.Forecast.History | null>(null);

const selected = computed(() => modules.value.find(item => item.id === search.moduleId));
const metricOptions = computed(() =>
  (selected.value?.sources || [])
    .filter(source => source.enabled)
    .map(source => ({ label: `${source.name} (${source.key})`, value: source.key }))
);
const rangeOptions = useWindowOptions();

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      tooltip: { trigger: 'axis' },
      grid: { left: 56, right: 24, top: 24, bottom: 48 },
      xAxis: { type: 'time' },
      yAxis: { type: 'value', scale: true },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18 }],
      series: [{ type: 'line', showSymbol: false, data: [] as Array<[string, number]> }]
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const points = history.value?.points || [];
  const step = (history.value?.bucket_seconds || history.value?.step_seconds || 60) * 1000 * 1.5;
  // A gap in the data must show as a gap in the line: a null point is inserted wherever steps are missing.
  const data: Array<[number, number | null]> = [];
  let previous = 0;
  for (const point of points) {
    const time = Date.parse(point.time);
    if (previous && time - previous > step) data.push([previous + 1, null]);
    data.push([time, point.value]);
    previous = time;
  }
  await updateOptions(opts => ({
    ...opts,
    yAxis: { type: 'value', scale: true, name: history.value?.unit || '' },
    series: [{ type: 'line', showSymbol: false, connectNulls: false, data } as never]
  }));
}

// ---- gaps: a table of its own, paged in the page because the quality report carries all of them
const gapPagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  onChange: (page: number) => {
    gapPagination.page = page;
  },
  onUpdatePageSize: (pageSize: number) => {
    gapPagination.pageSize = pageSize;
    gapPagination.page = 1;
  }
});
async function load() {
  if (!search.moduleId || !search.metric) return;
  loading.value = true;
  try {
    const to = new Date();
    const from = new Date(to.getTime() - search.hours * 3600 * 1000);
    const { data, error } = await fetchGetModuleHistory(search.moduleId, {
      metric: search.metric,
      from: from.toISOString(),
      to: to.toISOString()
    });
    history.value = error ? null : data;
    gapPagination.page = 1;
    await draw();
  } finally {
    loading.value = false;
  }
}

watch(
  () => search.moduleId,
  () => {
    history.value = null;
    if (!metricOptions.value.some(item => item.value === search.metric))
      search.metric = metricOptions.value[0]?.value ?? null;
  }
);
function resetSearch() {
  Object.assign(search, { moduleId: modules.value[0]?.id ?? null, metric: null, hours: 24 });
}

const quality = computed(() => history.value?.quality);
const missingPercent = computed(() => ((quality.value?.missing_ratio || 0) * 100).toFixed(2));
const sparse = computed(() => (quality.value?.missing_ratio || 0) > 0.05);

const gapMap: Record<string, any> = {
  from: {
    title: t('page.forecast.history.gapFrom'),
    key: 'from',
    width: 180,
    render: (row: Api.Forecast.QualityGap) => formatDateTime(row.from)
  },
  to: {
    title: t('page.forecast.history.gapTo'),
    key: 'to',
    width: 180,
    render: (row: Api.Forecast.QualityGap) => formatDateTime(row.to)
  },
  steps: { title: t('page.forecast.history.gapSteps'), key: 'steps', width: 120, align: 'center' }
};
const gapCfg = useTableColumnConfig({
  pageCode: 'forecast_history_gap',
  columnMap: gapMap,
  defaultKeys: ['from', 'to', 'steps']
});

onMounted(async () => {
  gapCfg.initColumnConfig();
  try {
    await loadModules();
  } catch {
    message.error(t('page.forecast.evaluation.loadFailed'));
  }
  search.moduleId = modules.value[0]?.id ?? null;
});
</script>

<template>
  <div class="h-full flex-col gap-12px overflow-auto">
    <ListSearchCard :model="search" :action-span="7" @search="load" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="9" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.datasource.mappings.metric')"
      >
        <NSelect
          v-model:value="search.metric"
          :options="metricOptions"
          :placeholder="t('common.selectField', { field: t('page.datasource.mappings.metric') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" :options="rangeOptions" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <div class="mb-8px flex flex-wrap items-center gap-8px">
        <span class="text-14px font-medium">{{ t('page.forecast.history.title') }}</span>
        <template v-if="quality">
          <NTag size="small" :bordered="false" :type="sparse ? 'warning' : 'success'">
            {{ t('page.forecast.history.missingRatio') }} {{ missingPercent }}%
          </NTag>
          <NTag size="small" :bordered="false">
            {{ t('page.forecast.history.present') }} {{ quality.present }} / {{ quality.expected }}
          </NTag>
          <NTag size="small" :bordered="false">
            {{ t('page.forecast.history.longestGap') }} {{ quality.longest_gap_steps }}
          </NTag>
          <NTag size="small" :bordered="false">{{ t('page.forecast.history.jumps') }} {{ quality.jumps }}</NTag>
          <NTag size="small" :bordered="false">{{ t('page.forecast.history.offGrid') }} {{ quality.duplicates }}</NTag>
          <NTag size="small" :bordered="false">
            {{ t('page.forecast.history.latestLag') }} {{ quality.latest_lag_seconds }} s
          </NTag>
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">
              {{ t('page.forecast.history.qualityHint') }}
              <template v-if="sparse">{{ t('page.forecast.history.missingWarning') }}</template>
            </div>
          </IconTooltip>
        </template>
      </div>
      <NEmpty
        v-if="!history || history.not_collected"
        class="h-360px justify-center"
        :description="
          history?.not_collected ? t('page.forecast.history.notCollected') : t('page.forecast.history.empty')
        "
      />
      <div v-show="history && !history.not_collected" ref="domRef" class="h-360px min-h-280px w-full"></div>
    </NCard>

    <div v-if="quality?.gaps?.length" class="h-360px flex flex-col">
      <ListTablePanel
        :title="t('page.forecast.history.gaps')"
        :cfg="gapCfg"
        :loading="loading"
        :data="quality.gaps"
        :pagination="gapPagination"
        :remote="false"
        :row-key="(row: any) => `${row.from}-${row.to}`"
        @refresh="load"
      />
    </div>
  </div>
</template>
