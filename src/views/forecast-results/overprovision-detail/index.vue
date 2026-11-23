<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NSelect } from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import GrafanaLink from '@/components/business/grafana-link.vue';
import OverprovisionAiAssistant from '@/components/business/overprovision-ai-assistant.vue';
import OverprovisionModulePanel from '@/components/business/overprovision-module-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import HelpLabel from '@/components/common/help-label.vue';
import type { RangeValue } from '@/hooks/business/use-forecast-modules';
import { useOverprovisionAi } from '@/hooks/business/use-overprovision-ai';
import { useRouterPush } from '@/hooks/common/router';
import { fetchGetGrafanaSettings, fetchGetModuleOverprovision } from '@/service/api';
import { useTabStore } from '@/store/modules/tab';
import { buildAnalysisQuestion } from '@/utils/overprovision-ai';
import { DEFAULT_WINDOW_LABEL, rangeOfLabel, windowOf } from '@/utils/overprovision-window';
import { grafanaUrl } from '@/utils/resource-links';

defineOptions({ name: 'ForecastResultsOverprovisionDetail' });

/**
 * The resource dashboard, second level: the analysis of one module, a page of its own that the module list opens (the module is `?module=` in its address, with
 * the window and the basis, so a reload or the back button of the browser lands on the same page). "Back to the list" returns to the first level, which is
 * built again as it was left (its namespace and keyword are kept outside it). Every figure is read from the Prometheus data source of the module's metric
 * mappings, as it is now; nothing comes from what the platform stored and no forecast takes part. The AI helper at the lower right is of this page only, and
 * it asks nothing until the user opens it and presses "analyse".
 */
const { t, locale } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});
const route = useRoute();
const router = useRouter();
const { routerPushByKey } = useRouterPush();
const tabStore = useTabStore();

const moduleId = computed(() => {
  const id = Number(Array.isArray(route.query.module) ? route.query.module[0] : route.query.module);
  return Number.isInteger(id) && id > 0 ? id : 0;
});
const opts = reactive({ basis: (route.query.basis === 'total' ? 'total' : 'pod') as 'pod' | 'total' });
const labelOfRoute = typeof route.query.window === 'string' ? route.query.window : DEFAULT_WINDOW_LABEL;
/** the analysis window, chosen with the same time field as everywhere else: the last N minutes, hours or days, or a fixed range */
const range = ref<RangeValue | null>(rangeOfLabel(labelOfRoute));

const detail = ref<Api.Overprovision.Detail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const ai = useOverprovisionAi();
const grafana = ref<Api.Grafana.Settings | null>(null);

const win = computed(() => windowOf(range.value));
const basisOptions = computed(() => [
  { label: p('basisPod'), value: 'pod' },
  { label: p('basisTotal'), value: 'total' }
]);

function reasonOf(error: unknown) {
  const response = (error as any)?.response;
  return response?.data?.msg || response?.data?.message || (error as any)?.message || '';
}

let detailSeq = 0;
async function loadDetail() {
  const id = moduleId.value;
  detail.value = null;
  detailError.value = '';
  if (!id) {
    detailError.value = p('noModuleChosen');
    return;
  }
  detailSeq += 1;
  const seq = detailSeq;
  detailLoading.value = true;
  try {
    const { data, error } = await fetchGetModuleOverprovision(id, win.value.params);
    if (seq !== detailSeq) return;
    detail.value = data ?? null;
    if (!data) detailError.value = reasonOf(error);
  } finally {
    if (seq === detailSeq) detailLoading.value = false;
  }
}

/** the window (when it is one of the stored labels) and the basis are in the address, so the page can be reloaded or come back to */
function writeAddress() {
  const query: Record<string, string> = { module: String(moduleId.value) };
  if (win.value.grafana.window) query.window = win.value.grafana.window;
  if (opts.basis !== 'pod') query.basis = opts.basis;
  router.replace({ name: route.name as string, query });
}
watch([range, () => opts.basis], writeAddress);
watch(range, loadDetail);
watch(moduleId, () => {
  ai.show(moduleId.value);
  loadDetail();
});

/** back to the list: the first level, as it was left; this page's tab is closed behind it */
async function backToList() {
  await routerPushByKey('forecast-results_overprovision');
  await tabStore.removeTabByRouteName('forecast-results_overprovision-detail');
}

const toolbarGrafana = computed(() =>
  grafanaUrl(
    grafana.value,
    detail.value ? { namespace: detail.value.namespace, workload: detail.value.workload } : {},
    win.value.grafana
  )
);

// ---- the AI analysis: the helper at the lower right asks when the user presses "analyse", the page answers with the figures it shows

const aiLabel = computed(() => win.value.grafana.window ?? p('customRange'));
async function analyzeWithAi() {
  const d = detail.value;
  if (!d || ai.state.running) return;
  const question = buildAnalysisQuestion(d, aiLabel.value, locale.value === 'en-US' ? 'en-US' : 'zh-CN');
  await ai.run(d.module_id, question, locale.value, aiLabel.value, {
    page: 'forecast-results_overprovision-detail',
    title: p('detailPageTitle'),
    module_id: d.module_id,
    namespace: d.namespace,
    workload: d.workload
  });
}

onMounted(() => {
  ai.checkReady();
  ai.show(moduleId.value);
  fetchGetGrafanaSettings().then(({ data }) => {
    grafana.value = data ?? null;
  });
  loadDetail();
});
</script>

<template>
  <div class="h-full flex-col gap-10px overflow-hidden">
    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <!-- every control opens downward from its own left edge and is the same height; the way back is first, the actions are on the right -->
      <div class="filter-bar">
        <NButton size="small" secondary @click="backToList">
          <template #icon><SvgIcon icon="carbon:arrow-left" /></template>
          {{ p('backToList') }}
        </NButton>
        <span class="module-title">{{ detail?.name ?? '' }}</span>
        <span class="filter-item">
          <HelpLabel :label="p('window')" :help="p('windowHelp')" class="filter-help" />
          <span class="w-250px"><TimeRangeField v-model="range" :clearable="false" size="small" /></span>
        </span>
        <span class="filter-item">
          <HelpLabel :label="p('basis')" :help="p('basisHelp')" class="filter-help" />
          <NSelect v-model:value="opts.basis" size="small" class="w-130px" :options="basisOptions" />
        </span>
        <div class="filter-actions">
          <GrafanaLink :url="toolbarGrafana" :label="p('invGrafanaOpen')" />
          <NButton size="small" secondary :loading="detailLoading" @click="loadDetail">{{ p('reload') }}</NButton>
        </div>
      </div>
    </NCard>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
        <OverprovisionModulePanel
          :detail="detail"
          :loading="detailLoading"
          :basis="opts.basis"
          :error="detailError"
          @retry="loadDetail"
        />
      </NCard>
    </div>

    <!-- the AI helper belongs to this page; it asks nothing until the user presses "analyse" -->
    <OverprovisionAiAssistant
      :ai="ai.state"
      :module-name="detail?.name ?? ''"
      :can-analyze="Boolean(detail) && !detailLoading"
      :detail="detail"
      @analyze="analyzeWithAi"
      @stop="ai.stop"
    />
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}
.module-title {
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.filter-help {
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
}
.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
</style>
