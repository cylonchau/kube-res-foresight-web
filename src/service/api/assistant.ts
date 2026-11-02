import { request, serviceBaseURL } from '../request';
import { getAuthorization } from '../request/shared';

const base = '/api/v1/assistant';
/** the chat shows a failure in the conversation itself, so the request is asked not to pop one up as well */
const silent = { 'X-Silent-Error': '1' };

/** whether the assistant is on, whether a language model can be asked, and its skills */
export function fetchAssistantStatus() {
  return request<Api.Assistant.Availability>({ url: `${base}/status`, method: 'get', headers: silent });
}

/** one question: the conversation so far, the last message being the question; a language model may take a while to answer */
export function fetchAssistantChat(messages: Api.Assistant.Turn[], lang: string) {
  return request<Api.Assistant.Reply>({
    url: `${base}/chat`,
    method: 'post',
    data: { messages, lang },
    timeout: 5 * 60 * 1000,
    headers: silent
  });
}

/** a skill of the chat (/report, /export, ...) with what was typed after it */
export function fetchAssistantSkill(name: string, args: string, lang: string) {
  return request<Api.Assistant.Reply>({
    url: `${base}/skill`,
    method: 'post',
    data: { name, args, lang },
    timeout: 5 * 60 * 1000,
    headers: silent
  });
}

export function fetchGetAssistantConnections(params: {
  page: number;
  page_size: number;
  keyword?: string;
  enabled?: boolean;
}) {
  return request<Api.Assistant.ConnectionList>({ url: `${base}/connections`, method: 'get', params });
}

export function fetchCreateAssistantConnection(data: Api.Assistant.ConnectionPayload) {
  return request<Api.Assistant.Connection>({ url: `${base}/connections`, method: 'post', data });
}

export function fetchUpdateAssistantConnection(id: number, data: Api.Assistant.ConnectionPayload) {
  return request<Api.Assistant.Connection>({ url: `${base}/connections/${id}`, method: 'put', data });
}

export function fetchDeleteAssistantConnection(id: number) {
  return request<string>({ url: `${base}/connections/${id}`, method: 'delete' });
}

export function fetchBatchDeleteAssistantConnections(ids: number[]) {
  return request<string>({ url: `${base}/connections/batch-delete`, method: 'post', data: { ids } });
}

/** asks the connection the form holds right now a small question (an empty key means the stored one) */
export function fetchTestAssistantConnection(data: Api.Assistant.ConnectionPayload) {
  return request<Api.Assistant.TestResult>({
    url: `${base}/connections/test`,
    method: 'post',
    data,
    timeout: 90 * 1000
  });
}

/** the enabled language models, for the selector of a skill */
export function fetchGetAssistantConnectionOptions() {
  return request<Api.Assistant.ConnectionOption[]>({ url: `${base}/connection-options`, method: 'get' });
}

export function fetchGetAssistantSkills(params: {
  page: number;
  page_size: number;
  keyword?: string;
  enabled?: boolean;
  kind?: 'builtin' | 'custom';
}) {
  return request<Api.Assistant.SkillList>({ url: `${base}/skills`, method: 'get', params });
}

export function fetchCreateAssistantSkill(data: Api.Assistant.SkillPayload) {
  return request<Api.Assistant.SkillRow>({ url: `${base}/skills`, method: 'post', data });
}

export function fetchUpdateAssistantSkill(id: number, data: Api.Assistant.SkillPayload) {
  return request<Api.Assistant.SkillRow>({ url: `${base}/skills/${id}`, method: 'put', data });
}

export function fetchDeleteAssistantSkill(id: number) {
  return request<string>({ url: `${base}/skills/${id}`, method: 'delete' });
}

export function fetchBatchDeleteAssistantSkills(ids: number[]) {
  return request<string>({ url: `${base}/skills/batch-delete`, method: 'post', data: { ids } });
}

export function fetchGetAssistantTasks(params: {
  page: number;
  page_size: number;
  keyword?: string;
  enabled?: boolean;
  source?: 'chat' | 'page';
}) {
  return request<Api.Assistant.TaskList>({ url: `${base}/tasks`, method: 'get', params });
}

/** the next times a schedule fires, or why it is not valid */
export function fetchPreviewAssistantSchedule(schedule: string) {
  return request<Api.Assistant.SchedulePreview>({ url: `${base}/tasks/preview`, method: 'get', params: { schedule } });
}

export function fetchCreateAssistantTask(data: Api.Assistant.TaskPayload) {
  return request<Api.Assistant.TaskRow>({ url: `${base}/tasks`, method: 'post', data });
}

export function fetchUpdateAssistantTask(id: number, data: Api.Assistant.TaskPayload) {
  return request<Api.Assistant.TaskRow>({ url: `${base}/tasks/${id}`, method: 'put', data });
}

export function fetchDeleteAssistantTask(id: number) {
  return request<string>({ url: `${base}/tasks/${id}`, method: 'delete' });
}

export function fetchBatchDeleteAssistantTasks(ids: number[]) {
  return request<string>({ url: `${base}/tasks/batch-delete`, method: 'post', data: { ids } });
}

/** queues a run of the task in the task center, which does not wait for the schedule */
export function fetchRunAssistantTask(id: number) {
  return request<string>({ url: `${base}/tasks/${id}/run`, method: 'post' });
}

export function fetchGetAssistantTaskRuns(id: number, params: { page: number; page_size: number }) {
  return request<Api.Assistant.TaskRunList>({ url: `${base}/tasks/${id}/runs`, method: 'get', params });
}

/**
 * Downloads a file the assistant made available. The file is the response of an API that needs the login, so it is fetched with it and
 * saved from memory; a plain link would not carry it.
 */
export async function downloadAssistantFile(file: Pick<Api.Assistant.Attachment, 'name' | 'path'>) {
  const headers: Record<string, string> = { 'X-kube-res-foresight-Client': 'web' };
  const authorization = getAuthorization();
  if (authorization) headers.Authorization = authorization;
  const response = await fetch(`${serviceBaseURL.replace(/\/+$/, '')}${file.path}`, { headers });
  if (!response.ok) throw new Error(String(response.status));
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
