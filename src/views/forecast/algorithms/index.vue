<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NForm,
  NFormItem,
  NFormItemGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  NTimeline,
  NTimelineItem,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import AlgorithmParamsEditor from '@/components/advanced/algorithm-params-editor.vue';
import CustomAlgorithmForm from '@/components/business/custom-algorithm-form.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchDeleteAlgorithm,
  fetchGetAlgorithmUsage,
  fetchGetAlgorithms,
  fetchGetModuleTrace,
  fetchUpdateAlgorithm
} from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastAlgorithms' });

const { t } = useI18n();
const message = useMessage();
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

// ================= list =================
const search = reactive({ keyword: '', category: null as string | null, enabled: null as 'true' | 'false' | null });
const categoryOptions = computed(() =>
  ['baseline', 'statistical', 'technical', 'machine_learning', 'deep_learning', 'custom'].map(value => ({
    label: t(`page.forecast.modules.category_${value}`),
    value
  }))
);
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);

const list = usePagedList<Api.Forecast.Algorithm>(async (page, pageSize) => {
  const { data } = await fetchGetAlgorithms({
    page,
    page_size: pageSize,
    keyword: search.keyword.trim() || undefined,
    category: search.category ?? undefined,
    enabled: search.enabled ?? undefined
  });
  return data;
});
const runSearch = () => list.search();
const reload = () => list.reload();

function resetSearch() {
  Object.assign(search, { keyword: '', category: null, enabled: null });
  runSearch();
}

const toggling = ref<string>();
async function toggle(row: Api.Forecast.Algorithm, enabled: boolean) {
  toggling.value = row.id;
  try {
    const { error } = await fetchUpdateAlgorithm(row.id, { enabled });
    if (!error) {
      message.success(enabled ? t('page.forecast.algorithms.enabledOk') : t('page.forecast.algorithms.disabledOk'));
      await reload();
    }
  } finally {
    toggling.value = undefined;
  }
}

const valuesText = (row: Api.Forecast.Algorithm) =>
  row.params.length
    ? row.params.map(spec => `${spec.name}=${String(row.values?.[spec.name] ?? spec.default ?? '-')}`).join(', ')
    : '-';

const columnMap: Record<string, any> = {
  algorithm: {
    title: t('page.forecast.algorithms.columns.id'),
    key: 'algorithm',
    width: 170,
    resizable: true,
    render: (row: Api.Forecast.Algorithm) => row.id
  },
  origin: {
    title: t('page.forecast.algorithms.columns.origin'),
    key: 'origin',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Algorithm) =>
      h(NTag, { size: 'small', bordered: false, type: row.origin === 'builtin' ? 'default' : 'warning' }, () =>
        t(
          {
            builtin: 'page.forecast.algorithms.originBuiltin',
            variant: 'page.forecast.algorithms.originVariant',
            formula: 'page.forecast.algorithms.originCustom'
          }[row.origin]
        )
      )
  },
  minSamples: {
    title: t('page.forecast.algorithms.columns.minSamples'),
    key: 'minSamples',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Algorithm) => (row.custom ? String(row.min_samples ?? '-') : row.min_history)
  },
  category: {
    title: t('page.forecast.algorithms.columns.category'),
    key: 'category',
    width: 130,
    align: 'center',
    render: (row: Api.Forecast.Algorithm) =>
      h(NTag, { size: 'small', bordered: false, type: row.baseline ? 'default' : 'info' }, () =>
        t(`page.forecast.modules.category_${row.category}`)
      )
  },
  enabled: {
    title: t('page.forecast.algorithms.columns.enabled'),
    key: 'enabled',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.Algorithm) =>
      h(NSwitch, {
        size: 'small',
        value: row.enabled,
        loading: toggling.value === row.id,
        'onUpdate:value': (value: boolean) => toggle(row, value)
      })
  },
  values: {
    title: t('page.forecast.algorithms.columns.values'),
    key: 'values',
    minWidth: 260,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Algorithm) => valuesText(row)
  },
  weight: { title: t('page.forecast.algorithms.columns.weight'), key: 'weight', width: 80, align: 'center' },
  role: {
    title: t('page.forecast.algorithms.columns.role'),
    key: 'role',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.Algorithm) =>
      t(row.baseline ? 'page.forecast.evaluation.baseline' : 'page.forecast.evaluation.candidate')
  },
  covariates: {
    title: t('page.forecast.algorithms.columns.covariates'),
    key: 'covariates',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Algorithm) =>
      h(NTag, { size: 'small', bordered: false, type: row.covariates ? 'success' : 'default' }, () =>
        t(row.covariates ? 'common.yesOrNo.yes' : 'common.yesOrNo.no')
      )
  },
  version: {
    title: t('page.forecast.algorithms.columns.version'),
    key: 'version',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Algorithm) => `v${row.version} / ${row.impl_version}`
  },
  description: {
    title: t('page.forecast.algorithms.columns.description'),
    key: 'description',
    minWidth: 320,
    ellipsis: { tooltip: true }
  },
  complexity: {
    title: t('page.forecast.algorithms.columns.complexity'),
    key: 'complexity',
    width: 260,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  min_history: {
    title: t('page.forecast.algorithms.columns.minHistory'),
    key: 'min_history',
    width: 260,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  updated_at: {
    title: t('common.updateTime'),
    key: 'updated_at',
    width: 170,
    align: 'center',
    render: (row: Api.Forecast.Algorithm) => formatDateTime(row.updated_at)
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 260,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Algorithm) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openEdit(row) }, () =>
          t('common.edit')
        ),
        h(NButton, { size: 'small', onClick: () => openDetail(row) }, () => t('page.forecast.algorithms.detail')),
        row.origin !== 'builtin'
          ? h(
              NPopconfirm,
              { onPositiveClick: () => remove(row) },
              {
                trigger: () =>
                  h(NButton, { size: 'small', type: 'error', ghost: true, disabled: row.enabled }, () =>
                    t('common.delete')
                  ),
                default: () => t('page.forecast.algorithms.deleteConfirm')
              }
            )
          : null
      ])
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_algorithm_management',
  columnMap,
  defaultKeys: ['algorithm', 'origin', 'category', 'enabled', 'values', 'weight', 'description', 'operate']
});

// ================= edit =================
const editing = ref<Api.Forecast.Algorithm | null>(null);
const saving = ref(false);
const form = reactive({
  enabled: false,
  note: '',
  params: {} as Record<string, unknown>,
  weight: 1,
  train_budget_seconds: 0,
  promote_min_points: 0,
  promote_min_improvement: 0,
  promote_peak_tolerance: 0
});

// ================= custom algorithms (a formula and a parameter schema written on the page) =================
const customVisible = ref(false);
const customEditing = ref<Api.Forecast.Algorithm | null>(null);

function openCustom(row?: Api.Forecast.Algorithm) {
  customEditing.value = row ?? null;
  customVisible.value = true;
}

async function remove(row: Api.Forecast.Algorithm) {
  const { error } = await fetchDeleteAlgorithm(row.id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    await reload();
  }
}

function openEdit(row: Api.Forecast.Algorithm) {
  if (row.custom) {
    openCustom(row);
    return;
  }
  editing.value = row;
  Object.assign(form, {
    enabled: row.enabled,
    note: row.note || '',
    // the editor shows what is in force
    params: { ...row.values },
    weight: row.weight || 1,
    train_budget_seconds: row.train_budget_seconds,
    promote_min_points: row.promote_min_points,
    promote_min_improvement: row.promote_min_improvement,
    promote_peak_tolerance: row.promote_peak_tolerance
  });
}

async function save() {
  if (!editing.value) return;
  saving.value = true;
  try {
    const { error } = await fetchUpdateAlgorithm(editing.value.id, {
      enabled: form.enabled,
      description: form.note,
      params: form.params,
      weight: form.weight,
      train_budget_seconds: form.train_budget_seconds,
      promote_min_points: form.promote_min_points,
      promote_min_improvement: form.promote_min_improvement,
      promote_peak_tolerance: form.promote_peak_tolerance
    });
    if (!error) {
      editing.value = null;
      message.success(t('common.modifySuccess'));
      await reload();
    }
  } finally {
    saving.value = false;
  }
}

// ================= detail: parameters, and how the algorithm performs for each module =================
const detail = ref<Api.Forecast.Algorithm | null>(null);
const usage = ref<Api.Forecast.AlgorithmUsage | null>(null);
const usageLoading = ref(false);

async function openDetail(row: Api.Forecast.Algorithm) {
  detail.value = row;
  usage.value = null;
  usageLoading.value = true;
  const { data } = await fetchGetAlgorithmUsage(row.id);
  usageLoading.value = false;
  usage.value = data;
}

const paramColumns = computed<any[]>(() => [
  { title: t('page.forecast.algorithms.param.name'), key: 'name', width: 190 },
  { title: t('page.forecast.algorithms.param.type'), key: 'type', width: 80 },
  {
    title: t('page.forecast.algorithms.param.default'),
    key: 'default',
    width: 100,
    render: (row: Api.Forecast.ParamSpec) =>
      row.default === undefined ? (row.required ? '*' : '-') : String(row.default)
  },
  {
    title: t('page.forecast.algorithms.param.range'),
    key: 'range',
    width: 130,
    render: (row: Api.Forecast.ParamSpec) =>
      row.enum
        ? row.enum.join(' | ')
        : row.min === undefined && row.max === undefined
          ? '-'
          : `${row.min ?? '-'} ~ ${row.max ?? '-'}`
  },
  { title: t('page.forecast.algorithms.param.description'), key: 'description', ellipsis: { tooltip: true } }
]);

const usageColumns = computed<any[]>(() => [
  { title: t('page.forecast.modules.name'), key: 'module_name', width: 160 },
  {
    title: t('page.forecast.modules.workload'),
    key: 'workload',
    width: 200,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.UsageModule) => `${row.namespace}/${row.workload}`
  },
  {
    title: t('page.forecast.scores.score'),
    key: 'score',
    width: 90,
    render: (row: Api.Forecast.UsageModule) => (row.score === null ? '-' : row.score.toFixed(1))
  },
  {
    title: t('page.forecast.algorithms.usageBySource'),
    key: 'source_usage',
    minWidth: 360,
    render: (row: Api.Forecast.UsageModule) =>
      h(
        'div',
        { class: 'leading-22px' },
        (row.source_usage || []).map(item =>
          h(
            'div',
            `${item.source}: ${t('page.forecast.algorithms.backtestWape')} ${item.backtest ? percent(item.backtest.wape) : '-'} · ${t('page.forecast.algorithms.measuredWape')} ${item.measured ? percent(item.measured.wape) : '-'} · ${t('page.forecast.evaluation.peakUnder')} ${item.measured ? percent(item.measured.peak_under) : item.backtest ? percent(item.backtest.peak_under) : '-'}${item.backtest ? (item.backtest.promoted ? ' · ' + t('page.forecast.evaluation.promoted') : '') : ''}`
          )
        )
      )
  },
  {
    title: t('common.operate'),
    key: 'operate',
    width: 90,
    render: (row: Api.Forecast.UsageModule) =>
      h(NButton, { size: 'small', onClick: () => openTrace(row) }, () => t('page.forecast.algorithms.trace'))
  }
]);

// ================= trace of the algorithm on one module =================
const trace = ref<Api.Forecast.Trace | null>(null);
const traceTarget = ref<Api.Forecast.UsageModule | null>(null);

async function openTrace(row: Api.Forecast.UsageModule) {
  if (!detail.value) return;
  traceTarget.value = row;
  const { data } = await fetchGetModuleTrace(row.module_id, detail.value.id);
  trace.value = data;
}

onMounted(() => {
  cfg.initColumnConfig();
  runSearch();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="runSearch" @reset="resetSearch">
      <NFormItemGi :span="8" :label="t('common.keyword')">
        <NInput
          v-model:value="search.keyword"
          clearable
          :placeholder="t('page.forecast.algorithms.keywordPlaceholder')"
          @keyup.enter="runSearch"
        />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.forecast.algorithms.columns.category')">
        <NSelect
          v-model:value="search.category"
          clearable
          :options="categoryOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.algorithms.columns.category') })"
        />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.forecast.algorithms.columns.enabled')">
        <NSelect
          v-model:value="search.enabled"
          clearable
          :options="enabledOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.algorithms.columns.enabled') })"
        />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.algorithms.title')"
      :help="t('page.forecast.algorithms.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :row-key="(row: any) => row.id"
      show-add
      @add="openCustom()"
      @refresh="reload"
    />

    <CustomAlgorithmForm v-model:show="customVisible" :editing="customEditing" @saved="reload" />

    <!-- edit -->
    <NModal
      :show="Boolean(editing)"
      preset="card"
      :title="`${t('page.forecast.algorithms.editTitle')} - ${editing?.id || ''}`"
      class="edit-modal-wide"
      @update:show="value => !value && (editing = null)"
    >
      <div v-if="editing" class="max-h-70vh overflow-y-auto pr-8px">
        <div class="mb-8px text-13px opacity-80">{{ editing.description }}</div>
        <div class="mb-8px font-medium">{{ t('page.forecast.algorithms.sectionBasic') }}</div>
        <NForm :model="form" label-placement="top">
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.algorithms.columns.enabled') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.enabledHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSwitch v-model:value="form.enabled" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.algorithms.columns.weight') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.weightHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.weight" :min="0.1" :max="100" :step="0.1" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.algorithms.trainBudget') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.trainBudgetHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber
              v-model:value="form.train_budget_seconds"
              :min="0"
              :max="3600"
              :precision="0"
              class="w-full"
            />
          </NFormItem>
          <NFormItem :label="t('common.remark')">
            <NInput v-model:value="form.note" />
          </NFormItem>
        </NForm>

        <div class="mb-8px mt-12px flex items-center gap-6px font-medium">
          {{ t('page.forecast.algorithms.sectionParams') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.paramsHint') }}</div>
          </IconTooltip>
        </div>
        <AlgorithmParamsEditor v-if="editing.params.length" v-model="form.params" :specs="editing.params" />
        <div v-else class="text-13px opacity-70">{{ t('page.forecast.algorithms.noParams') }}</div>

        <template v-if="!editing.baseline">
          <div class="mb-8px mt-12px flex items-center gap-6px font-medium">
            {{ t('page.forecast.algorithms.sectionPromotion') }}
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.promotionHint') }}</div>
            </IconTooltip>
          </div>
          <NForm :model="form" label-placement="top">
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.algorithms.promoteMinPoints') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t('page.forecast.algorithms.promoteMinPointsHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInputNumber v-model:value="form.promote_min_points" :min="0" :precision="0" class="w-full" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.algorithms.promoteMinImprovement') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">
                      {{ t('page.forecast.algorithms.promoteImprovementHint') }}
                    </div>
                  </IconTooltip>
                </span>
              </template>
              <NInputNumber
                v-model:value="form.promote_min_improvement"
                :min="0"
                :max="0.99"
                :step="0.01"
                class="w-full"
              />
            </NFormItem>
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.algorithms.promotePeakTolerance') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t('page.forecast.algorithms.promotePeakHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInputNumber v-model:value="form.promote_peak_tolerance" :min="0" :step="0.05" class="w-full" />
            </NFormItem>
          </NForm>
        </template>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="editing = null">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- detail -->
    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="detail?.id"
      class="edit-modal-wide"
      @update:show="value => !value && (detail = null)"
    >
      <div v-if="detail" class="max-h-70vh overflow-y-auto pr-8px">
        <NDescriptions :column="1" label-placement="left" size="small" bordered>
          <NDescriptionsItem :label="t('page.forecast.algorithms.columns.description')">
            {{ detail.description }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.algorithms.columns.complexity')">
            {{ detail.complexity }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.algorithms.columns.minHistory')">
            {{ detail.min_history }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.base" :label="t('page.forecast.algorithms.impl.base')">
            {{ detail.base }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.custom" :label="t('page.forecast.algorithms.formula.sectionFormula')">
            <code class="whitespace-pre-wrap break-all">{{ detail.formula }}</code>
            <div class="mt-4px opacity-70">
              {{ detail.recursive ? t('page.forecast.algorithms.formula.recursive') : '' }}
            </div>
          </NDescriptionsItem>
        </NDescriptions>
        <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.algorithms.param.title') }}</div>
        <NDataTable
          size="small"
          :columns="paramColumns"
          :data="detail.params"
          :row-key="(row: Api.Forecast.ParamSpec) => row.name"
        />
        <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.algorithms.usage') }}</div>
        <NDataTable
          size="small"
          :loading="usageLoading"
          :columns="usageColumns"
          :data="usage?.modules || []"
          :row-key="(row: Api.Forecast.UsageModule) => row.module_id"
          :scroll-x="1000"
        />
      </div>
    </NModal>

    <!-- trace of the algorithm on one module -->
    <NModal
      :show="Boolean(trace)"
      preset="card"
      :title="`${t('page.forecast.algorithms.trace')} - ${traceTarget?.module_name || ''}`"
      class="w-720px max-w-90vw"
      @update:show="value => !value && ((trace = null), (traceTarget = null))"
    >
      <NTimeline v-if="trace">
        <NTimelineItem
          type="info"
          :title="t('page.forecast.algorithms.traceModule')"
          :content="`${trace.module.name} · ${trace.algorithm} · ${trace.source || '-'}`"
        />
        <NTimelineItem
          :type="trace.task.defined && trace.task.enabled ? 'success' : 'warning'"
          :title="t('page.forecast.algorithms.traceTask', { task: trace.task.task_type })"
          :content="
            trace.task.defined
              ? `${trace.task.cron_expr} · ${trace.task.enabled ? t('common.enable') : t('common.disable')}`
              : t('page.forecast.algorithms.traceNoTask')
          "
        />
        <NTimelineItem
          :type="trace.prediction.present ? (trace.prediction.version_current ? 'success' : 'warning') : 'default'"
          :title="t('page.forecast.algorithms.tracePrediction')"
          :content="
            trace.prediction.present
              ? `${formatDateTime(trace.prediction.prediction_time!)} · ${trace.prediction.points} ${t('page.forecast.algorithms.points')} · ${trace.prediction.model_version}${
                  trace.prediction.version_current ? '' : ' · ' + t('page.forecast.algorithms.versionStale')
                }`
              : t('page.forecast.algorithms.traceNoPrediction')
          "
        />
        <NTimelineItem
          :type="trace.backtest ? (trace.backtest.promoted ? 'success' : 'warning') : 'default'"
          :title="t('page.forecast.algorithms.traceBacktest')"
          :content="
            trace.backtest
              ? `${formatDateTime(trace.backtest.at)} · ${t(trace.backtest.promoted ? 'page.forecast.evaluation.promoted' : 'page.forecast.algorithms.notPromoted')}${
                  trace.backtest.params_current ? '' : ' · ' + t('page.forecast.algorithms.backtestStale')
                } · ${trace.backtest.reason}`
              : t('page.forecast.algorithms.traceNoBacktest')
          "
        />
        <NTimelineItem
          :type="trace.evaluation ? 'success' : 'default'"
          :title="t('page.forecast.algorithms.traceEvaluation')"
          :content="
            trace.evaluation
              ? `${formatDateTime(trace.evaluation.prediction_time)} · WAPE ${percent(trace.evaluation.wape)} · ${t('page.forecast.evaluation.peakUnder')} ${percent(trace.evaluation.peak_under)}`
              : t('page.forecast.algorithms.traceNoEvaluation')
          "
        />
        <NTimelineItem
          :type="trace.score ? (trace.score.selected ? 'success' : 'info') : 'default'"
          :title="t('page.forecast.algorithms.traceScore')"
          :content="
            trace.score
              ? `${formatDateTime(trace.score.at)} · ${trace.score.score.toFixed(1)} · #${trace.score.rank} · ${trace.score.windows} ${t('page.forecast.scores.windows')}${trace.score.selected ? ' · ' + t('page.forecast.scores.inUse') : ''}`
              : t('page.forecast.algorithms.traceNoScore')
          "
        />
      </NTimeline>
    </NModal>
  </div>
</template>
