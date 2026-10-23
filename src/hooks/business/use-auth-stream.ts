import { onBeforeUnmount, ref } from 'vue';
import { request } from '@/service/request';
import { accessTokenNeedsRefresh, handleExpiredRequest } from '@/service/request/shared';
import { getServiceBaseURL } from '@/utils/service';
import { localStg } from '@/utils/storage';

/** connecting: opening; live: receiving pushes; closed: not connected (retrying while active). */
export type StreamStatus = 'connecting' | 'live' | 'closed';

/** Must match middleware.WebSocketAuthSubprotocol on the backend. */
const AUTH_SUBPROTOCOL = 'kubeforecast.jwt';
const MAX_RETRY_DELAY_MS = 15_000;

function buildStreamUrl(path: string) {
  // Always the real backend address, never the Vite dev proxy: the proxy only
  // forwards WebSocket upgrades when ws is enabled in vite.config (needs a dev
  // server restart), and a silently dropped upgrade looks like an endless
  // connect/disconnect loop. The backend accepts any origin because the stream is
  // authenticated by the token, not by cookies.
  const { baseURL } = getServiceBaseURL(import.meta.env, false);
  // The production base URL is "/". Joined naively it gives "//api/v1/...", which the
  // browser reads as a protocol-relative URL whose host is "api". Trim the slash first.
  const url = new URL(`${baseURL.replace(/\/+$/, '')}${path}`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export interface StreamOptions {
  /** Backend path of the stream, e.g. /api/v1/market/stream. */
  path: string;
  /** Called with every decoded frame. */
  onMessage: (message: unknown) => void;
  /** Called after every (re)connect so the page can re-sync anything missed while offline. */
  onOpen?: () => void;
}

/**
 * Keeps one authenticated WebSocket alive with backoff between reconnects, and
 * reports why a connection ended (`lastClose`). The stream ends with the component.
 */
export function useAuthStream(options: StreamOptions) {
  const status = ref<StreamStatus>('closed');
  /** Close code / reason of the last connection that ended, for diagnosing reconnect loops. */
  const lastClose = ref('');
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryCount = 0;
  let active = false;

  function scheduleReconnect() {
    if (!active) return;
    status.value = 'closed';
    const delay = Math.min(1000 * 2 ** retryCount, MAX_RETRY_DELAY_MS);
    retryCount += 1;
    retryTimer = setTimeout(connect, delay);
  }

  async function connect() {
    if (!active) return;
    status.value = 'connecting';
    let token = localStg.get('token') || '';
    if (token && accessTokenNeedsRefresh(token)) {
      if (!(await handleExpiredRequest(request.state))) {
        lastClose.value = 'token refresh failed';
        return scheduleReconnect();
      }
      token = localStg.get('token') || '';
    }
    if (!active) return;
    if (!token) {
      lastClose.value = 'not signed in';
      return scheduleReconnect();
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(buildStreamUrl(options.path), [AUTH_SUBPROTOCOL, token]);
    } catch (error) {
      lastClose.value = error instanceof Error ? error.message : 'invalid stream url';
      return scheduleReconnect();
    }
    socket = ws;
    ws.onopen = () => {
      retryCount = 0;
      lastClose.value = '';
      status.value = 'live';
      options.onOpen?.();
    };
    ws.onmessage = event => {
      try {
        options.onMessage(JSON.parse(String(event.data)));
      } catch {
        // Ignore malformed frames; the next push carries fresh state.
      }
    };
    ws.onclose = event => {
      if (socket === ws) socket = null;
      // 1006 with no reason usually means the handshake was refused (auth or route).
      lastClose.value = `code ${event.code}${event.reason ? `: ${event.reason}` : ''}`;
      scheduleReconnect();
    };
  }

  function start() {
    if (active) return;
    active = true;
    retryCount = 0;
    connect();
  }

  function stop() {
    active = false;
    clearTimeout(retryTimer);
    const ws = socket;
    socket = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    status.value = 'closed';
  }

  onBeforeUnmount(stop);

  return { status, lastClose, start, stop };
}
