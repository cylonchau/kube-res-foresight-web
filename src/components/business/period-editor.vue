<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NDatePicker, NInput, NInputNumber, NSelect, NTimePicker } from 'naive-ui';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import StatusSelect from '@/components/business/status-select.vue';
import { $t } from '@/locales';
import { fetchCreatePeriod, fetchDeletePeriod, fetchGetPeriods, fetchUpdatePeriod } from '@/service/api';
import { fromPickerValue, toPickerValue } from '@/utils/date';

/**
 * The time windows of one module, edited inside the module form: a row per window with when it applies (every week on some days between
 * two times of the day, or once between two instants), what it does to the replicas (fixed number / at least / at most) and the CPU and
 * memory it pins. Rows are saved with the module: removed rows are deleted, changed rows updated, new rows created.
 */
const GIB = 1024 ** 3;

type Kind = 'weekly' | 'once';
type Mode = 'fixed' | 'min' | 'max';

interface Row {
  id?: number;
  name: string;
  enabled: boolean;
  kind: Kind;
  /** once: the picker holds the wall clock of UTC+8 */
  range: [number, number] | null;
  /** weekly: the days (0 = Sunday) and the minutes of the day it starts and ends (an end before the start crosses midnight) */
  days: number[];
  startMinute: number;
  endMinute: number;
  mode: Mode;
  replicas: number;
  cores: number;
  memoryGib: number;
  priority: number;
}

const rows = ref<Row[]>([]);
const original = ref<number[]>([]);

const columns = computed(() => [
  { key: 'name', label: $t('page.forecast.periods.col_name'), help: $t('page.forecast.periods.helpName') },
  { key: 'enabled', label: $t('page.forecast.periods.col_enabled'), help: $t('page.forecast.periods.helpEnabled') },
  { key: 'kind', label: $t('page.forecast.periods.col_kind'), help: $t('page.forecast.periods.helpKind') },
  { key: 'range', label: $t('page.forecast.periods.col_range'), help: $t('page.forecast.periods.helpRange') },
  { key: 'mode', label: $t('page.forecast.periods.col_mode'), help: $t('page.forecast.periods.helpMode') },
  { key: 'replicas', label: $t('page.forecast.periods.col_replicas'), help: $t('page.forecast.periods.helpReplicas') },
  { key: 'cores', label: $t('page.forecast.periods.col_cores'), help: $t('page.forecast.periods.helpCores') },
  { key: 'memory', label: $t('page.forecast.periods.col_memory'), help: $t('page.forecast.periods.helpMemory') },
  { key: 'priority', label: $t('page.forecast.periods.col_priority'), help: $t('page.forecast.periods.helpPriority') }
]);

const kindOptions = computed(() => [
  { label: $t('page.forecast.periods.kind_weekly'), value: 'weekly' },
  { label: $t('page.forecast.periods.kind_once'), value: 'once' }
]);
const modeOptions = computed(() => [
  { label: $t('page.forecast.periods.mode_fixed'), value: 'fixed' },
  { label: $t('page.forecast.periods.mode_min'), value: 'min' },
  { label: $t('page.forecast.periods.mode_max'), value: 'max' }
]);
// bit n of the mask is time.Weekday(n): 0 = Sunday; shown from Monday
const dayOptions = computed(() => [
  { label: $t('page.forecast.periods.day_1'), value: 1 },
  { label: $t('page.forecast.periods.day_2'), value: 2 },
  { label: $t('page.forecast.periods.day_3'), value: 3 },
  { label: $t('page.forecast.periods.day_4'), value: 4 },
  { label: $t('page.forecast.periods.day_5'), value: 5 },
  { label: $t('page.forecast.periods.day_6'), value: 6 },
  { label: $t('page.forecast.periods.day_0'), value: 0 }
]);

/** a minute of the day as the timestamp the time picker holds (only its hour and minute count) */
const minuteToPicker = (minute: number) => new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60).getTime();
const pickerToMinute = (value: number | null) => {
  if (value === null) return 0;
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
};

function maskOf(days: number[]) {
  return days.reduce((mask, day) => mask | (1 << day), 0);
}
function daysOf(mask: number) {
  return [0, 1, 2, 3, 4, 5, 6].filter(day => mask & (1 << day));
}

function fromPeriod(p: Api.Forecast.Period): Row {
  const once = Boolean(p.abs_start && p.abs_end);
  return {
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    kind: once ? 'once' : 'weekly',
    range: once
      ? [
          toPickerValue(new Date(p.abs_start as string).getTime()),
          toPickerValue(new Date(p.abs_end as string).getTime())
        ]
      : null,
    days: once ? [0, 1, 2, 3, 4, 5, 6] : daysOf(p.weekdays),
    startMinute: once ? 20 * 60 : p.start_minute,
    endMinute: once ? 3 * 60 : p.end_minute,
    mode: (p.replica_mode as Mode) || 'fixed',
    replicas: p.replicas,
    cores: p.cpu_milli / 1000,
    memoryGib: p.memory_bytes / GIB,
    priority: p.priority
  };
}

/** Loads the periods of a module (none for a new one). */
async function load(moduleId?: number) {
  rows.value = [];
  original.value = [];
  if (!moduleId) return;
  const { data } = await fetchGetPeriods(moduleId);
  rows.value = (data || []).map(fromPeriod);
  original.value = rows.value.map(r => r.id as number);
}

function add() {
  const hour = 3600 * 1000;
  const start = Math.floor(Date.now() / hour) * hour;
  rows.value.push({
    name: $t('page.forecast.periods.defaultName', { n: rows.value.length + 1 }),
    enabled: true,
    kind: 'weekly',
    range: [toPickerValue(start), toPickerValue(start + 24 * hour)],
    days: [0, 1, 2, 3, 4, 5, 6],
    startMinute: 20 * 60,
    endMinute: 3 * 60,
    mode: 'min',
    replicas: 0,
    cores: 0,
    memoryGib: 0,
    priority: 0
  });
}

/** The first problem of the rows, as a message, or an empty string when they can be saved. */
function problem(): string {
  const names = new Set<string>();
  for (const row of rows.value) {
    const name = row.name.trim();
    if (!name) return $t('page.forecast.periods.nameRequired');
    if (names.has(name)) return $t('page.forecast.periods.nameDuplicate', { name });
    names.add(name);
    if (row.kind === 'once') {
      if (!row.range || row.range[1] <= row.range[0]) return $t('page.forecast.periods.rangeInvalid', { name });
    } else {
      if (!row.days.length) return $t('page.forecast.periods.daysRequired', { name });
      if (row.startMinute === row.endMinute) return $t('page.forecast.periods.timeInvalid', { name });
    }
    if (row.mode !== 'fixed' && !(row.replicas > 0)) return $t('page.forecast.periods.modeNeedsReplicas', { name });
    if (!(row.replicas > 0 || row.cores > 0 || row.memoryGib > 0))
      return $t('page.forecast.periods.valueRequired', { name });
  }
  return '';
}

function payload(row: Row): Api.Forecast.PeriodPayload {
  const base = {
    name: row.name.trim(),
    enabled: row.enabled,
    priority: Math.round(row.priority || 0),
    replica_mode: row.mode,
    replicas: Math.round(row.replicas || 0),
    cpu_milli: Math.round((row.cores || 0) * 1000),
    memory_bytes: Math.round((row.memoryGib || 0) * GIB)
  };
  if (row.kind === 'once') {
    return {
      ...base,
      weekdays: 0,
      start_minute: 0,
      end_minute: 0,
      abs_start: new Date(fromPickerValue((row.range as [number, number])[0])).toISOString(),
      abs_end: new Date(fromPickerValue((row.range as [number, number])[1])).toISOString()
    };
  }
  return {
    ...base,
    weekdays: maskOf(row.days),
    start_minute: row.startMinute,
    end_minute: row.endMinute,
    abs_start: null,
    abs_end: null
  };
}

/** Writes the rows to the module; returns false when a request failed. */
async function save(moduleId: number): Promise<boolean> {
  let ok = true;
  const kept = new Set(rows.value.filter(r => r.id).map(r => r.id as number));
  for (const id of original.value) {
    if (!kept.has(id)) {
      const { error } = await fetchDeletePeriod(moduleId, id);
      if (error) ok = false;
    }
  }
  for (const row of rows.value) {
    const { error } = row.id
      ? await fetchUpdatePeriod(moduleId, row.id, payload(row))
      : await fetchCreatePeriod(moduleId, payload(row));
    if (error) ok = false;
  }
  return ok;
}

defineExpose({ load, save, problem });
</script>

<template>
  <div class="period-editor">
    <div v-if="rows.length" class="period-grid period-head">
      <span v-for="col in columns" :key="col.key" class="inline-flex items-center gap-4px">
        {{ col.label }}
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-320px leading-22px">{{ col.help }}</div>
        </IconTooltip>
      </span>
      <span />
    </div>
    <div v-for="(row, index) in rows" :key="row.id ?? `new-${index}`" class="period-grid period-row">
      <NInput v-model:value="row.name" size="small" />
      <StatusSelect v-model:value="row.enabled" />
      <NSelect v-model:value="row.kind" size="small" :options="kindOptions" />
      <NDatePicker
        v-if="row.kind === 'once'"
        v-model:value="row.range"
        type="datetimerange"
        size="small"
        :clearable="false"
      />
      <div v-else class="flex flex-wrap items-center gap-6px">
        <NSelect
          v-model:value="row.days"
          size="small"
          multiple
          :max-tag-count="2"
          :options="dayOptions"
          class="period-days"
        />
        <NTimePicker
          :value="minuteToPicker(row.startMinute)"
          size="small"
          format="HH:mm"
          :clearable="false"
          class="period-time"
          @update:value="(v: number | null) => (row.startMinute = pickerToMinute(v))"
        />
        <span>-</span>
        <NTimePicker
          :value="minuteToPicker(row.endMinute)"
          size="small"
          format="HH:mm"
          :clearable="false"
          class="period-time"
          @update:value="(v: number | null) => (row.endMinute = pickerToMinute(v))"
        />
      </div>
      <NSelect v-model:value="row.mode" size="small" :options="modeOptions" />
      <NInputNumber v-model:value="row.replicas" size="small" :min="0" :precision="0" :show-button="false" />
      <NInputNumber v-model:value="row.cores" size="small" :min="0" :precision="2" :show-button="false" />
      <NInputNumber v-model:value="row.memoryGib" size="small" :min="0" :precision="2" :show-button="false" />
      <NInputNumber v-model:value="row.priority" size="small" :precision="0" :show-button="false" />
      <NButton size="small" quaternary type="error" @click="rows.splice(index, 1)">{{ $t('common.delete') }}</NButton>
    </div>
    <NButton size="small" dashed class="mt-6px" @click="add">{{ $t('page.forecast.periods.add') }}</NButton>
  </div>
</template>

<style scoped>
.period-grid {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) 104px 96px minmax(330px, 2.6fr) 92px 76px 84px 92px 72px 52px;
  gap: 8px;
  align-items: center;
}

.period-head {
  margin-bottom: 4px;
  color: var(--n-text-color-3, #888);
  font-size: 12px;
}

.period-row {
  margin-bottom: 6px;
}

.period-days {
  width: 150px;
}

.period-time {
  width: 84px;
}
</style>
