import { h } from 'vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';

/** A column title with a question mark that explains the column (what it is and how it is computed), without taking room in the page. */
export function helpTitle(label: string, help: string) {
  return h('span', { class: 'inline-flex items-center gap-4px' }, [
    label,
    h(IconTooltip, { icon: 'mdi-help-circle', placement: 'top' }, () =>
      h('div', { class: 'max-w-320px leading-22px' }, help)
    )
  ]);
}
