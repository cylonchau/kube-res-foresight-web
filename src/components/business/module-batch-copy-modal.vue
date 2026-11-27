<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NAlert, NButton, NCheckbox, NCheckboxGroup, NModal, NSelect, NSpace, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchBatchCopyModuleConfig, fetchGetForecastModules } from '@/service/api';

defineOptions({ name: 'ModuleBatchCopyModal' });

/**
 * The parameters of one module onto several, in one call. Each target is answered on its own: what was taken and left, or why it was not done (a module that is switched on, and
 * the source itself, are refused). The groups are those of the copy in the form of one module.
 */
interface Props {
  show: boolean;
  /** the modules the parameters go onto */
  targetIds: number[];
}
const props = defineProps<Props>();
const emit = defineEmits<{ 'update:show': [value: boolean]; done: [] }>();
const { t } = useI18n();
const message = useMessage();

const GROUPS = ['replicas', 'data', 'resources', 'predict', 'sources', 'periods'] as const;
const from = ref<number | null>(null);
const groups = ref<string[]>([...GROUPS]);
const options = ref<Array<{ label: string; value: number }>>([]);
const running = ref(false);
const result = ref<Api.Forecast.BatchCopyResult | null>(null);
/** the modules the parameters go onto, as they were when the window was opened: the list the page selected changes behind it when the copy is done */
const targets = ref<number[]>([]);

async function search(keyword = '') {
  const { data } = await fetchGetForecastModules({ page: 1, page_size: 20, keyword: keyword || undefined });
  options.value = (data?.list ?? []).map(item => ({
    label: `${item.name} (${item.namespace}/${item.workload}${item.cluster ? ` · ${item.cluster}` : ''})`,
    value: item.id
  }));
}

watch(
  () => props.show,
  shown => {
    if (!shown) return;
    from.value = null;
    result.value = null;
    targets.value = [...props.targetIds];
    search();
  }
);

const visible = computed({ get: () => props.show, set: value => emit('update:show', value) });

async function run() {
  if (!from.value) {
    message.warning(t('page.forecast.modules.copyPick'));
    return;
  }
  if (!groups.value.length) {
    message.warning(t('page.forecast.modules.copyGroupsNone'));
    return;
  }
  running.value = true;
  try {
    const { data, error } = await fetchBatchCopyModuleConfig({
      from_id: from.value,
      target_ids: targets.value,
      groups: groups.value
    });
    if (error || !data) return;
    result.value = data;
    message.success(t('page.forecast.modules.batchCopyDone', { copied: data.copied, failed: data.failed }));
    emit('done');
  } finally {
    running.value = false;
  }
}

/** a group of the answer as the form names it ("sources (2)" is the sources, two of them) */
function groupText(name: string) {
  const key = name.replace(/\s*\(\d+\)$/, '');
  const count = /\((\d+)\)$/.exec(name)?.[1];
  const label = (GROUPS as readonly string[]).includes(key) ? t(`page.forecast.modules.copyGroup_${key}`) : key;
  return count ? `${label} (${count})` : label;
}

/** what a row says: the groups that were taken and what was left, or the reason the module was refused (why each was left is in the hover) */
function resultText(row: Api.Forecast.BatchCopyRow) {
  if (!row.ok) return row.error || '-';
  const taken = (row.result?.copied ?? []).map(groupText);
  const left = row.result?.skipped ?? [];
  const parts = [t('page.forecast.modules.batchCopyOk', { groups: taken.join('、') || '-' })];
  if (left.length) {
    parts.push(t('page.forecast.modules.batchCopySkipped', { items: left.map(item => item.what).join('、') }));
  }
  return parts.join(' ');
}

function resultHover(row: Api.Forecast.BatchCopyRow) {
  return (row.result?.skipped ?? []).map(item => `${item.what}: ${item.reason}`).join('\n');
}
</script>

<template>
  <NModal
    v-model:show="visible"
    preset="card"
    :title="t('page.forecast.modules.batchCopyTitle', { n: targets.length })"
    class="w-760px max-w-95vw"
  >
    <div class="flex-col gap-10px">
      <div class="text-12px leading-20px opacity-75">{{ t('page.forecast.modules.batchCopyDesc') }}</div>
      <NSelect
        v-model:value="from"
        filterable
        remote
        clearable
        :options="options"
        :placeholder="t('page.forecast.modules.copyPick')"
        @search="search"
      />
      <NCheckboxGroup v-model:value="groups">
        <NSpace>
          <NCheckbox v-for="g in GROUPS" :key="g" :value="g" :label="t(`page.forecast.modules.copyGroup_${g}`)" />
        </NSpace>
      </NCheckboxGroup>
      <div class="text-12px leading-20px opacity-70">{{ t('page.forecast.modules.copyNotCopied') }}</div>
      <div>
        <NButton type="primary" secondary :loading="running" :disabled="!from" @click="run">
          {{ t('page.forecast.modules.batchCopyRun', { n: targets.length }) }}
        </NButton>
      </div>
      <template v-if="result">
        <NAlert :type="result.failed ? 'warning' : 'success'" :show-icon="false">
          {{ t('page.forecast.modules.batchCopyDone', { copied: result.copied, failed: result.failed }) }}
        </NAlert>
        <table class="batch-copy-table">
          <thead>
            <tr>
              <th>{{ t('page.forecast.modules.batchCopyColumnModule') }}</th>
              <th>{{ t('page.forecast.modules.batchCopyColumnResult') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result.results" :key="row.id" :class="{ failed: !row.ok }">
              <td class="whitespace-nowrap">{{ row.name || row.id }}</td>
              <td :title="resultHover(row)">{{ resultText(row) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </NModal>
</template>

<style scoped>
.batch-copy-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 20px;
}

.batch-copy-table th,
.batch-copy-table td {
  padding: 4px 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  text-align: left;
  vertical-align: top;
}

.batch-copy-table th {
  border-top: 0;
  font-weight: 600;
  opacity: 0.8;
}

.batch-copy-table tr.failed td:last-child {
  color: #d03050;
}
</style>
