<script setup lang="ts">
import { ref, watch } from 'vue';
import { NModal, NSpin } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import NeedCompare from '@/components/business/need-compare.vue';
import { fetchModuleNeed } from '@/service/api';
import { reasonText } from '@/utils/reason';

defineOptions({ name: 'ModuleNeedModal' });

/**
 * What a module needs now, asked before it is configured to act: read-only, it works for a module that is disabled or only observes. The
 * bounds can be changed from here when they are what holds the recommendation away from the need.
 */
interface Props {
  moduleId: number | null;
  name?: string;
}
const props = withDefaults(defineProps<Props>(), { name: '' });
const emit = defineEmits<{ close: []; applied: [] }>();
const { t } = useI18n();

const loading = ref(false);
const result = ref<Api.Forecast.ModuleNeed | null>(null);
const failed = ref('');

async function load() {
  if (!props.moduleId) return;
  loading.value = true;
  result.value = null;
  failed.value = '';
  try {
    const { data, error } = await fetchModuleNeed(props.moduleId);
    if (error || !data) failed.value = t('page.forecast.need.failed');
    else result.value = data;
  } finally {
    loading.value = false;
  }
}

function applied() {
  load();
  emit('applied');
}

watch(() => props.moduleId, load);
</script>

<template>
  <NModal
    :show="Boolean(moduleId)"
    preset="card"
    :title="t('page.forecast.need.modalTitle', { name })"
    class="w-900px max-w-95vw"
    @update:show="value => !value && emit('close')"
  >
    <NSpin :show="loading">
      <div class="min-h-160px flex flex-col gap-10px">
        <div v-if="failed" class="text-13px">{{ failed }}</div>
        <template v-if="result">
          <div
            v-if="result.degraded && Object.keys(result.degraded).length"
            class="flex flex-col gap-2px text-13px opacity-80"
          >
            <span v-for="(note, field) in result.degrade_notes || {}" :key="field">
              {{ t(`page.forecast.explain.field_${field}`) }}: {{ reasonText(String(note)) }}
            </span>
          </div>
          <NeedCompare :need="result.need" :module-id="moduleId ?? undefined" @applied="applied" />
        </template>
        <div class="text-12px leading-20px opacity-70">{{ t('page.forecast.need.estimateHelp') }}</div>
      </div>
    </NSpin>
  </NModal>
</template>
