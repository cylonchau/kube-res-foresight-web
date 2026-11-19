import { ref } from 'vue';
import { $t } from '@/locales';

/**
 * A text search that names no time range reads the last days only (the platform sets how many: a text cannot use an index, a time can). The list says how
 * far it read, so a search that finds nothing is not taken for "there is nothing".
 */
export async function saysSearchWindow<T extends { search_window_days?: number }>(
  pending: Promise<{ data: T | null; error: unknown }>
) {
  const result = await pending;
  const days = result.data?.search_window_days;
  if (days) window.$message?.info($t('page.forecast.searchWindow', { days }), { duration: 6000 });
  return result;
}

/**
 * The total of a list of a table that grew is counted up to a bound (100000): a total that reached it is a floor, and the pagination says "more than" instead of
 * a count that is not true. `capped` is set from `total_capped` of each answer; `prefix` is what the pagination shows in front of the pages.
 */
export function useCappedTotal() {
  const capped = ref(false);
  const prefix = (info: { itemCount?: number }) =>
    capped.value ? $t('datatable.itemCountCapped', { total: info.itemCount ?? 0 }) : undefined;
  return { capped, prefix };
}
