import { reactive } from 'vue';

/**
 * What the module list of the resource dashboard (the first level) keeps while a module page (the second level) is open: the namespace and the keyword that were
 * chosen. The list is a page of its own that is built again when the user comes back from a module, so the choices live here, outside the page, and the list
 * reads them when it is built. The window and the basis of a module page are not kept here: they are in the address of that page.
 */
const state = reactive({
  namespace: null as string | null,
  keyword: ''
});

export function useOverprovisionListState() {
  return state;
}
