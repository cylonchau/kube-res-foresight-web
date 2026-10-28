<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NInputNumber, NSelect } from 'naive-ui';
import StatusSelect from '@/components/business/status-select.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { $t } from '@/locales';
import {
  fetchCreateModuleSource,
  fetchDeleteModuleSource,
  fetchGetDatasetCatalog,
  fetchGetMetricMappings,
  fetchGetModuleSources,
  fetchUpdateModuleSource
} from '@/service/api';

/**
 * The metrics a module is calculated from, edited in the module form like its fixed periods: a row per metric, each one a
 * metric template (a PromQL written once, see the Metric templates page) with the weight it has among the module's metrics.
 * Nothing is built into a module: a module has exactly the templates added here, the query of each is rendered with the
 * module's own parameters, and a metric that is not here (or is disabled) takes no part in its forecast, score or decision.
 * Rows are saved with the module: removed rows are deleted, changed rows updated, new rows created.
 */
defineOptions({ name: 'ModuleMetrics' });

interface Row {
  /** the id of the source this row is saved as; none for a row that was just added */
  id?: number;
  /** the kind and template the source was saved with, to see what changed */
  savedKind?: string;
  savedMapping?: number;
  savedWeight?: number;
  savedEnabled?: boolean;
  savedName?: string;
  mappingId: number | null;
  weight: number;
  enabled: boolean;
}

/** what the preview needs of a template: the query and how it is shaped */
export interface TemplatePreview {
  datasource_id: number;
  query: string;
  level: string;
  kind: string;
  unit: string;
  step_seconds: number;
}

const emit = defineEmits<{ preview: [template: TemplatePreview] }>();
const rows = ref<Row[]>([]);
const templates = ref<Api.Datasource.MetricMapping[]>([]);
const catalog = ref<Api.Forecast.DatasetCatalog>();
const sourceNames = ref<string[]>([]);

const kindLabel = (kind: string) => $t(`page.datasource.mappings.metric_${kind}` as any, kind);
const templateById = (id: number | null) => templates.value.find(item => item.id === id);

/** the templates grouped by the kind of metric, so a CPU template is not looked for among the JVM ones */
const templateOptions = computed(() => {
  const groups = new Map<string, Array<{ label: string; value: number }>>();
  for (const item of templates.value.filter(entry => entry.enabled)) {
    const list = groups.get(item.metric) || [];
    list.push({ label: `${item.name} · ${item.datasource_name}`, value: item.id });
    groups.set(item.metric, list);
  }
  return [...groups.entries()].map(([kind, children]) => ({
    type: 'group' as const,
    key: kind,
    label: kindLabel(kind),
    children
  }));
});

async function load(moduleId?: number) {
  rows.value = [];
  sourceNames.value = [];
  const [list, cat] = await Promise.all([
    fetchGetMetricMappings({ page: 1, page_size: 200 }),
    catalog.value ? Promise.resolve({ data: catalog.value }) : fetchGetDatasetCatalog()
  ]);
  templates.value = list.data?.list || [];
  if (cat.data) catalog.value = cat.data;
  if (!moduleId) return;
  const { data } = await fetchGetModuleSources(moduleId);
  const sources = data || [];
  sourceNames.value = sources.map(item => item.name);
  rows.value = sources.map(item => ({
    id: item.id,
    savedKind: item.kind,
    savedMapping: item.mapping_id,
    savedWeight: item.weight,
    savedEnabled: item.enabled,
    savedName: item.name,
    mappingId: item.mapping_id,
    weight: item.weight,
    enabled: item.enabled
  }));
}

function add() {
  rows.value.push({ mappingId: null, weight: 1, enabled: true });
}

/** The first problem of the rows, as a message, or an empty string when they can be saved. */
function problem(): string {
  const used = new Set<number>();
  for (const row of rows.value) {
    if (!row.mappingId) return $t('page.forecast.moduleMetrics.templateRequired');
    if (used.has(row.mappingId)) {
      return $t('page.forecast.moduleMetrics.templateDuplicate', {
        name: templateById(row.mappingId)?.name || row.mappingId
      });
    }
    used.add(row.mappingId);
    if (!(row.weight >= 0)) return $t('page.forecast.moduleMetrics.weightInvalid');
  }
  return '';
}

function kindInfo(kind: string) {
  for (const category of catalog.value?.categories || []) {
    const found = category.kinds.find(item => item.kind === kind);
    if (found) return found;
  }
  return undefined;
}

function uniqueName(base: string, taken: Set<string>) {
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base} (${n})`;
  taken.add(name);
  return name;
}

/** Writes the rows to the module; returns false when a request failed. */
async function save(moduleId: number): Promise<boolean> {
  let ok = true;
  const names = new Set(sourceNames.value);
  const kept = new Set(rows.value.filter(row => row.id).map(row => row.id as number));
  // a row whose template is of another kind is a different metric: the old one goes, a new one is made
  const replaced = rows.value.filter(row => row.id && templateById(row.mappingId)?.metric !== row.savedKind);
  const gone = [...(await currentIds(moduleId))].filter(id => !kept.has(id) || replaced.some(row => row.id === id));
  for (const id of gone) {
    const { error } = await fetchDeleteModuleSource(moduleId, id);
    if (error) ok = false;
  }
  for (const [index, row] of rows.value.entries()) {
    const template = templateById(row.mappingId);
    if (!template) continue;
    const isNew = !row.id || replaced.includes(row);
    if (isNew) {
      const info = kindInfo(template.metric);
      const { error } = await fetchCreateModuleSource(moduleId, {
        name: uniqueName(template.name, names),
        kind: template.metric as Api.Forecast.MetricKind,
        resource: info?.resource,
        mapping_id: template.id,
        priority: index,
        weight: row.weight,
        stat: 'p95',
        basis: info?.basis,
        window_hours: info?.basis === 'history' ? 24 : 0,
        enabled: row.enabled,
        scale: 1,
        precision: 6,
        aggregation: 'avg',
        missing: info?.missing
      });
      if (error) ok = false;
    } else if (
      row.savedMapping !== row.mappingId ||
      row.savedWeight !== row.weight ||
      row.savedEnabled !== row.enabled
    ) {
      const { error } = await fetchUpdateModuleSource(moduleId, row.id as number, {
        mapping_id: row.mappingId as number,
        weight: row.weight,
        enabled: row.enabled
      });
      if (error) ok = false;
    }
  }
  return ok;
}

async function currentIds(moduleId: number) {
  const { data } = await fetchGetModuleSources(moduleId);
  return new Set((data || []).map(item => item.id));
}

function preview(row: Row) {
  const template = templateById(row.mappingId);
  if (!template) return;
  emit('preview', {
    datasource_id: template.datasource_id,
    query: template.query,
    level: template.level,
    kind: template.metric,
    unit: template.unit,
    step_seconds: template.step_seconds
  });
}

defineExpose({ load, save, problem });
</script>

<template>
  <div class="module-metrics">
    <div v-if="rows.length" class="metric-grid metric-head">
      <span class="inline-flex items-center gap-4px">
        {{ $t('page.forecast.moduleMetrics.col_template') }}
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-320px leading-22px">{{ $t('page.forecast.moduleMetrics.helpTemplate') }}</div>
        </IconTooltip>
      </span>
      <span class="inline-flex items-center gap-4px">
        {{ $t('page.forecast.moduleMetrics.col_weight') }}
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-320px leading-22px">{{ $t('page.forecast.moduleMetrics.helpWeight') }}</div>
        </IconTooltip>
      </span>
      <span class="inline-flex items-center gap-4px">
        {{ $t('page.forecast.moduleMetrics.col_enabled') }}
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-320px leading-22px">{{ $t('page.forecast.moduleMetrics.helpEnabled') }}</div>
        </IconTooltip>
      </span>
      <span />
      <span />
    </div>
    <div v-for="(row, index) in rows" :key="row.id ?? `new-${index}`" class="metric-grid metric-row">
      <NSelect v-model:value="row.mappingId" filterable size="small" :options="templateOptions" />
      <NInputNumber v-model:value="row.weight" size="small" :min="0" :step="0.5" :show-button="false" />
      <StatusSelect v-model:value="row.enabled" />
      <NButton size="small" :disabled="!row.mappingId" @click="preview(row)">
        {{ $t('page.forecast.moduleMetrics.preview') }}
      </NButton>
      <NButton size="small" quaternary type="error" @click="rows.splice(index, 1)">{{ $t('common.delete') }}</NButton>
    </div>
    <div v-if="!rows.length" class="mb-6px text-12px opacity-70">{{ $t('page.forecast.moduleMetrics.empty') }}</div>
    <NButton size="small" dashed class="mt-6px" @click="add">{{ $t('page.forecast.moduleMetrics.add') }}</NButton>
  </div>
</template>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) 90px 112px 64px 52px;
  gap: 8px;
  align-items: center;
}

.metric-head {
  margin-bottom: 4px;
  color: var(--n-text-color-3, #888);
  font-size: 12px;
}

.metric-row {
  margin-bottom: 6px;
}
</style>
