import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import {
  fetchAssistantChat,
  fetchAssistantSkill,
  fetchAssistantStatus,
  fetchCreateAssistantConversation,
  fetchDeleteAssistantConversation,
  fetchGetAssistantConversation,
  fetchGetAssistantConversations,
  fetchRenameAssistantConversation
} from '@/service/api';
import { router } from '@/router';
import { $t } from '@/locales';
import { pageContextOf } from '@/utils/assistant-context';
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
  /** made on the spot by the interface (the list of commands): shown, never sent to the model */
  local?: boolean;
}

/** the server takes 40 messages of history and 4000 characters in each */
export const MAX_HISTORY = 40;
export const MAX_MESSAGE_CHARS = 4000;

const STORAGE_KEY = 'kube-res-foresight-assistant';
const CONVERSATION_KEY = 'kube-res-foresight-assistant-conversation';

function restoreConversationId(): number {
  try {
    const id = Number(sessionStorage.getItem(CONVERSATION_KEY));
    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

function restore(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY * 2) : [];
  } catch {
    return [];
  }
}

/** what a skill is called in the chat: a built-in one in the words of the console, a custom one in its own */
export function skillTitle(skill: Api.Assistant.Skill) {
  return skill.builtin
    ? $t(`page.assistant.skill_${skill.name}` as App.I18n.I18nKey)
    : [skill.title || skill.name, skill.description].filter(Boolean).join(' · ');
}

/** the hint of what is typed after a command: " <module>", " [module]", " <text>" ... */
export function argHint(skill: Api.Assistant.Skill) {
  if (!skill.arg) return '';
  const word =
    skill.arg_hint || $t(skill.arg.startsWith('module') ? 'page.assistant.argModule' : 'page.assistant.argText');
  return skill.arg.endsWith('?') ? ` [${word}]` : ` <${word}>`;
}

/** "/effect shop" -> { name: 'effect', args: 'shop' }; null when the text is not a command */
export function parseCommand(text: string): { name: string; args: string } | null {
  const match = /^\/([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), args: (match[2] ?? '').trim() } : null;
}

/**
 * The conversation with the assistant, in the window at the top right of the header. The platform keeps every conversation of the signed-in
 * user (only they can read it, and it is deleted after the retention set in the system parameters); this browser tab remembers which one is
 * open, so a reload carries on, and the history list opens any other.
 */
export const useAssistantStore = defineStore(SetupStoreId.Assistant, () => {
  const appStore = useAppStore();
  const messages = ref<ChatMessage[]>(restore());
  const sending = ref(false);
  /** the stored conversation the questions are asked in; 0 until the first question makes one */
  const conversationId = ref(restoreConversationId());
  const conversations = ref<Api.Assistant.Conversation[]>([]);
  const loadingConversations = ref(false);
  const status = ref<Api.Assistant.Availability | null>(null);
  /** the window at the top right of the header */
  const panelOpen = ref(false);
  let nextId = messages.value.reduce((max, m) => Math.max(max, m.id), 0) + 1;

  const hasConversation = computed(() => messages.value.length > 0);
  /** the switch is on: the assistant is offered at all */
  const enabled = computed(() => status.value?.enabled === true);
  const skills = computed(() => status.value?.skills ?? []);

  function save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value.slice(-MAX_HISTORY * 2)));
      if (conversationId.value) sessionStorage.setItem(CONVERSATION_KEY, String(conversationId.value));
      else sessionStorage.removeItem(CONVERSATION_KEY);
    } catch {
      // no storage (a private window): the conversation lasts as long as the page
    }
  }

  /** reads the switch and the state of the language model; a switch that was turned off closes the window */
  async function loadStatus() {
    const { data, error } = await fetchAssistantStatus();
    if (data) status.value = data;
    else if (error)
      status.value = { enabled: false, ready: false, problem: $t('page.assistant.statusUnknown'), skills: [] };
    if (!enabled.value) panelOpen.value = false;
  }

  function push(message: Omit<ChatMessage, 'id'>) {
    messages.value.push({ ...message, id: nextId });
    nextId += 1;
    save();
  }

  /** the failure of a request, in the words of the server when it gave some */
  function reasonOf(error: unknown) {
    return (error as any)?.response?.data?.msg || (error as any)?.message || $t('page.assistant.failedUnknown');
  }

  /** the stored conversation the question is asked in: the open one, or a new one made now; 0 with the reason when it could not be made */
  async function ensureConversation(): Promise<{ id: number; error?: unknown }> {
    if (conversationId.value) return { id: conversationId.value };
    const { data, error } = await fetchCreateAssistantConversation();
    if (!data) return { id: 0, error };
    conversationId.value = data.id;
    save();
    return { id: data.id };
  }

  async function ask(request: (conversation: number) => Promise<{ data: Api.Assistant.Reply | null; error: unknown }>) {
    sending.value = true;
    try {
      const conversation = await ensureConversation();
      if (!conversation.id) {
        push({ role: 'assistant', content: reasonOf(conversation.error), failed: true });
        return;
      }
      const { data, error } = await request(conversation.id);
      if (data) {
        push({
          role: 'assistant',
          content: data.content,
          tools: data.tools ?? [],
          attachments: data.attachments ?? []
        });
        return;
      }
      push({ role: 'assistant', content: reasonOf(error), failed: true });
      // the conversation is gone (deleted elsewhere, or past its retention): the next question starts a new one
      if ((error as any)?.response?.status === 404) {
        conversationId.value = 0;
        save();
      }
      // a refusal because the assistant was switched off or its model changed: the window should say so, not wait for a reload
      if ((error as any)?.response?.status === 409) await loadStatus();
    } finally {
      sending.value = false;
    }
  }

  /** where the user is now: the page, and the module its address names; the platform checks the user may see it */
  function currentPage() {
    const route = router.currentRoute.value;
    const key = route.meta?.i18nKey as App.I18n.I18nKey | undefined;
    return pageContextOf(route, key ? $t(key) : '');
  }

  /** asks one question, or runs the skill the text names; the answer, or the reason there is none, is added to the conversation */
  async function send(text: string) {
    const content = text.trim();
    if (!content || sending.value) return;
    push({ role: 'user', content: content.slice(0, MAX_MESSAGE_CHARS) });

    const command = parseCommand(content);
    if (command?.name === 'help') {
      push({ role: 'assistant', content: helpText(), local: true });
      return;
    }
    if (command) {
      if (!skills.value.some(skill => skill.name === command.name)) {
        push({
          role: 'assistant',
          content: $t('page.assistant.unknownCommand', { name: command.name }),
          failed: true,
          local: true
        });
        return;
      }
      const skill = skills.value.find(item => item.name === command.name);
      if (skill?.needs_model && !status.value?.ready) {
        push({ role: 'assistant', content: notReadyText(), failed: true, local: true });
        return;
      }
      await ask(conversation => fetchAssistantSkill(command.name, command.args, appStore.locale, conversation));
      return;
    }
    if (!status.value?.ready) {
      push({ role: 'assistant', content: notReadyText(), failed: true, local: true });
      return;
    }
    // the platform holds the conversation, so only the question travels; it gives the model the rest from what it stored
    await ask(conversation =>
      fetchAssistantChat(
        [{ role: 'user', content: content.slice(0, MAX_MESSAGE_CHARS) }],
        appStore.locale,
        currentPage(),
        conversation
      )
    );
  }

  /** the stored conversations of the user, the latest first */
  async function loadConversations() {
    loadingConversations.value = true;
    try {
      const { data } = await fetchGetAssistantConversations({ page: 1, page_size: 200 });
      if (data) {
        conversations.value = data.list ?? [];
      }
    } finally {
      loadingConversations.value = false;
    }
  }

  /** puts a stored conversation in the window */
  async function openConversation(id: number) {
    if (sending.value) return;
    const { data, error } = await fetchGetAssistantConversation(id);
    if (!data) {
      window.$message?.error(reasonOf(error));
      await loadConversations();
      return;
    }
    conversationId.value = id;
    messages.value = data.messages.map(m => ({
      id: nextId++,
      role: m.role,
      content: m.content,
      tools: m.tools,
      attachments: m.attachments,
      failed: m.failed
    }));
    save();
  }

  async function renameConversation(id: number, title: string) {
    const { error } = await fetchRenameAssistantConversation(id, title);
    if (error) {
      window.$message?.error(reasonOf(error));
      return false;
    }
    await loadConversations();
    return true;
  }

  async function removeConversation(id: number) {
    const { error } = await fetchDeleteAssistantConversation(id);
    if (error) {
      window.$message?.error(reasonOf(error));
      return false;
    }
    if (id === conversationId.value) clear();
    await loadConversations();
    return true;
  }

  /** what is missing for a question to the language model, in the words of the console */
  function notReadyText() {
    return $t(
      `page.assistant.notReady_${status.value?.reason || 'no_connection'}` as App.I18n.I18nKey,
      status.value?.problem ?? ''
    );
  }

  /** the list of the commands, in the words of the console */
  function helpText() {
    const lines = skills.value.map(skill => {
      const suffix = skill.needs_model ? '' : $t('page.assistant.noModelNeeded');
      return `- \`/${skill.name}${argHint(skill)}\` ${skillTitle(skill)}${suffix}`;
    });
    return `${$t('page.assistant.helpTitle')}\n${lines.join('\n')}`;
  }

  /** a new conversation: the one that was open stays stored and is in the history */
  function clear() {
    messages.value = [];
    conversationId.value = 0;
    save();
  }

  /** a new login is a new conversation: nothing is kept for the next person at this browser */
  function reset() {
    messages.value = [];
    conversationId.value = 0;
    conversations.value = [];
    status.value = null;
    panelOpen.value = false;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(CONVERSATION_KEY);
    } catch {
      // nothing was stored
    }
  }

  return {
    messages,
    sending,
    status,
    panelOpen,
    conversationId,
    conversations,
    loadingConversations,
    hasConversation,
    enabled,
    skills,
    loadStatus,
    loadConversations,
    openConversation,
    renameConversation,
    removeConversation,
    send,
    clear,
    reset
  };
});
