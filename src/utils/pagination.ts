/**
 * Calculates the first page-size option from the viewport height. The table
 * layout leaves roughly 220px for navigation, search, actions and pagination;
 * each compact row uses about 46px. Keep the adaptive option practical on
 * both laptop and large desktop displays.
 */
export function getAdaptivePageSize(): number {
  if (typeof window === 'undefined') return 10;
  return Math.min(13, Math.max(9, Math.floor((window.innerHeight - 220) / 46)));
}

export function getAdaptivePageSizes(): number[] {
  return [getAdaptivePageSize(), 30, 50, 100, 200];
}
