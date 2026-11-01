import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import { fetchAssistantChat, fetchAssistantSkill, fetchAssistantStatus } from '@/service/api';
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
  /** made on the spot by the interface (the list of commands): shown, never sent to the model */
  local?: boolean;
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

/** "/effect shop" -> { name: 'effect', args: 'shop' }; null when the text is not a command */
export function parseCommand(text: string): { name: string; args: string } | null {
  const match = /^\/([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), args: (match[2] ?? '').trim() } : null;
}

/**
 * The conversation with the assistant, in the window at the top right of the header. It lives in this browser tab (a reload keeps it, a
 * new tab or a new login starts again) and the platform stores none of it.
 */
export const useAssistantStore = defineStore(SetupStoreId.Assistant, () => {
  const appStore = useAppStore();
  const messages = ref<ChatMessage[]>(restore());
  const sending = ref(false);
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

  async function ask(request: () => Promise<{ data: Api.Assistant.Reply | null; error: unknown }>) {
    sending.value = true;
    try {
      const { data, error } = await request();
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
      // a refusal because the assistant was switched off or its model changed: the window should say so, not wait for a reload
      if ((error as any)?.response?.status === 409) await loadStatus();
    } finally {
      sending.value = false;
    }
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
      await ask(() => fetchAssistantSkill(command.name, command.args, appStore.locale));
      return;
    }
    if (!status.value?.ready) {
      push({ role: 'assistant', content: notReadyText(), failed: true, local: true });
      return;
    }
    const history = messages.value
      .filter(m => !m.failed && !m.local)
      .slice(-MAX_HISTORY)
      .map(m => ({ role: m.role, content: m.content }));
    await ask(() => fetchAssistantChat(history, appStore.locale));
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
      const module = $t('page.assistant.argModule');
      const arg = skill.arg === 'module' ? ` <${module}>` : skill.arg === 'module?' ? ` [${module}]` : '';
      const suffix = skill.needs_model ? '' : $t('page.assistant.noModelNeeded');
      return `- \`/${skill.name}${arg}\` ${$t(`page.assistant.skill_${skill.name}` as App.I18n.I18nKey)}${suffix}`;
    });
    return `${$t('page.assistant.helpTitle')}\n${lines.join('\n')}`;
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

  return { messages, sending, status, panelOpen, hasConversation, enabled, skills, loadStatus, send, clear, reset };
});
