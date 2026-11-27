<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NDynamicInput,
  NForm,
  NFormItem,
  NFormItemGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useDialog,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import StatusSelect from '@/components/business/status-select.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchBatchDeleteNodePools,
  fetchCreateNodePool,
  fetchDeleteNodePool,
  fetchGetNodePools,
  fetchUpdateNodePool
} from '@/service/api/nodepool';
import { formatDateTime } from '@/utils/date';
import { formatBytes } from '@/utils/format';
import { operateWidth } from '@/utils/operate-width';

defineOptions({ name: 'NodePool' });

/**
 * The node pools: groups of Kubernetes nodes of one shape, each with the labels that select it (a Node Selector), the size of one node and what it is for (CPU-intensive, memory-
 * intensive, GPU, general). The platform recommends, with the CPU, memory and replicas of a module, the pool whose nodes the Pod of the module fills best; whether a module is moved to
 * it is decided by its run mode (admission puts the Node Selector on a new Pod, auto lets the operator write it on the workload).
 */
const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const GIB = 1024 ** 3;

const checkedRowKeys = ref<number[]>([]);
const search = reactive<{ keyword: string; kind: Api.NodePool.Kind | null; enabled: 'true' | 'false' | null }>({
  keyword: '',
  kind: null,
  enabled: null
});

const kindOptions = computed(() =>
  (['cpu', 'memory', 'gpu', 'general'] as const).map(value => ({ label: t(`page.nodePool.kind_${value}`), value }))
);
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);
const kindType = { cpu: 'info', memory: 'warning', gpu: 'error', general: 'default' } as const;

const list = usePagedList<Api.NodePool.Pool>(async (page, pageSize) => {
  const { data } = await fetchGetNodePools({
    page,
    page_size: pageSize,
    keyword: search.keyword.trim() || undefined,
    kind: search.kind ?? undefined,
    enabled: search.enabled === null ? undefined : search.enabled === 'true'
  });
  return data;
});
const runSearch = () => list.search();
const reload = () => list.reload();
function resetSearch() {
  Object.assign(search, { keyword: '', kind: null, enabled: null });
  runSearch();
}

// ---- form
interface FormState {
  cluster: string;
  name: string;
  kind: Api.NodePool.Kind;
  labels: Array<{ key: string; value: string }>;
  cores: number | null;
  memoryGib: number | null;
  gpu: number | null;
  priority: number;
  enabled: boolean;
  remark: string;
}
const emptyForm = (): FormState => ({
  cluster: '',
  name: '',
  kind: 'general',
  labels: [{ key: '', value: '' }],
  cores: null,
  memoryGib: null,
  gpu: null,
  priority: 0,
  enabled: true,
  remark: ''
});
const form = reactive<FormState>(emptyForm());
const visible = ref(false);
const saving = ref(false);
const editing = ref<Api.NodePool.Pool | null>(null);

function open(row?: Api.NodePool.Pool) {
  editing.value = row ?? null;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      cluster: row.cluster,
      name: row.name,
      kind: row.kind,
      labels: Object.entries(row.node_selector ?? {}).map(([key, value]) => ({ key, value })),
      cores: row.node_cpu_milli ? row.node_cpu_milli / 1000 : null,
      memoryGib: row.node_memory_bytes ? row.node_memory_bytes / GIB : null,
      gpu: row.node_gpu || null,
      priority: row.priority,
      enabled: row.enabled,
      remark: row.remark
    });
    if (!form.labels.length) form.labels.push({ key: '', value: '' });
  }
  visible.value = true;
}

function payload(): Api.NodePool.Payload {
  const node_selector: Record<string, string> = {};
  for (const { key, value } of form.labels) if (key.trim()) node_selector[key.trim()] = value.trim();
  return {
    cluster: form.cluster.trim(),
    name: form.name.trim(),
    kind: form.kind,
    node_selector,
    node_cpu_milli: Math.round((form.cores ?? 0) * 1000),
    node_memory_bytes: Math.round((form.memoryGib ?? 0) * GIB),
    node_gpu: form.kind === 'gpu' ? (form.gpu ?? 0) : 0,
    priority: form.priority,
    enabled: form.enabled,
    remark: form.remark
  };
}

async function save() {
  const body = payload();
  if (!body.name) return message.warning(t('page.nodePool.nameRequired'));
  if (!Object.keys(body.node_selector ?? {}).length) return message.warning(t('page.nodePool.labelsRequired'));
  if (form.enabled && !(body.node_cpu_milli && body.node_memory_bytes))
    return message.warning(t('page.nodePool.sizeRequired'));
  if (form.kind === 'gpu' && !body.node_gpu) return message.warning(t('page.nodePool.gpuRequired'));
  saving.value = true;
  try {
    const { error } = editing.value
      ? await fetchUpdateNodePool(editing.value.id, body)
      : await fetchCreateNodePool(body);
    if (error) return;
    message.success(t('common.saveSuccess'));
    visible.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

async function remove(id: number) {
  const { error } = await fetchDeleteNodePool(id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    checkedRowKeys.value = checkedRowKeys.value.filter(key => key !== id);
    await reload();
  }
}

function batchRemove() {
  if (!checkedRowKeys.value.length) return;
  dialog.warning({
    title: t('common.tip'),
    content: t('common.confirmBatchDelete'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    async onPositiveClick() {
      const { error } = await fetchBatchDeleteNodePools(checkedRowKeys.value);
      if (error) return;
      checkedRowKeys.value = [];
      message.success(t('common.deleteSuccess'));
      await reload();
    }
  });
}

const selectorText = (row: Api.NodePool.Pool) =>
  Object.entries(row.node_selector ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
const nodeText = (row: Api.NodePool.Pool) => {
  const parts = [
    row.node_cpu_milli ? t('page.nodePool.coresValue', { n: row.node_cpu_milli / 1000 }) : '-',
    row.node_memory_bytes ? formatBytes(row.node_memory_bytes, 0) : '-'
  ];
  if (row.node_gpu) parts.push(t('page.nodePool.gpuValue', { n: row.node_gpu }));
  return parts.join(' / ');
};

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  id: { title: t('common.id'), key: 'id', width: 70, align: 'center' },
  name: { title: t('page.nodePool.name'), key: 'name', width: 180, resizable: true },
  kind: {
    title: t('page.nodePool.kind'),
    key: 'kind',
    width: 130,
    align: 'center',
    render: (row: Api.NodePool.Pool) =>
      h(NTag, { size: 'small', bordered: false, type: kindType[row.kind] }, () => t(`page.nodePool.kind_${row.kind}`))
  },
  node_selector: {
    title: t('page.nodePool.selector'),
    key: 'node_selector',
    width: 280,
    resizable: true,
    ellipsis: { tooltip: true },
    render: selectorText
  },
  node: { title: t('page.nodePool.nodeSize'), key: 'node', width: 190, align: 'center', render: nodeText },
  cluster: {
    title: t('page.nodePool.cluster'),
    key: 'cluster',
    width: 120,
    resizable: true,
    render: (row: Api.NodePool.Pool) => row.cluster || t('page.nodePool.allClusters')
  },
  priority: { title: t('page.nodePool.priority'), key: 'priority', width: 90, align: 'center' },
  enabled: {
    title: t('page.datasource.connections.enabled'),
    key: 'enabled',
    width: 100,
    align: 'center',
    render: (row: Api.NodePool.Pool) =>
      h(
        NTag,
        { size: 'small', type: row.enabled ? 'success' : 'default', bordered: false },
        { default: () => (row.enabled ? t('common.enable') : t('common.disable')) }
      )
  },
  remark: { title: t('common.remark'), key: 'remark', width: 200, resizable: true, ellipsis: { tooltip: true } },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    align: 'center',
    render: (row: Api.NodePool.Pool) => formatDateTime(row.created_at)
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: operateWidth([t('common.edit'), t('common.delete')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.NodePool.Pool) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row.id) },
          {
            trigger: () => h(NButton, { size: 'tiny', type: 'error' }, () => t('common.delete')),
            default: () => t('common.confirmDelete')
          }
        )
      ])
  }
};

const cfg = useTableColumnConfig({
  pageCode: 'node_pool_manage',
  columnMap,
  defaultKeys: ['__selection__', 'name', 'kind', 'node_selector', 'node', 'enabled', 'actions']
});

onMounted(() => {
  cfg.initColumnConfig();
  runSearch();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="runSearch" @reset="resetSearch">
      <NFormItemGi :span="8" :label="t('page.nodePool.keyword')">
        <NInput
          v-model:value="search.keyword"
          clearable
          :placeholder="t('page.nodePool.keywordPlaceholder')"
          @keyup.enter="runSearch"
        />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field list-search-short-field" :span="5" :label="t('page.nodePool.kind')">
        <NSelect
          v-model:value="search.kind"
          clearable
          :placeholder="t('common.selectField', { field: t('page.nodePool.kind') })"
          :options="kindOptions"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="5"
        :label="t('page.datasource.connections.enabled')"
      >
        <NSelect
          v-model:value="search.enabled"
          clearable
          :placeholder="t('common.selectField', { field: t('page.datasource.connections.enabled') })"
          :options="enabledOptions"
        />
      </NFormItemGi>
    </ListSearchCard>

    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.nodePool.title')"
      :help="t('page.nodePool.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :row-key="(row: any) => row.id"
      show-add
      show-delete
      :disabled-delete="checkedRowKeys.length === 0"
      @add="open()"
      @delete="batchRemove"
      @refresh="reload"
    />

    <NModal
      v-model:show="visible"
      preset="card"
      :title="editing ? t('page.nodePool.editTitle') : t('page.nodePool.addTitle')"
      class="w-640px max-w-95vw"
    >
      <NForm :model="form" label-placement="top">
        <NFormItem :label="t('page.nodePool.name')">
          <NInput v-model:value="form.name" :placeholder="t('page.nodePool.namePlaceholder')" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.nodePool.kind') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-420px leading-22px">
                  <div v-for="kind in ['cpu', 'memory', 'gpu', 'general']" :key="kind">
                    <b>{{ t(`page.nodePool.kind_${kind}`) }}</b>
                    {{ t(`page.nodePool.kindHelp_${kind}`) }}
                  </div>
                </div>
              </IconTooltip>
            </span>
          </template>
          <NSelect v-model:value="form.kind" :options="kindOptions" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.nodePool.selector') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-420px leading-22px">{{ t('page.nodePool.selectorHelp') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NDynamicInput
            v-model:value="form.labels"
            preset="pair"
            :key-placeholder="t('page.nodePool.labelKey')"
            :value-placeholder="t('page.nodePool.labelValue')"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.nodePool.nodeSize') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-420px leading-22px">{{ t('page.nodePool.nodeSizeHelp') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSpace :wrap="false" class="w-full">
            <NInputNumber v-model:value="form.cores" :min="0" :placeholder="t('page.nodePool.cores')" class="w-180px">
              <template #suffix>{{ t('page.nodePool.coresUnit') }}</template>
            </NInputNumber>
            <NInputNumber
              v-model:value="form.memoryGib"
              :min="0"
              :placeholder="t('page.nodePool.memory')"
              class="w-180px"
            >
              <template #suffix>GiB</template>
            </NInputNumber>
            <NInputNumber
              v-if="form.kind === 'gpu'"
              v-model:value="form.gpu"
              :min="0"
              :precision="0"
              :placeholder="t('page.nodePool.gpu')"
              class="w-140px"
            />
          </NSpace>
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.nodePool.cluster') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ t('page.nodePool.clusterHelp') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInput v-model:value="form.cluster" :placeholder="t('page.nodePool.clusterPlaceholder')" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.nodePool.priority') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ t('page.nodePool.priorityHelp') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInputNumber v-model:value="form.priority" :precision="0" class="w-full" />
        </NFormItem>
        <NFormItem :label="t('page.datasource.connections.enabled')">
          <StatusSelect v-model:value="form.enabled" />
        </NFormItem>
        <NFormItem :label="t('common.remark')">
          <NInput v-model:value="form.remark" :placeholder="t('common.inputField', { field: t('common.remark') })" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
