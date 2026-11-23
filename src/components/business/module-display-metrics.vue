<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NSelect } from 'naive-ui';
import type { TemplatePreview } from '@/components/business/module-metrics.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { $t } from '@/locales';
import {
  fetchCreateModuleSource,
  fetchDeleteModuleSource,
  fetchGetMetricMappings,
  fetchGetModuleSources,
  fetchUpdateModuleSource
} from '@/service/api';

/**
 * The display metrics of a module: the Requests and the Limits of its Pods. They are only shown (the resource dashboard, the history data and the charts), so a
 * metric here has no weight and no algorithm switch and no algorithm reads it. There are four, fixed: for each the module binds one metric template (any CPU or
 * memory template of the right unit, whichever kind it was filed under) and says what its query returns, one Pod or all the replicas together. A role with no
 * template is not shown on the dashboard. Rows are saved with the module like the other metrics: a cleared role is deleted, a changed one updated, a new one created.
 */
defineOptions({ name: 'ModuleDisplayMetrics' });

type Per = Api.Forecast.SourcePer;

interface Role {
  kind: 'k8s_cpu_requests' | 'k8s_cpu_limits' | 'k8s_mem_requests' | 'k8s_mem_limits';
  /** the names the page uses for it */
  label: string;
  tag: string;
  unit: 'cores' | 'bytes';
  /** the id of the source this role is saved as; none when it is not bound yet */
  id?: number;
  savedMapping?: number;
  savedPer?: Per;
  savedPurpose?: string;
  mappingId: number | null;
  per: Per;
}

/** the kinds of template that measure cores, and the ones that measure bytes of memory: what a Requests or Limits source can take (see model.AcceptsMapping) */
const CPU_KINDS = ['cpu', 'k8s_cpu_requests', 'k8s_cpu_limits'];
const MEMORY_KINDS = [
  'memory',
  'k8s_mem_requests',
  'k8s_mem_limits',
  'oom_working_set',
  'jvm_heap_used',
  'jvm_heap_max',
  'jvm_heap_committed',
  'jvm_nonheap_used',
  'jvm_nonheap_committed',
  'jvm_nonheap_max'
];

const emit = defineEmits<{ preview: [template: TemplatePreview] }>();
const roles = ref<Role[]>([]);
const templates = ref<Api.Datasource.MetricMapping[]>([]);

const blank = (): Role[] => [
  {
    kind: 'k8s_cpu_requests',
    label: $t('page.overprovision.cpuRequests'),
    tag: $t('page.overprovision.tagReserved'),
    unit: 'cores',
    mappingId: null,
    per: ''
  },
  {
    kind: 'k8s_cpu_limits',
    label: $t('page.overprovision.cpuLimits'),
    tag: $t('page.overprovision.tagLimit'),
    unit: 'cores',
    mappingId: null,
    per: ''
  },
  {
    kind: 'k8s_mem_requests',
    label: $t('page.overprovision.memRequests'),
    tag: $t('page.overprovision.tagReserved'),
    unit: 'bytes',
    mappingId: null,
    per: ''
  },
  {
    kind: 'k8s_mem_limits',
    label: $t('page.overprovision.memLimits'),
    tag: $t('page.overprovision.tagLimit'),
    unit: 'bytes',
    mappingId: null,
    per: ''
  }
];

const templateById = (id: number | null) => templates.value.find(item => item.id === id);
const optionsOf = (role: Role) =>
  templates.value
    .filter(item => item.enabled && (role.unit === 'cores' ? CPU_KINDS : MEMORY_KINDS).includes(item.metric))
    .map(item => ({ label: `${item.name} · ${item.datasource_name}`, value: item.id }));
const perOptions = computed(() => [
  { label: $t('page.forecast.moduleMetrics.per_default'), value: '' },
  { label: $t('page.forecast.moduleMetrics.per_pod'), value: 'pod' },
  { label: $t('page.forecast.moduleMetrics.per_total'), value: 'total' }
]);

async function load(moduleId?: number) {
  roles.value = blank();
  const list = await fetchGetMetricMappings({ page: 1, page_size: 200 });
  templates.value = list.data?.list || [];
  if (!moduleId) return;
  const { data } = await fetchGetModuleSources(moduleId);
  const all = data || [];
  for (const role of roles.value) {
    const source = all.find(item => item.kind === role.kind);
    if (!source) continue;
    Object.assign(role, {
      id: source.id,
      savedMapping: source.mapping_id,
      savedPer: source.per || '',
      savedPurpose: source.purpose,
      mappingId: source.mapping_id,
      per: source.per || ''
    });
  }
}

/** the first problem of the roles as a message, or an empty string when they can be saved: the module step is checked against the query step like the other metrics */
function problem(stepSeconds = 0): string {
  for (const role of roles.value) {
    const template = templateById(role.mappingId);
    const query = template?.step_seconds || 0;
    if (!template || stepSeconds <= 0 || query <= 0) continue;
    const values = { step: stepSeconds, query, name: template.name };
    if (stepSeconds < query) return $t('page.forecast.moduleMetrics.stepFiner', values);
    if (stepSeconds % query !== 0) return $t('page.forecast.moduleMetrics.stepMultiple', values);
  }
  return '';
}

function uniqueName(base: string, taken: Set<string>) {
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base} (${n})`;
  taken.add(name);
  return name;
}

/** Writes the roles to the module; returns false when a request failed. */
async function save(moduleId: number): Promise<boolean> {
  let ok = true;
  // the names the module has now: the metrics of the other editors were saved (and some deleted) just before this one
  const current = await fetchGetModuleSources(moduleId);
  const names = new Set((current.data || []).map(item => item.name));
  for (const [index, role] of roles.value.entries()) {
    if (role.id && !role.mappingId) {
      const { error } = await fetchDeleteModuleSource(moduleId, role.id);
      if (error) ok = false;
      continue;
    }
    const template = templateById(role.mappingId);
    if (!template) continue;
    if (!role.id) {
      const { error } = await fetchCreateModuleSource(moduleId, {
        name: uniqueName(template.name, names),
        kind: role.kind,
        mapping_id: template.id,
        priority: 50 + index,
        purpose: 'display',
        per: role.per,
        enabled: true
      });
      if (error) ok = false;
    } else if (role.savedMapping !== role.mappingId || role.savedPer !== role.per || role.savedPurpose !== 'display') {
      const { error } = await fetchUpdateModuleSource(moduleId, role.id, {
        mapping_id: role.mappingId as number,
        purpose: 'display',
        per: role.per,
        enabled: true
      });
      if (error) ok = false;
    }
  }
  return ok;
}

function preview(role: Role) {
  const template = templateById(role.mappingId);
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

/** gives a role the template of a row that was moved here from the algorithm metrics */
function bind(kind: string, mappingId: number) {
  const role = roles.value.find(item => item.kind === kind);
  if (!role) return;
  role.mappingId = mappingId;
  role.per = '';
}

defineExpose({ load, save, problem, bind });
</script>

<template>
  <div class="display-metrics">
    <div class="display-grid display-head">
      <span>{{ $t('page.forecast.moduleMetrics.displayCol') }}</span>
      <span class="inline-flex items-center gap-4px">
        {{ $t('page.forecast.moduleMetrics.col_template') }}
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-320px leading-22px">{{ $t('page.forecast.moduleMetrics.helpTemplate') }}</div>
        </IconTooltip>
      </span>
      <span class="inline-flex items-center gap-4px">
        {{ $t('page.forecast.moduleMetrics.col_per') }}
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-320px leading-22px">{{ $t('page.forecast.moduleMetrics.helpPer') }}</div>
        </IconTooltip>
      </span>
      <span />
    </div>
    <div v-for="role in roles" :key="role.kind" class="display-grid display-row">
      <span class="font-medium">
        {{ role.label }}
        <span class="font-normal opacity-60">（{{ role.tag }}）</span>
      </span>
      <NSelect
        v-model:value="role.mappingId"
        clearable
        filterable
        size="small"
        :options="optionsOf(role)"
        :placeholder="$t('page.forecast.moduleMetrics.displayEmpty')"
      />
      <NSelect v-model:value="role.per" size="small" :options="perOptions" :disabled="!role.mappingId" />
      <NButton size="small" :disabled="!role.mappingId" @click="preview(role)">
        {{ $t('page.forecast.moduleMetrics.preview') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.display-grid {
  display: grid;
  grid-template-columns: 190px minmax(240px, 2fr) 150px 64px;
  gap: 8px;
  align-items: center;
}

.display-head {
  margin-bottom: 4px;
  color: var(--n-text-color-3, #888);
  font-size: 12px;
}

.display-row {
  margin-bottom: 6px;
}
</style>
