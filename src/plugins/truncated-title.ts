/**
 * Text that does not fit its box is cut with an ellipsis; the person has to be able to read all of it. The tables already show the whole text
 * in a tooltip. The selects (the chosen value in the box, and the options of the menu) do not, and a name that is longer than a short select
 * (a source, a module) reads as "demo-cont..." with nothing to tell the options apart. This puts the whole text in the title of the cut element
 * when the pointer comes over it, so the browser shows it; one listener for every select of the console, and nothing is touched until the
 * pointer is over a cut text.
 */

/** the elements of a select that hold a text and cut it: the chosen value (single, multiple), an option of the menu, a tag */
export const CUT_TEXT_SELECTOR = [
  '.n-base-select-option__content',
  '.n-base-selection-input__content',
  '.n-base-selection-label',
  '.n-base-selection-overlay__wrapper',
  '.n-tag__content'
].join(',');

interface Measured {
  scrollWidth: number;
  clientWidth: number;
  textContent: string | null;
  title?: string;
  setAttribute?: (name: string, value: string) => void;
}

/** the title to give an element, or '' when its text fits (or it has a title already, or no text) */
export function titleFor(el: Measured): string {
  const text = (el.textContent ?? '').trim();
  if (!text || el.title) return '';
  return el.scrollWidth > el.clientWidth ? text : '';
}

export function setupTruncatedTitle() {
  document.addEventListener(
    'mouseover',
    event => {
      const target = event.target as Element | null;
      const el = target?.closest?.(CUT_TEXT_SELECTOR) as HTMLElement | null;
      if (!el) return;
      const title = titleFor(el);
      if (title) el.setAttribute('title', title);
    },
    { passive: true }
  );
}
