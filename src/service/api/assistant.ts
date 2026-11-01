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

/**
 * Downloads a file the assistant made available. The file is the response of an API that needs the login, so it is fetched with it and
 * saved from memory; a plain link would not carry it.
 */
export async function downloadAssistantFile(file: Pick<Api.Assistant.Attachment, 'name' | 'path'>) {
  const headers: Record<string, string> = { 'X-kube-resource-fcst-Client': 'web' };
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
