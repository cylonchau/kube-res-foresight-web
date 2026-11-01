<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { NButton, NInput, NSpin, NTag, useThemeVars } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { router } from '@/router';
import { useRouterPush } from '@/hooks/common/router';
import { downloadAssistantFile } from '@/service/api';
import { MAX_MESSAGE_CHARS, argHint, skillTitle, useAssistantStore } from '@/store/modules/assistant';
import { renderMiniMarkdown } from '@/utils/mini-markdown';

defineOptions({ name: 'AssistantChat' });

/**
 * The conversation with the assistant in the window at the top right of the header: the messages, the tools each answer was read with,
 * the files it made available, the box to ask in, and the commands (skills) typed with a slash: "/report", "/export", ...
 */
const { t } = useI18n();
const store = useAssistantStore();
const { routerPushByKey } = useRouterPush();
const vars = useThemeVars();
const draft = ref('');
const scroller = ref<HTMLElement | null>(null);
const downloading = ref('');
const highlighted = ref(0);

const ready = computed(() => store.status?.ready === true);
const canConfigure = computed(() => router.hasRoute('ai-config_llm'));

interface Command {
  name: string;
  /** what is typed to run it, with its argument hint */
  usage: string;
  title: string;
  /** it asks the language model, which is not set up */
  unavailable: boolean;
  /** it takes an argument the user still has to type */
  needsArg: boolean;
}

/** the commands, the ones that need no language model first */
const commands = computed<Command[]>(() => [
  ...[...store.skills]
    .sort((a, b) => Number(a.needs_model) - Number(b.needs_model))
    .map(skill => ({
      name: skill.name,
      usage: `/${skill.name}${argHint(skill)}`,
      title: skillTitle(skill),
      unavailable: skill.needs_model && !ready.value,
      needsArg: skill.arg === 'module' || skill.arg === 'text'
    })),
  { name: 'help', usage: '/help', title: t('page.assistant.skill_help'), unavailable: false, needsArg: false }
]);

/** the palette is open while the box holds a slash and a word being typed */
const palette = computed(() => {
  const match = /^\/([\w-]*)$/.exec(draft.value);
  if (!match) return [];
  return commands.value.filter(command => command.name.startsWith(match[1].toLowerCase()));
});
watch(palette, () => (highlighted.value = 0));

function toolLabel(name: string) {
  return t(`page.assistant.tool_${name}`, name);
}

async function scrollToEnd() {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
}

async function send(text = draft.value) {
  if (!text.trim() || store.sending) return;
  draft.value = '';
  const sent = store.send(text);
  await scrollToEnd();
  await sent;
  await scrollToEnd();
}

/** a command picked in the palette or among the chips: it runs at once, unless it still needs a module name typed after it */
function pick(command: Command, runNow = true) {
  if (command.unavailable) return;
  if (command.needsArg || !runNow) {
    draft.value = `/${command.name} `;
    return;
  }
  send(`/${command.name}`);
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return; // a key pressed while an input method is composing is the method's
  if (palette.value.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const n = palette.value.length;
      highlighted.value = (highlighted.value + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      pick(palette.value[highlighted.value], false);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      pick(palette.value[highlighted.value]);
      return;
    }
    if (event.key === 'Escape') {
      draft.value = '';
      return;
    }
  }
  // Enter asks, Shift+Enter starts a new line
  if (event.key === 'Enter' && !event.shiftKey) {
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
  async open => {
    if (!open) return;
    await store.loadStatus(); // the switch or the model may have changed since the window was last open
    scrollToEnd();
  }
);
</script>

<template>
  <div class="assistant-chat h-full min-h-0 flex-col" :style="{ '--assistant-primary': vars.primaryColor }">
    <div ref="scroller" class="assistant-scroll min-h-0 flex-1 overflow-y-auto px-12px py-8px">
      <div v-if="!store.hasConversation" class="assistant-welcome">
        <div class="text-14px font-medium">{{ t('page.assistant.welcome') }}</div>
        <div class="mt-4px text-12px opacity-70">{{ t('page.assistant.readOnly') }}</div>
        <div class="mt-12px flex flex-wrap gap-8px">
          <NButton
            v-for="command in commands.filter(c => c.name !== 'help')"
            :key="command.name"
            size="small"
            secondary
            :disabled="command.unavailable"
            @click="pick(command)"
          >
            {{ command.usage }} · {{ command.title }}
          </NButton>
        </div>
        <div class="mt-10px text-12px opacity-60">{{ t('page.assistant.slashHint') }}</div>
        <div v-if="!ready" class="mt-10px text-12px">
          <span class="opacity-70">{{ t(`page.assistant.notReady_${store.status?.reason || 'no_connection'}`) }}</span>
          <NButton v-if="canConfigure" class="ml-6px" size="tiny" secondary @click="routerPushByKey('ai-config_llm')">
            {{ t('page.assistant.openSettings') }}
          </NButton>
        </div>
      </div>
      <div v-for="message in store.messages" :key="message.id" class="assistant-row" :class="`is-${message.role}`">
        <div class="assistant-bubble" :class="{ 'is-failed': message.failed }">
          <div v-if="message.role === 'user' || message.failed" class="whitespace-pre-wrap break-words">
            {{ message.content }}
          </div>
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
      <div v-if="palette.length" class="assistant-palette" role="listbox">
        <div
          v-for="(command, i) in palette"
          :key="command.name"
          class="assistant-command"
          :class="{ 'is-active': i === highlighted, 'is-off': command.unavailable }"
          role="option"
          @mouseenter="highlighted = i"
          @mousedown.prevent="pick(command)"
        >
          <code>{{ command.usage }}</code>
          <span class="assistant-command-title">{{ command.title }}</span>
          <span v-if="command.unavailable" class="assistant-command-note">{{ t('page.assistant.needsModel') }}</span>
        </div>
      </div>
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
  position: relative;
  padding: 8px 12px 10px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.assistant-palette {
  position: absolute;
  right: 12px;
  bottom: calc(100% - 4px);
  left: 12px;
  z-index: 5;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  background: v-bind('vars.popoverColor');
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(128, 128, 128, 0.22);
}

.assistant-command {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.assistant-command.is-active {
  background: color-mix(in srgb, var(--assistant-primary) 14%, transparent);
}

.assistant-command.is-off {
  cursor: not-allowed;
  opacity: 0.5;
}

.assistant-command code {
  flex: none;
  font-weight: 600;
}

.assistant-command-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
}

.assistant-command-note {
  flex: none;
  font-size: 11px;
  opacity: 0.7;
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
