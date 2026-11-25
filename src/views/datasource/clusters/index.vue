<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  NTooltip,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import StatusSelect from '@/components/business/status-select.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchCreateCluster,
  fetchDeleteCluster,
  fetchGetClusterChange,
  fetchGetClusterChanges,
  fetchGetClusterEvents,
  fetchGetClusterKeys,
  fetchGetClusters,
  fetchGetDatasourceOptions,
  fetchUpdateCluster
} from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { operateWidth } from '@/utils/operate-width';

defineOptions({ name: 'DatasourceClusters' });

/**
 * The clusters operators report from (P12). One cluster is what one operator is for: it is registered here, access keys are bound to it, and once its operator has
 * connected the namespaces it reads are set here. Its events (the reasons of what happens in the cluster, as Kubernetes said them) are in the drawer. One page, no
 * tabs: the drawer is a view of one row.
 */
const PAGE_CODE = 'datasource_clusters';
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.datasource.clusters.${key}`, named ?? {});
const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const rows = ref<Api.Cluster.Cluster[]>([]);
const datasources = ref<Api.Datasource.DatasourceOption[]>([]);
const keys = ref<Api.Cluster.KeyChoice[]>([]);

const visible = ref(false);
const editing = ref<Api.Cluster.Cluster>();
function emptyForm() {
  return {
    name: '',
    description: '',
    enabled: true,
    datasource_id: 0,
    namespace_include: [] as string[],
    namespace_exclude: [] as string[],
    key_ids: [] as number[]
  };
}
const form = reactive(emptyForm());

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchGetClusters();
    rows.value = data?.list || [];
  } finally {
    loading.value = false;
  }
}

async function loadChoices() {
  const [ds, ks] = await Promise.all([fetchGetDatasourceOptions(), fetchGetClusterKeys()]);
  datasources.value = ds.data || [];
  keys.value = ks.data?.list || [];
}

const datasourceOptions = computed(() => [
  { label: p('datasourceNone'), value: 0 },
  ...datasources.value.map(d => ({ label: d.name, value: d.id }))
]);

const keyOptions = computed(() =>
  keys.value.map(k => ({
    label:
      k.cluster && k.cluster !== editing.value?.name
        ? `${k.name} (${k.masked_value}) · ${p('keyBoundTo', { cluster: k.cluster })}`
        : `${k.name} (${k.masked_value})`,
    value: k.id
  }))
);

async function open(row?: Api.Cluster.Cluster) {
  editing.value = row;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      datasource_id: row.datasource_id,
      namespace_include: [...row.namespace_include],
      namespace_exclude: [...row.namespace_exclude],
      key_ids: [...row.key_ids]
    });
  }
  visible.value = true;
  await loadChoices();
}

async function save() {
  if (!form.name.trim()) {
    message.warning(p('nameRequired'));
    return;
  }
  const payload: Api.Cluster.ClusterPayload = {
    name: form.name.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
    datasource_id: form.datasource_id,
    namespace_include: form.namespace_include,
    namespace_exclude: form.namespace_exclude,
    key_ids: form.key_ids
  };
  saving.value = true;
  try {
    const id = editing.value?.id;
    const { error } = id ? await fetchUpdateCluster(id, payload) : await fetchCreateCluster(payload);
    if (!error) {
      visible.value = false;
      message.success(id ? t('common.modifySuccess') : t('common.addSuccess'));
      await load();
    }
  } finally {
    saving.value = false;
  }
}

async function remove(row: Api.Cluster.Cluster) {
  const { error } = await fetchDeleteCluster(row.id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    await load();
  }
}

function namespaceSummary(row: Api.Cluster.Cluster) {
  const parts: string[] = [];
  if (row.namespace_include.length) parts.push(p('namespacesOnly', { n: row.namespace_include.length }));
  if (row.namespace_exclude.length) parts.push(p('namespacesExcept', { n: row.namespace_exclude.length }));
  const text = parts.length ? parts.join(p('sep')) : p('namespacesAll');
  const detail = [
    row.namespace_include.length ? `${p('namespaceInclude')}: ${row.namespace_include.join(', ')}` : '',
    row.namespace_exclude.length ? `${p('namespaceExclude')}: ${row.namespace_exclude.join(', ')}` : ''
  ].filter(Boolean);
  const tag = h(
    NTag,
    { size: 'small', bordered: false, type: parts.length ? 'info' : 'default' },
    { default: () => text }
  );
  return detail.length ? h(NTooltip, null, { trigger: () => tag, default: () => detail.join('\n') }) : tag;
}

function renderConnection(row: Api.Cluster.Cluster) {
  const tag = h(
    NTag,
    { size: 'small', bordered: false, type: row.connected ? 'success' : 'default' },
    { default: () => (row.connected ? p('connectedYes') : p('connectedNo')) }
  );
  return row.last_seen_at ? tag : h(NTooltip, null, { trigger: () => tag, default: () => p('neverSeen') });
}

const columnMap: Record<string, any> = {
  name: {
    title: p('name'),
    key: 'name',
    width: 200,
    resizable: true,
    render: (row: Api.Cluster.Cluster) =>
      h('span', { class: 'inline-flex items-center gap-6px' }, [
        h('span', row.name),
        row.is_default
          ? h(NTooltip, null, {
              trigger: () => h(NTag, { size: 'small', bordered: false, type: 'info' }, { default: () => p('default') }),
              default: () => p('defaultHint')
            })
          : null
      ])
  },
  description: { title: p('description'), key: 'description', width: 220, resizable: true },
  enabled: {
    title: p('enabled'),
    key: 'enabled',
    width: 90,
    align: 'center',
    render: (row: Api.Cluster.Cluster) =>
      h(
        NTag,
        { type: row.enabled ? 'success' : 'default', bordered: false },
        { default: () => (row.enabled ? t('common.enable') : t('common.disable')) }
      )
  },
  connected: { title: p('connected'), key: 'connected', width: 110, align: 'center', render: renderConnection },
  last_seen_at: {
    title: p('lastSeen'),
    key: 'last_seen_at',
    width: 170,
    align: 'center',
    render: (row: Api.Cluster.Cluster) => (row.last_seen_at ? formatDateTime(row.last_seen_at) : '-')
  },
  operator: { title: p('operator'), key: 'operator', width: 220, resizable: true },
  modules: { title: p('modules'), key: 'modules', width: 80, align: 'center' },
  namespaces: { title: p('namespaces'), key: 'namespaces', width: 170, render: namespaceSummary },
  datasource: {
    title: p('datasource'),
    key: 'datasource_id',
    width: 160,
    resizable: true,
    render: (row: Api.Cluster.Cluster) => datasources.value.find(d => d.id === row.datasource_id)?.name || '-'
  },
  events: { title: p('events'), key: 'events', width: 80, align: 'center' },
  last_event_at: {
    title: p('lastEvent'),
    key: 'last_event_at',
    width: 170,
    align: 'center',
    render: (row: Api.Cluster.Cluster) => (row.last_event_at ? formatDateTime(row.last_event_at) : '-')
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: operateWidth([p('viewChanges'), p('viewEvents'), t('common.edit'), t('common.delete')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Cluster.Cluster) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'warning', onClick: () => openChanges(row) }, () => p('viewChanges')),
        h(NButton, { size: 'tiny', type: 'info', onClick: () => openEvents(row) }, () => p('viewEvents')),
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        row.is_default
          ? null
          : h(
              NPopconfirm,
              { onPositiveClick: () => remove(row) },
              {
                trigger: () => h(NButton, { size: 'tiny', type: 'error' }, () => t('common.delete')),
                default: () => (row.modules ? p('deleteBlocked') : t('common.confirmDelete'))
              }
            )
      ])
  }
};

const defaultColumnKeys = [
  'name',
  'connected',
  'namespaces',
  'events',
  'modules',
  'last_seen_at',
  'operator',
  'enabled',
  'description',
  'actions'
];

const {
  columnChecks,
  tableColumns,
  density,
  initColumnConfig,
  handleColumnUpdate,
  handleColumnWidthUpdate,
  saveColumnConfig
} = useTableColumnConfig({ pageCode: PAGE_CODE, columnMap, defaultKeys: defaultColumnKeys });

const modalTitle = computed(() => (editing.value ? `${p('title')} · ${editing.value.name}` : p('title')));
const startFlag = computed(() => `--cluster=${form.name.trim() || '<name>'}`);
/** the name is being changed: what refers to it follows, and an operator started with the old name has to be started with the new one */
const renaming = computed(
  () => Boolean(editing.value) && form.name.trim() !== '' && form.name.trim() !== editing.value?.name
);

// ---- the events of one cluster, in a drawer

const eventsOpen = ref(false);
const eventsCluster = ref<Api.Cluster.Cluster>();
const eventsLoading = ref(false);
const eventRows = ref<Api.Cluster.Event[]>([]);
const retentionDays = ref(3);
const eventSearch = reactive<{ origin: string | null; type: string | null; search: string }>({
  origin: null,
  type: null,
  search: ''
});
const eventPagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [20, 50, 100],
  prefix: ({ itemCount }: { itemCount: number | undefined }) => p('tableTotal', { n: itemCount ?? 0 }),
  onChange: (page: number) => {
    eventPagination.page = page;
    loadEvents();
  },
  onUpdatePageSize: (size: number) => {
    eventPagination.pageSize = size;
    eventPagination.page = 1;
    loadEvents();
  }
});

const originOptions = computed(() =>
  (['auto', 'manual', 'unclassified'] as const).map(v => ({ label: p(`origin_${v}`), value: v }))
);
const typeOptions = computed(() => [
  { label: p('typeWarning'), value: 'Warning' },
  { label: p('typeNormal'), value: 'Normal' }
]);

async function loadEvents() {
  if (!eventsCluster.value) return;
  eventsLoading.value = true;
  try {
    const { data } = await fetchGetClusterEvents(eventsCluster.value.id, {
      page: eventPagination.page,
      page_size: eventPagination.pageSize,
      origin: eventSearch.origin ?? undefined,
      type: eventSearch.type ?? undefined,
      search: eventSearch.search.trim() || undefined
    });
    eventRows.value = data?.list || [];
    eventPagination.itemCount = data?.total || 0;
    retentionDays.value = data?.retention_days || retentionDays.value;
  } finally {
    eventsLoading.value = false;
  }
}

function openEvents(row: Api.Cluster.Cluster) {
  eventsCluster.value = row;
  eventSearch.origin = null;
  eventSearch.type = null;
  eventSearch.search = '';
  eventPagination.page = 1;
  eventRows.value = [];
  eventsOpen.value = true;
  loadEvents();
}

function searchEvents() {
  eventPagination.page = 1;
  loadEvents();
}

function categoryText(category: string) {
  if (!category) return '';
  const key = `page.datasource.clusters.category_${category}`;
  return t(key) === key ? category : t(key);
}

function renderOrigin(row: Api.Cluster.Event) {
  const type = row.origin === 'auto' ? 'info' : row.origin === 'manual' ? 'warning' : 'default';
  const tag = h(
    NTag,
    { size: 'small', bordered: false, type },
    { default: () => [p(`origin_${row.origin}`), row.category ? ` · ${categoryText(row.category)}` : ''] }
  );
  return row.rule ? h(NTooltip, null, { trigger: () => tag, default: () => `${p('eventRule')}: ${row.rule}` }) : tag;
}

const eventColumns = computed(() => [
  {
    title: p('eventTime'),
    key: 'last_at',
    width: 165,
    render: (row: Api.Cluster.Event) =>
      h(NTooltip, null, {
        trigger: () => h('span', formatDateTime(row.last_at)),
        default: () => `${p('eventFirst')}: ${formatDateTime(row.first_at)}`
      })
  },
  {
    title: p('eventType'),
    key: 'type',
    width: 80,
    render: (row: Api.Cluster.Event) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.type === 'Warning' ? 'warning' : 'default' },
        {
          default: () =>
            row.type === 'Warning' ? p('typeWarning') : row.type === 'Normal' ? p('typeNormal') : row.type
        }
      )
  },
  { title: p('eventReason'), key: 'reason', width: 170 },
  {
    title: p('eventObject'),
    key: 'name',
    width: 240,
    ellipsis: { tooltip: true },
    render: (row: Api.Cluster.Event) => `${row.kind}${row.namespace ? ` ${row.namespace}/` : ' '}${row.name}`
  },
  { title: p('eventComponent'), key: 'component', width: 190, ellipsis: { tooltip: true } },
  { title: p('eventOrigin'), key: 'origin', width: 150, render: renderOrigin },
  { title: p('eventCount'), key: 'count', width: 70, align: 'center' as const },
  { title: p('eventMessage'), key: 'message', minWidth: 320, ellipsis: { tooltip: true } }
]);

// ---- the changes of the objects of one cluster, in a drawer, and one change explained in a modal

const changesOpen = ref(false);
const changesCluster = ref<Api.Cluster.Cluster>();
const changesLoading = ref(false);
const changeRows = ref<Api.Cluster.Change[]>([]);
const changeRetention = ref(3);
const changeSearch = reactive<{ kind: string | null; search: string }>({ kind: null, search: '' });
const changePagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [20, 50, 100],
  prefix: ({ itemCount }: { itemCount: number | undefined }) => p('tableTotal', { n: itemCount ?? 0 }),
  onChange: (page: number) => {
    changePagination.page = page;
    loadChanges();
  },
  onUpdatePageSize: (size: number) => {
    changePagination.pageSize = size;
    changePagination.page = 1;
    loadChanges();
  }
});
const kindOptions = computed(() =>
  (['Node', 'Pod', 'Workload', 'HPA'] as const).map(v => ({ label: p(`kind_${v}`), value: v }))
);

async function loadChanges() {
  if (!changesCluster.value) return;
  changesLoading.value = true;
  try {
    const { data } = await fetchGetClusterChanges(changesCluster.value.id, {
      page: changePagination.page,
      page_size: changePagination.pageSize,
      kind: changeSearch.kind ?? undefined,
      search: changeSearch.search.trim() || undefined
    });
    changeRows.value = data?.list || [];
    changePagination.itemCount = data?.total || 0;
    changeRetention.value = data?.retention_days || changeRetention.value;
  } finally {
    changesLoading.value = false;
  }
}

function openChanges(row: Api.Cluster.Cluster) {
  changesCluster.value = row;
  changeSearch.kind = null;
  changeSearch.search = '';
  changePagination.page = 1;
  changeRows.value = [];
  changesOpen.value = true;
  loadChanges();
}

function searchChanges() {
  changePagination.page = 1;
  loadChanges();
}

/** the label of a change type; a type this page does not know is shown as the cluster said it */
function typeText(type: string) {
  const key = `page.datasource.clusters.ctype_${type}`;
  return t(key) === key ? type : t(key);
}

function objectText(c: Api.Cluster.Change) {
  return c.namespace ? `${c.namespace}/${c.name}` : c.name;
}

function reasonText(c: Api.Cluster.Change) {
  const r = c.reasons?.[0];
  if (!r) return '';
  return [r.reason, r.message].filter(Boolean).join(' · ');
}

const MIB = 1024 * 1024;
function memText(bytes: number) {
  if (bytes >= 1024 * MIB) return `${Number((bytes / (1024 * MIB)).toFixed(2))} GiB`;
  return `${Number((bytes / MIB).toFixed(1))} MiB`;
}
function resText(r?: Api.Cluster.Res | null) {
  if (!r) return '-';
  return `${r.cpu_milli}m · ${memText(r.memory_bytes)}`;
}
function usageCpu(v: number | null) {
  return v === null || v === undefined ? p('usageNone') : `${Number(v.toFixed(3))}`;
}
function usageMem(v: number | null) {
  return v === null || v === undefined ? p('usageNone') : memText(v);
}

function renderUsageStatus(row: Api.Cluster.Change) {
  const type = row.usage_status === 'filled' ? 'success' : row.usage_status === 'unavailable' ? 'warning' : 'default';
  const label = row.usage_status === 'unavailable' ? p('usageNone') : p(`usage_${row.usage_status}`);
  const tag = h(NTag, { size: 'small', bordered: false, type }, { default: () => label });
  // why a figure was not found is in the tooltip, and in full in the details
  return row.usage_status === 'unavailable' && row.usage_note
    ? h(NTooltip, null, { trigger: () => tag, default: () => row.usage_note })
    : tag;
}

const changeColumns = computed(() => [
  {
    title: p('changeTime'),
    key: 'occurred_at',
    width: 165,
    render: (row: Api.Cluster.Change) => formatDateTime(row.occurred_at)
  },
  {
    title: p('changeKind'),
    key: 'kind',
    width: 90,
    render: (row: Api.Cluster.Change) =>
      h(NTag, { size: 'small', bordered: false }, { default: () => p(`kind_${row.kind}`) })
  },
  { title: p('changeObject'), key: 'name', width: 260, ellipsis: { tooltip: true }, render: objectText },
  { title: p('changeType'), key: 'type', width: 130, render: (row: Api.Cluster.Change) => typeText(row.type) },
  {
    title: p('changeFromTo'),
    key: 'to',
    width: 220,
    ellipsis: { tooltip: true },
    render: (row: Api.Cluster.Change) => `${row.from || '-'} → ${row.to || '-'}`
  },
  { title: p('changeReason'), key: 'reasons', minWidth: 280, ellipsis: { tooltip: true }, render: reasonText },
  { title: p('changeUsage'), key: 'usage_status', width: 130, render: renderUsageStatus },
  {
    title: t('common.operate'),
    key: 'actions',
    width: 90,
    fixed: 'right' as const,
    render: (row: Api.Cluster.Change) =>
      h(NButton, { size: 'tiny', type: 'primary', onClick: () => openDetail(row) }, () => p('detail'))
  }
]);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<Api.Cluster.ChangeExplanation | null>(null);

async function openDetail(row: Api.Cluster.Change) {
  if (!changesCluster.value) return;
  detail.value = null;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const { data } = await fetchGetClusterChange(changesCluster.value.id, row.id);
    detail.value = data || null;
  } finally {
    detailLoading.value = false;
  }
}

const reasonColumns = computed(() => [
  { title: p('eventReason'), key: 'reason', width: 200 },
  { title: p('eventMessage'), key: 'message', minWidth: 260 },
  { title: p('eventComponent'), key: 'component', width: 140 },
  { title: p('eventCategory'), key: 'source', width: 130 }
]);

const podColumns = computed(() => [
  { title: p('changeObject'), key: 'name', width: 240, render: (r: Api.Cluster.PodRef) => `${r.namespace}/${r.name}` },
  { title: p('snapOwner'), key: 'workload', width: 160 },
  { title: p('snapRequests'), key: 'requests', width: 170, render: (r: Api.Cluster.PodRef) => resText(r.requests) },
  { title: p('snapLimits'), key: 'limits', width: 170, render: (r: Api.Cluster.PodRef) => resText(r.limits) }
]);

const usageLabels: Record<string, string> = { before: 'usageBefore', at: 'usageAt', after: 'usageAfter' };
const usageColumns = computed(() => [
  {
    title: '',
    key: 'label',
    width: 260,
    render: (r: Api.Cluster.UsagePoint) => `${p(usageLabels[r.label])} · ${formatDateTime(r.at)}`
  },
  { title: p('usageCpu'), key: 'cpu', width: 140, render: (r: Api.Cluster.UsagePoint) => usageCpu(r.cpu) },
  { title: p('usageMemory'), key: 'memory', width: 160, render: (r: Api.Cluster.UsagePoint) => usageMem(r.memory) }
]);

const eventColumnsSmall = computed(() => [
  { title: p('eventTime'), key: 'last_at', width: 165, render: (r: Api.Cluster.Event) => formatDateTime(r.last_at) },
  { title: p('eventReason'), key: 'reason', width: 170 },
  { title: p('eventComponent'), key: 'component', width: 170, ellipsis: { tooltip: true } },
  { title: p('eventOrigin'), key: 'origin', width: 150, render: renderOrigin },
  { title: p('eventMessage'), key: 'message', minWidth: 260, ellipsis: { tooltip: true } }
]);

function linkTitle(l: Api.Cluster.ChangeLink) {
  const c = l.change;
  return `${p(`kind_${c.kind}`)} ${objectText(c)} · ${typeText(c.type)} ${c.from || '-'} → ${c.to || '-'} · ${formatDateTime(c.occurred_at)}`;
}

const linkGroups = computed(() => [
  { key: 'causes', title: p('detailCauses'), list: detail.value?.causes || [] },
  { key: 'effects', title: p('detailEffects'), list: detail.value?.effects || [] }
]);

onMounted(async () => {
  initColumnConfig();
  await Promise.all([load(), loadChoices()]);
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden">
    <NCard :bordered="false" size="small" class="flex-1 rounded-16px shadow-sm overflow-hidden">
      <div class="h-full flex-col">
        <div class="flex items-center justify-between pb-12px">
          <span class="inline-flex items-center gap-6px font-medium">
            {{ p('title') }}
            <IconTooltip icon="mdi-help-circle" placement="right">
              <div class="max-w-420px leading-22px">{{ p('help') }}</div>
            </IconTooltip>
          </span>
          <TableHeaderOperation
            v-model:columns="columnChecks"
            v-model:density="density"
            :loading="loading"
            :show-delete="false"
            @add="open()"
            @refresh="load"
          />
        </div>
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            :data="rows"
            :loading="loading"
            :pagination="false"
            :row-key="row => row.id"
            :size="density"
            class="h-full"
            flex-height
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>

    <NModal v-model:show="visible" preset="card" :title="modalTitle" class="edit-modal-wide">
      <NForm :model="form" label-placement="top">
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ p('name') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ p('nameHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInput v-model:value="form.name" :placeholder="t('common.inputField', { field: p('name') })" />
          <template #feedback>
            <span v-if="renaming" class="text-warning">{{ p('renameWarn', { old: editing?.name || '' }) }}</span>
          </template>
        </NFormItem>
        <NFormItem :label="p('startHint')">
          <NInput :value="startFlag" readonly />
        </NFormItem>
        <NFormItem :label="p('description')">
          <NInput v-model:value="form.description" :placeholder="t('common.inputField', { field: p('description') })" />
        </NFormItem>
        <NFormItem :label="p('enabled')">
          <StatusSelect v-model:value="form.enabled" :disabled="editing?.is_default" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ p('keys') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ p('keysHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect
            v-model:value="form.key_ids"
            multiple
            filterable
            :options="keyOptions"
            :placeholder="keys.length ? t('common.selectField', { field: p('keys') }) : p('keysEmpty')"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ p('datasource') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ p('datasourceHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect v-model:value="form.datasource_id" :options="datasourceOptions" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ p('namespaceInclude') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ p('namespaceIncludeHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect
            v-model:value="form.namespace_include"
            multiple
            filterable
            tag
            :show-arrow="false"
            :options="[]"
            :placeholder="p('namespacesAll')"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ p('namespaceExclude') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ p('namespaceExcludeHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect
            v-model:value="form.namespace_exclude"
            multiple
            filterable
            tag
            :show-arrow="false"
            :options="[]"
            :placeholder="t('common.inputField', { field: p('namespaceExclude') })"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <NDrawer v-model:show="eventsOpen" :width="1180" placement="right">
      <NDrawerContent :title="p('eventsTitle', { name: eventsCluster?.name || '' })" closable>
        <div class="pb-12px leading-22px opacity-80">{{ p('eventsHelp', { days: retentionDays }) }}</div>
        <NSpace class="pb-12px" align="center">
          <NSelect
            v-model:value="eventSearch.origin"
            clearable
            class="w-160px"
            :placeholder="p('allOrigins')"
            :options="originOptions"
            @update:value="searchEvents"
          />
          <NSelect
            v-model:value="eventSearch.type"
            clearable
            class="w-140px"
            :placeholder="p('allTypes')"
            :options="typeOptions"
            @update:value="searchEvents"
          />
          <NInput
            v-model:value="eventSearch.search"
            clearable
            class="w-280px"
            :placeholder="p('searchEvents')"
            @keyup.enter="searchEvents"
            @clear="searchEvents"
          />
          <NButton type="primary" @click="searchEvents">{{ t('common.search') }}</NButton>
          <NButton @click="loadEvents">{{ t('common.refresh') }}</NButton>
        </NSpace>
        <NDataTable
          remote
          size="small"
          :columns="eventColumns"
          :data="eventRows"
          :loading="eventsLoading"
          :pagination="eventPagination"
          :row-key="(row: Api.Cluster.Event) => row.id"
          :scroll-x="1300"
          max-height="calc(100vh - 300px)"
        >
          <template #empty>
            <div class="py-24px opacity-70">{{ p('eventsEmpty') }}</div>
          </template>
        </NDataTable>
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="changesOpen" :width="1280" placement="right">
      <NDrawerContent :title="p('changesTitle', { name: changesCluster?.name || '' })" closable>
        <div class="pb-12px leading-22px opacity-80">{{ p('changesHelp', { days: changeRetention }) }}</div>
        <NSpace class="pb-12px" align="center">
          <NSelect
            v-model:value="changeSearch.kind"
            clearable
            class="w-160px"
            :placeholder="p('allKinds')"
            :options="kindOptions"
            @update:value="searchChanges"
          />
          <NInput
            v-model:value="changeSearch.search"
            clearable
            class="w-320px"
            :placeholder="p('searchChanges')"
            @keyup.enter="searchChanges"
            @clear="searchChanges"
          />
          <NButton type="primary" @click="searchChanges">{{ t('common.search') }}</NButton>
          <NButton @click="loadChanges">{{ t('common.refresh') }}</NButton>
        </NSpace>
        <NDataTable
          remote
          size="small"
          :columns="changeColumns"
          :data="changeRows"
          :loading="changesLoading"
          :pagination="changePagination"
          :row-key="(row: Api.Cluster.Change) => row.id"
          :scroll-x="1500"
          max-height="calc(100vh - 300px)"
        >
          <template #empty>
            <div class="py-24px opacity-70">{{ p('changesEmpty') }}</div>
          </template>
        </NDataTable>
      </NDrawerContent>
    </NDrawer>

    <NModal v-model:show="detailOpen" preset="card" :title="p('detailTitle')" style="width: min(1100px, 94vw)">
      <div v-if="detailLoading" class="py-24px text-center opacity-70">{{ t('common.loading') }}</div>
      <div v-else-if="detail" class="detail-body">
        <section class="detail-section">
          <div class="section-title">{{ p('detailBasic') }}</div>
          <NDescriptions :column="2" label-placement="left" size="small" bordered>
            <NDescriptionsItem :label="p('changeObject')">
              {{ p(`kind_${detail.change.kind}`) }} {{ objectText(detail.change) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="p('changeType')">{{ typeText(detail.change.type) }}</NDescriptionsItem>
            <NDescriptionsItem :label="p('changeFromTo')">
              {{ detail.change.from || '-' }} → {{ detail.change.to || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="p('changeTime')">
              {{ formatDateTime(detail.change.occurred_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="p('detailObserved')">
              {{ formatDateTime(detail.change.observed_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="p('detailOperator')">{{ detail.change.operator || '-' }}</NDescriptionsItem>
            <NDescriptionsItem v-if="detail.change.node" :label="p('eventHost')">
              {{ detail.change.node }}
            </NDescriptionsItem>
            <NDescriptionsItem
              v-if="detail.change.workload && detail.change.kind !== 'Workload'"
              :label="p('snapOwner')"
            >
              {{ detail.change.workload }}
            </NDescriptionsItem>
          </NDescriptions>
        </section>

        <section class="detail-section">
          <div class="section-title">{{ p('detailReasons') }}</div>
          <NDataTable
            v-if="detail.change.reasons.length"
            size="small"
            :columns="reasonColumns"
            :data="detail.change.reasons"
            :pagination="false"
          />
          <div v-else class="opacity-70">{{ p('detailNoReasons') }}</div>
        </section>

        <section class="detail-section">
          <div class="section-title">{{ p('detailSnapshot') }}</div>
          <div v-if="!detail.change.snapshot" class="opacity-70">{{ p('snapNothing') }}</div>
          <template v-else>
            <NDescriptions :column="2" label-placement="left" size="small" bordered>
              <NDescriptionsItem v-if="detail.change.snapshot.capacity" :label="p('snapCapacity')">
                {{ resText(detail.change.snapshot.capacity) }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.allocatable" :label="p('snapAllocatable')">
                {{ resText(detail.change.snapshot.allocatable) }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.requests" :label="p('snapRequests')">
                {{ resText(detail.change.snapshot.requests) }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.limits" :label="p('snapLimits')">
                {{ resText(detail.change.snapshot.limits) }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.owner" :label="p('snapOwner')">
                {{ detail.change.snapshot.owner }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.desired !== undefined" :label="p('snapReplicas')">
                {{ detail.change.snapshot.desired }} / {{ detail.change.snapshot.ready ?? '-' }} /
                {{ detail.change.snapshot.available ?? '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.min !== undefined" :label="p('snapBounds')">
                {{ detail.change.snapshot.min }}-{{ detail.change.snapshot.max }} /
                {{ detail.change.snapshot.current }} /
                {{ detail.change.snapshot.desired }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.target" :label="p('snapTarget')">
                {{ detail.change.snapshot.target }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.taints?.length" :label="p('snapTaints')">
                {{ detail.change.snapshot.taints.join(', ') }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="detail.change.snapshot.containers?.length" :label="p('snapContainers')">
                <div v-for="c in detail.change.snapshot.containers" :key="c.name">
                  {{ c.name }}: {{ c.state || '-' }}{{ c.reason ? ` ${c.reason}` : '' }}, {{ c.restarts }}
                  <span v-if="c.last_reason">· {{ c.last_reason }} ({{ c.last_exit_code }})</span>
                </div>
              </NDescriptionsItem>
            </NDescriptions>
            <div v-if="detail.change.snapshot.pods?.length" class="pt-8px">
              <div class="pb-4px opacity-80">
                {{ p('snapPods') }}:
                {{
                  p('snapPodsShown', {
                    n: detail.change.snapshot.pod_count ?? 0,
                    m: detail.change.snapshot.pods.length
                  })
                }}
              </div>
              <NDataTable
                size="small"
                :columns="podColumns"
                :data="detail.change.snapshot.pods"
                :pagination="false"
                max-height="220"
              />
            </div>
          </template>
        </section>

        <section class="detail-section">
          <div class="section-title">{{ p('detailUsage') }}</div>
          <div class="pb-4px opacity-70">{{ p('usageHelp') }}</div>
          <div v-if="detail.change.usage_status === 'pending'" class="opacity-70">{{ p('usagePending') }}</div>
          <template v-else>
            <div v-if="detail.change.usage" class="pb-4px opacity-80">
              {{ p('usageSubject') }}: {{ detail.change.usage.subject }}
              <span v-if="detail.change.usage.source">· {{ p('usageSource') }}: {{ detail.change.usage.source }}</span>
            </div>
            <NDataTable
              v-if="detail.change.usage?.points?.length"
              size="small"
              :columns="usageColumns"
              :data="detail.change.usage.points"
              :pagination="false"
            />
            <div v-if="detail.change.usage_status === 'unavailable'" class="opacity-80">
              {{ p('usage_unavailable', { note: detail.change.usage_note }) }}
            </div>
            <div v-else-if="detail.change.usage_note" class="opacity-70">{{ detail.change.usage_note }}</div>
          </template>
        </section>

        <section class="detail-section">
          <div class="section-title">{{ p('detailEvents') }}</div>
          <NDataTable
            v-if="detail.events.length"
            size="small"
            :columns="eventColumnsSmall"
            :data="detail.events"
            :pagination="false"
            max-height="240"
          />
          <div v-else class="opacity-70">{{ p('detailNoEvents') }}</div>
        </section>

        <section v-for="group in linkGroups" :key="group.key" class="detail-section">
          <div class="section-title">{{ group.title }}</div>
          <div v-if="!group.list.length" class="opacity-70">{{ p('detailNoLinks') }}</div>
          <div v-for="l in group.list" :key="l.change.id" class="link-row">
            <NTag size="small" :bordered="false" :type="l.relation === 'caused_by' ? 'success' : 'default'">
              {{
                l.direction === 'effect' && l.relation === 'caused_by'
                  ? p('relation_effect')
                  : p(`relation_${l.relation}`)
              }}
            </NTag>
            <span class="pl-8px">{{ linkTitle(l) }}</span>
            <div class="link-evidence">{{ p('relationEvidence') }}: {{ l.evidence }}</div>
          </div>
        </section>
        <div class="opacity-60 text-12px">{{ p('relationNote') }}</div>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.detail-body {
  max-height: 78vh;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 16px;
}

.section-title {
  padding-bottom: 6px;
  font-weight: 600;
}

.link-row {
  padding: 4px 0;
  line-height: 22px;
}

.link-evidence {
  padding-left: 8px;
  opacity: 0.7;
}
</style>
