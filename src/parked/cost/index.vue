<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NEmpty,
  NFormItemGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpin,
  NSwitch,
  NTag
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import HelpLabel from '@/components/common/help-label.vue';
import {
  fetchCreateCostPrice,
  fetchDeleteCostPrice,
  fetchGetCostModules,
  fetchGetCostOverview,
  fetchGetCostPrices,
  fetchSimulateCost,
  fetchUpdateCostPrice
} from '@/service/api';
import { fetchGetDatasourceOptions } from '@/service/api/datasource';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCpuMilli, formatDecimal, formatPercent } from '@/utils/format';

defineOptions({ name: 'ForecastCost' });

/**
 * What the cluster costs, what the workloads the platform manages could give back, and how many nodes that could empty. One view of
 * stacked sections; the price rules, the detail of a workload and the simulation are dialogs. The money is an estimate of the price rules
 * typed in, never a bill: nothing here changes a request, a replica or a node.
 */
const { t } = useI18n();

const search = reactive({ datasourceId: null as number | null, windowDays: 7, level: 'balanced' });
const datasources = ref<{ label: string; value: number }[]>([]);
const overview = ref<Api.Forecast.CostOverview | null>(null);
const modules = ref<Api.Forecast.CostModules | null>(null);
const loading = ref(false);

const windowOptions = [1, 3, 7, 14, 30].map(n => ({ label: t('page.forecast.cost.days', { n }), value: n }));
const levelOptions = computed(() =>
  (['aggressive', 'balanced', 'conservative'] as const).map(level => ({
    label: t(`page.forecast.cost.level_${level}`),
    value: level
  }))
);

const money = (value: number, currency: string) => `${formatDecimal(value, 2)} ${currency}`;
const cpuText = (cores: number) => formatCpuMilli(Math.round(cores * 1000), t('page.forecast.cost.coreWord'));
const resourceText = (kind: string, value: number) => (kind === 'cpu' ? cpuText(value) : formatBytes(value, 2));
const noteText = (prefix: string, code?: string) => (code ? t(`page.forecast.cost.${prefix}_${code}`) : '');

async function load() {
  loading.value = true;
  try {
    const datasourceId = search.datasourceId ?? undefined;
    const [m, o] = await Promise.all([
      fetchGetCostModules(search.windowDays, datasourceId),
      datasourceId ? fetchGetCostOverview(datasourceId) : Promise.resolve({ data: null })
    ]);
    modules.value = m.data ?? null;
    overview.value = o.data ?? null;
  } finally {
    loading.value = false;
  }
}

function resetSearch() {
  search.datasourceId = datasources.value[0]?.value ?? null;
  search.windowDays = 7;
  search.level = 'balanced';
}

onMounted(async () => {
  const { data } = await fetchGetDatasourceOptions();
  datasources.value = (data ?? []).map(item => ({ label: item.name, value: item.id }));
  search.datasourceId = datasources.value[0]?.value ?? null;
  await load();
});

/** the cost in the currency most of the cluster is priced in comes first */
const currencies = computed(() => overview.value?.allocation.currencies ?? []);
const overviewNotes = computed(() => (overview.value?.notes ?? []).filter((n, i, all) => all.indexOf(n) === i));

const workloadColumns = computed<DataTableColumns<Api.Forecast.CostWorkload>>(() => [
  {
    title: t('page.forecast.cost.workload'),
    key: 'workload',
    minWidth: 220,
    render: row => `${row.namespace} / ${row.kind} / ${row.workload}`
  },
  { title: t('page.forecast.cost.pods'), key: 'pods', width: 70 },
  {
    title: t('page.forecast.cost.cpuRequests'),
    key: 'cpu',
    width: 110,
    render: row => formatCpuMilli(row.cpu_milli, t('page.forecast.cost.coreWord'))
  },
  {
    title: t('page.forecast.cost.memoryRequests'),
    key: 'memory',
    width: 120,
    render: row => formatBytes(row.memory_bytes, 2)
  }
]);

// the most expensive workloads of one currency: the table is a look, not a list to page
const top = (c: Api.Forecast.CostCurrency) => c.workloads.slice(0, 8);
const workloadColumnsOf = (c: Api.Forecast.CostCurrency): DataTableColumns<Api.Forecast.CostWorkload> => [
  ...workloadColumns.value,
  {
    title: t('page.forecast.cost.monthly'),
    key: 'hourly',
    width: 130,
    render: row => money(row.hourly * (overview.value?.hours_per_month ?? 730), c.currency)
  }
];

interface ModuleRow {
  id: number;
  name: string;
  where: string;
  replicas: number;
  external: boolean;
  cpu: Api.Forecast.CostResource | null;
  memory: Api.Forecast.CostResource | null;
  /** what the surplus of both resources costs a month, in the currency of the answer */
  monthly: number;
}

const rows = computed<ModuleRow[]>(() =>
  (modules.value?.modules ?? []).map(m => ({
    id: m.module_id,
    name: m.name,
    where: `${m.namespace} / ${m.workload_kind} / ${m.workload}`,
    replicas: m.replicas,
    external: m.external,
    cpu: m.cpu,
    memory: m.memory,
    monthly: (m.cpu?.surplus_monthly ?? 0) + (m.memory?.surplus_monthly ?? 0)
  }))
);

function resourceCell(r: Api.Forecast.CostResource | null, kind: 'cpu' | 'memory') {
  if (!r) return '-';
  if (!r.enough) return h('span', { class: 'opacity-60' }, noteText('note', r.note) || '-');
  const lines = [
    h('div', `${t('page.forecast.cost.request')} ${resourceText(kind, r.request)}`),
    h('div', { class: 'opacity-70' }, `P95 ${resourceText(kind, r.usage.p95)} · ${formatPercent(r.utilization, 0)}`),
    h(
      'div',
      { class: 'opacity-70' },
      r.safe > 0 ? `${t('page.forecast.cost.safe')} ${resourceText(kind, r.safe)}` : noteText('note', r.note)
    )
  ];
  if (r.idle)
    lines.push(h(NTag, { size: 'tiny', type: 'warning', bordered: false }, () => t('page.forecast.cost.idle')));
  return h('div', { class: 'leading-18px' }, lines);
}

// the workload whose detail is open
const detail = ref<ModuleRow | null>(null);

const columns = computed<DataTableColumns<ModuleRow>>(() => [
  {
    title: t('page.forecast.cost.workload'),
    key: 'name',
    minWidth: 200,
    render: row =>
      h('div', { class: 'leading-18px' }, [
        h('div', { class: 'font-medium' }, row.name),
        h('div', { class: 'text-12px opacity-60' }, row.where),
        row.external
          ? h(NTag, { size: 'tiny', type: 'error', bordered: false }, () => t('page.forecast.cost.external'))
          : null
      ])
  },
  { title: t('page.forecast.cost.replicas'), key: 'replicas', width: 70, render: row => row.replicas || '-' },
  { title: 'CPU', key: 'cpu', minWidth: 190, render: row => resourceCell(row.cpu, 'cpu') },
  {
    title: t('page.forecast.cost.memory'),
    key: 'memory',
    minWidth: 190,
    render: row => resourceCell(row.memory, 'memory')
  },
  {
    title: () =>
      h(HelpLabel, { label: t('page.forecast.cost.surplusMonthly'), help: t('page.forecast.cost.surplusMonthlyHelp') }),
    key: 'monthly',
    width: 150,
    render: row =>
      modules.value?.currency && row.monthly > 0
        ? money(row.monthly, modules.value.currency)
        : h('span', { class: 'opacity-60' }, '-')
  },
  {
    title: '',
    key: 'actions',
    width: 80,
    render: row =>
      h(NButton, { size: 'tiny', secondary: true, onClick: () => (detail.value = row) }, () =>
        t('page.forecast.cost.detail')
      )
  }
]);

// ---- the detail of one workload ----
const showDetail = computed({ get: () => detail.value !== null, set: v => !v && (detail.value = null) });
const candidateColumns = (kind: 'cpu' | 'memory'): DataTableColumns<Api.Forecast.CostCandidate> => [
  { title: t('page.forecast.cost.level'), key: 'level', render: row => t(`page.forecast.cost.level_${row.level}`) },
  { title: t('page.forecast.cost.value'), key: 'value', render: row => resourceText(kind, row.value) },
  { title: t('page.forecast.cost.savingPerPod'), key: 'saving', render: row => resourceText(kind, row.saving) },
  {
    title: t('page.forecast.cost.savingMonthly'),
    key: 'monthly_saving',
    render: row =>
      modules.value?.currency && row.monthly_saving > 0 ? money(row.monthly_saving, modules.value.currency) : '-'
  }
];

// ---- the simulation ----
const simulating = ref(false);
const showSim = ref(false);
const sim = ref<Api.Forecast.CostSimulation | null>(null);

async function simulate() {
  if (!search.datasourceId) {
    window.$message?.warning(t('page.forecast.cost.pickDatasource'));
    return;
  }
  showSim.value = true;
  simulating.value = true;
  sim.value = null;
  try {
    const { data } = await fetchSimulateCost({
      datasource_id: search.datasourceId,
      level: search.level,
      window_days: search.windowDays
    });
    sim.value = data ?? null;
  } finally {
    simulating.value = false;
  }
}

const simRows = computed(() => {
  const s = sim.value;
  if (!s) return [];
  const row = (key: string, label: string, r: Api.Forecast.CostSimResult) => ({
    key,
    label,
    nodes: `${r.nodes_before} → ${r.nodes_after}`,
    released: r.released.length,
    pods: r.pods_changed,
    saving: r.savings.map(v => `${money(v.monthly, v.currency)} (${v.nodes})`).join(' + ') || '-',
    unpriced: r.unpriced_released
  });
  return [
    row('now', t('page.forecast.cost.simNow'), s.now),
    row('with', t('page.forecast.cost.simWith', { level: t(`page.forecast.cost.level_${s.level}`) }), s.with)
  ];
});
const simColumns = computed(() => [
  { title: '', key: 'label' },
  { title: t('page.forecast.cost.simNodes'), key: 'nodes', width: 110 },
  { title: t('page.forecast.cost.simReleased'), key: 'released', width: 90 },
  { title: t('page.forecast.cost.simPods'), key: 'pods', width: 110 },
  { title: t('page.forecast.cost.simSaving'), key: 'saving', minWidth: 170 },
  { title: t('page.forecast.cost.simUnpriced'), key: 'unpriced', width: 100 }
]);

// ---- the price rules ----
const showPrices = ref(false);
const rules = ref<Api.Forecast.CostPriceRule[]>([]);
const blank = (): Api.Forecast.CostPriceRulePayload & { id?: number } => ({
  name: '',
  match_kind: 'all',
  label_key: '',
  label_value: '',
  name_pattern: '',
  hourly_price: 0,
  currency: '',
  priority: 0,
  enabled: true,
  remark: ''
});
const form = ref(blank());
const saving = ref(false);

async function loadRules() {
  const { data } = await fetchGetCostPrices();
  rules.value = data?.list ?? [];
}

async function openPrices() {
  showPrices.value = true;
  form.value = blank();
  await loadRules();
}

async function saveRule() {
  saving.value = true;
  try {
    const { id, ...body } = form.value;
    const { error } = id ? await fetchUpdateCostPrice(id, body) : await fetchCreateCostPrice(body);
    if (error) return;
    window.$message?.success(t(id ? 'common.updateSuccess' : 'common.addSuccess'));
    form.value = blank();
    await loadRules();
    await load();
  } finally {
    saving.value = false;
  }
}

async function removeRule(id: number) {
  const { error } = await fetchDeleteCostPrice(id);
  if (error) return;
  window.$message?.success(t('common.deleteSuccess'));
  await loadRules();
  await load();
}

const matchOptions = computed(() =>
  (['all', 'label', 'name'] as const).map(kind => ({ label: t(`page.forecast.cost.match_${kind}`), value: kind }))
);
const matchText = (r: Api.Forecast.CostPriceRule) =>
  r.match_kind === 'label'
    ? `${r.label_key}${r.label_value ? `=${r.label_value}` : ''}`
    : r.match_kind === 'name'
      ? r.name_pattern
      : t('page.forecast.cost.match_all');
const ruleColumns = computed<DataTableColumns<Api.Forecast.CostPriceRule>>(() => [
  { title: t('page.forecast.cost.ruleName'), key: 'name', minWidth: 110 },
  { title: t('page.forecast.cost.ruleMatch'), key: 'match', minWidth: 170, render: row => matchText(row) },
  {
    title: t('page.forecast.cost.ruleHourly'),
    key: 'hourly_price',
    width: 130,
    render: row => `${row.hourly_price} ${row.currency}`
  },
  { title: t('page.forecast.cost.rulePriority'), key: 'priority', width: 70 },
  {
    title: t('page.forecast.cost.ruleEnabled'),
    key: 'enabled',
    width: 70,
    render: row => (row.enabled ? t('common.yesOrNo.yes') : t('common.yesOrNo.no'))
  },
  {
    title: '',
    key: 'actions',
    width: 130,
    render: row =>
      h('div', { class: 'flex gap-6px' }, [
        h(NButton, { size: 'tiny', secondary: true, onClick: () => (form.value = { ...row }) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => removeRule(row.id) },
          {
            trigger: () => h(NButton, { size: 'tiny', secondary: true, type: 'error' }, () => t('common.delete')),
            default: () => t('common.confirmDelete')
          }
        )
      ])
  }
]);
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ListSearchCard :model="search" :action-span="5" @reset="resetSearch" @search="load">
      <NFormItemGi :span="9">
        <template #label>
          <HelpLabel :label="t('page.forecast.cost.datasource')" :help="t('page.forecast.cost.datasourceHelp')" />
        </template>
        <NSelect
          v-model:value="search.datasourceId"
          :options="datasources"
          clearable
          :placeholder="t('page.forecast.cost.pickDatasource')"
        />
      </NFormItemGi>
      <NFormItemGi :span="5" :label="t('page.forecast.cost.window')">
        <NSelect v-model:value="search.windowDays" :options="windowOptions" />
      </NFormItemGi>
      <NFormItemGi :span="5">
        <template #label>
          <HelpLabel :label="t('page.forecast.cost.level')" :help="t('page.forecast.cost.levelHelp')" />
        </template>
        <NSelect v-model:value="search.level" :options="levelOptions" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard :bordered="false" size="small" class="cost-card min-h-0 flex-1 rounded-16px shadow-sm">
      <div class="mb-10px flex flex-wrap items-center justify-between gap-8px">
        <HelpLabel
          :label="t('page.forecast.cost.title')"
          :help="t('page.forecast.cost.testNote')"
          class="text-16px font-medium"
        />
        <div class="flex flex-wrap items-center gap-8px">
          <span v-if="overview" class="text-12px opacity-65">
            {{ t('page.forecast.cost.snapshotAt', { at: formatDateTime(overview.at) }) }}
          </span>
          <NButton size="tiny" secondary @click="openPrices">{{ t('page.forecast.cost.prices') }}</NButton>
          <NButton size="tiny" secondary :loading="loading" @click="load">
            {{ t('page.forecast.effect.refresh') }}
          </NButton>
          <NButton size="tiny" type="primary" :disabled="!search.datasourceId" @click="simulate">
            {{ t('page.forecast.cost.simulate') }}
          </NButton>
        </div>
      </div>

      <NSpin :show="loading">
        <div class="flex-col gap-16px">
          <!-- the cost of the cluster -->
          <section>
            <div class="mb-6px">
              <HelpLabel
                :label="t('page.forecast.cost.overview')"
                :help="t('page.forecast.cost.overviewHelp')"
                class="text-14px font-medium"
              />
            </div>
            <NEmpty v-if="!overview" :description="t('page.forecast.cost.pickDatasource')" class="py-16px" />
            <template v-else>
              <NAlert v-for="note in overviewNotes" :key="note" type="info" :show-icon="false" class="mb-6px">
                {{ noteText('snapshot', note) || note }}
              </NAlert>
              <div class="mb-6px text-12px opacity-70">
                {{
                  t('page.forecast.cost.counts', { nodes: overview.nodes, pods: overview.pods, rules: overview.rules })
                }}
                ·
                {{
                  t('page.forecast.cost.assumption', {
                    cpu: overview.cpu_share_percent,
                    hours: overview.hours_per_month
                  })
                }}
              </div>
              <NEmpty v-if="!currencies.length" :description="t('page.forecast.cost.noPricedNodes')" class="py-16px" />
              <div v-for="c in currencies" :key="c.currency" class="mb-12px">
                <div class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-16px gap-y-8px">
                  <div>
                    <div class="text-12px opacity-70">{{ t('page.forecast.cost.monthly') }}</div>
                    <div class="text-18px leading-26px">{{ money(c.monthly, c.currency) }}</div>
                    <div class="text-12px opacity-60">
                      {{ money(c.hourly, c.currency) }} / {{ t('page.forecast.cost.hour') }}
                    </div>
                  </div>
                  <div>
                    <div class="text-12px opacity-70">{{ t('page.forecast.cost.allocated') }}</div>
                    <div class="text-18px leading-26px">
                      {{ money(c.allocated * overview.hours_per_month, c.currency) }}
                    </div>
                  </div>
                  <div>
                    <HelpLabel
                      :label="t('page.forecast.cost.idleCost')"
                      :help="t('page.forecast.cost.idleCostHelp')"
                      class="text-12px opacity-70"
                    />
                    <div class="text-18px leading-26px">{{ money(c.idle * overview.hours_per_month, c.currency) }}</div>
                    <div class="text-12px opacity-60">{{ formatPercent(c.idle_share, 1) }}</div>
                  </div>
                  <div>
                    <div class="text-12px opacity-70">{{ t('page.forecast.cost.unitPrices') }}</div>
                    <div class="text-13px leading-22px">
                      {{ t('page.forecast.cost.coreHour') }} {{ formatDecimal(c.cpu_core_hour, 4) }} {{ c.currency }}
                    </div>
                    <div class="text-13px leading-22px">
                      {{ t('page.forecast.cost.gibHour') }} {{ formatDecimal(c.memory_gib_hour, 4) }} {{ c.currency }}
                    </div>
                  </div>
                </div>
                <div class="mb-4px mt-8px text-12px opacity-70">
                  {{ t('page.forecast.cost.topWorkloads', { currency: c.currency }) }}
                </div>
                <NDataTable
                  size="small"
                  :columns="workloadColumnsOf(c)"
                  :data="top(c)"
                  :bordered="false"
                  :pagination="false"
                  :scroll-x="640"
                />
              </div>
              <div v-if="overview.allocation.unpriced.length" class="text-12px opacity-70">
                {{ t('page.forecast.cost.unpriced', { n: overview.allocation.unpriced.length }) }}:
                {{ overview.allocation.unpriced.map(n => n.node).join(', ') }}
              </div>
            </template>
          </section>

          <!-- what the workloads could give back -->
          <section class="cost-section">
            <div class="mb-6px flex flex-wrap items-center gap-8px">
              <HelpLabel
                :label="t('page.forecast.cost.waste')"
                :help="t('page.forecast.cost.wasteHelp')"
                class="text-14px font-medium"
              />
              <NTag v-if="modules?.money_note" size="small" :bordered="false" type="warning">
                {{ noteText('money', modules.money_note) }}
              </NTag>
            </div>
            <NEmpty v-if="!rows.length && !loading" :description="t('page.forecast.cost.noModules')" class="py-24px" />
            <NDataTable
              v-else
              size="small"
              :columns="columns"
              :data="rows"
              :row-key="(row: ModuleRow) => row.id"
              :bordered="false"
              :pagination="false"
              :scroll-x="960"
            />
          </section>
        </div>
      </NSpin>
    </NCard>

    <!-- one workload: the evidence and the candidates, the two resources stacked -->
    <NModal v-model:show="showDetail" preset="card" :title="detail?.name" class="w-860px max-w-[95vw]">
      <div v-if="detail" class="flex-col gap-16px">
        <div class="text-12px opacity-70">{{ detail.where }}</div>
        <template v-for="kind in ['cpu', 'memory'] as const" :key="kind">
          <section v-if="detail[kind]">
            <div class="mb-4px text-14px font-medium">
              {{ kind === 'cpu' ? 'CPU' : t('page.forecast.cost.memory') }}
            </div>
            <div v-if="!detail[kind]!.enough" class="text-13px opacity-70">
              {{ noteText('note', detail[kind]!.note) }}
            </div>
            <template v-else>
              <div class="mb-6px grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-16px gap-y-4px text-13px">
                <span>{{ t('page.forecast.cost.request') }}: {{ resourceText(kind, detail[kind]!.request) }}</span>
                <span>
                  {{ t('page.forecast.cost.safe') }}:
                  {{ detail[kind]!.safe > 0 ? resourceText(kind, detail[kind]!.safe) : '-' }}
                </span>
                <span>P50: {{ resourceText(kind, detail[kind]!.usage.p50) }}</span>
                <span>P95: {{ resourceText(kind, detail[kind]!.usage.p95) }}</span>
                <span>P99: {{ resourceText(kind, detail[kind]!.usage.p99) }}</span>
                <span>{{ t('page.forecast.cost.max') }}: {{ resourceText(kind, detail[kind]!.usage.max) }}</span>
                <span>{{ t('page.forecast.cost.points', { n: detail[kind]!.usage.points }) }}</span>
              </div>
              <NDataTable
                v-if="detail[kind]!.candidates.length"
                size="small"
                :columns="candidateColumns(kind)"
                :data="detail[kind]!.candidates"
                :bordered="false"
                :pagination="false"
              />
              <div v-else class="text-13px opacity-70">{{ noteText('note', detail[kind]!.candidate_note) }}</div>
            </template>
          </section>
        </template>
        <div class="text-12px opacity-60">
          {{ t('page.forecast.cost.candidateHelp', { margin: modules?.margin_percent ?? 10 }) }}
        </div>
      </div>
    </NModal>

    <!-- the simulation -->
    <NModal v-model:show="showSim" preset="card" :title="t('page.forecast.cost.simulate')" class="w-900px max-w-[95vw]">
      <NSpin :show="simulating">
        <NEmpty v-if="!sim" :description="t('page.forecast.cost.simulating')" class="py-32px" />
        <div v-else class="flex-col gap-12px">
          <NAlert type="warning" :show-icon="false">{{ t('page.forecast.cost.simCaveat') }}</NAlert>
          <NDataTable size="small" :columns="simColumns" :data="simRows" :bordered="false" :pagination="false" />
          <section v-if="sim.changes.length">
            <div class="mb-4px text-13px font-medium">{{ t('page.forecast.cost.simChanges') }}</div>
            <div v-for="c in sim.changes" :key="c.module_id" class="text-13px leading-22px">
              {{ c.namespace }} / {{ c.kind }} / {{ c.workload }}:
              <span v-if="c.cpu_milli">CPU → {{ formatCpuMilli(c.cpu_milli, t('page.forecast.cost.coreWord')) }}</span>
              <span v-if="c.memory_bytes">
                · {{ t('page.forecast.cost.memory') }} → {{ formatBytes(c.memory_bytes, 2) }}
              </span>
            </div>
          </section>
          <div v-else class="text-13px opacity-70">{{ t('page.forecast.cost.simNoChanges') }}</div>
          <section v-if="sim.with.blocked.length">
            <div class="mb-4px text-13px font-medium">{{ t('page.forecast.cost.simBlocked') }}</div>
            <div v-for="b in sim.with.blocked" :key="b.node" class="text-13px leading-22px">
              {{ b.node }}: {{ t(`page.forecast.cost.blocked_${b.reason}`) }}
              <span v-if="b.pod">({{ b.pod }})</span>
            </div>
          </section>
          <section>
            <div class="mb-4px text-13px font-medium">{{ t('page.forecast.cost.simUnmodeled') }}</div>
            <div class="flex flex-wrap gap-6px">
              <NTag v-for="u in sim.with.unmodeled" :key="u" size="small" :bordered="false">
                {{ t(`page.forecast.cost.unmodeled_${u}`) }}
              </NTag>
            </div>
          </section>
        </div>
      </NSpin>
    </NModal>

    <!-- the price rules: the list and the form, stacked -->
    <NModal
      v-model:show="showPrices"
      preset="card"
      :title="t('page.forecast.cost.prices')"
      class="w-900px max-w-[95vw]"
    >
      <div class="flex-col gap-12px">
        <div class="text-12px opacity-70">{{ t('page.forecast.cost.pricesHelp') }}</div>
        <NDataTable
          size="small"
          :columns="ruleColumns"
          :data="rules"
          :bordered="false"
          :pagination="false"
          :scroll-x="700"
        />
        <section class="cost-section">
          <div class="mb-6px text-13px font-medium">{{ form.id ? t('common.edit') : t('common.add') }}</div>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-12px gap-y-8px">
            <div>
              <div class="text-12px opacity-70">{{ t('page.forecast.cost.ruleName') }}</div>
              <NInput v-model:value="form.name" />
            </div>
            <div>
              <div class="text-12px opacity-70">{{ t('page.forecast.cost.ruleMatch') }}</div>
              <NSelect v-model:value="form.match_kind" :options="matchOptions" />
            </div>
            <div v-if="form.match_kind === 'label'">
              <div class="text-12px opacity-70">{{ t('page.forecast.cost.labelKey') }}</div>
              <NInput v-model:value="form.label_key" placeholder="node.kubernetes.io/instance-type" />
            </div>
            <div v-if="form.match_kind === 'label'">
              <div class="text-12px opacity-70">{{ t('page.forecast.cost.labelValue') }}</div>
              <NInput v-model:value="form.label_value" placeholder="m5.xlarge" />
            </div>
            <div v-if="form.match_kind === 'name'">
              <div class="text-12px opacity-70">{{ t('page.forecast.cost.namePattern') }}</div>
              <NInput v-model:value="form.name_pattern" placeholder="gpu-*" />
            </div>
            <div>
              <div class="text-12px opacity-70">{{ t('page.forecast.cost.ruleHourly') }}</div>
              <NInputNumber v-model:value="form.hourly_price" :min="0" :show-button="false" class="w-full" />
            </div>
            <div>
              <div class="text-12px opacity-70">{{ t('page.forecast.cost.currency') }}</div>
              <NInput v-model:value="form.currency" placeholder="USD" />
            </div>
            <div>
              <HelpLabel
                :label="t('page.forecast.cost.rulePriority')"
                :help="t('page.forecast.cost.priorityHelp')"
                class="text-12px opacity-70"
              />
              <NInputNumber v-model:value="form.priority" :min="0" :max="1000" :show-button="false" class="w-full" />
            </div>
            <div>
              <div class="text-12px opacity-70">{{ t('page.forecast.cost.ruleEnabled') }}</div>
              <NSwitch v-model:value="form.enabled" />
            </div>
          </div>
          <div class="mt-10px flex justify-end gap-8px">
            <NButton v-if="form.id" @click="form = blank()">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" :loading="saving" @click="saveRule">{{ t('common.confirm') }}</NButton>
          </div>
        </section>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.cost-card :deep(.n-card__content) {
  overflow: auto;
}
.cost-section {
  border-top: 1px solid var(--n-border-color, rgba(128, 128, 128, 0.2));
  padding-top: 12px;
}
</style>
