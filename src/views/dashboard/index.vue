<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NFormItemGi, NSpin, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { lastHours, resolveRange } from '@/hooks/business/use-forecast-modules';
import type { RangeValue } from '@/hooks/business/use-forecast-modules';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { useRouterPush } from '@/hooks/common/router';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetDashboard } from '@/service/api';
import { axisTimeLabel, formatDateTime } from '@/utils/date';
import { operateWidth } from '@/utils/operate-width';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { reasonText } from '@/utils/reason';

defineOptions({ name: 'Dashboard' });

/**
 * The home page: is the platform doing its work, and which modules need someone to look. The counts, the replica changes the operator
 * applied and the modules with something wrong, over a window. It shows stored facts only and changes nothing.
 */
const { t } = useI18n();
const { routerPushByKey } = useRouterPush();
const p = (key: string, named?: Record<string, unknown>) => t(`page.dashboard.${key}`, named ?? {});

const search = reactive({ range: lastHours(24) as RangeValue | null });
const data = ref<Api.Forecast.Dashboard | null>(null);
const loading = ref(false);
const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  onChange: (page: number) => (pagination.page = page),
  onUpdatePageSize: (size: number) => {
    pagination.pageSize = size;
    pagination.page = 1;
  }
});

/** the window in whole hours, from now back: the page is asked for hours, the range picker gives a start and an end */
const hours = computed(() => {
  const range = resolveRange(search.range);
  if (!range) return 24;
  return Math.min(720, Math.max(1, Math.ceil((range[1] - range[0]) / 3600000)));
});

async function load() {
  loading.value = true;
  try {
    const { data: result } = await fetchGetDashboard(hours.value);
    data.value = result ?? null;
    pagination.page = 1;
  } finally {
    loading.value = false;
  }
}

function resetSearch() {
  search.range = lastHours(24);
}

interface Cell {
  key: string;
  label: string;
  help: string;
  value: string;
  sub?: string;
  type?: 'default' | 'warning' | 'error' | 'success';
}

/** one row of figures: the modules by what they are, then what happened in the window */
const cells = computed<Cell[]>(() => {
  const d = data.value;
  if (!d) return [];
  const m = d.modules;
  return [
    { key: 'enabled', label: p('enabled'), help: p('enabledHelp'), value: `${m.enabled} / ${m.total}` },
    { key: 'auto', label: t('page.forecast.modules.mode_auto'), help: p('modeHelp'), value: String(m.auto) },
    {
      key: 'admission',
      label: t('page.forecast.modules.mode_admission'),
      help: p('modeHelp'),
      value: String(m.admission)
    },
    {
      key: 'recommend',
      label: t('page.forecast.modules.mode_recommend'),
      help: p('modeHelp'),
      value: String(m.recommend)
    },
    { key: 'observe', label: t('page.forecast.modules.mode_observe'), help: p('modeHelp'), value: String(m.observe) },
    {
      key: 'attention',
      label: p('attention'),
      help: p('attentionHelp'),
      value: String(m.attention),
      type: m.attention > 0 ? 'warning' : 'success'
    },
    { key: 'ups', label: p('scaleUps'), help: p('scaleHelp'), value: String(d.totals.scale_ups) },
    { key: 'downs', label: p('scaleDowns'), help: p('scaleHelp'), value: String(d.totals.scale_downs) },
    {
      key: 'failed',
      label: p('failedRuns'),
      help: p('failedRunsHelp'),
      value: String(d.totals.failed_runs),
      type: d.totals.failed_runs > 0 ? 'warning' : 'default'
    }
  ];
});

// the replica changes the operator applied: one stacked bar per stretch of the window, every stretch present
const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
      legend: { top: 0, right: 8 },
      grid: { left: 40, right: 16, top: 32, bottom: 28 },
      xAxis: { type: 'category', data: [] as number[], axisLabel: { formatter: (v: string) => axisTimeLabel(v) } },
      yAxis: { type: 'value', minInterval: 1 },
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function drawActivity() {
  const buckets = data.value?.activity ?? [];
  await updateOptions(opts => ({
    ...opts,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      formatter: (params: any) => {
        const list = (Array.isArray(params) ? params : [params]) as any[];
        const rows = [`<b>${formatDateTime(Number(list[0]?.axisValue))}</b>`];
        for (const item of list) rows.push(`${item.marker}${item.seriesName}: ${item.value}`);
        return rows.join('<br/>');
      }
    },
    xAxis: {
      type: 'category',
      data: buckets.map(b => new Date(b.at).getTime()),
      axisLabel: { formatter: (v: string) => axisTimeLabel(v) }
    },
    series: [
      {
        name: p('scaleUps'),
        type: 'bar',
        stack: 'scale',
        data: buckets.map(b => b.ups),
        itemStyle: { color: '#7eb26d' }
      },
      {
        name: p('scaleDowns'),
        type: 'bar',
        stack: 'scale',
        data: buckets.map(b => b.downs),
        itemStyle: { color: '#6ed0e0' }
      }
    ]
  }));
}
watch(data, drawActivity);

const flagType: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  failing: 'error',
  degraded: 'warning',
  stale: 'warning',
  no_recommendation: 'info',
  bypass: 'default'
};

const columnMap = {
  name: {
    title: t('page.forecast.modules.name'),
    key: 'name',
    minWidth: 140,
    ellipsis: { tooltip: true }
  },
  workload: {
    title: t('page.forecast.modules.workload'),
    key: 'workload',
    minWidth: 160,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.DashboardModule) => `${row.namespace}/${row.workload}`
  },
  mode: {
    title: t('page.forecast.modules.mode'),
    key: 'mode',
    width: 96,
    align: 'center',
    render: (row: Api.Forecast.DashboardModule) => t(`page.forecast.modules.mode_${row.mode}`)
  },
  flags: {
    title: p('flags'),
    key: 'flags',
    minWidth: 200,
    render: (row: Api.Forecast.DashboardModule) =>
      h(
        'span',
        { class: 'inline-flex flex-wrap gap-4px' },
        row.flags.map(flag =>
          h(NTag, { size: 'small', bordered: false, type: flagType[flag] ?? 'default' }, () => p(`flag_${flag}`))
        )
      )
  },
  algorithm: {
    title: t('page.forecast.effect.algorithmInUse'),
    key: 'algorithm',
    minWidth: 120,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.DashboardModule) => row.algorithm || '-'
  },
  replicas: {
    title: p('recommended'),
    key: 'replicas',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.DashboardModule) => (row.recommended_at ? String(row.replicas) : '-')
  },
  recommended_at: {
    title: p('recommendedAt'),
    key: 'recommended_at',
    width: 170,
    render: (row: Api.Forecast.DashboardModule) => formatDateTime(row.recommended_at)
  },
  last_run_at: {
    title: p('lastRunAt'),
    key: 'last_run_at',
    width: 170,
    render: (row: Api.Forecast.DashboardModule) => formatDateTime(row.last_run_at)
  },
  last_error: {
    title: p('lastError'),
    key: 'last_error',
    minWidth: 200,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.DashboardModule) =>
      row.last_error ? `${reasonText(row.last_error)}（${p('failuresInRow', { n: row.consecutive_failures })}）` : '-'
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([p('openEffect')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.DashboardModule) =>
      h(
        NButton,
        {
          size: 'tiny',
          type: 'primary',
          secondary: true,
          onClick: () => routerPushByKey('forecast-results_effect', { query: { module: String(row.id) } })
        },
        () => p('openEffect')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'dashboard_attention',
  columnMap,
  defaultKeys: ['name', 'workload', 'mode', 'flags', 'algorithm', 'replicas', 'last_error', 'operate'],
  columnMinWidths: { operate: 100 }
});

onMounted(() => {
  cfg.initColumnConfig();
  // the search is submitted by the list-search plugin when the filter above changes
  load();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="4" @search="load" @reset="resetSearch">
      <NFormItemGi :span="11" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" :clearable="false" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <NSpin :show="loading">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-x-16px gap-y-8px">
          <div v-for="cell in cells" :key="cell.key">
            <div class="text-12px opacity-70"><HelpLabel :label="cell.label" :help="cell.help" /></div>
            <div class="text-22px leading-30px">
              <NTag v-if="cell.type && cell.type !== 'default'" :type="cell.type" :bordered="false" size="medium">
                {{ cell.value }}
              </NTag>
              <span v-else>{{ cell.value }}</span>
            </div>
          </div>
        </div>
        <div class="mt-8px">
          <HelpLabel :label="p('activity')" :help="p('activityHelp')" class="text-13px opacity-80" />
          <div ref="domRef" class="h-180px w-full"></div>
        </div>
      </NSpin>
    </NCard>

    <ListTablePanel
      :title="p('attentionList')"
      :help="p('attentionListHelp')"
      :cfg="cfg"
      :loading="loading"
      :data="data?.attention ?? []"
      :remote="false"
      :pagination="pagination"
      :empty-hint="p('allGood')"
    />
  </div>
</template>
