export type ConfigCategory = 'auth' | 'ldap' | 'forecast' | 'ui' | 'notify';
export const CONFIG_CATEGORIES: ConfigCategory[] = ['auth', 'ldap', 'forecast', 'ui', 'notify'];
export function categoryOf(key: string): ConfigCategory {
  if (key.startsWith('ldap.')) return 'ldap';
  if (key.startsWith('forecast.')) return 'forecast';
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
