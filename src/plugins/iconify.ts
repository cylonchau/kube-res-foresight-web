import { addAPIProvider, addCollection } from '@iconify/vue';
import collections from 'virtual:iconify-offline';

/**
 * The icons the console uses are in the bundle (build/plugins/iconify-offline.ts), so a page without internet draws them all.
 * VITE_ICONIFY_URL, when set, is only for an icon that is not in the bundle.
 */
export function setupIconifyOffline() {
  const { VITE_ICONIFY_URL } = import.meta.env;

  collections.forEach(collection => addCollection(collection));

  if (VITE_ICONIFY_URL) {
    addAPIProvider('', { resources: [VITE_ICONIFY_URL] });
  }
}
