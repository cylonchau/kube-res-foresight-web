<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NAlert, NButton, NModal, NSpace, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import OverprovisionApplyTable from '@/components/business/overprovision-apply-table.vue';
import { fetchGetForecastModule, fetchUpdateForecastModule } from '@/service/api';
import { type ApplyField, type ApplyTarget, applyItems, payloadOf } from '@/utils/overprovision-apply';

defineOptions({ name: 'OverprovisionApplyModal' });

/**
 * The recommendations of the resource dashboard of a module put in the module in one step: the Requests of the CPU and the memory, the ratio of their Limits, the replicas. Each goes
 * in the field the person chooses (the usual one first); only the ticked rows are sent. What changes is the module's parameters; the workload in the cluster is not touched.
 */
interface Props {
  show: boolean;
  moduleId: number;
  detail: Api.Overprovision.Detail | null;
}
const props = defineProps<Props>();
const emit = defineEmits<{ 'update:show': [value: boolean]; applied: [] }>();
const { t } = useI18n();
const message = useMessage();

const visible = computed({ get: () => props.show, set: value => emit('update:show', value) });
const items = computed(() => applyItems(props.detail));
const chosen = ref<ApplyTarget[]>([]);
const module = ref<Api.Forecast.Module | null>(null);
const saving = ref(false);

const current = computed(() => {
  const m = module.value;
  const out: Partial<Record<ApplyField, number>> = {};
  if (!m) return out;
  for (const field of [
    'pod_cpu_request_milli',
    'min_cpu_milli',
    'max_cpu_milli',
    'fallback_cpu_milli',
    'pod_memory_request_bytes',
    'min_memory_bytes',
    'max_memory_bytes',
    'fallback_memory_bytes',
    'limit_cpu_ratio',
    'limit_memory_ratio',
    'min_replicas',
    'max_replicas',
    'fallback_replicas'
  ] as const) {
    out[field] = m[field] as number;
  }
  // a fixed count that is switched off holds nothing
  out.fixed_replicas = m.fixed_replicas_enabled ? m.fixed_replicas : 0;
  return out;
});

watch(
  () => props.show,
  async shown => {
    if (!shown) return;
    module.value = null;
    const { data } = await fetchGetForecastModule(props.moduleId);
    module.value = data ?? null;
  }
);

async function apply() {
  if (!chosen.value.length) {
    message.warning(t('page.overprovision.applyNone'));
    return;
  }
  saving.value = true;
  try {
    const { error } = await fetchUpdateForecastModule(
      props.moduleId,
      payloadOf(chosen.value) as Api.Forecast.ModulePayload
    );
    if (error) return;
    message.success(t('page.overprovision.applyDone', { n: chosen.value.length }));
    emit('applied');
    visible.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <NModal v-model:show="visible" preset="card" :title="t('page.overprovision.applyTitle')" class="w-880px max-w-95vw">
    <div class="flex-col gap-10px">
      <div class="text-12px leading-20px opacity-75">{{ t('page.overprovision.applyDesc') }}</div>
      <NAlert v-if="module?.enabled" type="warning" :show-icon="false">
        {{ t('page.overprovision.applyEnabled') }}
      </NAlert>
      <div v-if="!items.length" class="py-16px text-center opacity-70">{{ t('page.overprovision.applyEmpty') }}</div>
      <OverprovisionApplyTable v-else v-model="chosen" :items="items" :current="current" />
      <NSpace justify="end">
        <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="saving" :disabled="!items.length || !chosen.length" @click="apply">
          {{ t('page.overprovision.applyRun', { n: chosen.length }) }}
        </NButton>
      </NSpace>
    </div>
  </NModal>
</template>
