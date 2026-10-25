<script setup lang="ts">
import { NCard } from 'naive-ui';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import type { useTableColumnConfig } from '@/hooks/business/use-table-column-config';

defineOptions({ name: 'ListTablePanel' });

interface Props {
  title: string;
  /** Explains what the list is; shown in a hover tooltip, not as page text. */
  help?: string;
  cfg: ReturnType<typeof useTableColumnConfig>;
  loading?: boolean;
  data: any[];
  /** The pagination object of usePagedList; omit for a list that is not paged. */
  pagination?: Record<string, any>;
  rowKey?: (row: any) => string | number;
  /** Rows are paged by the server; defaults to true when a pagination object is given. */
  remote?: boolean;
  showAdd?: boolean;
  /** Batch delete of the checked rows; the page confirms and deletes on `delete`. */
  showDelete?: boolean;
  disabledDelete?: boolean;
  /** Checked rows of a list with a selection column (type: 'selection' in its column map). */
  checkedRowKeys?: Array<string | number>;
  emptyHint?: string;
}

const props = withDefaults(defineProps<Props>(), {
  help: '',
  loading: false,
  pagination: undefined,
  remote: undefined,
  rowKey: (row: any) => row.id,
  showAdd: false,
  showDelete: false,
  disabledDelete: false,
  checkedRowKeys: undefined,
  emptyHint: ''
});

// the column settings live in the composable the page created; the template binds to its refs
const { columnChecks, density, tableColumns } = props.cfg;

const emit = defineEmits<{
  refresh: [];
  add: [];
  delete: [];
  sorter: [state: any];
  'update:checkedRowKeys': [keys: Array<string | number>];
}>();
</script>

<template>
  <NCard :bordered="false" size="small" class="flex-1 overflow-hidden card-wrapper rounded-16px shadow-sm">
    <div class="h-full flex flex-col gap-12px">
      <TableHeaderOperation
        v-model:columns="columnChecks"
        v-model:density="density"
        :loading="loading"
        :show-add="showAdd"
        :show-delete="showDelete"
        :disabled-delete="disabledDelete"
        @add="emit('add')"
        @delete="emit('delete')"
        @refresh="emit('refresh')"
      >
        <template #prefix>
          <div class="flex items-center gap-6px whitespace-nowrap text-14px font-medium mr-8px">
            {{ title }}
            <IconTooltip v-if="help" icon="mdi-help-circle" placement="top">
              <div class="max-w-360px leading-22px">{{ help }}</div>
            </IconTooltip>
          </div>
        </template>
        <template #after-refresh>
          <slot name="after-refresh" />
        </template>
        <template #suffix>
          <slot name="suffix" />
        </template>
      </TableHeaderOperation>
      <div class="flex-1 overflow-hidden">
        <ExpandableDataTable
          v-model:columns="tableColumns"
          :remote="remote ?? Boolean(pagination)"
          :loading="loading"
          :data="data"
          :pagination="pagination || false"
          :row-key="rowKey"
          :size="density"
          :checked-row-keys="checkedRowKeys"
          :empty-hint="emptyHint"
          class="h-full"
          flex-height
          @unstable-column-resize="cfg.handleColumnWidthUpdate"
          @update:sorter="(state: any) => emit('sorter', state)"
          @update:checked-row-keys="(keys: Array<string | number>) => emit('update:checkedRowKeys', keys)"
        />
      </div>
    </div>
  </NCard>
</template>
