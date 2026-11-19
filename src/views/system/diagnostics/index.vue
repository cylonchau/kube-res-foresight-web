<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { NAlert, NButton, NCard, NDataTable, NDescriptions, NDescriptionsItem, NSpace, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchGetDatabaseDiagnostics } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'SystemDiagnostics' });

/**
 * What the database says about itself: the pool of connections of this process, the tables that grow with their sizes and the use of their
 * indexes, the statements it is running now, and which module writes the most. It is read when the page opens and when it is asked again; the
 * numbers are the database's own statistics, not rows, and the queries have a time limit so the page cannot become the slow query.
 */
const { t } = useI18n();
const loading = ref(false);
const report = ref<Api.Diagnostics.Database | null>(null);

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchGetDatabaseDiagnostics();
    if (data) report.value = data;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

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
        <NButton type="primary" :loading="loading" @click="load">{{ t('common.refresh') }}</NButton>
      </NSpace>
    </NCard>

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
