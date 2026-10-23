import { h } from 'vue';
import type { App } from 'vue';
import { NButton } from 'naive-ui';
import { $t } from '@/locales';

export function setupAppErrorHandle(app: App) {
  app.config.errorHandler = (err, vm, info) => {
    // eslint-disable-next-line no-console
    console.error(err, vm, info);
  };
}

/**
 * Recover from a stale tab after a redeploy.
 *
 * Route chunks are lazy-loaded by hashed filename (e.g. `index-C4qCtWO1.js`).
 * When a new build is deployed, the old hashed files are deleted from the
 * server, but a tab that's been open since before the deploy still has the
 * *old* `index.html`/entry chunk in memory, which references those
 * now-deleted hashes. Navigating to a route it hasn't loaded yet then fails
 * with "Unable to preload CSS for ..." or "error loading dynamically
 * imported module" — Vite's runtime dispatches `vite:preloadError` for
 * exactly this case (both `<link rel="modulepreload">` and dynamic
 * `import()` failures), so reloading once picks up the current
 * `index.html` and its correct hashes.
 */
export function setupChunkLoadErrorReload() {
  const RELOAD_GUARD_KEY = 'kubeforecast-chunk-reload-at';
  const RELOAD_GUARD_WINDOW_MS = 10_000;

  window.addEventListener('vite:preloadError', event => {
    // eslint-disable-next-line no-console
    console.error('Stale asset detected, reloading to fetch the latest build:', event);

    // If assets are still broken right after a reload (a genuinely broken
    // deploy, not just a stale tab), don't loop forever — reload at most
    // once per RELOAD_GUARD_WINDOW_MS and let the error surface normally
    // after that.
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    const now = Date.now();
    if (now - last < RELOAD_GUARD_WINDOW_MS) return;

    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
    window.location.reload();
  });
}

export function setupAppVersionNotification() {
  // Update check interval in milliseconds
  const UPDATE_CHECK_INTERVAL = 3 * 60 * 1000;

  const canAutoUpdateApp = import.meta.env.VITE_AUTOMATICALLY_DETECT_UPDATE === 'Y' && import.meta.env.PROD;
  if (!canAutoUpdateApp) return;

  let isShow = false;
  let updateInterval: ReturnType<typeof setInterval> | undefined;

  const checkForUpdates = async () => {
    if (isShow) return;

    const buildTime = await getHtmlBuildTime();

    // If failed to get build time or build time hasn't changed, no update is needed.
    if (!buildTime || buildTime === BUILD_TIME) {
      return;
    }

    isShow = true;

    // Show update notification
    const n = window.$notification?.create({
      title: $t('system.updateTitle'),
      content: $t('system.updateContent'),
      action() {
        return h('div', { style: { display: 'flex', justifyContent: 'end', gap: '12px', width: '325px' } }, [
          h(
            NButton,
            {
              onClick() {
                n?.destroy();
                isShow = false;
              }
            },
            () => $t('system.updateCancel')
          ),
          h(
            NButton,
            {
              type: 'primary',
              onClick() {
                location.reload();
              }
            },
            () => $t('system.updateConfirm')
          )
        ]);
      },
      onClose() {
        isShow = false;
      }
    });
  };

  const startUpdateInterval = () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
  };

  // If updates should be checked, set up the visibility change listener and start the update interval
  if (!isShow && document.visibilityState === 'visible') {
    // Check for updates when the document is visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
        startUpdateInterval();
      }
    });

    // Start the update interval
    startUpdateInterval();
  }
}

async function getHtmlBuildTime(): Promise<string | null> {
  const baseUrl = import.meta.env.VITE_BASE_URL || '/';

  try {
    const res = await fetch(`${baseUrl}index.html?time=${Date.now()}`);

    if (!res.ok) {
      return null;
    }

    const html = await res.text();
    const match = html.match(/<meta name="buildTime" content="(.*)">/);
    return match?.[1] || null;
  } catch (error) {
    window.console.error('getHtmlBuildTime error:', error);
    return null;
  }
}
