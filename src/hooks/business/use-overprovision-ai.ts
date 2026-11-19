import { reactive } from 'vue';
import {
  fetchAssistantAsyncTask,
  fetchAssistantChatAsync,
  fetchAssistantStatus,
  fetchCancelAssistantAsyncTask
} from '@/service/api';

/**
 * The one-click AI analysis of a module: the question (see utils/overprovision-ai) goes to the assistant as a background task of the user, so it uses
 * the language model of the platform, the permissions of the user and the audit like any question; the answer is read while it is written and kept,
 * for the module it was made for, in this browser.
 */
export interface StoredAnalysis {
  text: string;
  at: string;
  window: string;
}

const KEY = 'kube-res-foresight:overprovision-ai';
const MAX_WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 500;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function readAll(): Record<string, StoredAnalysis> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, StoredAnalysis>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, StoredAnalysis>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // the browser may not store: the analysis is still shown
  }
}

function reasonText(error: unknown): string {
  const response = (error as any)?.response;
  const message = response?.data?.msg || response?.data?.message || (error as any)?.message;
  return typeof message === 'string' && message ? message : 'failed';
}

export function useOverprovisionAi() {
  const state = reactive({
    running: false,
    live: '',
    error: '',
    taskId: 0,
    /** the module the text belongs to */
    moduleId: 0,
    text: '',
    at: '',
    window: '',
    /** whether the assistant is on and has a model; undefined until asked */
    ready: undefined as boolean | undefined,
    problem: ''
  });
  let cancelled = false;

  async function checkReady() {
    const { data } = await fetchAssistantStatus();
    state.ready = Boolean(data?.enabled && data?.ready);
    state.problem = data?.problem ?? '';
  }

  /** shows what was kept for the module, or nothing */
  function show(moduleId: number) {
    state.moduleId = moduleId;
    state.error = '';
    const stored = readAll()[String(moduleId)];
    state.text = stored?.text ?? '';
    state.at = stored?.at ?? '';
    state.window = stored?.window ?? '';
  }

  async function run(
    moduleId: number,
    question: string,
    lang: string,
    window: string,
    page: Api.Assistant.PageContext
  ) {
    if (state.running) return;
    state.running = true;
    state.error = '';
    state.live = '';
    cancelled = false;
    state.moduleId = moduleId;
    try {
      const { data, error } = await fetchAssistantChatAsync([{ role: 'user', content: question }], lang, page);
      if (!data) {
        state.error = reasonText(error);
        return;
      }
      state.taskId = data.id;
      const started = Date.now();
      let failures = 0;
      while (Date.now() - started < MAX_WAIT_MS) {
        const { data: task, error: pollError } = await fetchAssistantAsyncTask(data.id);
        if (!task) {
          failures += 1;
          if (failures >= 5) {
            state.error = reasonText(pollError);
            return;
          }
        } else {
          failures = 0;
          if (state.moduleId === moduleId) state.live = task.partial ?? '';
          if (task.status === 'succeeded' && task.result) {
            const all = readAll();
            all[String(moduleId)] = { text: task.result.content, at: new Date().toISOString(), window };
            writeAll(all);
            if (state.moduleId === moduleId) show(moduleId);
            return;
          }
          if (task.status === 'failed') {
            state.error = task.error || 'failed';
            return;
          }
          if (task.status === 'cancelled') return;
        }
        if (cancelled) return;
        await sleep(POLL_MS);
      }
      state.error = 'timeout';
    } finally {
      state.running = false;
      state.live = '';
      state.taskId = 0;
    }
  }

  async function stop() {
    cancelled = true;
    if (state.taskId) await fetchCancelAssistantAsyncTask(state.taskId);
  }

  return { state, checkReady, show, run, stop };
}
