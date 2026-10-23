import type { CustomRoute, ElegantConstRoute } from '@elegant-router/types';
import { generatedRoutes } from '../elegant/routes';
import { layouts, views } from '../elegant/imports';
import { transformElegantRoutesToVueRoutes } from '../elegant/transform';

/**
 * custom routes
 *
 * @link https://github.com/soybeanjs/elegant-router?tab=readme-ov-file#custom-route
 */
const customRoutes: CustomRoute[] = [];

/** create routes when the auth route mode is static */
export function createStaticRoutes() {
  const constantRoutes: ElegantConstRoute[] = [];

  const authRoutes: ElegantConstRoute[] = [];

  [...customRoutes, ...generatedRoutes].forEach(item => {
    if (item.meta?.constant) {
      constantRoutes.push(item);
    } else {
      authRoutes.push(item);
    }
  });

  return {
    constantRoutes,
    authRoutes
  };
}

/**
 * Get auth vue routes
 *
 * @param routes Elegant routes
 */
export function getAuthVueRoutes(routes: ElegantConstRoute[]) {
  return transformElegantRoutesToVueRoutes(normalizeElegantRoutes(routes), layouts, views);
}

function normalizeElegantRoutes(routes: ElegantConstRoute[]): ElegantConstRoute[] {
  return routes.flatMap(route => {
    const normalized = normalizeElegantRoute(route);
    return normalized ? [normalized] : [];
  });
}

function normalizeElegantRoute(route: ElegantConstRoute): ElegantConstRoute | null {
  if (route.meta?.constant) {
    return route;
  }

  const children = route.children?.flatMap(child => {
    const normalized = normalizeElegantRoute(child);
    return normalized ? [normalized] : [];
  });
  const nextRoute: ElegantConstRoute = { ...route };

  if (children?.length) {
    nextRoute.children = children;
  } else {
    delete nextRoute.children;
  }

  if (!nextRoute.component) {
    if (nextRoute.children?.length) {
      nextRoute.component = 'layout.base';
    } else if (views[nextRoute.name as keyof typeof views]) {
      if (!nextRoute.name.includes('_')) {
        nextRoute.component = `layout.base$view.${nextRoute.name}`;
      } else {
        nextRoute.component = `view.${nextRoute.name}`;
      }
    } else {
      console.error(`Skipping route "${nextRoute.name}": route component is missing`);
      return null;
    }
  }

  // Handle single-level routes from backend that have view.xxx component without layout prefix
  if (!nextRoute.children?.length && !nextRoute.component.includes('$') && !nextRoute.name.includes('_')) {
    if (nextRoute.component.startsWith('view.')) {
      nextRoute.component = `layout.base$${nextRoute.component}`;
    }
  }

  if (!nextRoute.children?.length && !nextRoute.component.includes('$') && nextRoute.component.startsWith('layout.')) {
    console.error(`Skipping route "${nextRoute.name}": layout route has no children`);
    return null;
  }

  return nextRoute;
}
