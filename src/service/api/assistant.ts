import { request, serviceBaseURL } from '../request';
import { getAuthorization } from '../request/shared';

const base = '/api/v1/assistant';

/** whether the assistant can be used, and what is missing when it cannot */
export function fetchAssistantStatus() {
  return request<Api.Assistant.Availability>({ url: `${base}/status`, method: 'get' });
}

/** one question: the conversation so far, the last message being the question; a language model may take a while to answer */
export function fetchAssistantChat(messages: Api.Assistant.Turn[], lang: string) {
  return request<Api.Assistant.Reply>({
    url: `${base}/chat`,
    method: 'post',
    data: { messages, lang },
    timeout: 5 * 60 * 1000,
    headers: { 'X-Silent-Error': '1' }
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
