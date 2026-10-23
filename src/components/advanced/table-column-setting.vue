<script setup lang="ts" generic="T extends Record<string, unknown>, K = never">
import { computed, onActivated, onMounted, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { $t } from '@/locales';
import {
  SYSTEM_COLUMN_KEYS,
  refreshDefaultVisibleColumnCount,
  tableVisibleColumnLimit
} from '@/hooks/business/use-table-column-config';

defineOptions({
  name: 'TableColumnSetting'
});

// Admin-configured cap (ui.table.default_visible_columns) on how many business columns a user
// may have checked at once. Fetched once (cached) and shared by every instance of this popup.
async function refreshLimit() {
  await refreshDefaultVisibleColumnCount();
  enforceBusinessColumnLimit();
}

onMounted(refreshLimit);
onActivated(refreshLimit);

// Must match use-table-column-config.ts: structural columns are hidden from this popup and do
// not consume the configured business-column allowance.
const systemColumnKeys = SYSTEM_COLUMN_KEYS;
const actionColumnKeys = new Set(['action', 'actions', 'operate', 'operation', '__action__', '__operation__']);

const columns = defineModel<NaiveUI.TableColumnCheck[]>('columns', {
  required: true
});

const tooltipRecord: Record<NaiveUI.TableColumnFixed, App.I18n.I18nKey> = {
  left: 'datatable.fixed.right',
  right: 'datatable.fixed.unFixed',
  unFixed: 'datatable.fixed.left'
};

function handleFixed(column: NaiveUI.TableColumnCheck) {
  const fixedOptions: NaiveUI.TableColumnFixed[] = ['left', 'right', 'unFixed'];
  const index = fixedOptions.findIndex(item => item === column.fixed);
  const nextIndex = index === fixedOptions.length - 1 ? 0 : index + 1;
  column.fixed = fixedOptions[nextIndex];
}

const visibleStats = computed(() => {
  let total = 0;
  let checked = 0;

  columns.value.forEach(column => {
    if (!isConfigurable(column)) return;

    total += 1;
    if (column.checked) checked += 1;
  });

  return { total, checked };
});

function isConfigurable(column: NaiveUI.TableColumnCheck) {
  return column.visible !== false && !systemColumnKeys.has(String(column.key).toLowerCase());
}

// The setting is already the number of selectable business columns. Selection, expand and
// operation columns are structural and therefore never subtracted from it.
const businessBudget = computed(() => tableVisibleColumnLimit.value);

const limitReached = computed(
  () => businessBudget.value !== null && visibleStats.value.checked >= businessBudget.value
);

function isCheckDisabled(column: NaiveUI.TableColumnCheck) {
  return !column.checked && limitReached.value;
}

function enforceBusinessColumnLimit() {
  if (businessBudget.value === null) return;

  let remaining = businessBudget.value;
  columns.value.forEach(column => {
    if (!isConfigurable(column) || !column.checked) return;
    if (remaining > 0) {
      remaining -= 1;
    } else {
      column.checked = false;
    }
  });
}

function handlePopoverShow(show: boolean) {
  if (show) refreshLimit();
}

watch(tableVisibleColumnLimit, enforceBusinessColumnLimit);

watch(
  columns,
  value => {
    const regularColumns: NaiveUI.TableColumnCheck[] = [];
    const actionColumns: NaiveUI.TableColumnCheck[] = [];
    value.forEach(column => {
      if (actionColumnKeys.has(String(column.key).toLowerCase())) {
        column.checked = true;
        column.fixed = 'right';
        actionColumns.push(column);
      } else {
        regularColumns.push(column);
      }
    });
    const normalizedColumns = [...regularColumns, ...actionColumns];
    if (normalizedColumns.some((column, index) => column !== value[index])) {
      columns.value = normalizedColumns;
    }
    enforceBusinessColumnLimit();
  },
  { deep: true, immediate: true }
);

const selectAllChecked = computed(() => {
  const { total, checked } = visibleStats.value;

  return total > 0 && checked === total;
});

const selectAllIndeterminate = computed(() => {
  const { total, checked } = visibleStats.value;

  return checked > 0 && checked < total;
});

function toggleSelectAll(checked: boolean) {
  if (!checked) {
    columns.value.forEach(column => {
      if (!isConfigurable(column)) return;
      column.checked = false;
    });
    return;
  }

  let remaining = businessBudget.value ?? Number.POSITIVE_INFINITY;
  columns.value.forEach(column => {
    if (!isConfigurable(column)) return;
    if (remaining > 0) {
      column.checked = true;
      remaining -= 1;
    } else {
      column.checked = false;
    }
  });
}
</script>

<template>
  <NPopover placement="bottom-end" trigger="click" @update:show="handlePopoverShow">
    <template #trigger>
      <NButton size="small">
        <template #icon>
          <icon-ant-design-setting-outlined class="text-icon" />
        </template>
        {{ $t('common.columnSetting') }}
      </NButton>
    </template>
    <div>
      <div class="h-36px flex-y-center justify-between rd-4px pl-26px hover:(bg-primary bg-opacity-20)">
        <NCheckbox
          :checked="selectAllChecked"
          :indeterminate="selectAllIndeterminate"
          :disabled="visibleStats.total === 0"
          class="flex-1"
          @update:checked="toggleSelectAll"
        >
          {{ $t('common.selectAll') }}
        </NCheckbox>
        <NText depth="3" class="pr-8px text-12px">
          {{ visibleStats.checked }}/{{ visibleStats.total }}
          <template v-if="businessBudget !== null">· ≤ {{ businessBudget }}</template>
        </NText>
      </div>
      <NDivider class="!my-4px" />
      <VueDraggable
        v-model="columns"
        :animation="150"
        handle=".column-drag-handle"
        class="max-h-[280px] overflow-y-auto"
      >
        <div
          v-for="item in columns"
          :key="item.key"
          class="h-36px flex-y-center justify-between gap-6px"
          :class="{ hidden: !isConfigurable(item) }"
        >
          <div class="h-full flex-y-center flex-1 rd-4px hover:(bg-primary bg-opacity-20)">
            <button class="column-drag-handle" type="button" title="Drag">
              <icon-mdi-drag class="text-icon" />
            </button>
            <NCheckbox v-model:checked="item.checked" :disabled="isCheckDisabled(item)" class="flex-1">
              <template v-if="typeof item.title === 'function'">
                <component :is="item.title" />
              </template>
              <template v-else>{{ item.title }}</template>
            </NCheckbox>
            <NTooltip v-if="isCheckDisabled(item)" trigger="hover">
              <template #trigger>
                <icon-mdi-information-outline class="text-icon mr-8px text-warning" />
              </template>
              {{ $t('common.columnSettingLimitReached', { max: businessBudget ?? 0 }) }}
            </NTooltip>
          </div>
          <ButtonIcon
            :disabled="!item.checked"
            :focusable="false"
            :tooltip-content="$t(tooltipRecord[item.fixed!])"
            @click="handleFixed(item)"
          >
            <icon-octicon-pin-16 v-if="item.fixed === 'unFixed'" />
            <icon-octicon-pin-16 v-else-if="item.fixed === 'left'" class="rotate-270" />
            <icon-octicon-pin-slash-16 v-else />
          </ButtonIcon>
        </div>
      </VueDraggable>
    </div>
  </NPopover>
</template>

<style scoped>
.column-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  width: 32px;
  margin-right: 4px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: grab;
}

.column-drag-handle:active {
  cursor: grabbing;
}
</style>
