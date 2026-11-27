<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRouterPush } from '@/hooks/common/router';
import { fetchGetModuleRuleDecisions } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores } from '@/utils/format';

defineOptions({ name: 'AssessmentStrip' });

/**
 * The newest Resource Assessment of a module, one line above its live analysis: what the background calculation (the fixed formula of the real use, made every few minutes whether or not
 * anyone has the dashboard open) says, read from the database at once. The live analysis below it asks Prometheus now and is independent of it; this line is there when that read is slow.
 */
const props = defineProps<{ moduleId: number }>();
const { t } = useI18n();
const { routerPushByKey } = useRouterPush();
const r = (key: string, named?: Record<string, unknown>) => t(`page.rule.${key}`, named ?? {});

const latest = ref<Api.Rule.Decision | null>(null);
const loaded = ref(false);

async function load() {
  loaded.value = false;
  latest.value = null;
  if (!props.moduleId) return;
  const { data } = await fetchGetModuleRuleDecisions(props.moduleId, { page: 1, page_size: 1 });
  latest.value = data?.list?.[0] ?? null;
  loaded.value = true;
}
watch(() => props.moduleId, load, { immediate: true });

const dash = '-';
const replicas = computed(() => {
  const d = latest.value;
  if (!d?.replicas_set) return dash;
  const change =
    d.current_replicas && d.replicas_delta ? ` (${d.replicas_delta > 0 ? '+' : ''}${d.replicas_delta})` : '';
  return `${d.current_replicas || dash} → ${d.recommended_replicas}${change}`;
});
const cpu = computed(() => {
  const d = latest.value;
  if (!d?.cpu_set) return dash;
  return `${d.cpu_current_milli ? formatCores(d.cpu_current_milli / 1000, 3) : dash} → ${formatCores(d.cpu_recommended_milli / 1000, 3)}`;
});
const memory = computed(() => {
  const d = latest.value;
  if (!d?.memory_set) return dash;
  return `${d.memory_current_bytes ? formatBytes(d.memory_current_bytes, 2) : dash} → ${formatBytes(d.memory_recommended_bytes, 2)}`;
});
</script>

<template>
  <div v-if="loaded" class="assessment-strip">
    <template v-if="latest">
      <span class="strip-title">{{ r('stripTitle') }}</span>
      <NTag size="small" :bordered="false" :type="latest.certain ? 'success' : 'warning'" :title="latest.caution">
        {{ latest.certain ? r('certain') : r('uncertain') }}
      </NTag>
      <span>{{ r('stripReplicas') }} {{ replicas }}</span>
      <span>{{ r('stripCpu') }} {{ cpu }}</span>
      <span>{{ r('stripMemory') }} {{ memory }}</span>
      <span class="opacity-70">{{ r('stripAt', { at: formatDateTime(latest.checked_at) }) }}</span>
      <NButton size="tiny" type="info" secondary @click="routerPushByKey('forecast-actions_recommendations')">
        {{ r('stripOpen') }}
      </NButton>
    </template>
    <span v-else class="opacity-70">{{ r('stripNone') }}</span>
    <span class="strip-note">{{ r('stripNote') }}</span>
  </div>
</template>

<style scoped>
.assessment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 8px;
  background: rgba(32, 128, 240, 0.06);
}
.strip-title {
  font-weight: 600;
}
.strip-note {
  margin-left: auto;
  opacity: 0.65;
}
</style>
