import { onBeforeUnmount, onMounted } from 'vue';
import { useAuthStream } from './use-auth-stream';

/** Topics the backend can announce changes of (see statsTopics in handle_stats_stream.go). */
export type StatsTopic = 'tasks' | 'workflow';

interface StatsMessage {
  type: string;
  data: { topic?: string };
}

/**
 * Keeps a page's statistics live over the WebSocket. The backend announces that the data behind
 * a topic changed; the push carries no numbers, so the page re-reads its own (filtered) statistics
 * with `reload`. A burst of pushes reloads once, and the page also reloads after every reconnect to
 * catch up with what happened while it was offline.
 */
export function useStatsStream(topics: StatsTopic[], reload: () => unknown, debounceMs = 1000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let opened = false;

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void reload();
    }, debounceMs);
  }

  const stream = useAuthStream({
    path: `/api/v1/stats/stream?topics=${topics.join(',')}`,
    // The first connect happens while the page loads its own data, so only a reconnect needs a catch-up.
    onOpen: () => {
      if (opened) schedule();
      opened = true;
    },
    onMessage: raw => {
      const message = raw as StatsMessage;
      if (message.type === 'stats' && message.data?.topic) schedule();
    }
  });

  onMounted(() => stream.start());
  onBeforeUnmount(() => clearTimeout(timer));
  return stream;
}
