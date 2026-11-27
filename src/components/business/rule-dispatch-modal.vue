<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NAlert, NButton, NModal, NPopconfirm, NSpace, NSpin, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchGetModuleDispatch, fetchRunRuleDecision, fetchUpdateForecastModule } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatDecimal } from '@/utils/format';
import { stateStep, stateType } from '@/utils/rule-state';

defineOptions({ name: 'RuleDispatchModal' });

/**
 * The dispatch detail of one module: which source decides (the forecasts of the algorithms or the fixed formula of the resource analysis), what each of them says (replicas now, replicas
 * recommended and the difference; the Pod spec now and recommended), what the mode of the module lets the decision do, whether the newest recommendation took it, and what the operator
 * did. One page, in the order a decision goes: source, the two sources, the way to the cluster.
 */
interface Props {
  show: boolean;
  moduleId: number;
}
const props = defineProps<Props>();
const emit = defineEmits<{ 'update:show': [value: boolean]; changed: [] }>();
const { t } = useI18n();
const r = (key: string, named?: Record<string, unknown>) => t(`page.rule.${key}`, named ?? {});
const message = useMessage();

const visible = computed({ get: () => props.show, set: value => emit('update:show', value) });
const loading = ref(false);
const running = ref(false);
const switching = ref(false);
const failure = ref('');
const detail = ref<Api.Rule.Dispatch | null>(null);

async function load() {
  loading.value = true;
  failure.value = '';
  try {
    const { data, error } = await fetchGetModuleDispatch(props.moduleId);
    detail.value = data ?? null;
    if (!data) failure.value = (error as { message?: string } | null)?.message || r('loadFailed');
  } finally {
    loading.value = false;
  }
}

/** the module follows the other source from now on; its mode, bounds and periods are not touched */
async function switchSource() {
  const d = detail.value;
  if (!d) return;
  const next: Api.Rule.DecisionSource = d.decision_source === 'rule' ? 'algorithm' : 'rule';
  switching.value = true;
  try {
    const { error } = await fetchUpdateForecastModule(d.module_id, {
      decision_source: next
    } as Api.Forecast.ModulePayload);
    if (error) return;
    message.success(r('switched', { source: r(`source_${next}`) }));
    await load();
    emit('changed');
  } finally {
    switching.value = false;
  }
}

async function calculate() {
  running.value = true;
  try {
    const { error } = await fetchRunRuleDecision(props.moduleId);
    if (error) return;
    await load();
    emit('changed');
  } finally {
    running.value = false;
  }
}

watch(
  () => props.show,
  shown => {
    if (shown && props.moduleId) {
      detail.value = null;
      void load();
    }
  },
  { immediate: true }
);

const rule = computed(() => detail.value?.rule ?? null);
const followed = computed(() => detail.value?.decision_source === 'rule');

/** the module follows the formula, the formula has replicas, and a source that ranks higher decided the replicas of the recommendation */
const outranked = computed(() => {
  const d = detail.value;
  return Boolean(
    d &&
    followed.value &&
    d.rule?.replicas_set &&
    d.effective?.replicas_set &&
    d.effective.rule_decision_id &&
    d.effective.replicas_source !== 'rule'
  );
});

const cores = (milli: number) => (milli > 0 ? formatCores(milli / 1000, 3) : '-');
const bytes = (value: number) => (value > 0 ? formatBytes(value, 3) : '-');
const count = (value: number | undefined) => (value && value > 0 ? formatDecimal(value, 0) : '-');
const delta = (value: number) => (value > 0 ? `+${value}` : String(value));

/** the steps a decision goes: the calculation, the recommendation that took it, the mode, the operator */
const steps = computed(() => {
  const d = detail.value;
  if (!d) return [];
  const reached = stateStep(d.state);
  return ['calculated', 'taken', 'mode', 'executed'].map((key, index) => ({
    key,
    done: followed.value && reached > index,
    label: r(`step_${key}`)
  }));
});
</script>

<template>
  <NModal v-model:show="visible" preset="card" :title="r('dispatchTitle')" class="w-980px max-w-95vw">
    <NSpin :show="loading">
      <div class="flex-col gap-12px">
        <NAlert v-if="failure" type="warning" :show-icon="false">{{ failure }}</NAlert>
        <template v-if="detail">
          <section class="sec">
            <div class="sec-title">{{ r('secSource') }}</div>
            <div class="kv">
              <span>{{ r('module') }}</span>
              <b>{{ detail.name }}</b>
              <span>{{ r('followsSource') }}</span>
              <span>
                <NTag size="small" :bordered="false" :type="followed ? 'info' : 'default'">
                  {{ r(`source_${detail.decision_source}`) }}
                </NTag>
              </span>
              <span>{{ r('mode') }}</span>
              <span>
                <NTag size="small" :bordered="false">{{ r(`mode_${detail.mode}`) }}</NTag>
              </span>
              <span>{{ r('state') }}</span>
              <span>
                <NTag size="small" :bordered="false" :type="stateType(detail.state)">
                  {{ r(`state_${detail.state}`) }}
                </NTag>
              </span>
            </div>
            <div class="note">{{ r(`modeEffect_${detail.mode}`) }}</div>
            <div class="note">{{ r(`stateNote_${detail.state}`) }}</div>
            <div v-if="detail.why" class="note warn">{{ detail.why }}</div>
          </section>

          <section class="sec">
            <div class="sec-title">{{ r('secCompare') }}</div>
            <table class="cmp">
              <thead>
                <tr>
                  <th></th>
                  <th>{{ r('now') }}</th>
                  <th>
                    {{ r('source_algorithm') }}
                    <span v-if="detail.algorithm?.algorithm" class="opacity-70">
                      ({{ detail.algorithm.algorithm }})
                    </span>
                  </th>
                  <th>{{ r('source_rule') }}</th>
                  <th>{{ r('difference') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{{ r('replicas') }}</td>
                  <td>{{ rule?.replicas_set ? count(rule.current_replicas) : '-' }}</td>
                  <td>{{ count(detail.algorithm?.replicas) }}</td>
                  <td class="strong">{{ rule?.replicas_set ? count(rule.recommended_replicas) : '-' }}</td>
                  <td>{{ rule?.replicas_set && rule.current_replicas ? delta(rule.replicas_delta) : '-' }}</td>
                </tr>
                <tr>
                  <td>{{ r('cpuRequest') }}</td>
                  <td>{{ rule?.cpu_set ? cores(rule.cpu_current_milli) : '-' }}</td>
                  <td>{{ cores(detail.algorithm?.cpu_milli ?? 0) }}</td>
                  <td class="strong">{{ rule?.cpu_set ? cores(rule.cpu_recommended_milli) : '-' }}</td>
                  <td>
                    {{
                      rule?.cpu_set && rule.cpu_current_milli
                        ? delta(rule.cpu_recommended_milli - rule.cpu_current_milli) + ' m'
                        : '-'
                    }}
                  </td>
                </tr>
                <tr>
                  <td>{{ r('memoryRequest') }}</td>
                  <td>{{ rule?.memory_set ? bytes(rule.memory_current_bytes) : '-' }}</td>
                  <td>{{ bytes(detail.algorithm?.memory_bytes ?? 0) }}</td>
                  <td class="strong">{{ rule?.memory_set ? bytes(rule.memory_recommended_bytes) : '-' }}</td>
                  <td>
                    {{
                      rule?.memory_set && rule.memory_current_bytes
                        ? (rule.memory_recommended_bytes >= rule.memory_current_bytes ? '+' : '-') +
                          bytes(Math.abs(rule.memory_recommended_bytes - rule.memory_current_bytes))
                        : '-'
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="rule" class="note">
              {{
                r('basis', {
                  period: rule.period || '-',
                  at: formatDateTime(rule.checked_at),
                  p90: formatCores(rule.cpu_p90, 3),
                  p95: formatCores(rule.cpu_p95, 3),
                  p99: formatCores(rule.cpu_p99, 3),
                  m90: formatBytes(rule.memory_p90, 2),
                  m95: formatBytes(rule.memory_p95, 2),
                  m99: formatBytes(rule.memory_p99, 2)
                })
              }}
            </div>
            <div v-if="rule && !rule.certain" class="note warn">
              {{ r('notCertain', { why: rule.caution || '-' }) }}
            </div>
            <div v-if="rule?.replicas_formula" class="note mono">{{ rule.replicas_formula }}</div>
            <div v-if="!rule" class="note">{{ r('noCalculation') }}</div>
          </section>

          <section class="sec">
            <div class="sec-title">{{ r('secPath') }}</div>
            <div class="steps">
              <span v-for="(step, index) in steps" :key="step.key" class="step" :class="{ done: step.done }">
                <i>{{ step.done ? '✓' : index + 1 }}</i>
                {{ step.label }}
              </span>
            </div>
            <div v-if="detail.effective" class="kv">
              <span>{{ r('recommendation') }}</span>
              <span>
                v{{ detail.effective.version }} · {{ formatDateTime(detail.effective.created_at) }}
                <NTag
                  v-if="detail.effective.rule_decision_id"
                  size="small"
                  :bordered="false"
                  type="info"
                  class="ml-6px"
                >
                  {{ r('tookRule', { id: detail.effective.rule_decision_id }) }}
                </NTag>
              </span>
              <span>{{ r('replicas') }}</span>
              <span>
                {{ detail.effective.replicas_set ? detail.effective.replicas : '-' }}
                <span class="opacity-70">({{ detail.effective.replicas_source || '-' }})</span>
              </span>
              <span>{{ r('cpuRequest') }}</span>
              <span>
                {{ cores(detail.effective.cpu_milli) }}
                <span class="opacity-70">({{ detail.effective.cpu_source || '-' }})</span>
              </span>
              <span>{{ r('memoryRequest') }}</span>
              <span>
                {{ bytes(detail.effective.memory_bytes) }}
                <span class="opacity-70">({{ detail.effective.memory_source || '-' }})</span>
              </span>
            </div>
            <div v-else class="note">{{ r('noRecommendation') }}</div>
            <div v-if="outranked" class="note warn">
              {{ r('replicasOutranked', { source: detail.effective?.replicas_source }) }}
            </div>

            <div class="sec-sub">{{ r('executions') }}</div>
            <table v-if="detail.executions.length" class="cmp">
              <thead>
                <tr>
                  <th>{{ r('time') }}</th>
                  <th>{{ r('action') }}</th>
                  <th>{{ r('fromTo') }}</th>
                  <th>{{ r('result') }}</th>
                  <th>{{ r('reason') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in detail.executions" :key="row.id">
                  <td>{{ formatDateTime(row.created_at) }}</td>
                  <td>{{ row.action }}</td>
                  <td>{{ row.current }} → {{ row.desired }}</td>
                  <td>{{ row.result }}</td>
                  <td>{{ row.reason || '-' }}</td>
                </tr>
              </tbody>
            </table>
            <div v-else class="note">{{ r('noExecutions') }}</div>
          </section>
        </template>
        <NSpace justify="end">
          <NPopconfirm v-if="detail" @positive-click="switchSource">
            <template #trigger>
              <NButton size="small" type="primary" secondary :loading="switching">
                {{ r(followed ? 'switchToAlgorithm' : 'switchToRule') }}
              </NButton>
            </template>
            {{ r(followed ? 'switchConfirmAlgorithm' : 'switchConfirmRule', { mode: r(`mode_${detail.mode}`) }) }}
          </NPopconfirm>
          <NButton size="small" :loading="running" @click="calculate">{{ r('calculate') }}</NButton>
          <NButton size="small" @click="visible = false">{{ t('common.close') }}</NButton>
        </NSpace>
      </div>
    </NSpin>
  </NModal>
</template>

<style scoped>
.sec {
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
}
.sec-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.sec-sub {
  font-weight: 600;
  margin: 10px 0 4px;
}
.kv {
  display: grid;
  grid-template-columns: max-content 1fr max-content 1fr;
  gap: 4px 14px;
  align-items: center;
  font-size: 13px;
}
.kv > span:nth-child(odd) {
  opacity: 0.7;
}
.note {
  margin-top: 6px;
  font-size: 12px;
  line-height: 20px;
  opacity: 0.8;
}
.note.warn {
  color: var(--warning-color, #f0a020);
  opacity: 1;
}
.note.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
.cmp {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.cmp th,
.cmp td {
  padding: 5px 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  text-align: left;
}
.cmp th {
  border-top: 0;
  opacity: 0.75;
  font-weight: 600;
}
.cmp .strong {
  font-weight: 600;
}
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-bottom: 8px;
}
.step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  opacity: 0.55;
  font-size: 13px;
}
.step.done {
  opacity: 1;
}
.step i {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-style: normal;
  font-size: 11px;
}
</style>
