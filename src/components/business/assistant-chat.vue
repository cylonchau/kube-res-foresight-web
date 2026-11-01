<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { NButton, NEmpty, NInput, NSpin, NTag, useThemeVars } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRouterPush } from '@/hooks/common/router';
import { downloadAssistantFile } from '@/service/api';
import { MAX_MESSAGE_CHARS, useAssistantStore } from '@/store/modules/assistant';
import { renderMiniMarkdown } from '@/utils/mini-markdown';

defineOptions({ name: 'AssistantChat' });

/**
 * The conversation with the assistant: the messages, the tools each answer was read with, the files it made available, and the box to
 * ask in. The same component is the header panel and the page of the menu; they share one conversation (the store).
 */
const { t } = useI18n();
const store = useAssistantStore();
const { routerPushByKey } = useRouterPush();
const vars = useThemeVars();
const draft = ref('');
const scroller = ref<HTMLElement | null>(null);
const downloading = ref('');

const ready = computed(() => store.status?.ready === true);
const checking = computed(() => store.status === null);

const examples = computed(() => [
  t('page.assistant.example1'),
  t('page.assistant.example2'),
  t('page.assistant.example3')
]);

function toolLabel(name: string) {
  return t(`page.assistant.tool_${name}`, name);
}

async function scrollToEnd() {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
}

async function send(text = draft.value) {
  if (!text.trim() || store.sending || !ready.value) return;
  draft.value = '';
  const sent = store.send(text);
  await scrollToEnd();
  await sent;
  await scrollToEnd();
}

function onKeydown(event: KeyboardEvent) {
  // Enter asks, Shift+Enter starts a new line; a key pressed while an input method is composing is the method's
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    send();
  }
}

async function download(file: Api.Assistant.Attachment) {
  downloading.value = file.name;
  try {
    await downloadAssistantFile(file);
  } catch {
    window.$message?.error(t('page.assistant.downloadFailed'));
  } finally {
    downloading.value = '';
  }
}

onMounted(async () => {
  await store.loadStatus();
  await scrollToEnd();
});
watch(
  () => store.panelOpen,
  open => {
    if (open) scrollToEnd();
  }
);
</script>

<template>
  <div class="assistant-chat h-full min-h-0 flex-col" :style="{ '--assistant-primary': vars.primaryColor }">
    <NSpin v-if="checking" class="m-auto" size="small" />
    <div v-else-if="!ready" class="m-auto max-w-360px px-16px text-center">
      <NEmpty :description="t('page.assistant.notReady')" />
      <div class="mt-8px text-12px opacity-70">{{ store.status?.problem }}</div>
      <NButton class="mt-12px" size="small" secondary @click="routerPushByKey('system_config')">
        {{ t('page.assistant.openSettings') }}
      </NButton>
    </div>
    <template v-else>
      <div ref="scroller" class="assistant-scroll min-h-0 flex-1 overflow-y-auto px-12px py-8px">
        <div v-if="!store.hasConversation" class="assistant-welcome">
          <div class="text-14px font-medium">{{ t('page.assistant.welcome') }}</div>
          <div class="mt-4px text-12px opacity-70">{{ t('page.assistant.readOnly') }}</div>
          <div class="mt-12px flex-col items-start gap-8px">
            <NButton v-for="example in examples" :key="example" size="small" secondary @click="send(example)">
              {{ example }}
            </NButton>
          </div>
        </div>
        <div v-for="message in store.messages" :key="message.id" class="assistant-row" :class="`is-${message.role}`">
          <div class="assistant-bubble" :class="{ 'is-failed': message.failed }">
            <div v-if="message.role === 'user'" class="whitespace-pre-wrap break-words">{{ message.content }}</div>
            <div v-else-if="message.failed" class="whitespace-pre-wrap break-words">{{ message.content }}</div>
            <!-- eslint-disable-next-line vue/no-v-html -- escaped first: see utils/mini-markdown -->
            <div v-else class="assistant-md" v-html="renderMiniMarkdown(message.content)"></div>
            <div v-if="message.tools?.length" class="assistant-meta">
              <span class="opacity-60">{{ t('page.assistant.readFrom') }}</span>
              <NTag
                v-for="(tool, i) in message.tools"
                :key="i"
                size="tiny"
                :bordered="false"
                :type="tool.ok ? 'default' : 'error'"
              >
                {{ toolLabel(tool.name) }}
              </NTag>
            </div>
            <div v-if="message.attachments?.length" class="assistant-meta">
              <NButton
                v-for="file in message.attachments"
                :key="file.path"
                size="tiny"
                type="primary"
                secondary
                :loading="downloading === file.name"
                @click="download(file)"
              >
                {{ t('page.assistant.download') }} {{ file.name }}
              </NButton>
            </div>
          </div>
        </div>
        <div v-if="store.sending" class="assistant-row is-assistant">
          <div class="assistant-bubble">
            <NSpin size="small" />
            <span class="ml-6px opacity-70">{{ t('page.assistant.thinking') }}</span>
          </div>
        </div>
      </div>
      <div class="assistant-input">
        <NInput
          v-model:value="draft"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 4 }"
          :maxlength="MAX_MESSAGE_CHARS"
          :placeholder="t('page.assistant.placeholder')"
          :disabled="store.sending"
          @keydown="onKeydown"
        />
        <div class="mt-6px flex items-center justify-between gap-8px">
          <NButton size="tiny" quaternary :disabled="!store.hasConversation || store.sending" @click="store.clear()">
            {{ t('page.assistant.clear') }}
          </NButton>
          <NButton size="small" type="primary" :loading="store.sending" :disabled="!draft.trim()" @click="send()">
            {{ t('page.assistant.send') }}
          </NButton>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.assistant-row {
  display: flex;
  margin-bottom: 10px;
}

.assistant-row.is-user {
  justify-content: flex-end;
}

.assistant-bubble {
  max-width: 92%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  background: rgba(128, 128, 128, 0.12);
}

.assistant-row.is-user .assistant-bubble {
  background: color-mix(in srgb, var(--assistant-primary) 16%, transparent);
}

.assistant-bubble.is-failed {
  background: rgba(208, 48, 80, 0.1);
  color: rgb(208, 48, 80);
}

.assistant-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
}

.assistant-input {
  padding: 8px 12px 10px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.assistant-md :deep(p) {
  margin: 0 0 6px;
}

.assistant-md :deep(p:last-child) {
  margin-bottom: 0;
}

.assistant-md :deep(.md-h) {
  font-weight: 600;
}

.assistant-md :deep(ul),
.assistant-md :deep(ol) {
  margin: 0 0 6px;
  padding-left: 20px;
}

.assistant-md :deep(ul) {
  list-style: disc;
}

.assistant-md :deep(ol) {
  list-style: decimal;
}

.assistant-md :deep(code) {
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.18);
  font-size: 12px;
}

.assistant-md :deep(pre) {
  margin: 0 0 6px;
  padding: 8px;
  overflow-x: auto;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.14);
}

.assistant-md :deep(pre code) {
  padding: 0;
  background: none;
}

.assistant-md :deep(table) {
  display: block;
  max-width: 100%;
  margin: 0 0 6px;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 12px;
}

.assistant-md :deep(th),
.assistant-md :deep(td) {
  padding: 3px 8px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  white-space: nowrap;
}
</style>
