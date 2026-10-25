<script setup lang="ts">
import { computed } from 'vue';
import { NDataTable, NEmpty, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';

defineOptions({ name: 'ReplicaExplain' });

interface Props {
  /** Recommendation detail JSON (forecastsvc.RecommendDetail); only its replica section is shown. */
  detail: string | Record<string, any> | null | undefined;
}

const props = defineProps<Props>();
const { t } = useI18n();

const replica = computed<Api.Forecast.ReplicaDetail | null>(() => {
  try {
    const parsed = typeof props.detail === 'string' ? JSON.parse(props.detail) : props.detail;
    return parsed?.replica ?? null;
  } catch {
    return null;
  }
});

const columns = computed(() => [
  { title: t('page.forecast.replica.algorithm'), key: 'algorithm', width: 150 },
  { title: t('page.forecast.replica.replicas'), key: 'replicas', width: 90 },
  {
    title: t('page.forecast.replica.binding'),
    key: 'binding',
    width: 130,
    render: (row: Api.Forecast.ReplicaPlan) => t(`page.forecast.replica.constraint_${row.binding}`)
  },
  {
    title: t('page.forecast.replica.constraints'),
    key: 'constraints',
    render: (row: Api.Forecast.ReplicaPlan) =>
      row.constraints
        .map(
          c =>
            `${t(`page.forecast.replica.constraint_${c.name}`)} ${c.needed} (${t(`page.forecast.replica.u_${c.uncertainty_source}`)}, u=${c.uncertainty.toFixed(3)}${c.borrowed ? `, ${t('page.forecast.replica.borrowed', { algorithm: c.algorithm })}` : ''})`
        )
        .join(' / ')
  }
]);
</script>

<template>
  <div v-if="replica" class="replica-explain">
    <div class="mb-8px flex flex-wrap items-center gap-8px text-13px">
      <NTag size="small" :bordered="false" type="info">
        {{ t('page.forecast.replica.capacity') }}:
        {{ t(`page.forecast.replica.capacity_${replica.capacity.source}`) }}
        <template v-if="replica.capacity.rps_per_pod">({{ replica.capacity.rps_per_pod.toFixed(1) }} rps)</template>
      </NTag>
      <NTag v-if="replica.selected" size="small" :bordered="false" type="success">
        {{ t('page.forecast.replica.selected', { algorithm: replica.selected }) }}
      </NTag>
      <NTag v-if="replica.current_replicas" size="small" :bordered="false">
        {{ t('page.forecast.replica.current', { count: replica.current_replicas }) }}
      </NTag>
    </div>
    <NDataTable
      v-if="replica.plans.length"
      size="small"
      :columns="columns"
      :data="replica.plans"
      :row-key="(row: Api.Forecast.ReplicaPlan) => row.algorithm"
      :scroll-x="720"
    />
    <NEmpty v-else size="small" :description="t('page.forecast.replica.noPlan')" />
    <div v-if="replica.capacity.note" class="mt-8px text-12px opacity-70">{{ replica.capacity.note }}</div>
    <ul v-if="replica.notes?.length" class="mt-4px text-12px opacity-70">
      <li v-for="note in replica.notes" :key="note">{{ note }}</li>
    </ul>
    <ul v-if="replica.plans.some(p => p.skipped?.length)" class="mt-4px text-12px opacity-70">
      <template v-for="plan in replica.plans" :key="plan.algorithm">
        <li v-for="s in plan.skipped" :key="plan.algorithm + s">{{ plan.algorithm }}: {{ s }}</li>
      </template>
    </ul>
  </div>
</template>
