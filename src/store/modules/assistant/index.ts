import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import { fetchAssistantChat, fetchAssistantStatus } from '@/service/api';
import { $t } from '@/locales';
import { useAppStore } from '../app';

/** one message of the conversation as it is shown */
export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tools?: Api.Assistant.ToolTrace[];
  attachments?: Api.Assistant.Attachment[];
  /** the answer could not be had: the text says why; it is shown, never sent back to the model */
  failed?: boolean;
}

/** the server takes 40 messages of history and 4000 characters in each */
export const MAX_HISTORY = 40;
export const MAX_MESSAGE_CHARS = 4000;

const STORAGE_KEY = 'kube-resource-fcst-assistant';

function restore(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY * 2) : [];
  } catch {
    return [];
  }
}

/**
 * The conversation with the assistant, kept for the header panel and the page of the menu together: one conversation, shown in two
 * places. It lives in this browser tab (a reload keeps it, a new tab or a new login starts again) and the platform stores none of it.
 */
export const useAssistantStore = defineStore(SetupStoreId.Assistant, () => {
  const appStore = useAppStore();
  const messages = ref<ChatMessage[]>(restore());
  const sending = ref(false);
  const status = ref<Api.Assistant.Availability | null>(null);
  /** the floating panel at the top right of the header */
  const panelOpen = ref(false);
  let nextId = messages.value.reduce((max, m) => Math.max(max, m.id), 0) + 1;

  const hasConversation = computed(() => messages.value.length > 0);

  function save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value.slice(-MAX_HISTORY * 2)));
    } catch {
      // no storage (a private window): the conversation lasts as long as the page
    }
  }

  async function loadStatus() {
    const { data } = await fetchAssistantStatus();
    status.value = data ?? { ready: false, problem: $t('page.assistant.statusUnknown') };
  }

  function push(message: Omit<ChatMessage, 'id'>) {
    messages.value.push({ ...message, id: nextId });
    nextId += 1;
    save();
  }

  /** asks one question; the answer, or the reason there is none, is added to the conversation */
  async function send(text: string) {
    const content = text.trim();
    if (!content || sending.value) return;
    push({ role: 'user', content: content.slice(0, MAX_MESSAGE_CHARS) });
    sending.value = true;
    try {
      const history = messages.value
        .filter(m => !m.failed)
        .slice(-MAX_HISTORY)
        .map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await fetchAssistantChat(history, appStore.locale);
      if (data) {
        push({
          role: 'assistant',
          content: data.content,
          tools: data.tools ?? [],
          attachments: data.attachments ?? []
        });
      } else {
        const reason =
          (error as any)?.response?.data?.msg || (error as any)?.message || $t('page.assistant.failedUnknown');
        push({ role: 'assistant', content: reason, failed: true });
        // a refusal because the assistant was switched off or its settings changed: the panel should say so, not wait for a reload
        if ((error as any)?.response?.status === 409) await loadStatus();
      }
    } finally {
      sending.value = false;
    }
  }

  function clear() {
    messages.value = [];
    save();
  }

  /** a new login is a new conversation: nothing is kept for the next person at this browser */
  function reset() {
    messages.value = [];
    status.value = null;
    panelOpen.value = false;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing was stored
    }
  }

  return { messages, sending, status, panelOpen, hasConversation, loadStatus, send, clear, reset };
});
