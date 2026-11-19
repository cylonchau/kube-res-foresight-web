<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NBadge, NButton, NPopover, NProgress, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useStatsStream } from '@/hooks/business/use-stats-stream';
import {
  fetchCancelAssistantAsyncTask,
  fetchListAssistantAsyncTasks,
  fetchRetryAssistantAsyncTask
} from '@/service/api/assistant';
import { isOpenTask } from '@/service/api/async-step';
import { useAuthStore } from '@/store/modules/auth';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'BackgroundTaskTray' });

/**
 * What the user has running in the background (P11 B5): the steps and replays they queued, and their questions to the assistant, with how far each is, why one
 * is waiting for another attempt, and a button to stop or run again. The tasks belong to the platform, so closing a page loses none of them; this is where they
 * are found when the page that queued them is not open. It is there for a user who may ask the assistant (the list of tasks is part of its menu) and only
 * while there is something to show: a task that is running, or one that ended in the last day.
 */
const { t, te } = useI18n();
const authStore = useAuthStore();
const mayList = computed(() => authStore.userInfo.buttons.includes('assistant:chat'));

const tasks = ref<Api.Assistant.AsyncTask<unknown>[]>([]);
const open = computed(() => tasks.value.filter(task => isOpenTask(task)));
const shown = computed(() => mayList.value && tasks.value.length > 0);

async function load() {
  if (!mayList.value) return;
  const { data } = await fetchListAssistantAsyncTasks({ hours: 24 });
  if (data) tasks.value = data;
}

// a change of a task is pushed, and one that is running is also looked at every few seconds, in case the stream is cut
useStatsStream(['async'], load, 400);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  timer = setInterval(() => {
    if (open.value.length) void load();
  }, 5000);
});
onBeforeUnmount(() => clearInterval(timer));
watch(mayList, load);

const statusType = {
  queued: 'default',
  running: 'info',
  cancelling: 'warning',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'default',
  expired: 'default'
} as const;

/** what kind of work it is, in the words of the page it was queued from */
function kindLabel(kind: string) {
  const key = `page.backgroundTasks.kind_${kind.replace(/\./g, '_')}`;
  return te(key) ? t(key) : kind;
}

function stageLabel(task: Api.Assistant.AsyncTask<unknown>) {
  const part = task.partial_result;
  const base = task.stage;
  return part?.total ? `${base} (${part.done}/${part.total})` : base;
}

const busy = ref<number | null>(null);
async function act(task: Api.Assistant.AsyncTask<unknown>, what: 'cancel' | 'retry') {
  busy.value = task.id;
  try {
    if (what === 'cancel') await fetchCancelAssistantAsyncTask(task.id);
    else await fetchRetryAssistantAsyncTask(task.id);
    await load();
  } finally {
    busy.value = null;
  }
}

const canRetry = (task: Api.Assistant.AsyncTask<unknown>) => task.status === 'failed' || task.status === 'cancelled';
</script>

<template>
  <NPopover v-if="shown" trigger="click" placement="bottom-end" :width="420" :show-arrow="false">
    <template #trigger>
      <NBadge :value="open.length" :show="open.length > 0" :offset="[-6, 6]" type="info">
        <ButtonIcon icon="carbon:task-view" :tooltip-content="t('page.backgroundTasks.title')" />
      </NBadge>
    </template>
    <div class="max-h-480px overflow-y-auto">
      <div class="mb-6px text-14px font-medium">{{ t('page.backgroundTasks.title') }}</div>
      <div class="mb-8px text-12px opacity-65">{{ t('page.backgroundTasks.note') }}</div>
      <div v-for="task in tasks" :key="task.id" class="task-row">
        <div class="flex items-center justify-between gap-8px">
          <span class="min-w-0 flex-1 truncate text-13px" :title="task.title">{{ task.title }}</span>
          <NTag size="tiny" :bordered="false" :type="statusType[task.status]">
            {{ t(`page.backgroundTasks.status_${task.status}`) }}
          </NTag>
        </div>
        <div class="mt-2px flex flex-wrap items-center gap-x-8px text-12px opacity-70">
          <span>{{ kindLabel(task.kind) }}</span>
          <span>{{ formatDateTime(task.created_at) }}</span>
          <span v-if="task.attempts > 1">
            {{ t('page.backgroundTasks.attempt', { n: task.attempts, max: task.max_attempts }) }}
          </span>
          <NTag v-if="task.from_cache" size="tiny" :bordered="false">{{ t('page.backgroundTasks.fromCache') }}</NTag>
        </div>
        <template v-if="isOpenTask(task)">
          <NProgress
            type="line"
            :percentage="Math.max(task.progress, 3)"
            :show-indicator="false"
            :processing="task.status === 'running'"
            :height="6"
            class="mt-4px"
          />
          <div class="mt-2px text-12px opacity-75">
            <template v-if="task.status === 'queued' && task.attempts > 0">
              {{ t('page.backgroundTasks.waitingRetry') }}
              <template v-if="task.error">: {{ task.error }}</template>
            </template>
            <template v-else-if="task.status === 'queued'">{{ t('page.backgroundTasks.queued') }}</template>
            <template v-else>{{ stageLabel(task) }}</template>
          </div>
        </template>
        <div v-else-if="task.error" class="mt-2px break-all text-12px text-error">{{ task.error }}</div>
        <div v-if="task.trace_id" class="mt-2px font-mono text-11px opacity-50">{{ task.trace_id }}</div>
        <div class="mt-4px flex justify-end gap-8px">
          <NButton
            v-if="isOpenTask(task)"
            size="tiny"
            secondary
            type="warning"
            :loading="busy === task.id"
            :disabled="task.status === 'cancelling'"
            @click="act(task, 'cancel')"
          >
            {{ t('common.cancel') }}
          </NButton>
          <NButton v-if="canRetry(task)" size="tiny" secondary :loading="busy === task.id" @click="act(task, 'retry')">
            {{ t('page.backgroundTasks.retry') }}
          </NButton>
        </div>
      </div>
    </div>
  </NPopover>
</template>

<style scoped>
.task-row {
  padding: 8px 0;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}
.task-row:first-of-type {
  border-top: 0;
}
</style>
