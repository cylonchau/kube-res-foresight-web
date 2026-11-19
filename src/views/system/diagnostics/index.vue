<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NSelect,
  NSpace,
  NTag,
  NTooltip
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchGetDatabaseDiagnostics, fetchGetRequestDiagnostics } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'SystemDiagnostics' });

/**
 * What the platform says about why a page is slow or a request ends in a 502 or a 504: the baseline of the time of every route with the layer the
 * time is in, the runs of the process and how each ended, what those numbers say, and what the database says about itself (the pool of
 * connections, the tables that grow and the use of their indexes, the statements it is running now). The two reads are independent: one that fails
 * leaves the other on the page. The numbers are measured by the platform and the database's own statistics, not rows.
 */
const { t } = useI18n();
const loading = ref(false);
const report = ref<Api.Diagnostics.Database | null>(null);
const requests = ref<Api.Diagnostics.Requests | null>(null);
const hours = ref(24);
const hourOptions = [1, 6, 24, 72, 168, 336].map(n => ({ label: t('page.diagnostics.hoursOption', { n }), value: n }));

async function loadDatabase() {
  const { data } = await fetchGetDatabaseDiagnostics();
  if (data) report.value = data;
}

async function loadRequests() {
  const { data } = await fetchGetRequestDiagnostics(hours.value);
  if (data) requests.value = data;
}

async function load() {
  loading.value = true;
  try {
    await Promise.allSettled([loadRequests(), loadDatabase()]);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function seconds(millis: number) {
  return millis >= 10000 ? `${Math.round(millis / 1000)}` : (millis / 1000).toFixed(1);
}

function duration(millis: number) {
  if (millis >= 1000) return `${(millis / 1000).toFixed(millis >= 10000 ? 0 : 1)} s`;
  return `${millis} ms`;
}

function layerLabel(layer?: string) {
  return layer ? t(`page.diagnostics.layers.${layer}` as App.I18n.I18nKey) : '';
}

/** the sentence of a finding: the platform sends a code and its figures, the page writes it in the language of the user */
function sentence(f: Api.Diagnostics.Finding) {
  const p = f.params ?? {};
  const named: Record<string, string | number> = { ...p, route: f.route ?? '', layer: layerLabel(f.layer) };
  for (const key of ['p95', 'max', 'took']) {
    const raw = p[`${key}_ms`];
    if (typeof raw === 'number') named[key] = seconds(raw);
  }
  for (const key of ['sys', 'limit']) {
    const raw = p[`${key}_bytes`];
    if (typeof raw === 'number') named[key] = bytes(raw);
  }
  for (const key of ['at', 'last']) {
    if (typeof p[key] === 'string') named[key] = formatDateTime(p[key] as string);
  }
  return t(`page.diagnostics.finding.${f.code}` as App.I18n.I18nKey, named);
}

const levelType = { critical: 'error', warning: 'warning', info: 'info' } as const;

function bytes(n: number) {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)} GiB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MiB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KiB`;
  return `${n} B`;
}

/** a wait for a connection is the one number here that says the pool, not a query, is what is slow */
const poolWaiting = computed(() => (report.value?.pool.wait_count ?? 0) > 0);

const tableColumns = computed<DataTableColumns<Api.Diagnostics.Table>>(() => [
  { title: t('page.diagnostics.table'), key: 'name', width: 220 },
  {
    title: t('page.diagnostics.rows'),
    key: 'rows',
    align: 'right',
    render: row => `${row.rows.toLocaleString()}${row.rows_capped ? '+' : ''}`
  },
  {
    title: t('page.diagnostics.size'),
    key: 'size_bytes',
    align: 'right',
    render: row => (row.size_bytes ? bytes(row.size_bytes) : '-')
  },
  {
    title: t('page.diagnostics.indexSize'),
    key: 'index_bytes',
    align: 'right',
    render: row => (row.index_bytes ? bytes(row.index_bytes) : '-')
  },
  {
    title: t('page.diagnostics.dead'),
    key: 'dead_rows',
    align: 'right',
    render: row => row.dead_rows.toLocaleString()
  },
  { title: t('page.diagnostics.vacuum'), key: 'last_vacuum', render: row => formatDateTime(row.last_vacuum) }
]);

const indexColumns = computed<DataTableColumns<Api.Diagnostics.Index>>(() => [
  { title: t('page.diagnostics.table'), key: 'table', width: 220 },
  { title: t('page.diagnostics.index'), key: 'name' },
  { title: t('page.diagnostics.size'), key: 'size_bytes', align: 'right', render: row => bytes(row.size_bytes) },
  {
    title: t('page.diagnostics.scans'),
    key: 'scans',
    align: 'right',
    render: row => (row.scans === 0 ? `0 (${t('page.diagnostics.unused')})` : row.scans.toLocaleString())
  }
]);

const runningColumns = computed<DataTableColumns<Api.Diagnostics.RunningQuery>>(() => [
  {
    title: t('page.diagnostics.running'),
    key: 'running_ms',
    width: 120,
    render: row => `${(row.running_ms / 1000).toFixed(1)} s`
  },
  { title: t('common.status'), key: 'state', width: 160 },
  { title: t('page.diagnostics.waitType'), key: 'wait_type', width: 140, render: row => row.wait_type || '-' },
  { title: t('page.diagnostics.query'), key: 'query', ellipsis: { tooltip: true } }
]);

const layerType = { database: 'warning', prometheus: 'info', handler: 'default' } as const;

const routeColumns = computed<DataTableColumns<Api.Diagnostics.RouteStat>>(() => [
  {
    title: t('page.diagnostics.route'),
    key: 'route',
    minWidth: 280,
    ellipsis: { tooltip: true },
    render: row => `${row.method} ${row.route}`
  },
  {
    title: t('page.diagnostics.requests'),
    key: 'count',
    width: 90,
    align: 'right',
    render: row => row.count.toLocaleString()
  },
  { title: t('page.diagnostics.avg'), key: 'avg_ms', width: 90, align: 'right', render: row => duration(row.avg_ms) },
  { title: 'P50', key: 'p50_ms', width: 80, align: 'right', render: row => `≤ ${duration(row.p50_ms)}` },
  { title: 'P95', key: 'p95_ms', width: 90, align: 'right', render: row => `≤ ${duration(row.p95_ms)}` },
  { title: 'P99', key: 'p99_ms', width: 90, align: 'right', render: row => `≤ ${duration(row.p99_ms)}` },
  { title: t('page.diagnostics.max'), key: 'max_ms', width: 90, align: 'right', render: row => duration(row.max_ms) },
  {
    title: t('page.diagnostics.layer'),
    key: 'layer',
    width: 150,
    render: row => h(NTag, { size: 'small', bordered: false, type: layerType[row.layer] }, () => layerLabel(row.layer))
  },
  {
    title: t('page.diagnostics.share'),
    key: 'share',
    width: 130,
    align: 'right',
    render: row => `${Math.round(row.db_share * 100)}% / ${Math.round(row.prom_share * 100)}%`
  },
  {
    title: t('page.diagnostics.stops'),
    key: 'timeouts',
    width: 100,
    align: 'right',
    render: row => row.timeouts || '-'
  },
  {
    title: t('page.diagnostics.gaveUp'),
    key: 'abandoned',
    width: 90,
    align: 'right',
    render: row => row.abandoned || '-'
  },
  {
    title: t('page.diagnostics.errors5xx'),
    key: 'status_5xx',
    width: 70,
    align: 'right',
    render: row => row.status_5xx || '-'
  },
  {
    title: t('page.diagnostics.examples'),
    key: 'examples',
    width: 200,
    render: row =>
      row.examples.length
        ? h(
            NTooltip,
            {},
            {
              trigger: () => h('span', { class: 'font-mono text-12px' }, row.examples[0].request_id || '-'),
              default: () =>
                h(
                  'div',
                  row.examples.map(e =>
                    h(
                      'div',
                      { class: 'font-mono text-12px' },
                      `${e.request_id || '-'}  ${duration(e.ms)}  ${e.status}${e.abandoned ? ' ✕' : ''}`
                    )
                  )
                )
            }
          )
        : '-'
  }
]);

function endedLabel(boot: Api.Diagnostics.Boot) {
  if (boot.unexpected) return t('page.diagnostics.killedEnd');
  if (boot.graceful) return t('page.diagnostics.gracefulEnd');
  return t('page.diagnostics.alive');
}

const bootColumns = computed<DataTableColumns<Api.Diagnostics.Boot>>(() => [
  { title: t('page.diagnostics.instance'), key: 'instance', minWidth: 200, ellipsis: { tooltip: true } },
  {
    title: t('page.diagnostics.started'),
    key: 'started_at',
    width: 170,
    render: row => formatDateTime(row.started_at)
  },
  { title: t('page.diagnostics.lastSeen'), key: 'last_seen', width: 170, render: row => formatDateTime(row.last_seen) },
  {
    title: t('page.diagnostics.ended'),
    key: 'ended',
    width: 220,
    render: row =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.unexpected ? 'error' : row.graceful ? 'default' : 'success' },
        () => endedLabel(row)
      )
  },
  {
    title: t('page.diagnostics.memory'),
    key: 'memory',
    width: 220,
    align: 'right',
    render: row =>
      `${row.sys_bytes ? bytes(row.sys_bytes) : '-'} / ${row.mem_limit ? bytes(row.mem_limit) : t('page.diagnostics.noLimit')}`
  }
]);

const writeColumns = computed<DataTableColumns<Api.Diagnostics.WriteRate>>(() => [
  { title: t('page.diagnostics.module'), key: 'module_id', width: 160, render: row => `#${row.module_id}` },
  { title: t('page.diagnostics.writes'), key: 'rows', align: 'right', render: row => row.rows.toLocaleString() }
]);
</script>

<template>
  <div class="h-full flex-col gap-12px overflow-auto">
    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <NSpace justify="space-between" align="center">
        <div>
          <div class="text-16px font-medium">{{ t('page.diagnostics.title') }}</div>
        </div>
        <NSpace align="center">
          <NSelect v-model:value="hours" class="w-160px" :options="hourOptions" @update:value="loadRequests" />
          <NButton type="primary" :loading="loading" @click="load">{{ t('common.refresh') }}</NButton>
        </NSpace>
      </NSpace>
    </NCard>

    <template v-if="requests">
      <NCard :bordered="false" size="small" class="rounded-16px shadow-sm" :title="t('page.diagnostics.diagnosis')">
        <NSpace v-if="requests.findings.length" vertical :size="8">
          <NAlert v-for="(f, i) in requests.findings" :key="i" :type="levelType[f.level]" :bordered="false">
            <template #header>{{ t(`page.diagnostics.level.${f.level}`) }}</template>
            {{ sentence(f) }}
          </NAlert>
        </NSpace>
        <div v-else class="text-gray-500">{{ t('page.diagnostics.noFindings') }}</div>
      </NCard>

      <NCard :bordered="false" size="small" class="rounded-16px shadow-sm" :title="t('page.diagnostics.baseline')">
        <div class="mb-8px text-12px text-gray-500">{{ t('page.diagnostics.baselineHint') }}</div>
        <NDataTable
          size="small"
          :columns="routeColumns"
          :data="requests.routes"
          :bordered="false"
          :scroll-x="1700"
          :max-height="420"
        />
      </NCard>

      <NCard
        v-if="requests.boots.length"
        :bordered="false"
        size="small"
        class="rounded-16px shadow-sm"
        :title="t('page.diagnostics.runs')"
      >
        <NDataTable size="small" :columns="bootColumns" :data="requests.boots" :bordered="false" :max-height="320" />
      </NCard>
    </template>

    <template v-if="report">
      <NAlert v-for="note in report.unavailable" :key="note" type="info" :bordered="false">{{ note }}</NAlert>

      <NCard :bordered="false" size="small" class="rounded-16px shadow-sm" :title="t('page.diagnostics.pool')">
        <NAlert v-if="poolWaiting" type="warning" :bordered="false" class="mb-8px">
          {{ t('page.diagnostics.poolWaiting') }}
        </NAlert>
        <NDescriptions :column="4" label-placement="top" size="small">
          <NDescriptionsItem :label="t('page.diagnostics.driver')">
            <NTag size="small" :bordered="false">{{ report.driver }}</NTag>
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.diagnostics.maxOpen')">
            {{ report.pool.max_open || '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.diagnostics.open')">
            {{ report.pool.open }} ({{ t('page.diagnostics.inUse') }} {{ report.pool.in_use }},
            {{ t('page.diagnostics.idle') }} {{ report.pool.idle }})
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.diagnostics.waits')">
            {{ report.pool.wait_count }} / {{ report.pool.wait_ms }} ms
          </NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <NCard :bordered="false" size="small" class="rounded-16px shadow-sm" :title="t('page.diagnostics.tables')">
        <NDataTable size="small" :columns="tableColumns" :data="report.tables" :bordered="false" :scroll-x="900" />
      </NCard>

      <NCard
        v-if="report.indexes.length"
        :bordered="false"
        size="small"
        class="rounded-16px shadow-sm"
        :title="t('page.diagnostics.indexes')"
      >
        <NDataTable size="small" :columns="indexColumns" :data="report.indexes" :bordered="false" :max-height="320" />
      </NCard>

      <NCard
        v-if="report.running.length"
        :bordered="false"
        size="small"
        class="rounded-16px shadow-sm"
        :title="t('page.diagnostics.runningNow')"
      >
        <NDataTable size="small" :columns="runningColumns" :data="report.running" :bordered="false" />
      </NCard>

      <NCard
        v-if="report.writes.length"
        :bordered="false"
        size="small"
        class="rounded-16px shadow-sm"
        :title="t('page.diagnostics.writesHour')"
      >
        <NDataTable size="small" :columns="writeColumns" :data="report.writes" :bordered="false" />
      </NCard>
    </template>
  </div>
</template>
