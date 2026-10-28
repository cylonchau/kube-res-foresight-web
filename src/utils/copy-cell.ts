import { h } from 'vue';
import CopyText from '@/components/common/copy-text.vue';

/** The cell of a table column whose value is worth copying: the text with its own copy icon. */
export function copyCell(text: string | null | undefined, mono = false) {
  return text ? h(CopyText, { text, mono }) : '-';
}
