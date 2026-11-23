<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import { NButton, NSpin, NTag, useThemeVars } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { formatDateTime } from '@/utils/date';
import { renderMiniMarkdown } from '@/utils/mini-markdown';
import { hasComparisonTable, missingRecommendations } from '@/utils/overprovision-ai';
import { looksLikeHtml, sanitizeAnswerHtml } from '@/utils/safe-html';

defineOptions({ name: 'OverprovisionAiAssistant' });

/**
 * The AI analysis of the resource dashboard as a helper at the lower right, like a support chat: a round button, and over it a window that opens over the
 * page and closes again, without taking any room of the dashboard. The page shows it for one module only, and nothing is asked until the user opens it and
 * presses "analyse" in the window: the analysis never starts by itself, not when the page opens and not when the button is pressed. It runs in the background of the page: close the window and the button tells
 * when the answer is there (a dot), open it again and the answer is read. The window can be made larger and put back. The answer is HTML (tables), cleaned
 * of everything but tables, lists, emphasis and the level colours before it is shown.
 */
interface Props {
  ai: {
    running: boolean;
    live: string;
    error: string;
    text: string;
    at: string;
    window: string;
    ready?: boolean;
    problem: string;
  };
  /** the name of the module the analysis is of; empty when none is chosen */
  moduleName: string;
  /** the figures of the module are there to ask about */
  canAnalyze: boolean;
  /** the analysis the answer is about: its recommended figures are the platform's, and an answer has to write them as they are */
  detail?: Api.Overprovision.Detail | null;
}
const props = withDefaults(defineProps<Props>(), { detail: null });
const emit = defineEmits<{ analyze: []; stop: [] }>();
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

/**
 * The helper is teleported to the body, so a page the tabs keep alive would leave it on screen over every other page: it shows only while the dashboard page is
 * the active one (a page that is not kept alive is simply unmounted).
 */
const pageActive = ref(true);
onActivated(() => {
  pageActive.value = true;
});
onDeactivated(() => {
  pageActive.value = false;
});

const open = ref(false);
const expanded = ref(false);
/** an answer or a failure arrived while the window was closed */
const unread = ref(false);

const vars = useThemeVars();
const panelColors = computed(() => ({ background: vars.value.modalColor, color: vars.value.textColor2 }));
const fabColors = computed(() => ({
  background: vars.value.primaryColor,
  color: '#fff',
  '--fab-ring': vars.value.primaryColor
}));

watch(
  () => [props.ai.running, props.ai.text, props.ai.error] as const,
  ([running, text, error], [wasRunning]) => {
    if (!open.value && wasRunning && !running && (text || error)) unread.value = true;
  }
);
watch(open, value => {
  if (value) unread.value = false;
});
// a module that was just chosen shows its own (kept) analysis and nothing is "new" about it
watch(
  () => props.moduleName,
  () => {
    unread.value = false;
  }
);

const html = computed(() => {
  const source = props.ai.running ? props.ai.live : props.ai.text;
  return looksLikeHtml(source) ? sanitizeAnswerHtml(source) : renderMiniMarkdown(source);
});
const blocked = computed(() => props.ai.ready === false);
const disabledReason = computed(() => {
  if (blocked.value) return props.ai.problem || p('aiNotReady');
  if (!props.moduleName) return p('aiPickModule');
  if (!props.canAnalyze) return p('aiNoFigures');
  return '';
});

/** the button of the page only opens and closes the window: the analysis starts when the user presses "analyse" in it, never by itself */
function pressButton() {
  open.value = !open.value;
}

/** the answer has to hold the comparison of the four configurations; one that does not says so and can be asked again */
const lacksComparison = computed(
  () => !props.ai.running && Boolean(props.ai.text) && !props.ai.error && !hasComparisonTable(props.ai.text)
);

/** the rows whose recommended figures the answer did not write as the platform worked them out */
const mismatched = computed(() =>
  !props.ai.running && props.ai.text && !props.ai.error && props.detail && !lacksComparison.value
    ? missingRecommendations(props.ai.text, props.detail)
    : []
);
</script>

<template>
  <Teleport to="body">
    <div v-if="pageActive" class="ai-fab-root">
      <Transition name="ai-window">
        <section
          v-show="open"
          class="ai-window"
          :class="{ 'is-expanded': expanded }"
          :style="panelColors"
          role="dialog"
          :aria-label="p('aiTitle')"
        >
          <header class="ai-window-header">
            <span class="inline-flex min-w-0 items-center gap-8px">
              <span class="font-medium">{{ p('aiTitle') }}</span>
              <NTag v-if="moduleName" size="small" :bordered="false" type="info" class="max-w-180px">
                <span class="truncate">{{ moduleName }}</span>
              </NTag>
            </span>
            <span class="inline-flex shrink-0 items-center gap-4px">
              <NButton size="tiny" quaternary @click="expanded = !expanded">
                {{ expanded ? p('aiRestore') : p('aiExpand') }}
              </NButton>
              <NButton size="tiny" quaternary @click="open = false">{{ p('aiCollapse') }}</NButton>
            </span>
          </header>

          <div class="ai-window-body">
            <div v-if="ai.running" class="mb-6px flex items-center gap-6px text-12px opacity-70">
              <NSpin :size="14" />
              {{ p('aiRunning') }}
            </div>
            <div v-else-if="ai.at && !ai.error" class="mb-6px text-12px opacity-70">
              {{ formatDateTime(ai.at) }} · {{ ai.window }}
            </div>
            <div v-if="lacksComparison" class="mb-6px text-12px text-[#c77d0a]">{{ p('aiNoComparison') }}</div>
            <div v-else-if="mismatched.length" class="mb-6px text-12px text-[#c77d0a]">
              {{ p('aiRecMismatch', { list: mismatched.join(', ') }) }}
            </div>
            <div v-if="ai.error" class="text-13px text-[#d03050]">{{ ai.error }}</div>
            <!-- eslint-disable-next-line vue/no-v-html -- escaped first: see utils/mini-markdown -->
            <div v-else-if="ai.running || ai.text" class="ai-answer text-13px leading-22px" v-html="html"></div>
            <div v-else class="ai-empty">
              <div class="text-13px opacity-80">{{ p('aiEmpty') }}</div>
              <div v-if="disabledReason" class="mt-6px text-12px opacity-70">{{ disabledReason }}</div>
            </div>
          </div>

          <footer class="ai-window-footer">
            <span class="min-w-0 truncate text-12px opacity-60" :title="disabledReason">
              {{ !ai.running && ai.text && disabledReason ? disabledReason : '' }}
            </span>
            <span class="inline-flex shrink-0 items-center gap-8px">
              <NButton v-if="ai.running" size="small" @click="emit('stop')">{{ t('common.cancel') }}</NButton>
              <NButton
                size="small"
                type="primary"
                :loading="ai.running"
                :disabled="Boolean(disabledReason)"
                :title="disabledReason"
                @click="emit('analyze')"
              >
                {{ ai.text || ai.error ? p('aiAgain') : p('aiStart') }}
              </NButton>
            </span>
          </footer>
        </section>
      </Transition>

      <button
        type="button"
        class="ai-fab"
        :class="{ 'is-open': open, 'is-running': ai.running }"
        :style="fabColors"
        :aria-label="p('aiTitle')"
        :title="p('aiTitle')"
        @click="pressButton"
      >
        <SvgIcon icon="carbon:bot" class="text-26px" />
        <span v-if="unread && !open" class="ai-fab-dot" />
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.ai-fab-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1900;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  pointer-events: none;
}
.ai-fab-root > * {
  pointer-events: auto;
}
.ai-fab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 0;
  border-radius: 50%;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.ai-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.26);
}
.ai-fab.is-running::after {
  content: '';
  position: absolute;
  inset: -4px;
  border: 2px solid transparent;
  border-top-color: var(--fab-ring);
  border-radius: 50%;
  animation: ai-spin 1s linear infinite;
}
.ai-fab-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #d03050;
}
@keyframes ai-spin {
  to {
    transform: rotate(360deg);
  }
}
.ai-window {
  display: flex;
  flex-direction: column;
  width: min(420px, calc(100vw - 32px));
  height: min(520px, calc(100vh - 150px));
  overflow: hidden;
  border-radius: 12px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(128, 128, 128, 0.2);
}
.ai-window.is-expanded {
  width: min(760px, calc(100vw - 32px));
  height: min(760px, calc(100vh - 110px));
}
.ai-window-header,
.ai-window-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
}
.ai-window-header {
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}
.ai-window-footer {
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}
.ai-window-body {
  flex: 1;
  min-height: 0;
  padding: 10px 14px;
  overflow-y: auto;
}
.ai-answer :deep(p),
.ai-answer :deep(ul),
.ai-answer :deep(ol) {
  margin: 4px 0;
}
.ai-answer :deep(table) {
  width: 100%;
  margin: 8px 0;
  border-collapse: collapse;
  font-size: 12px;
}
.ai-answer :deep(th),
.ai-answer :deep(td) {
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
  border: 1px solid rgba(128, 128, 128, 0.35);
}
.ai-answer :deep(th) {
  background: rgba(128, 128, 128, 0.14);
}
.ai-answer :deep(caption) {
  margin-bottom: 4px;
  font-weight: 600;
  text-align: left;
}
.ai-answer :deep(.lv-bad) {
  font-weight: 600;
  color: #e03050;
  background: rgba(224, 48, 80, 0.14);
}
.ai-answer :deep(.lv-warn) {
  font-weight: 600;
  color: #c77d0a;
  background: rgba(240, 160, 32, 0.16);
}
.ai-answer :deep(.lv-ok) {
  font-weight: 600;
  color: #18a058;
  background: rgba(24, 160, 88, 0.14);
}
.ai-answer :deep(.lv-info) {
  font-weight: 600;
  color: #2080f0;
  background: rgba(32, 128, 240, 0.12);
}
.ai-window-enter-active,
.ai-window-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.ai-window-enter-from,
.ai-window-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
