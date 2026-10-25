<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { NFormItemGi, NSelect, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import ListSearchCard from '@/components/business/list-search-card.vue';
import MetricAnalysis from '@/components/business/metric-analysis.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { AUX_METRICS, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { fetchGetAlgorithms, fetchGetForecastMetricCatalog, fetchQueryForecastMetric } from '@/service/api';
import { type MetricResult, seriesName } from '@/utils/metric-series';

defineOptions({ name: 'MonitoringCurves' });

const { t, locale } = useI18n();
const message = useMessage();
const route = useRoute();
const GROUPS = ['usage', 'prediction', 'performance', 'execution'] as const;

const { modules, moduleOptions, loadModules } = useForecastModules();
const catalog = ref<Api.Forecast.MetricDef[]>([]);
const algorithms = ref<string[]>([]);
const loading = ref(false);
const results = ref<MetricResult[]>([]);

const form = reactive({
  moduleId: null as number | null,
  name: 'usage_cpu_cores',
  kind: 'cpu' as string,
  algorithms: [] as string[],
  hours: 24
});

const text = (value: { zh: string; en: string }) => (locale.value === 'en-US' ? value.en : value.zh);
const current = computed(() => catalog.value.find(item => item.name === form.name));
const needsKind = computed(() => Boolean(current.value?.labels.includes('metric')));
const needsAlgorithm = computed(() => Boolean(current.value?.labels.includes('algorithm')));
const selected = computed(() => modules.value.find(item => item.id === form.moduleId));

const metricOptions = computed(() =>
  GROUPS.map(group => ({
    type: 'group' as const,
    label: t(`page.forecast.metrics.group_${group}`),
    key: group,
    children: catalog.value
      .filter(item => item.group === group)
      .map(item => ({ label: `${text(item.help)} (${item.name})`, value: item.name }))
  }))
);
const kindOptions = computed(() =>
  (selected.value?.sources || [])
    .filter(source => source.enabled)
    .map(source => ({ label: `${source.name} (${source.key})`, value: source.key }))
);
const algorithmOptions = computed(() => algorithms.value.map(value => ({ label: value, value })));
const rangeOptions = computed(() =>
  [6, 24, 24 * 7, 24 * 30, 24 * 90].map(value => ({
    label: t('page.forecast.history.lastHours', { hours: value }),
    value
  }))
);

const nameOf = (item: MetricResult, labels: Record<string, string>) =>
  seriesName(item.def, labels, item.actual, t('page.forecast.metrics.actual'), text(item.def.help));

async function load() {
  const def = current.value;
  if (!form.moduleId || !def) {
    results.value = [];
    return;
  }
  loading.value = true;
  try {
    const to = new Date();
    const from = new Date(to.getTime() - form.hours * 3600 * 1000);
    const base = { module_id: form.moduleId, from: from.toISOString(), to: to.toISOString() };
    const filters = form.algorithms.length && needsAlgorithm.value ? form.algorithms : [undefined];
    const answers = await Promise.all(
      filters.map(async algorithm => ({
        response: await fetchQueryForecastMetric({
          ...base,
          name: def.name,
          metric: needsKind.value ? form.kind : undefined,
          algorithm
        })
      }))
    );
    results.value = answers
      .filter(answer => answer.response.data)
      .map(answer => ({ def, result: answer.response.data! }));
    if (results.value.some(item => item.result.truncated)) message.warning(t('page.forecast.metrics.truncated'));
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    moduleId: modules.value[0]?.id ?? null,
    name: 'usage_cpu_cores',
    kind: kindOptions.value[0]?.value ?? 'cpu',
    algorithms: [],
    hours: 24
  });
  load();
}

// a hint of which auxiliary metrics the chosen module actually has data for
const mappedHint = computed(() =>
  (selected.value?.sources || [])
    .filter(source => source.enabled && (AUX_METRICS as string[]).includes(source.kind))
    .map(source => t(`page.datasource.mappings.metric_${source.kind}`))
    .join(', ')
);

/** The source keys on offer follow the chosen module. */
function onModuleChange() {
  form.algorithms = [];
  if (!kindOptions.value.some(item => item.value === form.kind)) form.kind = kindOptions.value[0]?.value ?? '';
}

watch(() => form.moduleId, onModuleChange);

onMounted(async () => {
  const [, cat, algos] = await Promise.all([
    loadModules(),
    fetchGetForecastMetricCatalog(),
    fetchGetAlgorithms({ page: 1, page_size: 200 })
  ]);
  catalog.value = cat.data?.list || [];
  algorithms.value = (algos.data?.list || []).map(item => item.id);
  // the catalog page sends the metric to draw
  const wanted = typeof route.query.name === 'string' ? route.query.name : '';
  if (wanted && catalog.value.some(item => item.name === wanted)) form.name = wanted;
  const fromRoute = Number(route.query.module_id);
  form.moduleId = modules.value.find(item => item.id === fromRoute)?.id ?? modules.value[0]?.id ?? null;
  onModuleChange();
  await load();
});
</script>

<template>
  <div class="h-full flex-col gap-12px overflow-auto">
    <ListSearchCard :model="form" :action-span="needsKind || needsAlgorithm ? 24 : 8" @search="load" @reset="resetForm">
      <NFormItemGi class="list-search-select-field" :span="6" :label="t('page.forecast.modules.name')">
        <NSelect v-model:value="form.moduleId" filterable :options="moduleOptions" />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="7" :label="t('page.forecast.metrics.metric')">
        <NSelect v-model:value="form.name" :options="metricOptions" filterable />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.metrics.range')"
      >
        <NSelect v-model:value="form.hours" :options="rangeOptions" />
      </NFormItemGi>
      <NFormItemGi
        v-if="needsKind"
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.datasource.mappings.metric')"
      >
        <NSelect v-model:value="form.kind" :options="kindOptions" />
      </NFormItemGi>
      <NFormItemGi
        v-if="needsAlgorithm"
        class="list-search-select-field"
        :span="5"
        :label="t('page.forecast.modules.algorithm')"
      >
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
    </ListSearchCard>

    <MetricAnalysis
      :results="results"
      :name-of="nameOf"
      :loading="loading"
      :title="t('page.forecast.metrics.chart')"
      :help="t('page.forecast.metrics.curvesHelp')"
      page-code="monitoring_curves"
      :chart-height="360"
      @refresh="load"
    >
      <template #meta>
        <template v-if="current">
          <span class="text-13px font-normal opacity-80">{{ text(current.value) }}</span>
          <NTag size="small" :bordered="false">{{ results[0]?.result.unit || current.unit }}</NTag>
          <NTag size="small" :bordered="false" type="info">
            {{
              current.retention_days
                ? t('page.forecast.metrics.retentionNote', { days: current.retention_days })
                : t('page.forecast.metrics.lookback')
            }}
          </NTag>
        </template>
        <IconTooltip v-if="mappedHint" icon="mdi-help-circle" placement="top">
          <div class="max-w-360px leading-22px">
            {{ t('page.forecast.metrics.mappedHint', { metrics: mappedHint }) }}
          </div>
        </IconTooltip>
      </template>
    </MetricAnalysis>
  </div>
</template>
