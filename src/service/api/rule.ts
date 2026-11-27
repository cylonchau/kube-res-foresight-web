import { request } from '../request';

const base = '/api/v1';

/** every module with its newest calculation of the fixed formula and how far its decision has gone */
export function fetchGetRuleDecisions() {
  return request<{ list: Api.Rule.Row[]; total: number }>({ url: `${base}/rule-decisions`, method: 'get' });
}

/** the calculations of one module, newest first */
export function fetchGetModuleRuleDecisions(moduleId: number, params?: { page?: number; page_size?: number }) {
  return request<{ list: Api.Rule.Decision[]; total: number }>({
    url: `${base}/modules/${moduleId}/rule-decisions`,
    method: 'get',
    params
  });
}

/** makes the calculation now (the same reading of Prometheus as the resource dashboard) */
export function fetchRunRuleDecision(moduleId: number) {
  return request<Api.Rule.Decision>({
    url: `${base}/modules/${moduleId}/rule-decisions/run`,
    method: 'post',
    headers: { 'X-Long-Request': '1' }
  });
}

/** the source a module follows, what each source says, what the mode lets it do and what the operator did */
export function fetchGetModuleDispatch(moduleId: number) {
  return request<Api.Rule.Dispatch>({ url: `${base}/modules/${moduleId}/dispatch`, method: 'get' });
}
