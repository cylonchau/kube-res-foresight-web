import { $t } from '@/locales';

/** camelCase or snake_case to snake_case: `updatedAt` and `updated_at` are the same field */
const snake = (key: string) => key.replace(/([A-Z])/g, '_$1').toLowerCase();

/** the readable name of a database field, for a column no page defined; the field name itself when it has none */
export function fieldTitle(key: string): string {
  const path = `common.fields.${snake(key)}`;
  const text = $t(path as never) as string;
  return text === path ? key : text;
}

/** whether a field holds a point in time (created_at, updatedAt, last_login_at) */
export const isTimeField = (key: string) => /(_at|At)$/.test(key);
