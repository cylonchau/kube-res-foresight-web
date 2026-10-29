<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NDatePicker, NInput, NInputNumber, NTag } from 'naive-ui';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import StatusSelect from '@/components/business/status-select.vue';
import { $t } from '@/locales';
import { fetchCreatePeriod, fetchDeletePeriod, fetchGetPeriods, fetchUpdatePeriod } from '@/service/api';
import { fromPickerValue, toPickerValue } from '@/utils/date';

/**
 * The fixed periods of one module, edited inside the module form: a row per period with its window, the values it pins
 * (replicas, CPU, memory) and its priority. Rows are saved with the module: removed rows are deleted, changed rows
 * updated, new rows created. Weekly periods made elsewhere (through the API) are kept as they are and only listed.
 */
const GIB = 1024 ** 3;

interface Row {
  id?: number;
  name: string;
  enabled: boolean;
  range: [number, number] | null;
  replicas: number;
  cores: number;
  memoryGib: number;
  priority: number;
}

const rows = ref<Row[]>([]);
const weekly = ref<Api.Forecast.Period[]>([]);
const original = ref<number[]>([]);

const columns = computed(() => [
  { key: 'name', label: $t('page.forecast.periods.col_name'), help: $t('page.forecast.periods.helpName') },
  { key: 'enabled', label: $t('page.forecast.periods.col_enabled'), help: $t('page.forecast.periods.helpEnabled') },
  { key: 'range', label: $t('page.forecast.periods.col_range'), help: $t('page.forecast.periods.helpRange') },
  { key: 'replicas', label: $t('page.forecast.periods.col_replicas'), help: $t('page.forecast.periods.helpReplicas') },
  { key: 'cores', label: $t('page.forecast.periods.col_cores'), help: $t('page.forecast.periods.helpCores') },
  { key: 'memory', label: $t('page.forecast.periods.col_memory'), help: $t('page.forecast.periods.helpMemory') },
  { key: 'priority', label: $t('page.forecast.periods.col_priority'), help: $t('page.forecast.periods.helpPriority') }
]);

function fromPeriod(p: Api.Forecast.Period): Row {
  return {
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    // the picker holds the wall clock of UTC+8
    range:
      p.abs_start && p.abs_end
        ? [toPickerValue(new Date(p.abs_start).getTime()), toPickerValue(new Date(p.abs_end).getTime())]
        : null,
    replicas: p.replicas,
    cores: p.cpu_milli / 1000,
    memoryGib: p.memory_bytes / GIB,
    priority: p.priority
  };
}

/** Loads the periods of a module (none for a new one). */
async function load(moduleId?: number) {
  rows.value = [];
  weekly.value = [];
  original.value = [];
  if (!moduleId) return;
  const { data } = await fetchGetPeriods(moduleId);
  const list = data || [];
  weekly.value = list.filter(p => !(p.abs_start && p.abs_end));
  rows.value = list.filter(p => p.abs_start && p.abs_end).map(fromPeriod);
  original.value = rows.value.map(r => r.id as number);
}

function add() {
  const hour = 3600 * 1000;
  const start = Math.floor(Date.now() / hour) * hour;
  rows.value.push({
    name: $t('page.forecast.periods.defaultName', { n: rows.value.length + 1 }),
    enabled: true,
    range: [toPickerValue(start), toPickerValue(start + 24 * hour)],
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
    if (!row.range || row.range[1] <= row.range[0]) return $t('page.forecast.periods.rangeInvalid', { name });
    if (!(row.replicas > 0 || row.cores > 0 || row.memoryGib > 0))
      return $t('page.forecast.periods.valueRequired', { name });
  }
  return '';
}

function payload(row: Row): Api.Forecast.PeriodPayload {
  return {
    name: row.name.trim(),
    enabled: row.enabled,
    priority: Math.round(row.priority || 0),
    abs_start: new Date(fromPickerValue((row.range as [number, number])[0])).toISOString(),
    abs_end: new Date(fromPickerValue((row.range as [number, number])[1])).toISOString(),
    replicas: Math.round(row.replicas || 0),
    cpu_milli: Math.round((row.cores || 0) * 1000),
    memory_bytes: Math.round((row.memoryGib || 0) * GIB)
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
      <NDatePicker v-model:value="row.range" type="datetimerange" size="small" :clearable="false" />
      <NInputNumber v-model:value="row.replicas" size="small" :min="0" :precision="0" :show-button="false" />
      <NInputNumber v-model:value="row.cores" size="small" :min="0" :precision="2" :show-button="false" />
      <NInputNumber v-model:value="row.memoryGib" size="small" :min="0" :precision="2" :show-button="false" />
      <NInputNumber v-model:value="row.priority" size="small" :precision="0" :show-button="false" />
      <NButton size="small" quaternary type="error" @click="rows.splice(index, 1)">{{ $t('common.delete') }}</NButton>
    </div>
    <div v-for="item in weekly" :key="item.id" class="period-weekly">
      <NTag size="small" :bordered="false">{{ $t('page.forecast.periods.weeklyKept', { name: item.name }) }}</NTag>
    </div>
    <NButton size="small" dashed class="mt-6px" @click="add">{{ $t('page.forecast.periods.add') }}</NButton>
  </div>
</template>

<style scoped>
.period-grid {
  display: grid;
  grid-template-columns: minmax(110px, 1.2fr) 112px minmax(300px, 2.4fr) 84px 92px 100px 84px 52px;
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

.period-weekly {
  margin-bottom: 4px;
}
</style>
