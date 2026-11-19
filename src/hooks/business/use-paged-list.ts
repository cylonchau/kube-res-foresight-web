import { reactive, ref } from 'vue';
import { useCappedTotal } from '@/utils/list-notice';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

export interface PagedResult<T> {
  list: T[];
  total: number;
  /** the total was counted up to a bound and reached it: it is a floor */
  total_capped?: boolean;
}

/**
 * State of a server-paged list: rows, loading flag and the pagination object the data table binds.
 * `load` receives the page to fetch and returns the page of rows, or nothing when the request failed
 * (the request layer has already shown the error).
 */
export function usePagedList<T>(load: (page: number, pageSize: number) => Promise<PagedResult<T> | null | undefined>) {
  const rows = ref<T[]>([]) as { value: T[] };
  const loading = ref(false);
  const { capped, prefix } = useCappedTotal();

  const pagination = reactive({
    page: 1,
    pageSize: getAdaptivePageSize(),
    itemCount: 0,
    showSizePicker: true,
    pageSizes: getAdaptivePageSizes(),
    prefix,
    onChange: (page: number) => {
      pagination.page = page;
      reload();
    },
    onUpdatePageSize: (pageSize: number) => {
      pagination.pageSize = pageSize;
      pagination.page = 1;
      reload();
    }
  });

  let token = 0;

  async function reload() {
    // a slower, older response must not overwrite a newer one
    const mine = ++token;
    loading.value = true;
    try {
      const data = await load(pagination.page, pagination.pageSize);
      if (mine !== token) return;
      rows.value = data?.list || [];
      pagination.itemCount = data?.total || 0;
      capped.value = Boolean(data?.total_capped);
    } finally {
      if (mine === token) loading.value = false;
    }
  }

  /** Back to the first page with the current filters. */
  function search() {
    pagination.page = 1;
    return reload();
  }

  return { rows, loading, pagination, reload, search };
}
