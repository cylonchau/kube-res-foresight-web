<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import {
  NButton,
  NForm,
  NFormItem,
  NFormItemGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import StatusSelect from '@/components/business/status-select.vue';
import QueryTestResult, { type QueryConfig } from '@/components/business/query-test-result.vue';
import HelpLabel from '@/components/common/help-label.vue';
import BatchActions from '@/components/business/batch-actions.vue';
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
import { operateWidth } from '@/utils/operate-width';
import {
  fetchCreateModuleSource,
  fetchDeleteModuleSource,
  fetchGetDatasetCatalog,
  fetchGetMetricMappings,
  fetchGetModuleSources,
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
const stepLabel = (seconds: number) => {
  if (!seconds) return '-';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
};

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

// ---- source form: a metric of the catalog bound to a metric template (the query lives on the Metric templates page)
const visible = ref(false);
const editing = ref<Api.Forecast.DatasetSource>();

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
    missing: 'interpolate' as Api.Forecast.SourceMissing
  };
}
const form = reactive(emptyForm());

const kindsOfCategory = computed(() => catalog.value?.categories.find(item => item.id === form.category)?.kinds || []);
const kindOptions = computed(() =>
  kindsOfCategory.value.map(item => ({ label: kindLabel(item.kind), value: item.kind }))
);
const selectedKind = computed(() => kindsOfCategory.value.find(item => item.kind === form.kind));
/** The templates of the chosen kind of metric: a dataset is one of them, with the role it plays in the module. */
const templates = ref<Api.Datasource.MetricMapping[]>([]);
const templateOptions = computed(() =>
  templates.value
    .filter(item => item.enabled || item.id === form.mapping_id)
    .map(item => ({ label: `${item.name} · ${item.datasource_name}`, value: item.id }))
);
const pickedTemplate = computed(() => templates.value.find(item => item.id === form.mapping_id));

async function loadTemplates(kind: string | null) {
  templates.value = [];
  if (!kind) return;
  const { data } = await fetchGetMetricMappings({ page: 1, page_size: 200, metric: kind });
  templates.value = data?.list || [];
}

/** The query of the template as the module renders it: the test beside it runs exactly this. */
const testConfig = computed<QueryConfig>(() => ({
  datasource_id: pickedTemplate.value?.datasource_id ?? null,
  query: pickedTemplate.value?.query ?? '',
  level: pickedTemplate.value?.level ?? 'workload',
  metric: form.kind || 'custom',
  unit: pickedTemplate.value?.unit ?? '',
  step_seconds: pickedTemplate.value?.step_seconds ?? 60,
  scale: form.scale,
  precision: form.precision
}));

function open(row?: Api.Forecast.DatasetSource) {
  editing.value = row;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      ...row,
      category: row.category,
      mapping_id: row.mapping_id || null,
      window_hours: row.window_hours || 24
    });
    loadTemplates(row.kind);
  } else {
    form.priority = rows.value.length;
    form.kind = kindsOfCategory.value[0]?.kind ?? null;
    if (form.kind) onKindChange(form.kind);
  }
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
  loadTemplates(kind);
}

async function save() {
  const module = selected.value;
  if (!module) return;
  if (!form.name.trim() || !form.kind) {
    message.warning(t('page.forecast.sources.required'));
    return;
  }
  if (!form.mapping_id) {
    message.warning(t('page.forecast.sources.required'));
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
    payload.mapping_id = form.mapping_id;
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

const checkedRowKeys = ref<number[]>([]);
const batchActions = computed(() => [{ key: 'delete', label: t('common.delete'), danger: true }]);

async function runBatch() {
  if (!selected.value) return;
  let done = 0;
  for (const id of checkedRowKeys.value) {
    const { error } = await fetchDeleteModuleSource(selected.value.id, id);
    if (!error) done += 1;
  }
  message.success(t('common.batchDone', { done }));
  checkedRowKeys.value = [];
  await Promise.all([load(), loadModules()]);
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
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
    width: operateWidth([t('common.edit'), t('common.delete')]),
    fixed: 'right',
    render: (row: Api.Forecast.DatasetSource) =>
      h(NSpace, { wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row) },
          {
            trigger: () => h(NButton, { size: 'tiny', type: 'error' }, () => t('common.delete')),
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
    '__selection__',
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
  await Promise.all([loadModules(), fetchGetDatasetCatalog().then(({ data }) => (catalog.value = data))]);
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

    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :row-key="(row: any) => row.id"
      :title="t('page.monitoring.datasets.title')"
      :help="t('page.monitoring.datasets.help')"
      :cfg="cfg"
      :loading="loading"
      :data="filtered"
      show-add
      :empty-hint="t('page.monitoring.datasets.empty')"
      @add="open()"
      @refresh="load"
    >
      <template #suffix>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
      </template>
    </ListTablePanel>

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

          <!-- a dataset is a metric template bound to the module; the query is written on the Metric templates page -->
          <NFormItem class="template-field">
            <template #label>
              <HelpLabel :label="t('page.monitoring.datasets.template')" :help="t('page.formHelp.datasetTemplate')" />
            </template>
            <NSelect
              v-model:value="form.mapping_id"
              filterable
              :options="templateOptions"
              :placeholder="t('page.monitoring.datasets.templatePlaceholder')"
            />
          </NFormItem>
          <div class="query-test-wrap">
            <QueryTestResult :config="testConfig" :module-id="search.moduleId" />
          </div>

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
            <StatusSelect v-model:value="form.enabled" />
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
  </div>
</template>
