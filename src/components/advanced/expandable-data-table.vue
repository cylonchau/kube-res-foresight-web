<script setup lang="ts">
import { computed, h, useAttrs } from 'vue';
import type { DataTableColumns } from 'naive-ui';
import { NDataTable, NEmpty, NText } from 'naive-ui';
import { useAppStore } from '@/store/modules/app';
import { formatDateTime } from '@/utils/date';

defineOptions({
  name: 'ExpandableDataTable',
  inheritAttrs: false
});

type TableRow = Record<string, any>;
type TableColumn = Record<string, any> & {
  type?: string;
  key?: string | number;
  children?: TableColumn[];
  render?: (row: TableRow, index: number) => any;
  /** Whether the user selected this column for the collapsed row. */
  checked?: boolean;
  /** Whether backend metadata allows this field to be rendered at all. */
  visible?: boolean;
};

interface Props {
  columns: TableColumn[];
  data?: TableRow[];
  rowKey?: (row: TableRow) => string | number;
  checkedRowKeys?: Array<string | number>;
  /** Number of ordinary columns retained in the collapsed row. */
  primaryColumnCount?: number;
  /** Explicit ordinary column keys retained in the collapsed row. */
  primaryColumnKeys?: string[];
  hideSyntheticId?: boolean;
  /** Explains an empty table (what fills it) instead of the generic "no data". */
  emptyHint?: string;
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  primaryColumnCount: 0,
  primaryColumnKeys: () => [],
  hideSyntheticId: false,
  emptyHint: ''
});

const emit = defineEmits<{
  'update:checkedRowKeys': [keys: Array<string | number>];
}>();

const attrs = useAttrs();
const appStore = useAppStore();

const forwardedAttrs = computed(() => {
  const { onUnstableColumnResize: _columnResizeListener, ...rest } = attrs;
  return rest;
});

// naive-ui's own default sorter icon is a single caret that flips upside down
// for descending — easy to misread as "currently ascending" no matter which
// way it's actually sorted. This renders both carets stacked instead (the
// conventional ⇕-style indicator), with only the active direction colored,
// so the current state and the fact that the column is sortable at all are
// both visible at a glance. Applied to every table through this shared
// component instead of once per page, so the indicator stays consistent
// wherever @update:sorter shows up.
function renderSorterIcon({ order }: { order: 'ascend' | 'descend' | false }) {
  return h('span', { class: 'expandable-table-sorter-icon' }, [
    h('span', { class: ['expandable-table-sorter-icon__arrow', order === 'ascend' && 'is-active'] }, '▲'),
    h('span', { class: ['expandable-table-sorter-icon__arrow', order === 'descend' && 'is-active'] }, '▼')
  ]);
}

const operationKeys = new Set(['action', 'actions', 'operate', 'operation', 'operations']);
const compactBooleanKeyPattern = /(^|_)(status|active|enabled|enable|default|sync|latest)(_|$)/i;
const compactShortKeyPattern = /(^|_)(id|type|priority|ttl|port|weight|level|order|count)(_|$)/i;
const hiddenPrimaryKeys = new Set(['id']);
const syntheticIdColumn: TableColumn = {
  key: 'id',
  title: 'ID',
  width: 80,
  align: 'center'
};

// Selection checkboxes and the expand arrow render at a fixed, small size
// no matter what — the real driver of the visible gap between them wasn't
// cell padding, it was each page declaring its own (much wider than needed,
// 42-48px) column width for `__selection__`. Forcing both down to the same
// narrow width here — instead of trusting whatever width the ~15 pages that
// declare `__selection__` each happened to pick — is what actually pulls
// them together, on every page, from one place.
const LEAD_COLUMN_WIDTH = 30;

const leafColumns = computed(() => flattenColumns(props.columns));

const selectionColumns = computed(() => leafColumns.value.filter(column => column.type === 'selection'));

const operationColumns = computed(() =>
  leafColumns.value.filter(column => hasColumnKey(column) && operationKeys.has(String(column.key).toLowerCase()))
);

const detailColumns = computed(() => {
  const columns = leafColumns.value.filter(
    column =>
      column.visible !== false &&
      column.type !== 'selection' &&
      column.type !== 'expand' &&
      !operationColumns.value.includes(column)
  );

  if (
    !props.hideSyntheticId &&
    !columns.some(column => hasColumnKey(column) && String(column.key).toLowerCase() === 'id')
  ) {
    return [syntheticIdColumn, ...columns];
  }

  return columns;
});

const primaryColumns = computed(() => {
  const candidates = detailColumns.value.filter(column => {
    if (!hasColumnKey(column)) return true;

    return !hiddenPrimaryKeys.has(String(column.key).toLowerCase()) && column.checked !== false;
  });

  if (appStore.isMobile) {
    return candidates.slice(0, 2);
  }

  if (props.primaryColumnCount > 0) {
    return candidates.slice(0, props.primaryColumnCount);
  }

  return candidates;
});

const expandedColumns = computed(() => detailColumns.value.filter(column => !primaryColumns.value.includes(column)));

const compactColumns = computed<DataTableColumns<TableRow>>(() => {
  const columns: TableColumn[] = [
    // The selection checkbox and the expand arrow are the two narrowest
    // columns and sit right next to each other — tagging both with the same
    // class lets the scoped style below pull in their cell padding so they
    // read as one compact leading control instead of two separately-padded
    // columns with a visible gap between them.
    ...selectionColumns.value.map(column => ({ ...compactColumn(column), className: 'expandable-table-lead-cell' })),
    {
      type: 'expand',
      width: LEAD_COLUMN_WIDTH,
      fixed: 'left',
      className: 'expandable-table-lead-cell',
      renderExpand: (row: TableRow, index: number) => renderExpandedDetails(row, index)
    },
    // The first primary column sits right after the narrow expand arrow: keep its
    // content left-aligned so it stays next to the arrow instead of floating in
    // the middle of a wide column.
    ...primaryColumns.value.map((column, index) =>
      index === 0 && !(column as any).type
        ? { ...compactColumn(column), align: 'left' as const }
        : compactColumn(column)
    ),
    ...operationColumns.value.map(compactColumn)
  ];

  return columns as DataTableColumns<TableRow>;
});

const compactScrollX = computed(() =>
  compactColumns.value.reduce((total, column: any) => total + Number(column.width || column.minWidth || 140), 0)
);

function flattenColumns(columns: TableColumn[]): TableColumn[] {
  return columns.flatMap(column => (column.children?.length ? flattenColumns(column.children) : [column]));
}

function hasColumnKey(column: TableColumn): column is TableColumn & { key: string | number } {
  return column.key !== undefined && column.key !== null;
}

function compactColumn(column: TableColumn): TableColumn {
  const fixed = column.fixed === 'unFixed' ? undefined : column.fixed;
  if (column.type === 'selection' || column.type === 'expand') {
    return { ...column, fixed, width: LEAD_COLUMN_WIDTH, minWidth: LEAD_COLUMN_WIDTH };
  }

  const key = hasColumnKey(column) ? String(column.key).toLowerCase() : '';
  const operation = operationKeys.has(key);
  const booleanLike = compactBooleanKeyPattern.test(key);
  const shortValue = compactShortKeyPattern.test(key);
  const contentMinWidth = operation ? 120 : booleanLike ? 64 : shortValue ? 68 : 80;
  const minWidth = Number(column.minWidth ?? contentMinWidth);
  const fallbackWidth = operation ? 180 : booleanLike ? 80 : shortValue ? 88 : 160;
  const configuredWidth = Number(column.width ?? fallbackWidth);
  const maxWidth = Math.max(minWidth, operation ? 260 : 380);
  const width = Math.round(Math.max(minWidth, Math.min(configuredWidth, maxWidth)));

  return {
    ...column,
    fixed,
    width,
    minWidth,
    ellipsis: column.ellipsis || { tooltip: true },
    // naive-ui's SortButton reads renderSorterIcon off the column itself
    // (see node_modules/naive-ui SortButton.mjs) — there is no table-level
    // prop for it in this version, despite the type existing on NDataTable's
    // own props. Every sortable column gets the same stacked-caret icon this
    // way, applied once here rather than repeated on every page's sorter: true
    // column.
    ...(column.sorter ? { renderSorterIcon } : {})
  };
}

function handleColumnResize(resizedWidth: number, limitedWidth: number, column: TableColumn) {
  const roundedResizedWidth = Math.round(Number(resizedWidth));
  const roundedLimitedWidth = Math.round(Number(limitedWidth));
  const normalizedColumn = { ...column, width: roundedLimitedWidth };
  const listener = attrs.onUnstableColumnResize as
    | ((resized: number, limited: number, resizedColumn: TableColumn) => void)
    | Array<(resized: number, limited: number, resizedColumn: TableColumn) => void>
    | undefined;

  if (Array.isArray(listener)) {
    listener.forEach(fn => fn(roundedResizedWidth, roundedLimitedWidth, normalizedColumn));
  } else {
    listener?.(roundedResizedWidth, roundedLimitedWidth, normalizedColumn);
  }
}

function renderExpandedDetails(row: TableRow, index: number) {
  return h(
    'div',
    {
      class: 'expandable-table-details',
      style: {
        '--expandable-table-operation-reserve': '14px'
      }
    },
    expandedColumns.value.map(column =>
      h('div', { class: 'expandable-table-detail-item' }, [
        h(NText, { depth: 3, class: 'expandable-table-detail-label' }, { default: () => renderTitle(column) }),
        h('div', { class: 'expandable-table-detail-value' }, [renderValue(column, row, index)])
      ])
    )
  );
}

function renderTitle(column: TableColumn) {
  if (typeof column.title === 'function') {
    try {
      return column.title();
    } catch {
      return hasColumnKey(column) ? String(column.key) : '-';
    }
  }

  return column.title || (hasColumnKey(column) ? String(column.key) : '-');
}

function renderValue(column: TableColumn, row: TableRow, index: number) {
  if (typeof column.render === 'function') {
    try {
      return column.render(row, index) ?? '-';
    } catch {
      // Fall through to the raw value so an optional renderer cannot break row expansion.
    }
  }

  if (!hasColumnKey(column)) return '-';

  const value = row[column.key];
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    // The old string-surgery here worked (it explicitly stripped "Z" as its
    // own step, unlike the copies of this pattern found elsewhere in the
    // app that didn't), but it displayed the raw UTC instant relabeled as
    // if it were already local time rather than actually converting it —
    // formatDateTime does the real conversion.
    return formatDateTime(value);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}
</script>

<template>
  <NDataTable
    v-bind="forwardedAttrs"
    :columns="compactColumns"
    :data="data"
    :row-key="rowKey"
    :checked-row-keys="checkedRowKeys"
    :scroll-x="compactScrollX"
    class="expandable-data-table"
    @unstable-column-resize="handleColumnResize"
    @update:checked-row-keys="keys => emit('update:checkedRowKeys', keys)"
  >
    <template v-if="emptyHint" #empty>
      <NEmpty :description="emptyHint" class="max-w-560px mx-auto py-24px" />
    </template>
  </NDataTable>
</template>

<style scoped>
/* naive-ui's own .n-data-table-sorter wrapper (around whatever
   renderSorterIcon returns) sets margin-left: 4px against the column
   title — too tight once it's rendering two stacked carets instead of its
   own single-glyph icon. Widening it here is the only way to reach that
   wrapper; it isn't part of this component's own template. */
:deep(.n-data-table-sorter) {
  margin-left: 10px;
}

:deep(.expandable-table-sorter-icon) {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  line-height: 0.5;
}

:deep(.expandable-table-sorter-icon__arrow) {
  font-size: 9px;
  /* Same tokens naive-ui's own default sorter icon uses (see
     data-table/src/styles/index.cssr.mjs) — these track the table's
     actual configured theme colors, not a color guessed independently
     of it. */
  color: var(--n-th-icon-color);
  transition: color 0.2s var(--n-bezier);
}

:deep(.expandable-table-sorter-icon__arrow.is-active) {
  color: var(--n-th-icon-color-active);
}

:deep(.expandable-table-details) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  column-gap: 32px;
  row-gap: 2px;
  padding: 8px var(--expandable-table-operation-reserve, 16px) 10px 16px;
  font-size: 12px;
  line-height: 1.4;
  background: color-mix(in srgb, var(--n-merged-td-color) 93%, var(--n-th-color));
}

:deep(.expandable-table-detail-item) {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  column-gap: 12px;
  align-items: center;
  min-height: 28px;
  padding: 3px 0;
  border-bottom: 1px dashed color-mix(in srgb, var(--n-border-color) 45%, transparent);
  box-sizing: border-box;
}

:deep(.expandable-table-detail-label) {
  box-sizing: border-box;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--n-text-color-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

:deep(.n-data-table-th--fixed-right),
:deep(.n-data-table-td--fixed-right) {
  z-index: 3;
}

/* Selection checkbox + expand arrow: both narrow, both leading — tighten
   their padding so they sit close together instead of each carrying the
   table's normal cell padding and reading as two separately-spaced columns. */
:deep(.expandable-table-lead-cell.n-data-table-td) {
  padding-left: 6px !important;
  padding-right: 2px !important;
}

:deep(.expandable-table-lead-cell.n-data-table-th) {
  padding-left: 6px !important;
  padding-right: 2px !important;
}

:deep(.expandable-table-detail-value) {
  box-sizing: border-box;
  min-width: 0;
  word-break: break-all;
  white-space: normal;
  color: var(--n-text-color-2);
}
</style>
