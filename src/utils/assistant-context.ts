/** the part of a route the assistant needs to know where the user is */
export interface RouteLike {
  name?: unknown;
  query?: Record<string, unknown>;
}

/** a positive whole number from an address parameter, or undefined */
function idOf(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Where the user is when they ask the assistant: the page (the name of its route and its title) and the module it shows when the address
 * names one ("?module_id=" or "?module="). It names things and carries no data: the platform checks that the user may see the module and tells
 * the model what it is, so "this module" means something. Undefined on a page with no name.
 */
export function pageContextOf(route: RouteLike, title: string): Api.Assistant.PageContext | undefined {
  const page = typeof route.name === 'string' ? route.name : '';
  if (!page) return undefined;
  const query = route.query ?? {};
  const context: Api.Assistant.PageContext = { page, title };
  const moduleId = idOf(query.module_id) ?? idOf(query.module);
  if (moduleId) context.module_id = moduleId;
  return context;
}
