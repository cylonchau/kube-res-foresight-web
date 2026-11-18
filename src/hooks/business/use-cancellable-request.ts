import { onBeforeUnmount, ref } from 'vue';

/**
 * A request that takes long and that the person can stop: begin() gives the abort signal to pass to the request, elapsed counts the seconds it
 * has taken (a long wait with nothing on the screen reads as a hang), cancel() stops it, and end() is called when it is over. Leaving the page
 * stops it too, so the server is not left working for a page that is gone.
 */
export function useCancellableRequest() {
  const running = ref(false);
  const elapsed = ref(0);
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function begin() {
    controller?.abort();
    controller = new AbortController();
    running.value = true;
    elapsed.value = 0;
    stopTimer();
    const started = Date.now();
    timer = setInterval(() => {
      elapsed.value = Math.round((Date.now() - started) / 1000);
    }, 1000);
    return controller.signal;
  }

  function end() {
    running.value = false;
    stopTimer();
    controller = null;
  }

  function cancel() {
    controller?.abort();
  }

  onBeforeUnmount(() => {
    controller?.abort();
    stopTimer();
  });

  return { running, elapsed, begin, end, cancel };
}

/** whether a failed request was stopped by the person (the abort signal), not by a failure */
export function wasCancelled(error: unknown) {
  return (error as { code?: string } | null)?.code === 'ERR_CANCELED';
}
