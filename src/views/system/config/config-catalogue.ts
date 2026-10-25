export type ConfigCategory = 'auth' | 'ui' | 'notify';
export const CONFIG_CATEGORIES: ConfigCategory[] = ['auth', 'ui', 'notify'];
/** The directory login settings, shown as a form beside the parameter categories. */
export const LDAP_CATEGORY = 'ldap';
export function categoryOf(key: string): ConfigCategory {
  if (key.startsWith('ui.')) return 'ui';
  if (key.startsWith('notify.')) return 'notify';
  return 'auth';
}
export interface ConfigNote {
  name: string;
  purpose: string;
}
export function noteOf(_key: string): ConfigNote | undefined {
  return undefined;
}
