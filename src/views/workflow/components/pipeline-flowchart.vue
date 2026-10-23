<script setup lang="ts">
import { computed, ref } from 'vue';
import { NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { guardRoleLabel, resolveTransitionLabel } from '@/utils/workflow';

const { t } = useI18n();

interface TransitionInfo {
  event: string;
  label: string;
  fromState: string;
  toState: string;
  guardRole?: string;
  comment?: string;
}

/**
 * Synthetic node key for the stage that raises the ticket. A pipeline's
 * initial_state is where a ticket LANDS ("待负责人审批"), not the act that
 * created it, so a chart starting there silently omitted the requester —
 * every other actor in the flow appeared on an edge, but the person who
 * started it did not. It is drawn from the instance's own "start" history
 * entry, and is not part of any pipeline definition.
 */
const ORIGIN_NODE_KEY = '__origin__';

interface NodePosition {
  key: string;
  name: string;
  isInitial: boolean;
  isOrigin: boolean;
  isTerminal: boolean;
  isReject: boolean;
  entryActionsCount: number;
  outputActionsCount: number;
  notifyTemplates: string[];
  outputActions: string[];
  x: number;
  y: number;
  level: number;
}

interface EdgePath {
  event: string;
  label: string;
  fromKey: string;
  toKey: string;
  guardRole?: string;
  d: string;
  labelX: number;
  labelY: number;
  isReject: boolean;
  /** Who actually executed this transition on this specific instance —
   * resolved from `history`, empty when this edge wasn't taken (or no
   * history was supplied, e.g. rendering a bare pipeline definition rather
   * than one instance's run of it). */
  operator?: string;
}

/** One HistoryEntry, matching pkg/workflow.HistoryEntry — passed in only
 * when rendering a specific instance's flowchart (see
 * views/workflow/instances/index.vue), so this component can stay usable
 * for a bare pipeline definition (no instance, no history) too. */
interface HistoryEntry {
  event: string;
  operator: string;
  from_state: string;
  to_state: string;
}

const props = defineProps<{
  pipelineJson: string;
  activeState?: string;
  history?: HistoryEntry[];
}>();

const emit = defineEmits<{
  (e: 'select-state', stateKey: string): void;
}>();

const selectedNodeKey = ref<string>('');

const parsedPipeline = computed(() => {
  if (!props.pipelineJson) return null;
  try {
    return JSON.parse(props.pipelineJson);
  } catch {
    return null;
  }
});

// Layout nodes topologically by BFS from initial_state
const diagramData = computed(() => {
  const pipeline = parsedPipeline.value;
  if (!pipeline || !pipeline.states) {
    return { nodes: [] as NodePosition[], edges: [] as EdgePath[], width: 600, height: 400 };
  }

  const states = pipeline.states as Record<string, any>;
  const initStateKey = pipeline.initial_state || Object.keys(states)[0] || '';

  // 1. Calculate levels (layers) via BFS
  const levels: Record<string, number> = {};
  const queue: string[] = [];
  if (initStateKey && states[initStateKey]) {
    levels[initStateKey] = 0;
    queue.push(initStateKey);
  }

  // Also collect all transitions
  const transitions: TransitionInfo[] = [];
  Object.entries(states).forEach(([fromKey, sDef]) => {
    if (sDef.transitions) {
      Object.entries(sDef.transitions).forEach(([event, tDef]: [string, any]) => {
        transitions.push({
          event,
          label: resolveTransitionLabel(sDef, event, tDef),
          fromState: fromKey,
          toState: tDef.target_state || '',
          guardRole: tDef.guard_role,
          comment: tDef.comment
        });
      });
    }
  });

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLevel = levels[curr];
    const sDef = states[curr];
    if (sDef && sDef.transitions) {
      Object.values(sDef.transitions).forEach((tDef: any) => {
        const target = tDef.target_state;
        if (target && levels[target] === undefined) {
          levels[target] = currLevel + 1;
          queue.push(target);
        }
      });
    }
  }

  // Place unreached states at level 1 or 2
  Object.keys(states).forEach(k => {
    if (levels[k] === undefined) {
      levels[k] = states[k]?.is_terminal ? 3 : 1;
    }
  });

  // Prepend the origin stage: every real state shifts one column right and
  // the synthetic node takes level 0, with an edge into initial_state
  // carrying whoever raised the ticket (from the "start" history entry).
  if (initStateKey) {
    Object.keys(levels).forEach(k => {
      levels[k] += 1;
    });
    levels[ORIGIN_NODE_KEY] = 0;
    transitions.unshift({
      event: 'start',
      label: t('page.telegram.workflows.flowchart.originEdge'),
      fromState: ORIGIN_NODE_KEY,
      toState: initStateKey
    });
  }

  // Group by level
  const levelGroups: Record<number, string[]> = {};
  Object.entries(levels).forEach(([k, lvl]) => {
    if (!levelGroups[lvl]) levelGroups[lvl] = [];
    levelGroups[lvl].push(k);
  });

  const NODE_WIDTH = 210;
  const NODE_HEIGHT = 100;
  const GAP_X = 140;
  const GAP_Y = 60;
  const PADDING_X = 60;
  const PADDING_Y = 50;

  const nodeMap: Record<string, NodePosition> = {};
  const nodes: NodePosition[] = [];

  const maxLevel = Math.max(0, ...Object.keys(levelGroups).map(Number));
  let maxColumnNodes = 1;

  Object.entries(levelGroups).forEach(([lvlStr, keys]) => {
    const lvl = Number(lvlStr);
    maxColumnNodes = Math.max(maxColumnNodes, keys.length);

    keys.forEach((key, index) => {
      const isOrigin = key === ORIGIN_NODE_KEY;
      const sDef = isOrigin ? {} : states[key] || {};
      const isInitial = key === initStateKey;
      const isTerminal = Boolean(sDef.is_terminal);
      const isReject = !isOrigin && (key.includes('reject') || key.includes('fail'));

      const x = PADDING_X + lvl * (NODE_WIDTH + GAP_X);
      const y = PADDING_Y + index * (NODE_HEIGHT + GAP_Y);

      const notifyTemplates: string[] = [];
      if (Array.isArray(sDef.entry_actions)) {
        sDef.entry_actions.forEach((act: any) => {
          if (act.template_key) notifyTemplates.push(act.template_key);
        });
      }

      const outputActions: string[] = [];
      if (Array.isArray(sDef.output_actions)) {
        sDef.output_actions.forEach((act: any) => {
          if (act.name) outputActions.push(act.name);
          else if (act.type) outputActions.push(act.type);
        });
      }

      const pos: NodePosition = {
        key,
        name: isOrigin ? t('page.telegram.workflows.flowchart.originNode') : sDef.name || key,
        isInitial,
        isOrigin,
        isTerminal,
        isReject,
        entryActionsCount: Array.isArray(sDef.entry_actions) ? sDef.entry_actions.length : 0,
        outputActionsCount: outputActions.length,
        notifyTemplates,
        outputActions,
        x,
        y,
        level: lvl
      };
      nodeMap[key] = pos;
      nodes.push(pos);
    });
  });

  // Calculate SVG dimensions
  const totalWidth = PADDING_X * 2 + (maxLevel + 1) * (NODE_WIDTH + GAP_X);
  const totalHeight = PADDING_Y * 2 + maxColumnNodes * (NODE_HEIGHT + GAP_Y);

  // Generate Bezier curves for edges
  const edges: EdgePath[] = [];
  transitions.forEach(tr => {
    const fromNode = nodeMap[tr.fromState];
    const toNode = nodeMap[tr.toState];
    if (!fromNode || !toNode) return;

    const startX = fromNode.x + NODE_WIDTH;
    const startY = fromNode.y + NODE_HEIGHT / 2;
    const endX = toNode.x;
    const endY = toNode.y + NODE_HEIGHT / 2;

    const isReject = tr.event.includes('reject') || tr.event.includes('fail') || toNode.isReject;

    // Curved control points
    const dx = Math.abs(endX - startX) * 0.5;
    const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
    const labelX = (startX + endX) / 2;
    const labelY = (startY + endY) / 2 - 12;

    // The history entry (if any) this specific instance recorded for this
    // exact edge — matched on event + from/to state, not event alone,
    // since two different states could in principle declare a
    // same-named event.
    // The origin edge has no real source state — the engine records the
    // ticket's creation with an empty from_state (see StartWorkflow).
    const expectedFrom = tr.fromState === ORIGIN_NODE_KEY ? '' : tr.fromState;
    const historyHit = (props.history ?? []).find(
      h => h.event === tr.event && h.from_state === expectedFrom && h.to_state === tr.toState
    );

    edges.push({
      event: tr.event,
      label: tr.label,
      fromKey: tr.fromState,
      toKey: tr.toState,
      guardRole: tr.guardRole,
      d: pathD,
      labelX,
      labelY,
      isReject,
      operator: historyHit?.operator
    });
  });

  return { nodes, edges, width: Math.max(totalWidth, 750), height: Math.max(totalHeight, 380) };
});

function handleNodeClick(key: string) {
  selectedNodeKey.value = key;
  emit('select-state', key);
}
</script>

<template>
  <div
    class="pipeline-diagram-container w-full overflow-x-auto rounded-12px bg-slate-50 dark:bg-[#0c121e] border border-gray-200 dark:border-gray-800/80 p-16px shadow-inner"
  >
    <div v-if="!parsedPipeline" class="py-40px text-center text-gray-400">
      {{ t('page.telegram.workflows.flowchart.noConfig') }}
    </div>

    <div v-else class="relative" :style="{ minWidth: `${diagramData.width}px`, minHeight: `${diagramData.height}px` }">
      <svg
        class="absolute inset-0 pointer-events-none w-full h-full"
        :viewBox="`0 0 ${diagramData.width} ${diagramData.height}`"
      >
        <defs>
          <!-- Arrow marker for normal transitions -->
          <marker
            id="arrow-primary"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3b82f6" />
          </marker>
          <!-- Arrow marker for reject/error transitions -->
          <marker
            id="arrow-error"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
          </marker>
          <!-- Gradient for node cards -->
          <linearGradient id="node-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9" />
            <stop offset="100%" stop-color="#f8fafc" stop-opacity="0.9" />
          </linearGradient>
        </defs>

        <!-- Edges (Transitions) -->
        <g v-for="(edge, idx) in diagramData.edges" :key="idx">
          <path
            :d="edge.d"
            fill="none"
            :stroke="edge.isReject ? '#ef4444' : '#3b82f6'"
            :stroke-dasharray="edge.isReject ? '4,3' : undefined"
            stroke-width="2"
            :marker-end="edge.isReject ? 'url(#arrow-error)' : 'url(#arrow-primary)'"
            class="transition-all duration-300"
          />
        </g>
      </svg>

      <!-- Transition Edge Labels -->
      <div
        v-for="(edge, idx) in diagramData.edges"
        :key="`label-${idx}`"
        class="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 select-none z-10"
        :style="{ left: `${edge.labelX}px`, top: `${edge.labelY}px` }"
      >
        <div class="flex-col items-center gap-2px">
          <div
            class="flex items-center gap-4px px-6px py-2px rounded-full text-11px font-medium shadow-xs border"
            :class="
              edge.isReject
                ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/70 dark:text-red-400 dark:border-red-900'
                : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/70 dark:text-blue-400 dark:border-blue-900'
            "
          >
            <span>{{ edge.label }}</span>
            <span v-if="edge.guardRole" class="px-3px py-0.5px text-9px rounded bg-white/70 dark:bg-black/40">
              {{ guardRoleLabel(edge.guardRole) }}
            </span>
          </div>
          <!--
 The actual person who executed this transition on this
               instance (from history) — not just the role that's allowed
               to, above.
-->
          <div
            v-if="edge.operator"
            class="px-6px py-1px rounded-full text-10px whitespace-nowrap bg-white/90 dark:bg-black/50 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-xs"
          >
            {{ t('page.telegram.workflows.flowchart.executedBy', { name: edge.operator }) }}
          </div>
        </div>
      </div>

      <!-- State Nodes -->
      <div
        v-for="node in diagramData.nodes"
        :key="node.key"
        class="absolute pointer-events-auto cursor-pointer rounded-12px p-12px border transition-all duration-200 select-none shadow-sm hover:shadow-md hover:-translate-y-2px"
        :class="[
          node.isOrigin
            ? 'bg-slate-100/80 dark:bg-slate-800/50 border-dashed border-gray-300 dark:border-gray-700'
            : node.key === activeState || node.key === selectedNodeKey
              ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/90 dark:bg-blue-950/60'
              : node.isReject
                ? 'bg-red-50/80 dark:bg-red-950/40 border-red-200 dark:border-red-900/60'
                : node.isTerminal
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60'
                  : 'bg-white dark:bg-gray-900/90 border-gray-200 dark:border-gray-800'
        ]"
        :style="{
          left: `${node.x}px`,
          top: `${node.y}px`,
          width: '210px',
          height: '100px'
        }"
        @click="handleNodeClick(node.key)"
      >
        <div class="flex items-center justify-between mb-6px">
          <div class="flex items-center gap-6px">
            <span
              class="w-8px h-8px rounded-full"
              :class="
                node.isOrigin
                  ? 'bg-gray-400'
                  : node.isInitial
                    ? 'bg-blue-500'
                    : node.isReject
                      ? 'bg-red-500'
                      : node.isTerminal
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
              "
            />
            <span class="font-semibold text-13px truncate max-w-120px text-gray-800 dark:text-gray-100">
              {{ node.name }}
            </span>
          </div>
          <NTag
            size="tiny"
            :bordered="false"
            :type="
              node.isOrigin
                ? 'default'
                : node.isInitial
                  ? 'info'
                  : node.isReject
                    ? 'error'
                    : node.isTerminal
                      ? 'success'
                      : 'warning'
            "
          >
            {{
              node.isOrigin
                ? t('page.telegram.workflows.flowchart.originNode')
                : node.isInitial
                  ? t('page.telegram.workflows.flowchart.initialNode')
                  : node.isReject
                    ? t('page.telegram.workflows.flowchart.rejectedNode')
                    : node.isTerminal
                      ? t('page.telegram.workflows.flowchart.completedNode')
                      : t('page.telegram.workflows.flowchart.transitNode')
            }}
          </NTag>
        </div>

        <!--
 The origin node isn't a pipeline state, so it has no state ID
             and no entry/output actions to count.
-->
        <div v-if="node.isOrigin" class="text-11px text-gray-400 dark:text-gray-500">
          {{ t('page.telegram.workflows.flowchart.originHint') }}
        </div>

        <div v-if="!node.isOrigin" class="text-11px font-mono text-gray-400 dark:text-gray-500 truncate mb-6px">
          ID: {{ node.key }}
        </div>

        <div
          v-if="!node.isOrigin"
          class="flex items-center justify-between text-11px text-gray-500 dark:text-gray-400 mt-auto pt-4px border-t border-gray-100 dark:border-gray-800/80"
        >
          <span v-if="node.entryActionsCount" class="flex items-center gap-3px text-blue-600 dark:text-blue-400">
            <span class="i-carbon-notification text-12px" />
            <span>{{ t('page.telegram.workflows.flowchart.notifyCount', { count: node.entryActionsCount }) }}</span>
          </span>
          <span v-else class="text-gray-400">{{ t('page.telegram.workflows.flowchart.noEntryNotify') }}</span>

          <span v-if="node.outputActionsCount" class="flex items-center gap-3px text-emerald-600 dark:text-emerald-400">
            <span class="i-carbon-flash text-12px" />
            <span>
              {{ t('page.telegram.workflows.flowchart.outputActionCount', { count: node.outputActionsCount }) }}
            </span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline-diagram-container {
  min-height: 280px;
}
</style>
