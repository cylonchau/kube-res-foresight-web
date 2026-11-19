<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { NButton, NDataTable, NModal, NSelect, NSpin, NTable, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import HelpLabel from '@/components/common/help-label.vue';
import OverprovisionChart from '@/components/business/overprovision-chart.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { type RangeValue, lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { fetchGetModuleOverprovision } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatDecimal, formatPercent } from '@/utils/format';

defineOptions({ name: 'OverprovisionDetailModal' });

/**
 * One module's analysis, one resource under the other (no tabs): the figures, the chart with its moving averages, the quantiles of one Pod and
 * of all the Pods, why the result is what it is and the formula with the numbers put into it, the JVM beside the working set, and the stored
 * results of the window. The window can be one of the seven, or a range that is analysed and not stored.
 */
interface Props {
  show: boolean;
  moduleId: number | null;
  /** the window label the list showed (7d ...) */
  window: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{ 'update:show': [value: boolean] }>();
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const WINDOWS = ['15m', '30m', '1h', '1d', '7d', '15d', '30d'];
const windowOptions = computed(() => [
  ...WINDOWS.map(value => ({ label: value, value })),
  { label: p('customRange'), value: 'custom' }
]);
const label = ref('7d');
const range = ref<RangeValue | null>(lastHours(6));
const detail = ref<Api.Overprovision.Detail | null>(null);
const loading = ref(false);

async function load() {
  if (!props.moduleId) return;
  loading.value = true;
  try {
    const params = label.value === 'custom' ? rangeParams(range.value) : { window: label.value };
    const { data } = await fetchGetModuleOverprovision(props.moduleId, params);
    detail.value = data ?? null;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.show, props.moduleId] as const,
  ([visible]) => {
    if (!visible) return;
    label.value = WINDOWS.includes(props.window) ? props.window : '7d';
    detail.value = null;
    load();
  }
);
watch([label, range], () => {
  if (props.show) load();
});

const win = computed(() => detail.value?.windows[0] ?? null);
const results = computed(() =>
  (['cpu', 'memory'] as const)
    .map(resource => ({ resource, result: win.value?.[resource] ?? null }))
    .filter((item): item is { resource: 'cpu' | 'memory'; result: Api.Overprovision.Result } => Boolean(item.result))
);

const fmt = (resource: string, value: number | null | undefined) =>
  resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 3);

const statusType: Record<string, 'default' | 'error' | 'warning' | 'success' | 'info'> = {
  risk: 'error',
  under: 'error',
  over: 'warning',
  limited: 'info',
  ok: 'success',
  unknown: 'default'
};
const levelType: Record<string, 'default' | 'error' | 'warning' | 'success'> = {
  high: 'success',
  medium: 'warning',
  low: 'default'
};
const riskType: Record<string, 'default' | 'error' | 'warning' | 'success'> = {
  high: 'error',
  medium: 'warning',
  low: 'success'
};

function chartOf(resource: string) {
  return detail.value?.charts?.find(chart => chart.resource === resource) ?? null;
}

const ratioText = (r: Api.Overprovision.Result) =>
  p('ratioFormula', {
    request: fmt(r.resource, r.numerator + r.suggested),
    suggested: fmt(r.resource, r.suggested),
    ratio: formatPercent(r.ratio, 1)
  });

const historyColumns = computed(() => [
  {
    title: p('colHistoryAt'),
    key: 'created_at',
    width: 160,
    render: (row: Api.Overprovision.Stored) => formatDateTime(row.created_at)
  },
  {
    title: p('sectionCpu') + ' / ' + p('sectionMemory'),
    key: 'resource',
    width: 90,
    render: (row: Api.Overprovision.Stored) => (row.resource === 'cpu' ? p('sectionCpu') : p('sectionMemory'))
  },
  {
    title: p('request'),
    key: 'request',
    width: 110,
    render: (row: Api.Overprovision.Stored) => fmt(row.resource, row.request)
  },
  {
    title: 'P95',
    key: 'p95',
    width: 110,
    render: (row: Api.Overprovision.Stored) => fmt(row.resource, row.p95)
  },
  {
    title: p('suggested'),
    key: 'suggested',
    width: 110,
    render: (row: Api.Overprovision.Stored) => (row.suggested > 0 ? fmt(row.resource, row.suggested) : '-')
  },
  {
    title: p('ratioLabel'),
    key: 'ratio',
    width: 90,
    render: (row: Api.Overprovision.Stored) => (row.suggested > 0 ? formatPercent(row.ratio, 1) : '-')
  },
  {
    title: p('colHealth'),
    key: 'status',
    width: 100,
    render: (row: Api.Overprovision.Stored) =>
      h(NTag, { size: 'small', bordered: false, type: statusType[row.status] }, () => p(`health_${row.status}`))
  },
  {
    title: p('colConfidence'),
    key: 'confidence',
    width: 90,
    render: (row: Api.Overprovision.Stored) => p(`level_${row.confidence}`)
  }
]);

const historyKey = (row: Api.Overprovision.Stored) => row.id;

const jvmRows = computed(() => {
  const j = detail.value?.jvm;
  if (!j) return [];
  return [
    { key: 'heap_used', label: p('jvmHeapUsed'), usage: j.heap_used },
    { key: 'heap_max', label: p('jvmHeapMax'), usage: j.heap_max },
    { key: 'nonheap_used', label: p('jvmNonHeap'), usage: j.nonheap_used }
  ];
});
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="p('detailTitle', { name: detail?.name ?? '' })"
    class="w-1100px max-w-95vw"
    @update:show="value => emit('update:show', value)"
  >
    <div class="mb-12px flex flex-wrap items-center gap-12px">
      <HelpLabel :label="p('window')" :help="p('windowHelp')" />
      <NSelect v-model:value="label" size="small" class="w-140px" :options="windowOptions" />
      <TimeRangeField v-if="label === 'custom'" v-model="range" :clearable="false" />
    </div>

    <div class="max-h-72vh overflow-y-auto pr-4px">
      <NSpin :show="loading">
        <div class="flex-col gap-16px">
          <div v-if="detail">
            <div class="mb-6px font-medium">{{ p('sectionConfig') }}</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-16px gap-y-8px text-13px">
              <div>
                <div class="opacity-70">{{ p('configWorkload') }}</div>
                <div>{{ detail.namespace }}/{{ detail.workload_kind }}/{{ detail.workload }}</div>
              </div>
              <div>
                <div class="opacity-70">{{ p('configReplicas') }}</div>
                <div>{{ detail.replicas || '-' }}</div>
              </div>
              <div>
                <div class="opacity-70">{{ p('configWindow') }}</div>
                <div>{{ win?.label }} ({{ win?.window_minutes }} min)</div>
              </div>
              <div>
                <div class="opacity-70">{{ p('configAt') }}</div>
                <div>{{ formatDateTime(detail.at) }}</div>
              </div>
              <div>
                <div class="opacity-70">{{ p('configFormula') }}</div>
                <div>{{ results[0]?.result.formula_version || '-' }}</div>
              </div>
            </div>
          </div>

          <div v-if="detail && !results.length" class="opacity-70">{{ p('noData') }}</div>

          <div v-for="item in results" :key="item.resource" class="flex-col gap-8px">
            <div class="flex flex-wrap items-center gap-8px">
              <span class="font-medium">{{ item.resource === 'cpu' ? p('sectionCpu') : p('sectionMemory') }}</span>
              <NTag size="small" :bordered="false" :type="statusType[item.result.status]">
                {{
                  item.result.status === 'over' ? p(`grade_${item.result.grade}`) : p(`health_${item.result.status}`)
                }}
              </NTag>
              <NTag size="small" :bordered="false" :type="levelType[item.result.confidence]">
                <HelpLabel
                  :label="`${p('colConfidence')} ${p(`level_${item.result.confidence}`)}`"
                  :help="p('colConfidenceHelp')"
                />
              </NTag>
              <NTag size="small" :bordered="false" :type="riskType[item.result.risk]">
                <HelpLabel :label="`${p('colRisk')} ${p(`level_${item.result.risk}`)}`" :help="p('colRiskHelp')" />
              </NTag>
            </div>

            <div class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-16px gap-y-8px text-13px">
              <div>
                <div class="opacity-70">{{ p('request') }}</div>
                <div class="text-16px">{{ fmt(item.resource, item.result.request) }}</div>
              </div>
              <div>
                <div class="opacity-70">{{ p('limit') }}</div>
                <div class="text-16px">
                  {{ item.result.limit > 0 ? fmt(item.resource, item.result.limit) : p('limitUnknown') }}
                </div>
              </div>
              <div>
                <div class="opacity-70">{{ p('suggested') }}</div>
                <div class="text-16px">
                  {{ item.result.suggested > 0 ? fmt(item.resource, item.result.suggested) : p('suggestedNone') }}
                </div>
              </div>
              <div v-if="item.result.suggested > 0">
                <div class="opacity-70">{{ p('ratioLabel') }}</div>
                <div class="text-16px">{{ formatPercent(item.result.ratio, 1) }}</div>
                <div class="text-12px opacity-70">{{ ratioText(item.result) }}</div>
              </div>
              <div>
                <div class="opacity-70">{{ p('configCoverage') }}</div>
                <div class="text-16px">{{ formatPercent(item.result.coverage, 0) }}</div>
                <div class="text-12px opacity-70">
                  {{ item.result.usage.points }} / {{ item.result.expected_points }}
                </div>
              </div>
              <div v-if="item.resource === 'cpu'">
                <div class="opacity-70">{{ p('throttle') }}</div>
                <div class="text-16px">{{ formatPercent(item.result.throttle, 1) }}</div>
              </div>
              <div v-else>
                <div class="opacity-70">{{ p('oomKills') }}</div>
                <div class="text-16px">{{ formatDecimal(item.result.oom_kills, 0) }}</div>
              </div>
            </div>

            <div>
              <HelpLabel :label="p('chartUsage')" :help="p('maHelp')" class="text-13px opacity-80" />
              <OverprovisionChart :chart="chartOf(item.resource)" />
            </div>

            <NTable size="small" :bordered="true" :single-line="false" class="text-13px">
              <thead>
                <tr>
                  <th></th>
                  <th>P50</th>
                  <th>P95</th>
                  <th>P99</th>
                  <th>Max</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{{ p('podUsage') }}</td>
                  <td>{{ fmt(item.resource, item.result.usage.p50) }}</td>
                  <td>{{ fmt(item.resource, item.result.usage.p95) }}</td>
                  <td>{{ fmt(item.resource, item.result.usage.p99) }}</td>
                  <td>{{ fmt(item.resource, item.result.usage.max) }}</td>
                </tr>
                <tr v-if="item.result.total">
                  <td>{{ p('totalUsage') }}</td>
                  <td>{{ fmt(item.resource, item.result.total.p50) }}</td>
                  <td>{{ fmt(item.resource, item.result.total.p95) }}</td>
                  <td>{{ fmt(item.resource, item.result.total.p99) }}</td>
                  <td>{{ fmt(item.resource, item.result.total.max) }}</td>
                </tr>
              </tbody>
            </NTable>

            <div class="text-13px">
              <div class="opacity-70">{{ p('reasons') }}</div>
              <ul class="m-0 pl-18px leading-22px">
                <li v-for="reason in item.result.reasons" :key="reason">{{ p(`reason_${reason}`) }}</li>
                <li v-if="!item.result.reasons.length">-</li>
              </ul>
              <div v-if="item.result.formula" class="mt-4px">
                <div class="opacity-70">{{ p('formulaTitle') }}</div>
                <code class="break-all">{{ item.result.formula }}</code>
              </div>
            </div>
          </div>

          <div v-if="detail?.jvm" class="flex-col gap-6px">
            <HelpLabel :label="p('sectionJvm')" :help="p('jvmHelp')" class="font-medium" />
            <NTable size="small" :bordered="true" :single-line="false" class="text-13px">
              <thead>
                <tr>
                  <th></th>
                  <th>P50</th>
                  <th>P95</th>
                  <th>P99</th>
                  <th>Max</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in jvmRows" :key="row.key">
                  <td>{{ row.label }}</td>
                  <template v-if="row.usage">
                    <td>{{ formatBytes(row.usage.p50, 2) }}</td>
                    <td>{{ formatBytes(row.usage.p95, 2) }}</td>
                    <td>{{ formatBytes(row.usage.p99, 2) }}</td>
                    <td>{{ formatBytes(row.usage.max, 2) }}</td>
                  </template>
                  <td v-else colspan="4">-</td>
                </tr>
                <tr>
                  <td>{{ p('jvmWorkingSet') }}</td>
                  <td colspan="4">{{ formatBytes(detail.jvm.working_set_p99, 2) }}</td>
                </tr>
              </tbody>
            </NTable>
            <ul v-if="detail.jvm.hints.length" class="m-0 pl-18px text-13px leading-22px">
              <li v-for="hint in detail.jvm.hints" :key="hint">{{ p(`hint_${hint}`) }}</li>
            </ul>
          </div>

          <div v-if="detail" class="flex-col gap-6px">
            <HelpLabel :label="p('sectionHistory')" :help="p('historyHelp')" class="font-medium" />
            <NDataTable
              v-if="detail.history.length"
              size="small"
              :columns="historyColumns"
              :data="detail.history"
              :row-key="historyKey"
              :max-height="240"
              :scroll-x="780"
            />
            <div v-else class="text-13px opacity-70">{{ p('historyEmpty') }}</div>
          </div>
        </div>
      </NSpin>
    </div>
    <template #footer>
      <div class="flex justify-end">
        <NButton @click="emit('update:show', false)">{{ t('common.close') }}</NButton>
      </div>
    </template>
  </NModal>
</template>
