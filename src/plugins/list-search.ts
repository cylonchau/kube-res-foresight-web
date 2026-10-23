import type { App } from 'vue';

/** How long the filters must stay unchanged before the search is submitted, so typing is not a request per key. */
const SUBMIT_DELAY = 300;

/**
 * The search form of every list page (the one with the `list-search-form` class) submits itself when a condition
 * changes: the search button of the form is pressed for the user, so each page keeps its own search function
 * (back to the first page, the same query) and no page has to wire this up. It is the shared behaviour of the
 * list-page search area, like its layout is.
 *
 * It watches the form's `model` (the page's filters), which is how every list page declares its conditions, and
 * presses the primary button of the form's action area. A form without such a button is left alone.
 */
export function setupListSearchAutoSubmit(app: App) {
  const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();

  app.mixin({
    mounted(this: any) {
      const el: HTMLElement | undefined = this.$el;
      if (this.$options?.name !== 'Form' || !el?.classList?.contains('list-search-form')) return;

      const submit = () => {
        const button =
          el.querySelector<HTMLButtonElement>('.list-search-actions .n-button--primary-type') ||
          el.querySelector<HTMLButtonElement>('.n-button--primary-type');
        if (button && !button.disabled) button.click();
      };

      this.$watch(
        () => this.$props.model,
        () => {
          clearTimeout(timers.get(this));
          timers.set(
            this,
            setTimeout(() => {
              timers.delete(this);
              submit();
            }, SUBMIT_DELAY)
          );
        },
        { deep: true }
      );
    },
    beforeUnmount(this: any) {
      const timer = timers.get(this);
      if (timer) clearTimeout(timer);
    }
  });
}
