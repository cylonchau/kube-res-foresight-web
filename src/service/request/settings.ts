/**
 * The time limits of the web console, read from the system parameters (System > System parameters > Interface and timeouts) instead of being
 * fixed in the code:
 *
 * - `ui.request_timeout_seconds`: how long one ordinary request is waited for;
 * - `http.gateway_timeout_seconds`: how long the gateway in front of the platform waits; the requests that are known to be long wait for this plus
 *   10 seconds, so the answer of the platform (which stops its own work 5 seconds before the gateway does) arrives first;
 * - `ui.request_retries`: how many times a failed read is asked for again when the platform was not reachable for a moment.
 *
 * They are read once after the first request and again every few minutes. A parameter that cannot be read leaves the last value (the defaults
 * at the start), so a console that cannot reach them still works.
 */
export const requestSettings = { timeoutMs: 60_000, gatewayMs: 60_000, retries: 1 };

/** the request that reads these settings carries this header, so reading them does not wait for itself */
export const SETTINGS_PROBE_HEADER = 'X-Settings-Probe';
/** a request that is known to take long carries this header; it is removed before the request is sent */
export const LONG_REQUEST_HEADER = 'X-Long-Request';
/** the time an ordinary request got before these settings existed: a request that asks for another time (a connection test) keeps it */
export const DEFAULT_TIMEOUT_MS = 60_000;

const REFRESH_MS = 5 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60_000;
let loadedAt = 0;
let loading: Promise<void> | null = null;

/** the time a request that is known to take long waits: the gateway timeout plus 10 seconds */
export function longTimeoutMs() {
  return requestSettings.gatewayMs + 10_000;
}

function seconds(raw: string | null, min: number, max: number, fallbackMs: number) {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return fallbackMs;
  return Math.min(max, Math.max(min, Math.round(n))) * 1000;
}

/** read the settings through `read` (the value of a system parameter, or null) when they are older than a few minutes */
export function ensureRequestSettings(read: (key: string) => Promise<string | null>) {
  if (Date.now() - loadedAt < REFRESH_MS) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        const [timeout, gateway, retries] = await Promise.all([
          read('ui.request_timeout_seconds'),
          read('http.gateway_timeout_seconds'),
          read('ui.request_retries')
        ]);
        requestSettings.timeoutMs = seconds(timeout, 10, 600, requestSettings.timeoutMs);
        requestSettings.gatewayMs = seconds(gateway, 10, 3600, requestSettings.gatewayMs);
        const n = Number(retries);
        if (retries !== null && Number.isFinite(n)) requestSettings.retries = Math.min(3, Math.max(0, Math.round(n)));
        loadedAt = Date.now();
      } catch {
        // keep what there is, and try again in a minute rather than on every request
        loadedAt = Date.now() - REFRESH_MS + RETRY_AFTER_FAILURE_MS;
      } finally {
        loading = null;
      }
    })();
  }
  return loading;
}

/** the part of a failed request that decides whether it is asked for again */
interface FailedRequest {
  config?: { method?: string; 'axios-retry'?: { retryCount?: number } };
  response?: { status: number };
  code?: string;
}

/**
 * A read (GET) that failed because the platform was not reachable for a moment (a network error, 502 or 503: a restart or a rollout) is asked for
 * again, as many times as ui.request_retries says (once by default). A time-out or a 504 never is: it would repeat the slow work. Everything
 * else (a write, a cancelled request) is never repeated.
 */
export function shouldRetry(error: FailedRequest) {
  const config = error.config;
  if (!config || String(config.method ?? 'get').toLowerCase() !== 'get') return false;
  if ((config['axios-retry']?.retryCount ?? 0) >= requestSettings.retries) return false;
  if (!error.response) return error.code === 'ERR_NETWORK';
  return error.response.status === 502 || error.response.status === 503;
}
