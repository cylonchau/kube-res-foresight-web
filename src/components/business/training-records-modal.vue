<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { NButton, NDataTable, NModal, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import TrainingRunDetail from '@/components/business/training-run-detail.vue';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { fetchGetTrainingRuns } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { reasonText } from '@/utils/reason';

defineOptions({ name: 'TrainingRecordsModal' });

/**
 * The training records of one algorithm of a module, opened over the page that asks for them: the list of its runs, and a click on a
 * run shows what that run did in the same window. There is no page of training records of its own.
 */
const props = defineProps<{ show: boolean; moduleId: number | null; moduleName: string; algorithmId: string }>();
const emit = defineEmits<{ 'update:show': [value: boolean] }>();
const { t } = useI18n();

const detail = ref<Api.Forecast.TrainingRun | null>(null);
const list = usePagedList<Api.Forecast.TrainingRun>(async (page, pageSize) => {
  if (!props.algorithmId) return null;
  const { data } = await fetchGetTrainingRuns({
    module_id: props.moduleId ?? undefined,
    algorithm_id: props.algorithmId,
    page,
    page_size: pageSize
  });
  return data;
});
list.pagination.pageSize = 8;
list.pagination.showSizePicker = false;

watch(
  () => props.show,
  open => {
    detail.value = null;
    if (open) list.search();
  }
);

const statusType = (status: string) => (status === 'ok' ? 'success' : status === 'failed' ? 'error' : 'warning');
const duration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

const columns = computed<DataTableColumns<Api.Forecast.TrainingRun>>(() => [
  {
    title: t('page.forecast.runs.time'),
    key: 'prediction_time',
    width: 170,
    render: row => formatDateTime(row.prediction_time)
  },
  { title: t('page.forecast.runs.dataset'), key: 'metric', width: 110, ellipsis: { tooltip: true } },
  {
    title: t('common.status'),
    key: 'status',
    width: 90,
    align: 'center',
    render: row =>
      h(NTag, { size: 'small', bordered: false, type: statusType(row.status) }, () =>
        t(`page.forecast.runs.status_${row.status}`)
      )
  },
  { title: t('page.forecast.runs.samples'), key: 'samples', width: 80, align: 'center' },
  {
    title: t('page.forecast.runs.duration'),
    key: 'duration_ms',
    width: 90,
    align: 'center',
    render: row => duration(row.duration_ms)
  },
  {
    title: t('page.forecast.runs.reason'),
    key: 'reason',
    minWidth: 160,
    ellipsis: { tooltip: true },
    render: row => reasonText(row.reason) || '-'
  },
  {
    title: t('common.operate'),
    key: 'operate',
    width: 80,
    align: 'center',
    render: row =>
      h(NButton, { size: 'tiny', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
]);
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="[algorithmId, moduleName, t('page.forecast.runs.title')].filter(Boolean).join(' · ')"
    class="w-860px max-w-95vw"
    @update:show="value => emit('update:show', value)"
  >
    <div v-if="detail" class="max-h-70vh overflow-y-auto">
      <NButton size="small" class="mb-8px" @click="detail = null">{{ t('page.forecast.runs.backToList') }}</NButton>
      <TrainingRunDetail :run="detail" />
    </div>
    <NDataTable
      v-else
      remote
      size="small"
      :loading="list.loading.value"
      :columns="columns"
      :data="list.rows.value"
      :pagination="list.pagination"
      :row-key="(row: Api.Forecast.TrainingRun) => row.id"
      :scroll-x="720"
    />
  </NModal>
</template>
