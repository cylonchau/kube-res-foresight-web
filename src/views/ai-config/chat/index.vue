<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NCard, NInput, NPopconfirm, NSpin } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import AssistantChat from '@/components/business/assistant-chat.vue';
import { useAssistantStore } from '@/store/modules/assistant';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'AiConfigChat' });

/**
 * The assistant as a page: the conversations of the signed-in user on the left, the open one on the right. It is the same conversation as in
 * the window at the top right of the header (one store), so what is asked in either is in both. One main view, no tabs.
 */
const { t } = useI18n();
const store = useAssistantStore();
const keyword = ref('');
const renaming = ref(0);
const renameText = ref('');

const shown = computed(() => {
  const word = keyword.value.trim().toLowerCase();
  return word ? store.conversations.filter(c => c.title.toLowerCase().includes(word)) : store.conversations;
});

onMounted(async () => {
  await store.loadStatus();
  await store.loadConversations();
});

// a question makes or moves a conversation: read the list again when its answer is in
watch(
  () => store.sending,
  sending => {
    if (!sending) store.loadConversations();
  }
);

function startRename(conversation: Api.Assistant.Conversation) {
  renaming.value = conversation.id;
  renameText.value = conversation.title;
}

async function commitRename() {
  const id = renaming.value;
  const title = renameText.value.trim();
  renaming.value = 0;
  if (id && title) await store.renameConversation(id, title);
}
</script>

<template>
  <div class="ai-chat-page h-full min-h-0 flex gap-12px overflow-hidden">
    <NCard :bordered="false" size="small" class="ai-chat-list rounded-16px shadow-sm">
      <div class="flex-col gap-8px h-full min-h-0">
        <NButton type="primary" block :disabled="store.sending" @click="store.clear()">
          {{ t('page.assistant.clear') }}
        </NButton>
        <NInput
          v-model:value="keyword"
          clearable
          size="small"
          :placeholder="t('page.assistant.task.keywordPlaceholder')"
        />
        <div class="text-12px opacity-60">{{ t('page.assistant.historyHint') }}</div>
        <div class="ai-chat-items min-h-0 flex-1 overflow-y-auto">
          <NSpin v-if="store.loadingConversations && !store.conversations.length" size="small" />
          <div v-else-if="!shown.length" class="py-8px text-12px opacity-70">
            {{ t('page.assistant.historyEmpty') }}
          </div>
          <div
            v-for="conversation in shown"
            :key="conversation.id"
            class="ai-chat-row"
            :class="{ 'is-current': conversation.id === store.conversationId }"
          >
            <NInput
              v-if="renaming === conversation.id"
              v-model:value="renameText"
              size="tiny"
              :maxlength="60"
              autofocus
              @keydown.enter="commitRename"
              @keydown.esc="renaming = 0"
              @blur="commitRename"
            />
            <template v-else>
              <div class="ai-chat-title" @click="store.openConversation(conversation.id)">
                <div class="truncate">{{ conversation.title || t('page.assistant.untitled') }}</div>
                <div class="text-11px opacity-60">
                  {{ formatDateTime(conversation.updated_at) }} ·
                  {{ t('page.assistant.messageCount', { n: conversation.message_count }) }}
                </div>
              </div>
              <NButton size="tiny" quaternary @click="startRename(conversation)">
                {{ t('page.assistant.rename') }}
              </NButton>
              <NPopconfirm @positive-click="store.removeConversation(conversation.id)">
                <template #trigger>
                  <NButton size="tiny" quaternary type="error">{{ t('common.delete') }}</NButton>
                </template>
                {{ t('page.assistant.deleteConversation') }}
              </NPopconfirm>
            </template>
          </div>
        </div>
      </div>
    </NCard>
    <NCard :bordered="false" size="small" class="ai-chat-main min-w-0 flex-1 rounded-16px shadow-sm">
      <AssistantChat :show-history="false" class="h-full min-h-0" />
    </NCard>
  </div>
</template>

<style scoped>
.ai-chat-list {
  width: 300px;
  flex-shrink: 0;
}

.ai-chat-list :deep(.n-card__content),
.ai-chat-main :deep(.n-card__content) {
  height: 100%;
  min-height: 0;
  padding: 0;
}

.ai-chat-list :deep(.n-card__content) {
  padding: 12px;
}

.ai-chat-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 6px;
}

.ai-chat-row:hover {
  background: rgba(128, 128, 128, 0.12);
}

.ai-chat-row.is-current {
  background: color-mix(in srgb, var(--n-color-target, #3b82f6) 14%, rgba(128, 128, 128, 0.1));
}

.ai-chat-title {
  min-width: 0;
  flex: 1;
  cursor: pointer;
  font-size: 13px;
}
</style>
