<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NCard } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import AssistantChat from '@/components/business/assistant-chat.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { downloadAssistantFile } from '@/service/api';
import { useAppStore } from '@/store/modules/app';
import { useAssistantStore } from '@/store/modules/assistant';

defineOptions({ name: 'Assistant' });

/**
 * The page of the menu "AI assistant": the conversation in the whole page, and the export of the service state, which does not need the
 * model at all. The window in the header is the same conversation.
 */
const { t } = useI18n();
const store = useAssistantStore();
const appStore = useAppStore();
const exporting = ref('');

const hours = 24;
const lang = computed(() => (appStore.locale.startsWith('en') ? 'en' : 'zh'));

async function exportStatus(format: 'markdown' | 'json') {
  exporting.value = format;
  try {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    await downloadAssistantFile({
      name: `service-status-${stamp}.${format === 'json' ? 'json' : 'md'}`,
      path: `/api/v1/assistant/export?format=${format}&hours=${hours}&lang=${lang.value}`
    });
  } catch {
    window.$message?.error(t('page.assistant.downloadFailed'));
  } finally {
    exporting.value = '';
  }
}
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <NCard :bordered="false" size="small" class="min-h-0 flex-1 rounded-16px shadow-sm assistant-card">
      <template #header>
        <HelpLabel :label="t('page.assistant.title')" :help="t('page.assistant.help')" class="text-16px font-medium" />
      </template>
      <template #header-extra>
        <div class="flex items-center gap-8px">
          <span v-if="store.status?.model" class="text-12px opacity-65">
            {{ t('page.assistant.model') }}: {{ store.status.model }}
          </span>
          <NButton size="tiny" secondary :loading="exporting === 'markdown'" @click="exportStatus('markdown')">
            {{ t('page.assistant.exportMarkdown') }}
          </NButton>
          <NButton size="tiny" secondary :loading="exporting === 'json'" @click="exportStatus('json')">
            {{ t('page.assistant.exportJson') }}
          </NButton>
        </div>
      </template>
      <AssistantChat />
    </NCard>
  </div>
</template>

<style scoped>
.assistant-card {
  display: flex;
  flex-direction: column;
}

.assistant-card :deep(.n-card__content) {
  min-height: 0;
  flex: 1;
  padding: 0;
}
</style>
