<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NFormItemGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import DurationInput from '@/components/advanced/duration-input.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import {
  SOURCE_RESOURCES,
  SOURCE_STATS,
  defaultBasis,
  defaultResource,
  resourceLocked,
  useForecastModules
} from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchCollectModule,
  fetchCreateModuleSource,
  fetchDeleteModuleSource,
  fetchGetDatasetCatalog,
  fetchGetDatasourceOptions,
  fetchGetMetricMappings,
  fetchGetModuleRequirements,
  fetchGetModuleSources,
  fetchUpdateForecastModule,
  fetchUpdateModuleSource
} from '@/service/api';

defineOptions({ name: 'MonitoringDatasets' });

const { t } = useI18n();
const message = useMessage();
const route = useRoute();
const { modules, moduleOptions, loadModules } = useForecastModules();

const search = reactive({
  moduleId: null as number | null,
  category: null as Api.Forecast.MetricCategory | null,
  keyword: ''
});
const rows = ref<Api.Forecast.DatasetSource[]>([]);
const loading = ref(false);
const saving = ref(false);
const catalog = ref<Api.Forecast.DatasetCatalog | null>(null);
const selected = computed(() => modules.value.find(item => item.id === search.moduleId));

const kindLabel = (kind: string) => t(`page.datasource.mappings.metric_${kind}`);
const categoryLabel = (category: string) => t(`page.monitoring.datasets.category_${category}`);
// the PromQL placeholders are written in the code: the locale files cannot hold a double brace
const queryExample =
  'sum(rate(container_cpu_usage_seconds_total{namespace="{{namespace}}",pod=~"{{workload}}-.*"}[{{range}}]))';
const stepLabel = (seconds: number) => {
  if (!seconds) return '-';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
};
const hoursLabel = (hours: number) => (hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`);
const minutesLabel = (minutes: number) => (minutes ? stepLabel(minutes * 60) : '-');
const periodItems = computed(() => {
  const m = selected.value;
  if (!m) return [];
  return [
    {
      label: t('page.monitoring.datasets.periodStep'),
      value: m.step_seconds ? stepLabel(m.step_seconds) : t('page.forecast.modules.stepFollowSource')
    },
    { label: t('page.monitoring.datasets.periodLookback'), value: hoursLabel(m.lookback_hours) },
    { label: t('page.monitoring.datasets.periodHorizon'), value: minutesLabel(m.horizon_minutes) },
    {
      label: t('page.monitoring.datasets.periodWindow'),
      value: m.window_steps || t('page.forecast.modules.windowAll')
    },
    { label: t('page.monitoring.datasets.periodMin'), value: m.min_points || '-' },
    {
      label: t('page.monitoring.datasets.periodRun'),
      value: m.run_interval_minutes ? minutesLabel(m.run_interval_minutes) : t('page.forecast.modules.runEveryCycle')
    }
  ];
});

const categoryOptions = computed(() =>
  (catalog.value?.categories || []).map(item => ({ label: categoryLabel(item.id), value: item.id }))
);
const aggregationOptions = computed(() =>
  (catalog.value?.aggregations || []).map(value => ({
    label: t(`page.monitoring.datasets.aggregation_${value}`),
    value
  }))
);
const missingOptions = computed(() =>
  (catalog.value?.missing || []).map(value => ({ label: t(`page.monitoring.datasets.missing_${value}`), value }))
);
const resourceOptions = computed(() =>
  SOURCE_RESOURCES.map(value => ({ label: t(`page.forecast.modules.resource_${value}`), value }))
);
const statOptions = SOURCE_STATS.map(value => ({ label: value, value }));
const basisOptions = computed(() =>
  (['forecast', 'history'] as const).map(value => ({ label: t(`page.forecast.sources.basis_${value}`), value }))
);

const filtered = computed(() => {
  const keyword = search.keyword.trim().toLowerCase();
  return rows.value.filter(
    row =>
      (!search.category || row.category === search.category) &&
      (!keyword || `${row.name} ${row.key} ${row.query} ${row.mapping_name}`.toLowerCase().includes(keyword))
  );
});

async function load() {
  if (!search.moduleId) {
    rows.value = [];
    return;
  }
  loading.value = true;
  const { data } = await fetchGetModuleSources(search.moduleId);
  loading.value = false;
  rows.value = data || [];
}

watch(() => search.moduleId, load);

function resetSearch() {
  Object.assign(search, { moduleId: modules.value[0]?.id ?? null, category: null, keyword: '' });
}

// ---- source form: a metric of the catalog, or a PromQL of one's own
const visible = ref(false);
const editing = ref<Api.Forecast.DatasetSource>();
const origin = ref<'mapping' | 'custom'>('mapping');
const mappingChoices = ref<Array<{ label: string; value: number }>>([]);
const datasourceOptions = ref<Array<{ label: string; value: number }>>([]);

function emptyForm() {
  return {
    name: '',
    category: 'cpu' as Api.Forecast.MetricCategory,
    kind: null as Api.Forecast.MetricKind | null,
    resource: 'signal' as Api.Forecast.SourceResource,
    mapping_id: null as number | null,
    priority: 0,
    weight: 1,
    stat: 'p95' as Api.Forecast.SourceStat,
    basis: 'forecast' as Api.Forecast.SourceBasis,
    window_hours: 24,
    threshold: 0,
    enabled: true,
    remark: '',
    scale: 1,
    precision: 6,
    aggregation: 'avg' as Api.Forecast.SourceAggregation,
    missing: 'interpolate' as Api.Forecast.SourceMissing,
    custom: { datasource_id: null as number | null, query: '', level: 'workload', unit: '', step_seconds: 60 }
  };
}
const form = reactive(emptyForm());

const kindsOfCategory = computed(() => catalog.value?.categories.find(item => item.id === form.category)?.kinds || []);
const kindOptions = computed(() =>
  kindsOfCategory.value.map(item => ({ label: kindLabel(item.kind), value: item.kind }))
);
const selectedKind = computed(() => kindsOfCategory.value.find(item => item.kind === form.kind));
const levelOptions = ['workload', 'namespace', 'service', 'pod', 'container', 'cluster'].map(value => ({
  label: value,
  value
}));

async function loadMappings(kind: string | null) {
  mappingChoices.value = [];
  if (!kind) return;
  const { data } = await fetchGetMetricMappings({ page: 1, page_size: 200, metric: kind });
  mappingChoices.value = (data?.list || []).map(item => ({
    label: `${item.name} (${item.datasource_name}, ${stepLabel(item.step_seconds)})`,
    value: item.id
  }));
}

function open(row?: Api.Forecast.DatasetSource) {
  editing.value = row;
  origin.value = 'mapping';
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      ...row,
      category: row.category,
      mapping_id: row.mapping_id || null,
      window_hours: row.window_hours || 24
    });
  } else {
    form.priority = rows.value.length;
    form.kind = kindsOfCategory.value[0]?.kind ?? null;
    if (form.kind) onKindChange(form.kind);
  }
  loadMappings(form.kind);
  visible.value = true;
}

function onCategoryChange() {
  form.kind = kindsOfCategory.value[0]?.kind ?? null;
  if (form.kind) onKindChange(form.kind);
}

function onKindChange(kind: Api.Forecast.MetricKind) {
  const info = kindsOfCategory.value.find(item => item.kind === kind);
  form.resource = info?.resource ?? defaultResource(kind);
  form.basis = info?.basis ?? defaultBasis(kind);
  form.missing = info?.missing ?? 'interpolate';
  form.mapping_id = null;
  loadMappings(kind);
}

async function save() {
  const module = selected.value;
  if (!module) return;
  const custom = origin.value === 'custom' && !editing.value;
  if (!form.name.trim() || !form.kind) {
    message.warning(t('page.forecast.sources.required'));
    return;
  }
  if (custom ? !form.custom.datasource_id || !form.custom.query.trim() : !form.mapping_id) {
    message.warning(t(custom ? 'page.monitoring.datasets.customRequired' : 'page.forecast.sources.required'));
    return;
  }
  saving.value = true;
  try {
    const payload: Api.Forecast.SourcePayload = {
      name: form.name.trim(),
      resource: form.resource,
      priority: form.priority,
      weight: form.weight,
      stat: form.stat,
      basis: form.basis,
      window_hours: form.basis === 'history' ? form.window_hours : 0,
      threshold: form.threshold,
      enabled: form.enabled,
      remark: form.remark,
      scale: form.scale,
      precision: form.precision,
      aggregation: form.aggregation,
      missing: form.missing
    };
    if (custom) {
      payload.custom = {
        datasource_id: form.custom.datasource_id!,
        query: form.custom.query.trim(),
        level: form.custom.level,
        unit: selectedKind.value?.unit_is_not_fixed ? form.custom.unit.trim() || undefined : undefined,
        step_seconds: form.custom.step_seconds
      };
    } else {
      payload.mapping_id = form.mapping_id!;
    }
    const { error } = editing.value
      ? await fetchUpdateModuleSource(module.id, editing.value.id, payload)
      : await fetchCreateModuleSource(module.id, { ...payload, kind: form.kind });
    if (!error) {
      visible.value = false;
      message.success(editing.value ? t('common.modifySuccess') : t('common.addSuccess'));
      await Promise.all([load(), loadModules()]);
    }
  } finally {
    saving.value = false;
  }
}

async function remove(row: Api.Forecast.DatasetSource) {
  if (!selected.value) return;
  const { error } = await fetchDeleteModuleSource(selected.value.id, row.id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    await Promise.all([load(), loadModules()]);
  }
}

// ---- the period of the dataset: granularity, history range, horizon, minimum data, how often it runs
const periodVisible = ref(false);
const periodForm = reactive({
  step_seconds: 0,
  lookback_hours: 720,
  horizon_minutes: 15,
  window_steps: 0,
  min_points: 0,
  run_interval_minutes: 0
});

function openPeriod() {
  if (!selected.value) return;
  const m = selected.value;
  Object.assign(periodForm, {
    step_seconds: m.step_seconds || 0,
    lookback_hours: m.lookback_hours,
    horizon_minutes: m.horizon_minutes,
    window_steps: m.window_steps || 0,
    min_points: m.min_points || 0,
    run_interval_minutes: m.run_interval_minutes || 0
  });
  periodVisible.value = true;
}

async function savePeriod() {
  if (!selected.value) return;
  saving.value = true;
  try {
    const { error } = await fetchUpdateForecastModule(selected.value.id, { ...periodForm });
    if (!error) {
      periodVisible.value = false;
      message.success(t('common.modifySuccess'));
      await Promise.all([loadModules(), load()]);
    }
  } finally {
    saving.value = false;
  }
}

// ---- what the enabled algorithms need of this dataset
const requirementsVisible = ref(false);
const requirements = ref<Api.Forecast.Requirement[]>([]);
const requirementsLoading = ref(false);

async function openRequirements() {
  if (!search.moduleId) return;
  requirementsVisible.value = true;
  requirementsLoading.value = true;
  const { data } = await fetchGetModuleRequirements(search.moduleId);
  requirementsLoading.value = false;
  requirements.value = data || [];
}

const requirementColumns = computed<any[]>(() => [
  { title: t('page.forecast.algorithms.columns.id'), key: 'algorithm_id', width: 150 },
  { title: t('page.forecast.sources.key'), key: 'metric', width: 110 },
  {
    title: t('page.monitoring.datasets.step'),
    key: 'step_seconds',
    width: 80,
    render: (row: Api.Forecast.Requirement) => stepLabel(row.step_seconds)
  },
  {
    title: t('page.monitoring.datasets.requiredSteps'),
    key: 'min_samples',
    width: 130,
    render: (row: Api.Forecast.Requirement) => `${row.min_samples} (${stepLabel(row.required_seconds)})`
  },
  { title: t('page.monitoring.datasets.availableSteps'), key: 'available_steps', width: 110 },
  { title: t('page.monitoring.datasets.horizonSteps'), key: 'horizon_steps', width: 100 },
  {
    title: t('common.status'),
    key: 'ok',
    width: 90,
    render: (row: Api.Forecast.Requirement) =>
      h(NTag, { size: 'small', bordered: false, type: row.ok ? 'success' : 'warning' }, () =>
        t(row.ok ? 'page.monitoring.datasets.enough' : 'page.monitoring.datasets.notEnough')
      )
  },
  { title: t('page.forecast.algorithms.param.description'), key: 'reason', minWidth: 280, ellipsis: { tooltip: true } }
]);

// ---- collect the dataset now
const collecting = ref(false);
const collected = ref<Api.Forecast.CollectResult[] | null>(null);

async function collect() {
  if (!search.moduleId) return;
  collecting.value = true;
  try {
    const { data } = await fetchCollectModule(search.moduleId);
    collected.value = data || [];
    await load();
  } finally {
    collecting.value = false;
  }
}

const collectColumns = computed<any[]>(() => [
  { title: t('page.forecast.sources.key'), key: 'metric', width: 120 },
  { title: t('page.monitoring.datasets.fetched'), key: 'fetched', width: 90 },
  { title: t('page.monitoring.datasets.stored'), key: 'stored', width: 90 },
  {
    title: t('page.monitoring.datasets.missingRatio'),
    key: 'missing',
    width: 110,
    render: (row: Api.Forecast.CollectResult) =>
      row.error ? '-' : `${((row.quality?.missing_ratio ?? 0) * 100).toFixed(1)}%`
  },
  {
    title: t('common.status'),
    key: 'error',
    minWidth: 240,
    render: (row: Api.Forecast.CollectResult) =>
      row.error
        ? h(NTag, { size: 'small', bordered: false, type: 'error' }, () => row.error)
        : h(NTag, { size: 'small', bordered: false, type: 'success' }, () => t('common.success'))
  }
]);

const columnMap: Record<string, any> = {
  name: {
    title: t('page.forecast.sources.name'),
    key: 'name',
    width: 200,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.DatasetSource) => `${row.name} (${row.key})`
  },
  category: {
    title: t('page.monitoring.datasets.category'),
    key: 'category',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) =>
      h(NTag, { size: 'small', bordered: false, type: 'info' }, () => categoryLabel(row.category))
  },
  kind: {
    title: t('page.forecast.sources.kind'),
    key: 'kind',
    width: 150,
    render: (row: Api.Forecast.DatasetSource) => kindLabel(row.kind)
  },
  unit: { title: t('page.monitoring.datasets.unit'), key: 'unit', width: 100, align: 'center' },
  query: {
    title: 'PromQL',
    key: 'query',
    minWidth: 320,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  datasource: {
    title: t('page.datasource.connections.name'),
    key: 'datasource_name',
    width: 140,
    ellipsis: { tooltip: true }
  },
  mapping: {
    title: t('page.forecast.sources.mapping'),
    key: 'mapping_name',
    width: 180,
    ellipsis: { tooltip: true }
  },
  step: {
    title: t('page.monitoring.datasets.step'),
    key: 'step',
    width: 130,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) =>
      row.step_seconds === row.query_step_seconds
        ? stepLabel(row.step_seconds)
        : `${stepLabel(row.query_step_seconds)} → ${stepLabel(row.step_seconds)}`
  },
  aggregation: {
    title: t('page.monitoring.datasets.aggregation'),
    key: 'aggregation',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) => t(`page.monitoring.datasets.aggregation_${row.aggregation}`)
  },
  scale: {
    title: t('page.monitoring.datasets.scale'),
    key: 'scale',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) => `× ${row.scale}`
  },
  precision: {
    title: t('page.monitoring.datasets.precision'),
    key: 'precision',
    width: 90,
    align: 'center'
  },
  missing: {
    title: t('page.monitoring.datasets.missing'),
    key: 'missing',
    width: 130,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) => t(`page.monitoring.datasets.missing_${row.missing}`)
  },
  resource: {
    title: t('page.forecast.sources.resource'),
    key: 'resource',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) => t(`page.forecast.modules.resource_${row.resource}`)
  },
  target: {
    title: t('page.monitoring.datasets.target'),
    key: 'target',
    width: 120,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) =>
      h(NTag, { size: 'small', bordered: false, type: row.basis === 'forecast' ? 'success' : 'default' }, () =>
        t(
          row.basis === 'forecast'
            ? 'page.monitoring.datasets.targetForecast'
            : 'page.monitoring.datasets.targetContext'
        )
      )
  },
  weight: { title: t('page.forecast.sources.weight'), key: 'weight', width: 80, align: 'center' },
  stat: { title: t('page.forecast.sources.stat'), key: 'stat', width: 80, align: 'center' },
  priority: { title: t('page.forecast.modules.priority'), key: 'priority', width: 90, align: 'center' },
  threshold: {
    title: t('page.forecast.sources.threshold'),
    key: 'threshold',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) => (row.threshold > 0 ? row.threshold : '-')
  },
  enabled: {
    title: t('page.datasource.connections.enabled'),
    key: 'enabled',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.DatasetSource) =>
      h(NTag, { type: row.enabled ? 'success' : 'default', bordered: false, size: 'small' }, () =>
        row.enabled ? t('common.enable') : t('common.disable')
      )
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: 150,
    fixed: 'right',
    render: (row: Api.Forecast.DatasetSource) =>
      h(NSpace, { wrap: false }, () => [
        h(NButton, { size: 'small', onClick: () => open(row) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row) },
          {
            trigger: () => h(NButton, { size: 'small', type: 'error' }, () => t('common.delete')),
            default: () => t('page.forecast.sources.deleteConfirm')
          }
        )
      ])
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'monitoring_datasets',
  columnMap,
  defaultKeys: [
    'name',
    'category',
    'query',
    'step',
    'aggregation',
    'unit',
    'scale',
    'missing',
    'target',
    'weight',
    'enabled',
    'actions'
  ]
});

onMounted(async () => {
  cfg.initColumnConfig();
  const [, , options] = await Promise.all([
    loadModules(),
    fetchGetDatasetCatalog().then(({ data }) => (catalog.value = data)),
    fetchGetDatasourceOptions()
  ]);
  datasourceOptions.value = (options.data || []).map(item => ({ label: item.name, value: item.id }));
  const fromRoute = Number(route.query.module_id);
  search.moduleId = modules.value.find(item => item.id === fromRoute)?.id ?? modules.value[0]?.id ?? null;
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="load" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="8" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.monitoring.datasets.category')">
        <NSelect
          v-model:value="search.category"
          clearable
          :options="categoryOptions"
          :placeholder="t('common.selectField', { field: t('page.monitoring.datasets.category') })"
        />
      </NFormItemGi>
      <NFormItemGi :span="5" :label="t('common.keyword')">
        <NInput
          v-model:value="search.keyword"
          clearable
          :placeholder="t('page.monitoring.datasets.keywordPlaceholder')"
        />
      </NFormItemGi>
    </ListSearchCard>

    <NCard v-if="selected" :bordered="false" size="small" class="card-wrapper rounded-16px shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-8px">
        <div class="flex flex-wrap gap-x-32px gap-y-8px">
          <div v-for="item in periodItems" :key="item.label" class="flex-col gap-2px">
            <span class="text-12px opacity-60">{{ item.label }}</span>
            <span class="font-medium">{{ item.value }}</span>
          </div>
        </div>
        <NSpace>
          <NButton size="small" @click="openPeriod">{{ t('page.monitoring.datasets.editPeriod') }}</NButton>
          <NButton size="small" @click="openRequirements">{{ t('page.monitoring.datasets.requirements') }}</NButton>
          <NButton size="small" type="primary" ghost :loading="collecting" @click="collect">
            {{ t('page.monitoring.datasets.collect') }}
          </NButton>
        </NSpace>
      </div>
    </NCard>

    <ListTablePanel
      :title="t('page.monitoring.datasets.title')"
      :help="t('page.monitoring.datasets.help')"
      :cfg="cfg"
      :loading="loading"
      :data="filtered"
      show-add
      :empty-hint="t('page.monitoring.datasets.empty')"
      @add="open()"
      @refresh="load"
    />

    <!-- source -->
    <NModal
      v-model:show="visible"
      preset="card"
      :title="editing ? t('page.monitoring.datasets.editTitle') : t('page.monitoring.datasets.addTitle')"
      class="edit-modal-wide"
    >
      <div class="max-h-70vh overflow-y-auto pr-8px">
        <NForm :model="form" label-placement="top">
          <NFormItem :label="t('page.forecast.sources.name')">
            <NInput
              v-model:value="form.name"
              :placeholder="t('common.inputField', { field: t('page.forecast.sources.name') })"
            />
          </NFormItem>
          <NFormItem :label="t('page.monitoring.datasets.category')">
            <NSelect
              v-model:value="form.category"
              :disabled="Boolean(editing)"
              :options="categoryOptions"
              @update:value="onCategoryChange"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.sources.kind') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.sources.kindHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect
              v-model:value="form.kind"
              :disabled="Boolean(editing)"
              :options="kindOptions"
              :placeholder="t('common.selectField', { field: t('page.forecast.sources.kind') })"
              @update:value="onKindChange"
            />
          </NFormItem>
          <NFormItem v-if="selectedKind" :label="t('page.monitoring.datasets.unit')">
            <NTag size="small" :bordered="false">
              {{ selectedKind.unit_is_not_fixed ? t('page.monitoring.datasets.unitFromQuery') : selectedKind.unit }}
            </NTag>
          </NFormItem>

          <NFormItem v-if="!editing" :label="t('page.monitoring.datasets.queryOrigin')">
            <NRadioGroup v-model:value="origin">
              <NRadioButton value="mapping">{{ t('page.monitoring.datasets.originMapping') }}</NRadioButton>
              <NRadioButton value="custom">{{ t('page.monitoring.datasets.originCustom') }}</NRadioButton>
            </NRadioGroup>
          </NFormItem>
          <NFormItem v-if="origin === 'mapping' || editing" :label="t('page.forecast.sources.mapping')">
            <NSelect
              v-model:value="form.mapping_id"
              filterable
              :options="mappingChoices"
              :placeholder="t('page.forecast.sources.mappingPlaceholder')"
            />
          </NFormItem>
          <template v-else>
            <NFormItem :label="t('page.datasource.connections.name')">
              <NSelect v-model:value="form.custom.datasource_id" filterable :options="datasourceOptions" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  PromQL
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-420px leading-22px">{{ t('page.monitoring.datasets.queryHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInput
                v-model:value="form.custom.query"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 8 }"
                :placeholder="queryExample"
              />
            </NFormItem>
            <NFormItem :label="t('page.monitoring.datasets.level')">
              <NSelect v-model:value="form.custom.level" :options="levelOptions" />
            </NFormItem>
            <NFormItem v-if="selectedKind?.unit_is_not_fixed" :label="t('page.monitoring.datasets.unit')">
              <NInput v-model:value="form.custom.unit" :placeholder="t('page.monitoring.datasets.unitPlaceholder')" />
            </NFormItem>
            <NFormItem :label="t('page.monitoring.datasets.queryStep')">
              <DurationInput
                v-model="form.custom.step_seconds"
                unit="seconds"
                :min="15"
                :max="3600"
                :presets="[60, 300, 900, 3600]"
              />
            </NFormItem>
          </template>

          <div class="mb-6px mt-8px flex items-center gap-6px font-medium">
            {{ t('page.monitoring.datasets.sectionShape') }}
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.monitoring.datasets.shapeHint') }}</div>
            </IconTooltip>
          </div>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.monitoring.datasets.scale') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.monitoring.datasets.scaleHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.scale" :min="0.000000000001" :max="1000000000000" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.monitoring.datasets.precision')">
            <NInputNumber v-model:value="form.precision" :min="0" :max="12" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.monitoring.datasets.aggregation') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.monitoring.datasets.aggregationHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="form.aggregation" :options="aggregationOptions" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.monitoring.datasets.missing') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.monitoring.datasets.missingHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="form.missing" :options="missingOptions" />
          </NFormItem>

          <div class="mb-6px mt-8px flex items-center gap-6px font-medium">
            {{ t('page.monitoring.datasets.sectionRole') }}
          </div>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.sources.resource') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.sources.resourceHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect
              v-model:value="form.resource"
              :disabled="Boolean(form.kind && resourceLocked(form.kind))"
              :options="resourceOptions"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.sources.basis') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.sources.basisHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="form.basis" :options="basisOptions" />
          </NFormItem>
          <NFormItem v-if="form.basis === 'history'" :label="t('page.forecast.sources.windowHours')">
            <NInputNumber v-model:value="form.window_hours" :min="1" :max="4320" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.priority')">
            <NInputNumber v-model:value="form.priority" :min="0" :max="1000" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.sources.weight') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.sources.weightHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.weight" :min="0" :step="0.5" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.sources.stat') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.sources.statHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="form.stat" :options="statOptions" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.sources.threshold') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.sources.thresholdHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.threshold" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.datasource.connections.enabled')">
            <NSwitch v-model:value="form.enabled" />
          </NFormItem>
          <NFormItem :label="t('common.remark')">
            <NInput v-model:value="form.remark" />
          </NFormItem>
        </NForm>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- period -->
    <NModal
      v-model:show="periodVisible"
      preset="card"
      :title="t('page.monitoring.datasets.editPeriod')"
      class="w-640px max-w-90vw"
    >
      <NAlert type="info" :show-icon="false" class="mb-12px">{{ t('page.monitoring.datasets.periodHint') }}</NAlert>
      <NForm :model="periodForm" label-placement="top">
        <NFormItem :label="t('page.monitoring.datasets.step')">
          <DurationInput
            v-model="periodForm.step_seconds"
            unit="seconds"
            :min="15"
            :max="86400"
            :presets="[300, 900, 3600, 86400]"
            :zero-label="t('page.forecast.modules.stepFollowSource')"
          />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.lookbackHours')">
          <DurationInput
            v-model="periodForm.lookback_hours"
            unit="hours"
            :min="1"
            :max="4320"
            :presets="[86400, 604800, 2592000]"
          />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.horizonMinutes')">
          <DurationInput
            v-model="periodForm.horizon_minutes"
            unit="minutes"
            :min="1"
            :max="1440"
            :presets="[300, 900, 3600, 86400]"
          />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.windowSteps')">
          <NInputNumber v-model:value="periodForm.window_steps" :min="0" :max="1000000" :precision="0" class="w-full" />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.minPoints')">
          <NInputNumber v-model:value="periodForm.min_points" :min="0" :max="100000" :precision="0" class="w-full" />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.runInterval')">
          <DurationInput
            v-model="periodForm.run_interval_minutes"
            unit="minutes"
            :min="1"
            :max="43200"
            :presets="[300, 900, 3600, 86400]"
            :zero-label="t('page.forecast.modules.runEveryCycle')"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="periodVisible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="saving" @click="savePeriod">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- requirements -->
    <NModal
      v-model:show="requirementsVisible"
      preset="card"
      :title="t('page.monitoring.datasets.requirements')"
      class="w-1000px max-w-95vw"
    >
      <NAlert type="info" :show-icon="false" class="mb-12px">
        {{ t('page.monitoring.datasets.requirementsHint') }}
      </NAlert>
      <NDataTable
        size="small"
        :loading="requirementsLoading"
        :columns="requirementColumns"
        :data="requirements"
        :scroll-x="980"
        :row-key="(row: Api.Forecast.Requirement) => `${row.algorithm_id}/${row.metric}`"
        max-height="50vh"
      />
    </NModal>

    <!-- collect result -->
    <NModal
      :show="Boolean(collected)"
      preset="card"
      :title="t('page.monitoring.datasets.collectResult')"
      class="w-760px max-w-95vw"
      @update:show="value => !value && (collected = null)"
    >
      <NDataTable
        size="small"
        :columns="collectColumns"
        :data="collected || []"
        :row-key="(row: Api.Forecast.CollectResult) => row.metric"
      />
    </NModal>
  </div>
</template>
