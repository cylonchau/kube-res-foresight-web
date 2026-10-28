<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { NButton, NDataTable, NDescriptions, NDescriptionsItem, NModal, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import RecommendationExplain from '@/components/business/recommendation-explain.vue';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { fetchGetSnapshot, fetchGetSnapshots } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatCpuMilli, formatMemoryBytes } from '@/utils/format';
import { snapshotReasonText } from '@/utils/snapshot-text';
import { operateWidth } from '@/utils/operate-width';

defineOptions({ name: 'SnapshotHistoryModal' });

/**
 * The history of one module's recommendations, opened from the resource recommendation page: the versions it kept, and for one
 * version, in separate parts, which module and version it is, what it recommended, why the version exists, and the configuration
 * and calculation it was made with. There is no page of snapshots of its own.
 */
const props = defineProps<{
  show: boolean;
  moduleId: number | null;
  moduleName: string;
  /** open on the snapshot that covers this recommendation version (an execution names the version it acted on) */
  focusVersion?: number | null;
}>();
const emit = defineEmits<{ 'update:show': [value: boolean] }>();
const { t } = useI18n();

const detail = ref<Api.Forecast.Snapshot | null>(null);
const list = usePagedList<Api.Forecast.Snapshot>(async (page, pageSize) => {
  if (!props.moduleId) return null;
  const { data } = await fetchGetSnapshots({ module_id: props.moduleId, page, page_size: pageSize });
  return data;
});
list.pagination.pageSize = 8;
list.pagination.showSizePicker = false;

watch(
  () => props.show,
  async open => {
    detail.value = null;
    if (!open) return;
    list.search();
    if (props.focusVersion && props.moduleId) {
      // a version that repeats an unchanged recommendation belongs to the snapshot before it
      const { data } = await fetchGetSnapshots({
        module_id: props.moduleId,
        covers_version: props.focusVersion,
        page: 1,
        page_size: 1
      });
      const found = data?.list?.[0];
      if (found) await openDetail(found);
    }
  }
);

/** "load-web 第 300 版推荐": the module and the number of the version in that module, never a bare "V300" */
const snapshotName = (version: number) => t('page.forecast.snapshots.name', { module: props.moduleName, version });

const stateType = (state: Api.Forecast.SnapshotState) =>
  ({ applied: 'success', failed: 'error', pending: 'info', expired: 'default', advisory: 'warning' })[state] as
    | 'success'
    | 'error'
    | 'info'
    | 'default'
    | 'warning';

function whyText(reason: string) {
  const { key, params } = snapshotReasonText(reason);
  return t(`page.forecast.snapshots.${key}`, params);
}

/** what the state rests on, in words: the figures the operator and the admission reported for the span */
function outcomeText(item: Api.Forecast.Snapshot) {
  const o = item.outcome;
  const parts: string[] = [];
  if (o.Applied) parts.push(t('page.forecast.snapshots.outcomeApplied', { applied: o.Applied }));
  if (o.Observed) parts.push(t('page.forecast.snapshots.outcomeObserved', { observed: o.Observed }));
  if (o.Admitted) parts.push(t('page.forecast.snapshots.outcomeAdmitted', { admitted: o.Admitted }));
  if (item.state === 'failed')
    parts.push(t('page.forecast.snapshots.outcomeFailed', { error: o.Error, conflict: o.Conflict }));
  if (o.Held && item.state === 'pending') parts.push(t('page.forecast.snapshots.outcomeHeld', { held: o.Held }));
  if (!parts.length)
    parts.push(t(`page.forecast.snapshots.outcome${item.state[0].toUpperCase()}${item.state.slice(1)}`));
  return parts.join('；');
}

const valueOrOriginal = (set: boolean, text: string) => (set ? text : t('page.forecast.recommendations.keepOriginal'));
const resultText = (row: Api.Forecast.Snapshot) =>
  [
    `${t('page.forecast.modules.replicas')} ${valueOrOriginal(row.replicas_set, String(row.replicas))}`,
    `CPU ${valueOrOriginal(row.cpu_set, formatCpuMilli(row.cpu_milli))}`,
    `${t('page.forecast.recommendations.memory')} ${valueOrOriginal(row.memory_set, formatMemoryBytes(row.memory_bytes))}`
  ].join(' · ');

async function openDetail(row: Api.Forecast.Snapshot) {
  const { data } = await fetchGetSnapshot(row.id);
  detail.value = data ?? null;
}

const columns = computed<DataTableColumns<Api.Forecast.Snapshot>>(() => [
  {
    title: t('page.forecast.snapshots.snapshot'),
    key: 'version',
    width: 190,
    render: row =>
      h('span', [
        snapshotName(row.version),
        row.current
          ? h(NTag, { size: 'small', bordered: false, type: 'info', class: 'ml-6px' }, () =>
              t('page.forecast.snapshots.current')
            )
          : null
      ])
  },
  { title: t('common.createTime'), key: 'created_at', width: 160, render: row => formatDateTime(row.created_at) },
  {
    title: t('page.forecast.snapshots.state'),
    key: 'state',
    width: 90,
    align: 'center',
    render: row =>
      h(NTag, { size: 'small', bordered: false, type: stateType(row.state), title: outcomeText(row) }, () =>
        t(`page.forecast.snapshots.state_${row.state}`)
      )
  },
  {
    title: t('page.forecast.snapshots.why'),
    key: 'snapshot_reason',
    minWidth: 200,
    ellipsis: { tooltip: true },
    render: row => whyText(row.snapshot_reason)
  },
  {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([t('page.forecast.recommendations.explain')]),
    align: 'center',
    render: row =>
      h(NButton, { size: 'tiny', type: 'primary', onClick: () => openDetail(row) }, () =>
        t('page.forecast.recommendations.explain')
      )
  }
]);
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="detail ? snapshotName(detail.version) : `${moduleName} · ${t('page.forecast.snapshots.history')}`"
    class="w-900px max-w-95vw"
    @update:show="value => emit('update:show', value)"
  >
    <div v-if="detail" class="max-h-70vh flex flex-col gap-14px overflow-y-auto pr-8px">
      <NButton size="small" class="self-start" @click="detail = null">
        {{ t('page.forecast.snapshots.backToHistory') }}
      </NButton>

      <section>
        <div class="mb-6px font-medium">{{ t('page.forecast.snapshots.partVersion') }}</div>
        <NDescriptions :column="2" size="small" label-placement="left" bordered>
          <NDescriptionsItem :label="t('page.forecast.modules.name')">{{ moduleName }}</NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.recommendations.version')">
            {{ snapshotName(detail.version) }}
            <NTag v-if="detail.current" size="small" :bordered="false" type="info" class="ml-6px">
              {{ t('page.forecast.snapshots.current') }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('common.createTime')">{{ formatDateTime(detail.created_at) }}</NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.recommendations.validUntil')">
            {{ formatDateTime(detail.valid_until) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.snapshots.state')" :span="2">
            <NTag size="small" :bordered="false" :type="stateType(detail.state)">
              {{ t(`page.forecast.snapshots.state_${detail.state}`) }}
            </NTag>
            <span class="ml-8px">{{ outcomeText(detail) }}</span>
          </NDescriptionsItem>
        </NDescriptions>
      </section>

      <section>
        <div class="mb-6px font-medium">{{ t('page.forecast.snapshots.partResult') }}</div>
        <NDescriptions :column="2" size="small" label-placement="left" bordered>
          <NDescriptionsItem :label="t('page.forecast.snapshots.recommendation')" :span="2">
            {{ resultText(detail) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.recommendations.algorithm')">
            {{ detail.algorithm ? `${detail.algorithm} (${detail.score.toFixed(2)})` : '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.recommendations.specVersion')">
            {{ t('page.forecast.recommendations.specVersionTag', { version: detail.resource_version || 1 }) }}
          </NDescriptionsItem>
        </NDescriptions>
      </section>

      <section>
        <div class="mb-6px font-medium">{{ t('page.forecast.snapshots.partWhy') }}</div>
        <div class="text-13px leading-22px">{{ whyText(detail.snapshot_reason) }}</div>
        <div class="text-13px leading-22px opacity-70">
          {{
            detail.span_end
              ? t('page.forecast.snapshots.span', { from: detail.version, to: detail.span_end - 1 })
              : t('page.forecast.snapshots.spanOpen', { from: detail.version })
          }}
        </div>
        <div v-if="detail.executions?.length" class="mt-6px">
          <div class="mb-4px text-13px font-medium">{{ t('page.forecast.snapshots.executions') }}</div>
          <div v-for="item in detail.executions" :key="item.id" class="text-13px leading-22px">
            {{ formatDateTime(item.created_at) }} ·
            {{ t(`page.forecast.recommendations.result_${item.result}`, item.result) }} · {{ item.current }} →
            {{ item.desired }} · {{ item.reason }}
          </div>
        </div>
      </section>

      <section>
        <div class="mb-6px font-medium">{{ t('page.forecast.snapshots.partConfig') }}</div>
        <RecommendationExplain :detail="detail.detail" />
      </section>
    </div>
    <NDataTable
      v-else
      remote
      size="small"
      :loading="list.loading.value"
      :columns="columns"
      :data="list.rows.value"
      :pagination="list.pagination"
      :row-key="(row: Api.Forecast.Snapshot) => row.id"
      :scroll-x="720"
    />
  </NModal>
</template>
