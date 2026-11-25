<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { NButton, NCard, NSpin, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { fetchAssistantStatus, fetchEnableAiAdvice, fetchGetAiAdvice, fetchRunAiAdvice } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { renderMiniMarkdown } from '@/utils/mini-markdown';
import { looksLikeHtml, sanitizeAnswerHtml } from '@/utils/safe-html';

defineOptions({ name: 'OverprovisionAiAdvice' });

/**
 * The periodic AI advice on the resource dashboard: every day the AI reads the analysis of the dashboard of the modules that most need a look (the tool of the assistant, the
 * same figures the page shows) and writes a short report, which is kept; this block shows the newest report. It is read-only: the AI explains and changes nothing, and the
 * figures are the tool's. A run that failed is shown beside the report of the one before it, so a silent failure is never mistaken for "nothing to say". Switching the advice on
 * and running it now need the AI task permission; seeing the report does not. The block is not shown at all to a user who is not allowed to read it.
 */
const { t, locale } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const advice = ref<Api.Overprovision.AiAdvice | null>(null);
const loading = ref(true);
const unavailable = ref(false);
const open = ref(false);
const busy = ref(false);
const ready = ref<boolean | undefined>(undefined);
const problem = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
let polls = 0;

const running = computed(() => advice.value?.last?.status === 'running');
const report = computed(() => advice.value?.report ?? null);
const failed = computed(() => advice.value?.last?.status === 'failed');
const html = computed(() => {
  const text = report.value?.output ?? '';
  return looksLikeHtml(text) ? sanitizeAnswerHtml(text) : renderMiniMarkdown(text);
});

async function load(silent = false) {
  if (!silent) loading.value = true;
  const { data, error } = await fetchGetAiAdvice();
  if (!data) {
    // a user who may not read it does not see the block; a failed read says so in it
    unavailable.value = Boolean((error as any)?.response?.status === 403 || (error as any)?.response?.status === 404);
  } else {
    advice.value = data;
    unavailable.value = false;
  }
  loading.value = false;
  if (running.value) poll();
}

/** while a run is going the block asks again every few seconds, up to about three minutes */
function poll() {
  if (timer) return;
  polls = 0;
  timer = setInterval(async () => {
    polls += 1;
    await load(true);
    if (!running.value || polls > 45) stop();
  }, 4000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

async function enable() {
  busy.value = true;
  try {
    const { data, error } = await fetchEnableAiAdvice(locale.value === 'en-US' ? 'en' : 'zh');
    if (data) advice.value = data;
    else window.$message?.error((error as any)?.response?.data?.msg || (error as any)?.message || '');
    await runNow();
  } finally {
    busy.value = false;
  }
}

async function runNow() {
  busy.value = true;
  try {
    const { error } = await fetchRunAiAdvice();
    if (error) window.$message?.error((error as any)?.response?.data?.msg || (error as any)?.message || '');
    else window.$message?.success(p('adviceQueued'));
    await load(true);
    // the run is queued: until the first poll sees it running, ask again
    poll();
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  const { data } = await fetchAssistantStatus();
  ready.value = Boolean(data?.enabled && data?.ready);
  problem.value = data?.problem ?? '';
  await load();
});
onBeforeUnmount(stop);
</script>

<template>
  <NCard v-if="!unavailable && !loading" :bordered="false" size="small" class="advice rounded-16px shadow-sm">
    <div class="advice-head">
      <span class="font-medium">{{ p('adviceTitle') }}</span>
      <IconTooltip placement="top">
        <div class="help-pop">{{ p('adviceHelp') }}</div>
      </IconTooltip>
      <NTag v-if="report" size="small" :bordered="false">
        {{ p('adviceReportAt', { at: formatDateTime(report.finished_at || report.started_at) }) }}
      </NTag>
      <NTag v-if="running" size="small" :bordered="false" type="info">
        <NSpin :size="12" class="mr-4px" />
        {{ p('adviceRunning') }}
      </NTag>
      <NTag v-else-if="failed" size="small" :bordered="false" type="warning">{{ p('adviceFailed') }}</NTag>
      <span v-if="advice?.task?.next_run_at" class="advice-note">
        {{ p('adviceNext', { at: formatDateTime(advice.task.next_run_at) }) }}
      </span>
      <span class="advice-actions">
        <NButton v-if="advice?.task" size="tiny" secondary :loading="busy" :disabled="running" @click="runNow">
          {{ p('adviceRunNow') }}
        </NButton>
        <NButton
          v-else
          size="tiny"
          type="primary"
          secondary
          :loading="busy"
          :disabled="ready === false"
          @click="enable"
        >
          {{ p('adviceEnable') }}
        </NButton>
        <NButton v-if="report" size="tiny" quaternary @click="open = !open">
          {{ open ? p('adviceCollapse') : p('adviceExpand') }}
        </NButton>
      </span>
    </div>
    <div v-if="!advice?.task" class="advice-note">
      {{ ready === false ? problem || p('adviceNotReady') : p('adviceNone') }}
    </div>
    <div v-else-if="failed" class="advice-fail">
      {{ p('adviceLastFailed', { at: formatDateTime(advice.last?.started_at), reason: advice.last?.error || '' }) }}
      <template v-if="report">{{ p('adviceShowsBefore') }}</template>
    </div>
    <div v-else-if="!report && !running" class="advice-note">{{ p('adviceNoReport') }}</div>
    <div v-if="report && open" class="advice-body" v-html="html"></div>
  </NCard>
</template>

<style scoped>
.advice-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
}

.advice-actions {
  display: inline-flex;
  gap: 6px;
  margin-left: auto;
}

.advice-note {
  font-size: 12px;
  line-height: 20px;
  opacity: 0.7;
}

.advice-fail {
  margin-top: 4px;
  font-size: 12px;
  line-height: 20px;
  color: var(--n-warning-color, #f0a020);
}

.advice-body {
  max-height: 320px;
  margin-top: 8px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.7;
}

.help-pop {
  max-width: 360px;
}
</style>
