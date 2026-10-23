<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { formatDateTime } from '@/utils/date';
import {
  NButton,
  NCollapse,
  NCollapseItem,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NTag,
  NTimeline,
  NTimelineItem,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchDispatchWorkflowTransition, fetchWorkflowOptionSource } from '@/service/api';
import { guardRoleLabel, isDestructiveTransition, resolveTransitionLabel } from '@/utils/workflow';
import PipelineFlowchart from '@/views/workflow/components/pipeline-flowchart.vue';

// Ticket detail drawer + manual-transition-execution modal, shared by every
// page that lists workflow instances (web/src/views/workflow/instances and
// web/src/views/domain-purchase/orders today). This used to be copy-pasted
// into each page separately, which is exactly how the two drifted apart —
// domain-purchase/orders kept the old "generic button + event dropdown"
// design (and an outdated PipelineFlowchart copy with none of this file's
// improvements) long after workflow/instances moved to the current
// one-button-per-transition design with a real note-collection UI. There's
// now exactly one place this logic lives, so a new backend-defined
// transition (its label, whether it needs a note, its manual_fields —
// entirely pipeline-JSON-driven, see resolveTransitionLabel/
// availableTransitions below) automatically renders correctly everywhere
// this component is used, and there is nothing left to keep in sync by hand.

const props = defineProps<{
  show: boolean;
  instance: Api.Telegram.WorkflowInstance | null;
  workflows: Api.Telegram.WorkflowDef[];
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  // Fired after a transition is successfully dispatched, so the caller's
  // list (and its own copy of `instance`) can be refreshed — this
  // component doesn't own the list.
  (e: 'action-executed'): void;
}>();

const { t } = useI18n();
const message = useMessage();

function closeDrawer() {
  emit('update:show', false);
}

function statusTag(status: string) {
  switch (status) {
    case 'running':
      return { type: 'info' as const, label: t('page.workflow.instances.statusTagRunning') };
    case 'completed':
      return { type: 'success' as const, label: t('page.workflow.instances.statusTagCompleted') };
    case 'rejected':
      return { type: 'error' as const, label: t('page.workflow.instances.statusTagRejected') };
    case 'failed':
      return { type: 'error' as const, label: t('page.workflow.instances.statusTagFailed') };
    default:
      return { type: 'default' as const, label: status };
  }
}

function formatTime(str?: string | null) {
  return formatDateTime(str);
}

function requesterDisplay(row: Api.Telegram.WorkflowInstance): string {
  return row.requester_name || '-';
}

// Sized when the drawer opens rather than as a plain computed: a ticket
// carries a wide flowchart plus a form, so a fixed 560px was unusable, and
// a fixed large width would overflow a small screen.
const drawerWidth = ref(760);
watch(
  () => props.show,
  visible => {
    if (visible) {
      drawerWidth.value = Math.round(Math.min(Math.max(window.innerWidth * 0.62, 560), 1000));
    }
  }
);

const parsedInstanceHistory = computed(() => {
  if (!props.instance?.history_json) return [];
  try {
    return JSON.parse(props.instance.history_json);
  } catch {
    return [];
  }
});

const parsedInstanceContext = computed<Record<string, any>>(() => {
  if (!props.instance?.context_data_json) return {};
  try {
    return JSON.parse(props.instance.context_data_json) ?? {};
  } catch {
    return {};
  }
});

/** The WorkflowDef backing the open instance, and its parsed pipeline. */
const selectedWorkflowDef = computed(() => props.workflows.find(w => w.workflow_key === props.instance?.workflow_key));

const selectedPipeline = computed<any>(() => {
  if (!selectedWorkflowDef.value?.pipeline_json) return null;
  try {
    return JSON.parse(selectedWorkflowDef.value.pipeline_json);
  } catch {
    return null;
  }
});

/** The pipeline definition of the state the instance is currently sitting in. */
const currentStateDef = computed<any>(() => {
  const key = props.instance?.current_state;
  if (!key) return null;
  return selectedPipeline.value?.states?.[key] ?? null;
});

/** Human-facing state name ("发起采购申请"), falling back to the raw key. */
const currentStateName = computed(() => currentStateDef.value?.name || props.instance?.current_state || '-');

/**
 * Ticket content: the instance's context vars rendered as readable rows
 * instead of a raw JSON blob. Keys prefixed with "_" are transport
 * plumbing (the raw chat-platform identity the engine injects — see
 * HandleIncomingText) and are grouped separately so the business fields
 * the ticket is actually about stay on top.
 */
/**
 * Context keys the engine writes for its own bookkeeping, as opposed to the
 * business facts the ticket is about. Mirrors what the Go side injects:
 * `_`-prefixed transport identity from HandleIncomingText, `payload`/`paramN`
 * from MatchCommand, and `operator`/`last_event`/`note` from DispatchEvent
 * (see pkg/workflow/engine.go). They are still shown — an operator debugging
 * "why did it read the domain that way" needs the raw message — just not
 * mixed in with 采购域名 and 年度价格 as if they were the ticket's content.
 */
const enginePlumbingKeys = new Set([
  'payload',
  'last_event',
  'operator',
  'note',
  'request_id',
  'instance_id',
  'requester'
]);

function isEngineVar(key: string): boolean {
  return key.startsWith('_') || enginePlumbingKeys.has(key) || /^param\d+$/.test(key);
}

const contextEntries = computed(() => {
  const entries = Object.entries(parsedInstanceContext.value);
  const business = entries.filter(([k]) => !isEngineVar(k));
  // Telegram's first/last name fields are not an identity worth showing —
  // they're whatever free text the person typed into their chat profile, and
  // a workflow identifies people by account handle (see model.ActorName), so
  // they're dropped rather than rendered as 姓名 / 姓氏 rows.
  const internal = entries.filter(([k]) => isEngineVar(k) && k !== '_sender_first_name' && k !== '_sender_last_name');
  return { business, internal };
});

/** Labels for engine-injected keys — otherwise these show as bare internal
 * var names, which mean nothing to an operator. */
const internalVarLabels = computed<Record<string, string>>(() => ({
  _sender_username: t('page.workflow.instances.contextKeys.senderUsername'),
  payload: t('page.workflow.instances.contextKeys.payload'),
  param1: t('page.workflow.instances.contextKeys.param1'),
  last_event: t('page.workflow.instances.contextKeys.lastEvent'),
  operator: t('page.workflow.instances.contextKeys.operator'),
  note: t('page.workflow.instances.contextKeys.note'),
  request_id: t('page.workflow.instances.contextKeys.requestId'),
  instance_id: t('page.workflow.instances.contextKeys.instanceId'),
  requester: t('page.workflow.instances.contextKeys.requester')
}));

function contextLabel(key: string) {
  if (internalVarLabels.value[key]) return internalVarLabels.value[key];
  // Prefer the pipeline's own manual_fields label for a key when one
  // declares it, so a ticket shows "DNS/域名供应商" rather than
  // "provider_id" — the same wording the operator filled the form in with.
  for (const state of Object.values<any>(selectedPipeline.value?.states ?? {})) {
    for (const transition of Object.values<any>(state?.transitions ?? {})) {
      for (const field of transition?.manual_fields ?? []) {
        if (field.key === key && field.label) return field.label;
      }
    }
  }
  return key;
}

/** Splits a comma-separated context value (e.g. a Repeatable field's stored
 * value — see workflow.ManualFieldDef.Repeatable) into its individual
 * items; a value with no comma is returned as its own single-item list, so
 * callers don't need a separate "is this even a list" branch. */
function contextValueItems(value: unknown): string[] {
  const str = value === undefined || value === null ? '' : String(value);
  if (str === '') return [];
  return str
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

/** How many items of a multi-value field are shown inline before the rest
 * collapse behind a "+N" control. A purchase can name a dozen domains; all
 * of them inline turns a two-line description row into a wall that pushes
 * the actions and the flowchart off screen. */
const inlineItemLimit = 4;

const allItemsModalVisible = ref(false);
const allItemsModalLabel = ref('');
const allItemsModalValues = ref<string[]>([]);

function showAllItems(label: string, items: string[]) {
  allItemsModalLabel.value = label;
  allItemsModalValues.value = items;
  allItemsModalVisible.value = true;
}

// Manual transition execution — driven entirely by the current instance's
// WorkflowDef pipeline_json, not a fixed field set: any backend-defined
// ticket type's transitions available from the current state show up here
// automatically, with a note field (when the transition requires one) and
// a form generated from its manual_fields.
interface ManualFieldDef {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  /** Names a backend-registered option source (see workflow/options.go). */
  options_source?: string;
  /**
   * Increment (and therefore decimal precision) of a "number" field —
   * "0.01" for a price in yuan, "1" for a whole count. Declared by the
   * pipeline rather than assumed here, so a money field and a count field
   * both get the right input without this component knowing which is which.
   */
  step?: string;
  /**
   * This field can collect more than one value (e.g. several domains in one
   * purchase request) — see workflow.ManualFieldDef.Repeatable on the Go
   * side. Rendered as a table with an add/remove-able row per value,
   * seeded from however many comma-separated values the ticket's context
   * already has for this key (minimum one row).
   */
  repeatable?: boolean;
  /**
   * Ties this repeatable field to every other repeatable field sharing the
   * same group into ONE row set (e.g. domain + its price, one row per
   * domain) instead of independently growable lists — see
   * workflow.ManualFieldDef.Group.
   */
  group?: string;
}

/** A single row of a repeatable (possibly grouped) field's table. id is a
 * stable, monotonically-assigned identifier used as the v-for :key — NOT
 * the row's array index, which would silently shift Vue's DOM-to-data
 * mapping out of sync (a value seemingly "not removable", or edits landing
 * in the wrong row) every time a row before it is removed. */
interface RepeatableRow {
  id: number;
  values: Record<string, string>;
}

// Options resolved from the backend, keyed by source name. Cached for the
// component's lifetime: a source backs a picker that may appear on several
// tickets, and its contents (e.g. the configured DNS providers) don't
// change while an operator works through a queue.
const optionSourceCache = reactive<Record<string, Api.Telegram.SelectOption[]>>({});

async function loadOptionSource(source: string) {
  if (optionSourceCache[source]) return;
  try {
    const { data } = await fetchWorkflowOptionSource(source);
    optionSourceCache[source] = data?.options ?? [];
  } catch {
    // Leave it unset so fieldOptions falls back to a free-text input rather
    // than rendering an empty dropdown the operator can't get past.
  }
}

/**
 * Choices for one manual field: the static list the pipeline declares, else
 * whatever its options_source resolved to.
 */
function fieldOptions(field: ManualFieldDef): { label: string; value: string }[] {
  if (field.options?.length) {
    return field.options.map(o => ({ label: o, value: o }));
  }
  if (field.options_source) {
    return (optionSourceCache[field.options_source] ?? []).map(o => ({ label: o.label, value: o.value }));
  }
  return [];
}

/** Decimal places implied by a field's declared step — "0.01" → 2, "1" or
 * unset → 0. Derived rather than configured separately so a pipeline author
 * only has to state the step. */
function fieldPrecision(field: ManualFieldDef): number {
  const decimals = (field.step ?? '').split('.')[1];
  return decimals ? decimals.length : 0;
}

function fieldStep(field: ManualFieldDef): number {
  const parsed = Number(field.step);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Number fields are edited as numbers but stored as strings, because that
 * is the wire format for every manual field (DispatchEvent's extraVars is a
 * map[string]string, and a repeatable field's values are comma-joined into
 * one). These two adapt NInputNumber to that store without changing it. */
function numberValueOf(store: Record<string, string>, key: string): number | null {
  const raw = store[key];
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function setNumberValue(store: Record<string, string>, key: string, precision: number, value: number | null) {
  store[key] = value === null || value === undefined ? '' : value.toFixed(precision);
}

interface TransitionOption {
  event: string;
  /** Same caption the Telegram card shows for this operation. */
  label: string;
  destructive: boolean;
  targetState: string;
  targetStateName: string;
  guardRole?: string;
  requireNote?: boolean;
  notePrompt?: string;
  manualFields: ManualFieldDef[];
}

const availableTransitions = computed<TransitionOption[]>(() => {
  const stateDef = currentStateDef.value;
  if (!stateDef?.transitions) return [];
  return Object.entries(stateDef.transitions).map(([event, tr]: [string, any]) => ({
    event,
    label: resolveTransitionLabel(stateDef, event, tr),
    destructive: isDestructiveTransition(event),
    targetState: tr.target_state,
    targetStateName: selectedPipeline.value?.states?.[tr.target_state]?.name || tr.target_state,
    guardRole: tr.guard_role,
    requireNote: !!tr.require_note,
    notePrompt: tr.note_prompt,
    manualFields: tr.manual_fields ?? []
  }));
});

const manualActionModalVisible = ref(false);
const manualActionEvent = ref('');
const manualActionNote = ref('');
const manualActionPayload = reactive<Record<string, string>>({});
// Repeatable fields' rows, keyed by group key (see groupKeyOf) — every
// repeatable field in the same group shares one row set, so "domain" and
// "annual_price_cents" stay index-paired instead of being two independently
// growable lists. Joined column-wise into manualActionPayload[key] as a
// comma-separated string right before submit (see triggerManualAction), so
// the wire format (DispatchEvent's extraVars) never changes.
const repeatableRows = reactive<Record<string, RepeatableRow[]>>({});
let nextRowId = 1;

const selectedTransition = computed(() => availableTransitions.value.find(tr => tr.event === manualActionEvent.value));

/** The row-set key a repeatable field belongs to — its own Group when set, else its own Key (an unpaired solo list). */
function groupKeyOf(field: ManualFieldDef): string {
  return field.group || field.key;
}

/** Every repeatable field sharing field's group, in declaration order. */
function fieldsInGroup(field: ManualFieldDef): ManualFieldDef[] {
  const key = groupKeyOf(field);
  return (selectedTransition.value?.manualFields ?? []).filter(f => f.repeatable && groupKeyOf(f) === key);
}

/** Whether field is the first (in declaration order) of its group — the
 * one that should actually render the group's table, so the group isn't
 * rendered once per member field. */
function isFirstInGroup(field: ManualFieldDef): boolean {
  const group = fieldsInGroup(field);
  return group.length > 0 && group[0].key === field.key;
}

/** Combined column header for a group's table, e.g. "采购域名 / 年度价格(分)". */
function groupLabel(field: ManualFieldDef): string {
  return fieldsInGroup(field)
    .map(f => f.label)
    .join(' / ');
}

function addRow(groupKey: string, fields: ManualFieldDef[]) {
  const values: Record<string, string> = {};
  for (const f of fields) values[f.key] = '';
  (repeatableRows[groupKey] ??= []).push({ id: nextRowId++, values });
}

function removeRow(groupKey: string, rowId: number) {
  const rows = repeatableRows[groupKey];
  if (!rows) return;
  const idx = rows.findIndex(r => r.id === rowId);
  if (idx !== -1) rows.splice(idx, 1);
}

function resetManualActionForm() {
  manualActionNote.value = '';
  Object.keys(manualActionPayload).forEach(key => Reflect.deleteProperty(manualActionPayload, key));
  Object.keys(repeatableRows).forEach(key => Reflect.deleteProperty(repeatableRows, key));

  const fields = selectedTransition.value?.manualFields ?? [];
  const seededGroups = new Set<string>();

  for (const field of fields) {
    if (field.options_source) {
      loadOptionSource(field.options_source);
    }

    if (!field.repeatable) {
      // Prefill from the ticket's own context when it already carries this
      // key, so the operator isn't asked to retype it — stays editable.
      const existing = parsedInstanceContext.value[field.key];
      manualActionPayload[field.key] = existing === undefined || existing === null ? '' : String(existing);
      continue;
    }

    const groupKey = groupKeyOf(field);
    if (seededGroups.has(groupKey)) continue;
    seededGroups.add(groupKey);

    const groupFields = fieldsInGroup(field);
    // Each field in the group may have a different number of existing
    // comma-separated values (e.g. `domain` came from the original chat
    // request, `annual_price_cents` never did) — pad every column out to
    // the longest one so no domain silently loses its row.
    const perFieldValues = groupFields.map(f => {
      const existing = parsedInstanceContext.value[f.key];
      return existing
        ? String(existing)
            .split(',')
            .map(v => v.trim())
            .filter(Boolean)
        : [];
    });
    const rowCount = Math.max(1, ...perFieldValues.map(v => v.length));
    const rows: RepeatableRow[] = [];
    for (let i = 0; i < rowCount; i += 1) {
      const values: Record<string, string> = {};
      groupFields.forEach((f, fi) => {
        values[f.key] = perFieldValues[fi][i] ?? '';
      });
      rows.push({ id: nextRowId++, values });
    }
    repeatableRows[groupKey] = rows;
  }
}
watch(manualActionEvent, resetManualActionForm);

/**
 * Open the confirmation form for one specific action. Each transition gets
 * its own button in the drawer (approve / reject / ...), so the operator
 * picks the operation directly instead of first opening a generic dialog
 * and then choosing an event from a dropdown.
 *
 * A transition that needs nothing from the operator (no note, no manual
 * fields) still routes through the modal so it gets a confirmation step —
 * these transitions are not reversible.
 */
function openManualActionModal(event: string) {
  if (!availableTransitions.value.some(tr => tr.event === event)) return;
  manualActionEvent.value = event;
  resetManualActionForm();
  manualActionModalVisible.value = true;
}

async function triggerManualAction() {
  if (!props.instance || !manualActionEvent.value) return;
  const vars: Record<string, string> = { ...manualActionPayload };
  const fields = selectedTransition.value?.manualFields ?? [];
  const handledGroups = new Set<string>();
  for (const field of fields) {
    if (!field.repeatable) continue;
    const groupKey = groupKeyOf(field);
    if (handledGroups.has(groupKey)) continue;
    handledGroups.add(groupKey);

    const groupFields = fieldsInGroup(field);
    // Drop only rows where every field in the group is blank (an add-then-
    // abandoned row) — a row with at least one value keeps its place so
    // every column stays aligned to the same domain.
    const rows = (repeatableRows[groupKey] ?? []).filter(row => groupFields.some(f => row.values[f.key]?.trim()));
    for (const f of groupFields) {
      vars[f.key] = rows.map(row => (row.values[f.key] ?? '').trim()).join(',');
    }
  }
  try {
    await fetchDispatchWorkflowTransition(props.instance.id, {
      event: manualActionEvent.value,
      note: manualActionNote.value || undefined,
      vars
    });
    message.success(t('page.workflow.instances.actionExecuted'));
    manualActionModalVisible.value = false;
    emit('action-executed');
    closeDrawer();
  } catch (err: any) {
    message.error(err.message || t('page.workflow.instances.actionFailed'));
  }
}
</script>

<template>
  <!-- Drawer: Ticket Detail, Execution Timeline & Actions -->
  <NDrawer :show="show" :width="drawerWidth" placement="right" @update:show="emit('update:show', $event)">
    <NDrawerContent
      v-if="instance"
      :title="t('page.workflow.instances.drawerTitle', { id: instance.id })"
      closable
      @close="closeDrawer"
    >
      <div class="flex-col gap-18px">
        <!-- Ticket summary: what this ticket IS, before any diagram -->
        <div>
          <div class="text-13px font-bold text-gray-700 dark:text-gray-300 mb-8px">
            {{ t('page.workflow.instances.infoTitle') }}
          </div>
          <NDescriptions bordered size="small" :column="2" label-placement="left">
            <NDescriptionsItem :label="t('page.workflow.instances.columns.workflowKey')">
              {{ selectedWorkflowDef?.name || instance.workflow_key }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('common.status')">
              <NTag size="small" :type="statusTag(instance.status).type" :bordered="false">
                {{ statusTag(instance.status).label }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('page.workflow.instances.columns.currentState')">
              <NTag size="small" type="info" :bordered="false">{{ currentStateName }}</NTag>
              <span class="ml-6px font-mono text-11px text-gray-400">{{ instance.current_state }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('page.workflow.instances.columns.requesterName')">
              {{ requesterDisplay(instance) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('page.workflow.instances.businessType')">
              {{ instance.business_type || '-' }}
              <span v-if="instance.business_id" class="font-mono text-11px text-gray-400">
                #{{ instance.business_id }}
              </span>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('page.workflow.instances.columns.createdAt')">
              {{ formatTime(instance.created_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="instance.finished_at" :label="t('page.workflow.instances.finishedAt')">
              {{ formatTime(instance.finished_at) }}
            </NDescriptionsItem>
          </NDescriptions>
        </div>

        <!--
 Ticket content: the business fields this ticket is actually
             about, rendered readably instead of as a raw JSON blob.
-->
        <div>
          <div class="text-13px font-bold text-gray-700 dark:text-gray-300 mb-8px">
            {{ t('page.workflow.instances.ticketContentTitle') }}
          </div>
          <NDescriptions v-if="contextEntries.business.length" bordered size="small" :column="1" label-placement="left">
            <NDescriptionsItem v-for="[key, value] in contextEntries.business" :key="key" :label="contextLabel(key)">
              <!--
 A Repeatable field's stored value (e.g. several purchased
                   domains) is comma-joined on the wire — shown as separate
                   tags instead of a single hard-to-scan "a.com,b.com,k.io"
                   string. A single value renders as plain text, unchanged.
-->
              <NSpace v-if="contextValueItems(value).length > 1" :size="6" align="center">
                <NTag
                  v-for="item in contextValueItems(value).slice(0, inlineItemLimit)"
                  :key="item"
                  size="small"
                  :bordered="false"
                  type="info"
                >
                  {{ item }}
                </NTag>
                <NButton
                  v-if="contextValueItems(value).length > inlineItemLimit"
                  size="tiny"
                  quaternary
                  type="primary"
                  @click="showAllItems(contextLabel(key), contextValueItems(value))"
                >
                  +{{ contextValueItems(value).length - inlineItemLimit }}
                </NButton>
              </NSpace>
              <span v-else class="break-all">{{ value === '' ? '-' : value }}</span>
            </NDescriptionsItem>
          </NDescriptions>
          <NEmpty v-else size="small" :description="t('page.workflow.instances.noContext')" />

          <NCollapse v-if="contextEntries.internal.length" class="mt-8px">
            <NCollapseItem :title="t('page.workflow.instances.internalVarsTitle')" name="internal">
              <!--
 Identity as parameters, in the same table as everything
                   else: the account handle, its ID, and the chat account it
                   came from. Telegram's profile first/last name are
                   deliberately not here — a workflow identifies people by
                   account handle, not by whatever they typed as a display
                   name (see model.ActorName on the Go side).
-->
              <NDescriptions bordered size="small" :column="1" label-placement="left">
                <NDescriptionsItem :label="t('page.workflow.instances.linkedSystemUser')">
                  <span class="break-all">{{ instance.requester_name || '-' }}</span>
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('page.workflow.instances.linkedSystemUserId')">
                  <span class="font-mono">{{ instance.requester_user_id || '-' }}</span>
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('page.workflow.instances.linkedTelegramUser')">
                  <span class="font-mono">{{ instance.requester_telegram_user_id || '-' }}</span>
                </NDescriptionsItem>
                <NDescriptionsItem
                  v-for="[key, value] in contextEntries.internal"
                  :key="key"
                  :label="contextLabel(key)"
                >
                  <span class="break-all whitespace-pre-wrap">{{ value === '' ? '-' : value }}</span>
                </NDescriptionsItem>
              </NDescriptions>
            </NCollapseItem>
          </NCollapse>
        </div>

        <!--
 Available operations: one button per transition the current
             state declares — the same operations the Telegram card offers,
             with the same captions (see resolveTransitionLabel).
-->
        <div v-if="instance.status === 'running'">
          <div class="text-13px font-bold text-gray-700 dark:text-gray-300 mb-8px">
            {{ t('page.workflow.instances.actionsTitle') }}
          </div>
          <div
            v-if="availableTransitions.length"
            class="p-14px rounded-10px border border-primary/30 bg-primary/5 dark:bg-primary/10"
          >
            <NSpace :size="12">
              <NButton
                v-for="tr in availableTransitions"
                :key="tr.event"
                :type="tr.destructive ? 'error' : 'primary'"
                size="large"
                strong
                @click="openManualActionModal(tr.event)"
              >
                {{ tr.label }}
                <span v-if="tr.guardRole" class="ml-8px text-10px opacity-75">{{ guardRoleLabel(tr.guardRole) }}</span>
              </NButton>
            </NSpace>
          </div>
          <NEmpty v-else size="small" :description="t('page.workflow.instances.noActionAvailable')" />
        </div>

        <!-- Flowchart with active state -->
        <div v-if="selectedWorkflowDef">
          <div class="text-13px font-bold text-gray-700 dark:text-gray-300 mb-8px">
            {{ t('page.workflow.instances.topologyTitle') }}
          </div>
          <PipelineFlowchart
            :pipeline-json="selectedWorkflowDef.pipeline_json || ''"
            :active-state="instance.current_state"
            :history="parsedInstanceHistory"
          />
        </div>

        <!-- Timeline History -->
        <div>
          <div class="text-13px font-bold text-gray-700 dark:text-gray-300 mb-10px">
            {{ t('page.workflow.instances.historyTitle') }}
          </div>
          <NTimeline>
            <NTimelineItem
              v-for="(hist, hIdx) in parsedInstanceHistory"
              :key="hIdx"
              :type="hIdx === parsedInstanceHistory.length - 1 ? 'success' : 'info'"
              :title="`${hist.event} (${hist.from_state || t('page.workflow.instances.initialStateFallback')} ➔ ${hist.to_state})`"
              :time="formatTime(hist.timestamp)"
            >
              <div class="text-12px text-gray-500">
                <span>
                  {{ t('page.workflow.instances.operatorLabel') }}
                  <b class="text-gray-700 dark:text-gray-300">
                    {{ hist.operator || t('page.workflow.instances.systemFallback') }}
                  </b>
                </span>
                <span v-if="hist.note" class="ml-8px text-gray-400">
                  {{ t('page.workflow.instances.noteLabel') }} {{ hist.note }}
                </span>
              </div>
            </NTimelineItem>
          </NTimeline>
        </div>
      </div>
    </NDrawerContent>
  </NDrawer>

  <!--
 Modal: Manual Transition Execution — the event list and the note/
       field requirements are entirely driven by the current state's
       transitions (see pkg/workflow/types.go's TransitionDef on the Go
       side), so a new backend-defined ticket type's transition needs a
       form here without any frontend change.
-->
  <NModal
    v-model:show="manualActionModalVisible"
    preset="card"
    :title="
      selectedTransition
        ? t('page.workflow.instances.confirmActionTitle', { action: selectedTransition.label })
        : t('page.workflow.instances.manualActionModalTitle')
    "
    class="max-w-520px"
  >
    <NForm label-placement="top">
      <!-- What this action will do, spelled out before confirming. -->
      <div
        v-if="selectedTransition"
        class="mb-14px p-10px rounded-8px text-12px bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
      >
        <span class="text-gray-500">{{ t('page.workflow.instances.transitionPreview') }}</span>
        <b class="text-gray-700 dark:text-gray-300">{{ currentStateName }}</b>
        <span class="mx-6px text-gray-400">➔</span>
        <b :class="selectedTransition.destructive ? 'text-red-600' : 'text-primary'">
          {{ selectedTransition.targetStateName }}
        </b>
      </div>
      <NFormItem
        v-if="selectedTransition?.requireNote"
        :label="selectedTransition.notePrompt || t('page.workflow.instances.executeNoteLabel')"
        required
      >
        <NInput
          v-model:value="manualActionNote"
          type="textarea"
          :placeholder="selectedTransition.notePrompt || t('page.workflow.instances.executeNotePlaceholder')"
        />
      </NFormItem>
      <template v-for="field in selectedTransition?.manualFields ?? []" :key="field.key">
        <!--
 Repeatable (possibly grouped) field: rendered once per group, by
             whichever field is first in declaration order — a table with
             one add/remove-able row per value, every field in the group
             kept index-aligned (e.g. domain + its own price). The add
             button is always available; remove appears once there's more
             than one row, so an operator is never stuck unable to add past
             — or remove back down from — whatever count the ticket
             happened to seed.
-->
        <NFormItem
          v-if="field.repeatable && isFirstInGroup(field)"
          :label="groupLabel(field)"
          :required="field.required"
        >
          <div class="flex-col gap-8px w-full">
            <NSpace
              v-for="row in repeatableRows[groupKeyOf(field)] ?? []"
              :key="row.id"
              :wrap="false"
              align="center"
              class="w-full"
            >
              <div v-for="gf in fieldsInGroup(field)" :key="gf.key" class="flex-1">
                <div v-if="fieldsInGroup(field).length > 1" class="text-11px text-gray-400 mb-2px">{{ gf.label }}</div>
                <NSelect
                  v-if="gf.type === 'select' && fieldOptions(gf).length > 0"
                  v-model:value="row.values[gf.key]"
                  :placeholder="gf.placeholder"
                  filterable
                  :options="fieldOptions(gf)"
                />
                <NInputNumber
                  v-else-if="gf.type === 'number'"
                  :value="numberValueOf(row.values, gf.key)"
                  :min="0"
                  :step="fieldStep(gf)"
                  :precision="fieldPrecision(gf)"
                  :placeholder="gf.placeholder"
                  class="w-full"
                  @update:value="v => setNumberValue(row.values, gf.key, fieldPrecision(gf), v)"
                />
                <NInput v-else v-model:value="row.values[gf.key]" :placeholder="gf.placeholder" />
              </div>
              <NButton
                v-if="(repeatableRows[groupKeyOf(field)]?.length ?? 0) > 1"
                size="small"
                quaternary
                circle
                @click="removeRow(groupKeyOf(field), row.id)"
              >
                <template #icon><span class="i-carbon-close" /></template>
              </NButton>
            </NSpace>
            <NButton size="small" dashed @click="addRow(groupKeyOf(field), fieldsInGroup(field))">
              + {{ t('page.workflow.instances.addAnotherDomain') }}
            </NButton>
          </div>
        </NFormItem>

        <NFormItem v-else-if="!field.repeatable" :label="field.label" :required="field.required">
          <!--
 A "select" with neither static options nor a resolved
               options_source would render an empty, unusable dropdown and
               dead-end a required field, so it falls back to free text.
-->
          <NSelect
            v-if="field.type === 'select' && fieldOptions(field).length > 0"
            v-model:value="manualActionPayload[field.key]"
            :placeholder="field.placeholder"
            filterable
            :options="fieldOptions(field)"
          />
          <NInputNumber
            v-else-if="field.type === 'number'"
            :value="numberValueOf(manualActionPayload, field.key)"
            :min="0"
            :step="fieldStep(field)"
            :precision="fieldPrecision(field)"
            :placeholder="field.placeholder"
            class="w-full"
            @update:value="v => setNumberValue(manualActionPayload, field.key, fieldPrecision(field), v)"
          />
          <NInput
            v-else-if="field.type === 'textarea'"
            v-model:value="manualActionPayload[field.key]"
            type="textarea"
            :placeholder="field.placeholder"
          />
          <NInput v-else v-model:value="manualActionPayload[field.key]" :placeholder="field.placeholder" />
        </NFormItem>
      </template>
    </NForm>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="manualActionModalVisible = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="triggerManualAction">
          {{ t('page.workflow.instances.executeAndAdvance') }}
        </NButton>
      </NSpace>
    </template>
  </NModal>

  <!--
 Full list of a multi-value field, opened from the "+N" control — so a
       ticket naming a dozen domains stays readable inline without hiding
       any of them.
-->
  <NModal v-model:show="allItemsModalVisible" preset="card" :title="allItemsModalLabel" class="max-w-480px">
    <NSpace :size="6">
      <NTag v-for="item in allItemsModalValues" :key="item" size="small" :bordered="false" type="info">
        {{ item }}
      </NTag>
    </NSpace>
  </NModal>
</template>
