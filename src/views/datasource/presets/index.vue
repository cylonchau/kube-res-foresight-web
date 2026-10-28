<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  NButton,
  NCode,
  NDescriptions,
  NDescriptionsItem,
  NFormItemGi,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui';
import { useRouter } from 'vue-router';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import {
  fetchCreateForecastDemo,
  fetchDeleteForecastDemo,
  fetchGetForecastDemo,
  fetchGetMetricPresets
} from '@/service/api';
import { AUX_METRICS } from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';

defineOptions({ name: 'DatasourcePresets' });

const { t, locale } = useI18n();
const message = useMessage();
const router = useRouter();

const rows = ref<Api.Datasource.Preset[]>([]);
const loading = ref(false);
const search = reactive({ keyword: '', metric: null as string | null, level: null as string | null });

const text = (value: Api.Datasource.PresetText) => (locale.value === 'en-US' ? value.en : value.zh);
const metricOptions = computed(() =>
  [
    'cpu',
    'memory',
    'rps',
    'replicas',
    'latency',
    'oom',
    ...AUX_METRICS.filter(value => value !== 'oom' && value !== 'latency')
  ].map(value => ({ label: t(`page.datasource.mappings.metric_${value}`), value }))
);
const levelOptions = computed(() =>
  ['workload', 'service', 'container'].map(value => ({ label: t(`page.datasource.mappings.level_${value}`), value }))
);

async function load() {
  loading.value = true;
  const { data } = await fetchGetMetricPresets({
    keyword: search.keyword || undefined,
    metric: search.metric || undefined,
    level: search.level || undefined
  });
  loading.value = false;
  rows.value = data?.list || [];
}

function resetSearch() {
  Object.assign(search, { keyword: '', metric: null, level: null });
  load();
}

// ---- detail
const detail = ref<Api.Datasource.Preset | null>(null);

// ---- demo
const demo = ref<{ exists: boolean; module_id?: number }>({ exists: false });
const demoBusy = ref(false);

async function loadDemo() {
  const { data } = await fetchGetForecastDemo();
  if (data) demo.value = data;
}

async function createDemo() {
  demoBusy.value = true;
  const { data, error } = await fetchCreateForecastDemo();
  demoBusy.value = false;
  if (!error && data) {
    message.success(t('page.datasource.presets.demoReady'));
    await loadDemo();
    router.push({ name: 'forecast-modules_modules' });
  }
}

async function removeDemo() {
  demoBusy.value = true;
  const { error } = await fetchDeleteForecastDemo();
  demoBusy.value = false;
  if (!error) {
    message.success(t('common.deleteSuccess'));
    await loadDemo();
  }
}

const columnMap: Record<string, any> = {
  name: {
    title: t('page.datasource.presets.columns.name'),
    key: 'name',
    width: 260,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Datasource.Preset) => text(row.name)
  },
  id: { title: 'ID', key: 'id', width: 260, resizable: true, ellipsis: { tooltip: true } },
  metric: {
    title: t('page.datasource.presets.columns.metric'),
    key: 'metric',
    width: 110,
    resizable: true,
    align: 'center',
    render: (row: Api.Datasource.Preset) =>
      h(NTag, { size: 'small', type: 'info', bordered: false }, () =>
        t(`page.datasource.mappings.metric_${row.metric}`)
      )
  },
  level: {
    title: t('page.datasource.presets.columns.level'),
    key: 'level',
    width: 110,
    resizable: true,
    align: 'center',
    render: (row: Api.Datasource.Preset) => t(`page.datasource.mappings.level_${row.level}`)
  },
  unit: { title: t('page.datasource.mappings.unit'), key: 'unit', width: 90, align: 'center' },
  step_seconds: {
    title: t('page.datasource.mappings.step'),
    key: 'step_seconds',
    width: 100,
    align: 'center',
    render: (row: Api.Datasource.Preset) => `${row.step_seconds} s`
  },
  query: {
    title: t('page.datasource.mappings.query'),
    key: 'query',
    width: 420,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  source: {
    title: t('page.datasource.presets.columns.source'),
    key: 'source',
    width: 210,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Datasource.Preset) => row.source.component
  },
  verified: {
    title: t('page.datasource.presets.columns.verified'),
    key: 'verified',
    width: 120,
    resizable: true,
    align: 'center',
    render: (row: Api.Datasource.Preset) =>
      h(NTag, { size: 'small', bordered: false, type: row.verified ? 'success' : 'warning' }, () =>
        t(row.verified ? 'page.datasource.presets.verified' : 'page.datasource.presets.unverified')
      )
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 80,
    fixed: 'right',
    align: 'center',
    // a template is used from the dataset form (pick it there); here it is read
    render: (row: Api.Datasource.Preset) =>
      h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => (detail.value = row) }, () =>
        t('page.datasource.presets.detail')
      )
  }
};

const cfg = useTableColumnConfig({
  pageCode: 'datasource_presets',
  columnMap,
  defaultKeys: ['name', 'metric', 'level', 'unit', 'step_seconds', 'query', 'source', 'verified', 'operate']
});

onMounted(() => {
  cfg.initColumnConfig();
  load();
  loadDemo();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="load" @reset="resetSearch">
      <NFormItemGi :span="8" :label="t('common.keyword')">
        <NInput
          v-model:value="search.keyword"
          clearable
          :placeholder="t('page.datasource.presets.keywordPlaceholder')"
          @keyup.enter="load"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="5"
        :label="t('page.datasource.presets.columns.metric')"
      >
        <NSelect
          v-model:value="search.metric"
          clearable
          :options="metricOptions"
          :placeholder="t('common.selectField', { field: t('page.datasource.presets.columns.metric') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="5"
        :label="t('page.datasource.presets.columns.level')"
      >
        <NSelect
          v-model:value="search.level"
          clearable
          :options="levelOptions"
          :placeholder="t('common.selectField', { field: t('page.datasource.presets.columns.level') })"
        />
      </NFormItemGi>
    </ListSearchCard>

    <ListTablePanel
      :title="t('page.datasource.presets.title')"
      :help="t('page.datasource.presets.help')"
      :cfg="cfg"
      :loading="loading"
      :data="rows"
      :row-key="(row: any) => row.id"
      @refresh="load"
    >
      <template #suffix>
        <NSpace :wrap="false">
          <NButton size="small" type="primary" ghost :loading="demoBusy" @click="createDemo">
            {{ t(demo.exists ? 'page.datasource.presets.demoRefresh' : 'page.datasource.presets.demoCreate') }}
          </NButton>
          <NPopconfirm v-if="demo.exists" @positive-click="removeDemo">
            <template #trigger>
              <NButton size="small" ghost type="error" :loading="demoBusy">
                {{ t('page.datasource.presets.demoDelete') }}
              </NButton>
            </template>
            {{ t('page.datasource.presets.demoDeleteConfirm') }}
          </NPopconfirm>
        </NSpace>
      </template>
    </ListTablePanel>

    <!-- detail -->
    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="detail ? text(detail.name) : ''"
      class="edit-modal-wide"
      @update:show="value => !value && (detail = null)"
    >
      <div v-if="detail" class="max-h-70vh overflow-y-auto pr-8px">
        <NDescriptions :column="1" label-placement="left" size="small" bordered>
          <NDescriptionsItem :label="t('page.datasource.presets.scenario')">
            {{ text(detail.scenario) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.datasource.presets.columns.source')">
            {{ detail.source.component }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.datasource.presets.series')">
            {{ detail.source.metrics.join(', ') }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.datasource.presets.labels')">
            {{ detail.source.labels.join(', ') }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.datasource.presets.usage')">{{ text(detail.usage) }}</NDescriptionsItem>
          <NDescriptionsItem :label="t('page.datasource.presets.limitations')">
            {{ text(detail.limitations) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.datasource.presets.columns.verified')">
            {{ t(detail.verified ? 'page.datasource.presets.verified' : 'page.datasource.presets.unverifiedHint') }}
          </NDescriptionsItem>
        </NDescriptions>
        <div class="mb-6px mt-12px font-medium">PromQL</div>
        <NCode :code="detail.query" language="promql" word-wrap />
      </div>
    </NModal>
  </div>
</template>
