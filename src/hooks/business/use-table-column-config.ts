import { readonly, ref, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { fieldTitle, isTimeField } from '@/utils/field-title';
import { formatDateTime } from '@/utils/date';
import { fetchColumnsMeta, fetchGetConfig, fetchGetUserColumnConfig, fetchUpdateUserColumnConfig } from '@/service/api';

export interface TableColumnConfigOptions {
  pageCode: string;
  columnMap: Record<string, any>;
  defaultKeys: string[];
  columnMinWidths?: Record<string, number>;
  onColumnsChange?: () => void;
}

const DEFAULT_VISIBLE_COLUMN_COUNT = 5;

/**
 * Structural columns are always shown and never count against the business-column limit.
 * Keep this set aligned with the backend save validation (isStructuralColumnKey in
 * handle_column_config.go) and TableColumnSetting. `id` is included: it's an identifying
 * column, not a real display column, so it doesn't consume a configured business-column slot.
 */
export const SYSTEM_COLUMN_KEYS = new Set([
  '__selection__',
  'selection',
  'expand',
  '__expand__',
  'action',
  'actions',
  'operate',
  'operation',
  'operations',
  '__action__',
  '__operation__',
  'id'
]);

/**
 * `ui.table.default_visible_columns` caps how many of a page's declared `defaultKeys` are checked
 * on first load (before a user customizes column settings). It's a single global admin setting
 * shared by every list page. Concurrent callers (e.g. several tables' hooks mounting in the same
 * tick) share one in-flight request, but the cache is cleared as soon as it resolves — an admin who
 * changes this value on the System Config page and then navigates to another list page (an SPA
 * route change, no full reload) must see the new value immediately, not whatever was cached from
 * before they changed it.
 */
let visibleColumnCountPromise: Promise<number> | null = null;
const visibleColumnCount = ref<number | null>(null);

/** One reactive backend-controlled limit shared by every mounted/KeepAlive list page. */
export const tableVisibleColumnLimit = readonly(visibleColumnCount);

export function getDefaultVisibleColumnCount() {
  if (!visibleColumnCountPromise) {
    visibleColumnCountPromise = fetchGetConfig('ui.table.default_visible_columns')
      .then(({ data, error }) => {
        if (error) return DEFAULT_VISIBLE_COLUMN_COUNT;
        const count = Number(data?.config_value);
        return Number.isFinite(count) && count > 0 ? Math.floor(count) : DEFAULT_VISIBLE_COLUMN_COUNT;
      })
      .catch(() => DEFAULT_VISIBLE_COLUMN_COUNT)
      .then(count => {
        visibleColumnCount.value = count;
        return count;
      })
      .finally(() => {
        visibleColumnCountPromise = null;
      });
  }
  return visibleColumnCountPromise;
}

/** Force a fresh backend read after an admin update or KeepAlive page activation. */
export function refreshDefaultVisibleColumnCount() {
  visibleColumnCountPromise = null;
  return getDefaultVisibleColumnCount();
}

export function useTableColumnConfig(
  optionsOrPageCode: TableColumnConfigOptions | string,
  maybeColumnMap?: Record<string, any>,
  maybeDefaultKeys?: string[]
) {
  const options: TableColumnConfigOptions =
    typeof optionsOrPageCode === 'string'
      ? {
          pageCode: optionsOrPageCode,
          columnMap: maybeColumnMap || {},
          defaultKeys: maybeDefaultKeys || []
        }
      : optionsOrPageCode || { pageCode: '', columnMap: {}, defaultKeys: [] };

  const { pageCode = '', columnMap = {}, defaultKeys = [], columnMinWidths = {}, onColumnsChange } = options;

  const columnChecks = ref<NaiveUI.TableColumnCheck[]>([]);
  const tableColumns = ref<any[]>([]);
  const density = ref<NaiveUI.RowDensity>('small');
  const isInitializing = ref(false);

  function getSafeWidth(key: string, width?: number) {
    const min = columnMinWidths[key] || 0;
    return Math.max(width || 0, min) || width || columnMap[key]?.width || 150;
  }

  function buildTableColumn(check: NaiveUI.TableColumnCheck) {
    const keyStr = String(check.key);
    const baseCol = columnMap[keyStr] || {
      key: check.key,
      title: check.title && check.title !== keyStr ? check.title : fieldTitle(keyStr),
      width: isTimeField(keyStr) ? 170 : 150,
      resizable: true,
      align: 'center',
      // a time field of a column no page defined is shown as a date, not as the raw value
      ...(isTimeField(keyStr)
        ? { render: (row: Record<string, unknown>) => formatDateTime(row[keyStr] as string) }
        : {})
    };

    return {
      ...baseCol,
      key: check.key,
      title: baseCol.title || check.title || keyStr,
      checked: check.checked,
      visible: check.visible,
      width: getSafeWidth(keyStr, check.width || baseCol.width),
      minWidth: columnMinWidths[keyStr] || baseCol.minWidth,
      resizable: keyStr !== 'operate' && keyStr !== 'action' && keyStr !== 'actions',
      fixed:
        check.fixed === 'unFixed'
          ? keyStr === 'operate' || keyStr === 'action' || keyStr === 'actions'
            ? 'right'
            : keyStr === '__selection__'
              ? 'left'
              : undefined
          : check.fixed
    };
  }

  function updateTableColumns() {
    tableColumns.value = columnChecks.value.map(buildTableColumn);
    onColumnsChange?.();
  }

  async function initColumnConfig() {
    isInitializing.value = true;
    try {
      if (!pageCode) {
        columnChecks.value = defaultKeys.map(key => {
          const baseCol = columnMap[key];
          return {
            key,
            title: baseCol?.title || key,
            checked: true,
            width: getSafeWidth(key, baseCol?.width),
            visible: baseCol?.visible ?? true,
            fixed: baseCol?.fixed
          };
        });
        updateTableColumns();
        return;
      }

      const [{ data: meta }, { data: userConfig }, columnBudget] = await Promise.all([
        fetchColumnsMeta(pageCode),
        fetchGetUserColumnConfig(pageCode),
        getDefaultVisibleColumnCount()
      ]);

      // The configured value is the business-column budget. Structural selection, expand and
      // operation columns are always available and do not consume that budget.
      function isConfigurableColumn(key: string) {
        if (SYSTEM_COLUMN_KEYS.has(key.toLowerCase())) return false;
        return meta?.find((item: any) => item.key === key)?.configurable ?? true;
      }
      const businessVisibleBudget = columnBudget;
      const defaultVisibleKeys = new Set(
        (defaultKeys || []).filter(isConfigurableColumn).slice(0, businessVisibleBudget)
      );

      let savedColumns: Array<{ key: string; checked?: boolean; width?: number; fixed?: any }> = [];
      if (userConfig?.config) {
        try {
          const parsed = JSON.parse(userConfig.config);
          if (Array.isArray(parsed) && parsed.length > 0) {
            savedColumns = parsed;
          }
        } catch {}
      }

      const metaKeys = meta?.map((item: any) => item.key) || [];
      const mapKeys = Object.keys(columnMap);
      const allKnownKeys = Array.from(new Set([...defaultKeys, ...mapKeys, ...metaKeys]));

      // If user has saved config, preserve user's saved key order!
      const savedKeySet = new Set(savedColumns.map(item => String(item.key)));
      const orderedKeys = [
        ...savedColumns.map(item => String(item.key)).filter(k => allKnownKeys.includes(k)),
        ...allKnownKeys.filter(k => !savedKeySet.has(k))
      ];

      columnChecks.value = orderedKeys.map(key => {
        const savedState = savedColumns.find(item => String(item.key) === key);
        const baseCol = columnMap[key];
        const isAction = ['operate', 'action', 'actions'].includes(key);
        const isSelection = key === '__selection__';
        const isPinned = SYSTEM_COLUMN_KEYS.has(key.toLowerCase());
        const isConfigurable = meta?.find((item: any) => item.key === key)?.configurable ?? true;

        // Structural and backend-declared non-configurable columns follow the page defaults;
        // only user-configurable business columns consume the configured budget.
        const checked =
          savedState?.checked ??
          (isPinned || !isConfigurable ? defaultKeys.includes(key) : defaultVisibleKeys.has(key));
        const width = getSafeWidth(key, savedState?.width || baseCol?.width);
        const visible = meta?.find((item: any) => item.key === key)?.configurable ?? baseCol?.visible ?? true;
        const fixed = savedState?.fixed || (isAction ? 'right' : isSelection ? 'left' : 'unFixed');

        return {
          key,
          title: baseCol?.title || fieldTitle(key),
          checked,
          width,
          visible,
          fixed
        };
      });

      // A saved config from before this cap existed (or one written directly)
      // can have more configurable columns checked than the admin's current
      // ui.table.default_visible_columns allows. Enforce the cap on load too,
      // not just on future checkbox clicks — otherwise a stale saved config
      // silently bypasses the limit forever. Order is preserved: the first N
      // checked configurable columns (by the user's own saved/declared order)
      // win, the rest are unchecked.
      let remaining = businessVisibleBudget;
      let corrected = false;
      columnChecks.value.forEach(check => {
        if (!isConfigurableColumn(String(check.key)) || !check.checked) return;
        if (remaining > 0) {
          remaining -= 1;
        } else {
          check.checked = false;
          corrected = true;
        }
      });

      updateTableColumns();

      // Persist the correction immediately so the stored config itself stops
      // being wrong — not just what's rendered this one time. Without this, a
      // saved config that predates the cap keeps re-triggering (and getting
      // silently re-displayed-corrected) on every future load instead of
      // actually being fixed in the database.
      if (corrected) {
        await persistColumnConfig();
      }
    } finally {
      setTimeout(() => {
        isInitializing.value = false;
      }, 0);
    }
  }

  async function persistColumnConfig() {
    const payload = columnChecks.value.map(item => ({
      key: item.key,
      checked: item.checked,
      width: item.width,
      fixed: item.fixed
    }));
    await fetchUpdateUserColumnConfig(pageCode, JSON.stringify(payload));
  }

  const saveColumnConfig = useDebounceFn(async () => {
    if (isInitializing.value) return;
    await persistColumnConfig();
  }, 500);

  function handleColumnUpdate(newCols: any[]) {
    if (isInitializing.value) return;

    const newChecks: NaiveUI.TableColumnCheck[] = [];
    newCols.forEach(col => {
      const check = columnChecks.value.find(c => c.key === col.key);
      if (check) {
        if (col.width) check.width = col.width;
        newChecks.push(check);
      }
    });

    columnChecks.value.forEach(check => {
      if (!newChecks.find(nc => nc.key === check.key)) {
        newChecks.push(check);
      }
    });

    columnChecks.value = newChecks;
    updateTableColumns();
    saveColumnConfig();
  }

  function handleColumnWidthUpdate(k: string | number, w: number, column?: { key?: string | number }) {
    if (isInitializing.value) return;

    // Naive UI emits (resizedWidth, limitedWidth, column), while callers may also use
    // the simpler (columnKey, width) form. Supporting both keeps every list page on
    // this one persistence handler.
    const key = column?.key ?? k;
    const safeWidth = Math.round(Number(w));
    if (!safeWidth || safeWidth <= 0) return;

    const check = columnChecks.value.find(c => String(c.key) === String(key));
    if (check) check.width = safeWidth;

    saveColumnConfig();
  }

  watch(
    columnChecks,
    () => {
      if (!isInitializing.value) {
        updateTableColumns();
        saveColumnConfig();
      }
    },
    { deep: true }
  );

  return {
    columnChecks,
    tableColumns,
    density,
    isInitializing,
    initColumnConfig,
    updateTableColumns,
    handleColumnUpdate,
    handleColumnWidthUpdate,
    saveColumnConfig
  };
}
