<script setup lang="ts">
import { computed } from 'vue';
import { NModal, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import FormulaView from '@/components/common/formula-view.vue';
import { amountText } from '@/utils/amount';
import { formatBytes, formatCores, formatDecimal, formatPercent } from '@/utils/format';
import { type Level, directionLevel, replicaView } from '@/utils/overprovision-replicas';
import { replicaBasisLines } from '@/utils/replica-basis';

defineOptions({ name: 'ReplicaBasisModal' });

/**
 * The basis of a recommended replica count, in one window: the replicas now and the recommended ones, what each resource used (P90, P95, P99 of all the replicas), the
 * coefficients that were divided by and where they are set, the whole calculation one step to a line and the result, and for each safety bound of the module whether it
 * took effect. Nothing is a plain-text expression: the formulas are the typeset ones of the rest of the page.
 */
const props = defineProps<{ detail: Api.Overprovision.Detail | null }>();
const show = defineModel<boolean>('show', { required: true });
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const view = computed(() => replicaView(props.detail));
const plan = computed(() => (props.detail?.recommend ?? props.detail?.windows[0])?.replica_plan ?? null);
const params = computed(() => props.detail?.params);
const TAG: Record<Level, 'success' | 'warning' | 'error' | 'info'> = {
  ok: 'success',
  warn: 'warning',
  bad: 'error',
  info: 'info'
};

const words = computed(() => ({
  totalUse: p('basisTotalUse'),
  requests: 'Requests',
  limits: 'Limits',
  guard: p('basisGuard'),
  result: p('basisResult'),
  replicas: p('basisReplicas'),
  coefSource: p('basisCoefSource'),
  guardSource: p('basisGuardSource'),
  limitGuard: p('basisLimitGuard')
}));

const resources = computed(() =>
  (plan.value?.resources ?? []).map(need => {
    const resource = need.resource === 'memory' ? 'memory' : 'cpu';
    const fmt = (v: number) => (resource === 'memory' ? formatBytes(v, 2) : formatCores(v, 2));
    return {
      key: need.resource,
      name: resource === 'cpu' ? p('sectionCpu') : p('sectionMemory'),
      request: amountText(resource, need.request),
      limit: need.limit > 0 ? amountText(resource, need.limit) : '-',
      lines: params.value ? replicaBasisLines(need, params.value, words.value) : [],
      uses: need.parts.map(part => ({ name: part.name, text: fmt(part.total) })),
      needed: need.needed,
      binding: plan.value?.binding === need.resource
    };
  })
);

const coefficients = computed(() => {
  const pr = params.value;
  if (!pr) return [];
  return [
    { name: p('basisTarget', { p: 'P90' }), value: formatPercent(pr.p90.target, 0) },
    { name: p('basisTarget', { p: 'P95' }), value: formatPercent(pr.p95.target, 0) },
    { name: p('basisTarget', { p: 'P99' }), value: formatPercent(pr.p99.target, 0) },
    { name: p('basisGuardName'), value: formatPercent(pr.peak_near_limit, 0) }
  ];
});

/** each safety bound of the module: what it is set to, and whether it changed the recommended count */
const bounds = computed(() => {
  const limits = plan.value?.limits;
  const reasons = plan.value?.reasons ?? [];
  const row = (key: string, value: number, reason: string) => ({
    key,
    name: p(`bound_${key}`),
    value: value > 0 ? String(value) : p('boundNotSet'),
    effect: value > 0 ? (reasons.includes(reason) ? 'on' : 'off') : 'unset'
  });
  return [
    row('min', limits?.min ?? 0, 'replicas_floor'),
    row('max', limits?.max ?? 0, 'replicas_ceiling'),
    row('up', limits?.scale_up_step ?? 0, 'replicas_step'),
    row('down', limits?.scale_down_step ?? 0, 'replicas_step')
  ];
});
const protections = computed(() => {
  const reasons = plan.value?.reasons ?? [];
  return [
    { key: 'limited', on: reasons.includes('replicas_limited') },
    { key: 'limit', on: reasons.includes('replicas_limit') }
  ];
});
const effectType = { on: 'warning', off: 'default', unset: 'default' } as const;
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    :title="p('basisModalTitle')"
    class="replica-basis"
    :style="{ width: 'min(860px, 95vw)' }"
  >
    <div v-if="view && plan" class="basis-body">
      <div class="basis-summary">
        <div>
          <div class="basis-label">{{ p('basisCurrent') }}</div>
          <div class="basis-figure">{{ view.current || '-' }}</div>
          <div class="basis-sub">
            {{ view.from === 'kubernetes' ? p('basisFromK8s', { ready: view.ready }) : p('basisFromOther') }}
          </div>
        </div>
        <div class="basis-arrow">→</div>
        <div>
          <div class="basis-label">{{ p('basisRecommended') }}</div>
          <div class="basis-figure">{{ view.recommended || '-' }}</div>
          <NTag
            v-if="view.current > 0 && view.recommended > 0"
            size="small"
            :bordered="false"
            :type="TAG[directionLevel(view.direction)]"
          >
            {{
              view.delta === 0
                ? p('repSame')
                : view.delta > 0
                  ? p('repOut', { n: view.delta, share: formatPercent(view.share, 1) })
                  : p('repIn', { n: -view.delta, share: formatPercent(view.share, 1) })
            }}
          </NTag>
        </div>
      </div>

      <div v-for="item in resources" :key="item.key" class="basis-block">
        <div class="basis-title">
          {{ item.name }}
          <NTag v-if="item.binding" size="tiny" :bordered="false" type="info">{{ p('basisDecides') }}</NTag>
        </div>
        <div class="basis-sub">
          {{ p('basisPodSpec', { request: item.request, limit: item.limit }) }}
          · {{ item.uses.map(use => `${use.name} ${use.text}`).join(' · ') }}
        </div>
        <FormulaView :lines="item.lines" />
      </div>

      <div class="basis-block">
        <div class="basis-title">{{ p('basisCoefficients') }}</div>
        <div class="basis-chips">
          <span v-for="c in coefficients" :key="c.name" class="basis-chip">
            {{ c.name }}
            <b>{{ c.value }}</b>
          </span>
        </div>
        <div class="basis-sub">{{ p('basisCoefficientsWhere') }}</div>
      </div>

      <div class="basis-block">
        <div class="basis-title">{{ p('basisBounds') }}</div>
        <div class="basis-sub">
          {{ p('basisRaw', { raw: plan.raw, final: plan.needed }) }}
        </div>
        <div v-for="b in bounds" :key="b.key" class="basis-row">
          <span>{{ b.name }}</span>
          <b>{{ b.value }}</b>
          <NTag size="tiny" :bordered="false" :type="effectType[b.effect as 'on' | 'off' | 'unset']">
            {{ p(`boundEffect_${b.effect}`) }}
          </NTag>
        </div>
        <div v-for="item in protections" :key="item.key" class="basis-row">
          <span>{{ p(`protect_${item.key}`) }}</span>
          <span />
          <NTag size="tiny" :bordered="false" :type="item.on ? 'warning' : 'default'">
            {{ item.on ? p('boundEffect_on') : p('boundEffect_off') }}
          </NTag>
        </div>
        <div class="basis-sub">{{ p('basisFormulaNote', { n: formatDecimal(plan.raw, 0) }) }}</div>
      </div>
    </div>
    <div v-else class="text-13px opacity-70">{{ p('repNoPlan') }}</div>
  </NModal>
</template>

<style scoped>
.basis-body {
  display: grid;
  gap: 14px;
  max-height: 72vh;
  padding-right: 4px;
  overflow-y: auto;
}

.basis-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}

.basis-arrow {
  font-size: 22px;
  opacity: 0.5;
}

.basis-label,
.basis-sub {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.7;
}

.basis-figure {
  font-size: 26px;
  font-weight: 700;
  line-height: 32px;
}

.basis-block {
  display: grid;
  gap: 6px;
}

.basis-title {
  display: flex;
  gap: 6px;
  align-items: center;
  font-weight: 600;
}

.basis-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
}

.basis-chip {
  padding: 2px 8px;
  font-size: 12px;
  background: rgba(240, 160, 32, 0.12);
  border-radius: 4px;
}

.basis-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 80px auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
</style>
