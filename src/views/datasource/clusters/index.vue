<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NDataTable,
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
  if (!editing.value && !form.name.trim()) {
    message.warning(p('nameRequired'));
    return;
  }
  const payload: Api.Cluster.ClusterPayload = {
    name: editing.value ? undefined : form.name.trim(),
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
    width: operateWidth([p('viewEvents'), t('common.edit'), t('common.delete')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Cluster.Cluster) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
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
const startFlag = computed(() => `--cluster=${editing.value?.name || form.name.trim() || '<name>'}`);

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
          <NInput
            v-model:value="form.name"
            :disabled="Boolean(editing)"
            :placeholder="t('common.inputField', { field: p('name') })"
          />
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
  </div>
</template>
