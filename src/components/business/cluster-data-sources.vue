<script setup lang="ts">
import { computed } from 'vue';
import { NCollapse, NCollapseItem, NTable, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';

defineOptions({ name: 'ClusterDataSources' });

/**
 * Why the cluster dashboard asks for cluster metrics when the operator already reports: what the operator reports (the state and the configuration of the cluster, stored) and what it does
 * not (the use, and the Pods that are not a module's); which of the sixteen cluster metrics each of the two can give; and so which of them are declared twice. The list is the
 * one the platform works from (model.ScopedKinds), and the operator's side is what the report carries (package inventory: the nodes with their readiness and allocatable
 * resources; the Pods, Requests and Limits it counts are those of the modules only).
 */
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

/** the metrics only Prometheus has: the use of everything that runs, and the Requests and the Pods of every workload (the operator counts the Pods of the modules only) */
const ONLY_PROMETHEUS = [
  { kind: 'cluster_cpu_used', why: 'why_used' },
  { kind: 'cluster_memory_used', why: 'why_used' },
  { kind: 'node_cpu_used', why: 'why_used' },
  { kind: 'node_memory_used', why: 'why_used' },
  { kind: 'cluster_cpu_requests', why: 'why_requests' },
  { kind: 'cluster_memory_requests', why: 'why_requests' },
  { kind: 'node_cpu_requests', why: 'why_requests' },
  { kind: 'node_memory_requests', why: 'why_requests' },
  { kind: 'cluster_pods', why: 'why_pods' }
];
/** the metrics the operator reports as well: the nodes, whether they are ready, and what they can give to Pods */
const ALSO_REPORTED = [
  { kind: 'cluster_nodes', why: 'why_nodes' },
  { kind: 'cluster_nodes_ready', why: 'why_ready' },
  { kind: 'cluster_cpu_allocatable', why: 'why_allocatable' },
  { kind: 'cluster_memory_allocatable', why: 'why_allocatable' },
  { kind: 'node_cpu_allocatable', why: 'why_allocatable' },
  { kind: 'node_memory_allocatable', why: 'why_allocatable' },
  { kind: 'node_ready', why: 'why_ready' }
];

const kindName = (kind: string) => t(`page.datasource.mappings.metric_${kind}`);
const groups = computed(() => [
  {
    key: 'only',
    title: p('srcOnlyTitle', { n: ONLY_PROMETHEUS.length }),
    tag: p('srcMustDeclare'),
    type: 'success' as const,
    rows: ONLY_PROMETHEUS
  },
  {
    key: 'both',
    title: p('srcBothTitle', { n: ALSO_REPORTED.length }),
    tag: p('srcDuplicated'),
    type: 'warning' as const,
    rows: ALSO_REPORTED
  }
]);
</script>

<template>
  <NCollapse arrow-placement="right">
    <NCollapseItem :title="p('srcTitle')" name="sources">
      <div class="flex-col gap-8px text-12px leading-20px">
        <div>{{ p('srcOperatorGives') }}</div>
        <div>{{ p('srcOperatorNot') }}</div>
        <div>{{ p('srcWhyDeclared') }}</div>
        <div v-for="group in groups" :key="group.key" class="flex-col gap-4px">
          <div class="flex items-center gap-6px font-medium">
            {{ group.title }}
            <NTag size="tiny" :bordered="false" :type="group.type">{{ group.tag }}</NTag>
          </div>
          <NTable size="small" :bordered="true" :single-line="false" class="text-12px">
            <thead>
              <tr>
                <th class="w-260px">{{ p('srcColMetric') }}</th>
                <th>{{ p('srcColWhy') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in group.rows" :key="row.kind">
                <td>{{ kindName(row.kind) }}</td>
                <td>{{ p(`src_${row.why}`) }}</td>
              </tr>
            </tbody>
          </NTable>
        </div>
        <div class="opacity-80">
          {{ p('srcCheck', { n: ALSO_REPORTED.length, total: ALSO_REPORTED.length + ONLY_PROMETHEUS.length }) }}
        </div>
      </div>
    </NCollapseItem>
  </NCollapse>
</template>
