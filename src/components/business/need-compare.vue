<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { NAlert, NButton, NDataTable, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchUpdateForecastModule } from '@/service/api';
import { formatCpuMilli, formatMemoryBytes } from '@/utils/format';

defineOptions({ name: 'NeedCompare' });

/**
 * What a module needs, read against what it is set to and what runs: the replicas, the CPU and memory of one Pod and the totals, as the
 * forecast needs them (before the minimum and maximum of the module), as they were recommended, and as they run now. When a bound of the
 * module is what holds the recommendation away from the need, it says so and offers to change that bound.
 */
interface Props {
  need: Api.Forecast.NeedDetail;
  /** the module, to change its bounds from here; without it the advice is only read */
  moduleId?: number;
}
const props = withDefaults(defineProps<Props>(), { moduleId: undefined });
const emit = defineEmits<{ applied: [] }>();
const { t } = useI18n();
const message = useMessage();

type Kind = 'count' | 'cpu' | 'memory';
interface Row {
  key: string;
  kind: Kind;
  current: number;
  needed: number;
  recommended: number;
  bound?: string;
  held?: string;
  heldLimit?: number;
  limits: string;
}

const text = (kind: Kind, value: number) => {
  if (!value) return '-';
  if (kind === 'cpu') return formatCpuMilli(value);
  if (kind === 'memory') return formatMemoryBytes(value);
  return String(value);
};
const limitsOf = (kind: Kind, min?: number, max?: number) =>
  min || max ? `${min ? text(kind, min) : '-'} ~ ${max ? text(kind, max) : '-'}` : '-';

const rows = computed<Row[]>(() => {
  const n = props.need;
  return [
    {
      key: 'replicas',
      kind: 'count',
      current: n.replicas.current,
      needed: n.replicas.needed,
      recommended: n.replicas.recommended,
      bound: n.replicas.bound,
      limits: limitsOf('count', n.replicas.min, n.replicas.max)
    },
    {
      key: 'cpu',
      kind: 'cpu',
      current: n.cpu_milli.current,
      needed: n.cpu_milli.needed,
      recommended: n.cpu_milli.recommended,
      bound: n.cpu_milli.bound,
      held: n.cpu_milli.held,
      heldLimit: n.cpu_milli.held_limit,
      limits: limitsOf('cpu', n.cpu_milli.min, n.cpu_milli.max)
    },
    {
      key: 'memory',
      kind: 'memory',
      current: n.memory_bytes.current,
      needed: n.memory_bytes.needed,
      recommended: n.memory_bytes.recommended,
      bound: n.memory_bytes.bound,
      held: n.memory_bytes.held,
      heldLimit: n.memory_bytes.held_limit,
      limits: limitsOf('memory', n.memory_bytes.min, n.memory_bytes.max)
    },
    {
      key: 'totalCpu',
      kind: 'cpu',
      current: n.total.current_cpu_milli,
      needed: n.total.needed_cpu_milli,
      recommended: n.total.recommended_cpu_milli,
      limits: '-'
    },
    {
      key: 'totalMemory',
      kind: 'memory',
      current: n.total.current_memory_bytes,
      needed: n.total.needed_memory_bytes,
      recommended: n.total.recommended_memory_bytes,
      limits: '-'
    }
  ];
});

/** recommended - current, signed; blank when either is not known */
function diffText(row: Row) {
  if (!row.current || !row.recommended) return '-';
  const diff = row.recommended - row.current;
  if (diff === 0) return t('page.forecast.need.same');
  const sign = diff > 0 ? '+' : '-';
  return `${sign}${text(row.kind, Math.abs(diff))} (${sign}${Math.abs(Math.round((diff / row.current) * 100))}%)`;
}

const columns = computed(() => [
  { title: '', key: 'key', width: 120, render: (row: Row) => t(`page.forecast.need.row_${row.key}`) },
  {
    title: t('page.forecast.need.current'),
    key: 'current',
    width: 110,
    render: (row: Row) => text(row.kind, row.current)
  },
  {
    title: t('page.forecast.need.needed'),
    key: 'needed',
    width: 130,
    render: (row: Row) => text(row.kind, row.needed)
  },
  {
    title: t('page.forecast.need.recommended'),
    key: 'recommended',
    width: 150,
    render: (row: Row) => {
      const tags = [];
      if (row.bound) {
        tags.push(
          h(NTag, { size: 'tiny', bordered: false, type: 'warning' }, () => t(`page.forecast.need.bound_${row.bound}`))
        );
      }
      // the Pod spec in force was kept: the recommendation is then not what the forecast needs, and says why
      if (row.held) {
        tags.push(
          h(NTag, { size: 'tiny', bordered: false, type: 'info' }, () =>
            t(`page.forecast.need.held_${row.held}`, { n: row.heldLimit ?? 0 })
          )
        );
      }
      if (!tags.length) return text(row.kind, row.recommended);
      return h('span', [text(row.kind, row.recommended), ...tags.flatMap(tag => [' ', tag])]);
    }
  },
  { title: t('page.forecast.need.diff'), key: 'diff', width: 130, render: (row: Row) => diffText(row) },
  { title: t('page.forecast.need.limits'), key: 'limits', width: 130 }
]);

// ---- the bounds the need says to change
const replicas = computed(() => props.need.replicas);
/** a minimum above the need goes down to the fewest the last day needed (never above the need now); a maximum below it goes up to the most */
const newMin = computed(() => {
  const r = replicas.value;
  const floor = r.suggest_min && r.suggest_min < r.needed ? r.suggest_min : r.needed;
  return Math.max(1, floor);
});
const newMax = computed(() => Math.max(replicas.value.needed, replicas.value.suggest_max ?? 0));
const range = computed(() =>
  replicas.value.suggest_max
    ? { lo: Math.max(1, replicas.value.suggest_min ?? 1), hi: replicas.value.suggest_max }
    : null
);

// ---- the replica need taken apart: the load now, the forecast, the margin put on it
const parts = computed(() => props.need.parts);
const amount = (part: { unit: string; value: number }) => {
  if (part.unit === 'cores') return `${Number(part.value.toFixed(2))} ${t('page.forecast.need.cores')}`;
  if (part.unit === 'bytes') return formatMemoryBytes(part.value);
  return `${Number(part.value.toFixed(1))} rps`;
};
const marginSource = computed(() => {
  const source = parts.value?.margin.source ?? '';
  return t(`page.forecast.need.margin_${source}`, source);
});

const saving = ref(false);
async function apply(payload: Api.Forecast.ModulePayload) {
  if (!props.moduleId) return;
  saving.value = true;
  try {
    const { error } = await fetchUpdateForecastModule(props.moduleId, payload);
    if (!error) {
      message.success(t('page.forecast.need.applied'));
      emit('applied');
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-10px">
    <div class="flex flex-wrap items-center gap-8px text-13px">
      <span class="font-medium">{{ t('page.forecast.need.title') }}</span>
      <NTag v-if="need.algorithm" size="small" :bordered="false" type="success">{{ need.algorithm }}</NTag>
      <NTag v-if="need.basis === 'none'" size="small" :bordered="false" type="warning">
        {{ t('page.forecast.need.noForecast') }}
      </NTag>
    </div>

    <NDataTable size="small" :columns="columns" :data="rows" :row-key="(row: Row) => row.key" :scroll-x="780" />
    <div class="text-12px leading-20px opacity-70">{{ t('page.forecast.need.help') }}</div>

    <!-- the replicas follow three different things; they are never shown as one number -->
    <div v-if="parts" class="flex flex-col gap-6px text-13px">
      <div class="font-medium">{{ t('page.forecast.need.partsTitle') }}</div>
      <div class="flex flex-wrap items-baseline gap-8px">
        <NTag size="small" :bordered="false">{{ t('page.forecast.need.partCurrent') }}</NTag>
        <template v-if="parts.current">
          <span>{{ t(`page.forecast.need.res_${parts.current.resource}`, parts.current.resource) }}</span>
          <span>{{ amount(parts.current) }}</span>
          <span class="opacity-70">
            {{ t('page.forecast.need.partReplicas', { n: parts.current.replicas }) }}
          </span>
          <NTag v-if="parts.current.note === 'other_resource'" size="small" :bordered="false" type="warning">
            {{ t('page.forecast.need.otherResource') }}
          </NTag>
        </template>
        <span v-else class="opacity-70">{{ t('page.forecast.need.noCurrent') }}</span>
      </div>
      <div class="flex flex-wrap items-baseline gap-8px">
        <NTag size="small" :bordered="false" type="info">{{ t('page.forecast.need.partForecast') }}</NTag>
        <span>{{ t(`page.forecast.need.res_${parts.forecast.resource}`, parts.forecast.resource) }}</span>
        <span>{{ amount(parts.forecast) }}</span>
        <span class="opacity-70">
          {{ t('page.forecast.need.partReplicas', { n: parts.forecast.replicas }) }} · {{ parts.forecast.algorithm }}
        </span>
        <NTag v-if="parts.forecast.conservatism" size="small" :bordered="false" type="warning">
          {{ t('page.forecast.need.conservative', { what: parts.forecast.conservatism }) }}
        </NTag>
      </div>
      <div v-if="parts.forecast.conservatism" class="text-12px leading-20px opacity-70">
        {{ t('page.forecast.need.conservativeHelp') }}
      </div>
      <div class="flex flex-wrap items-baseline gap-8px">
        <NTag size="small" :bordered="false" type="success">{{ t('page.forecast.need.partMargin') }}</NTag>
        <span>× {{ parts.margin.factor.toFixed(2) }}</span>
        <span class="opacity-70">
          {{ t('page.forecast.need.partMarginReplicas', { n: parts.margin.replicas, source: marginSource }) }}
        </span>
      </div>
      <div class="text-12px leading-20px opacity-70">
        {{ t('page.forecast.need.partsHelp', { perPod: Number(parts.per_pod.toPrecision(4)) }) }}
      </div>
    </div>

    <NAlert v-if="replicas.advice === 'lower_min'" type="warning" :show-icon="false">
      <div class="flex flex-wrap items-center gap-8px">
        <span>{{ t('page.forecast.need.lowerMin', { min: replicas.min, needed: replicas.needed }) }}</span>
        <NButton v-if="moduleId" size="tiny" type="primary" :loading="saving" @click="apply({ min_replicas: newMin })">
          {{ t('page.forecast.need.setMin', { n: newMin }) }}
        </NButton>
      </div>
    </NAlert>
    <NAlert v-else-if="replicas.advice === 'raise_max'" type="warning" :show-icon="false">
      <div class="flex flex-wrap items-center gap-8px">
        <span>{{ t('page.forecast.need.raiseMax', { max: replicas.max, needed: replicas.needed }) }}</span>
        <NButton v-if="moduleId" size="tiny" type="primary" :loading="saving" @click="apply({ max_replicas: newMax })">
          {{ t('page.forecast.need.setMax', { n: newMax }) }}
        </NButton>
      </div>
    </NAlert>

    <div v-if="range" class="flex flex-wrap items-center gap-8px text-13px">
      <span>{{ t('page.forecast.need.range', { lo: range.lo, hi: range.hi }) }}</span>
      <NButton
        v-if="moduleId"
        size="tiny"
        :loading="saving"
        @click="apply({ min_replicas: range.lo, max_replicas: range.hi })"
      >
        {{ t('page.forecast.need.setBoth', { lo: range.lo, hi: range.hi }) }}
      </NButton>
    </div>
    <div v-if="need.range_note" class="text-12px leading-20px opacity-70">{{ need.range_note }}</div>
  </div>
</template>
