import { reactive } from 'vue';
import type { DataTableSortState } from 'naive-ui';

/**
 * Remote sorting for the paginated list tables.
 *
 * These lists are paged server-side, so sorting has to be too — sorting only the rows the current
 * page happens to hold would be wrong rather than merely limited. Columns opt in with
 * `sorter: true` and the table's `@update:sorter` is handed to `handleSorterChange`; the resulting
 * `sort_by`/`sort_order` go out with the list request, where the DAO resolves the column through
 * its own allowlist (see rdb.ApplySort) and ignores anything it doesn't recognize.
 *
 * The arrow state stays uncontrolled (naive-ui tracks it internally) — the alternative means
 * rebuilding every page's column map as a computed just to feed `sortOrder` back in.
 *
 * @param onChange Called after the sort changes, to reload the list.
 */
export function useTableSort(onChange: () => void) {
  const sort = reactive({
    sortBy: '',
    sortOrder: '' as '' | 'asc' | 'desc'
  });

  function handleSorterChange(state: DataTableSortState | DataTableSortState[] | null) {
    const next = Array.isArray(state) ? state[0] : state;

    if (!next || !next.order) {
      // Third click clears the sort: fall back to the server's default order
      // rather than freezing on the last direction.
      sort.sortBy = '';
      sort.sortOrder = '';
    } else {
      sort.sortBy = String(next.columnKey);
      sort.sortOrder = next.order === 'descend' ? 'desc' : 'asc';
    }

    onChange();
  }

  /** Spread into the list request; empty while nothing is sorted. */
  function sortParams() {
    if (!sort.sortBy) return {};
    return { sort_by: sort.sortBy, sort_order: sort.sortOrder };
  }

  function resetSort() {
    sort.sortBy = '';
    sort.sortOrder = '';
  }

  return { sort, handleSorterChange, sortParams, resetSort };
}
