<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  NAlert,
  NButton,
  NFormItemGi,
  NGrid,
  NInputNumber,
  NModal,
  NProgress,
  NSelect,
  NSpin,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import AlgorithmParamsEditor from '@/components/advanced/algorithm-params-editor.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { useBackgroundTask } from '@/hooks/business/use-background-task';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { fetchGetAlgorithms } from '@/service/api';
import { submitModulePreview } from '@/service/api/async-step';
import { axisTimeLabel, axisTooltip, formatDateTime } from '@/utils/date';
import { formatDecimal, formatPercent } from '@/utils/format';

defineOptions({ name: 'ChangePreviewModal' });

/**
 * What would scaling have done if a setting were different: the recent past replayed with the saved setting and with the change, side
 * by side. It reads stored history and saves nothing. One view: the change on top, the result under it.
 */
const props = defineProps<{ show: boolean; moduleId: number | null; algorithm?: string }>();
const emit = defineEmits<{ 'update:show': [value: boolean] }>();
const { t, te } = useI18n();
const message = useMessage();
// the replay runs as a background task of the platform: it is not held to the gateway timeout, and closing this window does not lose it
const preview = useBackgroundTask<Api.Forecast.PreviewReport>({
  storageKey: () => (props.moduleId ? `preview:${props.moduleId}` : null)
});

const HOURS = [6, 24, 72, 168];
const hourOptions = computed(() =>
  HOURS.map(value => ({ label: t('page.forecast.preview.windowHours', { hours: value }), value }))
);

interface Form {
  hours: number;
  algorithm: string | null;
  params: Record<string, unknown>;
  headroom: number | null;
  capacity: number | null;
  minReplicas: number | null;
  maxReplicas: number | null;
  shortRecent: number | null;
  shortTrigger: number | null;
  shortFade: number | null;
  shortDown: number | null;
}
const blank = (): Form => ({
  hours: 24,
  algorithm: null,
  params: {},
  headroom: null,
  capacity: null,
  minReplicas: null,
  maxReplicas: null,
  shortRecent: null,
  shortTrigger: null,
  shortFade: null,
  shortDown: null
});
const form = reactive<Form>(blank());

const algorithms = ref<Api.Forecast.Algorithm[]>([]);
const algorithmOptions = computed(() => algorithms.value.map(item => ({ label: item.id, value: item.id })));
/** the algorithm the parameters below belong to: the one picked, else the one in use */
const target = computed(() => algorithms.value.find(item => item.id === (form.algorithm ?? props.algorithm)));
/** the values of the target in force, which the editor starts from so that changing one parameter keeps the others */
let baseline: Record<string, unknown> = {};
watch(target, value => {
  baseline = { ...value?.values };
  form.params = { ...baseline };
});

const running = computed(() => preview.state.active);
const failure = computed(() => preview.state.error);
const report = ref<Api.Forecast.PreviewReport | null>(null);

watch(
  () => preview.state.result,
  async value => {
    if (!value) return;
    report.value = value;
    await nextTick();
    draw();
  }
);

/** the stage the task reports ("preview: saved setting") in the language of the page */
function stageLabel(stage: string) {
  const name = stage.replace(/^preview: /, '').replace(/ /g, '_');
  const key = `page.forecast.preview.stage_${name}`;
  return te(key) ? t(key) : stage;
}

const task = computed(() => preview.state.task);
/** the task waits for another attempt: a failure that can be tried again put it back */
const waitingToRetry = computed(() => task.value?.status === 'queued' && (task.value?.attempts ?? 0) > 0);
const canRetry = computed(
  () => !running.value && (task.value?.status === 'failed' || task.value?.status === 'cancelled')
);

function backToTheTask() {
  report.value = null;
  return preview.retry();
}

const paramsChanged = computed(() => JSON.stringify(form.params) !== JSON.stringify(baseline));
function payload(): Api.Forecast.PreviewChange & { since_hours: number } {
  const body: Api.Forecast.PreviewChange & { since_hours: number } = { since_hours: form.hours };
  if (form.algorithm) body.algorithm = form.algorithm;
  if (paramsChanged.value) body.params = form.params;
  if (form.headroom !== null) body.headroom_ratio = form.headroom;
  if (form.capacity !== null) body.pod_capacity_rps = form.capacity;
  if (form.minReplicas !== null) body.min_replicas = form.minReplicas;
  if (form.maxReplicas !== null) body.max_replicas = form.maxReplicas;
  if (form.shortRecent !== null) body.short_term_recent_minutes = form.shortRecent;
  if (form.shortTrigger !== null) body.short_term_trigger = form.shortTrigger;
  if (form.shortFade !== null) body.short_term_fade_minutes = form.shortFade;
  if (form.shortDown !== null) body.short_term_down_share = form.shortDown;
  return body;
}

async function run() {
  if (props.moduleId === null) return;
  const body = payload();
  if (Object.keys(body).length === 1) {
    message.warning(t('page.forecast.preview.nothing'));
    return;
  }
  report.value = null;
  const moduleId = props.moduleId;
  await preview.start(() => submitModulePreview(moduleId, body) as never);
}

function reset() {
  Object.assign(form, blank());
  form.params = { ...baseline };
  report.value = null;
  preview.reset();
}

watch(
  () => props.show,
  async value => {
    if (!value) return;
    report.value = null;
    // a replay that was running when this window was closed is followed on
    void preview.resume();
    if (!algorithms.value.length) {
      const { data } = await fetchGetAlgorithms({ page: 1, page_size: 200 });
      algorithms.value = data?.list || [];
    }
  }
);

const usesModelService = computed(() =>
  [report.value?.current.algorithm, report.value?.proposed.algorithm].includes('model_service')
);

// ---- the figures of both settings
interface Row {
  key: string;
  label: string;
  help?: string;
  current: string;
  proposed: string;
}
const rows = computed<Row[]>(() => {
  const r = report.value;
  if (!r) return [];
  const n = (value: number) => formatDecimal(value, 2);
  const pair = (key: string, pick: (side: Api.Forecast.PreviewSide) => string, help = true): Row => ({
    key,
    label: t(`page.forecast.preview.${key}`),
    help: help ? t(`page.forecast.preview.${key}Help`) : undefined,
    current: pick(r.current),
    proposed: pick(r.proposed)
  });
  return [
    {
      key: 'algorithm',
      label: t('page.forecast.preview.algorithm'),
      current: r.current.algorithm,
      proposed: r.proposed.algorithm
    },
    pair('under', side => String(side.under), false),
    pair('over', side => String(side.over), false),
    pair('underReplicas', side => n(side.under_replicas), false),
    pair('overReplicas', side => n(side.over_replicas), false),
    pair('riskError', side => formatPercent(side.risk_error, 1)),
    pair('replicaHours', side => n(side.replica_hours)),
    pair('changes', side => String(side.changes))
  ];
});

// ---- the replicas each setting asked for in every window
const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      tooltip: { trigger: 'axis', formatter: axisTooltip() },
      legend: { top: 0 },
      grid: { left: 48, right: 24, top: 36, bottom: 48 },
      xAxis: { type: 'time', axisLabel: { formatter: axisTimeLabel } },
      yAxis: { type: 'value', minInterval: 1 },
      dataZoom: [{ type: 'inside' }],
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const r = report.value;
  if (!r) return;
  const line = (name: string, pick: (p: Api.Forecast.PreviewPoint) => number, extra: object) => ({
    name,
    type: 'line',
    step: 'start',
    showSymbol: false,
    data: r.points.map(p => [new Date(p.at).getTime(), pick(p)]),
    ...extra
  });
  await updateOptions(opts => ({
    ...opts,
    series: [
      // the need sits behind the two settings as a faint filled step
      line(t('page.forecast.preview.seriesNeed'), p => p.need, {
        lineStyle: { width: 1, opacity: 0.5 },
        areaStyle: { opacity: 0.12 },
        z: 1
      }),
      line(t('page.forecast.preview.seriesCurrent'), p => p.current, { lineStyle: { width: 2 }, z: 2 }),
      line(t('page.forecast.preview.seriesProposed'), p => p.proposed, {
        lineStyle: { width: 2, type: 'dashed' },
        z: 3
      })
    ] as never
  }));
}
watch(() => t('page.forecast.preview.seriesNeed'), draw);
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('page.forecast.preview.title')"
    class="w-1000px max-w-95vw"
    @update:show="value => emit('update:show', value)"
  >
    <div class="mb-12px text-13px leading-22px opacity-80">{{ t('page.forecast.preview.intro') }}</div>

    <NGrid :cols="24" :x-gap="16" :y-gap="8">
      <NFormItemGi :span="6" label-placement="top">
        <template #label>
          <HelpLabel :label="t('page.forecast.preview.window')" :help="t('page.forecast.preview.windowHelp')" />
        </template>
        <NSelect v-model:value="form.hours" :options="hourOptions" />
      </NFormItemGi>
      <NFormItemGi :span="6" label-placement="top">
        <template #label>
          <HelpLabel :label="t('page.forecast.preview.algorithm')" :help="t('page.forecast.preview.algorithmHelp')" />
        </template>
        <NSelect
          v-model:value="form.algorithm"
          clearable
          filterable
          :options="algorithmOptions"
          :placeholder="`${t('page.forecast.preview.algorithmInUse')}${algorithm ? `: ${algorithm}` : ''}`"
        />
      </NFormItemGi>
      <NFormItemGi :span="3" label-placement="top">
        <template #label>
          <HelpLabel :label="t('page.forecast.preview.headroom')" :help="t('page.forecast.preview.headroomHelp')" />
        </template>
        <NInputNumber v-model:value="form.headroom" clearable :min="1" :max="10" :step="0.1" class="w-full" />
      </NFormItemGi>
      <NFormItemGi :span="3" label-placement="top">
        <template #label>
          <HelpLabel :label="t('page.forecast.preview.capacity')" :help="t('page.forecast.preview.capacityHelp')" />
        </template>
        <NInputNumber v-model:value="form.capacity" clearable :min="0" class="w-full" />
      </NFormItemGi>
      <NFormItemGi :span="3" label-placement="top">
        <template #label>
          <HelpLabel
            :label="t('page.forecast.preview.minReplicas')"
            :help="t('page.forecast.preview.minReplicasHelp')"
          />
        </template>
        <NInputNumber v-model:value="form.minReplicas" clearable :min="0" :precision="0" class="w-full" />
      </NFormItemGi>
      <NFormItemGi :span="3" label-placement="top">
        <template #label>
          <HelpLabel
            :label="t('page.forecast.preview.maxReplicas')"
            :help="t('page.forecast.preview.maxReplicasHelp')"
          />
        </template>
        <NInputNumber v-model:value="form.maxReplicas" clearable :min="0" :precision="0" class="w-full" />
      </NFormItemGi>
      <NFormItemGi :span="6" label-placement="top">
        <template #label>
          <HelpLabel
            :label="t('page.forecast.preview.shortRecent')"
            :help="t('page.forecast.preview.shortRecentHelp')"
          />
        </template>
        <NInputNumber v-model:value="form.shortRecent" clearable :min="0" class="w-full" />
      </NFormItemGi>
      <NFormItemGi :span="6" label-placement="top">
        <template #label>
          <HelpLabel
            :label="t('page.forecast.preview.shortTrigger')"
            :help="t('page.forecast.preview.shortTriggerHelp')"
          />
        </template>
        <NInputNumber v-model:value="form.shortTrigger" clearable :min="0" :step="0.05" class="w-full" />
      </NFormItemGi>
      <NFormItemGi :span="6" label-placement="top">
        <template #label>
          <HelpLabel :label="t('page.forecast.preview.shortFade')" :help="t('page.forecast.preview.shortFadeHelp')" />
        </template>
        <NInputNumber v-model:value="form.shortFade" clearable :min="0" class="w-full" />
      </NFormItemGi>
      <NFormItemGi :span="6" label-placement="top">
        <template #label>
          <HelpLabel :label="t('page.forecast.preview.shortDown')" :help="t('page.forecast.preview.shortDownHelp')" />
        </template>
        <NInputNumber v-model:value="form.shortDown" clearable :min="0" :max="1" :step="0.05" class="w-full" />
      </NFormItemGi>
    </NGrid>

    <div v-if="target && target.params.length" class="mb-8px">
      <div class="mb-4px text-13px font-medium">{{ t('page.forecast.preview.params') }}: {{ target.id }}</div>
      <AlgorithmParamsEditor v-model="form.params" :specs="target.params" />
    </div>

    <div class="mb-12px flex items-center gap-8px">
      <NButton type="primary" size="small" :loading="running" @click="run">
        {{ running ? t('page.forecast.preview.running') : t('page.forecast.preview.run') }}
      </NButton>
      <NButton size="small" :disabled="running" @click="reset">{{ t('page.forecast.preview.reset') }}</NButton>
      <template v-if="running">
        <NButton
          size="small"
          type="warning"
          secondary
          :disabled="task?.status === 'cancelling'"
          @click="preview.cancel"
        >
          {{ task?.status === 'cancelling' ? t('page.forecast.preview.cancelling') : t('common.cancel') }}
        </NButton>
      </template>
      <NButton v-if="canRetry" size="small" secondary @click="backToTheTask">
        {{ t('page.forecast.preview.retry') }}
      </NButton>
    </div>

    <div v-if="running && task" class="mb-12px">
      <NProgress
        type="line"
        :percentage="Math.max(task.progress, 3)"
        :show-indicator="false"
        :processing="task.status === 'running'"
        :height="8"
      />
      <div class="mt-4px flex flex-wrap items-center gap-8px text-12px opacity-75">
        <span v-if="waitingToRetry">
          {{ t('page.forecast.preview.waitingRetry', { n: task.attempts, max: task.max_attempts }) }}
          <template v-if="task.error">: {{ task.error }}</template>
        </span>
        <span v-else-if="task.status === 'queued'">{{ t('page.forecast.preview.queued') }}</span>
        <span v-else>{{ stageLabel(task.stage) || t('page.forecast.preview.running') }}</span>
        <NTag v-if="task.attempts > 1 && !waitingToRetry" size="tiny" :bordered="false" type="warning">
          {{ t('page.forecast.preview.attempt', { n: task.attempts, max: task.max_attempts }) }}
        </NTag>
        <span>{{ t('page.forecast.preview.keepsRunning') }}</span>
      </div>
    </div>

    <NAlert v-if="failure" type="error" :title="t('page.forecast.preview.failed')" class="mb-12px">
      {{ failure }}
      <div v-if="task?.trace_id" class="mt-4px text-12px opacity-70">
        {{ t('page.forecast.preview.trace') }}: {{ task.trace_id }}
      </div>
    </NAlert>
    <NAlert v-else-if="report && task?.from_cache" type="info" :show-icon="false" class="mb-12px">
      {{ t('page.forecast.preview.fromCache') }}
    </NAlert>

    <NSpin :show="running">
      <div v-if="report" class="flex-col gap-12px">
        <div class="text-13px font-medium">
          {{ t('page.forecast.preview.result') }}
          <span class="ml-8px text-12px font-normal opacity-65">
            {{ formatDateTime(report.since) }} - {{ formatDateTime(report.until) }} ·
            {{ t('page.forecast.preview.windows') }}:
            {{ t('page.forecast.preview.windowsValue', { n: report.windows, m: report.window_minutes }) }} ·
            {{ t('page.forecast.preview.elapsed', { ms: report.elapsed_ms }) }}
          </span>
        </div>

        <table class="preview-figures w-full text-13px">
          <thead>
            <tr>
              <th class="text-left font-normal opacity-65"></th>
              <th class="text-right font-medium">{{ t('page.forecast.preview.current') }}</th>
              <th class="text-right font-medium">{{ t('page.forecast.preview.proposed') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.key">
              <td class="py-3px">
                <HelpLabel v-if="row.help" :label="row.label" :help="row.help" />
                <span v-else>{{ row.label }}</span>
              </td>
              <td class="text-right">{{ row.current }}</td>
              <td class="text-right">{{ row.proposed }}</td>
            </tr>
          </tbody>
        </table>

        <div>
          <div class="mb-4px text-13px font-medium">{{ t('page.forecast.preview.chart') }}</div>
          <div ref="domRef" class="h-260px w-full"></div>
        </div>

        <div>
          <div class="mb-4px text-13px font-medium">{{ t('page.forecast.preview.largest') }}</div>
          <div v-if="!report.largest.length" class="text-12px opacity-65">
            {{ t('page.forecast.preview.noDifference') }}
          </div>
          <div v-for="p in report.largest" :key="p.at" class="text-12px leading-20px">
            {{
              t('page.forecast.preview.largestRow', {
                at: formatDateTime(p.at),
                current: p.current,
                proposed: p.proposed,
                need: p.need
              })
            }}
          </div>
        </div>

        <ul class="m-0 pl-18px text-12px leading-20px opacity-65">
          <li>{{ t('page.forecast.preview.noteNeed') }}</li>
          <li>{{ t('page.forecast.preview.noteDecision') }}</li>
          <li v-if="usesModelService">{{ t('page.forecast.preview.noteModelService') }}</li>
          <li v-if="report.skipped">
            {{ t('page.forecast.preview.noteSkipped', { n: report.skipped, total: report.windows + report.skipped }) }}
          </li>
        </ul>
      </div>
    </NSpin>
  </NModal>
</template>
