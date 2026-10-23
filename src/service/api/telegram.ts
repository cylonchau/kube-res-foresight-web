import { request } from '../request';

// Personal binding (status/generate-link/unbind for the current user) lives
// in ./auth.ts (fetchGetTelegramStatus/fetchGenerateTelegramBindToken/fetchUnbindTelegram)
// alongside the user-center page that already uses them — this file only
// holds the admin-only bot-management endpoints.

/** Admin: paginated list of every user's Telegram binding */
export function fetchGetTelegramBindings(params: { page: number; page_size: number }) {
  return request<{ list: Api.Telegram.AdminBindingItem[]; total: number }>({
    url: '/api/v1/telegram/admin/bindings',
    method: 'get',
    params
  });
}

/** Admin: force-unbind any user's Telegram account by binding ID */
export function fetchAdminUnbindTelegram(id: number) {
  return request({
    url: `/api/v1/telegram/admin/bindings/${id}`,
    method: 'delete'
  });
}

export function fetchAdminBatchUnbindTelegram(ids: number[]) {
  return request({
    url: '/api/v1/telegram/admin/bindings/batch-delete',
    method: 'post',
    data: { ids }
  });
}

export function fetchGetTelegramClientAccounts(params: {
  page: number;
  page_size: number;
  keyword?: string;
  enabled?: boolean;
  authorized?: boolean;
}) {
  return request<{ list: Api.Telegram.ClientAccount[]; total: number }>({
    url: '/api/v1/telegram/admin/client-accounts',
    method: 'get',
    params
  });
}

export function fetchCreateTelegramClientAccount(data: {
  name: string;
  phone_number: string;
  api_id: number;
  api_hash: string;
  enabled?: boolean;
}) {
  return request<Api.Telegram.ClientAccount>({ url: '/api/v1/telegram/admin/client-accounts', method: 'post', data });
}

export function fetchUpdateTelegramClientAccount(
  id: number,
  data: Partial<{ name: string; phone_number: string; api_id: number; api_hash: string; enabled: boolean }>
) {
  return request<Api.Telegram.ClientAccount>({
    url: `/api/v1/telegram/admin/client-accounts/${id}`,
    method: 'put',
    data
  });
}

export function fetchDeleteTelegramClientAccount(id: number) {
  return request({ url: `/api/v1/telegram/admin/client-accounts/${id}`, method: 'delete' });
}

export function fetchSendTelegramClientCode(accountId: number) {
  return request<{ code_sent: boolean; expires_in: number }>({
    url: '/api/v1/telegram/admin/client-accounts/send-code',
    method: 'post',
    data: { account_id: accountId }
  });
}

export function fetchVerifyTelegramClientCode(data: { account_id: number; code: string; password?: string }) {
  return request<{ authorized: boolean; connected: boolean }>({
    url: '/api/v1/telegram/admin/client-accounts/verify-code',
    method: 'post',
    data
  });
}

export function fetchConnectTelegramClientAccount(id: number) {
  return request({ url: `/api/v1/telegram/admin/client-accounts/${id}/connect`, method: 'post' });
}

export function fetchLogoutTelegramClientAccount(id: number) {
  return request({ url: `/api/v1/telegram/admin/client-accounts/${id}/logout`, method: 'post' });
}

export function fetchGetTelegramClientSubscriptions(params: {
  page: number;
  page_size: number;
  account_id?: number;
  keyword?: string;
  enabled?: boolean;
  state?: string;
}) {
  return request<{ list: Api.Telegram.ClientSubscription[]; total: number }>({
    url: '/api/v1/telegram/admin/client-subscriptions',
    method: 'get',
    params
  });
}

export function fetchCreateTelegramClientSubscription(data: {
  account_id: number;
  /** public username, @username or t.me link of the channel to join */
  channel_link: string;
  join: boolean;
}) {
  return request<Api.Telegram.ClientSubscription>({
    url: '/api/v1/telegram/admin/client-subscriptions',
    method: 'post',
    data
  });
}

export function fetchUpdateTelegramClientSubscription(id: number, data: { keywords: string[]; enabled?: boolean }) {
  return request({ url: `/api/v1/telegram/admin/client-subscriptions/${id}`, method: 'put', data });
}

export function fetchDeleteTelegramClientSubscription(id: number) {
  return request({ url: `/api/v1/telegram/admin/client-subscriptions/${id}`, method: 'delete' });
}

export function fetchGetTelegramClientMessages(params: {
  page: number;
  page_size: number;
  account_id?: number;
  subscription_id?: number;
  source_type?: string;
  status?: string;
  keyword?: string;
}) {
  return request<{ list: Api.Telegram.ClientMessage[]; total: number }>({
    url: '/api/v1/telegram/admin/client-messages',
    method: 'get',
    params
  });
}

/** Admin: paginated, keyword-searchable list of every message template */
export function fetchGetNotifyTemplates(params: { page: number; page_size: number; keyword?: string }) {
  return request<{ list: Api.Telegram.NotifyTemplate[]; total: number }>({
    url: '/api/v1/telegram/admin/templates',
    method: 'get',
    params
  });
}

/** Admin: update one template's title/body/buttons/enabled flag by key */
export function fetchUpdateNotifyTemplate(key: string, data: Api.Telegram.NotifyTemplateUpdate) {
  return request({
    url: `/api/v1/telegram/admin/templates/${key}`,
    method: 'put',
    data
  });
}

/** Admin: paginated list of configurable bot commands */
export function fetchGetBotCommands(params: { page: number; page_size: number; keyword?: string; bot_id?: number }) {
  return request<{ list: Api.Telegram.BotCommandDef[]; total: number }>({
    url: '/api/v1/telegram/admin/commands',
    method: 'get',
    params
  });
}

/** Admin: create a bot command */
export function fetchCreateBotCommand(data: Partial<Api.Telegram.BotCommandDef>) {
  return request<Api.Telegram.BotCommandDef>({
    url: '/api/v1/telegram/admin/commands',
    method: 'post',
    data
  });
}

/** Admin: update a bot command */
export function fetchUpdateBotCommand(id: number, data: Partial<Api.Telegram.BotCommandDef>) {
  return request({
    url: `/api/v1/telegram/admin/commands/${id}`,
    method: 'put',
    data
  });
}

/** Admin: the real catalog of backend-registered handlers — output-action types
 * (workflow.Engine.RegisterOutputActionHandler) and command handlers
 * (RegisterCommandHandler) — used to populate the "handler_name" picker for a
 * command with action_type=handler, and to know what a pipeline's
 * output_actions can actually reference. */
export function fetchListRegisteredHandlers() {
  return request<Api.Telegram.RegisteredHandlers>({
    url: '/api/v1/telegram/admin/workflow-handlers',
    method: 'get'
  });
}

/**
 * Admin: resolve a workflow select field's option source to its current
 * choices (see ManualFieldDef.options_source), so an operator can pick a
 * current item by name instead of typing an ID.
 */
export function fetchWorkflowOptionSource(source: string) {
  return request<{ options: Api.Telegram.SelectOption[] }>({
    url: `/api/v1/telegram/admin/workflow-option-sources/${encodeURIComponent(source)}`,
    method: 'get'
  });
}

/** Admin: paginated list of workflow definitions */
export function fetchGetWorkflowDefs(params: { page: number; page_size: number; keyword?: string }) {
  return request<{ list: Api.Telegram.WorkflowDef[]; total: number }>({
    url: '/api/v1/telegram/admin/workflows',
    method: 'get',
    params
  });
}

/** Admin: fetch one workflow definition detail */
export function fetchGetWorkflowDef(key: string) {
  return request<Api.Telegram.WorkflowDef>({
    url: `/api/v1/telegram/admin/workflows/${key}`,
    method: 'get'
  });
}

/** Admin: create a workflow definition */
export function fetchCreateWorkflowDef(data: Partial<Api.Telegram.WorkflowDef>) {
  return request<Api.Telegram.WorkflowDef>({
    url: '/api/v1/telegram/admin/workflows',
    method: 'post',
    data
  });
}

/** Admin: update a workflow definition. `key` is the workflow_key, NOT the
 * numeric id — the route is PUT /workflows/:key and the backend matches on
 * workflow_key. */
export function fetchUpdateWorkflowDef(key: string, data: Partial<Api.Telegram.WorkflowDef>) {
  return request({
    url: `/api/v1/telegram/admin/workflows/${key}`,
    method: 'put',
    data
  });
}

/** Admin: paginated list of workflow execution instances. `requester_name`
 * is a case-insensitive substring match, not exact. */
export function fetchGetWorkflowInstances(params: {
  page: number;
  page_size: number;
  workflow_key?: string;
  status?: string;
  requester_name?: string;
}) {
  return request<{ list: Api.Telegram.WorkflowInstance[]; total: number }>({
    url: '/api/v1/telegram/admin/workflow-instances',
    method: 'get',
    params
  });
}

/** Admin: delete every listed workflow instance in one call. */
export function fetchBatchDeleteWorkflowInstances(ids: number[]) {
  return request<{ deleted: number }>({
    url: '/api/v1/telegram/admin/workflow-instances/batch-delete',
    method: 'post',
    data: { ids }
  });
}

/** Admin: delete a bot command */
export function fetchDeleteBotCommand(commandOrId: string | number) {
  const cleanCmd = String(commandOrId).replace(/^\//, '');
  return request({
    url: `/api/v1/telegram/admin/commands/${cleanCmd}`,
    method: 'delete'
  });
}

/** Admin: delete multiple bot commands by their numeric id */
export function fetchBatchDeleteBotCommands(ids: number[]) {
  return request({
    url: '/api/v1/telegram/admin/commands/batch-delete',
    method: 'post',
    data: { ids }
  });
}

/** Admin: delete a workflow definition */
/** `key` is the workflow_key, not the numeric id (see fetchUpdateWorkflowDef). */
export function fetchDeleteWorkflowDef(key: string) {
  return request({
    url: `/api/v1/telegram/admin/workflows/${key}`,
    method: 'delete'
  });
}

/** Admin: delete multiple workflow definitions by their workflow_key */
export function fetchBatchDeleteWorkflowDefs(keys: string[]) {
  return request({
    url: '/api/v1/telegram/admin/workflows/batch-delete',
    method: 'post',
    data: { keys }
  });
}

/** Admin: get one workflow instance */
export function fetchGetWorkflowInstance(id: number) {
  return request<Api.Telegram.WorkflowInstance>({
    url: `/api/v1/telegram/admin/workflow-instances/${id}`,
    method: 'get'
  });
}

/** Admin/OPS: force-run a registered output handler by type, regardless of pipeline state
 * (debug/ops escape hatch — does NOT advance the instance's state, see
 * fetchDispatchWorkflowTransition for that). */
export function fetchExecuteWorkflowAction(id: number, actionType: string, payload: Record<string, string>) {
  return request<Api.Telegram.WorkflowInstance>({
    url: `/api/v1/telegram/admin/workflow-instances/${id}/action`,
    method: 'post',
    data: { action_type: actionType, payload }
  });
}

/** Admin/OPS/APPROVER: submit a real pipeline transition (event, optional note,
 * optional structured form data) for any workflow-defined transition,
 * usable by any backend-defined ticket type's transitions. */
export function fetchDispatchWorkflowTransition(
  id: number,
  data: { event: string; note?: string; vars?: Record<string, string> }
) {
  return request<Api.Telegram.WorkflowInstance>({
    url: `/api/v1/telegram/admin/workflow-instances/${id}/transition`,
    method: 'post',
    data
  });
}

/** Admin: delete a workflow instance */
export function fetchDeleteWorkflowInstance(id: number) {
  return request({
    url: `/api/v1/telegram/admin/workflow-instances/${id}`,
    method: 'delete'
  });
}

// ---- Bots (run by the Telegram Agent)

export function fetchGetTelegramBots(params: {
  page: number;
  page_size: number;
  keyword?: string;
  enabled?: boolean;
  status?: string;
}) {
  return request<{ list: Api.Telegram.Bot[]; total: number }>({
    url: '/api/v1/telegram/admin/bots',
    method: 'get',
    params
  });
}

export function fetchCreateTelegramBot(data: Api.Telegram.BotInput) {
  return request<Api.Telegram.Bot>({ url: '/api/v1/telegram/admin/bots', method: 'post', data });
}

export function fetchUpdateTelegramBot(id: number, data: Api.Telegram.BotInput) {
  return request<Api.Telegram.Bot>({ url: `/api/v1/telegram/admin/bots/${id}`, method: 'put', data });
}

export function fetchDeleteTelegramBots(ids: number[]) {
  return request({ url: '/api/v1/telegram/admin/bots/batch-delete', method: 'post', data: { ids } });
}

export function fetchEnableTelegramBots(ids: number[], enabled: boolean) {
  return request({ url: '/api/v1/telegram/admin/bots/batch-enable', method: 'post', data: { ids, enabled } });
}

/** Asks the Telegram Agent to push the bot's command menu to Telegram now. */
export function fetchSyncTelegramBotCommands(id: number) {
  return request({ url: `/api/v1/telegram/admin/bots/${id}/sync-commands`, method: 'post' });
}

// ---- Forward rules

export function fetchGetTelegramForwardRules(params: {
  page: number;
  page_size: number;
  keyword?: string;
  account_id?: number;
  source_type?: string;
  subscription_id?: number;
  target_class?: string;
  target_kind?: string;
  enabled?: boolean;
}) {
  return request<{ list: Api.Telegram.ForwardRule[]; total: number }>({
    url: '/api/v1/telegram/admin/forward-rules',
    method: 'get',
    params
  });
}

export function fetchCreateTelegramForwardRule(data: Partial<Api.Telegram.ForwardRule>) {
  return request<Api.Telegram.ForwardRule>({ url: '/api/v1/telegram/admin/forward-rules', method: 'post', data });
}

export function fetchUpdateTelegramForwardRule(id: number, data: Partial<Api.Telegram.ForwardRule>) {
  return request<Api.Telegram.ForwardRule>({ url: `/api/v1/telegram/admin/forward-rules/${id}`, method: 'put', data });
}

export function fetchDeleteTelegramForwardRules(ids: number[]) {
  return request({ url: '/api/v1/telegram/admin/forward-rules/batch-delete', method: 'post', data: { ids } });
}

export function fetchEnableTelegramForwardRules(ids: number[], enabled: boolean) {
  return request({ url: '/api/v1/telegram/admin/forward-rules/batch-enable', method: 'post', data: { ids, enabled } });
}

/** Makes the subscription's account leave the channel and disables the subscription. */
export function fetchLeaveTelegramClientSubscription(id: number) {
  return request({ url: `/api/v1/telegram/admin/client-subscriptions/${id}/leave`, method: 'post' });
}

// ---- TG Agents (heartbeats written by the agents themselves)

export function fetchGetTelegramAgents(params: {
  page: number;
  page_size: number;
  keyword?: string;
  online?: boolean;
}) {
  return request<{ list: Api.Telegram.Agent[]; total: number; summary: Api.Telegram.AgentSummary }>({
    url: '/api/v1/telegram/admin/agents',
    method: 'get',
    params
  });
}

/** Removes the heartbeat rows of agents that no longer exist. */
export function fetchDeleteTelegramAgents(ids: number[]) {
  return request({ url: '/api/v1/telegram/admin/agents/batch-delete', method: 'post', data: { ids } });
}

/** One cached message with its full text (lists do not carry the text). */
export function fetchGetTelegramClientMessage(id: number) {
  return request<Api.Telegram.ClientMessage>({ url: `/api/v1/telegram/admin/client-messages/${id}`, method: 'get' });
}

/** delete discards, retry forwards again, consume marks consumed without forwarding */
export function fetchBatchTelegramClientMessages(ids: number[], action: 'delete' | 'retry' | 'consume') {
  return request({ url: '/api/v1/telegram/admin/client-messages/batch', method: 'post', data: { ids, action } });
}

export function fetchEnableTelegramClientSubscriptions(ids: number[], enabled: boolean) {
  return request({
    url: '/api/v1/telegram/admin/client-subscriptions/batch-enable',
    method: 'post',
    data: { ids, enabled }
  });
}

// ---- Forward channels

export function fetchGetTelegramForwardChannels(params: {
  page: number;
  page_size: number;
  keyword?: string;
  transport?: string;
  consumer?: string;
  enabled?: boolean;
}) {
  return request<{ list: Api.Telegram.ForwardChannel[]; total: number }>({
    url: '/api/v1/telegram/admin/forward-channels',
    method: 'get',
    params
  });
}

/** The passwords are write-only: empty keeps the stored one. */
export type TelegramForwardChannelInput = Partial<Api.Telegram.ForwardChannel> & {
  redis_password?: string;
  kafka_password?: string;
  clear_secrets?: boolean;
};

export function fetchCreateTelegramForwardChannel(data: TelegramForwardChannelInput) {
  return request<Api.Telegram.ForwardChannel>({ url: '/api/v1/telegram/admin/forward-channels', method: 'post', data });
}

export function fetchUpdateTelegramForwardChannel(id: number, data: TelegramForwardChannelInput) {
  return request<Api.Telegram.ForwardChannel>({
    url: `/api/v1/telegram/admin/forward-channels/${id}`,
    method: 'put',
    data
  });
}

export function fetchDeleteTelegramForwardChannels(ids: number[]) {
  return request({ url: '/api/v1/telegram/admin/forward-channels/batch-delete', method: 'post', data: { ids } });
}

export function fetchEnableTelegramForwardChannels(ids: number[], enabled: boolean) {
  return request({
    url: '/api/v1/telegram/admin/forward-channels/batch-enable',
    method: 'post',
    data: { ids, enabled }
  });
}

export function fetchTestTelegramForwardChannel(id: number) {
  return request({ url: `/api/v1/telegram/admin/forward-channels/${id}/test`, method: 'post' });
}
