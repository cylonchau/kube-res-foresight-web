<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { NFormItemGi, NSelect, NSwitch, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import MetricAnalysis from '@/components/business/metric-analysis.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { sourceMetricOptions, useForecastModules, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { fetchGetAlgorithms, fetchGetForecastMetricCatalog, fetchQueryForecastMetric } from '@/service/api';
import { type MetricResult, seriesName } from '@/utils/metric-series';

defineOptions({ name: 'ForecastResultsTrends' });

const { t, locale } = useI18n();
const message = useMessage();
const { modules, moduleOptions, loadModules } = useForecastModules();
const catalog = ref<Api.Forecast.MetricDef[]>([]);
const algorithms = ref<string[]>([]);
const results = ref<MetricResult[]>([]);
const loading = ref(false);

const form = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  algorithms: [] as string[],
  hours: 24,
  overlayActual: true
});

const text = (value: { zh: string; en: string }) => (locale.value === 'en-US' ? value.en : value.zh);
const selected = computed(() => modules.value.find(item => item.id === form.moduleId));
const metricOptions = computed(() => sourceMetricOptions(modules.value, form.moduleId));
const algorithmOptions = computed(() => algorithms.value.map(value => ({ label: value, value })));
const rangeOptions = useWindowOptions();

const nameOf = (item: MetricResult, labels: Record<string, string>) =>
  seriesName(item.def, labels, item.actual, t('page.forecast.metrics.actual'), text(item.def.help));

async function load() {
  const forecast = catalog.value.find(item => item.name === 'prediction_value');
  if (!form.moduleId || !form.metric || !forecast) {
    results.value = [];
    return;
  }
  loading.value = true;
  try {
    // the window reaches into the future by the forecast horizon, so the newest forecasts are visible
    const now = Date.now();
    const horizonMs = (selected.value?.horizon_minutes || 60) * 60 * 1000;
    const base = {
      module_id: form.moduleId,
      from: new Date(now - form.hours * 3600 * 1000).toISOString(),
      to: new Date(now + horizonMs).toISOString()
    };
    const queries: Array<{ def: Api.Forecast.MetricDef; params: Api.Forecast.MetricQueryParams; actual?: boolean }> = (
      form.algorithms.length ? form.algorithms : [undefined]
    ).map(algorithm => ({ def: forecast, params: { ...base, name: forecast.name, metric: form.metric!, algorithm } }));
    const usage = catalog.value.find(item => item.name === 'usage_source');
    if (form.overlayActual && usage)
      queries.push({ def: usage, params: { ...base, name: usage.name, metric: form.metric! }, actual: true });

    const answers = await Promise.all(
      queries.map(async q => ({ ...q, response: await fetchQueryForecastMetric(q.params) }))
    );
    results.value = answers
      .filter(answer => answer.response.data)
      .map(answer => ({ def: answer.def, result: answer.response.data!, actual: answer.actual }));
    if (results.value.some(item => item.result.truncated)) message.warning(t('page.forecast.metrics.truncated'));
  } finally {
    loading.value = false;
  }
}

watch(
  () => form.moduleId,
  () => {
    form.algorithms = [];
    if (!metricOptions.value.some(item => item.value === form.metric))
      form.metric = metricOptions.value[0]?.value ?? null;
  }
);

function resetForm() {
  Object.assign(form, {
    moduleId: modules.value[0]?.id ?? null,
    metric: null,
    algorithms: [],
    hours: 24,
    overlayActual: true
  });
}

onMounted(async () => {
  const [, cat, algos] = await Promise.all([
    loadModules(),
    fetchGetForecastMetricCatalog(),
    fetchGetAlgorithms({ page: 1, page_size: 200 })
  ]);
  catalog.value = cat.data?.list || [];
  algorithms.value = (algos.data?.list || []).map(item => item.id);
  form.moduleId = modules.value[0]?.id ?? null;
  form.metric = metricOptions.value[0]?.value ?? null;
  await load();
});
</script>

<template>
  <div class="h-full flex-col gap-12px overflow-auto">
    <ListSearchCard :model="form" :action-span="4" @search="load" @reset="resetForm">
      <NFormItemGi class="list-search-select-field" :span="6" :label="t('page.forecast.modules.name')">
        <NSelect v-model:value="form.moduleId" filterable :options="moduleOptions" />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.datasource.mappings.metric')"
      >
        <NSelect v-model:value="form.metric" :options="metricOptions" />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.forecast.modules.algorithm')">
        <NSelect
          v-model:value="form.algorithms"
          multiple
          clearable
          filterable
          :max-tag-count="2"
          :options="algorithmOptions"
          :placeholder="t('page.forecast.metrics.allAlgorithms')"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.metrics.range')"
      >
        <NSelect v-model:value="form.hours" :options="rangeOptions" />
      </NFormItemGi>
      <NFormItemGi :span="3">
        <template #label>
          <span class="inline-flex items-center gap-4px">
            {{ t('page.forecast.metrics.overlayActual') }}
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-320px leading-22px">{{ t('page.forecast.metrics.overlayActualHint') }}</div>
            </IconTooltip>
          </span>
        </template>
        <NSwitch v-model:value="form.overlayActual" />
      </NFormItemGi>
    </ListSearchCard>

    <MetricAnalysis
      :results="results"
      :name-of="nameOf"
      :loading="loading"
      :title="t('page.forecast.trends.title')"
      :help="t('page.forecast.trends.help')"
      :summary-title="t('page.forecast.trends.summaryTitle')"
      page-code="forecast_trends"
      :chart-height="380"
      @refresh="load"
    />
  </div>
</template>
