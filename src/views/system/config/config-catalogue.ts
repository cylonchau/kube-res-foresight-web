export type ConfigCategory = 'auth' | 'ui' | 'notify' | 'telegram';
export const CONFIG_CATEGORIES: ConfigCategory[] = ['auth', 'ui', 'notify', 'telegram'];
export function categoryOf(key: string): ConfigCategory {
 if (key.startsWith('ui.')) return 'ui';
 if (key.startsWith('telegram.')) return 'telegram';
 if (key.startsWith('notify.')) return 'notify';
 return 'auth';
}
export interface ConfigNote { name: string; purpose: string }
export function noteOf(_key: string): ConfigNote | undefined { return undefined; }
