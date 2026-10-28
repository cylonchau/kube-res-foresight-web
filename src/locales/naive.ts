import { dateEnUS, dateZhCN, enUS, zhCN } from 'naive-ui';
import type { NDateLocale, NLocale } from 'naive-ui';

/**
 * A field says what it is by its label, so the stock "please input" / "please select" hints are blanked: a field that has
 * a placeholder of its own keeps it, one that has none stays empty instead of repeating the same words everywhere.
 */
function withoutStockHints(locale: NLocale): NLocale {
  return {
    ...locale,
    Input: { ...locale.Input, placeholder: '' },
    Select: { ...locale.Select, placeholder: '' },
    Cascader: { ...locale.Cascader, placeholder: '' },
    InputNumber: { ...locale.InputNumber, placeholder: '' }
  };
}

export const naiveLocales: Record<App.I18n.LangType, NLocale> = {
  'zh-CN': withoutStockHints(zhCN),
  'en-US': withoutStockHints(enUS)
};

export const naiveDateLocales: Record<App.I18n.LangType, NDateLocale> = {
  'zh-CN': dateZhCN,
  'en-US': dateEnUS
};
