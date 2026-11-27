<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NInput, NInputNumber, NSelect, NTimePicker } from 'naive-ui';
import StatusSelect from '@/components/business/status-select.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { $t } from '@/locales';
import {
  fetchCreateTrigger,
  fetchDeleteTrigger,
  fetchGetModuleSources,
  fetchGetTriggers,
  fetchUpdateTrigger
} from '@/service/api';

/**
 * The metric triggers of one module, edited inside the module form: each is a rule "when this metric, reduced over the last minutes, stands on the wrong side of a threshold,
 * raise, lower or set the replicas", with the days and hours it is in force and a priority. A rule reads like a sentence (when ... then ...), one block for each, so the row never has to
 * be wider than the form. The triggers are saved with the module; what they do next to the forecast, the periods and the fixed count is written in the section that holds this editor.
 * A trigger reads the metrics the module has, so it can be added once the module is saved and has its metrics.
 */
defineOptions({ name: 'TriggerEditor' });

type Trigger = Api.Forecast.Trigger;
interface Row {
  id?: number;
  name: string;
  enabled: boolean;
  priority: number;
  weight: number;
  metric: string;
  stat: Trigger['stat'];
  window: number;
  operator: Trigger['operator'];
  threshold: number;
  action: Trigger['action'];
  unit: Trigger['unit'];
  amount: number;
  /** the days (0 = Sunday) and the minutes of the day it is in force; no days = always */
  days: number[];
  startMinute: number;
  endMinute: number;
}

const moduleId = ref(0);
const rows = ref<Row[]>([]);
const original = ref<number[]>([]);
const sources = ref<Api.Forecast.DatasetSource[]>([]);

const JVM_HEAP = 'jvm_heap_pressure';
const RULE_GAP = 'rule_replicas_gap';

const metricOptions = computed(() => [
  ...sources.value
    // only a source with history is read by a trigger: the Requests and Limits of the board are shown, never collected
    .filter(item => item.purpose !== 'display' && item.purpose !== 'dashboard')
    .map(item => ({
      label: `${item.name} · ${$t(`page.datasource.mappings.metric_${item.kind}` as any, item.kind)}`,
      value: item.key
    })),
  { label: $t('page.forecast.triggers.jvmHeapPressure'), value: JVM_HEAP },
  { label: $t('page.forecast.triggers.ruleGap'), value: RULE_GAP }
]);
const statOptions = computed(() =>
  (['last', 'avg', 'max', 'min', 'p90', 'p95', 'p99'] as const).map(value => ({
    label: $t(`page.forecast.triggers.stat_${value}`),
    value
  }))
);
const operatorOptions = computed(() =>
  (['gt', 'gte', 'lt', 'lte'] as const).map(value => ({ label: $t(`page.forecast.triggers.op_${value}`), value }))
);
const actionOptions = computed(() =>
  (['scale_up', 'scale_down', 'set'] as const).map(value => ({
    label: $t(`page.forecast.triggers.action_${value}`),
    value
  }))
);
const unitOptions = computed(() =>
  (['replicas', 'percent', 'proportional'] as const).map(value => ({
    label: $t(`page.forecast.triggers.unit_${value}`),
    value
  }))
);
const dayOptions = computed(() =>
  [1, 2, 3, 4, 5, 6, 0].map(value => ({ label: $t(`page.forecast.periods.day_${value}` as any), value }))
);

const unitOf = (row: Row) => {
  if (row.metric === JVM_HEAP) return 'ratio 0-1';
  if (row.metric === RULE_GAP) return $t('page.forecast.triggers.ruleGapUnit');
  return sources.value.find(item => item.key === row.metric)?.unit ?? '';
};

const minuteToPicker = (minute: number) => new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60).getTime();
const pickerToMinute = (value: number | null) => {
  if (value === null) return 0;
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
};
const maskOf = (days: number[]) => days.reduce((mask, day) => mask | (1 << day), 0);
const daysOf = (mask: number) => [0, 1, 2, 3, 4, 5, 6].filter(day => mask & (1 << day));

function fromTrigger(t: Trigger): Row {
  return {
    id: t.id,
    name: t.name,
    enabled: t.enabled,
    priority: t.priority,
    weight: t.weight || 1,
    metric: t.metric,
    stat: t.stat,
    window: t.window_minutes,
    operator: t.operator,
    threshold: t.threshold,
    action: t.action,
    unit: t.unit,
    amount: t.amount,
    days: daysOf(t.weekdays),
    startMinute: t.start_minute,
    endMinute: t.end_minute
  };
}

/** the triggers of a module (none for a new one) and the metrics a trigger can read */
async function load(id?: number) {
  rows.value = [];
  original.value = [];
  sources.value = [];
  moduleId.value = id ?? 0;
  if (!id) return;
  const [list, srcs] = await Promise.all([fetchGetTriggers(id), fetchGetModuleSources(id)]);
  sources.value = srcs.data || [];
  rows.value = (list.data || []).map(fromTrigger);
  original.value = rows.value.map(r => r.id as number);
}

/** after the module is first saved its metrics exist: the editor reads them, so a trigger can be added */
async function refreshSources(id: number) {
  moduleId.value = id;
  const { data } = await fetchGetModuleSources(id);
  sources.value = data || [];
}

function add() {
  rows.value.push({
    name: $t('page.forecast.triggers.defaultName', { n: rows.value.length + 1 }),
    enabled: true,
    priority: 0,
    weight: 1,
    metric: sources.value[0]?.key ?? JVM_HEAP,
    stat: 'avg',
    window: 15,
    operator: 'gt',
    threshold: 0,
    action: 'scale_up',
    unit: 'replicas',
    amount: 1,
    days: [],
    startMinute: 0,
    endMinute: 0
  });
}

function problem(): string {
  const names = new Set<string>();
  for (const row of rows.value) {
    const name = row.name.trim();
    if (!name) return $t('page.forecast.triggers.nameRequired');
    if (names.has(name)) return $t('page.forecast.triggers.nameDuplicate', { name });
    names.add(name);
    if (!row.metric) return $t('page.forecast.triggers.metricRequired', { name });
    if (!(row.window >= 1)) return $t('page.forecast.triggers.windowInvalid', { name });
    if (!(row.amount > 0)) return $t('page.forecast.triggers.amountInvalid', { name });
    if (row.action === 'set' && !Number.isInteger(row.amount)) return $t('page.forecast.triggers.setWhole', { name });
    if (row.action !== 'set' && row.unit === 'proportional') {
      if (!(row.threshold > 0)) return $t('page.forecast.triggers.proportionalThreshold', { name });
      if (!Number.isInteger(row.amount)) return $t('page.forecast.triggers.proportionalWhole', { name });
    }
    if (row.days.length && row.startMinute === row.endMinute && (row.startMinute !== 0 || row.endMinute !== 0))
      return $t('page.forecast.triggers.timeInvalid', { name });
  }
  return '';
}

function payload(row: Row): Api.Forecast.TriggerPayload {
  return {
    name: row.name.trim(),
    enabled: row.enabled,
    priority: Math.round(row.priority || 0),
    weight: row.weight > 0 ? row.weight : 1,
    metric: row.metric,
    stat: row.stat,
    window_minutes: Math.round(row.window),
    operator: row.operator,
    threshold: row.threshold || 0,
    action: row.action,
    unit: row.action === 'set' ? 'replicas' : row.unit,
    amount: row.amount,
    weekdays: maskOf(row.days),
    start_minute: row.days.length ? row.startMinute : 0,
    end_minute: row.days.length ? row.endMinute : 0
  };
}

/** writes the rows to the module; returns false when a request failed */
async function save(id: number): Promise<boolean> {
  let ok = true;
  const kept = new Set(rows.value.filter(r => r.id).map(r => r.id as number));
  for (const old of original.value) {
    if (!kept.has(old)) {
      const { error } = await fetchDeleteTrigger(id, old);
      if (error) ok = false;
    }
  }
  for (const row of rows.value) {
    const { error } = row.id
      ? await fetchUpdateTrigger(id, row.id, payload(row))
      : await fetchCreateTrigger(id, payload(row));
    if (error) ok = false;
  }
  return ok;
}

/** the rows as they are, for a copy of the module */
const current = () => rows.value.map(payload);

/** how many triggers are switched on (for the summary of the strategies of the module) */
const summary = () => ({ total: rows.value.filter(row => row.enabled).length });

defineExpose({ load, save, problem, refreshSources, current, summary });
</script>

<template>
  <div class="trigger-editor">
    <div v-if="!moduleId" class="mb-6px text-12px opacity-70">{{ $t('page.forecast.triggers.saveFirst') }}</div>
    <div v-for="(row, index) in rows" :key="row.id ?? `new-${index}`" class="trigger-card">
      <div class="trigger-line">
        <NInput v-model:value="row.name" size="small" class="trigger-name" />
        <StatusSelect v-model:value="row.enabled" />
        <span class="inline-flex items-center gap-4px text-12px opacity-80">
          {{ $t('page.forecast.triggers.priority') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-320px leading-22px">{{ $t('page.forecast.triggers.helpPriority') }}</div>
          </IconTooltip>
        </span>
        <NInputNumber
          v-model:value="row.priority"
          size="small"
          :precision="0"
          :show-button="false"
          class="trigger-num"
        />
        <span class="inline-flex items-center gap-4px text-12px opacity-80">
          {{ $t('page.forecast.triggers.weight') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ $t('page.forecast.triggers.helpWeight') }}</div>
          </IconTooltip>
        </span>
        <NInputNumber v-model:value="row.weight" size="small" :min="0.1" :max="100" :step="0.5" class="trigger-num" />
        <NButton size="small" quaternary type="error" @click="rows.splice(index, 1)">{{ $t('common.delete') }}</NButton>
      </div>
      <div class="trigger-line">
        <span class="trigger-word">{{ $t('page.forecast.triggers.when') }}</span>
        <NSelect v-model:value="row.metric" size="small" filterable :options="metricOptions" class="trigger-metric" />
        <NSelect v-model:value="row.stat" size="small" :options="statOptions" class="trigger-stat" />
        <span class="trigger-word">{{ $t('page.forecast.triggers.over') }}</span>
        <NInputNumber
          v-model:value="row.window"
          size="small"
          :min="1"
          :max="1440"
          :precision="0"
          :show-button="false"
          class="trigger-num"
        />
        <span class="trigger-word">{{ $t('page.forecast.triggers.minutes') }}</span>
        <NSelect v-model:value="row.operator" size="small" :options="operatorOptions" class="trigger-op" />
        <NInputNumber v-model:value="row.threshold" size="small" :show-button="false" class="trigger-threshold" />
        <span class="text-12px opacity-60">{{ unitOf(row) }}</span>
      </div>
      <div class="trigger-line">
        <span class="trigger-word">{{ $t('page.forecast.triggers.thenDo') }}</span>
        <NSelect v-model:value="row.action" size="small" :options="actionOptions" class="trigger-action" />
        <NInputNumber v-model:value="row.amount" size="small" :min="0" :show-button="false" class="trigger-num" />
        <NSelect
          v-if="row.action !== 'set'"
          v-model:value="row.unit"
          size="small"
          :options="unitOptions"
          class="trigger-unit"
        />
        <span v-else class="trigger-word">{{ $t('page.forecast.triggers.replicasWord') }}</span>
        <IconTooltip v-if="row.action !== 'set'" icon="mdi-help-circle" placement="top">
          <div class="max-w-420px leading-22px">{{ $t('page.forecast.triggers.helpUnit') }}</div>
        </IconTooltip>
        <span class="trigger-word">{{ $t('page.forecast.triggers.inForce') }}</span>
        <NSelect
          v-model:value="row.days"
          size="small"
          multiple
          :max-tag-count="2"
          :options="dayOptions"
          :placeholder="$t('page.forecast.triggers.always')"
          clearable
          class="trigger-days"
        />
        <template v-if="row.days.length">
          <NTimePicker
            :value="minuteToPicker(row.startMinute)"
            size="small"
            format="HH:mm"
            :clearable="false"
            class="trigger-time"
            @update:value="(v: number | null) => (row.startMinute = pickerToMinute(v))"
          />
          <span>-</span>
          <NTimePicker
            :value="minuteToPicker(row.endMinute)"
            size="small"
            format="HH:mm"
            :clearable="false"
            class="trigger-time"
            @update:value="(v: number | null) => (row.endMinute = pickerToMinute(v))"
          />
        </template>
      </div>
    </div>
    <div v-if="rows.length > 1" class="vote-note">{{ $t('page.forecast.triggers.voteRule') }}</div>
    <NButton size="small" dashed class="mt-6px" :disabled="!moduleId" @click="add">
      {{ $t('page.forecast.triggers.add') }}
    </NButton>
  </div>
</template>

<style scoped>
.vote-note {
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 20px;
  opacity: 0.75;
}

.trigger-card {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 6px;
}

.trigger-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
}

.trigger-word {
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
}

.trigger-name {
  width: 220px;
}

.trigger-metric {
  width: 260px;
}

.trigger-stat,
.trigger-op,
.trigger-unit {
  width: 110px;
}

.trigger-action {
  width: 120px;
}

.trigger-num {
  width: 84px;
}

.trigger-threshold {
  width: 110px;
}

.trigger-days {
  width: 170px;
}

.trigger-time {
  width: 84px;
}
</style>
