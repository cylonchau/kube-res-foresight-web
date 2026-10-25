<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NCard, NEmpty, NPagination, NSpin } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import RankLane from '@/components/business/rank-lane.vue';

defineOptions({ name: 'RankList' });

/**
 * A ranking as a list: the standard list frame (title with help, tool slot, scrolling body, pagination, check boxes for batch
 * operations) around lanes that show each algorithm's score as a bar. The body scrolls on its own, so a long ranking is always reachable.
 */
interface Item {
  key: string;
  rank: number | null;
  name: string;
  score: number | null;
  scoreText?: string;
  active?: boolean;
  caption?: string;
  tags?: Array<{ label: string; type?: 'default' | 'success' | 'warning' | 'info' | 'error' }>;
  parts?: Array<{ label: string; value: number | null; text?: string; hint?: string }>;
  movement?: number | null;
}

interface Props {
  title: string;
  help?: string;
  items: Item[];
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
  selectable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  help: '',
  loading: false,
  emptyText: '',
  pageSize: 10,
  selectable: false
});
const checked = defineModel<string[]>('checked', { default: () => [] });
const { t } = useI18n();

const page = ref(1);
const size = ref(props.pageSize);
watch(
  () => props.items,
  () => {
    if ((page.value - 1) * size.value >= props.items.length) page.value = 1;
  }
);
const visible = computed(() => props.items.slice((page.value - 1) * size.value, page.value * size.value));

function toggle(key: string, on: boolean) {
  checked.value = on ? [...new Set([...checked.value, key])] : checked.value.filter(item => item !== key);
}
</script>

<template>
  <NCard :bordered="false" size="small" class="rank-list card-wrapper rounded-16px shadow-sm">
    <div class="rank-list__frame">
      <div class="flex flex-wrap items-center justify-between gap-8px">
        <div class="flex items-center gap-6px text-14px font-medium">
          {{ title }}
          <IconTooltip v-if="help" icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ help }}</div>
          </IconTooltip>
        </div>
        <div class="flex items-center gap-8px">
          <slot name="tools" />
        </div>
      </div>
      <slot name="summary" />
      <NSpin :show="loading" class="rank-list__spin">
        <div class="rank-list__body">
          <RankLane
            v-for="item in visible"
            :key="item.key"
            :rank="item.rank"
            :name="item.name"
            :score="item.score"
            :score-text="item.scoreText"
            :active="item.active"
            :caption="item.caption"
            :tags="item.tags"
            :parts="item.parts"
            :movement="item.movement ?? null"
            :selectable="selectable"
            :checked="checked.includes(item.key)"
            @update:checked="(on: boolean) => toggle(item.key, on)"
          >
            <template v-if="$slots.actions" #actions><slot name="actions" :item="item" /></template>
          </RankLane>
          <slot name="extra" />
          <NEmpty
            v-if="!items.length && !loading"
            class="py-48px"
            :description="emptyText || t('page.forecast.scores.empty')"
          />
        </div>
      </NSpin>
      <div v-if="items.length > size || selectable" class="rank-list__foot">
        <span v-if="selectable" class="text-12px opacity-70">{{ checked.length }} / {{ items.length }}</span>
        <NPagination
          v-model:page="page"
          v-model:page-size="size"
          :item-count="items.length"
          :page-sizes="[10, 20, 50]"
          show-size-picker
        />
      </div>
    </div>
  </NCard>
</template>

<style scoped>
.rank-list {
  display: flex;
  flex: 1 1 0;
  min-height: 240px;
  overflow: hidden;
}
.rank-list :deep(.n-card__content) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}
.rank-list__frame {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 12px;
  min-height: 0;
  padding: 12px 16px;
}
.rank-list__spin {
  flex: 1;
  min-height: 0;
}
.rank-list__spin :deep(.n-spin-content) {
  height: 100%;
}
.rank-list__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}
.rank-list__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
