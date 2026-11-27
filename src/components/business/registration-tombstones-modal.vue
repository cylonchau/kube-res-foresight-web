<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NButton, NEmpty, NModal, NPopconfirm, NSpin, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchDeleteRegistrationTombstone, fetchGetRegistrationTombstones } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'RegistrationTombstonesModal' });

/**
 * The modules that registered themselves and were deleted by a person. The workload still carries the label and the operator still reports it; the platform remembers the
 * deletion and does not register it again until a person allows it here.
 */
interface Props {
  show: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{ 'update:show': [value: boolean] }>();
const { t } = useI18n();
const message = useMessage();

const loading = ref(false);
const list = ref<Api.Forecast.RegistrationTombstone[]>([]);
const visible = computed({ get: () => props.show, set: value => emit('update:show', value) });

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchGetRegistrationTombstones();
    list.value = data ?? [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.show,
  shown => {
    if (shown) load();
  }
);

async function allow(row: Api.Forecast.RegistrationTombstone) {
  const { error } = await fetchDeleteRegistrationTombstone(row.id);
  if (error) return;
  message.success(t('page.forecast.modules.tombstonesAllowed'));
  await load();
}
</script>

<template>
  <NModal
    v-model:show="visible"
    preset="card"
    :title="t('page.forecast.modules.tombstonesTitle')"
    class="w-760px max-w-95vw"
  >
    <div class="flex-col gap-10px">
      <div class="text-12px leading-20px opacity-75">{{ t('page.forecast.modules.tombstonesDesc') }}</div>
      <NSpin :show="loading">
        <NEmpty
          v-if="!list.length && !loading"
          :description="t('page.forecast.modules.tombstonesEmpty')"
          class="py-24px"
        />
        <table v-else class="tombstone-table">
          <thead>
            <tr>
              <th>{{ t('page.forecast.modules.tombstoneColumnModule') }}</th>
              <th>{{ t('page.forecast.modules.tombstoneColumnWorkload') }}</th>
              <th>{{ t('page.forecast.modules.tombstoneColumnCluster') }}</th>
              <th>{{ t('page.forecast.modules.tombstoneColumnAt') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in list" :key="row.id">
              <td>{{ row.module_name }}</td>
              <td>{{ row.namespace }}/{{ row.workload }} ({{ row.workload_kind }})</td>
              <td>{{ row.cluster || '-' }}</td>
              <td class="whitespace-nowrap">{{ formatDateTime(row.created_at) }}</td>
              <td class="text-right">
                <NPopconfirm @positive-click="allow(row)">
                  <template #trigger>
                    <NButton size="tiny" secondary>{{ t('page.forecast.modules.tombstonesAllow') }}</NButton>
                  </template>
                  {{ t('page.forecast.modules.tombstonesAllowed') }}
                </NPopconfirm>
              </td>
            </tr>
          </tbody>
        </table>
      </NSpin>
    </div>
  </NModal>
</template>

<style scoped>
.tombstone-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 20px;
}

.tombstone-table th,
.tombstone-table td {
  padding: 4px 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  text-align: left;
  vertical-align: top;
}

.tombstone-table th {
  border-top: 0;
  font-weight: 600;
  opacity: 0.8;
}
</style>
