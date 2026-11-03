declare module 'virtual:iconify-offline' {
  import type { IconifyJSON } from '@iconify/vue';

  /** the icon collections of the console, made at build time (build/plugins/iconify-offline.ts) */
  const collections: IconifyJSON[];
  export default collections;
}
